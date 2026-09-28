import { createHash } from 'node:crypto';
import { readFile, writeFile, rename } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GEMINI_BASE_URL, DEFAULT_GEMINI_MODEL } from './gemini.mjs';
import { MEMORY_CONTEXT } from './memory.mjs';
import { parseDuration, parseMode } from './modes.mjs';

export const FACE_ID = 'rc9cff32ceba';
export const MAX_CALL_SECONDS = 300;
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const defaultStateFile = join(root, 'app', 'backend', '.naya-pal.json');
export const geminiStateFile = join(root, 'app', 'backend', '.naya-gemini-pal.json');
const promptFile = join(root, 'character', 'system-prompt.md');

export class TavusError extends Error {
  constructor(code, message, status = 502) {
    super(message);
    this.name = 'TavusError';
    this.code = code;
    this.status = status;
  }
}

export async function loadRuntimePrompt(file = promptFile) {
  const markdown = await readFile(file, 'utf8');
  const markers = [...markdown.matchAll(/^---\s*$/gm)];
  if (markers.length < 2) throw new TavusError('INVALID_PROMPT', 'System prompt Naia tidak lengkap.', 500);
  const prompt = markdown.slice(markers[0].index + markers[0][0].length, markers[1].index).trim();
  if (!prompt.startsWith('Kamu adalah Naia')) throw new TavusError('INVALID_PROMPT', 'System prompt Naia tidak valid.', 500);
  return prompt;
}

function requiredString(value, label) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new TavusError('MALFORMED_RESPONSE', `Respons Tavus tidak memiliki ${label}.`);
  }
  return value.trim();
}

export function makeTavusClient({
  apiKey = process.env.TAVUS_API_KEY,
  envPalId = process.env.TAVUS_NAYA_PAL_ID || process.env.TAVUS_PAL_ID,
  mode = 'naya',
  faceId = FACE_ID,
  stateFile = defaultStateFile,
  geminiPalStateFile = geminiStateFile,
  fetchImpl = fetch,
  baseUrl = 'https://tavusapi.com',
  gemini = null,
} = {}) {
  parseMode(mode);
  const usingGemini = Boolean(gemini);
  const effectiveStateFile = usingGemini ? geminiPalStateFile : stateFile;
  let palPromise;
  let palCreationAttempted = false;

  async function request(method, path, payload) {
    if (!apiKey?.trim()) throw new TavusError('KEY_REQUIRED', 'TAVUS_API_KEY belum diatur.', 503);
    let response;
    try {
      response = await fetchImpl(`${baseUrl}${path}`, {
        method,
        headers: {
          'x-api-key': apiKey,
          ...(payload ? { 'content-type': 'application/json' } : {}),
        },
        ...(payload ? { body: JSON.stringify(payload) } : {}),
        signal: AbortSignal.timeout(20000),
      });
    } catch {
      throw new TavusError('NETWORK_ERROR', 'Tavus tidak dapat dihubungi.');
    }
    if (!response.ok) {
      throw new TavusError('API_ERROR', `Tavus menolak permintaan (HTTP ${response.status}).`, 502);
    }
    if (response.status === 204) return {};
    try {
      const raw = await response.text();
      return raw ? JSON.parse(raw) : {};
    } catch {
      throw new TavusError('MALFORMED_RESPONSE', 'Respons Tavus bukan JSON yang valid.');
    }
  }

  async function readSavedPalId() {
    try {
      const state = JSON.parse(await readFile(effectiveStateFile, 'utf8'));
      return typeof state.palId === 'string' && state.palId.trim() ? state.palId.trim() : null;
    } catch (error) {
      if (error.code === 'ENOENT') return null;
      throw new TavusError('INVALID_PAL_STATE', 'File PAL lokal tidak valid.', 500);
    }
  }

  async function configuredPalId() {
    if (mode === 'dr_paws') return envPalId?.trim() || null;
    if (usingGemini && envPalId?.trim() === 'p1be7dd26adf') return await readSavedPalId();
    return envPalId?.trim() || await readSavedPalId();
  }

  async function createNayaPal() {
    if (palCreationAttempted) {
      throw new TavusError('PAL_CREATE_UNCERTAIN', 'Pembuatan PAL pernah dicoba. Periksa dashboard Tavus sebelum mencoba lagi.', 409);
    }
    const systemPrompt = await loadRuntimePrompt();
    palCreationAttempted = true;
    if (usingGemini && !gemini.apiKey?.trim()) throw new TavusError('GEMINI_KEY_REQUIRED', 'GEMINI_API_KEY belum diatur.', 503);
    const data = await request('POST', '/v2/pals', {
      pal_name: usingGemini ? 'Naia Gemini' : 'Naia MVP Test',
      system_prompt: systemPrompt,
      pipeline_mode: 'full',
      default_face_id: FACE_ID,
      languages: ['id'],
      greeting: 'Hai, aku Naia. Senang kamu mampir.',
      dynamic_greeting: false,
      layers: {
        stt: { stt_engine: 'tavus-auto' },
        ...(usingGemini ? { llm: {
          model: gemini.model || DEFAULT_GEMINI_MODEL,
          base_url: GEMINI_BASE_URL,
          api_key: gemini.apiKey,
          speculative_inference: true,
          extra_body: { reasoning_effort: 'low' },
        } } : {}),
        conversational_flow: {
          turn_detection_model: 'sparrow-2',
          turn_taking_patience: 'low',
          pal_interruptibility: 'medium',
          idle_engagement: 'off',
        },
      },
    });
    const palId = requiredString(data.pal_id, 'pal_id');
    const state = {
      palId,
      faceId: FACE_ID,
      promptSha256: createHash('sha256').update(systemPrompt).digest('hex'),
      createdAt: new Date().toISOString(),
    };
    const temporary = `${effectiveStateFile}.${process.pid}.tmp`;
    try {
      await writeFile(temporary, `${JSON.stringify(state, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
      await rename(temporary, effectiveStateFile);
    } catch {
      // PAL sudah terbuat. Pertahankan ID dalam memori agar klik berikutnya tidak membuat PAL kedua.
      console.warn('Tavus PAL ready; ID gagal disimpan. Set TAVUS_PAL_ID sebelum restart.');
    }
    console.log('Tavus PAL ready');
    return palId;
  }

  async function getOrCreateNayaPal() {
    if (palPromise) return palPromise;
    palPromise = (async () => {
      const existingId = await configuredPalId();
      if (mode === 'dr_paws' && !faceId) throw new TavusError('DR_PAWS_NOT_CONFIGURED', 'Dr. Paws belum dikonfigurasi.', 503);
      if (mode === 'dr_paws' && !existingId) throw new TavusError('DR_PAWS_NOT_CONFIGURED', 'Dr. Paws belum dikonfigurasi.', 503);
      if (!existingId) return createNayaPal();
      const data = await request('GET', `/v2/pals/${encodeURIComponent(existingId)}`);
      const expectedName = mode === 'naya' ? /^naya/i : /^dr\.? paws/i;
      if (data.pal_id !== existingId || !expectedName.test(String(data.pal_name || ''))) {
        throw new TavusError('INVALID_PAL', 'PAL yang dikonfigurasi tidak sesuai mode.', 409);
      }
      if (data.pipeline_mode && data.pipeline_mode !== 'full') {
        throw new TavusError('INVALID_PAL', 'PAL yang dikonfigurasi tidak memakai pipeline full.', 409);
      }
      if (data.default_face_id && data.default_face_id !== faceId) {
        throw new TavusError('INVALID_PAL', 'PAL yang dikonfigurasi tidak memakai Face yang sesuai.', 409);
      }
      const llm = data.layers?.llm;
      // Tavus omits the hosted default LLM layer from GET PAL responses.
      const hosted = (!llm?.model || llm.model === 'tavus-gemma-4') && !llm?.base_url && !llm?.api_key;
      const geminiByo = usingGemini && llm?.model === (gemini.model || DEFAULT_GEMINI_MODEL) &&
        llm.base_url?.replace(/\/$/, '') === GEMINI_BASE_URL.replace(/\/$/, '');
      if (usingGemini && !hosted && !geminiByo) {
        throw new TavusError('INVALID_LLM_PAL', 'PAL Naia tidak memakai konfigurasi LLM yang didukung.', 409);
      }
      console.log('Tavus PAL ready');
      return existingId;
    })();
    try {
      return await palPromise;
    } catch (error) {
      palPromise = undefined;
      throw error;
    }
  }

  async function createConversation({ conversationalContext = '', durationMinutes = 5 } = {}) {
    const maxCallDuration = parseDuration(durationMinutes);
    const palId = await getOrCreateNayaPal();
    let data;
    try { data = await request('POST', '/v2/conversations', {
      pal_id: palId,
      face_id: faceId,
      conversation_name: mode === 'naya' ? (usingGemini ? 'Naia Gemini Test' : 'Naia MyNaiA') : 'Dr. Paws MyNaiA',
      conversational_context: mode === 'naya' ? (conversationalContext ? `${MEMORY_CONTEXT}\n${conversationalContext}` : MEMORY_CONTEXT) : conversationalContext,
      dynamic_greeting: true,
      properties: {
        languages: ['id'],
        max_call_duration: maxCallDuration,
        participant_left_timeout: 0,
        participant_absent_timeout: 60,
      },
    }); }
    catch (error) {
      if (error.code === 'API_ERROR') {
        throw new TavusError('CREATE_FAILED', 'Profil Tavus aktif tidak dapat membuat sesi baru. Periksa usage atau pilih profil lain di pengaturan admin.', 502);
      }
      throw error;
    }
    const conversationId = requiredString(data.conversation_id, 'conversation_id');
    const conversationUrl = requiredString(data.conversation_url, 'conversation_url');
    let url;
    try { url = new URL(conversationUrl); }
    catch { throw new TavusError('MALFORMED_RESPONSE', 'URL conversation Tavus tidak valid.'); }
    if (url.protocol !== 'https:' || url.username || url.password || !url.hostname.endsWith('.daily.co')) {
      throw new TavusError('MALFORMED_RESPONSE', 'URL conversation Tavus tidak valid.');
    }
    if (data.status !== 'active') {
      throw new TavusError('MALFORMED_RESPONSE', 'Conversation Tavus tidak aktif.');
    }
    console.log('Conversation created');
    return { conversationId, conversationUrl, status: 'active', durationSeconds: maxCallDuration, mode };
  }

  async function endConversation(conversationId) {
    if (!/^[A-Za-z0-9_-]{4,80}$/.test(conversationId)) {
      throw new TavusError('INVALID_ID', 'Conversation ID tidak valid.', 400);
    }
    try {
      await request('POST', `/v2/conversations/${encodeURIComponent(conversationId)}/end`);
    } catch (error) {
      // Tavus may have ended a call at max_call_duration before our End request arrives.
      if (error.code !== 'API_ERROR') throw error;
      let current;
      try { current = await getConversation(conversationId); }
      catch { throw error; }
      if (current.status !== 'ended') throw error;
    }
    console.log('Conversation ended');
  }

  async function getConversation(conversationId) {
    if (!/^[A-Za-z0-9_-]{4,80}$/.test(conversationId)) throw new TavusError('INVALID_ID', 'Conversation ID tidak valid.', 400);
    return request('GET', `/v2/conversations/${encodeURIComponent(conversationId)}?verbose=true`);
  }

  async function getConversationStatus(conversationId) {
    if (!/^[A-Za-z0-9_-]{4,80}$/.test(conversationId)) throw new TavusError('INVALID_ID', 'Conversation ID tidak valid.', 400);
    const data = await request('GET', `/v2/conversations/${encodeURIComponent(conversationId)}`);
    return { status: data.status === 'ended' ? 'ended' : 'active' };
  }

  return {
    configured: Boolean(apiKey?.trim()),
    configuredPalId,
    createNayaPal,
    getOrCreateNayaPal,
    createConversation,
    endConversation,
    getConversation,
    getConversationStatus,
  };
}
