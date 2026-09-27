# Arsitektur MyNaiA — Milestone 5

Satu situs menyediakan home `/`, Naya `/naya`, dan Dr. Paws `/dr-paws`. Browser memakai UI video call vanilla JS; Vercel memegang credential dan memilih PAL/Face dari mode. Naya memakai PAL existing `p54bfaf633c5` dan Face `rc9cff32ceba`; Dr. Paws memakai PAL `pf2c904714a5` dan Face `r21a52c53fa4`. Frontend tidak menerima API key.

Supabase adalah satu-satunya memori permanen. Migrasi `002_mode_namespaces.sql` memberi default `mode=naya` untuk seluruh data lama dan memungkinkan namespace `dr_paws` per user. Semua query memori Naya dibatasi `mode=naya`; Dr. Paws menyimpan session/transcript dengan `mode=dr_paws`, tanpa ekstraksi profil anak. Tavus hanya menangani percakapan realtime dan sumber transkrip. Mode dipilih sebelum call; backend menolak durasi selain 3/5/10/20 menit.

PWA menyimpan shell statis saja. `/api/` selalu jaringan dan tidak pernah masuk cache service worker. Fullscreen dan Wake Lock adalah peningkatan browser yang gagal dengan aman. Iframe Tavus/Daily tetap pemilik kontrol media; host hanya menampilkan status yang dapat dibuktikan. Quality Auto digunakan, Low/High belum tersedia pada integrasi iframe ini. Detail keputusan dan pengujian di `docs/milestone-5.md`.

## Sasaran pengalaman

Pengguna membuka aplikasi, melihat video Naya sebagai elemen utama, memberi izin microphone, lalu berbicara seperti panggilan video. Tahap stock Face adalah proof of concept identitas percakapan Naya; kesesuaian wajah Indonesia belum terbukti.

## Komponen dan batas

```text
Browser (UI, izin mic, media, kontrol)
  └─ Backend aplikasi di Vercel (session broker, retrieval, processing)
       ├─ Supabase (user ID, transkrip teks, ringkasan, memori, profil, open loop)
       ├─ Gemini (ekstraksi memori pasca-sesi)
       └─ Tavus CVI (PAL + Face, STT, TTS, lip sync, video, LLM hosted)
```

Backend menyimpan kunci Tavus, Gemini, dan Supabase di server, membuat sesi, mengembalikan URL sesi terbatas ke browser, dan mengakhiri sesi lewat API. Browser tidak menerima API key. PAL memuat persona Naya; Face menentukan tampilan avatar. LLM percakapan aktif adalah Tavus-hosted `tavus-gemma-4`; Gemini BYO tetap opsi rollback, sedangkan Gemini `generateContent` dipakai terpisah setelah sesi untuk memproses memori. Backend memuat context ringkas dari Supabase sebelum membuat sesi Tavus. `participant_tags` dan `memory_stores` Tavus tidak pernah dikirim; identitas Naya tidak bergantung pada PAL atau Tavus API key.

## Wireframe layar

```text
┌─────────────────────────────────────┐
│ Naya (AI)             ⚙ Settings    │
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
