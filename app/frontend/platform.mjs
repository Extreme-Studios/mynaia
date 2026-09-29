export const API_ORIGIN = 'https://mynaia.extremestudiosai.com';
export const isAndroid = () => globalThis.Capacitor?.getPlatform?.() === 'android';
const native = () => globalThis.Capacitor?.Plugins?.MyNaia;

export function apiUrl(path, android = isAndroid()) {
  if (!path.startsWith('/api/') || path.startsWith('//') || path.includes('\\')) throw new Error('INVALID_API_PATH');
  const url = new URL(path, API_ORIGIN);
  if (url.origin !== API_ORIGIN || !url.pathname.startsWith('/api/')) throw new Error('INVALID_API_PATH');
  return android ? url.href : path;
}

export async function apiFetch(path, options = {}) {
  const url = apiUrl(path);
  if (!isAndroid()) return fetch(url, { credentials: 'same-origin', ...options });
  if (options.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
  const headers = Object.fromEntries(new Headers(options.headers));
  const pdf = new URL(url).searchParams.get('action') === 'pdf';
  const result = await globalThis.Capacitor.Plugins.CapacitorHttp.request({ url,
    method: options.method || 'GET', headers,
    ...(options.body ? { data: JSON.parse(options.body) } : {}),
    responseType: pdf ? 'arraybuffer' : 'json', disableRedirects: true,
    connectTimeout: 15000, readTimeout: 60000 });
  // Never return native response headers: they may contain an HttpOnly session cookie.
  const type = Object.entries(result.headers || {}).find(([key]) => key.toLowerCase() === 'content-type')?.[1] || 'application/json';
  const body = pdf && typeof result.data === 'string' && String(type).includes('application/pdf')
    ? Uint8Array.from(atob(result.data), (char) => char.charCodeAt(0)) : JSON.stringify(result.data);
  return new Response(body, { status: result.status, headers: { 'content-type': type } });
}

export function permissionMessage(mode, permanent = false) {
  return (mode === 'dr_paws' ? 'Dr. Paws perlu mikrofon supaya bisa mendengar ceritamu.' :
    'Naia membutuhkan akses mikrofon agar bisa mendengar kamu.') +
    (permanent ? ' Buka Pengaturan Aplikasi untuk mengaktifkannya.' : ' Coba Lagi untuk memberi izin.');
}

export async function prepareMicrophone(mode) {
  if (!isAndroid()) return;
  const result = await native().microphone();
  if (!result.granted) {
    const error = new Error(permissionMessage(mode, result.permanent));
    error.permanent = result.permanent;
    throw error;
  }
}

export async function setNativeCall(active) {
  if (isAndroid()) await native().callState({ active });
}
export async function setNativeFullscreen(active) {
  if (isAndroid()) await native().fullscreen({ active });
}

export function backAction({ settings = false, active = false, pathname = '/' } = {}) {
  return settings ? 'settings' : active ? 'confirm' : pathname !== '/' ? 'home' : 'exit';
}

export function nativePageUrl(url) {
  if (url.pathname === '/dr-paws/dashboard') return '/dashboard.html' + url.search;
  if (url.pathname.startsWith('/dr-paws/dashboard/subjects/')) return '/case.html?subject=' + encodeURIComponent(url.pathname.split('/').at(-1));
  return url.pathname + url.search + url.hash;
}

export function installNativeNavigation({ onBack, onLeave } = {}) {
  if (!isAndroid()) return;
  const logout = document.createElement('button');
  logout.type = 'button'; logout.textContent = 'Keluar akun';
  (document.querySelector('#settings-panel') || document.querySelector('header') || document.body).append(logout);
  logout.addEventListener('click', async () => {
    if (onLeave && !await onLeave()) return;
    await nativeLogout(); location.assign('/');
  });
  native().addListener('back', () => onBack ? onBack() : location.pathname !== '/' ? location.assign('/') : native().exit());
  document.addEventListener('click', async (event) => {
    const link = event.target.closest('a[href]');
    if (!link) return;
    const url = new URL(link.href);
    if (onLeave && url.origin === location.origin && !url.pathname.startsWith('/api/')) {
      event.preventDefault();
      if (!await onLeave()) return;
      location.assign(nativePageUrl(url)); return;
    }
    if (url.origin === location.origin && url.pathname.startsWith('/dr-paws/dashboard')) { event.preventDefault(); location.assign(nativePageUrl(url)); return; }
    if (url.pathname.startsWith('/api/') && url.searchParams.get('action') === 'pdf') {
      event.preventDefault();
      try {
        const response = await apiFetch(url.pathname + url.search);
        if (!response.ok) throw new Error('Laporan tidak dapat diunduh.');
        const bytes = new Uint8Array(await response.arrayBuffer());
        let binary = ''; for (const byte of bytes) binary += String.fromCharCode(byte);
        await native().sharePdf({ data: btoa(binary) });
      } catch (error) { alert(error.message); }
    } else if (url.origin !== location.origin && url.protocol === 'https:') {
      event.preventDefault(); await native().openExternal({ url: url.href });
    }
  });
}

export async function nativeLogout() {
  if (isAndroid()) await native().logout();
}
