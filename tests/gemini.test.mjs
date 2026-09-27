import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { geminiConfig, testGeminiCompletion, GEMINI_BASE_URL } from '../app/backend/gemini.mjs';
import { makeTavusClient, FACE_ID } from '../app/backend/tavus.mjs';

test('Gemini status hanya berisi availability dan model', () => {
  assert.deepEqual(geminiConfig({ GEMINI_API_KEY: 'private-value' }), { configured: true, model: 'gemini-3.8-flash' });
  assert.deepEqual(geminiConfig({ GEMINI_API_KEY: '', GEMINI_MODEL: 'gemini-other' }), { configured: false, model: 'gemini-other' });
});

test('completion Gemini memakai endpoint resmi tanpa mengekspos key saat error', async () => {
  let seen;
  const result = await testGeminiCompletion({ apiKey: 'private-value', fetchImpl: async (url, options) => {
    seen = { url, options };
    return Response.json({ choices: [{ message: { content: 'SIAP' } }] });
  } });
  assert.equal(result.answer, 'SIAP');
  assert.equal(seen.url, `${GEMINI_BASE_URL}chat/completions`);
  assert.equal(JSON.parse(seen.options.body).messages[0].content, 'Balas hanya dengan kata: SIAP');
  assert.equal(JSON.parse(seen.options.body).reasoning_effort, 'low');
  await assert.rejects(testGeminiCompletion({ apiKey: 'private-value', fetchImpl: async () => Response.json({ error: 'private-value' }, { status: 401 }) }),
    (error) => error.message === 'GEMINI_HTTP_401' && !error.message.includes('private-value'));
});

test('PAL Gemini dibuat sekali dengan Face lama, state dan log tanpa key', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'naya-gemini-'));
  const stateFile = join(dir, 'pal.json');
  const calls = [];
  const oldLog = console.log;
  const logs = [];
  console.log = (value) => logs.push(String(value));
  try {
    const client = makeTavusClient({ apiKey: 'tavus-private', envPalId: '', geminiPalStateFile: stateFile,
      gemini: { apiKey: 'gemini-private', model: 'gemini-3.8-flash' },
      fetchImpl: async (url, options) => {
        calls.push({ url, options });
        if (url.endsWith('/v2/pals')) return Response.json({ pal_id: 'p-gemini' });
        return Response.json({ pal_id: 'p-gemini', pal_name: 'Naya Gemini', pipeline_mode: 'full', default_face_id: FACE_ID,
          layers: { llm: { model: 'gemini-3.8-flash', base_url: GEMINI_BASE_URL } } });
      },
    });
    assert.equal(await client.getOrCreateNayaPal(), 'p-gemini');
    assert.equal(await client.getOrCreateNayaPal(), 'p-gemini');
    assert.equal(calls.length, 1);
    const body = JSON.parse(calls[0].options.body);
    assert.equal(body.pal_name, 'Naya Gemini');
    assert.equal(body.layers.llm.model, 'gemini-3.8-flash');
    assert.equal(body.layers.llm.base_url, GEMINI_BASE_URL);
    assert.equal(body.layers.llm.extra_body.reasoning_effort, 'low');
    assert.equal(body.default_face_id, FACE_ID);
    const state = await readFile(stateFile, 'utf8');
    assert.doesNotMatch(state + logs.join(' '), /gemini-private|tavus-private/);
  } finally { console.log = oldLog; await rm(dir, { recursive: true, force: true }); }
});

test('PAL existing Tavus-hosted diterima tanpa membuat PAL atau conversation baru', async () => {
  const calls = [];
  const client = makeTavusClient({
    apiKey: 'tavus-private', envPalId: 'p-existing',
    gemini: { apiKey: 'gemini-private', model: 'gemini-3.8-flash' },
    fetchImpl: async (url, options) => {
      calls.push({ url, method: options.method });
      return Response.json({ pal_id: 'p-existing', pal_name: 'Naya Gemini', pipeline_mode: 'full',
        default_face_id: FACE_ID, layers: { conversational_flow: { turn_detection_model: 'sparrow-2' } } });
    },
  });
  assert.equal(await client.getOrCreateNayaPal(), 'p-existing');
  assert.deepEqual(calls, [{ url: 'https://tavusapi.com/v2/pals/p-existing', method: 'GET' }]);
});
