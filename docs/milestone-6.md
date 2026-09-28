> Previous orb-based presentation was rejected. The current character-first patch below supersedes its visual design; prior evidence remains a historical record.

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

## Character-first visual fix - 2026-09-28

The orb/egg meshes, nested sphere geometry and orbital rings were removed completely from the active scene. Three.js now draws a restrained depth field, particles, thin atmospheric light paths and the N splash mark; it no longer stands in for either character. WebGPU -> WebGL -> CSS fallback remains. Character visuals are semantic HTML image/video layers above the atmosphere.

The first interim stills were clean crops from the supplied Anna Casual and Dr. Paws screenshots. At the user's subsequent request, both were replaced with regenerated high-resolution 1086x1448 PNGs from built-in imagegen, preserving the reference face/fur/hair and clothing. They are regenerated AI assets, not official original Tavus stills; exact likeness is subject to human review. No screenshot UI, badges or overlay text remains.

Home is one immersive two-zone scene: Naia on the left and Dr. Paws on the right, masked large portraits, soft backlight, descriptive HTML and clear CTA. Mobile stacks the zones with portraits offset to the right and readable copy to the left. Hover, keyboard focus and pointer/tap focus brighten one side and gently recede the other. Pointer parallax moves HTML media at a different depth from the particles. Selection enlarges the chosen portrait and retains the 0.72-second camera transition. Splash duration stays 3.5 seconds.

Precall uses the matching portrait with invitation, duration and existing child-profile controls. Compact/Hidden self-view and real call/fullscreen controls remain unchanged. Active calls hide/pause all decorative videos and Three.js. Reduced motion or hidden documents retain posters and pause loops. Poster data is visual UI, not persistent memory.

### Asset pipeline

Source folder: app/frontend/assets/hero/. Required PNG posters: naia-hero-poster.png and dr-paws-hero-poster.png. Optional loops: naia-hero-loop.mp4/webm and dr-paws-hero-loop.mp4/webm. Build copies approved filenames, removes obsolete generated video copies and writes a manifest from present files. No loops currently exist; missing loops are never requested. Poster remains beneath video until loadeddata, and autoplay/decode/network failure falls back without retrying failed media. The video element is muted, playsinline and looping. No videos are generated or uploaded to Google Flow by this patch.

Flow reference files, production prompts and replacement guide are in docs/flow/. Add reviewed videos locally and rebuild/deploy to activate them. Keep portrait framing, complete head/ears and stable loop seam. Release/cache 20 versions the entry, dependencies, posters and manifest; API responses stay outside the cache.

### Validation

Screenshot QA inspected Home and both precall modes at 1366x768 and 390x844, plus 768px-wide tablet Home, CSS fallback, and mobile mock fullscreen. Files are in docs/visual-qa/character-first/. All heads/ears and CTAs remain visible in the inspected views. All three routes were checked at 360, 390, 430, 768, 1024, 1366 and 1440: 21 combinations, no horizontal overflow and all posters loaded at 1086x1448. Dr. Paws desktop Start bottom is 693px within the 768px viewport. Latest local console returned zero errors/warnings. Mock fullscreen keeps compact self-view, exit and controls visible, with Three.js paused and every hero video paused/hidden. Video-present/loaded/error/autoplay behavior is tested using mocks; no actual generated video loop, live call, physical device or real GPU performance measurement is claimed. Final local gates passed: check, 60/60 tests, build, whitespace check. All tests are local/mock; no Tavus live session or minutes, no new PAL, and no change to stored Tavus voice/persona, memory, API keys, profiles, authentication or transcript ingestion.

### Character-first production record

- Code/assets commit: `1fd6369`, pushed to Extreme-Studios/mynaia main.
- Existing Vercel project mynaia: deployment `dpl_9m1QXB1DapGbManDAYm7jHGPy1VE` reported READY. URL: https://mynaia-o6k8chzxs-extreme-studios-projects.vercel.app
- Custom domain https://mynaia.extremestudiosai.com/ inspected after deployment: entry release 20, WebGPU, both 1086x1448 regenerated posters loaded, no horizontal overflow. Home and keyboard navigation to /naia precall verified. No new console errors/warnings during the final production checks.
- Final production screenshots in character-first/: production-desktop.jpg, production-mobile.jpg, production-naia-mobile.jpg. No Start or live conversation action was taken. Google Flow generation remains manual; reference stills and prompts are ready.
