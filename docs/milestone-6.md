# Milestone 6 — Cinematic 3D rebuild

Status: implementation ready for human visual approval. No live Tavus conversation was created during this rebuild.

## Rendering architecture

The home and precall presentation use a real Three.js scene in `app/frontend/cinematic/`: `scene.mjs` builds the procedural worlds, rings, ribbons, depth particles, lights, and camera; `quality.mjs` selects automatic HIGH/MEDIUM/LOW budgets; `engine.mjs` owns the renderer, one animation loop, pointer parallax, scene transitions, pause, and cleanup. `motion.mjs` uses GSAP for the 3.5-second first-visit splash and 0.72-second character camera push. Meaningful text, links, settings, and call actions remain semantic HTML.

On a secure browser with WebGPU, the engine attempts `WebGPURenderer`. Initialization failure falls back to `WebGLRenderer`. If GPU startup fails altogether, the static CSS atmosphere remains visible and HTML controls remain usable. The scene has distinct depth layers: distant particles, light filaments, character sculptures with nested geometry and orbital paths, and foreground lighting. No remote visual assets, large video, or postprocessing stack are needed.

Automatic quality caps pixel ratio at 1.2/1.5/1.75 for LOW/MEDIUM/HIGH and uses 80/160/300 particles. Mobile defaults to LOW but still runs the 3D renderer when supported. Reduced motion minimizes scene movement and skips camera push. The loop stops while the page is hidden and during an active Tavus call; the 3D canvas is hidden while video has priority. `pagehide` disposes listeners, geometry, textures, materials, and renderer resources.

## Experience

First visit: dark, full-viewport spatial splash, a luminous N form, MyNaiA identity and tagline, then a camera move into the two-world selection environment. Repeat navigation skips the full sequence. Home uses continuous Naia and Dr. Paws zones instead of character cards or a feature grid. Hover/focus changes world lighting and camera drift; links remain keyboard accessible. Selection animates the camera toward that world before opening `/naia` or `/dr-paws`.

Precall pages keep a focused version of the same scene behind the character invitation and existing duration/profile controls. Active call retains the Tavus video layout and Compact/Hidden self-view behavior, with decorative rendering paused. The end state uses the existing MyNaiA message and actions. Backend contracts, PAL/Face/profile logic, Supabase memory, Gemini extraction, access control, and transcript flow are unchanged.

## PWA and validation

Static cache v17 includes the bundled Three.js entry, GSAP, and app shell. Navigation is network-first; `/api/` bypasses the service worker, and Daily video code is loaded only on Start. A controller update reloads the page only when no call is active.

QA must cover first open, home, both precall modes, mocked call, fullscreen and end states at desktop and mobile dimensions. Mock screens never call Tavus. Automated checks verify the scene architecture, adaptive quality, fallbacks, frontend contracts, and backend mocks. Human approval is still required for visual judgment and real device/call behavior.

## Verification record — 2026-09-28

- Three.js 0.181.2 and GSAP 3.15.0; esbuild bundles the procedural scene and separates the WebGPU module.
- Saved and inspected screenshots in `docs/visual-qa/`: first-open 1366×768, home, both precall modes, mock call, fullscreen mock, and end states at 1366×768 and 390×844. The first-open image captures the early energy field, not the entire timed animation. The renderer reported WebGPU with one canvas. Desktop self-view stayed to the right; mobile self-view stayed a small floating panel; fullscreen exit remained visible.
- Width checks at 360, 390, 430, 768, 1024, 1366, and 1440 found no horizontal overflow. Portrait tablet inspection caught clipped worlds; final world spacing and scale now account for viewport aspect ratio. Dr. Paws desktop controls fit within 1366×768 after shortening the precall stage. Screenshots use JPEG, with actual dimensions checked from the files.
- Forced WebGL and CSS mock runs were inspected. CSS uses zero canvases and keeps both HTML actions visible. Mock call pauses and hides the decorative renderer. Five repeated Home/character/Home navigations retained one canvas per document. This is a DOM lifecycle check, not a GPU heap stability measurement. Physical device performance, FPS, heat, and GPU memory were not measured.
- QA caught an intro/renderer initialization race on repeat Home navigation; ready now respects the completed intro state. Camera transition no longer competes with pointer updates. Render errors/context loss return to the CSS presentation. Final local QA console returned zero errors/warnings. The isolated QA server has no Tavus connection and returns 404 for unsupported API routes.
- The name shown in the UI, local persona files, context/extraction text, and docs is Naia. Preferred route is `/naia`; `/naya` remains a compatibility alias. Existing memory keys, environment variables, function identifiers, account credentials, and PAL IDs remain stable. Existing hosted Tavus PAL persona/greeting was not patched during this visual rebuild; it may still say Naya until separately updated.
- Production first-load inspection caught stale service-worker modules producing GSAP selector warnings. App module imports now include the release version, so the old cache cannot satisfy new dependencies.
- Final local gates: `npm run check` passed, `npm test` passed 52/52, `npm run build` passed, and `git diff --check` found no whitespace errors.
- All conversation tests use mocks. No live Tavus conversation, PAL creation, or conversation minutes were used.

## Production deployment verification

- Implementation commit: `6eb1fde` (cinematic rebuild starts at `ee461c2`). Pushed to `Extreme-Studios/mynaia` main.
- Existing Vercel project `mynaia`, production deployment `dpl_Hy9nHk2GoeECVbwTZLvSGYFE2hs8`, reported READY. Deployment URL: https://mynaia-9i2eexrvs-extreme-studios-projects.vercel.app
- Custom domain https://mynaia.extremestudiosai.com/ was inspected after deployment. Entry version `app.js?v=17`, renderer WebGPU, one canvas. Home and `/naia` precall displayed correctly. No errors/warnings appeared in console entries captured after the final reload and route navigation.
- Production screenshots: `visual-qa/production-desktop.jpg` (1366x768), `production-mobile.jpg` (390x844), and `production-naia-precall.jpg` (1366x768).
- No Start action, microphone/camera permission, live conversation, or Tavus minute usage. Human visual approval remains required; no Milestone 6 PASSED claim.
