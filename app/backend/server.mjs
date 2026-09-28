import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { makeTavusClient, TavusError } from './tavus.mjs';
import { geminiConfig } from './gemini.mjs';
import { makeSupabaseStore, StorageError } from './supabase.mjs';
import { makeMemoryService } from './memory-service.mjs';
import { makeSubjectService, SubjectError } from './subjects.mjs';
import { parseMode, parseDuration } from './modes.mjs';
import { PROFILE_COUNT, makeActiveProfileStore, modeProfileError, parseProfile, publicProfileStatus, resolveTavusProfile } from './tavus-profiles.mjs';
import { authorized, equalSecret, sameOrigin, sessionToken } from './access-auth.mjs';
import { inspectTavusProfile } from './tavus-profile-inspect.mjs';

const directory = dirname(fileURLToPath(import.meta.url));
const root = resolve(directory, '..', '..');
const frontend = join(root, 'app', 'frontend');
const files = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/index.html', ['index.html', 'text/html; charset=utf-8']],
  ['/styles.css', ['styles.css', 'text/css; charset=utf-8']],
  ['/app.js', ['app.js', 'text/javascript; charset=utf-8']],
  ['/controller.mjs', ['controller.mjs', 'text/javascript; charset=utf-8']],
  ['/self-view.mjs', ['self-view.mjs', 'text/javascript; charset=utf-8']],
  ['/hero-media.mjs', ['hero-media.mjs', 'text/javascript; charset=utf-8']],
  ['/motion.mjs', ['motion.mjs', 'text/javascript; charset=utf-8']],
  ['/manifest.webmanifest', ['manifest.webmanifest', 'application/manifest+json']],
  ['/sw.js', ['sw.js', 'text/javascript; charset=utf-8']],
  ['/icons/icon-192.png', ['icons/icon-192.png', 'image/png']],
  ['/icons/icon-512.png', ['icons/icon-512.png', 'image/png']],
]);

async function readJson(request) {
  let raw = '';
  for await (const chunk of request) {
    raw += chunk;
    if (raw.length > 1024) throw new TavusError('INVALID_REQUEST', 'Permintaan terlalu besar.', 413);
  }
  try { return JSON.parse(raw || '{}'); }
  catch { throw new TavusError('INVALID_REQUEST', 'JSON tidak valid.', 400); }
}

function json(response, status, data, headers = {}) {
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    ...headers,
  });
  response.end(JSON.stringify(data));
}

export function createNayaServer({ client: injectedClient, gemini = geminiConfig(), store = makeSupabaseStore(),
  drClient: injectedDrClient, memory: injectedMemory, drMemory: injectedDrMemory,
  env = process.env, activeProfileStore } = {}) {
  const first = resolveTavusProfile(1, env);
  const client = injectedClient || makeTavusClient({ apiKey: first.apiKey, envPalId: first.nayaPalId,
    faceId: first.nayaFaceId });
  const drClient = injectedDrClient || makeTavusClient({ apiKey: first.apiKey, envPalId: first.drPawsPalId,
    faceId: first.drPawsFaceId, mode: 'dr_paws' });
  const clientForProfile = (profile, mode) => {
    if (profile === 1) return mode === 'naya' ? client : drClient;
    const config = resolveTavusProfile(profile, env);
    return makeTavusClient({ apiKey: config.apiKey, envPalId: mode === 'naya' ? config.nayaPalId : config.drPawsPalId,
      faceId: mode === 'naya' ? config.nayaFaceId : config.drPawsFaceId, mode });
  };
  const profiles = activeProfileStore || makeActiveProfileStore({ store });
  const subjects = makeSubjectService({ store });
  const accessCode = env.NAYA_ACCESS_CODE?.trim() || '';
  const memory = injectedMemory || makeMemoryService({ store, tavus: client, palId: first.nayaPalId,
    faceId: first.nayaFaceId, tavusForProfile: (profile) => clientForProfile(profile, 'naya') });
  const drMemory = injectedDrMemory || makeMemoryService({ store, tavus: drClient, mode: 'dr_paws',
    palId: first.drPawsPalId, faceId: first.drPawsFaceId,
    subjects,
    tavusForProfile: (profile) => clientForProfile(profile, 'dr_paws') });
  let activeConversation;
  let creating = false;
  let endTimer;

  async function finishConversation(id) {
    if (!activeConversation || activeConversation.conversationId !== id) {
      throw new TavusError('NOT_ACTIVE', 'Conversation tidak aktif di server ini.', 404);
    }
    const selectedClient = clientForProfile(activeConversation.profileUsed, activeConversation.mode);
    const selectedMemory = activeConversation.mode === 'dr_paws' ? drMemory : memory;
    await selectedClient.endConversation(id);
    activeConversation = undefined;
    clearTimeout(endTimer);
    try { await selectedMemory.recordEnded(id); }
    catch (error) { console.error('Memory sync failed:', error?.code || 'ERROR'); }
  }

  return createServer(async (request, response) => {
    const path = new URL(request.url, 'http://localhost').pathname;
    try {
      if (request.method === 'GET' && path === '/api/health') {
        json(response, 200, { status: 'ok', milestone: 5 });
        return;
      }
      if (request.method === 'GET' && path === '/api/access/status') {
        json(response, 200, { required: Boolean(accessCode), authorized: authorized(request, accessCode) });
        return;
      }
      if (request.method === 'POST' && path === '/api/access/login') {
        if (!accessCode) { json(response, 404, { error: 'Kode akses tidak diperlukan.' }); return; }
        if (!sameOrigin(request)) throw new TavusError('INVALID_ORIGIN', 'Asal permintaan tidak valid.', 403);
        const body = await readJson(request);
        if (!equalSecret(body.code, accessCode)) throw new TavusError('INVALID_ACCESS_CODE', 'Kode akses salah.', 401);
        const cookie = `naya_access=${sessionToken(accessCode)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=86400`;
        json(response, 200, { authorized: true }, { 'set-cookie': cookie });
        return;
      }
      if (path.startsWith('/api/') && !authorized(request, accessCode)) {
        throw new TavusError('ACCESS_REQUIRED', 'Masukkan kode akses dulu.', 401);
      }
      if (request.method === 'GET' && path === '/api/memory/status') {
        const [naya, drPawsStatus] = await Promise.all([memory.status(), drMemory.status()]);
        json(response, 200, { ...naya, drPaws: drPawsStatus });
        return;
      }
      if (path === '/api/dr-paws/subjects' || /^\/api\/dr-paws\/subjects\/[^/]+\/reset$/.test(path)) {
        if (request.method === 'GET' && path === '/api/dr-paws/subjects') {
          json(response, 200, { subjects: await subjects.list() }); return;
        }
        if (request.method === 'POST' && sameOrigin(request)) {
          const body = await readJson(request);
          if (path === '/api/dr-paws/subjects') { json(response, 201, await subjects.create(body)); return; }
          const id = path.split('/')[4];
          json(response, 200, await subjects.reset(id, body.confirm === true)); return;
        }
        throw new TavusError('INVALID_REQUEST', 'Permintaan profil tidak valid.', 400);
      }
      if ((request.method === 'GET' && path === '/api/admin/tavus-profiles') ||
          (request.method === 'POST' && (path === '/api/admin/tavus-profile' || path === '/api/admin/tavus-profile/inspect'))) {
        if (request.method === 'POST' && !sameOrigin(request)) throw new TavusError('INVALID_ORIGIN', 'Asal permintaan tidak valid.', 403);
        if (request.method === 'GET') {
          const active = await profiles.getActive();
          json(response, 200, { active, profiles: Array.from({ length: PROFILE_COUNT }, (_, i) =>
            publicProfileStatus(resolveTavusProfile(i + 1, env), active)) });
          return;
        }
        const body = await readJson(request);
        const profile = parseProfile(body.profile);
        if (path.endsWith('/inspect')) {
          json(response, 200, await inspectTavusProfile(resolveTavusProfile(profile, env)));
          return;
        }
        if (!resolveTavusProfile(profile, env).apiKey) throw new TavusError('PROFILE_NOT_CONFIGURED', 'Profil Tavus ini belum memiliki API key.', 409);
        await profiles.setActive(profile);
        json(response, 200, { active: profile });
        return;
      }
      if (request.method === 'GET' && path === '/api/modes/status') {
        const active = await profiles.getActive();
        const config = resolveTavusProfile(active, env);
        json(response, 200, { naya: !modeProfileError(config, 'naya'), drPaws: !modeProfileError(config, 'dr_paws') });
        return;
      }

      if (request.method === 'POST' && path === '/api/memory/sync') {
        const [a, b] = await Promise.all([memory.processPending(), drMemory.processPending()]);
        json(response, 200, { processed: a.processed + b.processed });
        return;
      }

      if (request.method === 'GET' && path === '/api/gemini/status') {
        json(response, 200, { configured: gemini.configured, model: gemini.model });
        return;
      }

      if (request.method === 'GET' && path === '/api/tavus/status') {
        const active = await profiles.getActive();
        const config = resolveTavusProfile(active, env);
        json(response, 200, {
          configured: Boolean(config.apiKey),
          palConfigured: !modeProfileError(config, 'naya'),
          conversationActive: Boolean(activeConversation),
        });
        return;
      }

      if (request.method === 'POST' && path === '/api/conversations') {
        if (creating || activeConversation) {
          throw new TavusError('CONVERSATION_ACTIVE', 'Conversation sedang dibuat atau masih aktif.', 409);
        }
        creating = true;
        try {
          const body = await readJson(request);
          let mode, durationSeconds;
          try { mode = parseMode(body.mode ?? 'naya'); durationSeconds = parseDuration(body.durationMinutes ?? 5); }
          catch (error) { throw new TavusError(error.message, 'Mode atau durasi tidak valid.', 400); }
          const activeProfile = await profiles.getActive();
          const config = resolveTavusProfile(activeProfile, env);
          const configError = modeProfileError(config, mode);
          if (configError) throw configError;
          const selectedMemory = mode === 'dr_paws' ? drMemory : memory;
          const selectedClient = clientForProfile(activeProfile, mode);
          const subjectId = mode === 'dr_paws' ? body.subjectId : undefined;
          const context = await selectedMemory.prepareContext({ subjectId });
          const session = await selectedClient.createConversation({ conversationalContext: context, durationMinutes: durationSeconds / 60 });
          try { await selectedMemory.recordStarted(session.conversationId, { profileUsed: activeProfile, subjectId,
            sessionPalId: mode === 'naya' ? config.nayaPalId : config.drPawsPalId,
            sessionFaceId: mode === 'naya' ? config.nayaFaceId : config.drPawsFaceId }); }
          catch (error) {
            try { await selectedClient.endConversation(session.conversationId); } catch { /* Prevent an orphaned call. */ }
            throw error;
          }
          activeConversation = { ...session, mode, profileUsed: activeProfile };
          endTimer = setTimeout(async () => {
            try { await finishConversation(session.conversationId); }
            catch { console.warn('Conversation timeout cleanup gagal; periksa dashboard Tavus.'); }
          }, (durationSeconds + 5) * 1000);
          endTimer.unref();
          json(response, 201, session);
        } finally {
          creating = false;
        }
        return;
      }

      const statusMatch = path.match(/^\/api\/conversations\/([A-Za-z0-9_-]{4,80})\/status$/);
      if (request.method === 'GET' && statusMatch) {
        const id = statusMatch[1];
        const sessions = await store.select('conversation_sessions', { tavus_conversation_id: `eq.${id}` }, 'mode,tavus_profile_used');
        if (!sessions.length) throw new TavusError('INVALID_ID', 'Conversation tidak ditemukan.', 404);
        json(response, 200, await clientForProfile(parseProfile(sessions[0].tavus_profile_used || 1),
          parseMode(sessions[0].mode)).getConversationStatus(id));
        return;
      }

      const endMatch = path.match(/^\/api\/conversations\/([A-Za-z0-9_-]{4,80})\/end$/);
      if (request.method === 'POST' && endMatch) {
        await finishConversation(endMatch[1]);
        json(response, 200, { status: 'ended' });
        return;
      }

      const file = request.method === 'GET' ? files.get(['/naia', '/naya', '/dr-paws'].includes(path) ? '/' : path) : undefined;
      if (request.method === 'GET' && path === '/daily-esm.js') {
        const body = await readFile(join(root, 'node_modules', '@daily-co', 'daily-js', 'dist', 'daily-esm.js'));
        response.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
        response.end(body);
        return;
      }
      if (request.method === 'GET' && path === '/gsap.min.js') {
        const body = await readFile(join(root, 'node_modules', 'gsap', 'dist', 'gsap.min.js'));
        response.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
        response.end(body);
        return;
      }
      if (request.method === 'GET' && /^\/assets\/hero\/(?:manifest\.json|(?:naia|dr-paws)-hero-(?:poster\.jpg|loop\.mp4))$/.test(path)) {
        const body=await readFile(join(root,'public',path.slice(1)));
        const type=path.endsWith('.jpg')?'image/jpeg':path.endsWith('.mp4')?'video/mp4':'application/json';
        response.writeHead(200, {'content-type':type,'cache-control':'no-cache','x-content-type-options':'nosniff'});response.end(body);return;
      }
      if (request.method === 'GET' && /^\/cinematic(?:-[A-Z0-9]+)?\.js$/.test(path)) {
        const body = await readFile(join(root, 'public', path.slice(1)));
        response.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8', 'cache-control': 'no-cache' });
        response.end(body);
        return;
      }
      if (!file) {
        json(response, 404, { error: 'Tidak ditemukan.' });
        return;
      }
      const body = await readFile(join(frontend, file[0]));
      response.writeHead(200, {
        'content-type': file[1],
        'cache-control': 'no-store',
        'x-content-type-options': 'nosniff',
      });
      response.end(body);
    } catch (error) {
      if (error instanceof TavusError || error instanceof SubjectError) {
        json(response, error.status, { error: error.message, code: error.code });
      } else if (error instanceof StorageError) {
        json(response, 503, { error: 'Penyimpanan memori belum tersedia.', code: error.code });
      } else {
        console.error('Server error:', error?.name || 'UnknownError');
        json(response, 500, { error: 'Terjadi kesalahan pada server.' });
      }
    }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const envFile = join(root, '.env');
  if (existsSync(envFile)) process.loadEnvFile(envFile);
  const port = Number(process.env.PORT || 3000);
  const gemini = geminiConfig();
  createNayaServer({ gemini }).listen(port, '127.0.0.1', () => {
    console.log(`MyNaiA: http://127.0.0.1:${port}`);
  });
}
