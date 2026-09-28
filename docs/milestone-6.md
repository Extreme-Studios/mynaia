# Milestone 6 — Cinematic Product UI

Status: implementation ready; human product UI validation required. No Tavus conversation was created during development or visual QA.

## Visual identity

MyNaiA uses a dark navy and charcoal canvas, restrained violet and cyan light, clean sans-serif typography, and large spacing. Naya uses calm blue-green tones; Dr. Paws uses warmer tones without presenting as a clinical service. The landing page explains the product with the headline “Teman AI yang mengenal dan mengingatmu,” two prominent character cards, and three short benefits. There are no fabricated testimonials, metrics, pricing, or medical claims.

## Motion and navigation

The only new motion dependency is GSAP. A first visit in a browser session plays a 2.7-second branded sequence; installed PWA launch uses a 1.1-second variant. Repeat navigation skips the full intro. Reduced-motion preference uses a simple 0.25-second fade. The full intro offers Skip after 2 seconds and has a CSS safety exit at 4 seconds if JavaScript fails. Local page transitions take 0.22 seconds. Call video does not use decorative animation.

## Mode and call UI

Naya and Dr. Paws retain the existing routes, PAL/Face selection, Tavus profile engine, access gate, duration whitelist, Supabase memory, Gemini extraction, and transcript flow. Before a call the UI shows character identity, a short invitation, duration, and a single Start action. Dr. Paws profiles appear as selectable chips; the existing native select remains available to assistive technology. The memory reset action is in Settings. The active call hides landing content, gives the Tavus video the main canvas, and places a compact toolbar at the bottom. Self-view remains a right-side card on desktop and a small floating panel on phone, with Compact/Hidden preference. Fullscreen keeps the avatar dominant and the exit control visible. The end state covers the video with a MyNaiA message and actions to talk again or go home.

The host only reports states it can observe: ready, connecting, room joined, ended, and error. It does not invent listening, thinking, speaking, microphone, or avatar quality states. Errors shown to normal users are short and do not include provider details. The Settings panel keeps Tavus Engine controls behind the existing app access gate and never prints keys.

## PWA and accessibility

The manifest colors match the redesign. Static cache v10 includes GSAP and motion assets; Daily JS loads only after Start and is not pre-cached. Navigation uses network-first `no-store`; `/api/` requests bypass the service worker, including login and conversation responses. On service worker activation the page reloads when no call is active, avoiding a stale shell after deployment. Login status has a 10-second fetch timeout rather than indefinitely showing “Memeriksa akses...”. Keyboard focus remains visible; controls and chips use at least 44 px touch targets where practical. Reduced motion suppresses decorative movement.

## Verification boundary

Automated tests use mocked Tavus and Supabase calls. Visual QA uses static mock states; it never starts a Tavus room. Browser checks found no horizontal overflow on the landing at 360, 390, 430, 768, 1024, 1366, and 1440 px. Naya and Dr. Paws precall, call, fullscreen, and end mock states were checked at 390 and 1366 px. In the call mock, the desktop avatar had the main column with the self-view card on the right; the mobile card floated inside the stage. Fullscreen mock scroll height matched the 850 px viewport, and the end state hid the video canvas. These checks can verify layout, text, overflow, hidden/compact state, and fullscreen CSS. A real conversation remains necessary for human review of avatar video, microphone, self-view on target devices, lipsync, latency, and call controls. Do not mark this milestone passed before that review.
