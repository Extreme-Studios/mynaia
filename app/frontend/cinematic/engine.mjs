import { WebGLRenderer, ACESFilmicToneMapping, SRGBColorSpace } from 'three';
import { chooseQuality } from './quality.mjs';
import { createScene, disposeScene } from './scene.mjs';

const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

export function createCinematic({ route = '/', rendererMode = 'auto' } = {}) {
  const root = document.querySelector('#cinematic-root');
  const quality = chooseQuality({ width: innerWidth, memory: navigator.deviceMemory || 8,
    cores: navigator.hardwareConcurrency || 8, reduced: reducedMotion() });
  const world = createScene(quality.particles);
  let renderer;
  let disposed = false;
  let callActive = false;
  let intro = true;
  let transitioning = false;
  let introTimeline;
  let lastFrame = 0;
  let focus = route === '/dr-paws' ? 'paws' : route === '/naya' ? 'naya' : '';
  let time = 0;
  const pointer = { x: 0, y: 0 };
  const target = { x: 0, y: 0 };

  function positionRoute() {
    if (route === '/') return;
    const selected = (route === '/naya' ? world.naya : world.paws).group;
    selected.position.set(0, innerWidth < 680 ? 1.75 : 0.9, -0.4);
    selected.scale.setScalar(innerWidth < 680 ? 0.52 : 1);
  }

  function applySize() {
    if (!renderer) return;
    const width = innerWidth, height = innerHeight;
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, quality.pixelRatio));
    renderer.setSize(width, height, false);
    world.resize(width, height);
    positionRoute();
  }
  function frame(timestamp = 0) {
    if (disposed || callActive || document.hidden) return;
    const delta = lastFrame ? Math.min((timestamp - lastFrame) / 1000, 0.05) : 0;
    lastFrame = timestamp;
    if (!reducedMotion()) time += delta * 0.48;
    target.x += (pointer.x - target.x) * 0.025;
    target.y += (pointer.y - target.y) * 0.025;
    if (!transitioning) {
      world.camera.position.x += ((focus === 'naya' ? -0.36 : focus === 'paws' ? 0.36 : 0) + target.x - world.camera.position.x) * 0.025;
      world.camera.position.y += (target.y - world.camera.position.y) * 0.025;
    }
    world.naya.core.rotation.y = Math.sin(time) * 0.17;
    world.paws.core.rotation.y = -Math.sin(time * 0.8) * 0.2;
    world.naya.group.rotation.z = Math.sin(time * 0.7) * 0.025;
    world.paws.group.rotation.z = -Math.sin(time * 0.8) * 0.03;
    world.dust.rotation.y = time * 0.007;
    world.lightBars.rotation.z = time * 0.1;
    try { renderer.render(world.scene, world.camera); } catch { fallback(); }
  }
  function resume() { if (renderer && !callActive && !document.hidden && !disposed) renderer.setAnimationLoop(frame); }
  function pause() { renderer?.setAnimationLoop(null); lastFrame = 0; }
  function fallback() {
    pause();
    root.dataset.renderer = 'css';
    root.classList.remove('cinematic-ready');
    root.classList.add('cinematic-fallback');
    renderer?.domElement.remove();
    renderer?.dispose(); renderer = null;
  }
  function onPointer(event) {
    if (intro || reducedMotion()) return;
    pointer.x = (event.clientX / innerWidth - 0.5) * 0.34;
    pointer.y = (0.5 - event.clientY / innerHeight) * 0.24;
  }
  function onVisibility() { if (document.hidden) pause(); else resume(); }
  addEventListener('resize', applySize);
  addEventListener('pointermove', onPointer, { passive: true });
  document.addEventListener('visibilitychange', onVisibility);

  const ready = (async () => {
    try {
      if (rendererMode === 'css') { fallback(); reveal(); return false; }
      if (rendererMode === 'auto' && navigator.gpu && isSecureContext) {
        try {
          const { WebGPURenderer } = await import('three/webgpu');
          renderer = new WebGPURenderer({ antialias: false, alpha: true });
          await renderer.init();
          root.dataset.renderer = renderer.backend?.isWebGPUBackend ? 'webgpu' : 'webgl';
        } catch {
          renderer?.dispose(); renderer = null;
        }
      }
      if (!renderer) {
        renderer = new WebGLRenderer({ antialias: quality.level === 'high', alpha: true, powerPreference: 'low-power' });
        root.dataset.renderer = 'webgl';
      }
      if (disposed) { renderer.dispose(); renderer = null; return false; }
      renderer.outputColorSpace = SRGBColorSpace;
      renderer.toneMapping = ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.65;
      renderer.domElement.setAttribute('aria-hidden', 'true');
      renderer.domElement.tabIndex = -1;
      root.prepend(renderer.domElement);
      renderer.domElement.addEventListener('webglcontextlost', fallback, { once: true });
      root.classList.add('cinematic-ready');
      applySize();
      if (route !== '/' || !intro) reveal();
      else {
        world.naya.group.visible = false;
        world.paws.group.visible = false;
        world.logo.visible = true;
        world.lightBars.visible = true;
      }
      resume();
      return true;
    } catch {
      fallback();
      return false;
    }
  })();

  function reveal(stopIntro = true) {
    if (stopIntro) introTimeline?.kill();
    if (disposed) return;
    intro = false;
    world.logo.visible = false;
    world.lightBars.visible = false;
    world.naya.group.visible = route !== '/dr-paws';
    world.paws.group.visible = route !== '/naya';
    positionRoute();
    world.camera.position.z = 9.4;
    root.classList.add('worlds-visible');
  }
  async function playIntro(duration = 3.5) {
    const started = performance.now();
    await ready;
    if (!renderer || route !== '/' || !intro) return;
    duration = Math.max(0, duration - (performance.now() - started) / 1000);
    if (reducedMotion() || duration < 1) { reveal(); return; }
    const gsap = window.gsap;
    if (!gsap) { setTimeout(reveal, duration * 1000); return; }
    introTimeline = gsap.timeline();
    introTimeline.fromTo(world.logo.scale, { x: 0.1, y: 0.1, z: 0.1 },
      { x: 1, y: 1, z: 1, duration: duration * 0.55, ease: 'power2.out' }, 0)
      .to(world.camera.position, { z: 5.7, duration: duration * 0.72, ease: 'power1.inOut' }, 0)
      .call(() => reveal(false), [], duration * 0.72)
      .fromTo(world.camera.position, { z: 5.7 }, { z: 9.4, duration: duration * 0.28, ease: 'power2.out' }, duration * 0.72);
  }
  function focusWorld(which = '') {
    focus = which;
    if (!renderer || intro) return;
    const n = which === 'paws' ? 0.55 : 1;
    const p = which === 'naya' ? 0.55 : 1;
    if (window.gsap && !reducedMotion()) {
      window.gsap.to(world.naya.light, { intensity: 12 * n, duration: 0.45, overwrite: true });
      window.gsap.to(world.paws.light, { intensity: 12 * p, duration: 0.45, overwrite: true });
    } else { world.naya.light.intensity = 12 * n; world.paws.light.intensity = 12 * p; }
  }
  async function transitionTo(which) {
    await ready;
    if (!renderer || reducedMotion() || !window.gsap) return;
    focusWorld(which);
    transitioning = true;
    return new Promise((resolve) => {
      window.gsap.to(world.camera.position, { x: which === 'naya' ? -1.5 : 1.5, z: 6.2,
        duration: 0.72, ease: 'power2.inOut', onComplete: resolve });
    });
  }
  function setCallActive(active) {
    callActive = active;
    root.classList.toggle('cinematic-paused', active);
    if (active) pause(); else resume();
  }
  function destroy() {
    if (disposed) return;
    disposed = true; pause();
    introTimeline?.kill();
    for (const target of [world.camera.position, world.logo.scale, world.naya.light, world.paws.light]) window.gsap?.killTweensOf(target);
    removeEventListener('resize', applySize);
    removeEventListener('pointermove', onPointer);
    document.removeEventListener('visibilitychange', onVisibility);
    disposeScene(world.scene);
    renderer?.dispose(); renderer?.domElement.remove();
  }
  return { ready, playIntro, reveal, focusWorld, transitionTo, setCallActive, destroy, quality };
}
