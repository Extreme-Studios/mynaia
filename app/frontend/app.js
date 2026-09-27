import { createConversationController } from './controller.mjs';

const startButton = document.querySelector('#start');
const endButton = document.querySelector('#end');
const status = document.querySelector('#status');
const statusText = document.querySelector('#status-text');
const errorBox = document.querySelector('#error');
const placeholder = document.querySelector('#placeholder');
const frame = document.querySelector('#conversation-frame');
const debugToggle = document.querySelector('#debug-toggle');
const debugPanel = document.querySelector('#debug-panel');
const debugText = document.querySelector('#debug-text');
const accessForm = document.querySelector('#access-form');
const accessCode = document.querySelector('#access-code');
const accessMessage = document.querySelector('#access-message');
let mountedUrl = '';
let activeId = '';
let localTimeout;
let accessGranted = true;

async function apiRequest(path, options) {
  const response = await fetch(path, { cache: 'no-store', ...options });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401 && data.code === 'ACCESS_REQUIRED') {
      accessGranted = false;
      accessForm.hidden = false;
      startButton.disabled = true;
    }
    throw new Error(data.error || `Server merespons HTTP ${response.status}.`);
  }
  return data;
}

const api = {
  start: () => apiRequest('/api/conversations', { method: 'POST' }),
  end: async (id) => {
    const result = await apiRequest(`/api/conversations/${encodeURIComponent(id)}/end`, { method: 'POST' });
    setTimeout(() => { apiRequest('/api/memory/sync', { method: 'POST' }).catch(() => {}); }, 8000);
    return result;
  },
};

function render(state) {
  startButton.disabled = !state.canStart || !accessGranted;
  endButton.disabled = !state.canEnd;
  status.dataset.state = state.phase;
  const labels = {
    ready: 'Ready',
    connecting: 'Connecting',
    connected: 'Connected — ruang video terbuka',
    listening: 'Listening',
    ended: 'Conversation Ended',
    error: 'Error',
  };
  statusText.textContent = labels[state.phase] || state.phase;
  errorBox.hidden = !state.message;
  errorBox.textContent = state.message;

  const session = state.session;
  if (session && session.conversationUrl !== mountedUrl) {
    mountedUrl = session.conversationUrl;
    activeId = session.conversationId;
    placeholder.hidden = true;
    frame.hidden = false;
    frame.src = mountedUrl;
    debugText.textContent = `Conversation ID: ${activeId}. Face: Anna stock. Maksimum 3 menit.`;
    clearTimeout(localTimeout);
    localTimeout = setTimeout(() => { if (controller.snapshot().session) controller.end(); }, 185000);
  } else if (!session && mountedUrl) {
    clearTimeout(localTimeout);
    frame.removeAttribute('src');
    frame.hidden = true;
    placeholder.hidden = false;
    mountedUrl = '';
    activeId = '';
  }
}

const controller = createConversationController({ api, render });

startButton.addEventListener('click', () => {
  if (!accessGranted) return;
  // Tavus/Daily UI meminta izin mic di dalam iframe. Tidak ada prompt ganda di host.
  if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
    errorBox.hidden = false;
    errorBox.textContent = 'Microphone memerlukan localhost/HTTPS dan browser yang mendukung akses media.';
    return;
  }
  controller.start();
});
accessForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  accessMessage.textContent = '';
  try {
    await apiRequest('/api/access/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code: accessCode.value }) });
    accessCode.value = '';
    accessGranted = true;
    accessForm.hidden = true;
    render(controller.snapshot());
  } catch (error) {
    accessMessage.textContent = error.message;
  }
});
endButton.addEventListener('click', () => controller.end());
frame.addEventListener('load', () => controller.roomLoaded());
debugToggle.addEventListener('click', () => {
  debugPanel.hidden = !debugPanel.hidden;
  debugToggle.setAttribute('aria-expanded', String(!debugPanel.hidden));
});
window.addEventListener('pagehide', () => {
  if (activeId) navigator.sendBeacon(`/api/conversations/${encodeURIComponent(activeId)}/end`);
});

apiRequest('/api/tavus/status').then((data) => {
  debugText.textContent = `Tavus configured: ${data.configured}. PAL tersimpan: ${data.palConfigured}. Face: Anna stock.`;
  if (!data.configured) {
    startButton.disabled = true;
    errorBox.hidden = false;
    errorBox.textContent = 'TAVUS_API_KEY belum diatur pada backend lokal.';
  }
}).catch(() => { debugText.textContent = 'Status backend tidak tersedia.'; });

apiRequest('/api/access/status').then((data) => {
  accessGranted = !data.required || data.authorized;
  accessForm.hidden = accessGranted;
  render(controller.snapshot());
}).catch(() => { /* Server lokal lama tidak memakai gerbang akses. */ });
