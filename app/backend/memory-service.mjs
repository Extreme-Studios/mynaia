import { PRIMARY_USER_ID, StorageError } from './supabase.mjs';
import { parseTranscript, redactSensitive } from './transcript.mjs';
import { extractWithGemini, validateChildExtraction } from './memory-extract.mjs';
import { parseMode } from './modes.mjs';
import { makeSubjectService } from './subjects.mjs';

const eq = (value) => `eq.${value}`;
const now = () => new Date().toISOString();

export function buildMemoryContext({ profile = [], memories = [], summaries = [], loops = [] } = {}) {
  const lines = ['Konteks pribadi untuk Naya. Pakai hanya bila relevan; jangan menyebut database atau daftar memori. Jangan mengarang.'];
  const p = profile[0];
  if (p?.display_name) lines.push(`Nama: ${p.display_name}`);
  if (p?.preferred_language) lines.push(`Bahasa: ${p.preferred_language}`);
  if (p?.interaction_style) lines.push(`Gaya: ${p.interaction_style}`);
  if (loops.length) lines.push(`Hal yang mungkin layak ditindaklanjuti: ${loops.slice(0, 3).map((x) => x.content).join('; ')}`);
  if (memories.length) lines.push(`Fakta relevan: ${memories.slice(0, 12).map((x) => `${x.category}: ${x.content}`).join('; ')}`);
  if (summaries.length) lines.push(`Percakapan terakhir: ${summaries.slice(0, 3).map((x) => x.summary).join(' | ')}`);
  lines.push('Sapa bervariasi. Bila ada hal tertunda yang relevan, tanyakan secara natural; jika tidak, gunakan konteks akrab atau sapaan netral. Jangan buka dengan daftar fakta.');
  return redactSensitive(lines.join('\n')).slice(0, 5000);
}

export function buildChildContext({ subject, memories = [], summaries = [], loops = [] } = {}) {
  const lines = ['Konteks percakapan Dr. Paws. Gunakan secara natural bila relevan. Jangan sebut database atau daftar memori; jangan mengarang atau meminta rahasia.'];
  lines.push(`Nama panggilan: ${subject.nickname || subject.display_name}`);
  if (memories.length) lines.push(`Yang pernah diceritakan: ${memories.slice(0, 6).map((x) => x.content).join('; ')}`);
  if (loops.length) lines.push(`Boleh ditanyakan lagi secara santai: ${loops.slice(0, 2).map((x) => x.content).join('; ')}`);
  if (summaries.length) lines.push(`Obrolan terakhir: ${summaries[0].summary}`);
  lines.push('Jangan membuat diagnosis atau penilaian psikologis. Jangan membacakan semua fakta sekaligus.');
  return redactSensitive(lines.join('\n')).slice(0, 2200);
}

export function makeMemoryService({ store, tavus, extract = extractWithGemini, userId = PRIMARY_USER_ID,
  palId = '', faceId = '', mode = 'naya', tavusForProfile = () => tavus,
  subjects = makeSubjectService({ store, userId }) }) {
  parseMode(mode);
  async function status() {
    if (!store.configured) return { enabled: false, provider: 'supabase', storeConfigured: false, pendingSessions: 0 };
    const sessions = await store.select('conversation_sessions', { user_id: eq(userId), mode: eq(mode) }, 'id,transcript_status,memory_status');
    const base = { enabled: true, provider: 'supabase', storeConfigured: true,
      pendingSessions: sessions.filter((x) => x.transcript_status !== 'ready' || x.memory_status !== 'ready').length };
    return mode === 'dr_paws' ? { ...base, subjectsCount: (await subjects.list()).length } : base;
  }

  async function prepareContext({ subjectId } = {}) {
    if (!store.configured) throw new StorageError('SUPABASE_NOT_CONFIGURED');
    const subject = mode === 'dr_paws' ? await subjects.requireSubject(subjectId) : null;
    await store.upsert('users', { id: userId }, 'id');
    await processPending(2);
    if (mode === 'dr_paws') {
      const scope = { user_id: eq(userId), mode: eq(mode), subject_id: eq(subject.id) };
      const [memories, summaries, loops] = await Promise.all([
        store.select('memories', { ...scope, active: 'eq.true', order: 'last_seen_at.desc', limit: '6' }, 'content'),
        store.select('session_summaries', { ...scope, order: 'created_at.desc', limit: '1' }, 'summary'),
        store.select('open_loops', { ...scope, status: 'eq.open', order: 'created_at.desc', limit: '2' }, 'content'),
      ]);
      return buildChildContext({ subject, memories, summaries, loops });
    }
    const [profile, memories, summaries, loops] = await Promise.all([
      store.select('user_profile', { user_id: eq(userId), mode: eq(mode) }, 'display_name,preferred_language,interaction_style'),
      store.select('memories', { user_id: eq(userId), mode: eq(mode), active: 'eq.true', order: 'importance.desc,last_seen_at.desc', limit: '12' }, 'category,content,importance,last_seen_at'),
      store.select('session_summaries', { user_id: eq(userId), mode: eq(mode), order: 'created_at.desc', limit: '3' }, 'summary'),
      store.select('open_loops', { user_id: eq(userId), mode: eq(mode), status: 'eq.open', order: 'created_at.desc', limit: '3' }, 'content'),
    ]);
    return buildMemoryContext({ profile, memories, summaries, loops });
  }

  async function recordStarted(conversationId, { profileUsed = 1, sessionPalId = palId, sessionFaceId = faceId, subjectId } = {}) {
    if (!store.configured) return;
    if (mode === 'dr_paws') await subjects.requireSubject(subjectId);
    await store.upsert('conversation_sessions', {
      user_id: userId, mode, tavus_conversation_id: conversationId, pal_id: sessionPalId || null, face_id: sessionFaceId || null,
      tavus_profile_used: profileUsed, subject_id: mode === 'dr_paws' ? subjectId : null,
      started_at: now(),
    }, 'tavus_conversation_id');
  }

  async function processConversation(conversationId) {
    if (!store.configured) return { status: 'disabled' };
    const sessions = await store.select('conversation_sessions', { tavus_conversation_id: eq(conversationId), user_id: eq(userId), mode: eq(mode) }, '*');
    const session = sessions[0];
    if (!session) throw new Error('MEMORY_SESSION_NOT_FOUND');
    if (session.transcript_status === 'ready' && session.memory_status === 'ready') return { status: 'ready' };
    let messages;
    if (session.transcript_status === 'ready') {
      messages = await store.select('conversation_messages', { session_id: eq(session.id), order: 'position.asc' }, 'position,role,content');
    } else {
      const conversation = await tavusForProfile(session.tavus_profile_used || 1).getConversation(conversationId);
      messages = parseTranscript(conversation);
      if (messages === null) {
        await store.update('conversation_sessions', { id: eq(session.id) }, { last_sync_at: now() });
        return { status: 'transcript_pending' };
      }
      if (messages.length) await store.upsert('conversation_messages', messages.map((item) => ({ session_id: session.id, ...item })), 'session_id,position');
      await store.update('conversation_sessions', { id: eq(session.id) }, { transcript_status: 'ready', last_sync_at: now() });
    }
    if (session.memory_status === 'ready') return { status: 'ready' };
    const subject = mode === 'dr_paws' && session.subject_id ? await subjects.requireSubject(session.subject_id) : null;
    if (mode === 'dr_paws' && (!subject || (subject.memory_reset_at &&
      new Date(session.started_at) <= new Date(subject.memory_reset_at)))) {
      await store.update('conversation_sessions', { id: eq(session.id) }, { memory_status: 'ready', summary_status: 'ready' });
      return { status: 'ready', messageCount: messages.length };
    }
    let result;
    try { result = await extract(messages, { mode }); if (mode === 'dr_paws') result = validateChildExtraction(result); }
    catch (error) {
      await store.update('conversation_sessions', { id: eq(session.id) }, { memory_status: 'error', summary_status: 'error' });
      throw error;
    }
    await store.upsert('session_summaries', { session_id: session.id, user_id: userId, mode, subject_id: session.subject_id || null,
      summary: result.summary, tone: result.tone, topics: result.topics, follow_ups: result.follow_ups }, 'session_id');
    await store.update('conversation_sessions', { id: eq(session.id) }, { summary_status: 'ready' });

    for (const item of result.memories) {
      const scope = { user_id: eq(userId), mode: eq(mode), ...(mode === 'dr_paws' ? { subject_id: eq(session.subject_id) } : {}) };
      const existing = (await store.select('memories', { ...scope, category: eq(item.category), normalized_key: eq(item.normalized_key) }, '*'))[0];
      await store.upsert('memories', { user_id: userId, mode, subject_id: session.subject_id || null, category: item.category, content: item.content,
        normalized_key: item.normalized_key, importance: Math.max(existing?.importance || 0, item.importance),
        confidence: Math.max(existing?.confidence || 0, item.confidence),
        first_seen_at: existing?.first_seen_at || now(), last_seen_at: now(),
        source_session_id: session.id, active: true }, 'user_id,mode,subject_id,category,normalized_key');
      for (const key of item.supersedes_keys) {
        await store.update('memories', { ...scope, normalized_key: eq(key) }, { active: false });
      }
    }
    for (const item of result.open_loops) {
      await store.upsert('open_loops', { user_id: userId, mode, subject_id: session.subject_id || null, content: item.content,
        normalized_key: item.normalized_key, status: 'open', source_session_id: session.id }, 'user_id,mode,subject_id,normalized_key');
    }
    for (const key of result.resolved_open_loop_keys) {
      await store.update('open_loops', { user_id: eq(userId), mode: eq(mode), ...(mode === 'dr_paws' ? { subject_id: eq(session.subject_id) } : {}), normalized_key: eq(key) }, { status: 'resolved', resolved_at: now() });
    }
    if (mode === 'naya' && Object.keys(result.profile).length) {
      const old = (await store.select('user_profile', { user_id: eq(userId), mode: eq(mode) }, '*'))[0] || {};
      await store.upsert('user_profile', { user_id: userId, mode, display_name: old.display_name || null,
        preferred_language: old.preferred_language || null, interaction_style: old.interaction_style || null,
        ...result.profile, updated_at: now() }, 'user_id,mode');
    }
    await store.update('conversation_sessions', { id: eq(session.id) }, { memory_status: 'ready' });
    return { status: 'ready', messageCount: messages.length };
  }

  async function recordEnded(conversationId) {
    if (!store.configured) return { status: 'disabled' };
    await store.update('conversation_sessions', { user_id: eq(userId), mode: eq(mode), tavus_conversation_id: eq(conversationId) }, { ended_at: now() });
    return processConversation(conversationId);
  }

  async function processPending(limit = 5) {
    if (!store.configured) return { processed: 0 };
    const sessions = await store.select('conversation_sessions', {
      user_id: eq(userId), mode: eq(mode), ended_at: 'not.is.null', memory_status: 'neq.ready', order: 'started_at.asc', limit: String(limit),
    }, 'tavus_conversation_id');
    let processed = 0;
    for (const session of sessions) {
      try { if ((await processConversation(session.tavus_conversation_id)).status === 'ready') processed++; }
      catch { /* Keep pending/error for the next authorized sync. */ }
    }
    return { processed };
  }

  return { enabled: store.configured, status, prepareContext, recordStarted, recordEnded, processPending, processConversation };
}
