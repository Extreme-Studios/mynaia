# Arsitektur MVP

## Sasaran pengalaman

Pengguna membuka aplikasi, melihat video Naya sebagai elemen utama, memberi izin microphone, lalu berbicara seperti panggilan video. Tahap stock Face adalah proof of concept identitas percakapan Naya; kesesuaian wajah Indonesia belum terbukti.

## Komponen dan batas

```text
Browser (UI, izin mic, media, kontrol)
  └─ Backend aplikasi (session broker, konfigurasi, pembatasan, nanti profil/memori)
       └─ Tavus CVI (PAL + stock Face, STT, turn-taking, TTS, rendering)
            └─ Gemini BYO LLM (reasoning, respons, persona Naya)
```

Backend menyimpan kunci Tavus dan Gemini di server, membuat sesi, mengembalikan URL sesi terbatas ke browser, dan mengakhiri sesi lewat API. Browser tidak menerima API key. PAL memuat system prompt dari `character/system-prompt.md`; Face menentukan tampilan avatar. Konfigurasi `layers.llm` mengarahkan permintaan teks Tavus ke endpoint OpenAI-compatible Gemini. Tavus tetap mengelola audio dan video realtime. Tidak ada Gemini Live. Adapter `ConversationProvider` konseptual memiliki operasi `createSession`, `endSession`, dan hasil `joinUrl`/status.

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

## Desain memori konseptual (belum diimplementasikan)

### Short-term memory

Percakapan sesi aktif untuk menjaga konteks giliran. TTL mengikuti sesi; tidak otomatis menjadi profil permanen. Transkrip mentah bukan sumber memori jangka panjang. Pada Milestone 1 belum ada penyimpanan/transkripsi.

### Long-term memory

Simpan hanya fakta preferensi ringan yang berguna dan disetujui pengguna: nama panggilan, makanan favorit, hobi, keluarga yang sering disebut, aktivitas rutin, musik favorit, dan topik favorit. Jangan simpan tiap kalimat, detail krisis, diagnosis, data keuangan, atau rahasia. Pengguna kelak dapat melihat, mengoreksi, dan menghapus memori.

Skema konseptual: `user_profile(id, display_name, consent_version, created_at)` dan `memory_fact(id, user_id, category, value, source_conversation_id, consent_at, updated_at, expires_at)`. `category` dibatasi daftar izin, `value` singkat, dan fakta yang bertentangan perlu konfirmasi. Backend memilih beberapa fakta relevan untuk dikirim sebagai konteks, tanpa mengirim seluruh profil. Belum ada database production atau Supabase pada Milestone 1.

## Privasi dan keamanan awal

Kunci API hanya di backend/env lokal. Endpoint sesi kelak perlu autentikasi, rate limit, batas durasi, dan kontrol anggaran sebelum pilot. Pengguna perlu penjelasan bahwa avatar dan suara dihasilkan AI. Detail retensi media/transkrip Tavus dan persetujuan pengguna diperiksa lagi sebelum sesi nyata.
