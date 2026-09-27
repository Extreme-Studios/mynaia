# Arsitektur MVP

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

Backend menyimpan kunci Tavus, Gemini, dan Supabase di server, membuat sesi, mengembalikan URL sesi terbatas ke browser, dan mengakhiri sesi lewat API. Browser tidak menerima API key. PAL memuat persona Naya; Face menentukan tampilan avatar. LLM percakapan aktif adalah Tavus-hosted `tavus-gemma-4`; Gemini BYO tetap opsi rollback, sedangkan Gemini `generateContent` dipakai terpisah setelah sesi untuk memproses memori. Backend memuat context ringkas dari Supabase sebelum membuat sesi Tavus. Ketika Supabase aktif, `participant_tags` Tavus tidak dikirim dan identitas Naya tidak bergantung pada PAL atau Tavus API key.

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

Supabase adalah sumber memori permanen. `users.id = naya_primary_user` untuk prototype single-user. Gemini membuat ringkasan, fakta terpilih, profil, dan open loop dari transkrip. Backend mengambil beberapa entri penting/terbaru dan menyusun `conversational_context` maksimum 5.000 karakter sebelum panggilan berikutnya. Identitas tidak berasal dari Tavus key, PAL, Face, IP, browser, atau perangkat. Kategori dan batas privasi ada di `docs/milestone-4.md`.

Skema ada di `supabase/migrations/001_naya_memory.sql`: tujuh tabel dengan RLS tanpa policy browser. Vercel tidak dipakai untuk file/state permanen. Untuk multi-user di masa depan, login harus memetakan tiap user ke ID berbeda. Endpoint `/api/memory/status` hanya mengungkap status/jumlah pending; `/api/memory/sync` tersedia untuk sinkronisasi tertunda dan dibatasi gerbang akses di Vercel. Bila Supabase belum dikonfigurasi, panggilan lama tetap berjalan dengan Tavus memory sementara dan endpoint status menunjukkan disabled.

## Privasi dan keamanan awal

Kunci API hanya di backend/env lokal. Endpoint sesi kelak perlu autentikasi, rate limit, batas durasi, dan kontrol anggaran sebelum pilot. Pengguna perlu penjelasan bahwa avatar dan suara dihasilkan AI. Detail retensi media/transkrip Tavus dan persetujuan pengguna diperiksa lagi sebelum sesi nyata.
