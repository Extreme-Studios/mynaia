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
  });
  const response = await invoke(handler, 'POST', '/api/handler?route=conversations');
  assert.equal(response.status, 201);
  assert.equal(creates, 1);
});
