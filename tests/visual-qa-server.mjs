// Local-only visual harness. It never calls the production API or Tavus.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, resolve, extname } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const publicDir = join(root, 'public');
const mime = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.json': 'application/json', '.mp4': 'video/mp4', '.webm': 'video/webm', '.webmanifest': 'application/manifest+json' };

createServer(async (request, response) => {
  const url = new URL(request.url, 'http://localhost');
  if (url.pathname === '/api/access/status') {
    response.writeHead(200, { 'content-type': 'application/json' }); response.end('{"required":false,"authorized":true}'); return;
  }
  if (url.pathname === '/api/modes/status') {
    response.writeHead(200, { 'content-type': 'application/json' }); response.end('{"naya":true,"drPaws":true}'); return;
  }
  if (url.pathname === '/api/dr-paws/subjects') {
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ subjects: [{ id: '00000000-0000-4000-8000-000000000001', display_name: 'Profil demo', nickname: 'Demo' }] })); return;
  }
  if (url.pathname === '/api/dr-paws/case') {
    const childId = '00000000-0000-4000-8000-000000000001';
    const sessionId = '00000000-0000-4000-8000-000000000002';
    const reviewer = { id:'00000000-0000-4000-8000-000000000004', display_name:'Reviewer demo', professional_role:'Reviewer' };
    const reference = `t:${sessionId}:1`;
    const finding = { label:'Interaksi sosial perlu ditelaah', status:'NEW', rationale:'Konteks rumah dan sekolah berbeda.',
      evidence_strength:'MIXED_EVIDENCE', supporting_refs:[reference], counter_refs:[],
      missing_information:['Keterangan guru tambahan'], alternative_explanations:['Situasi kelas'], review:null };
    const result = { summary:'Dalam tiga sesi, anak mulai lebih nyaman bercerita. Pengamatan lintas konteks belum lengkap.',
      patterns:[{title:'Interaksi teman',status:'REPEATED',evidence_strength:'MIXED_EVIDENCE',
        description:'Anak merasa lebih nyaman dengan satu teman; guru melaporkan kelompok kecil berjalan lebih baik.',
        supporting_refs:[reference],counter_refs:[]}], changes:[{description:'Anak lebih terbuka dari sesi pertama ke ketiga.',
        earlier_refs:[reference],later_refs:[reference]}], strengths:[{text:'Senang menggambar.',evidence_refs:[reference]}],
      contradictions:[{description:'Keterangan rumah dan kelas berbeda dalam konteks perhatian.',evidence_refs:[reference]}],
      current_working_hypotheses:[finding],missing_information:['Pengamatan kelas tambahan'],
      recommended_follow_up:['Jelajahi pengalaman anak bermain bersama teman.'] };
    const source = { id:'00000000-0000-4000-8000-000000000005',source_type:'PARENT',source_name:'Ibu demo',
      observed_at:'2026-09-25T10:00:00Z',answers:{strengths:'Suka menggambar.',social_interaction:'Ada satu teman dekat.'},notes:'',version:1 };
    const action = url.searchParams.get('action');
    const responseBody = action === 'reviewers' ? { reviewers:[reviewer] } : action === 'case' ? {
      child:{id:childId,display_name:'Profil demo'},sessionCount:3,latestSession:{created_at:'2026-09-28T09:00:00Z'},
      timeline:[{kind:'session',id:sessionId,date:'2026-09-28T09:00:00Z',source:'Dr. Paws',status:'reviewed',title:'Sekolah & Belajar',summary:'Mulai lebih terbuka.'},
        {kind:'source',date:source.observed_at,source:'PARENT',status:'tercatat',title:'Ibu demo',summary:'Ada satu teman dekat.'}],
      sources:[source],sourceCoverage:{CHILD:true,PARENT:true,TEACHER:false,PROFESSIONAL:false},
      domainMatrix:{teman:{[sessionId]:'explored'}},openQuestions:[],analysis:{version:1,generated_at:'2026-09-28T10:00:00Z',result},
      analysisStale:false,caseSummary:{strengths:result.strengths,patterns:result.patterns,hypotheses:[finding],changes:result.changes,
        missing:result.missing_information,nextAction:result.recommended_follow_up},
      plans:[],report:{version:1,status:'draft',professional_notes:'',content:{...result,verification_status:'AI_PRELIMINARY'}},
      reviewers:[reviewer],hypothesisHistory:[],safetyHistory:[] } : null;
    response.writeHead(responseBody ? 200 : 404, { 'content-type':'application/json','cache-control':'no-store' });
    response.end(JSON.stringify(responseBody || {error:'Not found'})); return;
  }
  if (url.pathname === '/api/dr-paws/assessment') {
    const subjectId = '00000000-0000-4000-8000-000000000001';
    const sessionId = '00000000-0000-4000-8000-000000000002';
    const templateId = '00000000-0000-4000-8000-000000000003';
    const template = { id: templateId, name: 'Sekolah & Belajar', purpose: 'Mendengarkan pengalaman di sekolah.', version: 1,
      domains: [{ domain: 'sekolah', goal: 'Dengarkan kegiatan sekolah yang disukai.' }] };
    const session = { id: sessionId, subject_id: subjectId, template_snapshot: template, template_version: 1,
      planned_duration_minutes: 5, status: 'draft', created_at: '2026-09-28T09:00:00Z', child_name: 'Profil demo', report_status: 'draft',
      summary: 'Anak bercerita tentang kegiatan menggambar.' };
    const record = { session, subject: { id: subjectId, display_name: 'Profil demo' },
      conversation: { started_at: session.created_at, ended_at: '2026-09-28T09:05:00Z', transcript_status: 'ready', memory_status: 'ready' },
      transcript: [{ position: 1, role: 'user', content: 'Tugas panjang terasa sulit buatku.', seconds_from_start: 12 },
        { position: 2, role: 'assistant', content: 'Kapan terasa lebih mudah?', seconds_from_start: 14 },
        { position: 3, role: 'user', content: 'Kalau menggambar aku bisa fokus lama.', seconds_from_start: 19 }],
      analysis: { result: { session_summary: 'Anak bercerita tentang kegiatan sekolah dan menggambar.',
        overall_impression: 'Perlu menelaah pengalaman belajar lebih lanjut; satu percakapan belum cukup untuk menyimpulkan kondisi klinis.',
        observed_patterns: ['Tugas panjang dilaporkan sulit, menggambar terasa lebih mudah.'],
        working_hypotheses: [{ label: 'Kesulitan perhatian pada tugas tertentu', status: 'possible',
          rationale: 'Anak melaporkan perbedaan pengalaman menurut jenis tugas.',
          supporting_evidence: [{ evidence_turns: [1, 3], excerpts: ['Tugas panjang terasa sulit buatku.', 'Kalau menggambar aku bisa fokus lama.'] }],
          counter_evidence: [{ evidence_turns: [3], excerpts: ['Kalau menggambar aku bisa fokus lama.'] }],
          missing_information: ['Informasi orang tua dan guru'], alternative_explanations: ['Kelelahan', 'Minat pada tugas'] }],
        domains: [{ domain: 'sekolah', coverage: 'partial',
        observations: [{ text: 'Anak menyebut tugas panjang terasa sulit.', evidence_turns: [1] }] }], safety_review: { recommended: false } } },
      report: { status: 'draft', version: 1, professional_notes: '', content: { purpose: template.purpose, summary: 'Anak bercerita tentang kegiatan menggambar.',
        conclusion: 'Perlu menelaah pengalaman belajar lebih lanjut; satu percakapan belum cukup untuk menyimpulkan kondisi klinis.',
        patterns: ['Tugas panjang dilaporkan sulit, menggambar terasa lebih mudah.'],
        working_hypotheses: [{ label: 'Kesulitan perhatian pada tugas tertentu', status: 'possible',
          rationale: 'Anak melaporkan perbedaan pengalaman menurut jenis tugas.',
          supporting_evidence: [{ evidence_turns: [1, 3], excerpts: ['Tugas panjang terasa sulit buatku.', 'Kalau menggambar aku bisa fokus lama.'] }],
          counter_evidence: [{ evidence_turns: [3], excerpts: ['Kalau menggambar aku bisa fokus lama.'] }],
          missing_information: ['Informasi orang tua dan guru'], alternative_explanations: ['Kelelahan', 'Minat pada tugas'],
          professional_review: { decision: 'pending', note: '', revised_label: '', revised_rationale: '' } }],
        information_sources: { child_self_report: 'Ada: transkrip anak.', ai_conversation_observation: 'Ada: percakapan AI.',
          parent_information: 'Belum tersedia.', teacher_information: 'Belum tersedia.', professional_observation: 'Belum tersedia.' },
        verification_status: 'AI_PRELIMINARY',
        observations: [{ domain: 'sekolah', text: 'Anak menyebut tugas panjang terasa sulit.', evidence_turns: [1] }],
        insufficient: ['Pengalaman di kelas belum cukup tergali.'], follow_up: ['Kegiatan menggambar berikutnya.'],
        disclaimer: 'Hasil ini merupakan ringkasan berbasis percakapan dengan AI dan bukan diagnosis psikologis atau medis.' } }, revisions: [] };
    let result;
    switch (url.searchParams.get('action')) {
      case 'dashboard': result = { children: [{ id: subjectId, display_name: 'Profil demo' }], sessions: [session],
        counts: { children: 1, pending: 0, draft: 1, reviewed: 0 } }; break;
      case 'templates': result = { templates: [template] }; break;
      case 'consent': result = { consented: false, consentVersion: 'dr-paws-assessment-v1', record: null }; break;
      case 'child': result = { subject: record.subject, sessions: [session], summaries: [{ summary: session.summary, created_at: session.created_at }],
        open_topics: [{ content: 'Cerita gambar lain' }], free_chat_count: 1,
        consent: { consented: false, consentVersion: 'dr-paws-assessment-v1', record: null } }; break;
      case 'session': result = record; break;
      default: response.writeHead(404); response.end(); return;
    }
    response.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' }); response.end(JSON.stringify(result)); return;
  }
  if (url.pathname.startsWith('/api/')) { response.writeHead(404); response.end(); return; }
  if (url.pathname === '/qa') {
    const html = await readFile(join(publicDir, 'index.html'), 'utf8');
    const mock = `<script type="module">
      import { createCinematic } from '/cinematic.js';
      import { createHeroMedia } from '/hero-media.mjs';
      const params = new URLSearchParams(location.search);
      const state = params.get('state') || 'call';
      const mode = params.get('mode') || 'naya';
      const heroMedia=createHeroMedia({mode});
      document.body.classList.add('intro-complete');
      document.querySelector('#splash').hidden = true;
      document.querySelector('#access-gate').hidden = true;
      document.querySelector('#app').hidden = false;
      document.querySelector('#home').hidden = true;
      document.querySelector('#call-view').hidden = false;
      document.querySelector('#mode-title').textContent = mode === 'naya' ? 'Naia' : 'Dr. Paws';
      const cinematic = createCinematic({ route: state === 'home' ? '/' : mode === 'naya' ? '/naya' : '/dr-paws', rendererMode: params.get('renderer') || 'auto' });
      if (state === 'home') {
        document.querySelector('#home').hidden = false;
        document.querySelector('#call-view').hidden = true;
        cinematic.reveal();
      } else if (state === 'end') {
        document.querySelector('#room-layout').hidden = true;
        document.querySelector('#call-view .controls').hidden = true;
        document.querySelector('#precall').hidden = true;
        document.querySelector('#mic-hint').hidden = true;
        document.querySelector('#postcall').hidden = false;
      } else {
        cinematic.setCallActive(true);
        heroMedia.setCallActive(true);
        document.body.classList.add('call-active');
        document.querySelector('#call-view').classList.add('in-call');
        document.querySelector('#placeholder').hidden = true;
        document.querySelector('#precall').hidden = true;
        document.querySelector('#start').hidden = true;
        document.querySelector('#end').hidden = false;
        document.querySelector('#end').disabled = false;
        document.querySelector('#mic-help').hidden = false;
        document.querySelector('#self-view-toggle').hidden = false;
        document.querySelector('#call-settings').hidden = false;
        document.querySelector('#status-text').textContent = 'Ruang percakapan terbuka';
        document.querySelector('#self-view').hidden = false;
        document.querySelector('#room-layout').classList.add('has-self-view');
        document.querySelector('#self-view').insertAdjacentHTML('afterbegin','<div class="qa-self">KAMERA ANDA</div>');
        document.querySelector('#stage').insertAdjacentHTML('afterbegin','<div class="qa-avatar"><span>MOCK VIDEO AVATAR</span><strong>' + (mode === 'naya' ? 'Naia' : 'Dr. Paws') + '</strong></div>');
        if (state === 'fullscreen') {
          document.querySelector('#app').classList.add('app-fullscreen');
          document.querySelector('#exit-fullscreen').hidden = false;
        }
      }
    </script><style>
      .qa-avatar{position:absolute;inset:0;display:grid;place-content:center;text-align:center;background:radial-gradient(ellipse at 50% 30%,#27465b 0%,#0a1726 65%,#060c16);color:#d8e8ef;letter-spacing:.18em}
      .qa-avatar strong{display:block;font-size:clamp(4rem,9vw,10rem);font-weight:400;letter-spacing:-.08em;line-height:1;margin-top:20px;text-shadow:0 0 65px #96c9e880}
      .qa-avatar span{font-size:.65rem;color:#bcd4e0}
      .qa-self{position:absolute;inset:0;display:grid;place-items:center;background:#254051;color:#dcecf5;font-size:.65rem;letter-spacing:.12em}
    </style>`;
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
    response.end(html.replace(/<script type="module" src="\/app\.js\?v=\d+"><\/script>/, '').replace('</body>', mock + '</body>'));
    return;
  }
  const name = /^\/dr-paws\/dashboard\/subjects\/[^/]+$/.test(url.pathname) ? 'case.html' :
    url.pathname === '/dr-paws/dashboard' ? 'dashboard.html' :
    ['/', '/naia', '/naya', '/dr-paws'].includes(url.pathname) ? 'index.html' : url.pathname.slice(1);
  if (!/^(?:[a-zA-Z0-9._/-]+)$/.test(name) || name.includes('..')) { response.writeHead(400); response.end(); return; }
  try {
    const body = await readFile(join(publicDir, name));
    response.writeHead(200, { 'content-type': mime[extname(name)] || 'text/html', 'cache-control': 'no-store' });
    response.end(body);
  } catch { response.writeHead(404); response.end(); }
}).listen(Number(process.env.PORT || 3002), '127.0.0.1', () => console.log('Visual QA server ready'));
