import test from 'node:test';
import assert from 'node:assert/strict';
import { makeSupabaseStore, PRIMARY_USER_ID } from '../app/backend/supabase.mjs';
import { parseTranscript, redactSensitive } from '../app/backend/transcript.mjs';
import { validateExtraction, extractWithGemini } from '../app/backend/memory-extract.mjs';
import { buildMemoryContext, makeMemoryService } from '../app/backend/memory-service.mjs';
import { makeSubjectService } from '../app/backend/subjects.mjs';
import { FACE_ID, makeTavusClient } from '../app/backend/tavus.mjs';

function fakeStore() {
  const tables = Object.fromEntries(['users','conversation_sessions','conversation_messages','memories','user_profile','open_loops','session_summaries','subjects'].map((x) => [x, []]));
  let next = 1;
  const matching = (row, filters) => Object.entries(filters).every(([key, filter]) => {
    if (key === 'limit' || key === 'order') return true;
    if (filter === 'not.is.null') return row[key] != null;
    if (filter.startsWith('eq.')) return String(row[key]) === filter.slice(3);
    if (filter.startsWith('neq.')) return String(row[key]) !== filter.slice(4);
    return false;
  });
  return { configured: true, tables,
    async select(table, filters = {}) {
      let rows = tables[table].filter((x) => matching(x, filters));
      if (filters.order) { const [key, direction] = filters.order.split(',')[0].split('.'); rows = rows.toSorted((a, b) => direction === 'desc' ? String(b[key]).localeCompare(String(a[key])) : String(a[key]).localeCompare(String(b[key]))); }
      if (filters.limit) rows = rows.slice(0, +filters.limit);
      return structuredClone(rows);
    },
    async upsert(table, value, conflict) {
      const values = Array.isArray(value) ? value : [value];
      for (const item of values) {
        const fields = conflict.split(',');
        const old = tables[table].find((row) => fields.every((field) => row[field] === item[field]));
        if (old) Object.assign(old, structuredClone(item));
        else tables[table].push({ id: `row-${next}`, created_at: new Date(1700000000000 + next++ * 1000).toISOString(), ...structuredClone(item) });
      }
      return values;
    },
    async update(table, filters, body) {
      for (const row of tables[table]) if (matching(row, filters)) Object.assign(row, structuredClone(body));
      return [];
    },
    async remove(table, filters) {
      tables[table] = tables[table].filter((row) => !matching(row, filters));
      return [];
    },
  };
}

test('Supabase config server-only dan error body tidak bocor', async () => {
  assert.equal(makeSupabaseStore({ url: '', key: '' }).configured, false);
  const requests = [];
  const db = makeSupabaseStore({ url: 'https://example.supabase.co', key: 'private-test-key',
    fetchImpl: async (url, options) => { requests.push({ url: String(url), options }); return Response.json({ message: 'private-test-key' }, { status: 401 }); } });
  await assert.rejects(db.select('users'), (error) => error.code === 'SUPABASE_HTTP_401' && !error.message.includes('private-test-key'));
  assert.equal(requests[0].options.headers.apikey, 'private-test-key');
  assert.match(requests[0].url, /\/rest\/v1\/naya_users/);
});

test('tanpa Supabase, persiapan context gagal sebelum Tavus membuat sesi', async () => {
  let tavusCalls = 0;
  const store = makeSupabaseStore({ url: '', key: '' });
  const memory = makeMemoryService({ store, tavus: { getConversation: async () => { tavusCalls++; } } });
  await assert.rejects(memory.prepareContext(), (error) => error.code === 'SUPABASE_NOT_CONFIGURED');
  assert.equal(tavusCalls, 0);
  assert.deepEqual(await memory.status(), { enabled: false, provider: 'supabase', storeConfigured: false, pendingSessions: 0 });
});

test('transcript final ditarik dari event resmi, timestamp tetap, rahasia disamarkan', () => {
  assert.equal(parseTranscript({ events: [] }), null);
  const messages = parseTranscript({ events: [{ event_type: 'application.transcription_ready', properties: { transcript: [
    { role: 'user', content: 'API key: 0123456789abcdef0123456789abcdef', timestamp: 1750000000.5, seconds_from_start: 2.1, duration: 1.2 },
    { role: 'assistant', content: 'Halo', timestamp: 1750000002, seconds_from_start: 4 },
  ] } }] });
  assert.equal(messages.length, 2);
  assert.equal(messages[0].position, 0);
  assert.match(messages[0].content, /REDACTED_SECRET/);
  assert.equal(messages[0].seconds_from_start, 2.1);
  assert.equal(messages[0].duration, 1.2);
  assert.equal(messages[0].spoken_at, new Date(1750000000.5 * 1000).toISOString());
  assert.equal(redactSensitive('oke'), 'oke');
});

test('Gemini mengembalikan JSON terstruktur, filler dan diagnosis tidak menjadi memori', async () => {
  const candidate = { summary: 'Ngobrol soal kopi', tone: 'santai', topics: ['kopi'], follow_ups: [],
    memories: [{ category: 'PREFERENCE', content: 'Adi suka kopi susu', normalized_key: 'preference:coffee', importance: .7, confidence: .9 },
      { category: 'EPISODIC', content: 'Iya', normalized_key: 'filler:iya', importance: .2, confidence: .9 },
      { category: 'PROFILE', content: 'user mengalami diagnosis depresi', normalized_key: 'profile:diagnosis', importance: .9, confidence: .9 }],
    open_loops: [], resolved_open_loop_keys: [], profile: { display_name: 'Adi' } };
  const calls = [];
  const result = await extractWithGemini([{ role: 'user', content: 'Aku suka kopi susu' }], { apiKey: 'private-test-key', model: 'gemini-2.5-flash',
    fetchImpl: async (url, options) => { calls.push({ url, options }); return Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify(candidate) }] } }] }); } });
  assert.equal(result.memories.length, 1);
  assert.equal(result.profile.display_name, 'Adi');
  const body = JSON.parse(calls[0].options.body);
  assert.equal(body.generationConfig.responseMimeType, 'application/json');
  assert.equal(body.generationConfig.maxOutputTokens, 1400);
  assert.doesNotMatch(JSON.stringify(body), /private-test-key/);
  assert.throws(() => validateExtraction({ summary: 'x' }));
});

test('arsip idempoten, dedup memori, kontradiksi, profile, open loop, dan context lintas PAL', async () => {
  const store = fakeStore();
  const responses = new Map([
    ['c-one', { events: [{ event_type: 'application.transcription_ready', properties: { transcript: [
      { role: 'user', content: 'Aku suka kopi susu. Besok meeting.', timestamp: 1750000000 },
      { role: 'assistant', content: 'Semoga lancar.', timestamp: 1750000002 },
    ] } }] }],
    ['c-two', { events: [{ event_type: 'application.transcription_ready', properties: { transcript: [
      { role: 'user', content: 'Sekarang aku tidak suka kopi. Meeting tadi lancar.', timestamp: 1750000100 },
    ] } }] }],
  ]);
  const extract = async (messages) => messages[0].content.includes('Sekarang')
    ? validateExtraction({ summary: 'Meeting lancar dan preferensi kopi berubah.', tone: 'lega', topics: ['meeting'], follow_ups: [],
      memories: [{ category: 'PREFERENCE', content: 'Adi tidak suka kopi lagi', normalized_key: 'preference:coffee', importance: .9, confidence: .95 }],
      open_loops: [], resolved_open_loop_keys: ['meeting'], profile: {} })
    : validateExtraction({ summary: 'Adi suka kopi susu dan besok meeting.', tone: 'santai', topics: ['kopi','meeting'], follow_ups: ['Tanya hasil meeting'],
      memories: [{ category: 'PREFERENCE', content: 'Adi suka kopi susu', normalized_key: 'preference:coffee', importance: .7, confidence: .8 }],
      open_loops: [{ content: 'Tanyakan hasil meeting', normalized_key: 'meeting' }], resolved_open_loop_keys: [], profile: { display_name: 'Adi' } });
  const oldTavus = { apiKey: 'old-test-key', getConversation: async (id) => responses.get(id) };
  const newTavus = { apiKey: 'new-test-key', getConversation: async (id) => responses.get(id) };
  const first = makeMemoryService({ store, tavus: oldTavus, extract, palId: 'p-old', faceId: FACE_ID });
  await first.prepareContext();
  await first.recordStarted('c-one');
  assert.equal((await first.recordEnded('c-one')).status, 'ready');
  assert.equal((await first.processConversation('c-one')).status, 'ready');
  assert.equal(store.tables.conversation_messages.length, 2);
  assert.equal(store.tables.memories.length, 1);
  assert.equal(store.tables.open_loops[0].status, 'open');
  const second = makeMemoryService({ store, tavus: newTavus, extract, palId: 'p-new', faceId: 'r-new' });
  const before = await second.prepareContext();
  assert.match(before, /kopi susu/);
  assert.match(before, /meeting/);
  assert.doesNotMatch(before, /p-old|p-new|c-one/);
  await second.recordStarted('c-two');
  await second.recordEnded('c-two');
  assert.equal(store.tables.memories.length, 1);
  assert.equal(store.tables.memories[0].content, 'Adi tidak suka kopi lagi');
  assert.equal(store.tables.open_loops[0].status, 'resolved');
  assert.equal(store.tables.user_profile[0].display_name, 'Adi');
  assert.equal(store.tables.conversation_sessions[0].user_id, PRIMARY_USER_ID);
  assert.equal(store.tables.conversation_sessions[1].user_id, PRIMARY_USER_ID);
  assert.doesNotMatch(JSON.stringify(store.tables), /old-test-key|new-test-key/);
  assert.equal(store.tables.session_summaries.length, 2);
  assert.equal((await second.status()).pendingSessions, 0);
});

test('context ringkas dibatasi dan tidak berisi secret', () => {
  const context = buildMemoryContext({ memories: Array.from({ length: 100 }, () => ({ content: 'Preferensi yang panjang '.repeat(100) })) });
  assert.ok(context.length <= 5000);
  assert.doesNotMatch(context, /0123456789abcdef0123456789abcdef/);
});

test('context Supabase masuk ke conversation stateless dan PAL latency tidak diubah', async () => {
  const bodies = [];
  const client = makeTavusClient({ apiKey: 'dummy', envPalId: 'p-existing', fetchImpl: async (url, options) => {
    if (url.includes('/v2/pals/')) return Response.json({ pal_id: 'p-existing', pal_name: 'Naya', default_face_id: FACE_ID,
      layers: { conversational_flow: { turn_detection_model: 'sparrow-2', turn_taking_patience: 'low', pal_interruptibility: 'medium' } } });
    bodies.push(JSON.parse(options.body));
    return Response.json({ conversation_id: 'c12345', conversation_url: 'https://tavus.daily.co/c12345', status: 'active' });
  } });
  await client.createConversation({ conversationalContext: 'Adi suka kopi susu' });
  assert.equal(Object.hasOwn(bodies[0], 'participant_tags'), false);
  assert.equal(Object.hasOwn(bodies[0], 'memory_stores'), false);
  assert.match(bodies[0].conversational_context, /Adi suka kopi susu/);
  assert.deepEqual(bodies[0].properties.languages, ['id']);
  assert.equal(bodies[0].face_id, FACE_ID);
});

test('Dr. Paws menyimpan dan mengingat per subject, terpisah dari Naya, serta reset terarah', async () => {
  const store = fakeStore();
  store.tables.users.push({ id: PRIMARY_USER_ID });
  store.tables.user_profile.push({ user_id: PRIMARY_USER_ID, mode: 'naya', display_name: 'Nama rahasia Naya' });
  store.tables.memories.push({ user_id: PRIMARY_USER_ID, mode: 'naya', category: 'PREFERENCE',
    normalized_key: 'coffee', content: 'Kopi rahasia Naya', active: true });
  const subjects = makeSubjectService({ store });
  const a = await subjects.create({ displayName: 'Anak A', nickname: 'A' });
  const b = await subjects.create({ displayName: 'Anak B' });
  const tavus = { getConversation: async () => ({ events: [{ event_type: 'application.transcription_ready',
    properties: { transcript: [{ role: 'user', content: 'Aku suka kucing.' }] } }] }) };
  const dr = makeMemoryService({ store, tavus, mode: 'dr_paws', palId: 'p-paws', faceId: 'r-paws',
    subjects, extract: async () => validateExtraction({ summary: 'A bercerita tentang kucing.', tone: 'senang', topics: ['kucing'], follow_ups: [],
      memories: [{ category: 'PREFERENCE', content: 'A suka kucing', normalized_key: 'favorite:animal', importance: .7, confidence: .9 },
        { category: 'PROFILE', content: 'A memiliki diagnosis ADHD', normalized_key: 'clinical:adhd', importance: .9, confidence: .9 }],
      open_loops: [{ content: 'Tanyakan gambar kucing', normalized_key: 'drawing:cat' }], resolved_open_loop_keys: [], profile: {} }) });
  const context = await dr.prepareContext({ subjectId: a.id });
  assert.doesNotMatch(context, /Nama rahasia Naya|Kopi rahasia Naya/);
  await dr.recordStarted('c-paws', { subjectId: a.id });
  assert.equal((await dr.recordEnded('c-paws')).status, 'ready');
  assert.equal(store.tables.conversation_sessions.at(-1).mode, 'dr_paws');
  assert.equal(store.tables.conversation_sessions.at(-1).subject_id, a.id);
  assert.equal(store.tables.conversation_messages.length, 1);
  assert.equal(store.tables.memories.length, 2);
  assert.equal(store.tables.session_summaries.length, 1);
  assert.equal(store.tables.session_summaries[0].subject_id, a.id);
  assert.equal(store.tables.user_profile.length, 1);
  assert.match(await dr.prepareContext({ subjectId: a.id }), /A suka kucing|Tanyakan gambar kucing/);
  assert.doesNotMatch(await dr.prepareContext({ subjectId: b.id }), /A suka kucing|Tanyakan gambar kucing|Kopi rahasia/);
  const naya = makeMemoryService({ store, tavus });
  assert.doesNotMatch(await naya.prepareContext(), /A suka kucing/);
  await assert.rejects(dr.prepareContext(), (error) => error.code === 'SUBJECT_REQUIRED');
  await assert.rejects(subjects.reset(a.id, false), (error) => error.code === 'CONFIRMATION_REQUIRED');
  await subjects.reset(a.id, true);
  assert.doesNotMatch(await dr.prepareContext({ subjectId: a.id }), /A suka kucing|Tanyakan gambar kucing/);
  assert.equal(store.tables.memories.length, 1);
  assert.equal(store.tables.memories[0].mode, 'naya');
  assert.equal(store.tables.conversation_messages.length, 1);
  assert.equal((await dr.status()).subjectsCount, 2);
});

test('dua anak dan perubahan preferensi tetap terisolasi; fakta terbaru menang', async () => {
  const store = fakeStore();
  const subjects = makeSubjectService({ store });
  const a = await subjects.create({ displayName: 'A' });
  const b = await subjects.create({ displayName: 'B' });
  const transcript = new Map([
    ['c-a1', 'Aku suka warna merah.'], ['c-b1', 'Aku suka warna hijau.'], ['c-a2', 'Sekarang warna favoritku biru.'],
  ]);
  const tavus = { getConversation: async (id) => ({ events: [{ event_type: 'application.transcription_ready',
    properties: { transcript: [{ role: 'user', content: transcript.get(id) }] } }] }) };
  const extract = async (messages) => {
    const utterance = messages[0].content;
    const color = utterance.includes('biru') ? 'biru' : utterance.includes('hijau') ? 'hijau' : 'merah';
    return validateExtraction({ summary: `Bercerita tentang warna ${color}.`, tone: 'santai', topics: ['warna'], follow_ups: [],
      memories: [{ category: 'PREFERENCE', content: `Warna favoritnya ${color}`, normalized_key: 'favorite:color', importance: .8, confidence: .9 }],
      open_loops: [], resolved_open_loop_keys: [], profile: {} });
  };
  const dr = makeMemoryService({ store, tavus, mode: 'dr_paws', subjects, extract });
  for (const [id, subjectId] of [['c-a1', a.id], ['c-b1', b.id], ['c-a2', a.id]]) {
    await dr.recordStarted(id, { subjectId });
    await dr.recordEnded(id);
  }
  const aContext = await dr.prepareContext({ subjectId: a.id });
  const bContext = await dr.prepareContext({ subjectId: b.id });
  assert.match(aContext, /favoritnya biru/);
  assert.doesNotMatch(aContext, /favoritnya merah|favoritnya hijau/);
  assert.match(bContext, /favoritnya hijau/);
  assert.doesNotMatch(bContext, /favoritnya biru|favoritnya merah/);
  assert.equal(store.tables.memories.filter((item) => item.subject_id === a.id).length, 1);
  await subjects.reset(a.id, true);
  assert.match(await dr.prepareContext({ subjectId: b.id }), /favoritnya hijau/);
  assert.equal(store.tables.conversation_messages.length, 3);
});
