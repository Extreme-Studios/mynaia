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
      transcript: [{ position: 1, role: 'user', content: 'Aku suka menggambar.', seconds_from_start: 12 },
        { position: 2, role: 'assistant', content: 'Wah, apa yang kamu gambar?', seconds_from_start: 14 }],
      analysis: { result: { session_summary: 'Anak bercerita tentang kegiatan menggambar.', domains: [{ domain: 'sekolah', coverage: 'partial',
        observations: [{ text: 'Anak menyebut suka menggambar.', evidence_turns: [1] }] }], safety_review: { recommended: false } } },
      report: { status: 'draft', version: 1, professional_notes: '', content: { purpose: template.purpose, summary: 'Anak bercerita tentang kegiatan menggambar.',
        observations: [{ domain: 'sekolah', text: 'Anak menyebut suka menggambar.', evidence_turns: [1] }],
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
  const name = url.pathname === '/dr-paws/dashboard' ? 'dashboard.html' :
    ['/', '/naia', '/naya', '/dr-paws'].includes(url.pathname) ? 'index.html' : url.pathname.slice(1);
  if (!/^(?:[a-zA-Z0-9._/-]+)$/.test(name) || name.includes('..')) { response.writeHead(400); response.end(); return; }
  try {
    const body = await readFile(join(publicDir, name));
    response.writeHead(200, { 'content-type': mime[extname(name)] || 'text/html', 'cache-control': 'no-store' });
    response.end(body);
  } catch { response.writeHead(404); response.end(); }
}).listen(Number(process.env.PORT || 3002), '127.0.0.1', () => console.log('Visual QA server ready'));
