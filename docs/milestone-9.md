# Milestone 9 — Android Edition

Implementation: Capacitor Android shell with bundled existing frontend, same production API/data/memory, package `com.extremestudios.mynaia`, version 1.0.0 (1). See [Android architecture and build guide](android.md).

Delivered source: `android/`, public platform adapter, Android bundling/build scripts, adaptive icon/native splash, permission and WebView resource gate, immersive/wake lifecycle, Back navigation, native logout and private PDF sharing. UI profile labels are **Profil 1–8**. No provider watermark removal, special crop or call pipeline rewrite.

SDK: min 24, compile/target 36. Capacitor 8.5.2, AGP 8.13.0, Gradle 8.14.5, JDK 21. Existing web/PWA and professional dashboard stay supported.

## Validation

- `npm run check`: PASS. `npm test`: **96/96 PASS** (78 existing + 18 Android checks).
- Web build: PASS. Final Android debug and release/APK/AAB builds: PASS.
- Native runtime Android/plugin binding: mock PASS. Debug signature: apksigner PASS.
- APK/AAB and bundled assets audited against local secret values: PASS, zero matches.
- Browser mock Home/Naia/Dr. Paws/dashboard/case: loaded without console errors; 390px layouts checked with no horizontal overflow. No Android/device media claims.
- Native API transport keeps existing secure signed cookies; browser origin checks/CORS are unchanged.
- Required real-device authentication, permissions, WebRTC, media playback and PDF behavior remain human validation gates.
- Android UI screenshots or real WebRTC/audio quality are not claimed from compilation/mock results.
- No production child data seeded, no PAL created, zero automatic conversations/minutes.

## Build artifacts and status

Local artifact paths (relative to project root):

| Artifact | Bytes | Signing |
|---|---:|---|
| `release/android/MyNaiA-debug.apk` | 5,304,985 | Debug certificate verified |
| `release/android/MyNaiA-release-unsigned.apk` | 4,254,550 | Unsigned |
| `release/android/MyNaiA-release.aab` | 4,114,757 | Unsigned |

Production keystore is not configured. The release APK/AAB are prepared builds, not installable/Play-ready signed releases. Native source opens in Android Studio; actual IDE import and physical-device behavior remain unverified. No automatic installation to the connected device.

## Known limitations

Physical-device WebRTC and native cookie persistence require validation. Native API timeout is bounded; it does not automatically retry conversation creation. Force-stopping the app cannot guarantee an End request; provider maximum-duration behavior is still the session bound. No background call service or remote code-push is implemented. Cached exported PDF is app-private and is replaced on next export; sharing is explicitly initiated by the user.

CLI dependency audit reports a moderate uuid issue in Capacitor CLI's iOS xcode tooling; this dev-only dependency is not bundled into APK. No forced incompatible downgrade was applied.

Status: IMPLEMENTATION READY; **not PASSED** until physical-device WebRTC validation.
