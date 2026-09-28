import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createNayaServer } from '../app/backend/server.mjs';

async function withServer(client, run, memory) {
  const server = createNayaServer({ client, gemini: { configured: true, model: 'gemini-3.8-flash' },
    env: client.configured ? { TAVUS_API_KEY: 'mock-key', TAVUS_NAYA_PAL_ID: 'p-existing' } : {},
    activeProfileStore: { getActive: async () => 1 }, ...(memory ? { memory } : {}) });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  try { await run(base); }
  finally { server.closeAllConnections(); server.close(); await once(server, 'close'); }
}

test('health, status aman, frontend dan missing key', async () => {
  const client = { configured: false, configuredPalId: async () => null };
  await withServer(client, async (base) => {
    const health = await (await fetch(`${base}/api/health`)).json();
    assert.deepEqual(health, { status: 'ok', milestone: 5 });
    const memory = await (await fetch(`${base}/api/memory/status`)).json();
    assert.deepEqual(memory, { enabled: false, provider: 'supabase', storeConfigured: false, pendingSessions: 0,
      drPaws: { enabled: false, provider: 'supabase', storeConfigured: false, pendingSessions: 0 } });
    assert.doesNotMatch(JSON.stringify(memory), /naya-primary-user-v1|api.?key|secret/i);
    const gemini = await (await fetch(`${base}/api/gemini/status`)).json();
    assert.deepEqual(gemini, { configured: true, model: 'gemini-3.8-flash' });
    assert.doesNotMatch(JSON.stringify(gemini), /api.?key|secret/i);
    const status = await (await fetch(`${base}/api/tavus/status`)).json();
    assert.deepEqual(status, { configured: false, palConfigured: false, conversationActive: false });
    const missing = await fetch(`${base}/api/conversations`, { method: 'POST' });
    assert.equal(missing.status, 503);
    assert.equal((await missing.json()).code, 'PROFILE_NOT_CONFIGURED');
    const page = await (await fetch(base)).text();
    assert.match(page, /Mulai Ngobrol/);
    assert.match(page, /id="error"/);
    const script = await fetch(`${base}/app.js`);
    assert.equal(script.status, 200);
  });
});

test('response mapping, double start guard, end dan no secret leakage', async () => {
  let creates = 0;
  let resolveCreate;
  const gate = new Promise((resolve) => { resolveCreate = resolve; });
  const client = {
    configured: true,
    configuredPalId: async () => 'p-existing',
    createConversation: async () => { creates += 1; await gate; return { conversationId: 'c12345', conversationUrl: 'https://tavus.daily.co/c12345', status: 'active' }; },
    endConversation: async () => {},
  };
  await withServer(client, async (base) => {
    const first = fetch(`${base}/api/conversations`, { method: 'POST' });
    await new Promise((resolve) => setTimeout(resolve, 30));
    const second = await fetch(`${base}/api/conversations`, { method: 'POST' });
    assert.equal(second.status, 409);
    resolveCreate();
    const created = await first;
    assert.equal(created.status, 201);
    const body = await created.json();
    assert.deepEqual(body, { conversationId: 'c12345', conversationUrl: 'https://tavus.daily.co/c12345', status: 'active' });
    assert.equal(creates, 1);
    assert.doesNotMatch(JSON.stringify(body), /api.?key|secret/i);
    const active = await (await fetch(`${base}/api/tavus/status`)).json();
    assert.equal(active.conversationActive, true);
    const ended = await fetch(`${base}/api/conversations/c12345/end`, { method: 'POST' });
    assert.equal(ended.status, 200);
  }, { prepareContext: async () => 'Konteks Supabase', recordStarted: async () => {}, recordEnded: async () => {} });
});

test('password awal membuka dashboard dan API profil lokal tanpa login kedua', async () => {
  const server = createNayaServer({ env: { NAYA_ACCESS_CODE: 'test-access' },
    store: { configured: true }, activeProfileStore: { getActive: async () => 1 } });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const page = await (await fetch(base)).text();
    assert.match(page, /id="app" class="app-shell" hidden/);
    assert.match(page, /id="access-gate"/);
    assert.match(page, /app\.js\?v=21/);
    assert.match(page, /styles\.css\?v=21/);
    assert.doesNotMatch(page, /id="admin-login"|id="admin-secret"/);
    assert.equal((await fetch(`${base}/api/admin/tavus-profiles`)).status, 401);
    assert.equal((await fetch(`${base}/api/admin/tavus-profile`, { method: 'POST' })).status, 401);
    const login = await fetch(`${base}/api/access/login`, { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code: 'test-access' }) });
    assert.equal(login.status, 200);
    const cookie = login.headers.get('set-cookie').split(';')[0];
    const profiles = await fetch(`${base}/api/admin/tavus-profiles`, { headers: { cookie } });
    assert.equal(profiles.status, 200);
    assert.equal((await profiles.json()).profiles.length, 8);
  } finally {
    server.closeAllConnections(); server.close(); await once(server, 'close');
  }
});
