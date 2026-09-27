# Naya Virtual Girl

**Current Milestone: 4 – Persistent Memory + Personalization**

Naya adalah prototype AI companion berbentuk percakapan video. PAL Tavus memakai persona Naya dari `character/system-prompt.md`; wajah sementara adalah stock Face Anna (`rc9cff32ceba`). Naya adalah AI, bukan manusia, terapis, dokter, atau pengganti hubungan manusia.

## Status

Milestone 1 lulus. Milestone 2 lulus secara fungsional menurut human test pengguna. Pada awal Milestone 3, Gemini dipakai sebagai BYO LLM. PAL existing sekarang memakai Tavus-hosted `tavus-gemma-4` untuk respons percakapan; Tavus tetap menyediakan sesi realtime, STT, turn-taking, TTS, dan rendering stock Face Anna. Hasil integrasi, backup rollback Gemini, dan batas validasi ada di `docs/milestone-3.md`.

Milestone 4 direvisi: **Supabase adalah sumber utama memori Naya**. Backend menyimpan arsip teks percakapan, ringkasan, profil, memori, dan open loop. Gemini memproses transkrip setelah sesi; Tavus tetap menangani video/audio realtime. Identitas single-user `naya_primary_user` independen dari PAL, Tavus key, dan perangkat. Jalankan `supabase/migrations/001_naya_memory.sql`, lalu isi `SUPABASE_URL` dan `SUPABASE_SERVICE_ROLE_KEY` hanya di server. Sampai kredensial dan migrasi tersedia, memori Supabase belum aktif; panggilan lama tetap dapat digunakan. Detail aktivasi dan uji dua sesi ada di `docs/milestone-4.md`.

## Menjalankan lokal

Butuh Node.js 24 atau lebih baru. Dari root proyek:

```bash
npm install
npm run dev
```

Buka `http://localhost:3000`. Server hanya mendengarkan pada `127.0.0.1`. Port tetap 3000 kecuali `PORT` diatur secara eksplisit. `npm test` menjalankan test mock tanpa Tavus live. `npm run check` memeriksa sintaks. Tidak ada langkah build karena HTML/CSS/JavaScript vanilla disajikan langsung oleh server.

## Konfigurasi Tavus dan Gemini

Salin `.env.example` menjadi `.env` di root proyek lalu isi `TAVUS_API_KEY` dan `GEMINI_API_KEY` secara lokal, atau set environment variable pada proses server. `GEMINI_MODEL` default `gemini-3.8-flash`. Jangan kirim kunci lewat chat atau commit. `.env` diabaikan Git. GET `/api/gemini/status` hanya mengembalikan status konfigurasi dan model. Tes teks Gemini dapat dijalankan sebelum memakai menit Tavus dengan `node --use-system-ca --input-type=module -e "import {testGeminiCompletion} from './app/backend/gemini.mjs'; console.log(await testGeminiCompletion())"`.

`TAVUS_PAL_ID` tetap diarahkan ke PAL existing `p54bfaf633c5`. Nama historis PAL dan state lokal `app/backend/.naya-gemini-pal.json` tidak mengubah model aktif. PAL lama Milestone 2 tetap ada. Backend menerima model hosted Tavus maupun Gemini BYO lama untuk rollback. Kunci tidak dikirim ke frontend; `GEMINI_API_KEY` tetap tersimpan untuk pekerjaan backend mendatang dan tidak dipakai oleh layer LLM hosted.

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

Frontend host mengetahui saat iframe termuat, tetapi belum memiliki event media Tavus/Daily untuk membuktikan status Listening/Thinking/Speaking. Status microphone dan percakapan harus diperiksa di dalam iframe. Kualitas avatar, lip-sync, suara, dan percakapan nyata tetap memerlukan uji manusia. Login multi-user belum dikerjakan. Batasi akses prototype single-user karena semua pengunjung yang dapat membuat conversation akan berbagi satu memori aplikasi. `GET /api/memory/status` hanya menampilkan status dan jumlah sesi pending, tanpa isi memori atau key.

## Deployment Mynaia

Repo GitHub private: `Extreme-Studios/mynaia`. Vercel project: `mynaia`; alias Vercel: `https://mynaia.vercel.app`. Domain khusus: `mynaia.extremestudiosai.com` melalui CNAME Domainesia. `npm run build` menyalin frontend ke `public/` saat build; API Vercel ada di `api/handler.js`. Sesi hosted memerlukan `TAVUS_API_KEY` dan `TAVUS_PAL_ID`; memori permanen memerlukan `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, dan `GEMINI_API_KEY` di server Vercel. `NAYA_ACCESS_CODE` membatasi pengunjung yang dapat membuat sesi Tavus. Kode dan API key hanya tersimpan di environment Vercel; `.env`, state PAL lokal, backup rollback, dan `.vercel` tidak dikirim ke GitHub. Vercel tidak membuat PAL otomatis bila ID tidak dikonfigurasi.

Fungsi Vercel tidak menyimpan state sesi di memori. Tavus membatasi conversation sampai 180 detik dan tombol **Akhiri** memanggil endpoint Tavus. Jangan mengandalkan frontend sebagai bukti status perangkat atau kualitas percakapan. Bila situs dibuka publik tanpa kode akses, setiap pengunjung dapat memakai menit Tavus.
