export function splashPlan({ seen = false, reduced = false, standalone = false } = {}) {
  if (seen) return { duration: 0, full: false };
  if (reduced) return { duration: 0.25, full: false };
  return { duration: standalone ? 1.1 : 2.7, full: !standalone };
}

export function startProductMotion() {
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
    if (!reduced && window.gsap) {
      window.gsap.fromTo('.home-copy > *, .mode-card, .benefits > div',
        { y: 18, opacity: 0 }, { y: 0, opacity: 1, duration: 0.55, stagger: 0.055, ease: 'power2.out', clearProps: 'all' });
    }
  }
  skip.addEventListener('click', finish);
  if (!plan.duration) { finish(); return; }
  if (!window.gsap) { setTimeout(finish, Math.round(plan.duration * 1000)); return; }
  const gsap = window.gsap;
  if (plan.full) {
    timeline = gsap.timeline({ onComplete: finish });
    timeline.fromTo('.splash-light', { opacity: 0, scale: 0.78 }, { opacity: 1, scale: 1, duration: 1.35, ease: 'power2.out' }, 0)
      .fromTo('.splash-emblem', { opacity: 0, scale: 0.8 }, { opacity: 1, scale: 1, duration: 0.75, ease: 'power2.out' }, 0.2)
      .fromTo('.splash-content strong', { opacity: 0, y: 18, scale: 0.94 }, { opacity: 1, y: 0, scale: 1, duration: 0.9, ease: 'power3.out' }, 0.24)
      .fromTo('.splash-content p', { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.5, ease: 'power2.out' }, 0.95)
      .to('.splash-content', { y: -25, opacity: 0, duration: 0.48, ease: 'power2.in' }, 2.1)
      .to(splash, { opacity: 0, duration: 0.35 }, 2.35);
    skipTimer = setTimeout(() => { if (!finished) skip.hidden = false; }, 2000);
  } else {
    timeline = gsap.timeline({ onComplete: finish });
    timeline.fromTo('.splash-content', { opacity: 0, scale: 0.97 }, { opacity: 1, scale: 1, duration: plan.duration * 0.55 })
      .to(splash, { opacity: 0, duration: plan.duration * 0.45 });
  }
}

export function animateVisible(element) {
  if (!element || matchMedia('(prefers-reduced-motion: reduce)').matches || !window.gsap) return;
  window.gsap.fromTo(element, { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.35, ease: 'power2.out', clearProps: 'all' });
}

export function setupPageTransitions() {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches || !window.gsap) return;
  document.addEventListener('click', (event) => {
    const link = event.target.closest('a[href]');
    if (!link || event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || link.target) return;
    const next = new URL(link.href);
    if (next.origin !== location.origin || !['/', '/naya', '/dr-paws'].includes(next.pathname) || next.pathname === location.pathname) return;
    event.preventDefault();
    window.gsap.to('#app', { opacity: 0, y: -8, duration: 0.22, ease: 'power2.in', onComplete: () => location.assign(next.href) });
  });
}
