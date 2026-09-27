import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createNayaServer } from '../app/backend/server.mjs';

async function withServer(client, run) {
  const server = createNayaServer({ client, gemini: { configured: true, model: 'gemini-3.8-flash' } });
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
    assert.deepEqual(health, { status: 'ok', milestone: 4 });
    const memory = await (await fetch(`${base}/api/memory/status`)).json();
    assert.deepEqual(memory, { enabled: false, provider: 'supabase', storeConfigured: false, pendingSessions: 0 });
    assert.doesNotMatch(JSON.stringify(memory), /naya-primary-user-v1|api.?key|secret/i);
    const gemini = await (await fetch(`${base}/api/gemini/status`)).json();
    assert.deepEqual(gemini, { configured: true, model: 'gemini-3.8-flash' });
    assert.doesNotMatch(JSON.stringify(gemini), /api.?key|secret/i);
    const status = await (await fetch(`${base}/api/tavus/status`)).json();
    assert.deepEqual(status, { configured: false, palConfigured: false, conversationActive: false });
    const missing = await fetch(`${base}/api/conversations`, { method: 'POST' });
    assert.equal(missing.status, 503);
    assert.equal((await missing.json()).code, 'KEY_REQUIRED');
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
  });
});
