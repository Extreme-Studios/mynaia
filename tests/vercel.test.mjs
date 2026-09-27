import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { createVercelHandler } from '../api/handler.js';

async function invoke(handler, method, url, { body, cookie } = {}) {
  const request = Readable.from(body ? [JSON.stringify(body)] : []);
  request.method = method;
  request.url = url;
  request.headers = cookie ? { cookie } : {};
  const response = {
    writeHead(status, headers) { this.status = status; this.headers = headers; },
    end(value) { this.body = JSON.parse(value); },
  };
  await handler(request, response);
  return response;
}

const activeProfileStore = { getActive: async () => 1 };

test('Vercel gate menolak sesi tanpa kode, lalu mengizinkan setelah login', async () => {
  let creates = 0;
  let ends = 0;
  const handler = createVercelHandler({
    env: { TAVUS_API_KEY: 'tavus-private', TAVUS_PAL_ID: 'p-gemini', GEMINI_API_KEY: 'gemini-private',
      NAYA_ACCESS_CODE: 'access-private', VERCEL_ENV: 'production' },
    client: { configured: true,
      createConversation: async () => { creates++; return { conversationId: 'c12345', conversationUrl: 'https://tavus.daily.co/c12345', status: 'active' }; },
      endConversation: async () => { ends++; },
    },
    memory: { prepareContext: async () => '', recordStarted: async () => {}, recordEnded: async () => {} },
    activeProfileStore,
  });
  const status = await invoke(handler, 'GET', '/api/handler?route=access-status');
  assert.deepEqual(status.body, { required: true, authorized: false });
  const denied = await invoke(handler, 'POST', '/api/handler?route=conversations');
  assert.equal(denied.status, 401);
  assert.equal(creates, 0);
  const wrong = await invoke(handler, 'POST', '/api/handler?route=access-login', { body: { code: 'wrong' } });
  assert.equal(wrong.status, 401);
  const login = await invoke(handler, 'POST', '/api/handler?route=access-login', { body: { code: 'access-private' } });
  assert.equal(login.status, 200);
  const cookie = login.headers['set-cookie'].split(';')[0];
  assert.match(login.headers['set-cookie'], /HttpOnly; SameSite=Strict/);
  assert.match(login.headers['set-cookie'], /Secure/);
  const allowed = await invoke(handler, 'POST', '/api/handler?route=conversations', { cookie });
  assert.equal(allowed.status, 201);
  assert.equal(creates, 1);
  assert.doesNotMatch(JSON.stringify(allowed.body), /private/);
  const ended = await invoke(handler, 'POST', '/api/handler?route=end&id=c12345', { cookie });
  assert.equal(ended.status, 200);
  assert.equal(ends, 1);
});

test('Vercel tidak membuat PAL atau sesi bila konfigurasi kurang', async () => {
  let creates = 0;
  const handler = createVercelHandler({
    env: { TAVUS_API_KEY: 'key', GEMINI_API_KEY: 'key' },
    client: { configured: true, createConversation: async () => { creates++; } },
  });
  const response = await invoke(handler, 'POST', '/api/handler?route=conversations');
  assert.equal(response.status, 503);
  assert.equal(creates, 0);
});

test('Vercel hosted LLM tidak membutuhkan Gemini key untuk conversation mock', async () => {
  let creates = 0;
  const handler = createVercelHandler({
    env: { TAVUS_API_KEY: 'key', TAVUS_PAL_ID: 'p-existing' },
    client: { configured: true, createConversation: async () => {
      creates++;
      return { conversationId: 'c12345', conversationUrl: 'https://tavus.daily.co/c12345', status: 'active' };
    } },
    memory: { prepareContext: async () => '', recordStarted: async () => {} },
    activeProfileStore,
  });
  const response = await invoke(handler, 'POST', '/api/handler?route=conversations');
  assert.equal(response.status, 201);
  assert.equal(creates, 1);
});

test('Vercel menolak create sebelum Tavus bila Supabase tidak terkonfigurasi', async () => {
  let creates = 0;
  const handler = createVercelHandler({
    env: { TAVUS_API_KEY: 'private-test-key', TAVUS_PAL_ID: 'p-existing' },
    client: { configured: true, createConversation: async () => { creates++; } },
  });
  const response = await invoke(handler, 'POST', '/api/handler?route=conversations');
  assert.equal(response.status, 503);
  assert.equal(response.body.code, 'SUPABASE_NOT_CONFIGURED');
  assert.equal(creates, 0);
  assert.doesNotMatch(JSON.stringify(response.body), /private-test-key/);
});

test('Vercel memory status hanya melaporkan Supabase tanpa credential', async () => {
  const handler = createVercelHandler({ env: { TAVUS_API_KEY: 'secret', TAVUS_PAL_ID: 'p-existing' },
    client: { configured: true } });
  const response = await invoke(handler, 'GET', '/api/handler?route=memory-status');
  assert.deepEqual(response.body, { enabled: false, provider: 'supabase', storeConfigured: false, pendingSessions: 0,
    drPaws: { enabled: false, provider: 'supabase', storeConfigured: false, pendingSessions: 0 } });
  assert.doesNotMatch(JSON.stringify(response.body), /private|secret|naya_user/);
});

test('API subject meminta login dan Dr. Paws menolak Start tanpa UUID sebelum Tavus', async () => {
  let creates = 0;
  const rows = [];
  const store = { configured: true,
    select: async (table, filters = {}) => table === 'subjects' ? rows.filter((row) => !filters.id || filters.id === `eq.${row.id}`) : [],
    upsert: async (table, row) => { if (table === 'subjects') rows.push(row); },
  };
  const handler = createVercelHandler({ env: { NAYA_ACCESS_CODE: 'test-access',
    TAVUS_API_KEY: 'test-key', TAVUS_DR_PAWS_PAL_ID: 'p-paws', TAVUS_DR_PAWS_FACE_ID: 'r-paws' },
    store, activeProfileStore,
    clientFactory: () => ({ createConversation: async () => { creates++; } }) });
  assert.equal((await invoke(handler, 'GET', '/api/handler?route=subjects')).status, 401);
  const login = await invoke(handler, 'POST', '/api/handler?route=access-login', { body: { code: 'test-access' } });
  const cookie = login.headers['set-cookie'].split(';')[0];
  const created = await invoke(handler, 'POST', '/api/handler?route=subjects', { cookie, body: { displayName: 'Anak tes' } });
  assert.equal(created.status, 201);
  assert.match(created.body.id, /^[0-9a-f-]{36}$/);
  assert.equal((await invoke(handler, 'GET', '/api/handler?route=subjects', { cookie })).body.subjects.length, 1);
  const missing = await invoke(handler, 'POST', '/api/handler?route=conversations', { cookie, body: { mode: 'dr_paws' } });
  assert.equal(missing.status, 400);
  assert.equal(creates, 0);
  assert.doesNotMatch(JSON.stringify(created.body), /test-key|test-access/);
});

test('Vercel menyuntik context Supabase, merekam sesi, dan melindungi sync', async () => {
  const calls = [];
  const handler = createVercelHandler({ env: { TAVUS_API_KEY: 'tavus-private', TAVUS_PAL_ID: 'p-existing',
    SUPABASE_URL: 'https://example.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'supabase-private',
    NAYA_ACCESS_CODE: 'access-private' },
    store: { configured: true, select: async (table, filters) => filters.mode === 'eq.dr_paws' ? [] : [{ mode: 'naya' }] },
    client: { configured: true,
      createConversation: async (options) => { calls.push(['create', options]); return { conversationId: 'c12345', conversationUrl: 'https://tavus.daily.co/c12345', status: 'active' }; },
      endConversation: async (id) => { calls.push(['end', id]); } },
    memory: { status: async () => ({ enabled: true, provider: 'supabase', storeConfigured: true, pendingSessions: 0 }),
      prepareContext: async () => 'Adi suka kopi susu', recordStarted: async (id) => { calls.push(['started', id]); },
      recordEnded: async (id) => { calls.push(['ended', id]); }, processPending: async () => ({ processed: 1 }) },
    activeProfileStore,
  });
  const denied = await invoke(handler, 'POST', '/api/handler?route=memory-sync');
  assert.equal(denied.status, 401);
  const login = await invoke(handler, 'POST', '/api/handler?route=access-login', { body: { code: 'access-private' } });
  const cookie = login.headers['set-cookie'].split(';')[0];
  const created = await invoke(handler, 'POST', '/api/handler?route=conversations', { cookie });
  assert.equal(created.status, 201);
  assert.deepEqual(calls[0][1], { conversationalContext: 'Adi suka kopi susu', durationMinutes: 5 });
  assert.deepEqual(calls[1], ['started', 'c12345']);
  await invoke(handler, 'POST', '/api/handler?route=end&id=c12345', { cookie });
  assert.deepEqual(calls.at(-1), ['ended', 'c12345']);
  const sync = await invoke(handler, 'POST', '/api/handler?route=memory-sync', { cookie });
  assert.deepEqual(sync.body, { processed: 1 });
  assert.doesNotMatch(JSON.stringify(created.body), /supabase-private|Adi suka kopi susu/);
});

test('sesi Tavus ditutup jika arsip Supabase gagal dibuat', async () => {
  let ended = false;
  const handler = createVercelHandler({ env: { TAVUS_API_KEY: 'key', TAVUS_PAL_ID: 'p-existing',
    SUPABASE_URL: 'https://example.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'private' },
    client: { configured: true, createConversation: async () => ({ conversationId: 'c12345', conversationUrl: 'https://tavus.daily.co/c12345', status: 'active' }),
      endConversation: async () => { ended = true; } },
    memory: { prepareContext: async () => '', recordStarted: async () => { throw new Error('mock storage failure'); } },
    activeProfileStore,
  });
  const response = await invoke(handler, 'POST', '/api/handler?route=conversations');
  assert.equal(response.status, 500);
  assert.equal(ended, true);
  assert.doesNotMatch(JSON.stringify(response.body), /private|mock storage failure/);
});
