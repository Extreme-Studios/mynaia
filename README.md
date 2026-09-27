# Naya Virtual Girl

**Current Milestone: 5 – Product UI / PWA / Multi-Mode**

## Multi-Tavus Profile Engine

Password akses MyNaiA adalah satu-satunya login. Dashboard dan Settings baru terlihat setelah login; API profil juga mewajibkan cookie akses yang sama. Settings → Tavus Engine menampilkan delapan pilihan **Tavis 1–8** tanpa kode admin kedua. Tombol **Periksa konfigurasi** hanya membaca autentikasi, PAL, dan Face Tavus. Tombol **Gunakan profil** menyimpan pilihan global `tavus_active_profile` di Supabase; laptop dan HP memakai profil yang sama untuk sesi **berikutnya**. Sesi berjalan dan pengambilan transkrip tetap memakai profil yang tercatat pada sesi itu. Tidak ada pergantian otomatis saat quota habis.

Setiap profil membutuhkan API key, PAL Naya, PAL Dr. Paws, dan Face masing-masing dalam environment server. Pola `TAVUS_PROFILE_<1..8>_{API_KEY,NAYA_PAL_ID,NAYA_FACE_ID,DR_PAWS_PAL_ID,DR_PAWS_FACE_ID}` ada di `.env.example`. Profil 1 memakai variabel Tavus lama sebagai fallback hanya bila `TAVUS_PROFILE_1_API_KEY` belum diisi. Key tidak masuk browser, GitHub, atau respons status. `NAYA_ACCESS_CODE` tetap tersimpan di environment server dan membuat cookie HttpOnly, SameSite=Strict setelah login.

Profil 1–8 kini masing-masing memiliki API key, PAL Naya, PAL Dr. Paws, dan dua stock Face yang diverifikasi pada akun terkait. PAL profil 2–8 dibuat atas permintaan pengguna dan ID-nya disimpan khusus per profil di environment lokal/Vercel; PAL profil 1 tidak disalin lintas akun. Start tetap menolak mode yang konfigurasinya hilang. Aplikasi tidak membuat PAL otomatis saat server berjalan. Persistent memory tetap hanya di Supabase dengan identitas `naya_primary_user`; Tavus adalah mesin percakapan yang dapat diganti. Konfigurasi PAL tidak memakai conversation minutes. Kualitas sesi profil baru belum diuji live.

MyNaiA memiliki home `/` dan dua mode `/naya` serta `/dr-paws` pada satu situs `https://mynaia.extremestudiosai.com`. Naya tetap memakai memori Supabase. Dr. Paws memiliki memori ringan per profil anak dengan `subject_id` UUID; transkrip, ringkasan, fakta aman, dan open loop dipisahkan dari Naya serta profil anak lain. UI mobile-first mencakup PWA, fullscreen, Wake Lock, dan durasi 3/5/10/20 menit (default 5). Quality Auto aktif; Low/High dinonaktifkan karena iframe saat ini belum memberi kontrol kualitas stream yang terverifikasi. Rincian dan rencana uji manusia ada di `docs/milestone-5.md`.

## Dr. Paws Persistent Memory

Jalankan migrasi `supabase/migrations/004_dr_paws_subject_memory.sql` pada proyek Supabase yang sama sebelum deploy kode. Di layar Dr. Paws, buat profil anak atau pilih profil yang ada pada **Siapa yang akan ngobrol?**. Jika hanya satu profil, aplikasi memilihnya otomatis. Nama hanyalah label; identitas memori memakai UUID profil. Profil lama untuk sesi Dr. Paws tanpa `subject_id` dimigrasikan menjadi **Profil lama** tanpa menghapus transkrip. Sebelum sesi, backend mengirim konteks ringkas dari profil terpilih ke Tavus. Setelah sesi, backend menyimpan transkrip dan meminta Gemini mengekstrak ringkasan, fakta ringan, serta open loop ke Supabase. Memori klinis/psikologis, alamat rinci, nomor identitas, dan rahasia difilter dari memori persisten. Tombol **Reset ingatan Dr. Paws untuk profil ini** memerlukan konfirmasi dan hanya menghapus memori turunan profil itu; arsip transkrip tetap disimpan. Uji recall nyata masih perlu dilakukan manusia dan memakai menit Tavus.

Naya adalah prototype AI companion berbentuk percakapan video. PAL Tavus memakai persona Naya dari `character/system-prompt.md`; wajah sementara adalah stock Face Anna (`rc9cff32ceba`). Naya adalah AI, bukan manusia, terapis, dokter, atau pengganti hubungan manusia.

## Status

Milestone 1 lulus. Milestone 2 lulus secara fungsional menurut human test pengguna. Pada awal Milestone 3, Gemini dipakai sebagai BYO LLM. PAL existing sekarang memakai Tavus-hosted `tavus-gemma-4` untuk respons percakapan; Tavus tetap menyediakan sesi realtime, STT, turn-taking, TTS, dan rendering stock Face Anna. Hasil integrasi, backup rollback Gemini, dan batas validasi ada di `docs/milestone-3.md`.

Milestone 4: **PERSISTENT MEMORY PROVIDER = SUPABASE; TAVUS MEMORY = DISABLED**. Backend menyimpan arsip teks, ringkasan, profil, memori, dan open loop. Gemini memproses transkrip setelah sesi; Tavus menangani video/audio realtime. Create conversation tidak mengirim `participant_tags` atau `memory_stores`, dan ditolak sebelum memanggil Tavus bila Supabase tidak siap. Identitas single-user `naya_primary_user` independen dari PAL, Tavus key, dan perangkat. Migrasi Supabase `mynaia` telah diterapkan. Recall lintas laptop/HP telah divalidasi oleh pengguna sebelum Milestone 5. Detail ada di `docs/milestone-4.md`.

## Menjalankan lokal

Butuh Node.js 24 atau lebih baru. Dari root proyek:

```bash
npm install
npm run dev
```

Buka `http://localhost:3000`. Server hanya mendengarkan pada `127.0.0.1`. Port tetap 3000 kecuali `PORT` diatur secara eksplisit. `npm test` menjalankan test mock tanpa Tavus live. `npm run check` memeriksa sintaks. `npm run build` menyiapkan aset PWA statis untuk Vercel.

## Konfigurasi Tavus dan Gemini

Salin `.env.example` menjadi `.env` di root proyek lalu isi `TAVUS_API_KEY` dan `GEMINI_API_KEY` secara lokal, atau set environment variable pada proses server. `GEMINI_MODEL` default `gemini-3.8-flash`. Jangan kirim kunci lewat chat atau commit. `.env` diabaikan Git. GET `/api/gemini/status` hanya mengembalikan status konfigurasi dan model. Tes teks Gemini dapat dijalankan sebelum memakai menit Tavus dengan `node --use-system-ca --input-type=module -e "import {testGeminiCompletion} from './app/backend/gemini.mjs'; console.log(await testGeminiCompletion())"`.

`TAVUS_PAL_ID` tetap diarahkan ke PAL existing `p54bfaf633c5`. Nama historis PAL dan state lokal `app/backend/.naya-gemini-pal.json` tidak mengubah model aktif. PAL lama Milestone 2 tetap ada. Backend menerima model hosted Tavus maupun Gemini BYO lama untuk rollback. Kunci tidak dikirim ke frontend; `GEMINI_API_KEY` tetap tersimpan untuk pekerjaan backend mendatang dan tidak dipakai oleh layer LLM hosted.

Setelah konfigurasi, buka halaman lokal, pilih mode dan durasi, lalu tekan **Mulai Ngobrol** satu kali. Backend hanya menerima 180/300/600/1200 detik (default 300) dan menampilkan ruang resmi di iframe. Tavus/Daily UI di dalam iframe mengelola izin serta mute microphone; gunakan kontrol mic di ruang video. Tekan **Akhiri** untuk menutup sesi melalui backend. Jika browser menolak izin, periksa izin situs dan muat ulang. Browser production memerlukan HTTPS; localhost dapat dipakai untuk pengembangan.

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

Fungsi Vercel tidak menyimpan state sesi di memori. Tavus membatasi conversation sesuai durasi yang dipilih dan tombol **Akhiri** memanggil endpoint Tavus. Jangan mengandalkan frontend sebagai bukti status perangkat atau kualitas percakapan. Bila situs dibuka publik tanpa kode akses, setiap pengunjung dapat memakai menit Tavus.
