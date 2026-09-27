# Milestone 3 — Gemini Brain + Naya Persona Integration

## Status

Implementasi dan konektivitas Gemini terverifikasi. Validasi live dan persepsi manusia dicatat di bawah setelah sesi. Milestone 2 dinyatakan lulus secara fungsional berdasarkan laporan human test pengguna; penilaian Milestone 3 tidak diwarisi otomatis.

## Arsitektur

Microphone → Tavus STT/turn detection → Gemini `gemini-3.8-flash` melalui BYO LLM OpenAI-compatible → Tavus TTS → stock Face Anna/video/lip-sync. Tavus tetap menangani giliran bicara dan interruption. Tidak ada Gemini Live, database, custom Face, atau autentikasi pengguna.

## Konfigurasi dan keputusan PAL

- Gemini base URL: `https://generativelanguage.googleapis.com/v1beta/openai/`; model default `gemini-3.8-flash`.
- PAL Milestone 2 `p1be7dd26adf` dipertahankan. PATCH resmi tersedia, tetapi akan mengubah PAL yang sudah lulus uji Milestone 2. Karena itu dibuat tepat satu PAL baru `Naya Gemini`, ID `p54bfaf633c5`.
- PAL baru: pipeline `full`, Face `rc9cff32ceba`, Bahasa Indonesia, prompt V2 dari `character/system-prompt.md`, turn patience `high`, interruptibility `medium`, idle engagement `off`, speculative inference aktif. Setelah tes kompatibilitas Gemini SSE, `reasoning_effort: low` ditambahkan pada `layers.llm.extra_body` untuk mengutamakan latency. GET PAL mengonfirmasi nilai itu tersimpan.
- ID PAL Gemini tersimpan di state lokal `app/backend/.naya-gemini-pal.json` dan `TAVUS_PAL_ID` di `.env` lokal sudah diarahkan ke ID baru. Kedua file diabaikan Git. Saat conversation berikutnya diminta, backend memverifikasi dan memakai ulang PAL; tidak membuat PAL baru selama ID ini tersedia.
- Gemini key tetap di lingkungan server. Aplikasi hanya menampilkan boolean `configured` dan nama model pada `/api/gemini/status`.

## Bukti pra-live

- Dokumentasi Tavus terkini mendukung `layers.llm` dengan `model`, `base_url`, dan `api_key`, serta OpenAI-compatible `/chat/completions` yang streamable.
- Dokumentasi Google mencantumkan `gemini-3.8-flash` dan endpoint yang sama.
- Tes Gemini server-side `Balas hanya dengan kata: SIAP` → `SIAP` (tanpa Tavus conversation minutes). Tes streaming terpisah mengembalikan HTTP 200, `text/event-stream`, SSE, `[DONE]`, dan chunk `SIAP`.
- GET PAL Tavus mengonfirmasi ID, Face, pipeline, model, base URL, prompt, dan pengaturan giliran.
- `npm run check` lulus; `npm test` 12/12 lulus sebelum live.

## Live session — 27 September 2026

- Tepat satu conversation Tavus dibuat melalui tombol aplikasi lokal. ID `cf82353519765448`, PAL `p54bfaf633c5`, Face `rc9cff32ceba`. URL ruang hanya tersedia melalui iframe aplikasi `http://127.0.0.1:3000`; sesi ini sudah berakhir.
- Tavus GET conversation mengonfirmasi status `ended`. Batas panggilan aplikasi 180 detik, jadi estimasi pemakaian paling banyak sekitar 3 menit; angka pemakaian aktual perlu dilihat pada dashboard Tavus.
- Browser mencapai ruang Tavus/Daily tetapi tertahan pada layar `Allow camera and microphone access`. Console warning: `Devices Error (No Camera): NotFoundError: Requested device not found`. Tidak ada console error lain yang terlihat pada tab.
- Tidak ada giliran bicara yang dapat diverifikasi. Karena itu, respons Gemini melalui Tavus, audio, ekspresi, latency, dan interruption dalam live session **belum terbukti**. Tes Gemini langsung dan konfigurasi PAL tidak menggantikan bukti percakapan dua arah.
- Host iframe menampilkan `Connected — ruang video terbuka` saat halaman ruang termuat; label itu tidak membuktikan kamera/microphone atau LLM berfungsi. Setelah Tavus mengakhiri sesi, host belum menerima event remote `ended`; reload halaman lokal untuk tampilan awal. Ini keterbatasan UI yang sudah ada, bukan kegagalan koneksi Gemini yang teramati.

## Human validation

Pengguna tetap perlu menilai naturalitas respons, Bahasa Indonesia, konsistensi persona, panjang respons, ekspresi, suara, latency, dan interruption dalam sesi nyata dengan perangkat media yang berfungsi. Bukti konfigurasi API tidak membuktikan kualitas audiovisual atau percakapan.

## Rujukan spesifikasi

- Tavus LLM: https://docs.tavus.io/sections/conversational-video-interface/pal/llm
- Tavus Create PAL: https://docs.tavus.io/api-reference/pals/create-pal
- Tavus Patch PAL: https://docs.tavus.io/api-reference/pals/patch-pal
- Gemini OpenAI compatibility: https://ai.google.dev/gemini-api/docs/openai
- Gemini model: https://ai.google.dev/gemini-api/docs/models/gemini-3.8-flash/
