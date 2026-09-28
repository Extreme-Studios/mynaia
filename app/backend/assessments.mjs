import { randomUUID } from 'node:crypto';
import { PRIMARY_USER_ID, StorageError } from './supabase.mjs';
import { makeSubjectService } from './subjects.mjs';
import { analyzeAssessment, ANALYSIS_PROMPT_VERSION } from './assessment-analysis.mjs';
import { redactSensitive } from './transcript.mjs';

const eq = (value) => `eq.${value}`;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const CONSENT_VERSION = 'dr-paws-assessment-v1';
export const REPORT_DISCLAIMER = 'Hasil ini merupakan ringkasan berbasis percakapan dengan AI dan bukan diagnosis psikologis atau medis.';
const now = () => new Date().toISOString();
const clean = (value, max = 2000) => redactSensitive(String(value || '').trim()).slice(0, max);

export class AssessmentError extends Error {
  constructor(code, message, status = 400) { super(message); this.code = code; this.status = status; }
}

export function validateTemplate(input) {
  const name = clean(input?.name, 101);
  const purpose = clean(input?.purpose, 601);
  if (!name || name.length > 100 || !purpose || purpose.length > 600) throw new AssessmentError('TEMPLATE_INVALID', 'Nama atau tujuan template tidak valid.');
  if (!Array.isArray(input.domains) || !input.domains.length || input.domains.length > 8) throw new AssessmentError('TEMPLATE_INVALID', 'Isi 1–8 area wawancara.');
  const domains = input.domains.map((entry, index) => {
    const domain = clean(entry?.domain, 61).toLowerCase().replace(/[^a-z0-9_ -]/g, '').trim();
    const goal = clean(entry?.goal, 301);
    const example = clean(entry?.example, 201);
    if (!domain || domain.length > 60 || !goal || goal.length > 300) throw new AssessmentError('TEMPLATE_INVALID', `Area ${index + 1} tidak valid.`);
    return { domain, goal, ...(example ? { example } : {}) };
  });
  if (new Set(domains.map((d) => d.domain)).size !== domains.length) throw new AssessmentError('TEMPLATE_INVALID', 'Nama area harus unik.');
  return { name, purpose, domains };
}

export function buildInterviewContext(memoryContext, template, note = '') {
  const goals = template.domains.slice(0, 8).map((d) => `${d.domain}: ${d.goal}`).join(' | ');
  return `${memoryContext}\nSesi percakapan terarah: ${template.name}. Tujuan: ${template.purpose}. Arah obrolan: ${goals}.${note ? ` Catatan yang dipilih untuk konteks percakapan: ${clean(note, 500)}.` : ''} Bertanya satu hal utama sekali waktu. Tanggapi cerita anak sebelum pindah topik. Ikuti ritme anak; jangan terasa seperti kuesioner. Jangan membuat diagnosis, meminta rahasia, atau mengorek detail grafis. Bila bahaya langsung terungkap, arahkan anak ke orang dewasa tepercaya di dekatnya.`.slice(0, 3900);
}

export function draftReport(analysis, session, subject) {
  return {
    identity: { child: subject.display_name, date: session.created_at, duration_minutes: session.planned_duration_minutes,
      template: session.template_snapshot.name, template_version: session.template_version },
    purpose: session.template_snapshot.purpose,
    summary: analysis.session_summary || 'Belum cukup informasi.',
    domains: analysis.domains,
    strengths: analysis.strengths_observed,
    observations: analysis.domains.flatMap((d) => d.observations.map((o) => ({ domain: d.domain, ...o }))),
    insufficient: analysis.open_questions,
    follow_up: analysis.follow_up_topics,
    safety_review: analysis.safety_review,
    limitations: analysis.limitations,
    disclaimer: REPORT_DISCLAIMER,
  };
}

export function makeAssessmentService({ store, subjects = makeSubjectService({ store }), userId = PRIMARY_USER_ID,
  analyze = analyzeAssessment, analysisModel = 'gemini-2.5-flash' } = {}) {
  const scoped = (filters = {}) => ({ owner_user_id: eq(userId), ...filters });
  async function requireId(id) {
    if (typeof id !== 'string' || !UUID.test(id)) throw new AssessmentError('NOT_FOUND', 'Data tidak ditemukan.', 404);
    return id;
  }
  async function requireSession(id) {
    const rows = await store.select('assessment_sessions', scoped({ id: eq(await requireId(id)) }), '*');
    if (!rows.length) throw new AssessmentError('NOT_FOUND', 'Sesi tidak ditemukan.', 404);
    return rows[0];
  }
  async function requireTemplate(id) {
    const rows = await store.select('assessment_templates', { id: eq(await requireId(id)), active: 'eq.true' }, '*');
    const template = rows[0];
    if (!template || (!template.built_in && template.owner_user_id !== userId)) throw new AssessmentError('TEMPLATE_NOT_FOUND', 'Template tidak ditemukan.', 404);
    return template;
  }
  async function templates() {
    if (!store.configured) throw new StorageError('SUPABASE_NOT_CONFIGURED');
    const rows = await store.select('assessment_templates', { active: 'eq.true', order: 'built_in.desc,created_at.asc' }, '*');
    return rows.filter((row) => row.built_in || row.owner_user_id === userId);
  }
  async function createTemplate(input) {
    const template = validateTemplate(input);
    const id = randomUUID();
    await store.upsert('assessment_templates', { id, owner_user_id: userId, slug: `custom-${id}`, ...template, version: 1, active: true, built_in: false }, 'id');
    return { id, ...template, version: 1 };
  }
  async function consentStatus(subjectId) {
    await subjects.requireSubject(subjectId);
    const rows = await store.select('assessment_consents', scoped({ subject_id: eq(subjectId), consent_version: eq(CONSENT_VERSION) }), 'id,consent_actor,consent_timestamp');
    return { consented: rows.length > 0, consentVersion: CONSENT_VERSION, record: rows[0] || null };
  }
  async function giveConsent({ subjectId, actor, accepted } = {}) {
    await subjects.requireSubject(subjectId);
    if (accepted !== true) throw new AssessmentError('CONSENT_REQUIRED', 'Persetujuan orang dewasa diperlukan.');
    const name = clean(actor, 101);
    if (name.length < 2 || name.length > 100) throw new AssessmentError('CONSENT_ACTOR_INVALID', 'Isi nama atau peran orang tua/wali.');
    await store.upsert('assessment_consents', { owner_user_id: userId, subject_id: subjectId, consent_version: CONSENT_VERSION,
      consent_actor: name, consent_timestamp: now() }, 'owner_user_id,subject_id,consent_version');
    return consentStatus(subjectId);
  }
  async function prepare({ subjectId, templateId, professionalNote = '', includeProfessionalNote = false } = {}) {
    await subjects.requireSubject(subjectId);
    const template = await requireTemplate(templateId);
    if (!(await consentStatus(subjectId)).consented) throw new AssessmentError('CONSENT_REQUIRED', 'Persetujuan orang tua/wali belum dicatat.', 409);
    if (typeof professionalNote !== 'string' || professionalNote.length > 2000) throw new AssessmentError('NOTE_INVALID', 'Catatan profesional terlalu panjang.');
    return { template, note: clean(professionalNote), includeNote: includeProfessionalNote === true };
  }
  async function recordStarted(conversationId, { subjectId, template, note, durationMinutes } = {}) {
    const rows = await store.select('conversation_sessions', { user_id: eq(userId), mode: 'eq.dr_paws',
      tavus_conversation_id: eq(conversationId), subject_id: eq(subjectId) }, 'id');
    if (!rows.length) throw new AssessmentError('SESSION_NOT_FOUND', 'Sesi percakapan tidak ditemukan.', 404);
    const id = randomUUID();
    await store.upsert('assessment_sessions', { id, owner_user_id: userId, subject_id: subjectId,
      conversation_session_id: rows[0].id, template_id: template.id, template_version: template.version,
      template_snapshot: { name: template.name, purpose: template.purpose, domains: template.domains },
      professional_note: note || null, planned_duration_minutes: durationMinutes, status: 'processing' }, 'conversation_session_id');
    return { id };
  }
  async function sessionForConversation(conversationId) {
    const rows = await store.select('conversation_sessions', { user_id: eq(userId), mode: 'eq.dr_paws', tavus_conversation_id: eq(conversationId) }, 'id');
    if (!rows.length) return null;
    return (await store.select('assessment_sessions', scoped({ conversation_session_id: eq(rows[0].id) }), '*'))[0] || null;
  }
  async function processConversation(conversationId, drMemory) {
    const session = await sessionForConversation(conversationId);
    if (!session) return { status: 'free_chat' };
    return process(session.id, drMemory);
  }
  async function process(id, drMemory) {
    const session = await requireSession(id);
    if (['draft','reviewed','final'].includes(session.status)) return { status: session.status, sessionId: id };
    const conversations = await store.select('conversation_sessions', { id: eq(session.conversation_session_id), user_id: eq(userId), mode: 'eq.dr_paws', subject_id: eq(session.subject_id) }, '*');
    const conversation = conversations[0];
    if (!conversation) throw new AssessmentError('SESSION_NOT_FOUND', 'Transkrip tidak ditemukan.', 404);
    if (!conversation.ended_at) throw new AssessmentError('SESSION_ACTIVE', 'Sesi belum selesai.', 409);
    if (conversation.transcript_status !== 'ready' && drMemory) {
      try { await drMemory.processConversation(conversation.tavus_conversation_id); } catch { /* Memory failure must not erase transcript. */ }
    }
    const refreshed = (await store.select('conversation_sessions', { id: eq(conversation.id), user_id: eq(userId) }, 'transcript_status'))[0];
    if (refreshed?.transcript_status !== 'ready') {
      await store.update('assessment_sessions', scoped({ id: eq(id) }), { status: 'transcript_pending', updated_at: now() });
      return { status: 'transcript_pending', sessionId: id };
    }
    const messages = await store.select('conversation_messages', { session_id: eq(conversation.id), order: 'position.asc' }, 'id,position,role,content,spoken_at,seconds_from_start');
    if (!messages.some((m) => m.role === 'user')) {
      await store.update('assessment_sessions', scoped({ id: eq(id) }), { status: 'analysis_failed', error_code: 'TRANSCRIPT_EMPTY', updated_at: now() });
      return { status: 'analysis_failed', sessionId: id };
    }
    const existingReport = (await store.select('assessment_reports', scoped({ session_id: eq(id) }), 'status'))[0];
    if (existingReport) {
      await store.update('assessment_sessions', scoped({ id: eq(id) }), { status: existingReport.status, updated_at: now() });
      return { status: existingReport.status, sessionId: id };
    }
    const existingAnalysis = (await store.select('assessment_analyses', scoped({ session_id: eq(id) }), 'result'))[0];
    let analysis;
    try { analysis = existingAnalysis?.result || await analyze(messages, session.template_snapshot); }
    catch (error) {
      await store.update('assessment_sessions', scoped({ id: eq(id) }), { status: 'analysis_failed', error_code: clean(error?.message, 60), updated_at: now() });
      return { status: 'analysis_failed', sessionId: id };
    }
    const subject = await subjects.requireSubject(session.subject_id);
    const report = draftReport(analysis, session, subject);
    if (!existingAnalysis) await store.upsert('assessment_analyses', { session_id: id, owner_user_id: userId, result: analysis,
      prompt_version: ANALYSIS_PROMPT_VERSION, analysis_model: analysisModel }, 'session_id');
    await store.upsert('assessment_reports', { session_id: id, owner_user_id: userId, status: 'draft', version: 1,
      content: report, professional_notes: '', updated_at: now() }, 'session_id');
    await store.update('assessment_sessions', scoped({ id: eq(id) }), { status: 'draft', error_code: null, updated_at: now() });
    return { status: 'draft', sessionId: id };
  }
  async function dashboard() {
    const [children, sessions, reports, summaries] = await Promise.all([
      subjects.list(),
      store.select('assessment_sessions', scoped({ order: 'created_at.desc', limit: '80' }), 'id,subject_id,conversation_session_id,template_snapshot,planned_duration_minutes,status,created_at'),
      store.select('assessment_reports', scoped({ order: 'updated_at.desc', limit: '80' }), 'session_id,status,updated_at'),
      store.select('session_summaries', { user_id: eq(userId), mode: 'eq.dr_paws', order: 'created_at.desc', limit: '80' }, 'session_id,summary'),
    ]);
    const names = new Map(children.map((child) => [child.id, child.nickname || child.display_name]));
    return { children, sessions: sessions.map((s) => ({ ...s, child_name: names.get(s.subject_id) || 'Profil tidak tersedia',
      summary: summaries.find((item) => item.session_id === s.conversation_session_id)?.summary || null,
      report_status: reports.find((r) => r.session_id === s.id)?.status || null })),
    counts: { children: children.length, pending: sessions.filter((s) => ['processing','transcript_pending','analysis_failed'].includes(s.status)).length,
      draft: reports.filter((r) => r.status === 'draft').length, reviewed: reports.filter((r) => r.status === 'reviewed').length } };
  }
  async function childProfile(subjectId) {
    const subject = await subjects.requireSubject(subjectId);
    const [sessions, conversations, summaries, loops] = await Promise.all([
      store.select('assessment_sessions', scoped({ subject_id: eq(subjectId), order: 'created_at.desc', limit: '100' }), 'id,conversation_session_id,template_snapshot,planned_duration_minutes,status,created_at'),
      store.select('conversation_sessions', { user_id: eq(userId), mode: 'eq.dr_paws', subject_id: eq(subjectId), order: 'started_at.desc', limit: '100' }, 'id,started_at,ended_at,transcript_status,mode'),
      store.select('session_summaries', { user_id: eq(userId), mode: 'eq.dr_paws', subject_id: eq(subjectId), order: 'created_at.desc', limit: '6' }, 'summary,created_at'),
      store.select('open_loops', { user_id: eq(userId), mode: 'eq.dr_paws', subject_id: eq(subjectId), status: 'eq.open', limit: '6' }, 'content'),
    ]);
    return { subject, sessions, free_chat_count: conversations.filter((row) => !sessions.some((session) => session.conversation_session_id === row.id)).length,
      conversation_history: conversations.map((row) => ({ started_at: row.started_at, ended_at: row.ended_at, transcript_status: row.transcript_status,
        type: sessions.some((session) => session.conversation_session_id === row.id) ? 'structured' : 'free_chat' })),
      summaries, open_topics: loops, consent: await consentStatus(subjectId) };
  }
  async function detail(id) {
    const session = await requireSession(id);
    const [subject, conversation, analysis, report, revisions] = await Promise.all([
      subjects.requireSubject(session.subject_id),
      store.select('conversation_sessions', { id: eq(session.conversation_session_id), user_id: eq(userId), mode: 'eq.dr_paws', subject_id: eq(session.subject_id) }, '*'),
      store.select('assessment_analyses', scoped({ session_id: eq(id) }), 'result,prompt_version'),
      store.select('assessment_reports', scoped({ session_id: eq(id) }), '*'),
      store.select('assessment_report_revisions', scoped({ session_id: eq(id), order: 'version.desc' }), 'version,previous_status,changed_at'),
    ]);
    if (!conversation.length) throw new AssessmentError('SESSION_NOT_FOUND', 'Sesi tidak ditemukan.', 404);
    const transcript = await store.select('conversation_messages', { session_id: eq(conversation[0].id), order: 'position.asc' },
      'id,position,role,content,spoken_at,seconds_from_start');
    return { session, subject, conversation: { started_at: conversation[0].started_at, ended_at: conversation[0].ended_at,
      transcript_status: conversation[0].transcript_status, memory_status: conversation[0].memory_status },
    transcript, analysis: analysis[0] || null, report: report[0] || null, revisions };
  }
  async function saveReport(id, { content, professionalNotes, status, version } = {}) {
    await requireSession(id);
    const previous = (await store.select('assessment_reports', scoped({ session_id: eq(id) }), '*'))[0];
    if (!previous) throw new AssessmentError('REPORT_NOT_READY', 'Laporan belum tersedia.', 409);
    if (Number(version) !== previous.version) throw new AssessmentError('REPORT_CONFLICT', 'Laporan berubah. Muat ulang sebelum menyimpan.', 409);
    if (!['draft','reviewed','final'].includes(status)) throw new AssessmentError('REPORT_STATUS_INVALID', 'Status laporan tidak valid.');
    if (previous.status === 'draft' && status === 'final') throw new AssessmentError('REVIEW_REQUIRED', 'Tandai reviewed sebelum final.', 409);
    if (typeof professionalNotes !== 'string' || professionalNotes.length > 8000) throw new AssessmentError('REPORT_INVALID', 'Catatan terlalu panjang.');
    if (!content || typeof content !== 'object' || Array.isArray(content) || JSON.stringify(content).length > 30000)
      throw new AssessmentError('REPORT_INVALID', 'Isi laporan tidak valid.');
    // Only editable prose is accepted. Evidence and identity remain generated from the verified analysis.
    const editable = ['summary','purpose','insufficient','follow_up'];
    const next = { ...previous.content };
    for (const field of editable) {
      if (field in content) next[field] = Array.isArray(next[field]) ?
        (Array.isArray(content[field]) ? content[field].slice(0, 12).map((x) => clean(x, 500)) : next[field]) : clean(content[field], 2000);
    }
    if ('observations' in content) {
      if (!Array.isArray(content.observations)) throw new AssessmentError('REPORT_INVALID', 'Observasi tidak valid.');
      const original = new Map(previous.content.observations.map((o) => [`${o.domain}:${o.evidence_turns.join(',')}`, o]));
      next.observations = content.observations.slice(0, 24).map((o) => {
        const source = original.get(`${o.domain}:${(o.evidence_turns || []).join(',')}`);
        if (!source) throw new AssessmentError('EVIDENCE_INVALID', 'Observasi harus merujuk bukti yang ada.');
        return { ...source, text: clean(o.text, 500) };
      }).filter((o) => o.text);
    }
    const notes = clean(professionalNotes, 8000);
    const changed = JSON.stringify(next) !== JSON.stringify(previous.content) || notes !== previous.professional_notes || status !== previous.status;
    if (!changed) return previous;
    await store.upsert('assessment_report_revisions', { session_id: id, owner_user_id: userId, version: previous.version,
      previous_status: previous.status, previous_content: previous.content, previous_professional_notes: previous.professional_notes }, 'session_id,version');
    const nextStatus = previous.status === 'final' && (JSON.stringify(next) !== JSON.stringify(previous.content) || notes !== previous.professional_notes) ? 'draft' : status;
    const updated = { content: next, professional_notes: notes, status: nextStatus, version: previous.version + 1,
      reviewed_at: nextStatus === 'reviewed' ? now() : previous.reviewed_at,
      finalized_at: nextStatus === 'final' ? now() : null, updated_at: now() };
    await store.update('assessment_reports', scoped({ session_id: eq(id), version: eq(previous.version) }), updated);
    await store.update('assessment_sessions', scoped({ id: eq(id) }), { status: nextStatus, updated_at: now() });
    return { ...previous, ...updated };
  }
  async function deleteSession(id, confirmation) {
    await requireSession(id);
    if (confirmation !== 'HAPUS SESI') throw new AssessmentError('CONFIRMATION_REQUIRED', 'Ketik HAPUS SESI untuk menghapus sesi.', 409);
    await store.rpc('naya_delete_assessment_session', { p_session_id: id, p_owner_user_id: userId, p_confirmation: confirmation });
    return { deleted: true };
  }
  async function deleteChild(id, confirmation) {
    await subjects.requireSubject(id);
    if (confirmation !== 'HAPUS PROFIL DAN DATA') throw new AssessmentError('CONFIRMATION_REQUIRED', 'Ketik HAPUS PROFIL DAN DATA untuk menghapus profil.', 409);
    await store.rpc('naya_delete_child_profile', { p_subject_id: id, p_owner_user_id: userId, p_confirmation: confirmation });
    return { deleted: true };
  }
  return { templates, createTemplate, consentStatus, giveConsent, prepare, recordStarted,
    sessionForConversation, processConversation, process, dashboard, childProfile, detail, saveReport, deleteSession, deleteChild };
}
