# Milestone 5 — Product UI, PWA, Multi-Mode

## Multi-Tavus Profile Engine

Patch ini mendukung delapan profil bernama **Tavis 1–8**. Semua delapan API key yang disimpan di Windows Credential Manager berhasil diautentikasi dengan API Tavus GET. Stock Face Naya dan Dr. Paws muncul pada daftar Face seluruh profil. PAL Naya dan Dr. Paws yang terkonfigurasi baru ada di profil 1; profil 2–8 sengaja parsial. Tidak ada PAL atau conversation baru yang dibuat selama patch, dan tidak ada auto retry atau auto rotasi. Untuk menyiapkan profil 2–8, buat/pilih PAL pada akun Tavus yang bersangkutan secara eksplisit, lalu pasang ID PAL di environment profil itu dan deploy ulang. PAL profil 1 tidak disalin lintas akun.

Migrasi `003_tavus_profile_switcher.sql` diterapkan pada proyek Supabase yang sudah ada. `naya_app_settings` memiliki RLS aktif dan akses service role saja, dengan `tavus_active_profile=1`. Kolom `naya_conversation_sessions.tavus_profile_used` bernilai 1–8, default 1 untuk sesi lama. Pilihan admin berlaku global untuk laptop dan HP pada sesi berikutnya. Sesi berjalan tetap memakai profil sebelumnya untuk End, status, dan transkrip. Memori tetap di Supabase, memakai identitas Naya yang sama, terlepas dari key/PAL/Face Tavus.

Password akses awal adalah satu-satunya login. Dashboard dan Settings tertutup sampai status login terverifikasi. API profil memakai cookie akses yang sama; tidak ada admin secret kedua atau form login di Settings. Cookie akses HttpOnly, SameSite=Strict, Secure di production, dan berlaku 24 jam. API profil hanya mengembalikan boolean konfigurasi. Tombol inspeksi memakai Tavus GET saja. Usage ditulis “check Tavus dashboard”; tidak ada estimasi menit. Kegagalan provider saat create menampilkan pesan singkat dan tidak beralih profil otomatis. Saat sesi berakhir, UI menampilkan “Sesi telah selesai.” dengan **Ngobrol lagi** dan **Kembali ke Beranda**; GET status provider berkala hanya berlangsung saat ada sesi aktif. Perilaku live ini belum divalidasi manusia.

Variabel environment per profil mengikuti `TAVUS_PROFILE_<1..8>_{API_KEY,NAYA_PAL_ID,NAYA_FACE_ID,DR_PAWS_PAL_ID,DR_PAWS_FACE_ID}`. Fallback variabel Tavus lama untuk profil 1 hanya berlaku bila key profil 1 belum diisi. Profil 2–8 tidak mengambil PAL dari profil 1. Source dan bundle frontend tidak boleh memuat secret. Uji mock tidak membuat conversation Tavus nyata.

Validasi engine profil sebelumnya: `npm run check`, 42/42 test mock, `npm run build`, `git diff --check`, dan audit nilai/nama secret pada aset frontend lulus. Setelah penyederhanaan akses ini, dashboard dan Settings memakai login awal yang sama; tidak ada form login kedua. Uji live conversation tidak dijalankan.

Status: implementation ready; human UI/live validation is still required. No Tavus conversation was created while implementing this milestone. Production remains one MyNaiA app at `https://mynaia.extremestudiosai.com`.

## Product and modes

- `/` is the mode selector. `/naya` and `/dr-paws` are refresh-safe mode screens. Both use the same app and Supabase project.
- Naya keeps PAL `p54bfaf633c5`, stock Face `rc9cff32ceba`, the existing runtime persona, and Supabase memory/context plus Gemini post-call extraction.
- Dr. Paws uses the stock Tavus Face `r21a52c53fa4` found by API list and a single new PAL `pf2c904714a5`. Its child-friendly prompt lives in `character/dr-paws/`; the PAL uses Indonesian, `tavus-auto`, Sparrow-2, low patience, medium interruptibility, idle off, and the Tavus-hosted fast model. No assessment, diagnosis, clinical scoring, or child profile extraction was added.
- Server environment uses `TAVUS_NAYA_PAL_ID` with `TAVUS_PAL_ID` fallback, plus `TAVUS_DR_PAWS_PAL_ID` and `TAVUS_DR_PAWS_FACE_ID`. API keys stay server-side. Dr. Paws Start is unavailable when its configuration is absent.

## Supabase namespace

`supabase/migrations/002_mode_namespaces.sql` adds `mode` to sessions, summaries, memories, open loops, and profile. Existing rows default to `naya`; the migration was applied to the existing `mynaia` Supabase project and checked. At migration time, the database contained two Naya sessions, seven Naya memories, and one Naya profile. The application filters every mode-specific read/write by `mode`. Dr. Paws archives sessions and transcript text under `dr_paws`, without reading Naya facts or creating a permanent child profile. Naya retains the Milestone 4 flow and stable single-user identity. `conversation_messages` inherits isolation through its session ID. Future multi-user work must use distinct account user IDs; device/IP are not identity.

## Session and controls

Allowed durations are exactly 3, 5, 10, or 20 minutes; default 5. Backend maps to 180/300/600/1200 seconds and rejects other values. The selector locks while connecting or active. The 20-minute option displays a Tavus-minute warning. There is no auto-start or create retry. The controller and local server reject overlapping starts. On duration expiry the browser asks the backend to end the same session; an already-ended Tavus response is checked with GET before recording End. Transcript processing can remain pending until Tavus exposes transcription; `/api/memory/sync` and the next pre-call pending pass handle this. The browser never creates another session automatically.

Fullscreen uses the browser Fullscreen API with a fixed `100dvh` fallback. Escape exits the fallback, and End restores the layout. Screen Wake Lock is requested during the call when available and released on End or when the tab is hidden. Offline state blocks Start and explains that internet is required. The Tavus/Daily iframe owns mic mute/unmute; the host mic control points to the real control in the video. The host does not claim a mute state, media permission, Listening, Thinking, or Speaking without media events. `Connected` means the room iframe loaded, not that audio/video quality was verified.

Quality defaults to **Auto** (adaptive WebRTC). Low and High are visible but disabled with “Memerlukan advanced video control”. The current plain Tavus conversation iframe gives the host no verified receive-layer control, so neither option changes the stream. Audio settings are untouched.

## PWA and deployment

The vanilla JS app has a manifest named MyNaiA, 192/512 icons, standalone display, theme colors, Apple metadata, and a service worker. The worker caches only the app shell and static files. It bypasses `/api/` entirely and never stores transcripts, context, conversation responses, or secrets. Offline opens the shell with an explicit no-connection message; conversations require a network. The Vercel build copies the static assets and rewrites the deep routes. No new runtime dependencies or framework were added.

## Verification and remaining human checks

Local mock tests cover mode routing and payloads, Face/PAL selection, duration whitelist, memory isolation, transcript ingestion, PWA static safety, existing Milestone 4 behavior, and no secret in frontend source. `npm run check`, `npm test` (37/37), and `npm run build` passed. Production deployment was READY; the custom domain returned HTTP 200 for `/`, `/naya`, `/dr-paws`, manifest, service worker, icons, health, mode status, and memory status. Both modes reported configured. Browser inspection found no console error and no horizontal overflow at 360, 390, 430, 768, 1024, and 1366 pixels. Browser inspection was UI only and used no Tavus minutes. One earlier ended Naya session remains pending transcript/memory processing; this was not marked complete or deleted. Human validation remains necessary for actual video, microphone controls, fullscreen on target devices, PWA installation, Naya recall after this deployment, and Dr. Paws Face/persona. Do not label those behaviors passed from mock tests.

Manual plan, only when the user chooses to spend Tavus minutes:

1. Desktop: open production, select Naya, choose 5 minutes and Auto, start once, inspect mic, enter/exit fullscreen, and End.
2. Phone: install/open PWA where browser offers it, start Naya, check viewport, fullscreen fallback, microphone, and continuity of prior memory.
3. Optional duration test: select 3 minutes and observe exact expiry; no automated wait or extra session was run.
4. Dr. Paws: start only after checking minute balance, verify the cartoon Face, Bahasa Indonesia, child-friendly behavior, and absence of Naya personal recall.

Future Dr. Paws assessment could add structured interviews, parent/professional review, and reports in a later milestone. None of those systems exists in Milestone 5.
