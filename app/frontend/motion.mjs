export function splashPlan({ seen = false, reduced = false, standalone = false } = {}) {
  if (seen) return { duration: 0, full: false };
  if (reduced) return { duration: 0.25, full: false };
  return { duration: standalone ? 1.1 : 3.5, full: !standalone };
}

export function startProductMotion(cinematic) {
  const splash = document.querySelector('#splash');
  const skip = document.querySelector('#skip-splash');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const standalone = matchMedia('(display-mode: standalone)').matches;
  let seen = false;
  try { seen = sessionStorage.getItem('mynaia.introSeen') === '1'; } catch { /* Storage may be blocked. */ }
  const plan = splashPlan({ seen, reduced, standalone });
  let timeline;
  let skipTimer;
  let finished = false;
  function finish() {
    if (finished) return;
    finished = true;
    timeline?.kill();
    clearTimeout(skipTimer);
    splash.hidden = true;
    skip.hidden = true;
    document.body.classList.add('intro-complete');
    try { sessionStorage.setItem('mynaia.introSeen', '1'); } catch { /* Private browsing. */ }
    cinematic?.reveal();
    if (!reduced && window.gsap) window.gsap.fromTo('.zone-copy',
      { y: 24, opacity: 0 }, { y: 0, opacity: 1, duration: 0.65, stagger: 0.12, ease: 'power2.out', clearProps: 'all' });
  }
  skip.addEventListener('click', finish);
  if (!plan.duration) { finish(); return; }
  cinematic?.playIntro(plan.duration);
  if (!window.gsap) { finish(); return; }
  const gsap = window.gsap;
  if (plan.full) {
    timeline = gsap.timeline({ onComplete: finish });
    timeline.set('.splash-content', { visibility: 'visible' }, 1.1);
    timeline.fromTo('.splash-content strong', { opacity: 0, y: 20, filter: 'blur(12px)' },
      { opacity: 1, y: 0, filter: 'blur(0px)', duration: 1, ease: 'power2.out' }, 1.2)
      .fromTo('.splash-overline', { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: 0.6 }, 1.1)
      .fromTo('.splash-content p', { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.6 }, 2.1)
      .to('.splash-content', { opacity: 0, scale: 1.2, duration: 0.55, ease: 'power2.in' }, 2.85)
      .to(splash, { opacity: 0, duration: 0.45 }, 3.05);
    skipTimer = setTimeout(() => { if (!finished) skip.hidden = false; }, 2000);
  } else {
    timeline = gsap.timeline({ onComplete: finish });
    timeline.set('.splash-content', { visibility: 'visible' }, 0)
      .fromTo('.splash-content', { opacity: 0, scale: 0.97 }, { opacity: 1, scale: 1, duration: plan.duration * 0.55 })
      .to(splash, { opacity: 0, duration: plan.duration * 0.45 });
  }
}

export function animateVisible(element) {
  if (!element || matchMedia('(prefers-reduced-motion: reduce)').matches || !window.gsap) return;
  window.gsap.fromTo(element, { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.35, ease: 'power2.out', clearProps: 'all' });
}

export function setupPageTransitions(cinematic) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches || !window.gsap) return;
  document.addEventListener('click', (event) => {
    const link = event.target.closest('a[href]');
    if (!link || event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || link.target) return;
    const next = new URL(link.href);
    if (next.origin !== location.origin || !['/', '/naia', '/naya', '/dr-paws'].includes(next.pathname) || next.pathname === location.pathname) return;
    event.preventDefault();
    const world = ['/naia', '/naya'].includes(next.pathname) ? 'naya' : next.pathname === '/dr-paws' ? 'paws' : '';
    if (location.pathname === '/' && world) {
      window.gsap.to('#app', { opacity: 0, duration: 0.5, ease: 'power2.in' });
      cinematic?.transitionTo(world).then(() => location.assign(next.href));
    } else window.gsap.to('#app', { opacity: 0, duration: 0.28, ease: 'power2.in', onComplete: () => location.assign(next.href) });
  });
}
