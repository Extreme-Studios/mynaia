# MyNaiA Android

## Architecture

Capacitor **8.5.2** packages the existing frontend, including the cinematic Home and hero loops. `server.url` is deliberately absent. Local origin is explicitly **https://localhost**, matching `capacitor.config.json`; Java route handling and the frontend map dashboard/case routes to their bundled HTML pages. No second frontend or backend exists.

Public API origin: **https://mynaia.extremestudiosai.com**. Web continues to use same-origin `/api/` fetches. Android uses explicit CapacitorHttp requests only for backend API calls. Daily/media traffic remains in WebView; global fetch/XHR interception is disabled. Native HTTP carries the existing signed session through Android CookieManager. HttpOnly / Secure / SameSite=Strict remain unchanged, with no password in preferences or JavaScript storage. The frontend adapter does not expose native response headers. Native requests omit browser Origin; existing backend allows requests without Origin, while browser CSRF checks are preserved. No wildcard CORS or cross-origin browser permission was added.

Native logout expires only the production access cookie. It does not reset memories or delete account data. During a call, leaving/logout requires End confirmation; navigation while connection is pending is blocked.

Memory, child identity, reports and active **Profil 1–8** remain backend-mediated and shared with web. Privileged keys stay on Vercel.

## Toolchain and identity

| Setting | Value |
|---|---|
| Application ID | `com.extremestudios.mynaia` |
| App name | MyNaiA |
| Version | 1.0.0 / code 1 |
| minSdk | 24 |
| compileSdk / targetSdk | 36 / 36 |
| Gradle / AGP | 8.14.5 / 8.13.0 |
| JDK | 21 |

Use Android Studio 2025.2.1 or newer, Android SDK platform 36, build tools 36, and JDK 21. The Windows helper honors JAVA_HOME, or detects the local JDK 21 installation. Set ANDROID_HOME for another SDK location; `android/local.properties` is local and ignored. Dependencies: core/android/CLI only; no broad plugin stack.

Windows on this machine required a Java AF_UNIX workaround. The build helper sets a nonexistent Unix socket directory so Java falls back to TCP loopback. It also uses the Windows trusted root certificate store for build downloads, without disabling TLS verification. These are process-local build flags, not Android release network settings. Gradle is launched through its wrapper JAR to avoid unreliable batch execution in this shell.

```powershell
npm ci
npm run check
npm test
npm run android:sync
npm run android:open
npm run android:build:debug
npm run android:build:release
```

Android source is tracked under `android/`; generated copied assets, SDK paths, Gradle caches and artifacts are ignored. `android:sync` builds the same frontend and copies only public assets to `dist/android-web`. Subsequent frontend changes require rebuild/sync and a new APK/AAB. No remote code-push is implemented. Web/PWA remains supported; the service worker is disabled only in the packaged native runtime.

## Permissions and WebRTC

Manifest permissions: INTERNET, RECORD_AUDIO, CAMERA, MODIFY_AUDIO_SETTINGS. Camera hardware is optional. MODIFY_AUDIO_SETTINGS supports WebRTC audio routing; screen wake protection uses FLAG_KEEP_SCREEN_ON rather than a persistent WAKE_LOCK permission. No storage/location/contact permissions. AndroidX also generates the app-scoped signature permission `com.extremestudios.mynaia.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION`; it grants no camera/storage or other dangerous access.

Microphone is requested only after Start, before creating a conversation. Denial shows companion-specific copy and retry; permanent denial exposes **Buka Pengaturan Aplikasi**. Camera starts off on Android. It can be enabled in the room UI; denial/no camera leaves self-view hidden without an empty card. Self View Compact/Hidden remains unchanged.

The WebChromeClient accepts capture requests only from HTTPS local/approved Daily/Tavus hosts, maps resources to Android permissions and grants only the approved AUDIO_CAPTURE / VIDEO_CAPTURE resources. Unknown resources and origins are denied. Android runtime permission is the gate; arbitrary WebView permissions are never granted. Daily iframe integration and existing conversation pipeline are preserved. Muted hero autoplay is allowed; failed media still uses the poster.

Android System WebView (or Chrome on older Android) must be current. If a physical-device call fails, first update System WebView/Chrome and check microphone/camera permission. No TWA or Custom Tab call fallback is implemented prematurely. Physical-device WebRTC compatibility is **unverified**, despite successful compilation and mocks.

## Presentation and lifecycle

The adaptive launcher mark reuses MyNaiA's M identity, with dark navy background. Native splash is short, handing off to the existing web cinematic intro. Status/navigation bars use dark appearance. Active calls use immersive mode, with transient bars available by swipe. Portrait and landscape are supported; no global orientation lock. Safe-area CSS and resize-on-keyboard remain active.

Back closes Settings first, asks **Akhiri percakapan?** during an active call, returns Home from other pages, and exits from Home. Native wake protection applies only to foreground active calls; background/end/destruction releases it. Resume keeps the same session and existing status/reconnect behavior; it never starts a new conversation. Existing decorative animation pause during calls is retained. Network changes do not introduce automatic conversation retries.

PDF export downloads through the authenticated native API, validates PDF content, writes only to `cache/reports/`, and opens an explicit Android share chooser. The FileProvider exposes only that directory. No public storage or public PDF URL is used. Previous cache reports are replaced on the next explicit export. Reports can contain private child data; screenshots remain allowed as requested. Console/session content is not persisted in Android logs.

## Signing and distribution

Debug APK uses the local Android debug certificate and is suitable for device validation. Release artifacts are unsigned until production signing is configured. Never use the debug certificate as a production signing identity.

Copy `android/keystore.properties.example` to the ignored `android/keystore.properties` and fill the local keystore path, alias and passwords. Alternatively use process environment variables MYNAIA_KEYSTORE, MYNAIA_STORE_PASSWORD, MYNAIA_KEY_ALIAS and MYNAIA_KEY_PASSWORD. Do not commit or print their values.

To create an upload keystore interactively (passwords are prompted):

```powershell
keytool -genkeypair -v -keystore mynaia-upload.jks -alias mynaia-upload -keyalg RSA -keysize 3072 -validity 10000
```

Keep the keystore outside source control with a secure backup. Rebuild release; verify its certificate with apksigner/jarsigner. Bump versionCode for every Play upload. Play Console still requires app registration, signed AAB, privacy policy, accurate Data Safety/child audience declarations and store/review preparation. No Play upload is performed automatically.

Outputs are copied to ignored `release/android/`: MyNaiA-debug.apk, MyNaiA-release-unsigned.apk (or MyNaiA-release.apk with signing), MyNaiA-release.aab. An unsigned AAB cannot be submitted to Play.

## Physical-device validation remaining

1. Install debug APK and open Home; verify portrait/landscape, keyboard, notch and Back.
2. Login/logout; open Profil API, Naia, Dr. Paws, child selector, dashboard and case view.
3. Verify muted hero loops, poster fallback, navigation and acceptable performance.
4. Manually start **one** 3-minute call only when ready: microphone, optional camera, avatar/audio, lipsync, WebRTC stability, Compact/Hidden self-view, immersive mode and End.
5. Test mic denial/permanent denial and camera denial separately; do not allow failed starts to create extra sessions.
6. Background/resume and network change must preserve the same session; Back cancellation must keep it running; End must release wake/decoration/camera resources.
7. Check shared memory/subject history across web and Android and explicit PDF opening/sharing.

Do not mark the milestone PASSED before the physical-device call gate. Zero automated Tavus conversations are used during implementation.

References: [Capacitor Android](https://capacitorjs.com/docs/android), [CapacitorHttp](https://capacitorjs.com/docs/apis/http), [configuration](https://capacitorjs.com/docs/config).
