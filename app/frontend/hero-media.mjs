export const HERO_KEYS = ['naia', 'dr-paws'];
const POSTER = /^(naia|dr-paws)-hero-poster\.jpg$/;
const VIDEO = /^(naia|dr-paws)-hero-loop\.(mp4|webm)$/;

export function videoSources(manifest, key) {
  if (!HERO_KEYS.includes(key)) return [];
  return (manifest?.[key]?.videos || []).filter(name => typeof name === 'string' &&
    VIDEO.test(name) && name.startsWith(`${key}-`)).slice(0, 2);
}

export function parseHeroCatalog(csv) {
  const lines = csv.trim().split(/\r?\n/).map(line => line.split(','));
  if (lines.shift()?.join(',') !== 'key,poster_url,video_url,enabled,version,label') return {};
  return Object.fromEntries(lines.filter(row => HERO_KEYS.includes(row[0]) && row.length === 6)
    .map(row => [row[0], { poster: row[1], video: row[2], enabled: row[3] === 'TRUE', version: row[4] }]));
}

export function createHeroMedia({ mode = 'naya', document: doc = document, fetch: fetcher = fetch,
  mediaQuery = matchMedia('(prefers-reduced-motion: reduce)') } = {}) {
  const nodes = [...doc.querySelectorAll('[data-hero]')];
  let active = false, disposed = false;
  const controller = new AbortController();
  const precall = doc.querySelector('.precall-hero');
  if (precall) {
    const key = mode === 'dr_paws' ? 'dr-paws' : 'naia';
    precall.dataset.hero = key;
    precall.querySelector('img').alt = key === 'naia' ? 'Naia' : 'Dr. Paws';
  }
  function sync() {
    for (const node of nodes) {
      const video = node.querySelector('video');
      if (node.dataset.videoFailed || active || doc.hidden || mediaQuery.matches || disposed ||
        node.closest('[hidden]') || !video.querySelector('source')) {
        video.pause(); video.hidden = true; node.dataset.media = 'poster';
      } else video.play().then(() => {
        if (video.readyState >= 2 && !active && !doc.hidden && !mediaQuery.matches && !disposed &&
          !node.closest('[hidden]')) { video.hidden = false; node.dataset.media = 'video'; }
      }).catch(() => { video.hidden = true; node.dataset.media = 'poster'; });
    }
  }
  for (const node of nodes) {
    const video = node.querySelector('video'); node.dataset.media = 'poster';
    video.muted = true; video.loop = true;
    video.addEventListener('loadeddata', () => {
      if (!active && !doc.hidden && !mediaQuery.matches && !disposed && !node.closest('[hidden]')) {
        video.hidden = false; node.dataset.media = 'video';
      }
    });
    video.addEventListener('error', () => {
      node.dataset.videoFailed = 'true'; video.hidden = true; node.dataset.media = 'poster';
    });
  }
  const ready = fetcher('/assets/hero/manifest.json?v=21', { signal: controller.signal })
    .then(r => r.ok ? r.json() : {})
    .then(async manifest => {
      if (disposed) return;
      let catalog = {};
      if (manifest.catalogUrl) {
        try {
          const response = await fetcher(manifest.catalogUrl, { signal: controller.signal, credentials: 'omit' });
          if (response.ok) catalog = parseHeroCatalog(await response.text());
        } catch { /* The local manifest remains usable while Sheet is unavailable. */ }
      }
      for (const node of nodes) {
        const key = node.dataset.hero;
        const image = node.querySelector('img');
        const poster = manifest?.[key]?.poster;
        if (typeof poster === 'string' && POSTER.test(poster) && poster.startsWith(`${key}-`))
          image.src = `/assets/hero/${poster}?v=21`;
        const video = node.querySelector('video');
        const row = catalog[key];
        const enabled = !row || (row.enabled && row.poster === manifest[key].masterPoster &&
          row.video === manifest[key].masterVideo);
        if (!enabled) continue;
        for (const name of videoSources(manifest, key)) {
          const source = doc.createElement('source');
          source.src = `/assets/hero/${name}?v=21`;
          source.type = name.endsWith('.webm') ? 'video/webm' : 'video/mp4';
          video.append(source);
        }
      }
      sync();
    }).catch(() => {});
  doc.addEventListener('visibilitychange', sync); mediaQuery.addEventListener?.('change', sync);
  return { ready, setCallActive(value) { active = value; sync(); }, destroy() {
    disposed = true; controller.abort(); for (const node of nodes) node.querySelector('video').pause();
    doc.removeEventListener('visibilitychange', sync); mediaQuery.removeEventListener?.('change', sync);
  } };
}
