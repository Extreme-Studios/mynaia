import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { makeTavusClient } from '../app/backend/tavus.mjs';
import { parseDuration, parseMode } from '../app/backend/modes.mjs';
import { createNayaServer } from '../app/backend/server.mjs';

const root = new URL('../', import.meta.url);
const file = (name) => readFile(new URL(name, root), 'utf8');

test('mode dan durasi memakai whitelist dengan default lima menit', () => {
  assert.equal(parseMode('naya'), 'naya');
  assert.equal(parseMode('dr_paws'), 'dr_paws');
  assert.throws(() => parseMode('unknown'));
  assert.deepEqual([3,5,10,20].map(parseDuration), [180,300,600,1200]);
  assert.equal(parseDuration(), 300);
  for (const bad of [0,4,21,1200,'5.0']) assert.throws(() => parseDuration(bad));
});

test('mode Dr. Paws memilih PAL/Face sendiri; semua durasi valid, tanpa memori Tavus', async () => {
  const bodies = [];
  const client = makeTavusClient({ apiKey: 'test-key', envPalId: 'p-paws', faceId: 'r-paws', mode: 'dr_paws',
    fetchImpl: async (url, options) => {
      if (url.endsWith('/v2/pals/p-paws')) return Response.json({ pal_id: 'p-paws', pal_name: 'Dr Paws MyNaiA', default_face_id: 'r-paws' });
      bodies.push(JSON.parse(options.body));
      return Response.json({ conversation_id: 'c12345', conversation_url: 'https://tavus.daily.co/c12345', status: 'active' });
    } });
  for (const durationMinutes of [3,5,10,20]) await client.createConversation({ durationMinutes, conversationalContext: 'Hanya sesi Dr. Paws' });
  assert.deepEqual(bodies.map((x) => x.properties.max_call_duration), [180,300,600,1200]);
  for (const body of bodies) {
    assert.equal(body.pal_id, 'p-paws');
    assert.equal(body.face_id, 'r-paws');
    assert.doesNotMatch(JSON.stringify(body), /participant_tags|memory_stores|test-key/);
    assert.doesNotMatch(body.conversational_context, /Fakta relevan|Nama:/);
  }
  await assert.rejects(client.createConversation({ durationMinutes: 4 }));
  assert.equal(bodies.length, 4);
});

test('End mengakui sesi yang sudah berakhir karena batas durasi', async () => {
  const calls = [];
  const client = makeTavusClient({ apiKey: 'test-key', fetchImpl: async (url, options) => {
    calls.push(`${options.method} ${url}`);
    if (options.method === 'POST') return Response.json({ error: 'already ended' }, { status: 400 });
    return Response.json({ conversation_id: 'c12345', status: 'ended' });
  } });
  await client.endConversation('c12345');
  assert.equal(calls.length, 2);
  assert.match(calls[1], /GET .*verbose=true/);
});

test('routes home dan mode tersedia pada server lokal tanpa membuat sesi', async () => {
  const server = createNayaServer({ client: { configured: false, configuredPalId: async () => null },
    memory: { status: async () => ({ enabled: false, provider: 'supabase', storeConfigured: false, pendingSessions: 0 }) },
    drMemory: { processPending: async () => ({ processed: 0 }) } });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    for (const route of ['/', '/naya', '/dr-paws']) {
      const response = await fetch(base + route);
      assert.equal(response.status, 200);
      const html = await response.text();
      assert.match(html, /href="\/naya"/);
      assert.match(html, /href="\/dr-paws"/);
    }
  } finally { server.closeAllConnections(); server.close(); await once(server, 'close'); }
});

test('PWA statis aman dan quality advanced ditandai unavailable', async () => {
  const manifest = JSON.parse(await file('app/frontend/manifest.webmanifest'));
  assert.equal(manifest.name, 'MyNaiA');
  assert.equal(manifest.display, 'standalone');
  assert.deepEqual(manifest.icons.map((x) => x.sizes), ['192x192', '512x512']);
  const html = await file('app/frontend/index.html');
  assert.match(html, /rel="manifest"/);
  assert.match(html, /apple-mobile-web-app-capable/);
  assert.match(html, /value="20"/);
  assert.match(html, /Durasi panjang memakai lebih banyak menit Tavus/);
  assert.match(html, /value="low" disabled/);
  assert.match(html, /value="high" disabled/);
  const sw = await file('app/frontend/sw.js');
  assert.match(sw, /url\.pathname\.startsWith\('\/api\/'\)/);
  assert.doesNotMatch(sw, /conversation_url|TAVUS_API_KEY|SUPABASE_SERVICE_ROLE_KEY/);
  const frontend = html + await file('app/frontend/app.js') + await file('app/frontend/controller.mjs');
  assert.doesNotMatch(frontend, /TAVUS_API_KEY|GEMINI_API_KEY|SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(await file('app/frontend/app.js'), /requestFullscreen/);
  assert.match(await file('app/frontend/app.js'), /wakeLock/);
});
