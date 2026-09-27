import { createConversationController } from './controller.mjs';

const $ = (selector) => document.querySelector(selector);
const mode = location.pathname === '/dr-paws' ? 'dr_paws' : 'naya';
const isHome = !['/naya', '/dr-paws'].includes(location.pathname);
const modeName = mode === 'naya' ? 'Naya' : 'Dr. Paws';
const modeReady = { naya: true, dr_paws: false };
let accessGranted = true;
let mountedUrl = '';
let activeId = '';
let durationTimer;
let wakeLock;
let fullscreenFallback = false;

$('#home').hidden = !isHome;
$('#call-view').hidden = isHome;
$('#mode-title').textContent = modeName;
$('#settings-mode').textContent = isHome ? 'Beranda' : modeName;
$('#mode-badge').textContent = mode === 'naya' ? 'AI companion' : 'Teman cerita';
$('#avatar-mark').textContent = mode === 'naya' ? 'N' : '🐾';
$('#placeholder-description').textContent = mode === 'naya'
  ? 'Pilih durasi, lalu mulai saat kamu siap.' : 'Cerita santai bersama Dr. Paws. Mulai saat kamu siap.';
document.body.dataset.mode = mode;
document.title = isHome ? 'MyNaiA — Teman AI' : `${modeName} — MyNaiA`;

function savedDuration() {
  try { const value = localStorage.getItem('mynaia.duration'); return ['3','5','10','20'].includes(value) ? value : '5'; }
  catch { return '5'; }
}
$('#duration').value = savedDuration();
$('#setting-duration').value = savedDuration();
$('#duration-warning').hidden = $('#duration').value !== '20';
$('#quality').value = 'auto';

async function apiRequest(path, options = {}) {
  const response = await fetch(path, { cache: 'no-store', ...options });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401 && data.code === 'ACCESS_REQUIRED') {
      accessGranted = false;
      $('#access-form').hidden = false;
      render(controller.snapshot());
    }
    throw new Error(data.error || `Server merespons HTTP ${response.status}.`);
  }
  return data;
}

const api = {
  start: () => apiRequest('/api/conversations', { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ mode, durationMinutes: Number($('#duration').value) }) }),
  end: async (id) => {
    const result = await apiRequest(`/api/conversations/${encodeURIComponent(id)}/end`, { method: 'POST' });
    setTimeout(() => { apiRequest('/api/memory/sync', { method: 'POST' }).catch(() => {}); }, 8000);
    return result;
  },
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
  $('#start').disabled = !state.canStart || !accessGranted || !navigator.onLine || !modeReady[mode];
  $('#start').hidden = active || pending;
  $('#end').disabled = !state.canEnd;
  $('#end').hidden = !active;
  $('#mic-help').hidden = !active;
  $('#duration').disabled = active || pending;
  $('#setting-duration').disabled = active || pending;
  $('#status').dataset.state = state.phase;
  const labels = { ready:'Ready', connecting:'Connecting', connected:'Connected — ruang video terbuka',
    ended:'Ended', error:'Error' };
  $('#status-text').textContent = navigator.onLine ? labels[state.phase] || state.phase : 'Koneksi terputus.';
  $('#error').hidden = !state.message || state.phase === 'ended';
  $('#error').textContent = state.message;
  $('#precall').hidden = active || pending || state.phase === 'ended';
  $('#postcall').hidden = state.phase !== 'ended';
  if (state.phase === 'ended') $('#postcall-text').textContent = state.message ||
    (mode === 'naya' ? 'Tadi seru ngobrol sama kamu.' : 'Makasih sudah bercerita dengan Dr. Paws.');
  if (active && state.session.conversationUrl !== mountedUrl) {
    mountedUrl = state.session.conversationUrl;
    activeId = state.session.conversationId;
    $('#placeholder').hidden = true;
    $('#conversation-frame').hidden = false;
    $('#conversation-frame').src = mountedUrl;
    $('#debug-text').textContent = `Sesi ${modeName}. Durasi ${$('#duration').value} menit. Status media dilihat dalam video.`;
    clearTimeout(durationTimer);
    const seconds = state.session.durationSeconds || Number($('#duration').value) * 60;
    durationTimer = setTimeout(() => { if (controller.snapshot().session) controller.end('duration'); }, seconds * 1000);
    acquireWakeLock();
  } else if (!active && mountedUrl) {
    clearTimeout(durationTimer);
    if (fullscreenActive()) exitFullscreen();
    $('#conversation-frame').removeAttribute('src');
    $('#conversation-frame').hidden = true;
    $('#placeholder').hidden = false;
    mountedUrl = '';
    activeId = '';
    releaseWakeLock();
  }
}

const controller = createConversationController({ api, render });

$('#start').addEventListener('click', async () => {
  if (!accessGranted || !modeReady[mode] || !navigator.onLine) return;
  if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
    $('#error').hidden = false;
    $('#error').textContent = `${modeName} membutuhkan akses mikrofon agar bisa mendengar kamu. Buka lewat HTTPS dan periksa izin browser.`;
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
  $('#mic-hint').textContent = 'Gunakan ikon mikrofon di dalam video untuk mute atau unmute. Jika izin ditolak, aktifkan mikrofon pada pengaturan situs lalu muat ulang.';
  $('#conversation-frame').focus();
});
$('#conversation-frame').addEventListener('load', () => controller.roomLoaded());
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
  releaseWakeLock();
  if (activeId) navigator.sendBeacon(`/api/conversations/${encodeURIComponent(activeId)}/end`);
});

$('#access-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  $('#access-message').textContent = '';
  try {
    await apiRequest('/api/access/login', { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code: $('#access-code').value }) });
    $('#access-code').value = '';
    accessGranted = true;
    $('#access-form').hidden = true;
    render(controller.snapshot());
  } catch (error) { $('#access-message').textContent = error.message; }
});

function setSettings(open) {
  $('#settings-panel').hidden = !open;
  $('#settings-toggle').setAttribute('aria-expanded', String(open));
}
$('#settings-toggle').addEventListener('click', () => setSettings($('#settings-panel').hidden));
$('#settings-close').addEventListener('click', () => setSettings(false));
$('#duration').addEventListener('change', () => { $('#duration-warning').hidden = $('#duration').value !== '20'; });
$('#setting-duration').addEventListener('change', () => {
  try { localStorage.setItem('mynaia.duration', $('#setting-duration').value); } catch { /* Private browsing. */ }
  if (!$('#duration').disabled) $('#duration').value = $('#setting-duration').value;
  $('#duration-warning').hidden = $('#duration').value !== '20';
});

updateOffline();
if (!isHome) {
  apiRequest('/api/modes/status').then((data) => {
    modeReady.naya = Boolean(data.naya);
    modeReady.dr_paws = Boolean(data.drPaws);
    $('#debug-text').textContent = `Mode ${modeName}: ${modeReady[mode] ? 'siap' : 'belum dikonfigurasi'}.`;
    if (!modeReady[mode]) {
      $('#error').hidden = false;
      $('#error').textContent = mode === 'dr_paws' ? 'Dr. Paws belum dikonfigurasi.' : 'Naya belum dikonfigurasi.';
    }
    render(controller.snapshot());
  }).catch(() => { $('#debug-text').textContent = 'Status backend tidak tersedia.'; });
  apiRequest('/api/access/status').then((data) => {
    accessGranted = !data.required || data.authorized;
    $('#access-form').hidden = accessGranted;
    render(controller.snapshot());
  }).catch(() => { /* Local server can omit the access gate. */ });
}
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
