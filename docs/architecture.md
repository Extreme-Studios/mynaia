# Arsitektur MVP

## Sasaran pengalaman

Pengguna membuka aplikasi, melihat video Naya sebagai elemen utama, memberi izin microphone, lalu berbicara seperti panggilan video. Tahap stock Face adalah proof of concept identitas percakapan Naya; kesesuaian wajah Indonesia belum terbukti.

## Komponen dan batas

```text
Browser (UI, izin mic, media, kontrol)
  └─ Backend aplikasi (session broker, konfigurasi, pembatasan, nanti profil/memori)
       └─ Tavus CVI (PAL + stock Face, STT, turn-taking, TTS, rendering)
            ├─ Tavus-hosted LLM tavus-gemma-4
            └─ Tavus Memories (PAL + participant tag stabil)
```

Backend menyimpan kunci Tavus dan Gemini di server, membuat sesi, mengembalikan URL sesi terbatas ke browser, dan mengakhiri sesi lewat API. Browser tidak menerima API key. PAL memuat persona Naya; Face menentukan tampilan avatar. LLM aktif adalah Tavus-hosted `tavus-gemma-4`; Gemini BYO tetap sebagai opsi rollback. Tavus mengelola audio/video realtime. Pada Milestone 4, backend menambahkan `participant_tags` tunggal dan `conversational_context` pendek pada setiap sesi. Tidak ada Gemini Live.

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

Percakapan sesi aktif untuk menjaga konteks giliran. TTL mengikuti sesi; tidak otomatis menjadi profil permanen. Transkrip mentah bukan sumber memori jangka panjang. Pada Milestone 1 belum ada penyimpanan/transkripsi.

### Persistent memory

Tavus mengaitkan memory store ke pasangan PAL + `participant_tags` stabil. Backend mengambil tag dari `NAYA_MEMORY_STORE` atau default `naya-primary-user-v1`; identitas tidak berasal dari perangkat, browser, atau IP. Learned memory dikelola Tavus setelah sesi selesai. Aplikasi mengarahkan PAL untuk memakai fakta relevan secara natural, tetapi hasil dan penyimpanan sensitif harus diuji/audit; prompt bukan filter penyimpanan yang terjamin. Kategori konseptual dan batas privasi dijelaskan di `docs/milestone-4.md`.

Tidak ada database transkrip, audio, atau video. Untuk multi-user di masa depan, login harus memberi setiap user tag berbeda `naya_user_<stable_user_uuid>`. Supabase hanya opsi bila dibutuhkan untuk arsip verbatim/profile atau Tavus Memories terbukti tidak tersedia. Endpoint `/api/memory/status` mengungkap status konfigurasi saja.

## Privasi dan keamanan awal

Kunci API hanya di backend/env lokal. Endpoint sesi kelak perlu autentikasi, rate limit, batas durasi, dan kontrol anggaran sebelum pilot. Pengguna perlu penjelasan bahwa avatar dan suara dihasilkan AI. Detail retensi media/transkrip Tavus dan persetujuan pengguna diperiksa lagi sebelum sesi nyata.
