# Milestone 3 — Gemini Brain + Naia Persona Integration

## Status

Implementasi dan konektivitas Gemini terverifikasi. Validasi live dan persepsi manusia dicatat di bawah setelah sesi. Milestone 2 dinyatakan lulus secara fungsional berdasarkan laporan human test pengguna; penilaian Milestone 3 tidak diwarisi otomatis.

## Arsitektur

Konfigurasi aktif: microphone → Tavus STT/Sparrow-2 → Tavus-hosted `tavus-gemma-4` → Tavus TTS → stock Face Anna/video/lip-sync. Gemini `gemini-3.8-flash` adalah konfigurasi BYO LLM awal Milestone 3; key lokalnya dipertahankan untuk pekerjaan backend mendatang. Tidak ada Gemini Live, database, atau custom Face.

## Konfigurasi dan keputusan PAL

- Gemini base URL: `https://generativelanguage.googleapis.com/v1beta/openai/`; model default `gemini-3.8-flash`.
- PAL Milestone 2 `p1be7dd26adf` dipertahankan. PATCH resmi tersedia, tetapi akan mengubah PAL yang sudah lulus uji Milestone 2. Karena itu dibuat tepat satu PAL baru `Naia Gemini`, ID `p54bfaf633c5`.
- Konfigurasi saat PAL Gemini pertama dibuat: pipeline `full`, Face `rc9cff32ceba`, Bahasa Indonesia, prompt V2 yang saat itu ada di `character/system-prompt.md`, turn patience `high`, interruptibility `medium`, idle engagement `off`, speculative inference aktif. Setelah tes kompatibilitas Gemini SSE, `reasoning_effort: low` ditambahkan pada `layers.llm.extra_body` untuk mengutamakan latency. GET PAL mengonfirmasi nilai itu tersimpan. Konfigurasi aktif setelah patch latensi dicatat di bagian bawah.
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

## Latency Optimization Configuration — 27 September 2026

Patch konfigurasi dilakukan pada PAL existing `p54bfaf633c5`. Sebelum patch dilakukan satu GET PAL yang berhasil; setelah PATCH HTTP 200 dilakukan satu GET verifikasi. Tidak ada PAL atau conversation baru dan tidak ada live session maupun A/B test.

| Pengaturan | Sebelum | Sesudah, berdasarkan GET verifikasi |
| --- | --- | --- |
| `layers.conversational_flow.turn_detection_model` | `sparrow-2` | `sparrow-2` — aktif |
| `turn_taking_patience` | `high` | `low` |
| `pal_interruptibility` | `medium` | `medium` |
| `idle_engagement` | `off` | `off` |
| `layers.llm.speculative_inference` | `true` | `true` |
| Gemini BYO LLM | `gemini-3.8-flash`, base URL OpenAI-compatible Google, API key ada di PAL | Tetap sama; nilai key tidak dicatat |
| STT | `layers.stt` tidak muncul; `languages: ["id"]` | PATCH mengirim `stt_engine: tavus-auto`, tetapi GET masih tidak menampilkan `layers.stt`; `languages: ["id"]` tetap ada. `tavus-auto` adalah default Tavus saat engine tidak ditetapkan. Persistensi field eksplisit tidak dapat dibuktikan dari GET. |
| Runtime system prompt | 4.503 karakter, perkiraan 1.126 token | 1.322 karakter, perkiraan 331 token; GET cocok persis dengan file runtime lokal |

Perubahan PATCH: `turn_taking_patience` menjadi `low`, menambahkan permintaan konfigurasi STT `tavus-auto`, dan mengganti `system_prompt` dengan versi ringkas. Character bible lama dipindahkan ke `character/character-bible.md` sebagai dokumentasi; `character/system-prompt.md` memuat aturan runtime tentang identitas, Bahasa Indonesia natural, kepribadian, respons kasual 1–3 kalimat, emosi, transparansi AI, dan keselamatan penting. Default pembuatan PAL di source juga diselaraskan ke `low` dan `tavus-auto`, tetapi tidak digunakan untuk membuat PAL dalam pekerjaan ini.

Pada tahap patch latensi ini, Gemini BYO LLM masih terhubung langsung dari Tavus ke endpoint OpenAI-compatible yang mendukung SSE; aplikasi tidak mem-proxy atau menahan stream respons sampai selesai. `testGeminiCompletion()` memakai `stream: false` hanya untuk diagnostik satu respons, bukan jalur percakapan realtime. Saat itu konfigurasi PAL tetap `reasoning_effort: low`; tidak ada pengaturan thinking berat atau `max_tokens` khusus pada PAL. Tidak ada klaim penurunan jeda 5+ detik karena live conversation sengaja tidak dijalankan. `low` dapat membuat PAL lebih cepat mengambil giliran tetapi juga dapat menyela jeda alami.

## Fast LLM Patch — 27 September 2026

Pada PAL existing `p54bfaf633c5`, hanya path `/layers/llm` yang di-PATCH dari Gemini BYO `gemini-3.8-flash` menjadi model hosted `tavus-gemma-4` dengan `speculative_inference: true`. Konfigurasi BYO yang lama memakai `base_url` Google, `api_key` dari `GEMINI_API_KEY`, dan `extra_body.reasoning_effort: low`. Untuk hosted model, PATCH menghapus `base_url`, `api_key`, dan parameter Gemini tersebut dari layer LLM. `GEMINI_API_KEY` tetap ada di `.env` dan environment Vercel untuk rencana memory summarization/reasoning backend; Tavus API key tidak diubah.

Backup konfigurasi sebelum patch ada di `app/backend/.naya-fast-llm-backup-2026-09-27.json` (diabaikan Git dan Vercel). Nilai kunci disunting dari backup; metadata `secret_reference` menunjuk ke `GEMINI_API_KEY` di `.env`. Untuk rollback, ambil `pal.layers.llm` dari backup, isi kembali `api_key` dari environment lokal, lalu PATCH `replace /layers/llm` pada PAL yang sama. Validasi aplikasi menerima baik Gemini BYO lama maupun hosted model ini. Jangan mengirim file backup atau nilai key ke frontend/repository.

PATCH mengembalikan HTTP 200. Satu GET verifikasi setelah patch mengonfirmasi Face `rc9cff32ceba`, prompt Naia 1.322 karakter (hash sama), Sparrow-2, patience `low`, interruptibility `medium`, idle engagement `off`, dan `languages: ["id"]` tetap ada. GET tidak mengembalikan objek `layers.llm` setelah nilainya diganti ke hosted default; karena itu model dan speculative inference **tidak terlihat secara eksplisit di respons GET**. Dokumentasi Tavus menetapkan `tavus-gemma-4` dan `speculative_inference: true` sebagai default. Penghapusan `base_url`/`api_key` Gemini dari GET dapat dipastikan; efektivitas runtime hosted model tetap belum diuji karena tidak ada conversation/live session. Tes lokal memakai mock dan tidak menggunakan conversation minutes.

## Rujukan spesifikasi

- Tavus LLM: https://docs.tavus.io/sections/conversational-video-interface/pal/llm
- Tavus Create PAL: https://docs.tavus.io/api-reference/pals/create-pal
- Tavus Patch PAL: https://docs.tavus.io/api-reference/pals/patch-pal
- Gemini OpenAI compatibility: https://ai.google.dev/gemini-api/docs/openai
- Gemini model: https://ai.google.dev/gemini-api/docs/models/gemini-3.8-flash/
- Tavus Conversational Flow: https://docs.tavus.io/sections/conversational-video-interface/pal/conversational-flow
- Tavus STT: https://docs.tavus.io/sections/conversational-video-interface/pal/stt
