import { makeTavusClient, TavusError } from '../app/backend/tavus.mjs';
import { geminiConfig } from '../app/backend/gemini.mjs';
import { makeSupabaseStore, StorageError } from '../app/backend/supabase.mjs';
import { makeMemoryService } from '../app/backend/memory-service.mjs';
import { makeSubjectService, SubjectError } from '../app/backend/subjects.mjs';
import { parseMode, parseDuration } from '../app/backend/modes.mjs';
import { PROFILE_COUNT, makeActiveProfileStore, modeProfileError, parseProfile, publicProfileStatus, resolveTavusProfile } from '../app/backend/tavus-profiles.mjs';
import { authorized, equalSecret, sameOrigin, sessionToken } from '../app/backend/access-auth.mjs';
import { inspectTavusProfile } from '../app/backend/tavus-profile-inspect.mjs';

export const config = { maxDuration: 60 };

function json(response, status, body, headers = {}) {
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    ...headers,
  });
  response.end(JSON.stringify(body));
}

async function readJson(request) {
  if (request.body && typeof request.body === 'object') return request.body;
  let raw = '';
  for await (const chunk of request) {
    raw += chunk;
    if (raw.length > 1024) throw new TavusError('INVALID_REQUEST', 'Permintaan terlalu besar.', 413);
  }
  try { return JSON.parse(raw || '{}'); }
  catch { throw new TavusError('INVALID_REQUEST', 'JSON tidak valid.', 400); }
}

export function createVercelHandler({ env = process.env, client, memory, store: injectedStore,
  activeProfileStore, clientFactory = makeTavusClient } = {}) {
  const gemini = geminiConfig(env);
  const firstProfile = resolveTavusProfile(1, env);
  const tavus = client || clientFactory({
    apiKey: firstProfile.apiKey,
    envPalId: firstProfile.nayaPalId,
    faceId: firstProfile.nayaFaceId,
    gemini: { apiKey: env.GEMINI_API_KEY, model: gemini.model },
  });
  const drPaws = clientFactory({ apiKey: firstProfile.apiKey, envPalId: firstProfile.drPawsPalId,
    faceId: firstProfile.drPawsFaceId, mode: 'dr_paws' });
  const clientForProfile = (profile, mode) => {
    if (profile === 1) return mode === 'naya' ? tavus : drPaws;
    const config = resolveTavusProfile(profile, env);
    return clientFactory({ apiKey: config.apiKey, envPalId: mode === 'naya' ? config.nayaPalId : config.drPawsPalId,
      faceId: mode === 'naya' ? config.nayaFaceId : config.drPawsFaceId, mode });
  };
  const accessCode = env.NAYA_ACCESS_CODE?.trim() || '';
  const store = injectedStore || makeSupabaseStore({ url: env.SUPABASE_URL, key: env.SUPABASE_SERVICE_ROLE_KEY });
  const profiles = activeProfileStore || makeActiveProfileStore({ store });
  const subjects = makeSubjectService({ store });
  const memoryService = memory || makeMemoryService({ store, tavus, palId: firstProfile.nayaPalId, faceId: firstProfile.nayaFaceId,
    tavusForProfile: (profile) => clientForProfile(profile, 'naya'),
    extract: (messages) => import('../app/backend/memory-extract.mjs').then(({ extractWithGemini }) =>
      extractWithGemini(messages, { apiKey: env.GEMINI_API_KEY, model: env.GEMINI_MEMORY_MODEL || 'gemini-2.5-flash' })) });
  const drMemory = makeMemoryService({ store, tavus: drPaws, palId: firstProfile.drPawsPalId,
    faceId: firstProfile.drPawsFaceId, mode: 'dr_paws',
    subjects,
    extract: (messages) => import('../app/backend/memory-extract.mjs').then(({ extractWithGemini }) =>
      extractWithGemini(messages, { apiKey: env.GEMINI_API_KEY, model: env.GEMINI_MEMORY_MODEL || 'gemini-2.5-flash', mode: 'dr_paws' })),
    tavusForProfile: (profile) => clientForProfile(profile, 'dr_paws') });

  return async function handler(request, response) {
    const url = new URL(request.url, 'https://mynaia.local');
    const route = url.searchParams.get('route');
    try {
      if (request.method === 'GET' && route === 'health') {
        json(response, 200, { status: 'ok', milestone: 5 });
        return;
      }
      if (!['access-status', 'access-login'].includes(route) && !authorized(request, accessCode)) {
        throw new TavusError('ACCESS_REQUIRED', 'Masukkan kode akses dulu.', 401);
      }
      if (request.method === 'GET' && route === 'memory-status') {
        const [naya, drPawsStatus] = await Promise.all([memoryService.status(), drMemory.status()]);
        json(response, 200, { ...naya, drPaws: drPawsStatus });
        return;
      }
      if (route === 'subjects' || route === 'subject-reset') {
        if (request.method === 'GET' && route === 'subjects') {
          json(response, 200, { subjects: await subjects.list() });
          return;
        }
        if (request.method === 'POST' && sameOrigin(request)) {
          const body = await readJson(request);
          if (route === 'subjects') { json(response, 201, await subjects.create(body)); return; }
          json(response, 200, await subjects.reset(url.searchParams.get('id'), body.confirm === true));
          return;
        }
        throw new TavusError('INVALID_REQUEST', 'Permintaan profil tidak valid.', 400);
      }
      if ((request.method === 'GET' && route === 'admin-profiles') ||
          (request.method === 'POST' && (route === 'admin-profile' || route === 'admin-profile-inspect'))) {
        if (!authorized(request, accessCode)) throw new TavusError('ACCESS_REQUIRED', 'Masukkan kode akses dulu.', 401);
        if (request.method === 'POST' && !sameOrigin(request)) throw new TavusError('INVALID_ORIGIN', 'Asal permintaan tidak valid.', 403);
        if (route === 'admin-profiles') {
          const active = await profiles.getActive();
          json(response, 200, { active, profiles: Array.from({ length: PROFILE_COUNT }, (_, i) =>
            publicProfileStatus(resolveTavusProfile(i + 1, env), active)) });
          return;
        }
        const body = await readJson(request);
        const profile = parseProfile(body.profile);
        if (route === 'admin-profile-inspect') {
          json(response, 200, await inspectTavusProfile(resolveTavusProfile(profile, env)));
          return;
        }
        if (!resolveTavusProfile(profile, env).apiKey) throw new TavusError('PROFILE_NOT_CONFIGURED', 'Profil Tavus ini belum memiliki API key.', 409);
        await profiles.setActive(profile);
        json(response, 200, { active: profile });
        return;
      }
      if (request.method === 'GET' && route === 'mode-status') {
        const active = await profiles.getActive();
        const current = resolveTavusProfile(active, env);
        json(response, 200, { naya: !modeProfileError(current, 'naya'),
          drPaws: !modeProfileError(current, 'dr_paws') });
        return;
      }
      if (request.method === 'GET' && route === 'gemini-status') {
        json(response, 200, gemini);
        return;
      }
      if (request.method === 'GET' && route === 'tavus-status') {
        const active = await profiles.getActive();
        const current = resolveTavusProfile(active, env);
        json(response, 200, {
          configured: Boolean(current.apiKey),
          palConfigured: !modeProfileError(current, 'naya'),
          conversationActive: null,
        });
        return;
      }
      if (request.method === 'GET' && route === 'access-status') {
        json(response, 200, { required: Boolean(accessCode), authorized: authorized(request, accessCode) });
        return;
      }
      if (request.method === 'POST' && route === 'access-login') {
        if (!accessCode) { json(response, 404, { error: 'Kode akses tidak diperlukan.' }); return; }
        if (!sameOrigin(request)) throw new TavusError('INVALID_ORIGIN', 'Asal permintaan tidak valid.', 403);
        const body = await readJson(request);
        if (!equalSecret(body.code, accessCode)) {
          json(response, 401, { error: 'Kode akses salah.', code: 'INVALID_ACCESS_CODE' });
          return;
        }
        const secure = env.VERCEL_ENV || String(request.headers['x-forwarded-proto'] || '').includes('https');
        const cookie = `naya_access=${sessionToken(accessCode)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=86400${secure ? '; Secure' : ''}`;
        json(response, 200, { authorized: true }, { 'set-cookie': cookie });
        return;
      }
      if ((request.method === 'POST' && (route === 'conversations' || route === 'end')) ||
          (request.method === 'GET' && route === 'conversation-status')) {
        if (!authorized(request, accessCode)) {
          json(response, 401, { error: 'Masukkan kode akses dulu.', code: 'ACCESS_REQUIRED' });
          return;
        }
        if (route === 'conversations') {
          const body = await readJson(request);
          let mode, durationSeconds;
          try { mode = parseMode(body.mode ?? 'naya'); durationSeconds = parseDuration(body.durationMinutes ?? 5); }
          catch (error) { throw new TavusError(error.message, 'Mode atau durasi tidak valid.', 400); }
          const activeProfile = await profiles.getActive();
          const current = resolveTavusProfile(activeProfile, env);
          const configError = modeProfileError(current, mode);
          if (configError) throw configError;
          const selectedMemory = mode === 'naya' ? memoryService : drMemory;
          const selectedTavus = clientForProfile(activeProfile, mode);
          const subjectId = mode === 'dr_paws' ? body.subjectId : undefined;
          const context = await selectedMemory.prepareContext({ subjectId });
          const session = await selectedTavus.createConversation({ conversationalContext: context, durationMinutes: durationSeconds / 60 });
          try { await selectedMemory.recordStarted(session.conversationId, { profileUsed: activeProfile, subjectId,
            sessionPalId: mode === 'naya' ? current.nayaPalId : current.drPawsPalId,
            sessionFaceId: mode === 'naya' ? current.nayaFaceId : current.drPawsFaceId }); }
          catch (error) {
            try { await selectedTavus.endConversation(session.conversationId); } catch { /* Avoid an orphaned paid session if storage fails. */ }
            throw error;
          }
          json(response, 201, session);
          return;
        }
        const id = url.searchParams.get('id');
        if (!id || !/^[A-Za-z0-9_-]{4,80}$/.test(id)) throw new TavusError('INVALID_ID', 'Conversation ID tidak valid.', 400);
        let mode = 'naya';
        let sessionProfile = 1;
        if (store.configured) {
          const sessions = await store.select('conversation_sessions', { tavus_conversation_id: `eq.${id}` }, 'mode,tavus_profile_used');
          if (!sessions.length) throw new TavusError('INVALID_ID', 'Conversation tidak ditemukan.', 404);
          mode = parseMode(sessions[0].mode);
          sessionProfile = parseProfile(sessions[0].tavus_profile_used || 1);
        }
        const selectedTavus = clientForProfile(sessionProfile, mode);
        if (route === 'conversation-status') {
          json(response, 200, await selectedTavus.getConversationStatus(id));
          return;
        }
        const selectedMemory = mode === 'naya' ? memoryService : drMemory;
        await selectedTavus.endConversation(id);
        try { await selectedMemory.recordEnded(id); }
        catch (error) { console.error('Memory sync failed:', error?.code || error?.message?.split('_')[0] || 'ERROR'); }
        json(response, 200, { status: 'ended' });
        return;
      }
      if (request.method === 'POST' && route === 'memory-sync') {
        if (!authorized(request, accessCode) || !accessCode) {
          json(response, 401, { error: 'Akses diperlukan.', code: 'ACCESS_REQUIRED' }); return;
        }
        const [nayaSync, pawsSync] = await Promise.all([memoryService.processPending(), drMemory.processPending()]);
        json(response, 200, { processed: nayaSync.processed + pawsSync.processed });
        return;
      }
      json(response, 404, { error: 'Tidak ditemukan.' });
    } catch (error) {
      if (error instanceof TavusError || error instanceof SubjectError) json(response, error.status, { error: error.message, code: error.code });
      else if (error instanceof StorageError) json(response, 503, { error: 'Penyimpanan memori belum tersedia.', code: error.code });
      else {
        console.error('Vercel API error:', error?.name || 'UnknownError');
        json(response, 500, { error: 'Terjadi kesalahan pada server.' });
      }
    }
  };
}

export default createVercelHandler();
