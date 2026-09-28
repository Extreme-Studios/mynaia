import { createHash, randomUUID } from 'node:crypto';
import { PRIMARY_USER_ID } from './supabase.mjs';
import { makeSubjectService } from './subjects.mjs';
import { analyzeLongitudinal, LONGITUDINAL_PROMPT_VERSION } from './longitudinal-analysis.mjs';
import { redactSensitive } from './transcript.mjs';

const eq = (value) => `eq.${value}`;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const now = () => new Date().toISOString();
const clean = (value, max = 1000) => redactSensitive(String(value || '').trim()).slice(0, max);
const sourceFields = {
  PARENT: ['strengths','interests','daily_routine','school_experience','social_interaction','emotional_regulation','communication','behaviors_of_concern','recent_changes','questions'],
  TEACHER: ['classroom_participation','attention_during_activities','communication','peer_interaction','response_to_instruction','transitions','emotional_regulation','strengths','challenges','contextual_notes'],
  PROFESSIONAL: ['observation_title','domain','observation','source_context','strengths','questions'],
  OTHER_CAREGIVER: ['strengths','daily_routine','social_interaction','communication','recent_changes','questions'],
};
export class CaseError extends Error {
  constructor(code, message, status = 400) { super(message); this.code = code; this.status = status; }
}
const validId = (id) => { if (!UUID.test(String(id || ''))) throw new CaseError('NOT_FOUND', 'Data kasus tidak ditemukan.', 404); return id; };
const compactState = (row) => row && ({ status: row.status, version: row.version, reviewer_id: row.reviewer_id || null,
  updated_at: row.updated_at || null });

export function caseEvidenceIndex(sessions, analyses, sources) {
  const entries = new Map();
  const analysisBySession = new Map(analyses.map((row) => [row.session_id, row.result]));
  for (const session of sessions) {
    const result = analysisBySession.get(session.id);
    if (!result) continue;
    const add = (text, turns, context) => {
      for (const turn of turns || []) {
        if (!Number.isInteger(Number(turn)) || Number(turn) < 0) continue;
        const ref = `t:${session.id}:${turn}`;
        if (!entries.has(ref)) entries.set(ref, { ref, source_type: 'CHILD', session_id: session.id,
          date: session.created_at, context, text: clean(text, 350) });
      }
    };
    for (const domain of result.domains || []) for (const item of domain.observations || []) add(item.text, item.evidence_turns, domain.domain);
    for (const item of result.strengths_observed || []) add(item.text, item.evidence_turns, 'kekuatan');
    for (const item of result.working_hypotheses || []) {
      for (const support of item.supporting_evidence || []) add(support.excerpts?.join(' ') || item.rationale, support.evidence_turns, 'hipotesis sementara');
      for (const counter of item.counter_evidence || []) add(counter.excerpts?.join(' ') || item.rationale, counter.evidence_turns, 'bukti tidak sejalan');
    }
  }
  for (const source of sources) {
    for (const [field, value] of Object.entries(source.answers || {})) {
      if (!value) continue;
      const ref = `s:${source.id}:${field}`;
      entries.set(ref, { ref, source_type: source.source_type, source_id: source.id,
        date: source.observed_at, context: field, text: clean(value, 350) });
    }
    if (source.notes) {
      const ref = `s:${source.id}:notes`;
      entries.set(ref, { ref, source_type: source.source_type, source_id: source.id,
        date: source.observed_at, context: 'catatan', text: clean(source.notes, 350) });
    }
  }
  return [...entries.values()].sort((a, b) => String(a.date).localeCompare(String(b.date))).slice(-100);
}

export function makeCaseService({ store, subjects = makeSubjectService({ store }), userId = PRIMARY_USER_ID,
  analyze = analyzeLongitudinal, analysisModel = 'gemini-2.5-flash' } = {}) {
  const scoped = (filters = {}) => ({ owner_user_id: eq(userId), ...filters });
  async function subject(id) { validId(id); return subjects.requireSubject(id); }
  async function reviewer(id) {
    validId(id);
    const rows = await store.select('reviewers', scoped({ id: eq(id) }), '*');
    if (!rows.length) throw new CaseError('REVIEWER_NOT_FOUND', 'Profil reviewer tidak ditemukan.', 404);
    return rows[0];
  }
  async function reviewers() { return store.select('reviewers', scoped({ order: 'created_at.asc' }), '*'); }
  async function createReviewer(input = {}) {
    const display_name = clean(input.displayName, 100), professional_role = clean(input.professionalRole, 100);
    if (display_name.length < 2 || professional_role.length < 2) throw new CaseError('REVIEWER_INVALID', 'Isi nama dan peran reviewer.');
    const row = { id: randomUUID(), owner_user_id: userId, display_name, professional_role,
      organization: clean(input.organization, 120) || null, credential_note: clean(input.credentialNote, 300) || null };
    await store.upsert('reviewers', row, 'id');
    return row;
  }
  async function audit(subjectId, reviewerId, action, entityType, entityId, previousState, newState) {
    await store.upsert('case_audit', { id: randomUUID(), owner_user_id: userId, subject_id: subjectId,
      reviewer_id: reviewerId || null, action, entity_type: entityType, entity_id: entityId || null,
      previous_state: previousState || null, new_state: newState || null }, 'id');
  }
  async function load(id) {
    const child = await subject(id);
    const [sessions, sources, events, loops, caseRows, plans, reportRows, reviewerRows] = await Promise.all([
      store.select('assessment_sessions', scoped({ subject_id: eq(id), order: 'created_at.desc', limit: '100' }), '*'),
      store.select('case_sources', scoped({ subject_id: eq(id), order: 'observed_at.desc', limit: '120' }), '*'),
      store.select('case_audit', scoped({ subject_id: eq(id), order: 'created_at.desc', limit: '150' }), '*'),
      store.select('open_loops', { user_id: eq(userId), mode: 'eq.dr_paws', subject_id: eq(id), status: 'eq.open', limit: '12' }, 'content,created_at'),
      store.select('longitudinal_analyses', scoped({ subject_id: eq(id) }), '*'),
      store.select('follow_up_plans', scoped({ subject_id: eq(id), order: 'created_at.desc', limit: '20' }), '*'),
      store.select('longitudinal_reports', scoped({ subject_id: eq(id) }), '*'),
      reviewers(),
    ]);
    sessions.sort((a,b)=>String(a.created_at).localeCompare(String(b.created_at)));
    sources.sort((a,b)=>String(a.observed_at).localeCompare(String(b.observed_at)));
    const sessionFilter = sessions.length ? `in.(${sessions.map((item) => item.id).join(',')})` : `eq.${randomUUID()}`;
    const [analyses, reports] = await Promise.all([
      store.select('assessment_analyses', scoped({ session_id: sessionFilter }), 'session_id,result,created_at'),
      store.select('assessment_reports', scoped({ session_id: sessionFilter }), 'session_id,status,content,updated_at,reviewed_at,finalized_at'),
    ]);
    const evidence = caseEvidenceIndex(sessions, analyses, sources);
    const fingerprint = createHash('sha256').update(JSON.stringify({
      sessions: sessions.map((x) => [x.id,x.status,x.updated_at]),
      analyses: analyses.map((x) => [x.session_id,x.result]), reports: reports.map((x) => [x.session_id,x.status,x.content,x.updated_at]),
      sources: sources.map((x) => [x.id,x.version,x.answers,x.notes,x.updated_at]),
    })).digest('hex');
    const dates = [...sessions.map((x) => x.updated_at || x.created_at), ...sources.map((x) => x.updated_at || x.created_at),
      ...reports.map((x) => x.updated_at)].filter(Boolean).sort();
    return { child, sessions, sources, analyses, reports, events, loops, caseAnalysis: caseRows[0] || null,
      plans, caseReport: reportRows[0] || null, reviewers: reviewerRows, evidence, fingerprint,
      historyTruncated: sessions.length >= 100 || sources.length >= 120,
      sourceUpdatedAt: dates.at(-1) || null };
  }
  function timeline(data) {
    return [
      ...data.sessions.map((item) => ({ id: item.id, kind: 'session', date: item.created_at,
        source: 'Dr. Paws / laporan anak', title: item.template_snapshot?.name || 'Sesi Dr. Paws',
        summary: data.analyses.find((row) => row.session_id === item.id)?.result?.session_summary || 'Transkrip/analisis menunggu.',
        status: item.status })),
      ...data.sources.map((item) => ({ id: item.id, kind: 'source', date: item.observed_at,
        source: item.source_type, title: item.source_name,
        summary: Object.values(item.answers || {}).find(Boolean) || item.notes || 'Observasi tersimpan.', status: 'tercatat' })),
      ...data.events.map((item) => ({ id: item.id, kind: 'audit', date: item.created_at,
        source: 'Reviewer', title: item.action, summary: data.reviewers.find((r) => r.id === item.reviewer_id)?.display_name || 'Reviewer',
        status: item.entity_type })),
    ].sort((a, b) => String(b.date).localeCompare(String(a.date)));
  }
  async function caseView(id) {
    const data = await load(id), result = data.caseAnalysis?.result || null;
    const coverage = Object.fromEntries(['CHILD','PARENT','TEACHER','PROFESSIONAL'].map((kind) => [kind,
      kind === 'CHILD' ? data.sessions.length > 0 : data.sources.some((item) => item.source_type === kind)]));
    const domainMatrix = {};
    for (const session of data.sessions) {
      const analysis = data.analyses.find((row) => row.session_id === session.id)?.result;
      for (const domain of analysis?.domains || []) (domainMatrix[domain.domain] ||= {})[session.id] = domain.coverage;
    }
    return { child: data.child, sessionCount: data.sessions.length, latestSession: data.sessions.at(-1) || null,
      historyTruncated: data.historyTruncated,
      timeline: timeline(data), sources: data.sources, sourceCoverage: coverage, domainMatrix,
      openQuestions: data.loops, analysis: data.caseAnalysis, analysisStale: Boolean(data.caseAnalysis && data.caseAnalysis.source_fingerprint !== data.fingerprint),
      caseSummary: result ? { strengths: result.strengths, patterns: result.patterns, hypotheses: data.caseReport?.content?.current_working_hypotheses || result.current_working_hypotheses,
        changes: result.changes, missing: result.missing_information, nextAction: result.recommended_follow_up } : null,
      plans: data.plans, report: data.caseReport, reviewers: data.reviewers,
      hypothesisHistory: data.events.filter((item) => item.entity_type === 'hypothesis'),
      safetyHistory: data.sessions.flatMap((session) => {
        const flag = data.analyses.find((row) => row.session_id === session.id)?.result?.safety_review;
        const review = data.events.find((row) => row.entity_type === 'safety' && row.entity_id === session.id);
        return flag?.recommended ? [{ session_id: session.id, date: session.created_at,
          reason: flag.reason, evidence_turns: flag.evidence_turns,
          status: review?.new_state?.status || 'PENDING_REVIEW', reviewed_by: review?.reviewer_id || null,
          reviewed_at: review?.created_at || null, professional_note: review?.new_state?.note || null }] : [];
      }) };
  }
  async function reviewSafety(id, input = {}) {
    const data = await load(id), actor = await reviewer(input.reviewerId);
    const session = data.sessions.find((row) => row.id === input.sessionId);
    const flag = data.analyses.find((row) => row.session_id === session?.id)?.result?.safety_review;
    if (!session || !flag?.recommended) throw new CaseError('SAFETY_FLAG_NOT_FOUND', 'Flag keselamatan tidak ditemukan.', 404);
    const status = String(input.status || '');
    if (!['REVIEWED','FOLLOW_UP_REQUIRED'].includes(status)) throw new CaseError('SAFETY_REVIEW_INVALID', 'Status review tidak valid.');
    const note = clean(input.note, 1500);
    if (!note) throw new CaseError('SAFETY_REVIEW_INVALID', 'Isi catatan review keselamatan.');
    const previous = data.events.find((row) => row.entity_type === 'safety' && row.entity_id === session.id)?.new_state || { status: 'PENDING_REVIEW' };
    await audit(id, actor.id, 'SAFETY_REVIEWED', 'safety', session.id, previous, { status, note });
    return { session_id: session.id, status, note, reviewed_by: actor.id, reviewed_at: now() };
  }
  async function createSource(id, input = {}) {
    await subject(id);
    const actor = await reviewer(input.reviewerId);
    const source_type = String(input.sourceType || '').toUpperCase();
    if (!sourceFields[source_type]) throw new CaseError('SOURCE_INVALID', 'Jenis sumber tidak valid.');
    const source_name = clean(input.sourceName, 100), relationship = clean(input.relationship, 100);
    if (source_name.length < 2) throw new CaseError('SOURCE_INVALID', 'Isi nama sumber informasi.');
    const answers = {};
    for (const field of sourceFields[source_type]) {
      const value = clean(input.answers?.[field], 1000);
      if (value) answers[field] = value;
    }
    const notes = clean(input.notes, 2000);
    if (!Object.keys(answers).length && !notes) throw new CaseError('SOURCE_INVALID', 'Isi setidaknya satu observasi.');
    const observed_at = input.observedAt ? new Date(input.observedAt) : new Date();
    if (Number.isNaN(observed_at.getTime()) || observed_at.getTime() > Date.now() + 86400000)
      throw new CaseError('SOURCE_INVALID', 'Tanggal observasi tidak valid.');
    const row = { id: randomUUID(), owner_user_id: userId, subject_id: id, reviewer_id: actor.id,
      source_type, source_name, relationship: relationship || null, observed_at: observed_at.toISOString(),
      answers, notes };
    await store.upsert('case_sources', row, 'id');
    await audit(id, actor.id, 'SOURCE_ADDED', 'source', row.id, null,
      { source_type, source_name, observed_at: row.observed_at });
    return row;
  }
  async function updateSource(id, sourceId, input = {}) {
    await subject(id); validId(sourceId);
    const actor = await reviewer(input.reviewerId);
    const previous = (await store.select('case_sources', scoped({ subject_id: eq(id), id: eq(sourceId) }), '*'))[0];
    if (!previous) throw new CaseError('SOURCE_NOT_FOUND', 'Sumber tidak ditemukan.', 404);
    if (Number(input.version) !== previous.version) throw new CaseError('SOURCE_CONFLICT', 'Sumber berubah. Muat ulang.', 409);
    const answers = { ...previous.answers };
    for (const field of sourceFields[previous.source_type]) if (Object.hasOwn(input.answers || {}, field)) {
      const value = clean(input.answers[field], 1000);
      if (value) answers[field] = value; else delete answers[field];
    }
    const notes = Object.hasOwn(input, 'notes') ? clean(input.notes, 2000) : previous.notes;
    if (!Object.keys(answers).length && !notes) throw new CaseError('SOURCE_INVALID', 'Isi setidaknya satu observasi.');
    const updated = { answers, notes, version: previous.version + 1, reviewer_id: actor.id, updated_at: now() };
    await store.update('case_sources', scoped({ subject_id: eq(id), id: eq(sourceId), version: eq(previous.version) }), updated);
    await audit(id, actor.id, 'SOURCE_EDITED', 'source', sourceId,
      { version: previous.version, answers: previous.answers, notes: previous.notes },
      { version: updated.version, answers, notes });
    return { ...previous, ...updated };
  }
  async function deleteSource(id, sourceId, input = {}) {
    await subject(id); validId(sourceId);
    const actor = await reviewer(input.reviewerId);
    if (input.confirmation !== 'HAPUS SUMBER') throw new CaseError('CONFIRMATION_REQUIRED', 'Ketik HAPUS SUMBER.', 409);
    await store.rpc('naya_delete_case_source', { p_subject_id: id, p_source_id: sourceId,
      p_owner_user_id: userId, p_reviewer_id: actor.id, p_confirmation: input.confirmation });
    return { deleted: true, derivedAnalysisCleared: true };
  }
  async function evidence(id, ref) {
    await subject(id);
    const transcript = /^t:([0-9a-f-]{36}):(\d+)$/i.exec(String(ref || ''));
    if (transcript) {
      const session = (await store.select('assessment_sessions', scoped({ subject_id: eq(id), id: eq(transcript[1]) }), '*'))[0];
      if (!session) throw new CaseError('EVIDENCE_NOT_FOUND', 'Bukti tidak ditemukan.', 404);
      const turn = (await store.select('conversation_messages', { session_id: eq(session.conversation_session_id),
        position: eq(Number(transcript[2])), role: 'eq.user' }, 'position,role,content,spoken_at'))[0];
      if (!turn) throw new CaseError('EVIDENCE_NOT_FOUND', 'Giliran anak tidak ditemukan.', 404);
      return { ref, source_type: 'CHILD', session_id: session.id, session_name: session.template_snapshot?.name,
        date: session.created_at, speaker: 'Anak', turn: turn.position, excerpt: clean(turn.content, 1000) };
    }
    const source = /^s:([0-9a-f-]{36}):([a-z_]+)$/i.exec(String(ref || ''));
    if (source) {
      const row = (await store.select('case_sources', scoped({ subject_id: eq(id), id: eq(source[1]) }), '*'))[0];
      const text = source[2] === 'notes' ? row?.notes : row?.answers?.[source[2]];
      if (!row || !text) throw new CaseError('EVIDENCE_NOT_FOUND', 'Sumber tidak ditemukan.', 404);
      return { ref, source_type: row.source_type, source_id: row.id, source_name: row.source_name,
        relationship: row.relationship, date: row.observed_at, field: source[2], excerpt: clean(text, 1000) };
    }
    throw new CaseError('EVIDENCE_NOT_FOUND', 'Referensi bukti tidak valid.', 404);
  }
  async function refreshAnalysis(id, input = {}) {
    const data = await load(id);
    const actor = await reviewer(input.reviewerId);
    if (!data.evidence.length) throw new CaseError('CASE_EVIDENCE_EMPTY', 'Belum ada bukti terstruktur untuk dianalisis.', 409);
    if (data.caseAnalysis?.source_fingerprint === data.fingerprint) return { unchanged: true,
      version: data.caseAnalysis.version, result: data.caseAnalysis.result };
    let result;
    try { result = await analyze(data.evidence); }
    catch (error) { throw new CaseError('ANALYSIS_FAILED', `Analisis belum berhasil (${clean(error?.message, 50)}). Coba lagi secara manual.`, 503); }
    const version = (data.caseAnalysis?.version || 0) + 1;
    const row = { subject_id: id, owner_user_id: userId, version, result,
      source_fingerprint: data.fingerprint, source_updated_at: data.sourceUpdatedAt,
      generated_at: now(), prompt_version: LONGITUDINAL_PROMPT_VERSION, model: analysisModel };
    await store.upsert('longitudinal_analyses', row, 'subject_id');
    const content = { ...result, child_name: data.child.display_name,
      period_start: data.sessions[0]?.created_at || data.sources[0]?.observed_at || now(),
      period_end: data.sourceUpdatedAt || now(), source_coverage: {
        CHILD: data.sessions.length > 0, PARENT: data.sources.some((x) => x.source_type === 'PARENT'),
        TEACHER: data.sources.some((x) => x.source_type === 'TEACHER'),
        PROFESSIONAL: data.sources.some((x) => x.source_type === 'PROFESSIONAL') },
      session_history: data.sessions.map((x) => ({ id: x.id, date: x.created_at, template: x.template_snapshot?.name,
        status: x.status })) };
    if (data.caseReport) {
      await store.upsert('longitudinal_report_revisions', { owner_user_id: userId, subject_id: id,
        version: data.caseReport.version, previous_status: data.caseReport.status,
        previous_content: data.caseReport.content, previous_professional_notes: data.caseReport.professional_notes,
        reviewer_id: data.caseReport.reviewer_id }, 'subject_id,version');
    }
    await store.upsert('longitudinal_reports', { owner_user_id: userId, subject_id: id,
      version: (data.caseReport?.version || 0) + 1, status: 'draft', content,
      professional_notes: data.caseReport?.professional_notes || '', reviewer_id: null,
      reviewed_at: null, finalized_at: null, updated_at: now() }, 'subject_id');
    await audit(id, actor.id, 'ANALYSIS_REFRESHED', 'analysis', id,
      compactState(data.caseAnalysis), { version, source_fingerprint: data.fingerprint });
    return { unchanged: false, version, result };
  }
  async function reviewHypothesis(id, input = {}) {
    await subject(id); const actor = await reviewer(input.reviewerId);
    const current = await load(id);
    if (current.caseAnalysis?.source_fingerprint !== current.fingerprint)
      throw new CaseError('ANALYSIS_STALE', 'Sumber berubah. Update analysis sebelum review.', 409);
    const report = (await store.select('longitudinal_reports', scoped({ subject_id: eq(id) }), '*'))[0];
    if (!report) throw new CaseError('REPORT_NOT_READY', 'Buat analisis longitudinal dahulu.', 409);
    if (Number(input.version) !== report.version) throw new CaseError('REPORT_CONFLICT', 'Laporan berubah. Muat ulang.', 409);
    const index = Number(input.index), items = report.content.current_working_hypotheses || [];
    if (!Number.isInteger(index) || index < 0 || index >= items.length) throw new CaseError('HYPOTHESIS_NOT_FOUND', 'Hipotesis tidak ditemukan.', 404);
    const action = String(input.action || '');
    if (!['ACCEPT_FOR_ASSESSMENT','REVISE','REJECT','NEEDS_MORE_DATA','CONFIRM'].includes(action))
      throw new CaseError('REVIEW_INVALID', 'Keputusan tidak valid.');
    const wording = clean(input.wording, 700), note = clean(input.note, 1200);
    if (action === 'REVISE' && !wording) throw new CaseError('REVIEW_INVALID', 'Isi redaksi revisi.');
    const previous = items[index];
    const next = { ...previous, status: ({ ACCEPT_FOR_ASSESSMENT: 'SUPPORTED_FOR_FURTHER_ASSESSMENT',
      REVISE: 'REVISED', REJECT: 'NOT_SUPPORTED', NEEDS_MORE_DATA: 'NEEDS_MORE_DATA',
      CONFIRM: 'PROFESSIONALLY_CONFIRMED' })[action],
      review: { reviewer_id: actor.id, reviewer_name: actor.display_name, professional_role: actor.professional_role,
        action, wording: wording || null, note: note || null, reviewed_at: now() } };
    const content = { ...report.content, current_working_hypotheses: items.map((item, i) => i === index ? next : item),
      verification_status: 'AI_PRELIMINARY' };
    await store.upsert('longitudinal_report_revisions', { owner_user_id: userId, subject_id: id,
      version: report.version, previous_status: report.status, previous_content: report.content,
      previous_professional_notes: report.professional_notes, reviewer_id: report.reviewer_id }, 'subject_id,version');
    await store.update('longitudinal_reports', scoped({ subject_id: eq(id), version: eq(report.version) }),
      { content, status: 'draft', version: report.version + 1, reviewer_id: actor.id,
        reviewed_at: null, finalized_at: null, updated_at: now() });
    await audit(id, actor.id, `HYPOTHESIS_${action}`, 'hypothesis', id,
      { index, label: previous.label, status: previous.status, review: previous.review },
      { index, label: next.label, status: next.status, review: next.review });
    return next;
  }
  async function saveReport(id, input = {}) {
    await subject(id); const actor = await reviewer(input.reviewerId);
    const current = await load(id);
    if (current.caseAnalysis?.source_fingerprint !== current.fingerprint)
      throw new CaseError('ANALYSIS_STALE', 'Sumber berubah. Update analysis sebelum menyimpan laporan.', 409);
    const previous = (await store.select('longitudinal_reports', scoped({ subject_id: eq(id) }), '*'))[0];
    if (!previous) throw new CaseError('REPORT_NOT_READY', 'Laporan belum tersedia.', 409);
    if (Number(input.version) !== previous.version) throw new CaseError('REPORT_CONFLICT', 'Laporan berubah. Muat ulang.', 409);
    const status = String(input.status || '');
    if (!['draft','reviewed','final'].includes(status)) throw new CaseError('REPORT_INVALID', 'Status tidak valid.');
    if (status === 'final' && previous.status === 'draft') throw new CaseError('REVIEW_REQUIRED', 'Tinjau laporan sebelum finalisasi.', 409);
    const interpretation = Object.hasOwn(input, 'interpretation') ? clean(input.interpretation, 4000) : previous.content.professional_interpretation || '';
    const notes = Object.hasOwn(input, 'professionalNotes') ? clean(input.professionalNotes, 8000) : previous.professional_notes;
    const revised = interpretation !== (previous.content.professional_interpretation || '');
    const changed = revised || notes !== previous.professional_notes;
    const nextStatus = previous.status === 'final' && changed ? 'draft' : status;
    if (input.confirmProfessional === true && (nextStatus !== 'final' || !['reviewed','final'].includes(previous.status)))
      throw new CaseError('REVIEW_REQUIRED', 'Konfirmasi memerlukan review manusia sebelumnya.', 409);
    const content = { ...previous.content, professional_interpretation: interpretation,
      verification_status: nextStatus === 'draft' ? 'AI_PRELIMINARY' : input.confirmProfessional === true ?
        'PROFESSIONAL_CONFIRMED' : revised ? 'PROFESSIONAL_REVISED' : 'PROFESSIONAL_REVIEWED' };
    await store.upsert('longitudinal_report_revisions', { owner_user_id: userId, subject_id: id,
      version: previous.version, previous_status: previous.status, previous_content: previous.content,
      previous_professional_notes: previous.professional_notes, reviewer_id: previous.reviewer_id }, 'subject_id,version');
    const updated = { content, professional_notes: notes, status: nextStatus, version: previous.version + 1,
      reviewer_id: actor.id, reviewed_at: nextStatus === 'reviewed' ? now() : previous.reviewed_at,
      finalized_at: nextStatus === 'final' ? now() : null, updated_at: now() };
    await store.update('longitudinal_reports', scoped({ subject_id: eq(id), version: eq(previous.version) }), updated);
    await audit(id, actor.id, `REPORT_${nextStatus.toUpperCase()}`, 'longitudinal_report', id,
      compactState(previous), compactState({ ...previous, ...updated }));
    return { ...previous, ...updated };
  }
  async function createPlan(id, input = {}) {
    await subject(id); const actor = await reviewer(input.reviewerId);
    if (!Array.isArray(input.goals) || input.goals.length > 6)
      throw new CaseError('GOALS_INVALID', 'Masukkan maksimal enam tujuan percakapan.', 400);
    const goals = input.goals.map((x) => clean(x, 180)).filter(Boolean);
    if (!goals.length || goals.some((goal) => /\b(diagnos\w*|adhd|autis\w*|depresi|bipolar|gangguan mental)\b/i.test(goal)))
      throw new CaseError('GOALS_INVALID', 'Tujuan harus berupa pertanyaan percakapan yang aman untuk anak.');
    const analysis = (await store.select('longitudinal_analyses', scoped({ subject_id: eq(id) }), 'version'))[0];
    const row = { id: randomUUID(), owner_user_id: userId, subject_id: id,
      reviewer_id: actor.id, goals, status: 'draft', analysis_version: analysis?.version || null };
    await store.upsert('follow_up_plans', row, 'id');
    await audit(id, actor.id, 'FOLLOW_UP_PLANNED', 'plan', row.id, null, { goals });
    return row;
  }
  async function plan(id, planId) {
    await subject(id); validId(planId);
    const rows = await store.select('follow_up_plans', scoped({ subject_id: eq(id), id: eq(planId) }), '*');
    if (!rows.length) throw new CaseError('PLAN_NOT_FOUND', 'Rencana tidak ditemukan.', 404);
    return rows[0];
  }
  async function reportDetail(id) {
    const data = await load(id);
    if (!data.caseReport) throw new CaseError('REPORT_NOT_READY', 'Laporan belum tersedia.', 409);
    const reviewerRow = data.reviewers.find((row) => row.id === data.caseReport.reviewer_id);
    return { child: data.child, report: data.caseReport, reviewer: reviewerRow || null,
      stale: data.caseAnalysis?.source_fingerprint !== data.fingerprint,
      sourceCoverage: Object.fromEntries(['CHILD','PARENT','TEACHER','PROFESSIONAL'].map((kind) => [kind,
        kind === 'CHILD' ? data.sessions.length > 0 : data.sources.some((item) => item.source_type === kind)])) };
  }
  return { reviewers, createReviewer, caseView, reviewSafety, createSource, updateSource, deleteSource, evidence,
    refreshAnalysis, reviewHypothesis, saveReport, createPlan, plan, reportDetail, load, audit, reviewer };
}
