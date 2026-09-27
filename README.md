# Naya Virtual Girl

**Current Milestone: 3 – Gemini Brain + Persona Integration**

Naya adalah prototype AI companion berbentuk percakapan video. PAL Tavus memakai persona Naya dari `character/system-prompt.md`; wajah sementara adalah stock Face Anna (`rc9cff32ceba`). Naya adalah AI, bukan manusia, terapis, dokter, atau pengganti hubungan manusia.

## Status

Milestone 1 lulus. Milestone 2 lulus secara fungsional menurut human test pengguna. Pada Milestone 3, Gemini menjadi LLM Naya melalui konfigurasi BYO LLM Tavus; Tavus tetap menyediakan sesi realtime, STT, turn-taking, TTS, dan rendering stock Face Anna. Hasil integrasi dan batas validasi ada di `docs/milestone-3.md`.

## Menjalankan lokal

Butuh Node.js 24 atau lebih baru. Dari root proyek:

```bash
npm install
npm run dev
```

Buka `http://localhost:3000`. Server hanya mendengarkan pada `127.0.0.1`. Port tetap 3000 kecuali `PORT` diatur secara eksplisit. `npm test` menjalankan test mock tanpa Tavus live. `npm run check` memeriksa sintaks. Tidak ada langkah build karena HTML/CSS/JavaScript vanilla disajikan langsung oleh server.

## Konfigurasi Tavus dan Gemini

Salin `.env.example` menjadi `.env` di root proyek lalu isi `TAVUS_API_KEY` dan `GEMINI_API_KEY` secara lokal, atau set environment variable pada proses server. `GEMINI_MODEL` default `gemini-3.8-flash`. Jangan kirim kunci lewat chat atau commit. `.env` diabaikan Git. GET `/api/gemini/status` hanya mengembalikan status konfigurasi dan model. Tes teks Gemini dapat dijalankan sebelum memakai menit Tavus dengan `node --use-system-ca --input-type=module -e "import {testGeminiCompletion} from './app/backend/gemini.mjs'; console.log(await testGeminiCompletion())"`.

`TAVUS_PAL_ID` diarahkan ke PAL `Naya Gemini` yang telah dibuat satu kali. State cadangan disimpan di `app/backend/.naya-gemini-pal.json` dan diabaikan Git. PAL lama Milestone 2 tetap ada. Backend memverifikasi model dan base URL sebelum membuat conversation. Kunci tidak dikirim ke frontend. Kunci Gemini hanya diserahkan server ke konfigurasi BYO LLM Tavus sesuai kebutuhan integrasi.

Setelah konfigurasi, buka halaman lokal, cek detail status, lalu tekan **Mulai Ngobrol** satu kali. Backend membuat conversation maksimum 180 detik dan menampilkan ruang resmi di iframe. Tavus/Daily UI di dalam iframe mengelola izin microphone; gunakan kontrol mic di ruang video. Tekan **Akhiri** untuk menutup sesi melalui backend. Jika browser menolak izin, periksa izin situs dan muat ulang; jangan menekan Start berulang kali saat sesi masih aktif. Browser production memerlukan HTTPS; localhost dapat dipakai untuk pengembangan.

**Batas biaya:** cek dashboard Tavus Free dan sisa menit sebelum uji nyata. Jangan aktifkan paket berbayar, overage, atau custom Face. Tidak ada panggilan Tavus otomatis saat `npm test`.

## Struktur singkat

- `app/backend/`: server loopback, Tavus client, tes konektivitas Gemini, dan state PAL lokal yang diabaikan Git.
- `app/frontend/`: UI video call sederhana dan controller state.
- `character/`: identitas, kepribadian, gaya percakapan, keselamatan, dan prompt.
- `tavus/`: rencana dan konfigurasi contoh.
- `tests/`: test mock, skenario percakapan, checklist avatar, dan acceptance Milestone 1.
- `docs/`: arsitektur, keputusan, roadmap, dan status milestone.
- `assets/`: slot aset masa depan; tidak ada custom avatar pada Milestone 3.

## Batas implementasi

Frontend host mengetahui saat iframe termuat, tetapi belum memiliki event media Tavus/Daily untuk membuktikan status Listening/Thinking/Speaking. Status microphone dan percakapan harus diperiksa di dalam iframe. Kualitas avatar, lip-sync, suara, dan percakapan nyata tetap memerlukan uji manusia. Database, autentikasi, dan deployment belum dikerjakan.
