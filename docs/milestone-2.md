# Milestone 2 — Tavus Free Realtime Avatar Proof of Concept

## Tujuan dan status

Membuktikan Naya sebagai AI human yang benar-benar bergerak, mendengar, dan berbicara di browser melalui Tavus CVI. Pada uji awal Codex, ruang panggilan terbuka di Chrome tetapi pengujian berhenti pada layar izin perangkat. **Setelah itu pengguna melaporkan human test berhasil secara fungsional:** microphone, percakapan dua arah realtime, gerak Face, blink, lip-sync, head movement, dan Bahasa Indonesia bekerja. Berdasarkan laporan pengguna, **MILESTONE 2: PASSED secara fungsional**. Penilaian kualitas visual/audio secara rinci tetap milik penguji manusia; laporan ini bukan observasi langsung Codex.

## Implementasi

- Backend `app/backend/tavus.mjs` memuat bagian prompt runtime dari `character/system-prompt.md`, membuat PAL `Naya MVP Test` pada `POST /v2/pals`, memverifikasi PAL existing lewat `GET /v2/pals/{id}`, dan membuat/menutup conversation melalui endpoint resmi. Request memakai `x-api-key` hanya di backend. Error Tavus dikembalikan dalam bentuk aman tanpa body atau header rahasia.
- PAL memakai `pipeline_mode: full`, stock Face Anna `rc9cff32ceba`, `languages: ["id"]`, greeting singkat, Sparrow-2, patience high, interruptibility medium, dan idle engagement off. Ini konfigurasi awal yang perlu diuji kualitasnya pada sesi nyata.
- `TAVUS_PAL_ID` menang atas state lokal. Jika kosong, PAL dibuat sekali dan ID disimpan di `app/backend/.naya-pal.json`, tanpa API key. PAL yang dibuat dalam uji ini: `p1be7dd26adf`. Concurrent Start dilindungi di frontend dan backend. Jika hasil pembuatan PAL tidak pasti, server tidak mencoba membuat lagi otomatis pada proses yang sama.
- Browser menerima hanya conversation ID, URL, dan status. URL resmi Tavus dibuka dalam iframe dengan izin media sesuai panduan Tavus. UI host menyediakan Start, End, Ready, Connecting, Connected (artinya halaman ruang termuat), Ended, dan Error. Indikator Listening serta kontrol microphone yang sebenarnya berada di iframe Tavus; host tidak mengklaim sudah mendengar dari event iframe load.
- Sesi dibatasi `max_call_duration: 180` detik, timeout tanpa peserta 60 detik, dan endpoint End melakukan cleanup. Tidak ada auto-retry pembuatan conversation.

## Menjalankan

1. Periksa saldo dan syarat paket Tavus Free di dashboard. Jangan aktifkan overage atau paket berbayar.
2. Salin `.env.example` ke `.env`, isi `TAVUS_API_KEY` lokal. `TAVUS_PAL_ID` boleh dikosongkan. Jangan memasukkan key di frontend atau dokumentasi.
3. Jalankan `npm install`, `npm run check`, `npm test`, lalu `npm run dev` dari root proyek dengan Node.js 24+. Buka `http://localhost:3000`. Perintah dev memakai CA sistem Windows; verifikasi TLS tetap aktif.
4. Tekan **Mulai Ngobrol** sekali. Beri izin microphone di ruang Tavus yang muncul. Uji skenario singkat pada `tests/avatar-test-checklist.md`, lalu tekan **Akhiri**.
5. Catat PAL ID dari state lokal dan conversation ID untuk hasil pengujian; jangan catat API key. Jika PAL sudah dibuat tetapi state gagal disimpan, ambil PAL ID dari dashboard lalu set `TAVUS_PAL_ID` sebelum restart.

Localhost dapat memakai izin media untuk development. Hosting produksi memerlukan HTTPS. Izin ditangani Tavus/Daily di iframe; host hanya memeriksa dukungan browser sebelum Start untuk menghindari pembukaan sesi yang jelas tidak dapat memakai mic.

## Hasil test saat ini

- `npm run check`: PASS.
- `npm test`: 9/9 test mock PASS; tidak memanggil Tavus.
- `GET /v2/pals`: HTTP 200; autentikasi valid. Sebelum pembuatan, tidak ada PAL bernama Naya pada akun.
- PAL Naya dibuat satu kali, ID `p1be7dd26adf`, dan disimpan lokal. Stock Face Anna `rc9cff32ceba`.
- Satu conversation nyata dibuat, ID `cdc1138341c64476`, URL resmi diterima dan dibuka di iframe aplikasi lokal. `GET /v2/conversations/{id}` kemudian mengembalikan HTTP 200 dengan status `ended` setelah tombol **Akhiri**. Backend mencatat PAL ready, conversation created, dan conversation ended tanpa secret.
- Chrome mencapai layar `Daily | Get ready for your call` lalu layar “Allow camera and microphone access”. Penguji belum masuk ke ruang aktif. Log browser mencatat `Devices Error (No Camera): NotFoundError: Requested device not found`. Tidak ada error konsol kritis lain yang terlihat pada pemeriksaan; error media ini tetap menghalangi uji percakapan.
- Microphone, tampilan stock Face saat panggilan, respons suara, gerak, dan kualitas visual/audio: **PENDING HUMAN TEST**. Iframe termuat tidak membuktikan hal-hal tersebut.
- Ruang aktif kira-kira 1–1,5 menit dari pembuatan sampai End; menit tagihan Tavus yang sebenarnya belum tersedia sehingga angka ini hanya estimasi waktu sesi, bukan laporan pemakaian resmi.

## Keterbatasan

Iframe adalah jalur resmi Tavus yang paling sederhana untuk PoC. Host tidak memperoleh event rinci Listening/Thinking/Speaking, kondisi mic, atau kualitas stream; pemeriksaan itu berlangsung di UI Tavus dan oleh manusia. Untuk validasi berikutnya, gunakan browser/perangkat dengan microphone yang tersedia, selesaikan izin media pada Tavus, lalu jalankan satu sesi singkat. Jangan menyimpulkan masalah kamera sebagai kegagalan PAL atau kualitas avatar. Tidak ada Gemini, memory production, custom Face, autentikasi aplikasi, atau deployment. Server hanya untuk development lokal; sebelum pilot perlu kontrol akses dan anggaran yang lebih kuat.

## Rujukan resmi

- [Create PAL](https://docs.tavus.io/api-reference/pals/create-pal)
- [Create conversation](https://docs.tavus.io/api-reference/conversations/create-conversation)
- [End conversation](https://docs.tavus.io/api-reference/conversations/end-conversation)
- [CVI App Quickstart](https://docs.tavus.io/sections/conversational-video-interface/quickstart/build-first-app)
- [Conversational Flow](https://docs.tavus.io/sections/conversational-video-interface/pal/conversational-flow)
- [Language Support](https://docs.tavus.io/sections/conversational-video-interface/language-support)
