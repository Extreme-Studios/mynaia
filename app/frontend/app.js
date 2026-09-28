import { createConversationController } from './controller.mjs';
import { createSelfView } from './self-view.mjs';
import { startProductMotion, animateVisible, setupPageTransitions } from './motion.mjs';

const $ = (selector) => document.querySelector(selector);
const mode = location.pathname === '/dr-paws' ? 'dr_paws' : 'naya';
const isHome = !['/naya', '/dr-paws'].includes(location.pathname);
const modeName = mode === 'naya' ? 'Naya' : 'Dr. Paws';
const modeReady = { naya: true, dr_paws: false };
startProductMotion();
setupPageTransitions();
let accessGranted = false;
let mountedUrl = '';
let activeId = '';
let durationTimer;
let statusTimer;
let statusChecking = false;
let wakeLock;
let fullscreenFallback = false;
let subjectId = '';
let room;
let selfViewMode;
try { selfViewMode = localStorage.getItem('mynaia.selfView') === 'hidden' ? 'hidden' : 'compact'; }
catch { selfViewMode = 'compact'; }

$('#home').hidden = !isHome;
$('#call-view').hidden = isHome;
$('#mode-title').textContent = modeName;
$('#settings-mode').textContent = isHome ? 'Beranda' : modeName;
$('#mode-badge').textContent = mode === 'naya' ? 'AI companion' : 'Teman cerita';
$('#avatar-mark').textContent = mode === 'naya' ? 'N' : '🐾';
$('#placeholder-description').textContent = mode === 'naya'
  ? 'Naya dapat mengingat hal-hal penting dari obrolan sebelumnya.' : 'Teman cerita yang ramah untuk anak. Pilih profil, lalu mulai saat siap.';
$('#placeholder-title').textContent = mode === 'naya' ? 'Siap ngobrol dengan Naya?' : 'Siap bercerita dengan Dr. Paws?';
$('#start').textContent = mode === 'naya' ? 'Mulai Ngobrol' : 'Mulai Cerita';
document.body.dataset.mode = mode;
document.title = isHome ? 'MyNaiA — Teman AI' : `${modeName} — MyNaiA`;
$('#subject-panel').hidden = mode !== 'dr_paws' || isHome;
$('#subject-manage').hidden = mode !== 'dr_paws' || isHome;
document.querySelector(`.primary-nav a[href="${location.pathname}"]`)?.setAttribute('aria-current', 'page');

function savedDuration() {
  try { const value = localStorage.getItem('mynaia.duration'); return ['3','5','10','20'].includes(value) ? value : '5'; }
  catch { return '5'; }
}
$('#duration').value = savedDuration();
$('#setting-duration').value = savedDuration();
$('#duration-warning').hidden = $('#duration').value !== '20';

function updateSelfViewControl() {
  const compact = selfViewMode === 'compact';
  $('#self-view-toggle').innerHTML = compact ? '◉ <span>Self View</span>' : '◌ <span>Self View</span>';
  $('#self-view-toggle').setAttribute('aria-pressed', String(compact));
  $('#self-view-toggle').setAttribute('aria-label', compact ? 'Sembunyikan preview kamera' : 'Tampilkan preview kamera');
  room?.setMode(selfViewMode);
}
updateSelfViewControl();

async function mountRoom(url, conversationId) {
  const { default: Daily } = await import('/daily-esm.js');
  if (controller.snapshot().session?.conversationId !== conversationId) return;
  room = createSelfView({ createFrame: Daily.createFrame.bind(Daily), container: $('#stage'),
    video: $('#self-view-video'), panel: $('#self-view'), layout: $('#room-layout'),
    onJoined: () => controller.roomLoaded(),
    onError: () => { if (controller.snapshot().session) controller.end('room-error'); },
  });
  room.setMode(selfViewMode);
  await room.mount(url);
}

async function apiRequest(path, options = {}) {
  const response = await fetch(path, { cache: 'no-store', ...options });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401 && data.code === 'ACCESS_REQUIRED') {
      setAccess(false);
      render(controller.snapshot());
    }
    throw new Error(data.error || `Server merespons HTTP ${response.status}.`);
  }
  return data;
}

function setAccess(granted) {
  accessGranted = granted;
  $('#app').hidden = !granted;
  $('#access-gate').hidden = granted;
  $('#access-form').hidden = granted;
  $('#access-loading').hidden = true;
  if (!granted) setSettings(false);
  else animateVisible($('#app'));
}

const api = {
  start: () => apiRequest('/api/conversations', { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ mode, subjectId: mode === 'dr_paws' ? subjectId : undefined, durationMinutes: Number($('#duration').value) }) }),
  end: async (id) => {
    const result = await apiRequest(`/api/conversations/${encodeURIComponent(id)}/end`, { method: 'POST' });
    setTimeout(() => { apiRequest('/api/memory/sync', { method: 'POST' }).catch(() => {}); }, 8000);
    return result;
  },
  status: (id) => apiRequest(`/api/conversations/${encodeURIComponent(id)}/status`),
};

function updateOffline() {
  $('#offline').hidden = navigator.onLine;
  if (!navigator.onLine && controller.snapshot().session) {
    $('#status-text').textContent = 'Koneksi terputus.';
  } else render(controller.snapshot());
}

async function acquireWakeLock() {
  if (!('wakeLock' in navigator) || document.visibilityState !== 'visible') return;
  try { wakeLock = await navigator.wakeLock.request('screen'); }
  catch { /* Browser may deny wake lock; the call remains usable. */ }
}
async function releaseWakeLock() {
  try { await wakeLock?.release(); } catch { /* Already released. */ }
  wakeLock = null;
}

function fullscreenActive() { return Boolean(document.fullscreenElement || fullscreenFallback); }
function friendlyCallError(message = '') {
  if (/microphone|mikrofon|permission|izin/i.test(message)) return `${modeName} membutuhkan akses mikrofon. Periksa izin browser lalu coba lagi.`;
  if (/offline|network|fetch|koneksi/i.test(message)) return 'Koneksi terganggu. Periksa internet lalu coba lagi.';
  if (/PAL|profil|config|konfigurasi/i.test(message)) return `${modeName} belum siap digunakan. Periksa Tavus Engine di Pengaturan.`;
  if (/kuota|quota|limit|rate|credit|usage/i.test(message)) return 'Sesi belum dapat dimulai saat ini. Periksa penggunaan profil Tavus aktif di Pengaturan.';
  if (/supabase|penyimpanan|memori/i.test(message)) return 'Ingatan sedang tidak tersedia. Coba lagi sebentar.';
  return message ? 'Sesi belum dapat dimulai saat ini. Coba lagi sebentar.' : '';
}
function updateFullscreen() {
  const active = fullscreenActive();
  $('#app').classList.toggle('app-fullscreen', active);
  $('#exit-fullscreen').hidden = !active;
  $('#fullscreen').setAttribute('aria-label', active ? 'Keluar dari layar penuh' : 'Masuk layar penuh');
  $('#fullscreen').querySelector('span').textContent = active ? 'Keluar' : 'Fullscreen';
}
async function enterFullscreen() {
  try { if ($('#app').requestFullscreen) await $('#app').requestFullscreen(); else fullscreenFallback = true; }
  catch { fullscreenFallback = true; }
  updateFullscreen();
}
async function exitFullscreen() {
  if (document.fullscreenElement) await document.exitFullscreen().catch(() => {});
  fullscreenFallback = false;
  updateFullscreen();
}

function render(state) {
  if (isHome) return;
  const active = Boolean(state.session);
  const pending = state.phase === 'connecting';
  document.body.classList.toggle('call-active', active);
  $('#call-view').classList.toggle('in-call', active);
  $('#start').disabled = !state.canStart || !accessGranted || !navigator.onLine || !modeReady[mode] || (mode === 'dr_paws' && !subjectId);
  $('#start').textContent = state.phase === 'error' ? 'Coba Lagi' : mode === 'naya' ? 'Mulai Ngobrol' : 'Mulai Cerita';
  $('#start').hidden = active || pending;
  $('#end').disabled = !state.canEnd;
  $('#end').hidden = !active;
  $('#mic-help').hidden = !active;
  $('#self-view-toggle').hidden = !active;
  $('#call-settings').hidden = !active;
  $('#duration').disabled = active || pending;
  $('#subject-select').disabled = active || pending;
  $('#subject-add-toggle').disabled = active || pending;
  $('#subject-reset').disabled = active || pending || !subjectId;
  $('#setting-duration').disabled = active || pending;
  $('#status').dataset.state = state.phase;
  const labels = { ready:'Siap', connecting:`Menghubungkan dengan ${modeName}…`, connected:'Ruang percakapan terbuka',
    ended:'Sesi selesai', error:'Sesi belum dapat dimulai' };
  $('#status-text').textContent = navigator.onLine ?
    (active && state.phase === 'error' ? 'Koneksi perlu diperiksa' : labels[state.phase] || state.phase) : 'Koneksi terputus.';
  $('#error').hidden = !state.message || state.phase === 'ended';
  $('#error').textContent = state.phase === 'error' ?
    active ? 'Sesi belum dapat ditutup. Periksa koneksi lalu tekan Akhiri lagi.' : friendlyCallError(state.message) : state.message;
  $('#precall').hidden = active || pending || state.phase === 'ended';
  $('#placeholder-title').textContent = pending ? `${modeName} sedang bersiap…` :
    mode === 'naya' ? 'Siap ngobrol dengan Naya?' : 'Siap bercerita dengan Dr. Paws?';
  const postcallJustOpened = state.phase === 'ended' && $('#postcall').hidden;
  $('#postcall').hidden = state.phase !== 'ended';
  $('#room-layout').hidden = state.phase === 'ended';
  $('#call-view .controls').hidden = state.phase === 'ended';
  $('#mic-hint').hidden = state.phase === 'ended';
  if (state.phase === 'ended' && !$('#settings-panel').hidden) setSettings(false);
  if (state.phase === 'ended') {
    $('#postcall-title').textContent = mode === 'naya' ? 'Percakapan selesai.' : 'Ceritanya selesai untuk sekarang.';
    $('#postcall-text').textContent = state.message?.includes('durasi') ? state.message :
      mode === 'naya' ? 'Sampai jumpa di obrolan berikutnya.' : 'Terima kasih sudah bercerita bersama Dr. Paws.';
    if (postcallJustOpened) animateVisible($('#postcall'));
  }
  if (active && state.session.conversationUrl !== mountedUrl) {
    mountedUrl = state.session.conversationUrl;
    activeId = state.session.conversationId;
    $('#placeholder').hidden = true;
    $('#debug-text').textContent = `Sesi ${modeName}. Durasi ${$('#duration').value} menit. Ruang video Daily sedang dibuka.`;
    mountRoom(mountedUrl, activeId).catch(() => { if (controller.snapshot().session?.conversationId === activeId) controller.end('room-error'); });
    clearTimeout(durationTimer);
    const seconds = state.session.durationSeconds || Number($('#duration').value) * 60;
    durationTimer = setTimeout(() => { if (controller.snapshot().session) controller.end('duration'); }, seconds * 1000);
    clearInterval(statusTimer);
    statusTimer = setInterval(async () => {
      if (statusChecking || !navigator.onLine || !controller.snapshot().session) return;
      statusChecking = true;
      try {
        const result = await api.status(activeId);
        if (result.status === 'ended' && controller.snapshot().session?.conversationId === activeId) {
          await controller.end('provider');
        }
      } catch { /* A temporary status-read failure must not close a live call. */ }
      finally { statusChecking = false; }
    }, 20000);
    acquireWakeLock();
  } else if (!active && mountedUrl) {
    clearTimeout(durationTimer);
    clearInterval(statusTimer);
    if (fullscreenActive()) exitFullscreen();
    room?.destroy();
    room = null;
    $('#placeholder').hidden = false;
    mountedUrl = '';
    activeId = '';
    releaseWakeLock();
  }
}

const controller = createConversationController({ api, render });

$('#start').addEventListener('click', async () => {
  if (!accessGranted || !modeReady[mode] || !navigator.onLine || (mode === 'dr_paws' && !subjectId)) return;
  if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
    $('#error').hidden = false;
    $('#error').textContent = mode === 'naya' ? 'Naya membutuhkan akses mikrofon agar bisa mendengar kamu. Buka lewat HTTPS dan periksa izin browser.' :
      'Dr. Paws perlu mikrofon supaya bisa mendengar ceritamu. Buka lewat HTTPS dan periksa izin browser.';
    return;
  }
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    if (devices.length && !devices.some((device) => device.kind === 'audioinput')) {
      $('#error').hidden = false;
      $('#error').textContent = `${modeName} memerlukan mikrofon. Sambungkan mikrofon lalu coba lagi.`;
      return;
    }
  } catch { /* Permission remains under the Tavus room UI. */ }
  controller.start();
});
$('#end').addEventListener('click', () => controller.end());
$('#again').addEventListener('click', () => { location.reload(); });
$('#mic-help').addEventListener('click', () => {
  $('#mic-hint').textContent = 'Gunakan ikon mikrofon di dalam ruang video untuk mute atau unmute. Jika izin ditolak, aktifkan mikrofon pada pengaturan situs lalu muat ulang.';
  $('#stage').querySelector('iframe')?.focus();
});
$('#self-view-toggle').addEventListener('click', () => {
  selfViewMode = selfViewMode === 'compact' ? 'hidden' : 'compact';
  try { localStorage.setItem('mynaia.selfView', selfViewMode); } catch { /* Private browsing. */ }
  updateSelfViewControl();
});
$('#fullscreen').addEventListener('click', () => fullscreenActive() ? exitFullscreen() : enterFullscreen());
$('#exit-fullscreen').addEventListener('click', exitFullscreen);
document.addEventListener('fullscreenchange', updateFullscreen);
document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && fullscreenFallback) exitFullscreen(); });
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') releaseWakeLock();
  else if (controller.snapshot().session) acquireWakeLock();
});
window.addEventListener('online', updateOffline);
window.addEventListener('offline', updateOffline);
window.addEventListener('pagehide', () => {
  clearInterval(statusTimer);
  releaseWakeLock();
  room?.destroy();
  if (activeId) navigator.sendBeacon(`/api/conversations/${encodeURIComponent(activeId)}/end`);
});

$('#access-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  $('#access-message').textContent = '';
  try {
    await apiRequest('/api/access/login', { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code: $('#access-code').value }) });
    $('#access-code').value = '';
    setAccess(true);
    if (!isHome) { await refreshModeStatus(); if (mode === 'dr_paws') await refreshSubjects(); }
    render(controller.snapshot());
  } catch (error) { $('#access-message').textContent = error.message; }
});

async function refreshSubjects(preferredId = '') {
  if (mode !== 'dr_paws' || isHome) return;
  const data = await apiRequest('/api/dr-paws/subjects');
  const select = $('#subject-select');
  select.replaceChildren();
  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = data.subjects.length ? 'Pilih profil' : 'Belum ada profil';
  select.append(placeholder);
  for (const subject of data.subjects) {
    const option = document.createElement('option');
    option.value = subject.id;
    option.textContent = subject.nickname || subject.display_name;
    select.append(option);
  }
  subjectId = data.subjects.some((item) => item.id === preferredId) ? preferredId : data.subjects.length === 1 ? data.subjects[0].id : '';
  select.value = subjectId;
  const options = $('#subject-options');
  options.replaceChildren();
  for (const subject of data.subjects) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'subject-choice';
    button.dataset.subjectId = subject.id;
    button.textContent = subject.nickname || subject.display_name;
    button.setAttribute('aria-pressed', String(subject.id === subjectId));
    button.addEventListener('click', () => {
      subjectId = subject.id;
      select.value = subjectId;
      for (const choice of options.children) choice.setAttribute('aria-pressed', String(choice === button));
      render(controller.snapshot());
    });
    options.append(button);
  }
  $('#subject-message').textContent = data.subjects.length ? '' : 'Tambahkan profil sebelum mulai ngobrol.';
  render(controller.snapshot());
}
$('#subject-select').addEventListener('change', () => {
  subjectId = $('#subject-select').value;
  for (const choice of $('#subject-options').children) choice.setAttribute('aria-pressed', String(choice.dataset.subjectId === subjectId));
  render(controller.snapshot());
});
$('#subject-add-toggle').addEventListener('click', () => { $('#subject-add-form').hidden = !$('#subject-add-form').hidden; });
$('#subject-add-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  try {
    const subject = await apiRequest('/api/dr-paws/subjects', { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ displayName: $('#subject-name').value, nickname: $('#subject-nickname').value }) });
    $('#subject-add-form').reset();
    $('#subject-add-form').hidden = true;
    await refreshSubjects(subject.id);
  } catch (error) { $('#subject-message').textContent = error.message; }
});
$('#subject-reset').addEventListener('click', async () => {
  if (!subjectId || !window.confirm('Hapus ingatan Dr. Paws untuk profil terpilih? Transkrip tetap tersimpan.')) return;
  try {
    await apiRequest(`/api/dr-paws/subjects/${encodeURIComponent(subjectId)}/reset`, { method: 'POST',
      headers: { 'content-type': 'application/json' }, body: JSON.stringify({ confirm: true }) });
    $('#subject-message').textContent = 'Ingatan profil ini sudah direset.';
  } catch (error) { $('#subject-message').textContent = error.message; }
});

function setSettings(open) {
  $('#settings-panel').hidden = !open;
  $('#settings-toggle').setAttribute('aria-expanded', String(open));
  if (open) animateVisible($('#settings-panel'));
}
$('#settings-toggle').addEventListener('click', () => setSettings($('#settings-panel').hidden));
$('#call-settings').addEventListener('click', () => setSettings($('#settings-panel').hidden));
$('#settings-close').addEventListener('click', () => setSettings(false));
$('#duration').addEventListener('change', () => { $('#duration-warning').hidden = $('#duration').value !== '20'; });
$('#setting-duration').addEventListener('change', () => {
  try { localStorage.setItem('mynaia.duration', $('#setting-duration').value); } catch { /* Private browsing. */ }
  if (!$('#duration').disabled) $('#duration').value = $('#setting-duration').value;
  $('#duration-warning').hidden = $('#duration').value !== '20';
});

async function refreshModeStatus() {
  const data = await apiRequest('/api/modes/status');
  modeReady.naya = Boolean(data.naya);
  modeReady.dr_paws = Boolean(data.drPaws);
  if (!isHome) render(controller.snapshot());
}

async function refreshAdminProfiles() {
  const data = await apiRequest('/api/admin/tavus-profiles');
  $('#admin-controls').hidden = false;
  const select = $('#admin-profile');
  select.replaceChildren();
  for (const item of data.profiles) {
    const option = document.createElement('option');
    option.value = String(item.profile);
    option.textContent = `Tavis ${item.profile} — ${item.configured ? 'Configured' : item.apiConfigured ? 'Partially configured' : 'Not configured'}`;
    select.append(option);
  }
  select.value = String(data.active);
  const selected = data.profiles.find((item) => item.active);
  $('#admin-profile-status').textContent = `Aktif: Tavis ${data.active}. Naya: ${selected?.nayaConfigured ? 'siap' : 'belum dikonfigurasi'}. Dr. Paws: ${selected?.drPawsConfigured ? 'siap' : 'belum dikonfigurasi'}.`;
  $('#admin-message').textContent = '';
}

async function refreshAdmin() {
  try {
    await refreshAdminProfiles();
  } catch {
    $('#admin-controls').hidden = true;
    $('#admin-message').textContent = 'Pengaturan Tavus tidak tersedia.';
  }
}

$('#admin-settings').addEventListener('toggle', () => { if ($('#admin-settings').open) refreshAdmin(); });
$('#admin-apply').addEventListener('click', async () => {
  $('#admin-apply').disabled = true;
  try {
    await apiRequest('/api/admin/tavus-profile', { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ profile: Number($('#admin-profile').value) }) });
    await refreshAdminProfiles();
    await refreshModeStatus();
  } catch (error) { $('#admin-message').textContent = error.message; }
  finally { $('#admin-apply').disabled = false; }
});
$('#admin-inspect').addEventListener('click', async () => {
  $('#admin-inspect').disabled = true;
  try {
    const result = await apiRequest('/api/admin/tavus-profile/inspect', { method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ profile: Number($('#admin-profile').value) }) });
    $('#admin-message').textContent = `Tavis ${result.profile}: autentikasi ${result.apiAuthenticated ? 'berhasil' : 'belum ada key'}; Naya PAL ${result.nayaPalAccessible ? 'tersedia' : 'belum tersedia'}; Dr. Paws PAL ${result.drPawsPalAccessible ? 'tersedia' : 'belum tersedia'}; Face Naya ${result.nayaFaceAccessible ? 'tersedia' : 'belum tersedia'}; Face Dr. Paws ${result.drPawsFaceAccessible ? 'tersedia' : 'belum tersedia'}.`;
  } catch (error) { $('#admin-message').textContent = error.message; }
  finally { $('#admin-inspect').disabled = false; }
});

updateOffline();
apiRequest('/api/access/status', { signal: AbortSignal.timeout?.(10000) }).then((data) => {
  setAccess(!data.required || data.authorized);
  if (!accessGranted) return;
  if (mode === 'dr_paws' && !isHome) refreshSubjects().catch(() => { $('#subject-message').textContent = 'Profil anak belum tersedia.'; });
  if (!isHome) apiRequest('/api/modes/status').then((data) => {
    modeReady.naya = Boolean(data.naya);
    modeReady.dr_paws = Boolean(data.drPaws);
    $('#debug-text').textContent = `Mode ${modeName}: ${modeReady[mode] ? 'siap' : 'belum dikonfigurasi'}.`;
    if (!modeReady[mode]) {
      $('#error').hidden = false;
      $('#error').textContent = mode === 'dr_paws' ? 'Dr. Paws belum dikonfigurasi.' : 'Naya belum dikonfigurasi.';
    }
    render(controller.snapshot());
  }).catch(() => { $('#debug-text').textContent = 'Status backend tidak tersedia.'; });
  render(controller.snapshot());
}).catch(() => {
  setAccess(false);
  $('#access-message').textContent = 'Status akses tidak tersedia. Coba muat ulang.';
});
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(() => {});
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (controller.snapshot().session) return;
    location.reload();
  });
}
