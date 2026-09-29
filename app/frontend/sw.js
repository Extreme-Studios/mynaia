const CACHE = 'mynaia-static-v24';
const STATIC = new Set(['/', '/index.html', '/naia', '/naya', '/dr-paws', '/styles.css', '/app.js', '/platform.mjs', '/controller.mjs', '/self-view.mjs', '/motion.mjs', '/gsap.min.js',
  '/hero-media.mjs', '/assets/hero/naia-hero-poster.jpg', '/assets/hero/dr-paws-hero-poster.jpg', '/cinematic.js', '/manifest.webmanifest', '/icons/icon-192.png', '/icons/icon-512.png']);
self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll([...STATIC].map((path) => new Request(path, { cache: 'reload' })))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))));
  self.clients.claim();
});
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/') || url.pathname.startsWith('/dr-paws/dashboard') ||
    ['/dashboard.html','/dashboard.js','/dashboard.css','/case.html','/case.js','/case.css'].includes(url.pathname)) return;
  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request, { cache: 'no-store' }).catch(async () => (await caches.open(CACHE)).match('/index.html')));
    return;
  }
  if (STATIC.has(url.pathname) || /^\/cinematic-[A-Z0-9]+\.js$/.test(url.pathname)) {
    event.respondWith(caches.open(CACHE).then(async (cache) => {
      const cached = await cache.match(event.request);
      if (cached) return cached;
      const response = await fetch(event.request);
      if (response.ok) await cache.put(event.request, response.clone());
      return response;
    }));
  }
});
