import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { makeTavusClient, TavusError } from '../app/backend/tavus.mjs';
import { geminiConfig } from '../app/backend/gemini.mjs';
import { makeSupabaseStore, StorageError } from '../app/backend/supabase.mjs';
import { makeMemoryService } from '../app/backend/memory-service.mjs';
import { parseMode, parseDuration } from '../app/backend/modes.mjs';

export const config = { maxDuration: 60 };

const SESSION_AGE_MS = 24 * 60 * 60 * 1000;

function equalSecret(left, right) {
  const a = createHash('sha256').update(String(left || '')).digest();
  const b = createHash('sha256').update(String(right || '')).digest();
  return timingSafeEqual(a, b);
}

function sessionToken(secret, now = Date.now()) {
  const payload = `${now.toString(36)}.${randomBytes(16).toString('hex')}`;
  const signature = createHmac('sha256', secret).update(payload).digest('hex');
  return `${payload}.${signature}`;
}

function authorized(request, accessCode, now = Date.now()) {
  if (!accessCode) return true;
  const cookie = String(request.headers.cookie || '').split(';').map((item) => item.trim())
    .find((item) => item.startsWith('naya_access='));
  const token = cookie?.slice('naya_access='.length);
  const match = token?.match(/^([0-9a-z]+)\.([0-9a-f]{32})\.([0-9a-f]{64})$/);
  if (!match) return false;
  const created = parseInt(match[1], 36);
  if (!Number.isSafeInteger(created) || created > now || now - created > SESSION_AGE_MS) return false;
  const expected = createHmac('sha256', accessCode).update(`${match[1]}.${match[2]}`).digest('hex');
  return equalSecret(match[3], expected);
}

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

export function createVercelHandler({ env = process.env, client, memory, store: injectedStore } = {}) {
  const gemini = geminiConfig(env);
  const tavus = client || makeTavusClient({
    apiKey: env.TAVUS_API_KEY,
    envPalId: env.TAVUS_NAYA_PAL_ID || env.TAVUS_PAL_ID,
    gemini: { apiKey: env.GEMINI_API_KEY, model: gemini.model },
  });
  const drConfigured = Boolean(env.TAVUS_DR_PAWS_PAL_ID?.trim() && env.TAVUS_DR_PAWS_FACE_ID?.trim());
  const drPaws = makeTavusClient({ apiKey: env.TAVUS_API_KEY, envPalId: env.TAVUS_DR_PAWS_PAL_ID,
    faceId: env.TAVUS_DR_PAWS_FACE_ID || '', mode: 'dr_paws' });
  const accessCode = env.NAYA_ACCESS_CODE?.trim() || '';
  const store = injectedStore || makeSupabaseStore({ url: env.SUPABASE_URL, key: env.SUPABASE_SERVICE_ROLE_KEY });
  const memoryService = memory || makeMemoryService({ store, tavus, palId: env.TAVUS_NAYA_PAL_ID || env.TAVUS_PAL_ID, faceId: 'rc9cff32ceba',
    extract: (messages) => import('../app/backend/memory-extract.mjs').then(({ extractWithGemini }) =>
      extractWithGemini(messages, { apiKey: env.GEMINI_API_KEY, model: env.GEMINI_MEMORY_MODEL || 'gemini-2.5-flash' })) });
  const drMemory = makeMemoryService({ store, tavus: drPaws, palId: env.TAVUS_DR_PAWS_PAL_ID,
    faceId: env.TAVUS_DR_PAWS_FACE_ID, mode: 'dr_paws' });

  return async function handler(request, response) {
    const url = new URL(request.url, 'https://mynaia.local');
    const route = url.searchParams.get('route');
    try {
      if (request.method === 'GET' && route === 'health') {
        json(response, 200, { status: 'ok', milestone: 5 });
        return;
      }
      if (request.method === 'GET' && route === 'memory-status') {
        json(response, 200, await memoryService.status());
        return;
      }
      if (request.method === 'GET' && route === 'mode-status') {
        json(response, 200, { naya: Boolean(tavus.configured && (env.TAVUS_NAYA_PAL_ID || env.TAVUS_PAL_ID)),
          drPaws: Boolean(drPaws.configured && drConfigured) });
        return;
      }
      if (request.method === 'GET' && route === 'gemini-status') {
        json(response, 200, gemini);
        return;
      }
      if (request.method === 'GET' && route === 'tavus-status') {
        json(response, 200, {
          configured: tavus.configured,
          palConfigured: Boolean((env.TAVUS_NAYA_PAL_ID || env.TAVUS_PAL_ID)?.trim()),
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
      if (request.method === 'POST' && (route === 'conversations' || route === 'end')) {
        if (!authorized(request, accessCode)) {
          json(response, 401, { error: 'Masukkan kode akses dulu.', code: 'ACCESS_REQUIRED' });
          return;
        }
        if (!tavus.configured || !(env.TAVUS_NAYA_PAL_ID || env.TAVUS_PAL_ID)?.trim()) {
          throw new TavusError('CONFIG_REQUIRED', 'Konfigurasi Naya di server belum lengkap.', 503);
        }
        if (route === 'conversations') {
          const body = await readJson(request);
          let mode, durationSeconds;
          try { mode = parseMode(body.mode ?? 'naya'); durationSeconds = parseDuration(body.durationMinutes ?? 5); }
          catch (error) { throw new TavusError(error.message, 'Mode atau durasi tidak valid.', 400); }
          if (mode === 'dr_paws' && !drConfigured) throw new TavusError('DR_PAWS_NOT_CONFIGURED', 'Dr. Paws belum dikonfigurasi.', 503);
          const selectedMemory = mode === 'naya' ? memoryService : drMemory;
          const selectedTavus = mode === 'naya' ? tavus : drPaws;
          const context = await selectedMemory.prepareContext();
          const session = await selectedTavus.createConversation({ conversationalContext: context, durationMinutes: durationSeconds / 60 });
          try { await selectedMemory.recordStarted(session.conversationId); }
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
        if (store.configured) {
          const sessions = await store.select('conversation_sessions', { tavus_conversation_id: `eq.${id}` }, 'mode');
          if (!sessions.length) throw new TavusError('INVALID_ID', 'Conversation tidak ditemukan.', 404);
          mode = parseMode(sessions[0].mode);
        }
        const selectedTavus = mode === 'naya' ? tavus : drPaws;
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
      if (error instanceof TavusError) json(response, error.status, { error: error.message, code: error.code });
      else if (error instanceof StorageError) json(response, 503, { error: 'Penyimpanan memori belum tersedia.', code: error.code });
      else {
        console.error('Vercel API error:', error?.name || 'UnknownError');
        json(response, 500, { error: 'Terjadi kesalahan pada server.' });
      }
    }
  };
}

export default createVercelHandler();
