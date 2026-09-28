export const HERO_KEYS = ['naia', 'dr-paws'];
export function videoSources(manifest, key) {
  if(!HERO_KEYS.includes(key)) return [];
  return (manifest?.[key]?.videos || []).filter(name => typeof name === 'string' && new RegExp(`^${key}-hero-loop\\.(webm|mp4)$`).test(name));
}
export function createHeroMedia({ mode='naya', document: doc=document, fetch: fetcher=fetch,
  mediaQuery=matchMedia('(prefers-reduced-motion: reduce)') }={}) {
  const nodes=[...doc.querySelectorAll('[data-hero]')];
  let active=false, disposed=false;
  const controller=new AbortController();
  const precall=doc.querySelector('.precall-hero');
  if(precall) {
    const key=mode==='dr_paws'?'dr-paws':'naia'; precall.dataset.hero=key;
    const image=precall.querySelector('img'); image.src=`/assets/hero/${key}-hero-poster.png?v=20`; image.alt=key==='naia'?'Naia':'Dr. Paws';
  }
  function sync() {
    for(const node of nodes) {
      const video=node.querySelector('video');
      if(node.dataset.videoFailed || active || doc.hidden || mediaQuery.matches || disposed || node.closest('[hidden]') || !video.querySelector('source')) {
        video.pause(); video.hidden=true; node.dataset.media='poster';
      } else video.play().catch(()=> {video.hidden=true; node.dataset.media='poster';});
    }
  }
  for(const node of nodes) {
    const video=node.querySelector('video'); node.dataset.media='poster';
    video.muted=true; video.loop=true;
    video.addEventListener('loadeddata',()=> { if(!active && !doc.hidden && !mediaQuery.matches && !disposed && !node.closest('[hidden]')) {video.hidden=false;node.dataset.media='video';} });
    video.addEventListener('error',()=> {node.dataset.videoFailed='true';video.hidden=true;node.dataset.media='poster';});
  }
  const ready=fetcher('/assets/hero/manifest.json?v=20',{signal:controller.signal}).then(r=>r.ok?r.json():{}).then(manifest=> {
    if(disposed) return;
    for(const node of nodes) {
      const video=node.querySelector('video');
      for(const name of videoSources(manifest,node.dataset.hero)) {
        const source=doc.createElement('source'); source.src=`/assets/hero/${name}?v=20`; source.type=name.endsWith('.webm')?'video/webm':'video/mp4';video.append(source);
      }
    }
    sync();
  }).catch(()=> {});
  doc.addEventListener('visibilitychange',sync); mediaQuery.addEventListener?.('change',sync);
  return {ready,setCallActive(value) {active=value;sync();},destroy() {disposed=true;controller.abort();for(const node of nodes) node.querySelector('video').pause();doc.removeEventListener('visibilitychange',sync);mediaQuery.removeEventListener?.('change',sync);}};
}
