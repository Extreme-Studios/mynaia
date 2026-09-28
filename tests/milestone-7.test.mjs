import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { makeAssessmentService, validateTemplate, buildInterviewContext, draftReport, AssessmentError, REPORT_DISCLAIMER } from '../app/backend/assessments.mjs';
import { validateAssessmentAnalysis } from '../app/backend/assessment-analysis.mjs';
import { renderAssessmentPdf, verificationBanner } from '../app/backend/assessment-pdf.mjs';
import { Readable } from 'node:stream';
import { createVercelHandler } from '../api/handler.js';
import { sessionToken } from '../app/backend/access-auth.mjs';

const owner = 'naya_primary_user';
const childA = randomUUID(), childB = randomUUID(), templateId = randomUUID(), conversationId = randomUUID();
const template = { id: templateId, owner_user_id: null, built_in: true, active: true, version: 1,
  name: 'Sekolah & Belajar', purpose: 'Mendengarkan pengalaman sekolah.', domains: [{ domain: 'sekolah', goal: 'Tanyakan kegiatan yang disukai.' }] };
const subjects = { requireSubject: async (id) => {
  if (![childA, childB].includes(id)) throw new AssessmentError('SUBJECT_NOT_FOUND', 'Profil tidak ditemukan.', 404);
  return { id, display_name: id === childA ? 'Bimo' : 'Anak B', nickname: null };
}, list: async () => [{ id: childA, display_name: 'Bimo' }, { id: childB, display_name: 'Anak B' }] };

function fakeStore() {
  const tables = {
    assessment_templates: [template], assessment_consents: [], assessment_sessions: [], assessment_analyses: [],
    assessment_reports: [], assessment_report_revisions: [],
    conversation_sessions: [{ id: conversationId, user_id: owner, mode: 'dr_paws', subject_id: childA,
      tavus_conversation_id: 'c-test', ended_at: new Date().toISOString(), transcript_status: 'ready', memory_status: 'error' }],
    conversation_messages: [{ id: randomUUID(), session_id: conversationId, position: 1, role: 'user', content: 'Aku suka belajar menggambar.', spoken_at: null, seconds_from_start: 4 },
      { id: randomUUID(), session_id: conversationId, position: 2, role: 'assistant', content: 'Wah, apa yang kamu gambar?', spoken_at: null, seconds_from_start: 6 }],
    session_summaries: [], open_loops: [],
  };
  const filter = (row, filters = {}) => Object.entries(filters).every(([key, value]) =>
    ['order','limit'].includes(key) || !String(value).startsWith('eq.') || String(row[key]) === String(value).slice(3));
  return { configured: true, tables,
    select: async (name, filters = {}) => {
      let rows = (tables[name] || []).filter((row) => filter(row, filters));
      if (filters.order?.includes('desc')) rows = [...rows].reverse();
      if (filters.limit) rows = rows.slice(0, Number(filters.limit));
      return structuredClone(rows);
    },
    upsert: async (name, data, conflict = 'id') => {
      const rows = Array.isArray(data) ? data : [data];
      for (const row of rows) {
        const index = (tables[name] ||= []).findIndex((old) => conflict.split(',').every((key) => old[key] === row[key]));
        if (index >= 0) tables[name][index] = { ...tables[name][index], ...structuredClone(row) };
        else tables[name].push(structuredClone(row));
      }
      return structuredClone(rows);
    },
    update: async (name, filters, body) => {
      const changed = [];
      for (const row of tables[name] || []) if (filter(row, filters)) { Object.assign(row, structuredClone(body)); changed.push(row); }
      return structuredClone(changed);
    },
  };
}

test('template dan konteks terstruktur ringkas; catatan profesional hanya masuk jika dipilih', () => {
  assert.throws(() => validateTemplate({ name: 'Tes', purpose: 'Tujuan', domains: [{ domain: 'x', goal: '' }] }), AssessmentError);
  assert.match(buildInterviewContext('Memori aman', template), /satu hal utama/);
  assert.doesNotMatch(buildInterviewContext('Memori aman', template), /Rahasia orang tua/);
  assert.match(buildInterviewContext('Memori aman', template, 'Rahasia orang tua'), /Rahasia orang tua/);
  assert.ok(buildInterviewContext('x'.repeat(4000), template).length <= 3900);
});

test('analisis menolak observasi tanpa bukti giliran anak dan label diagnostik', () => {
  const messages = [{ position: 1, role: 'user' }, { position: 2, role: 'assistant' }];
  const result = validateAssessmentAnalysis({ session_summary: 'Anak bercerita tentang sekolah.',
    domains: [{ domain: 'sekolah', coverage: 'explored', observations: [
      { text: 'Suka menggambar.', evidence_turns: [1] },
      { text: 'Anak ADHD.', evidence_turns: [1] },
      { text: 'Hal tanpa bukti.', evidence_turns: [2, 99] },
    ] }], strengths_observed: [], safety_review: { recommended: true, reason: 'Lihat lagi.', evidence_turns: [2] } }, messages, template);
  assert.deepEqual(result.domains[0].observations, [{ text: 'Suka menggambar.', evidence_turns: [1] }]);
  assert.equal(result.safety_review.recommended, false);
  assert.match(result.limitations.join(' '), /Bukan diagnosis/);
  const validFlag = validateAssessmentAnalysis({ session_summary: 'Anak meminta bantuan orang dewasa.',
    domains: [], strengths_observed: [], safety_review: { recommended: true, reason: 'Perlu diperiksa orang dewasa.', evidence_turns: [1] } }, messages, template);
  assert.equal(validFlag.safety_review.recommended, true);
  assert.deepEqual(validFlag.safety_review.evidence_turns, [1]);
});

test('impresi sementara membutuhkan bukti anak, mempertahankan kontra dan alternatif, serta menolak kepastian palsu', () => {
  const messages = [
    { position: 1, role: 'user', content: 'Aku sering susah fokus saat tugas panjang.' },
    { position: 2, role: 'assistant', content: 'Kapan terasa lebih mudah?' },
    { position: 3, role: 'user', content: 'Kalau menggambar aku bisa fokus lama.' },
  ];
  const hypothesis = { label: 'Kesulitan perhatian dalam tugas sekolah', status: 'possible',
    rationale: 'Laporan anak menunjukkan kesulitan pada tugas panjang, tetapi kemampuan fokus dapat muncul saat menggambar.',
    supporting_evidence: [{ evidence_turns: [1, 3] }], counter_evidence: [{ evidence_turns: [3] }],
    missing_information: ['Informasi orang tua dan guru tentang situasi lain'],
    alternative_explanations: ['Kelelahan', 'Minat pada tugas'], professional_verification_required: false };
  const input = { session_summary: 'Anak bercerita tentang tugas sekolah.', verification_status: 'PROFESSIONAL_CONFIRMED',
    overall_impression: 'Temuan sesi dapat konsisten dengan tantangan perhatian yang masih perlu ditelaah.',
    observed_patterns: ['Tugas panjang terasa sulit.'], working_hypotheses: [hypothesis], domains: [], strengths_observed: [],
    safety_review: { recommended: false, evidence_turns: [] } };
  const strong = validateAssessmentAnalysis(input, messages, template);
  assert.equal(strong.working_hypotheses[0].status, 'possible');
  assert.deepEqual(strong.working_hypotheses[0].supporting_evidence[0].evidence_turns, [1, 3]);
  assert.equal(strong.working_hypotheses[0].supporting_evidence[0].excerpts[0], messages[0].content);
  assert.deepEqual(strong.working_hypotheses[0].counter_evidence[0].evidence_turns, [3]);
  assert.deepEqual(strong.working_hypotheses[0].alternative_explanations, ['Kelelahan', 'Minat pada tugas']);
  assert.equal(strong.working_hypotheses[0].professional_verification_required, true);
  assert.equal('verification_status' in strong, false);
  assert.equal(strong.information_sources.teacher_information, 'Belum tersedia.');
  assert.equal(draftReport(strong, { created_at: new Date().toISOString(), planned_duration_minutes: 5,
    template_snapshot: template, template_version: 1 }, { display_name: 'Bimo' }).verification_status, 'AI_PRELIMINARY');
  const weak = validateAssessmentAnalysis({ ...input, working_hypotheses: [
    { ...hypothesis, supporting_evidence: [{ evidence_turns: [1, 2, 999] }] },
    { ...hypothesis, label: 'Tanpa bukti', supporting_evidence: [{ evidence_turns: [2] }] },
    { ...hypothesis, label: 'Anak pasti mengalami ADHD.' },
  ] }, messages, template);
  assert.equal(weak.working_hypotheses.length, 1);
  assert.equal(weak.working_hypotheses[0].status, 'insufficient_evidence');
  assert.deepEqual(weak.working_hypotheses[0].supporting_evidence[0].evidence_turns, [1]);
  assert.equal(validateAssessmentAnalysis({ ...input, overall_impression: 'Diagnosis anak adalah ADHD.', working_hypotheses: [] }, messages, template)
    .overall_impression, 'Belum cukup data untuk membentuk hipotesis spesifik.');
});

test('persetujuan per anak diwajibkan sebelum sesi; retry memproses transkrip lama sekali dan laporan direvisi', async () => {
  const store = fakeStore(); let analyzes = 0; let tavusCreates = 0;
  const service = makeAssessmentService({ store, subjects, analyze: async () => {
    analyzes++;
    return { session_summary: 'Bimo suka menggambar.', domains: [{ domain: 'sekolah', coverage: 'explored', observations: [{ text: 'Bimo suka menggambar.', evidence_turns: [1] }] }],
      strengths_observed: [], interests: ['menggambar'], open_questions: [], follow_up_topics: ['Cerita gambar berikutnya'],
      safety_review: { recommended: false, reason: null, evidence_turns: [] }, limitations: ['Bukan diagnosis.'] };
  } });
  await assert.rejects(service.prepare({ subjectId: childA, templateId }), (error) => error.code === 'CONSENT_REQUIRED');
  await service.giveConsent({ subjectId: childA, actor: 'Wali Bimo', accepted: true });
  assert.equal((await service.consentStatus(childB)).consented, false);
  const prepared = await service.prepare({ subjectId: childA, templateId, professionalNote: 'Jangan ditampilkan kepada anak' });
  assert.equal(prepared.includeNote, false);
  const started = await service.recordStarted('c-test', { subjectId: childA, ...prepared, durationMinutes: 5 });
  await assert.rejects(service.recordStarted('c-test', { subjectId: childB, ...prepared, durationMinutes: 5 }),
    (error) => error.code === 'SESSION_NOT_FOUND');
  assert.equal((await service.childProfile(childB)).sessions.length, 0);
  assert.equal(store.tables.assessment_sessions.length, 1);
  assert.equal(store.tables.assessment_sessions[0].template_version, 1);
  await service.process(started.id, { processConversation: async () => { tavusCreates++; } });
  await service.process(started.id, { processConversation: async () => { tavusCreates++; } });
  assert.equal(tavusCreates, 0);
  assert.equal(analyzes, 1);
  assert.equal(store.tables.assessment_analyses.length, 1);
  assert.equal(store.tables.assessment_analyses[0].analysis_model, 'gemini-2.5-flash');
  assert.equal(store.tables.assessment_reports.length, 1);
  const detail = await service.detail(started.id);
  assert.equal(detail.transcript[0].content, 'Aku suka belajar menggambar.');
  assert.match(detail.report.content.disclaimer, /bukan diagnosis/);
  await assert.rejects(service.saveReport(started.id, { version: 1, status: 'final', content: {}, professionalNotes: '' }),
    (error) => error.code === 'REVIEW_REQUIRED');
  const reviewed = await service.saveReport(started.id, { version: 1, status: 'reviewed', content: {}, professionalNotes: 'Ditinjau wali.' });
  assert.equal(reviewed.status, 'reviewed');
  assert.equal(store.tables.assessment_report_revisions.length, 1);
  await assert.rejects(service.saveReport(started.id, { version: 1, status: 'final', content: {}, professionalNotes: '' }),
    (error) => error.code === 'REPORT_CONFLICT');
  const pdf = await renderAssessmentPdf(await service.detail(started.id));
  assert.equal(pdf.subarray(0, 4).toString(), '%PDF');
  assert.ok(pdf.length > 1000);
  const final = await service.saveReport(started.id, { version: 2, status: 'final', content: {}, professionalNotes: 'Ditinjau wali.' });
  assert.equal(final.status, 'final');
  const edited = await service.saveReport(started.id, { version: 3, status: 'final', content: { summary: 'Ringkasan dikoreksi.' }, professionalNotes: 'Ditinjau wali.' });
  assert.equal(edited.status, 'draft');
  assert.equal(store.tables.assessment_report_revisions.length, 3);
});

test('reviewer dapat menerima, merevisi, menolak, dan menandai bukti kurang tanpa mengubah sitasi; konfirmasi hanya eksplisit', async () => {
  const store = fakeStore();
  store.tables.conversation_messages.push({ id: randomUUID(), session_id: conversationId, position: 3,
    role: 'user', content: 'Kalau menggambar aku fokus lama.' });
  const analysis = validateAssessmentAnalysis({ session_summary: 'Anak menceritakan tugas.',
    overall_impression: 'Perlu menelaah pengalaman belajar lebih lanjut.', observed_patterns: ['Tugas panjang terasa sulit.'],
    working_hypotheses: [{ label: 'Kesulitan perhatian pada tugas tertentu', status: 'possible',
      rationale: 'Anak melaporkan kesulitan pada tugas tertentu.', supporting_evidence: [{ evidence_turns: [1, 3] }],
      counter_evidence: [{ evidence_turns: [3] }], missing_information: ['Informasi guru'],
      alternative_explanations: ['Minat pada tugas'], professional_verification_required: true }],
    domains: [], strengths_observed: [], safety_review: { recommended: false, evidence_turns: [] } },
  store.tables.conversation_messages, template);
  const service = makeAssessmentService({ store, subjects, analyze: async () => analysis });
  await service.giveConsent({ subjectId: childA, actor: 'Wali', accepted: true });
  const prepared = await service.prepare({ subjectId: childA, templateId });
  const started = await service.recordStarted('c-test', { subjectId: childA, ...prepared, durationMinutes: 5 });
  await service.process(started.id);
  let detail = await service.detail(started.id);
  assert.equal(detail.report.content.verification_status, 'AI_PRELIMINARY');
  assert.match(verificationBanner(detail), /BELUM DIVERIFIKASI PROFESIONAL/);
  const preliminaryPdf = await renderAssessmentPdf(detail);
  assert.equal(preliminaryPdf.subarray(0, 4).toString(), '%PDF');
  const original = detail.report.content.working_hypotheses[0];
  const withDecision = (decision, extra = {}) => ({ ...original,
    professional_review: { decision, note: 'Ditelaah reviewer.', revised_label: '', revised_rationale: '', ...extra } });
  await assert.rejects(service.saveReport(started.id, { version: 1, status: 'reviewed', content: {
    verification_status: 'PROFESSIONAL_CONFIRMED', working_hypotheses: [{ ...original, supporting_evidence: [] }] }, professionalNotes: '' }),
  (error) => error.code === 'EVIDENCE_INVALID');
  const accepted = await service.saveReport(started.id, { version: 1, status: 'reviewed',
    content: { verification_status: 'PROFESSIONAL_CONFIRMED', working_hypotheses: [withDecision('accept_for_assessment')] },
    professionalNotes: '' });
  assert.equal(accepted.content.verification_status, 'PROFESSIONAL_REVIEWED');
  assert.match(verificationBanner(await service.detail(started.id)), /Telah Ditinjau Profesional/);
  const revised = await service.saveReport(started.id, { version: 2, status: 'reviewed', content: {
    working_hypotheses: [withDecision('revise', { revised_label: 'Pola belajar yang perlu ditelaah',
      revised_rationale: 'Perlu data tambahan dari rumah dan sekolah.' })] }, professionalNotes: '' });
  assert.equal(revised.content.verification_status, 'PROFESSIONAL_REVISED');
  const rejected = await service.saveReport(started.id, { version: 3, status: 'reviewed',
    content: { working_hypotheses: [withDecision('reject')] }, professionalNotes: '' });
  assert.equal(rejected.content.working_hypotheses[0].professional_review.decision, 'reject');
  const insufficient = await service.saveReport(started.id, { version: 4, status: 'reviewed',
    content: { working_hypotheses: [withDecision('insufficient_evidence')] }, professionalNotes: '' });
  assert.equal(insufficient.content.working_hypotheses[0].professional_review.decision, 'insufficient_evidence');
  await assert.rejects(service.saveReport(started.id, { version: 5, status: 'reviewed', confirmProfessional: true,
    content: {}, professionalNotes: '' }), (error) => error.code === 'REVIEW_REQUIRED');
  const final = await service.saveReport(started.id, { version: 5, status: 'final', confirmProfessional: true,
    content: {}, professionalNotes: '' });
  assert.equal(final.content.verification_status, 'PROFESSIONAL_CONFIRMED');
  assert.equal(final.content.working_hypotheses[0].professional_review.decision, 'insufficient_evidence');
  detail = await service.detail(started.id);
  assert.match(verificationBanner(detail), /Dikonfirmasi/);
  assert.equal((await renderAssessmentPdf(detail)).subarray(0, 4).toString(), '%PDF');
  const reopened = await service.saveReport(started.id, { version: 6, status: 'final',
    content: { conclusion: 'Kesimpulan dikoreksi oleh profesional.' }, professionalNotes: '' });
  assert.equal(reopened.status, 'draft');
  assert.equal(reopened.content.verification_status, 'AI_PRELIMINARY');
});

test('transkrip kosong menahan draf dan kesalahan analisis dapat dicoba ulang tanpa sesi baru', async () => {
  const store = fakeStore();
  store.tables.conversation_messages = [];
  let analysisCalls = 0;
  const service = makeAssessmentService({ store, subjects, analyze: async () => { analysisCalls++; throw new Error('ASSESSMENT_ANALYSIS_INVALID'); } });
  await service.giveConsent({ subjectId: childA, actor: 'Wali Bimo', accepted: true });
  const prepared = await service.prepare({ subjectId: childA, templateId });
  const started = await service.recordStarted('c-test', { subjectId: childA, ...prepared, durationMinutes: 5 });
  assert.deepEqual(await service.process(started.id), { status: 'analysis_failed', sessionId: started.id });
  assert.equal(analysisCalls, 0);
  assert.equal(store.tables.assessment_reports.length, 0);
  store.tables.conversation_messages.push({ session_id: conversationId, position: 1, role: 'user', content: 'Aku suka sekolah.' });
  assert.deepEqual(await service.process(started.id), { status: 'analysis_failed', sessionId: started.id });
  assert.equal(analysisCalls, 1);
  assert.equal(store.tables.assessment_reports.length, 0);
});

test('hapus sesi dan profil memerlukan frasa kuat dan RPC bertarget', async () => {
  const store = fakeStore(); const calls = [];
  store.rpc = async (name, body) => { calls.push({ name, body }); return true; };
  const service = makeAssessmentService({ store, subjects });
  await service.giveConsent({ subjectId: childA, actor: 'Wali Bimo', accepted: true });
  const prepared = await service.prepare({ subjectId: childA, templateId });
  const started = await service.recordStarted('c-test', { subjectId: childA, ...prepared, durationMinutes: 5 });
  await assert.rejects(service.deleteSession(started.id, 'hapus'), (error) => error.code === 'CONFIRMATION_REQUIRED');
  await assert.rejects(service.deleteChild(childA, 'hapus'), (error) => error.code === 'CONFIRMATION_REQUIRED');
  assert.equal(calls.length, 0);
  await service.deleteSession(started.id, 'HAPUS SESI');
  await service.deleteChild(childA, 'HAPUS PROFIL DAN DATA');
  assert.deepEqual(calls.map((call) => call.name), ['naya_delete_assessment_session','naya_delete_child_profile']);
  assert.equal(calls[0].body.p_session_id, started.id);
  assert.equal(calls[1].body.p_subject_id, childA);
});

test('migrasi dan UI menjaga isolasi, akses, PWA, dan free chat', async () => {
  const root = new URL('../', import.meta.url);
  const file = (name) => readFile(new URL(name, root), 'utf8');
  const [sql, deletion, vercel, sw, app, dashboard, api] = await Promise.all([
    file('supabase/migrations/005_dr_paws_assessment.sql'), file('supabase/migrations/006_dr_paws_assessment_deletion.sql'), file('vercel.json'), file('app/frontend/sw.js'),
    file('app/frontend/app.js'), file('app/frontend/dashboard.html'), file('api/handler.js'),
  ]);
  assert.equal((sql.match(/\('(?:perkenalan-minat|emosi-hari-ini|sekolah-belajar|teman-interaksi|keluarga-rutinitas|follow-up|observasi-umum)'/g) || []).length, 7);
  assert.match(sql, /enable row level security/);
  assert.match(sql, /revoke all.*anon, authenticated/s);
  assert.doesNotMatch(sql, /drop table|delete from|truncate/i);
  assert.match(deletion, /create or replace function public\.naya_delete_assessment_session/);
  assert.match(deletion, /revoke all on function public\.naya_delete_child_profile/);
  assert.match(deletion, /p_confirmation is distinct from 'HAPUS PROFIL DAN DATA'/);
  assert.match(vercel, /dr-paws\/dashboard/);
  assert.match(sw, /startsWith\('\/dr-paws\/dashboard'\)/);
  assert.match(app, /assessmentTemplateId: assessmentSetup\.templateId/);
  assert.match(dashboard, /Lanjut ke ruang Dr\. Paws/);
  assert.match(api, /if \(!accessCode\) throw new AssessmentError\('PROFESSIONAL_ACCESS_UNAVAILABLE'/);
  assert.match(api, /assessment \? buildInterviewContext\(memoryContext/);
  assert.match(api, /: memoryContext/);
  assert.equal(REPORT_DISCLAIMER.includes('bukan diagnosis'), true);
});

test('API profesional menolak akses tanpa password dan origin silang, tanpa membocorkan credential', async () => {
  const store = fakeStore();
  const handler = createVercelHandler({ env: { NAYA_ACCESS_CODE: 'secret-for-test' }, store,
    activeProfileStore: { getActive: async () => 1 } });
  const invoke = async (method, route, { cookie, origin, body } = {}) => {
    const request = Readable.from(body ? [JSON.stringify(body)] : []);
    request.method = method; request.url = `/api/handler?route=assessment&action=${route}`;
    request.headers = { ...(cookie ? { cookie } : {}), ...(origin ? { origin, host: 'mynaia.test' } : {}) };
    const response = { writeHead(status, headers) { this.status = status; this.headers = headers; },
      end(value) { this.body = JSON.parse(String(value)); } };
    await handler(request, response); return response;
  };
  const denied = await invoke('GET', 'templates');
  assert.equal(denied.status, 401);
  const cookie = `naya_access=${sessionToken('secret-for-test')}`;
  const allowed = await invoke('GET', 'templates', { cookie });
  assert.equal(allowed.status, 200);
  assert.equal(allowed.body.templates.length, 1);
  assert.doesNotMatch(JSON.stringify(allowed.body), /secret-for-test/);
  const crossOrigin = await invoke('POST', 'template', { cookie, origin: 'https://attacker.example', body: {} });
  assert.equal(crossOrigin.status, 403);
  assert.equal(store.tables.assessment_templates.length, 1);
});
