# Checklist avatar dan percakapan realtime

Gunakan rating **PASS**, **PARTIAL**, atau **FAIL** setelah pengamatan nyata. Status **PENDING HUMAN TEST** berarti belum diuji secara sah. API 200 atau iframe termuat tidak membuktikan kualitas visual/audio. Catat perangkat, browser, PAL ID, waktu mulai/akhir, dan hasil tanpa menyalin percakapan sensitif.

## Machine-verifiable

| Pemeriksaan | Status | Bukti |
| --- | --- | --- |
| Health endpoint | PASS | Test mock `server.test.mjs` lulus. |
| Tavus status endpoint aman | PASS | Test mock memastikan hanya boolean dan tanpa key. |
| Missing API key ditangani | PASS | Test mock: HTTP 503 `KEY_REQUIRED`. |
| PAL payload, persistence, dan create conversation mapping | PASS | Test mock `tavus.test.mjs` lulus. |
| Respons/error Tavus malformed ditangani | PASS | Test mock lulus. |
| Frontend termuat dan state Start/Error | PASS | Test mock `server.test.mjs` dan `frontend.test.mjs` lulus. |
| Real Tavus API menerima request | PASS | `GET /v2/pals` HTTP 200; PAL Naya `p1be7dd26adf` berhasil dibuat. |
| Real conversation URL diterima | PASS | Satu sesi `cdc1138341c64476` dibuat dan URL ruang dibuka melalui iframe aplikasi lokal. |
| Stabilitas server saat sesi live | PARTIAL | Server tetap sehat sampai sesi diakhiri; peserta belum masuk ke panggilan. |
| Conversation dapat diakhiri | PASS | Tombol Akhiri dan `GET` Tavus sesudahnya menunjukkan status `ended`. |
| Critical console error saat sesi live | PARTIAL | Ada warning `Devices Error (No Camera): NotFoundError: Requested device not found`; tidak ada error kritis lain yang terlihat. |

## Human-verifiable

| Pemeriksaan | Status | Catatan/bukti |
| --- | --- | --- |
| Stock Face Anna tampil, bukan gambar statis | PENDING HUMAN TEST | — |
| Avatar benar-benar bergerak saat berbicara | PENDING HUMAN TEST | — |
| Kedipan natural | PENDING HUMAN TEST | — |
| Gerakan kepala tidak looping berlebihan | PENDING HUMAN TEST | — |
| Lipsync sesuai suara dan mulut tidak random | PENDING HUMAN TEST | — |
| Terlihat hidup saat mendengarkan | PENDING HUMAN TEST | — |
| Suara jelas dan natural dalam Bahasa Indonesia | PENDING HUMAN TEST | — |
| Microphone mendapat izin dan suara pengguna masuk | PENDING HUMAN TEST | — |
| Naya merespons ucapan pengguna | PENDING HUMAN TEST | — |
| Jeda respons dapat diterima | PENDING HUMAN TEST | Catat perkiraan detik dari akhir ucapan ke awal balasan. |
| Interupsi Naya bekerja wajar | PENDING HUMAN TEST | — |
| Tidak freeze selama sesi singkat | PENDING HUMAN TEST | — |
| Reconnect setelah gangguan jaringan | PENDING HUMAN TEST | Lakukan hanya bila masih ada kuota, bukan pada uji pertama. |
| Layout HP portrait/landscape | PENDING HUMAN TEST | — |
| Layout desktop | PENDING HUMAN TEST | — |

## Catatan uji nyata 27 September 2026

Chrome membuka halaman pratinjau Daily dan menerima nama penguji. Tahap berikutnya meminta izin kamera/microphone, tetapi perangkat kamera tidak ditemukan; microphone tidak terbukti aktif. Tidak ada observasi yang sah atas avatar bergerak, lip-sync, suara, latency, atau interupsi. Semua item human-verifiable tetap pending. Satu sesi ini diakhiri normal; jangan gunakan hasil API atau screenshot pratinjau sebagai PASS visual/audio.

## Skenario live pertama, maksimum sekitar 2–3 menit

Ucapkan “Hai Naya.”, kemudian “Aku baru pulang, hari ini lumayan capek.”, lalu “Ceritain sesuatu yang ringan dong.” Potong Naya sekali ketika berbicara. Akhiri dengan “Oke Naya, nanti lanjut lagi ya.” dan tekan **Akhiri**. Jalankan satu sesi saja; jangan membuat loop otomatis.
