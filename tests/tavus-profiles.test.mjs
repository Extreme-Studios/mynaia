import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { createVercelHandler } from '../api/handler.js';
import { authorized, sameOrigin, sessionToken } from '../app/backend/access-auth.mjs';
import { makeActiveProfileStore, modeProfileError, parseProfile, publicProfileStatus, resolveTavusProfile } from '../app/backend/tavus-profiles.mjs';
import { inspectTavusProfile } from '../app/backend/tavus-profile-inspect.mjs';

async function invoke(handler, method, route, { body, cookie } = {}) {
  const request = Readable.from(body ? [JSON.stringify(body)] : []);
  request.method = method;
  request.url = `/api/handler?route=${route}`;
  request.headers = cookie ? { cookie } : {};
  const response = { writeHead(status, headers) { this.status = status; this.headers = headers; },
    end(value) { this.body = JSON.parse(value); } };
  await handler(request, response);
  return response;
}

test('delapan profil valid, 0/9 ditolak, dan fallback legacy hanya untuk profil 1', () => {
  assert.deepEqual(Array.from({ length: 8 }, (_, i) => parseProfile(i + 1)), [1,2,3,4,5,6,7,8]);
  for (const value of [0,9,'2.5',null,undefined]) assert.throws(() => parseProfile(value));
  const env = { TAVUS_API_KEY: 'legacy-secret', TAVUS_NAYA_PAL_ID: 'p-old',
    TAVUS_DR_PAWS_PAL_ID: 'p-paws', TAVUS_DR_PAWS_FACE_ID: 'r-paws',
    TAVUS_PROFILE_2_API_KEY: 'new-secret' };
  const first = resolveTavusProfile(1, env);
  const second = resolveTavusProfile(2, env);
  assert.equal(first.apiKey, 'legacy-secret');
  assert.equal(first.nayaPalId, 'p-old');
  assert.equal(second.apiKey, 'new-secret');
  assert.equal(second.nayaPalId, '');
  assert.equal(second.drPawsPalId, '');
  assert.equal(second.nayaFaceId, '');
  assert.match(modeProfileError(second, 'naya').message, /Naia/);
  assert.match(modeProfileError(second, 'dr_paws').message, /Dr\. Paws/);
  const safe = publicProfileStatus(second, 1);
  assert.equal(safe.apiConfigured, true);
  assert.equal(safe.nayaConfigured, false);
  assert.equal(safe.drPawsConfigured, false);
  assert.doesNotMatch(JSON.stringify(safe), /secret|p-old|r-paws/);
});

test('nomor profil tersimpan di Supabase dan dibaca sama dari dua perangkat', async () => {
  let setting = '1';
  const writes = [];
  const store = { configured: true,
    select: async (table) => table === 'app_settings' ? [{ setting_value: setting }] : [],
    upsert: async (table, row) => { writes.push(table); setting = row.setting_value; } };
  const laptop = makeActiveProfileStore({ store });
  const phone = makeActiveProfileStore({ store });
  assert.equal(await laptop.getActive(), 1);
  await laptop.setActive(5);
  assert.equal(await phone.getActive(), 5);
  assert.deepEqual(writes, ['app_settings']);
  assert.equal(await makeActiveProfileStore({ store: { configured: true, select: async () => [] } }).getActive(), 1);
});

test('satu cookie akses melindungi dashboard dan API profil; Origin silang ditolak', () => {
  const secret = 'access-code-value';
  const cookie = `naya_access=${sessionToken(secret, 1000000)}`;
  assert.equal(authorized({ headers: { cookie } }, secret, 1000001), true);
  assert.equal(authorized({ headers: { cookie } }, secret, 1000000 + 86401000), false);
  assert.equal(sameOrigin({ headers: { origin: 'https://evil.example', host: 'mynaia.extremestudiosai.com' } }), false);
});

test('switch admin hanya mengubah sesi berikutnya; PAL, Face dan key tetap per profil', async () => {
  const env = { NAYA_ACCESS_CODE: 'access-code',
    TAVUS_PROFILE_1_API_KEY: 'key-one', TAVUS_PROFILE_1_NAYA_PAL_ID: 'p-naya-one',
    TAVUS_PROFILE_1_NAYA_FACE_ID: 'r-naya-one', TAVUS_PROFILE_1_DR_PAWS_PAL_ID: 'p-paws-one',
    TAVUS_PROFILE_1_DR_PAWS_FACE_ID: 'r-paws-one',
    TAVUS_PROFILE_2_API_KEY: 'key-two', TAVUS_PROFILE_2_NAYA_PAL_ID: 'p-naya-two',
    TAVUS_PROFILE_2_NAYA_FACE_ID: 'r-naya-two', TAVUS_PROFILE_2_DR_PAWS_PAL_ID: 'p-paws-two',
    TAVUS_PROFILE_2_DR_PAWS_FACE_ID: 'r-paws-two' };
  let active = '1';
  const sessions = new Map();
  const calls = [];
  let nextId = 1;
  const store = { configured: true,
    select: async (table, filters) => {
      if (table === 'subjects') return [{ id: '11111111-1111-4111-8111-111111111111', display_name: 'Anak tes' }];
      if (table === 'app_settings') return [{ setting_value: active }];
      if (table === 'conversation_sessions' && filters?.tavus_conversation_id) {
        const row = sessions.get(filters.tavus_conversation_id.slice(3));
        return row ? [row] : [];
      }
      return [];
    },
    upsert: async (table, row) => { if (table === 'app_settings') active = row.setting_value; },
  };
  const clientFactory = (config) => ({ configured: Boolean(config.apiKey),
    createConversation: async (options) => {
      calls.push({ type: 'create', key: config.apiKey, pal: config.envPalId, face: config.faceId,
        mode: config.mode || 'naya', context: options.conversationalContext });
      return { conversationId: `c0000${nextId++}`, conversationUrl: 'https://tavus.daily.co/mock', status: 'active' };
    },
    endConversation: async (id) => { calls.push({ type: 'end', key: config.apiKey, id }); },
    getConversationStatus: async (id) => { calls.push({ type: 'status', key: config.apiKey, id }); return { status: 'ended' }; },
  });
  const memory = { prepareContext: async () => 'same Supabase memory',
    recordStarted: async (id, details) => { sessions.set(id, { mode: 'naya', tavus_profile_used: details.profileUsed }); },
    recordEnded: async () => {} };
  const handler = createVercelHandler({ env, store, memory, clientFactory });
  const denied = await invoke(handler, 'GET', 'admin-profiles');
  assert.equal(denied.status, 401);
  const deniedSwitch = await invoke(handler, 'POST', 'admin-profile', { body: { profile: 2 } });
  assert.equal(deniedSwitch.status, 401);
  assert.equal(active, '1');
  const login = await invoke(handler, 'POST', 'access-login', { body: { code: 'access-code' } });
  const cookie = login.headers['set-cookie'].split(';')[0];
  const profiles = await invoke(handler, 'GET', 'admin-profiles', { cookie });
  assert.equal(profiles.body.profiles.length, 8);
  assert.doesNotMatch(JSON.stringify(profiles.body), /key-one|key-two|access-code/);
  const first = await invoke(handler, 'POST', 'conversations', { cookie, body: { mode: 'naya' } });
  assert.equal(first.status, 201);
  assert.deepEqual(calls[0], { type: 'create', key: 'key-one', pal: 'p-naya-one', face: 'r-naya-one',
    mode: 'naya', context: 'same Supabase memory' });
  const invalid = await invoke(handler, 'POST', 'admin-profile', { cookie, body: { profile: 9 } });
  assert.equal(invalid.status, 400);
  const missing = await invoke(handler, 'POST', 'admin-profile', { cookie, body: { profile: 3 } });
  assert.equal(missing.status, 409);
  const switched = await invoke(handler, 'POST', 'admin-profile', { cookie, body: { profile: 2 } });
  assert.deepEqual(switched.body, { active: 2 });
  const status = await invoke(handler, 'GET', 'conversation-status&id=c00001', { cookie });
  assert.deepEqual(status.body, { status: 'ended' });
  assert.deepEqual(calls[1], { type: 'status', key: 'key-one', id: 'c00001' });
  await invoke(handler, 'POST', 'end&id=c00001', { cookie });
  assert.deepEqual(calls[2], { type: 'end', key: 'key-one', id: 'c00001' });
  const second = await invoke(handler, 'POST', 'conversations', { cookie, body: { mode: 'naya' } });
  assert.equal(second.status, 201);
  assert.deepEqual(calls[3], { type: 'create', key: 'key-two', pal: 'p-naya-two', face: 'r-naya-two',
    mode: 'naya', context: 'same Supabase memory' });
  const paws = await invoke(handler, 'POST', 'conversations', { cookie, body: { mode: 'dr_paws', subjectId: '11111111-1111-4111-8111-111111111111' } });
  assert.equal(paws.status, 201);
  assert.equal(calls[4].pal, 'p-paws-two');
  assert.equal(calls[4].face, 'r-paws-two');
  assert.doesNotMatch(JSON.stringify(first.body), /key-one|key-two|access-code/);
});

test('inspeksi profil hanya membaca Tavus dan respons tidak membawa key', async () => {
  const paths = [];
  const result = await inspectTavusProfile({ profile: 4, apiKey: 'secret-four', nayaPalId: 'p-naya',
    drPawsPalId: '', nayaFaceId: 'r-naya', drPawsFaceId: 'r-paws' }, {
    fetchImpl: async (url) => { paths.push(url); return Response.json({ pal_id: 'p-naya', face_id: url.endsWith('r-naya') ? 'r-naya' : 'r-paws' }); },
  });
  assert.equal(result.apiAuthenticated, true);
  assert.equal(result.nayaPalAccessible, true);
  assert.equal(result.drPawsPalAccessible, false);
  assert.equal(paths.length, 4);
  assert(paths.every((path) => !/conversations/.test(path)));
  assert.doesNotMatch(JSON.stringify(result), /secret-four/);
});
