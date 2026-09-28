# Arsitektur MyNaiA — Milestone 5

## Milestone 7 — assessment Dr. Paws

Assessment adalah lapisan terpisah di atas sesi Dr. Paws dan memori Supabase yang sudah ada. `/dr-paws/dashboard` memakai password/cookie akses existing. Sebelum sesi terstruktur, backend memvalidasi UUID profil anak, template asli tersimpan, dan consent orang dewasa; lalu menggabungkan tujuan wawancara ringkas dengan konteks memori anak. Catatan profesional hanya dikirim ke konteks realtime bila dipilih eksplisit. Free chat tetap memakai payload lama. Setelah sesi, transkrip yang sudah tersimpan diproses Gemini dengan skema observasi serta referensi nomor giliran anak; laporan disimpan sebagai draf terpisah dari memori, lalu ditinjau manusia. PDF dibuat privat saat diminta dan hanya untuk REVIEWED/FINAL. Seluruh tabel assessment baru memiliki RLS dan akses service role di server; tidak ada public report bucket. Lihat `docs/milestone-7.md` untuk skema, batasan akses prototype single-user, dan validasi.

## Multi-Tavus Profile Engine

Supabase menyimpan `naya_app_settings.tavus_active_profile` sebagai nomor global 1–8 dan tetap menjadi satu-satunya sumber memori permanen. Vercel menyimpan delapan set kredensial Tavus; backend membaca nomor aktif dari Supabase pada setiap Start, memilih PAL dan Face sesuai mode, lalu menyimpan `tavus_profile_used` bersama PAL, Face, dan conversation ID di sesi. End, status provider, dan pengambilan transkrip memakai profil yang tercatat pada sesi, sehingga switch manual tidak memindahkan sesi berjalan. Memori Naia memakai ID pengguna yang sama di semua profil. Dr. Paws tetap terisolasi dalam namespace mode sendiri.

Password akses awal menjadi satu-satunya gerbang dashboard dan Settings. API profil memeriksa cookie akses yang sama (HttpOnly, SameSite=Strict) dan Origin pada POST; tidak ada admin secret kedua. API profil mengembalikan status konfigurasi tanpa key. Inspeksi profil hanya memakai Tavus GET untuk autentikasi dan akses PAL/Face; tidak ada create PAL atau conversation di jalur itu. Profil dengan PAL/Face yang belum diisi tidak dapat memulai mode terkait. Kegagalan create tidak memicu rotasi profil. Aplikasi menampilkan petunjuk memeriksa usage di dashboard Tavus tanpa mengarang sisa menit.

Satu situs menyediakan home `/`, Naia `/naia`, dan Dr. Paws `/dr-paws`. Browser memakai UI video call vanilla JS; Vercel memegang credential dan memilih PAL/Face dari mode. Naia memakai PAL existing `p54bfaf633c5` dan Face `rc9cff32ceba`; Dr. Paws memakai PAL `pf2c904714a5` dan Face `r21a52c53fa4`. Frontend tidak menerima API key.

Supabase adalah satu-satunya memori permanen. Migrasi `002_mode_namespaces.sql` memberi default `mode=naya` untuk seluruh data lama; `004_dr_paws_subject_memory.sql` menambah `subject_id` UUID untuk Dr. Paws. Semua query memori Naia dibatasi `mode=naya`; Dr. Paws memakai `user_id + mode=dr_paws + subject_id` untuk session, summary, memori, dan open loop. Tavus hanya menangani percakapan realtime dan sumber transkrip. Mode dipilih sebelum call; backend menolak durasi selain 3/5/10/20 menit.

## Dr. Paws Persistent Memory

```text
Supabase
├── Naia memory (mode=naya, subject_id=NULL)
└── Dr. Paws (mode=dr_paws)
    ├── Subject A memory (subject_id UUID A)
    ├── Subject B memory (subject_id UUID B)
    └── ...
```

`naya_subjects` menyimpan pemilik, nama tampilan, nama panggilan opsional, dan waktu reset. UI meminta profil aktif sebelum Start; backend memvalidasi UUID serta kepemilikannya sebelum memanggil Tavus. Sebelum sesi, backend mengambil maksimal enam fakta terbaru, satu ringkasan terakhir, dan dua open loop untuk profil itu; hasilnya dibatasi 2.200 karakter. Setelah sesi, transkrip Tavus masuk ke Supabase, lalu Gemini mengekstrak hanya fakta ringan yang dikatakan anak. Validator menolak label klinis/psikologis dan data sensitif untuk memori persisten. Summary yang sensitif diganti teks netral. Key fakta stabil membuat preferensi terbaru menggantikan versi lama yang aktif. `Reset ingatan` menghapus hanya memori, ringkasan, dan open loop profil terpilih; arsip sesi/transkrip tetap ada. Waktu reset mencegah sesi lama yang tertunda membangun ulang memori tersebut. Status API hanya menampilkan jumlah profil dan sesi pending, tanpa isi memori.

PWA menyimpan shell statis saja. `/api/` selalu jaringan dan tidak pernah masuk cache service worker. Fullscreen dan Wake Lock adalah peningkatan browser yang gagal dengan aman. Daily Prebuilt tetap pemilik kontrol media; host hanya menampilkan status yang dapat dibuktikan. Self-view compact ditempatkan di kanan pada desktop dan floating kecil pada HP, dengan mode Hidden sebagai preferensi UI. Pengaturan kualitas video yang tidak didukung dihapus. Detail keputusan dan pengujian di `docs/milestone-5.md`.

Milestone 6 memakai Three.js di `app/frontend/cinematic/` untuk scene 3D splash, lingkungan dua karakter, depth particles, parallax kamera, dan pencahayaan. GSAP di `motion.mjs` menyelaraskan timeline splash serta transisi route. Renderer mencoba WebGPU pada browser aman, lalu WebGL, lalu visual CSS bila GPU gagal. Kualitas otomatis membatasi jumlah partikel dan pixel ratio pada perangkat kecil. Satu render loop berhenti ketika tab tersembunyi atau call Tavus aktif, dan resource GPU dibersihkan saat pagehide. HTML tetap memegang navigasi dan kontrol. Service worker v15 menyimpan shell statis, memakai network-first untuk navigasi, dan tidak menyimpan respons `/api/`. Tidak ada perubahan kontrak Tavus, Supabase, atau Gemini. Detail di `docs/milestone-6.md`.

## Sasaran pengalaman

Pengguna membuka aplikasi, melihat video Naia sebagai elemen utama, memberi izin microphone, lalu berbicara seperti panggilan video. Tahap stock Face adalah proof of concept identitas percakapan Naia; kesesuaian wajah Indonesia belum terbukti.

## Komponen dan batas

```text
Browser (UI, izin mic, media, kontrol)
  └─ Backend aplikasi di Vercel (session broker, retrieval, processing)
       ├─ Supabase (user ID, transkrip teks, ringkasan, memori, profil, open loop)
       ├─ Gemini (ekstraksi memori pasca-sesi)
       └─ Tavus CVI (PAL + Face, STT, TTS, lip sync, video, LLM hosted)
```

Backend menyimpan kunci Tavus, Gemini, dan Supabase di server, membuat sesi, mengembalikan URL sesi terbatas ke browser, dan mengakhiri sesi lewat API. Browser tidak menerima API key. PAL memuat persona Naia; Face menentukan tampilan avatar. LLM percakapan aktif adalah Tavus-hosted `tavus-gemma-4`; Gemini BYO tetap opsi rollback, sedangkan Gemini `generateContent` dipakai terpisah setelah sesi untuk memproses memori. Backend memuat context ringkas dari Supabase sebelum membuat sesi Tavus. `participant_tags` dan `memory_stores` Tavus tidak pernah dikirim; identitas Naia tidak bergantung pada PAL atau Tavus API key.

## Wireframe layar

```text
┌─────────────────────────────────────┐
│ Naia (AI)             ⚙ Settings    │
│                                     │
│       VIDEO AVATAR DOMINAN          │
│                                     │
│         ● Connecting/Listening/     │
│           Thinking/Speaking         │
│                                     │
│       🎙 Mic   🔇 Mute   ■ End       │
└─────────────────────────────────────┘
```

Desktop memakai video dominan dengan kontrol kecil di tepi bawah. Mobile menjaga rasio video, safe area, dan tombol yang mudah disentuh. Tidak ada panel chatbot penuh. Pada PoC Milestone 2, iframe Tavus mengelola microphone dan kontrol media di dalam ruang video; host menyediakan Start dan End. Status host hanya membuktikan halaman ruang termuat, bukan mic sudah aktif atau avatar sedang mendengarkan. Detail ada di `docs/milestone-2.md`.

## Model state sesi

Target jangka panjang: `idle → connecting → listening ↔ thinking ↔ speaking → ended`, dengan `error/reconnecting` bila jaringan putus. PoC iframe saat ini hanya mengetahui `ready → connecting → room opened → ended/error`; status Listening/Thinking/Speaking dan izin mic yang ditangani Tavus harus dilihat di dalam ruang video. Saat user menyela, perilaku turn-taking diuji manual. Status yang tidak disediakan iframe tidak dikarang oleh host.

## Memori Milestone 4

### Konteks sesi

Tavus menangani konteks selama panggilan. Setelah selesai, backend mengambil `application.transcription_ready` lewat GET conversation verbose dan menyimpan transkrip teks per giliran di Supabase. Transkrip ini arsip historis; audio/video tidak disimpan.

### Persistent memory

**PERSISTENT MEMORY PROVIDER = SUPABASE. TAVUS MEMORY = DISABLED.** `users.id = naya_primary_user` untuk prototype single-user. Sebelum sesi, backend mengambil beberapa entri penting/terbaru dan menyusun `conversational_context` maksimum 5.000 karakter. Selama sesi Tavus hanya menangani percakapan realtime. Sesudah sesi, backend mengambil transkrip Tavus lalu menyimpannya di Supabase; Gemini membuat ringkasan, fakta terpilih, profil, dan open loop untuk Supabase. Identitas tidak berasal dari Tavus key, PAL, Face, IP, browser, atau perangkat. Kategori dan batas privasi ada di `docs/milestone-4.md`.

Skema ada di `supabase/migrations/001_naya_memory.sql`: tujuh tabel berawalan `naya_` dengan RLS tanpa policy browser. Vercel tidak dipakai untuk file/state permanen. Untuk multi-user di masa depan, login harus memetakan tiap user ke ID berbeda. Endpoint `/api/memory/status` hanya mengungkap status/jumlah pending dengan provider `supabase`; `/api/memory/sync` tersedia untuk sinkronisasi tertunda dan dibatasi gerbang akses di Vercel. Bila Supabase belum dikonfigurasi, create conversation ditolak sebelum memanggil Tavus. Memory store Tavus lama, bila ada, orphaned/unused dan tidak dihapus otomatis.

## Privasi dan keamanan awal

Kunci API hanya di backend/env lokal. Endpoint sesi kelak perlu autentikasi, rate limit, batas durasi, dan kontrol anggaran sebelum pilot. Pengguna perlu penjelasan bahwa avatar dan suara dihasilkan AI. Detail retensi media/transkrip Tavus dan persetujuan pengguna diperiksa lagi sebelum sesi nyata.

## Character-first cinematic visuals

Home and precall use regenerated Anna Casual / Naia and Dr. Paws portrait assets. Three.js remains atmospheric (depth, particles, camera, light paths), with no orb/egg substitute characters. The HTML media layer supports required PNG posters and optional muted MP4/WebM loops discovered at build time. Missing/failed videos retain posters; reduced motion, hidden tabs and active calls pause decorative playback. Existing memory, live Tavus, subject/profile and authentication flows are unchanged.

See docs/flow/README.md for exact filenames, asset replacement, and manual Google Flow prompts. The regenerated stills are image-to-video references, not official stock source photos or a claim of exact likeness. Hero videos are decorative and never replace the live Tavus face.
