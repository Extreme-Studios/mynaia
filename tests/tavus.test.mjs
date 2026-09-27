import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FACE_ID, loadRuntimePrompt, makeTavusClient, TavusError } from '../app/backend/tavus.mjs';

test('system prompt runtime bersih dari Markdown pembungkus', async () => {
  const prompt = await loadRuntimePrompt();
  assert.match(prompt, /^Kamu adalah Naya/);
  assert.doesNotMatch(prompt, /## Catatan integrasi|# System prompt Naya/);
  assert.match(prompt, /bukan psikolog/);
});

test('PAL dibuat sekali, disimpan, lalu dipakai ulang untuk conversation', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'naya-test-'));
  const stateFile = join(dir, 'pal.json');
  const calls = [];
  const mockFetch = async (url, options) => {
    calls.push({ url, options });
    if (url.endsWith('/v2/pals')) return Response.json({ pal_id: 'p12345' });
    if (url.endsWith('/v2/conversations')) return Response.json({
      conversation_id: 'c12345', conversation_url: 'https://tavus.daily.co/c12345', status: 'active',
    });
    throw Error('Unexpected request');
  };
  try {
    const client = makeTavusClient({ apiKey: 'test-secret-123', envPalId: '', stateFile, fetchImpl: mockFetch });
    const [one, two] = await Promise.all([client.getOrCreateNayaPal(), client.getOrCreateNayaPal()]);
    assert.equal(one, 'p12345');
    assert.equal(two, 'p12345');
    assert.equal(calls.filter((call) => call.url.endsWith('/v2/pals')).length, 1);
    const palPayload = JSON.parse(calls[0].options.body);
    assert.equal(palPayload.pal_name, 'Naya MVP Test');
    assert.equal(palPayload.pipeline_mode, 'full');
    assert.equal(palPayload.default_face_id, FACE_ID);
    assert.deepEqual(palPayload.languages, ['id']);
    assert.equal(palPayload.layers.conversational_flow.turn_detection_model, 'sparrow-2');
    assert.equal((await client.createConversation()).conversationId, 'c12345');
    assert.equal(calls.filter((call) => call.url.endsWith('/v2/pals')).length, 1);
    const conversationPayload = JSON.parse(calls.at(-1).options.body);
    assert.equal(conversationPayload.properties.max_call_duration, 180);
    assert.equal(conversationPayload.pal_id, 'p12345');
    assert.deepEqual(conversationPayload.participant_tags, ['naya-primary-user-v1']);
    assert.equal(conversationPayload.memory_stores, undefined);
    assert.equal(conversationPayload.dynamic_greeting, true);
    assert.match(conversationPayload.conversational_context, /Jangan selalu memakai kalimat sama/);
    const saved = await readFile(stateFile, 'utf8');
    assert.match(saved, /p12345/);
    assert.doesNotMatch(saved, /test-secret-123/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('tag memori stabil lintas sesi dan override server bekerja tanpa data perangkat', async () => {
  const bodies = [];
  const client = makeTavusClient({ apiKey: 'dummy', envPalId: 'p-existing', memoryStore: 'naya_user_test_uuid',
    fetchImpl: async (url, options) => {
      if (url.endsWith('/v2/pals/p-existing')) return Response.json({ pal_id: 'p-existing', pal_name: 'Naya', default_face_id: FACE_ID,
        layers: { conversational_flow: { turn_detection_model: 'sparrow-2', turn_taking_patience: 'low', pal_interruptibility: 'medium' } } });
      bodies.push(JSON.parse(options.body));
      return Response.json({ conversation_id: 'c12345', conversation_url: 'https://tavus.daily.co/c12345', status: 'active' });
    },
  });
  await client.createConversation();
  await client.createConversation();
  assert.equal(bodies.length, 2);
  for (const body of bodies) {
    assert.deepEqual(body.participant_tags, ['naya_user_test_uuid']);
    assert.equal(body.memory_stores, undefined);
    assert.equal(body.device_id, undefined);
    assert.equal(body.browser_fingerprint, undefined);
    assert.equal(body.face_id, FACE_ID);
    assert.deepEqual(body.properties.languages, ['id']);
  }
});

test('PAL dari environment diverifikasi dan tidak dibuat ulang', async () => {
  const calls = [];
  const client = makeTavusClient({
    apiKey: 'dummy', envPalId: 'p-existing',
    fetchImpl: async (url) => {
      calls.push(url);
      return Response.json({ pal_id: 'p-existing', pal_name: 'Naya MVP Test', pipeline_mode: 'full', default_face_id: FACE_ID });
    },
  });
  assert.equal(await client.getOrCreateNayaPal(), 'p-existing');
  assert.deepEqual(calls, ['https://tavusapi.com/v2/pals/p-existing']);
});

test('error Tavus dan respons malformed ditangani tanpa membocorkan body', async () => {
  const failed = makeTavusClient({ apiKey: 'secret-key', envPalId: 'p-existing', fetchImpl: async () => Response.json({ message: 'secret-key' }, { status: 401 }) });
  await assert.rejects(failed.getOrCreateNayaPal(), (error) => error instanceof TavusError && error.code === 'API_ERROR' && !error.message.includes('secret-key'));
  const malformed = makeTavusClient({ apiKey: 'dummy', envPalId: 'p-existing', fetchImpl: async () => Response.json({ pal_name: 'Naya' }) });
  await assert.rejects(malformed.getOrCreateNayaPal(), (error) => error.code === 'INVALID_PAL');
  const noKey = makeTavusClient({ apiKey: '', envPalId: 'p-existing', fetchImpl: async () => { throw Error('should not call'); } });
  await assert.rejects(noKey.getOrCreateNayaPal(), (error) => error.code === 'KEY_REQUIRED');
});

test('respons conversation yang tidak lengkap ditolak', async () => {
  const client = makeTavusClient({
    apiKey: 'dummy', envPalId: 'p-existing',
    fetchImpl: async (url) => url.endsWith('/v2/pals/p-existing')
      ? Response.json({ pal_id: 'p-existing', pal_name: 'Naya' })
      : Response.json({ conversation_id: 'c12345', conversation_url: 'invalid', status: 'active' }),
  });
  await assert.rejects(client.createConversation(), (error) => error.code === 'MALFORMED_RESPONSE');
});

test('penolakan Tavus saat create conversation tidak membocorkan respons atau credential', async () => {
  const client = makeTavusClient({ apiKey: 'private-test-key', envPalId: 'p-existing',
    fetchImpl: async (url) => url.endsWith('/v2/pals/p-existing')
      ? Response.json({ pal_id: 'p-existing', pal_name: 'Naya' })
      : Response.json({ message: 'private-test-key plan unavailable' }, { status: 403 }),
  });
  await assert.rejects(client.createConversation(), (error) => error.code === 'API_ERROR' &&
    !error.message.includes('private-test-key') && !error.message.includes('plan unavailable'));
});
