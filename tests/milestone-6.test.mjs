import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { splashPlan } from '../app/frontend/motion.mjs';
import { chooseQuality } from '../app/frontend/cinematic/quality.mjs';

const root = new URL('../', import.meta.url);
const file = (name) => readFile(new URL(name, root), 'utf8');

test('splash full sekali per sesi, singkat pada PWA, dan cepat untuk reduced motion', () => {
  assert.deepEqual(splashPlan(), { duration: 3.5, full: true });
  assert.deepEqual(splashPlan({ seen: true }), { duration: 0, full: false });
  assert.deepEqual(splashPlan({ reduced: true }), { duration: 0.25, full: false });
  assert.deepEqual(splashPlan({ standalone: true }), { duration: 1.1, full: false });
});

test('landing dan kedua mode menampilkan produk tanpa konten teknis di permukaan', async () => {
  const html = await file('app/frontend/index.html');
  assert.match(html, /id="splash"/);
  assert.match(html, /Teman AI yang mengenal dan mengingatmu/);
  assert.match(html, /href="\/naia"/);
  assert.match(html, /href="\/dr-paws"/);
  assert.match(html, /id="subject-options"/);
  assert.match(html, /id="subject-manage"/);
  assert.match(html, /id="postcall-title"/);
  assert.match(html, /id="exit-fullscreen"/);
  assert.match(html, /id="self-view-toggle"/);
  assert.match(html, /id="call-settings"/);
  assert.match(html, /id="debug-panel" class="debug-panel" hidden/);
  assert.doesNotMatch(html, /PAL ID|conversation_id|SUPABASE_SERVICE_ROLE_KEY|GEMINI_API_KEY|TAVUS_API_KEY/);
});

test('motion dan CSS menjaga preferensi aksesibilitas serta memprioritaskan call', async () => {
  const motion = await file('app/frontend/motion.mjs');
  const css = await file('app/frontend/styles.css');
  const sw = await file('app/frontend/sw.js');
  const manifest = JSON.parse(await file('app/frontend/manifest.webmanifest'));
  assert.match(motion, /sessionStorage\.setItem\('mynaia\.introSeen'/);
  assert.match(motion, /prefers-reduced-motion/);
  assert.match(motion, /timeline\.fromTo/);
  assert.match(motion, /cinematic\?\.playIntro/);
  assert.match(motion, /cinematic\?\.transitionTo/);
  assert.match(css, /\.in-call \.stage/);
  assert.match(css, /\.in-call \.call-heading/);
  assert.match(css, /@media\(prefers-reduced-motion:reduce\)/);
  assert.match(css, /\.subject-choice\[aria-pressed=true\]/);
  assert.match(css, /\.app-fullscreen \.settings-panel:not\(\[hidden\]\)/);
  assert.match(sw, /mynaia-static-v20/);
  assert.match(sw, /url\.pathname\.startsWith\('\/api\/'\)/);
  assert.match(sw, /cache: 'no-store'/);
  assert.doesNotMatch(sw, /daily-esm\.js/);
  assert.equal(manifest.theme_color, '#0b1020');
});

test('home memakai dua zona sinematik tanpa card dan ilustrasi kepala lama', async () => {
  const html = await file('app/frontend/index.html');
  assert.match(html, /id="cinematic-root"/);
  assert.match(html, /class="character-worlds"/);
  assert.match(html, /data-world="naya"/);
  assert.match(html, /data-world="paws"/);
  assert.doesNotMatch(html, /mode-card|benefits|human-face|cat-face/);
});

test('engine menyediakan WebGPU, WebGL, CSS fallback dan pause untuk call', async () => {
  const engine = await file('app/frontend/cinematic/engine.mjs');
  const app = await file('app/frontend/app.js');
  assert.match(engine, /import\('three\/webgpu'\)/);
  assert.match(engine, /new WebGLRenderer/);
  assert.match(engine, /cinematic-fallback/);
  assert.match(engine, /document\.hidden/);
  assert.match(engine, /renderer\?\.setAnimationLoop\(null\)/);
  assert.match(engine, /disposeScene/);
  assert.match(app, /cinematic\.setCallActive\(active\)/);
});

test('kualitas dekoratif dibatasi untuk mobile dan perangkat lemah', () => {
  assert.deepEqual(chooseQuality({ width: 390, memory: 8, cores: 8 }).level, 'low');
  assert.equal(chooseQuality({ width: 1024, memory: 8, cores: 8 }).level, 'medium');
  assert.equal(chooseQuality({ width: 1440, memory: 8, cores: 8 }).level, 'high');
  assert.equal(chooseQuality({ width: 1440, memory: 8, cores: 8, reduced: true }).level, 'low');
  assert.ok(chooseQuality({ width: 390 }).pixelRatio <= 1.2);
});
