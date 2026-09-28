import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { makeCaseService, caseEvidenceIndex } from '../app/backend/longitudinal.mjs';
import { validateLongitudinalAnalysis } from '../app/backend/longitudinal-analysis.mjs';
import { renderLongitudinalPdf } from '../app/backend/longitudinal-pdf.mjs';
import { createVercelHandler } from '../api/handler.js';
import { sessionToken } from '../app/backend/access-auth.mjs';
import { Readable } from 'node:stream';

const owner = 'naya_primary_user', child = randomUUID(), otherChild = randomUUID(), reviewerId = randomUUID();
const dates = ['2026-09-01T10:00:00Z','2026-09-10T10:00:00Z','2026-09-20T10:00:00Z'];
const sessions = dates.map((created_at, index) => ({ id: randomUUID(), subject_id: child, owner_user_id: owner,
  conversation_session_id: randomUUID(), template_snapshot: { name: `Sesi ${index + 1}` },
  status: 'reviewed', created_at, updated_at: created_at }));
const observations = ['Lebih suka bermain sendiri.','Mulai punya satu teman dekat.','Lebih nyaman bermain dengan teman dekat.'];
const analyses = sessions.map((session, index) => ({ session_id: session.id, owner_user_id: owner,
  result: { session_summary: observations[index], domains: [{ domain: 'teman', coverage: 'explored',
    observations: [{ text: observations[index], evidence_turns: [2] }] }], strengths_observed: [], safety_review: { recommended: false } } }));
const messages = sessions.map((session, index) => ({ session_id: session.conversation_session_id, position: 2,
  role: 'user', content: observations[index] }));
function storeFixture() {
  const tables = { assessment_sessions: structuredClone(sessions), assessment_analyses: structuredClone(analyses),
    assessment_reports: [], case_sources: [], case_audit: [], reviewers: [{ id: reviewerId, owner_user_id: owner,
      display_name: 'Rina', professional_role: 'Reviewer' }], longitudinal_analyses: [],
    longitudinal_reports: [], longitudinal_report_revisions: [], follow_up_plans: [],
    conversation_messages: structuredClone(messages), open_loops: [] };
  const match = (row, filters) => Object.entries(filters).every(([key, value]) => {
    if (key === 'order' || key === 'limit') return true;
    if (String(value).startsWith('eq.')) return String(row[key]) === String(value).slice(3);
    if (String(value).startsWith('in.(')) return String(value).slice(4,-1).split(',').includes(String(row[key]));
    return true;
  });
  const store = { tables,
    select: async (name, filters = {}) => {
      let rows = (tables[name] || []).filter((row) => match(row, filters));
      if (filters.order?.includes('desc')) rows = rows.toReversed();
      return structuredClone(filters.limit ? rows.slice(0, Number(filters.limit)) : rows);
    },
    upsert: async (name, value, conflict = 'id') => {
      const rows = tables[name] ||= [];
      for (const item of [value].flat()) { const index = rows.findIndex((row) => conflict.split(',').every((field) => row[field] === item[field]));
        if (index < 0) rows.push(structuredClone(item)); else rows[index] = { ...rows[index], ...structuredClone(item) }; }
      return [value];
    },
    update: async (name, filters, values) => {
      const rows = (tables[name] || []).filter((row) => match(row, filters)); rows.forEach((row) => Object.assign(row, structuredClone(values))); return rows;
    },
    rpc: async (name, body) => { if (name !== 'naya_delete_case_source') throw new Error('Unexpected RPC');
      tables.case_sources = tables.case_sources.filter((row) => row.id !== body.p_source_id);
      tables.longitudinal_analyses = []; tables.longitudinal_reports = []; tables.longitudinal_report_revisions = []; tables.follow_up_plans = [];
      tables.case_audit = tables.case_audit.filter((row) => row.entity_id !== body.p_source_id); return true; },
  };
  const subjects = { requireSubject: async (id) => {
    if (![child,otherChild].includes(id)) throw new Error('UNKNOWN_CHILD');
    return { id, display_name: id === child ? 'Anak A' : 'Anak B' };
  } };
  return { store, subjects };
}

test('tiga sesi dan tiga sumber tetap terpisah per anak; drill-down menunjuk rekaman asli', async () => {
  const { store, subjects } = storeFixture(); const service = makeCaseService({ store, subjects });
  const inputs = [
    { sourceType: 'PARENT', sourceName: 'Ibu', answers: { social_interaction: 'Di rumah ada satu teman bermain.', attention_during_activities: 'Tidak ada keluhan perhatian.' } },
    { sourceType: 'TEACHER', sourceName: 'Bu Guru', answers: { peer_interaction: 'Aktif pada kelompok kecil, enggan pada kelompok besar.', response_to_instruction: 'Sering perlu pengulangan instruksi.' } },
    { sourceType: 'PROFESSIONAL', sourceName: 'Rina', answers: { observation: 'Anak tampak lebih nyaman setelah sesi kedua.', strengths: 'Suka menggambar.' } },
  ];
  for (const input of inputs) await service.createSource(child, { ...input, reviewerId, observedAt: '2026-09-21' });
  const view = await service.caseView(child), other = await service.caseView(otherChild);
  assert.equal(view.sessionCount, 3); assert.equal(view.sources.length, 3);
  assert.equal(other.sessionCount, 0); assert.equal(other.sources.length, 0); assert.equal(other.timeline.length, 0);
  assert.equal(view.sourceCoverage.CHILD, true); assert.equal(view.sourceCoverage.TEACHER, true);
  assert.equal(view.domainMatrix.teman[sessions[0].id], 'explored');
  const evidence = caseEvidenceIndex(sessions, analyses, view.sources);
  const turn = await service.evidence(child, `t:${sessions[1].id}:2`);
  assert.equal(turn.excerpt, observations[1]); assert.equal(turn.speaker, 'Anak');
  const sourceRef = evidence.find((item) => item.source_type === 'TEACHER').ref;
  assert.match((await service.evidence(child, sourceRef)).excerpt, /kelompok/);
  await assert.rejects(service.evidence(otherChild, sourceRef), (error) => error.code === 'EVIDENCE_NOT_FOUND');
  assert.equal(store.tables.case_audit.filter((row) => row.action === 'SOURCE_ADDED').length, 3);
});

test('validator menahan pola satu sesi, klaim pasti, referensi palsu, dan perubahan waktu terbalik', () => {
  const refs = [{ ref: `t:${sessions[0].id}:2`, source_type:'CHILD', session_id:sessions[0].id, date:dates[0] },
    { ref: `t:${sessions[2].id}:2`, source_type:'CHILD', session_id:sessions[2].id, date:dates[2] },
    { ref: `s:${randomUUID()}:peer_interaction`, source_type:'TEACHER', source_id:randomUUID(), date:dates[2] }];
  const result = validateLongitudinalAnalysis({ summary:'Konteks perlu ditelaah.', patterns:[
    { title:'Hanya satu sesi', description:'Preferensi bermain.', status:'REPEATED', supporting_refs:[refs[0].ref], counter_refs:[] },
    { title:'Bermain tergantung konteks', description:'Bermain dengan satu teman dan kelompok kecil.', status:'REPEATED',
      supporting_refs:[refs[0].ref,refs[1].ref,refs[2].ref], counter_refs:[] },
    { title:'Pasti ADHD 74%', description:'Pasti mengalami gangguan.', status:'REPEATED', supporting_refs:[refs[0].ref], counter_refs:[] },
    { title:'Bukti palsu', description:'Tanpa sumber.', status:'EMERGING', supporting_refs:['s:unknown:field'], counter_refs:[] }],
    changes:[{description:'Semakin nyaman.',earlier_refs:[refs[0].ref],later_refs:[refs[1].ref]},
      {description:'Waktu terbalik.',earlier_refs:[refs[1].ref],later_refs:[refs[0].ref]}],
    strengths:[], contradictions:[{description:'Konteks rumah dan kelas berbeda.', evidence_refs:[refs[0].ref,refs[2].ref]}],
    current_working_hypotheses:[{label:'Kemungkinan perlu telaah',rationale:'Masih perlu bukti.',supporting_refs:[refs[0].ref],counter_refs:[],missing_information:['Orang tua'],alternative_explanations:['Konteks']}],
    missing_information:['Informasi orang tua'],recommended_follow_up:['Bahas kegiatan bersama teman.'] }, refs);
  assert.equal(result.patterns.length, 2); assert.equal(result.patterns[0].status,'INSUFFICIENT_DATA');
  assert.equal(result.patterns[1].evidence_strength,'MULTIPLE_SUPPORTING_SOURCES');
  assert.equal(result.changes.length,1); assert.equal(result.contradictions.length,1);
  assert.equal(result.current_working_hypotheses[0].status,'NEW');
  assert.equal(result.verification_status,'AI_PRELIMINARY');
});

test('refresh idempoten, review manusia tercatat, PDF hanya reviewed/final, planner tanpa Tavus', async () => {
  const { store, subjects } = storeFixture(); let calls = 0;
  const analyze = async (entries) => { calls++; const ref = entries[0].ref; return validateLongitudinalAnalysis({
    summary:'Preferensi bermain berubah antar sesi.',patterns:[{title:'Interaksi sosial',description:'Perlu data lintas konteks.',
      status:'EMERGING',supporting_refs:[ref],counter_refs:[]}],changes:[],strengths:[],contradictions:[],
    current_working_hypotheses:[{label:'Perlu telaah interaksi',rationale:'Data awal terbatas.',supporting_refs:[ref],counter_refs:[],
      missing_information:['Orang tua'],alternative_explanations:['Situasi sekolah']}],
    missing_information:['Laporan guru'],recommended_follow_up:['Tanya kegiatan bersama teman.'] }, entries); };
  const service = makeCaseService({ store, subjects, analyze });
  const first = await service.refreshAnalysis(child,{reviewerId});
  assert.equal(first.unchanged,false); assert.equal((await service.refreshAnalysis(child,{reviewerId})).unchanged,true);
  assert.equal(calls,1); assert.equal(store.tables.longitudinal_reports.length,1);
  await assert.rejects(renderLongitudinalPdf(await service.reportDetail(child)), (error) => error.code === 'REPORT_NOT_REVIEWED');
  await service.reviewHypothesis(child,{reviewerId,version:1,index:0,action:'ACCEPT_FOR_ASSESSMENT',note:'Perlu data tambahan.'});
  assert.equal(store.tables.longitudinal_reports[0].content.verification_status,'AI_PRELIMINARY');
  assert.equal(store.tables.case_audit.at(-1).reviewer_id, reviewerId);
  const reviewed = await service.saveReport(child,{reviewerId,version:2,status:'reviewed',interpretation:'Perlu eksplorasi lanjut.',professionalNotes:'Belum diagnosis.'});
  assert.equal(reviewed.status,'reviewed');
  const pdf = await renderLongitudinalPdf(await service.reportDetail(child));
  assert.equal(pdf.subarray(0,4).toString(),'%PDF');
  const plan = await service.createPlan(child,{reviewerId,goals:['Tanya kegiatan bersama teman.']});
  assert.deepEqual(plan.goals,['Tanya kegiatan bersama teman.']);
  assert.equal(store.tables.follow_up_plans.length,1);
  assert.ok(store.tables.longitudinal_report_revisions.length >= 2);
});

test('hapus sumber memerlukan konfirmasi dan membersihkan hasil turunan; review keselamatan tercatat', async () => {
  const { store, subjects } = storeFixture();
  store.tables.assessment_analyses[0].result.safety_review = { recommended:true, reason:'Perlu diperiksa orang dewasa.', evidence_turns:[2] };
  const service = makeCaseService({ store, subjects });
  const source = await service.createSource(child,{ reviewerId, sourceType:'PARENT', sourceName:'Wali', observedAt:'2026-09-22',
    answers:{social_interaction:'Lebih nyaman di rumah.'} });
  assert.equal((await service.caseView(child)).safetyHistory[0].status,'PENDING_REVIEW');
  await service.reviewSafety(child,{ reviewerId, sessionId:sessions[0].id, status:'FOLLOW_UP_REQUIRED', note:'Hubungi wali untuk tinjauan.' });
  const flag = (await service.caseView(child)).safetyHistory[0];
  assert.equal(flag.status,'FOLLOW_UP_REQUIRED'); assert.equal(flag.reviewed_by,reviewerId);
  await assert.rejects(service.deleteSource(child,source.id,{reviewerId}), (error)=>error.code==='CONFIRMATION_REQUIRED');
  await service.deleteSource(child,source.id,{reviewerId,confirmation:'HAPUS SUMBER'});
  assert.equal(store.tables.case_sources.length,0); assert.equal(store.tables.follow_up_plans.length,0);
  await assert.rejects(service.evidence(child,`s:${source.id}:social_interaction`),(error)=>error.code==='EVIDENCE_NOT_FOUND');
});

test('migrasi, route, cache, dan frontend melindungi data kasus tanpa menyentuh Naia', async () => {
  const read = (name) => readFile(new URL(name, import.meta.url),'utf8');
  const [migration, vercel, worker, handler, dashboard, frontend] = await Promise.all([
    read('../supabase/migrations/008_dr_paws_longitudinal.sql'),read('../vercel.json'),read('../app/frontend/sw.js'),
    read('../api/handler.js'),read('../app/frontend/dashboard.js'),read('../app/frontend/case.js')]);
  assert.match(migration,/enable row level security/); assert.match(migration,/naya_delete_case_source/);
  assert.match(vercel,/dr-paws\/dashboard\/subjects/); assert.match(handler,/requireAccess|authorized/);
  assert.match(worker,/dr-paws\/dashboard|\/api\//); assert.match(dashboard,/Data belum berhasil dimuat/);
  assert.match(frontend,/followUpGoals/);
  assert.doesNotMatch(frontend,/api\/conversation\/start/);
});

test('API kasus menolak pembaca tanpa login dan POST dari Origin silang', async () => {
  const { store } = storeFixture();
  const handler = createVercelHandler({ env:{NAYA_ACCESS_CODE:'test-only-password'}, store,
    activeProfileStore:{getActive:async()=>1} });
  const invoke = async (method, action, {cookie,origin,body}={}) => {
    const request = Readable.from(body ? [JSON.stringify(body)] : []);
    request.method=method; request.url=`/api/handler?route=case&action=${action}`;
    request.headers={...(cookie?{cookie}:{}),...(origin?{origin,host:'mynaia.test'}:{})};
    const response={ writeHead(status,headers){this.status=status;this.headers=headers;},
      end(value){this.body=JSON.parse(String(value));} };
    await handler(request,response); return response;
  };
  const denied=await invoke('GET','reviewers'); assert.equal(denied.status,401);
  const cookie=`naya_access=${sessionToken('test-only-password')}`;
  const allowed=await invoke('GET','reviewers',{cookie}); assert.equal(allowed.status,200);
  assert.equal(allowed.body.reviewers.length,1); assert.doesNotMatch(JSON.stringify(allowed.body),/test-only-password/);
  const cross=await invoke('POST','reviewer',{cookie,origin:'https://attacker.example',body:{displayName:'Fake',professionalRole:'Reviewer'}});
  assert.equal(cross.status,403); assert.equal(store.tables.reviewers.length,1);
});
