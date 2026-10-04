# Audit jalur Profil 1–8 — 3 Oktober 2026

Semua profil diperiksa melalui konfigurasi backend lokal serta endpoint produksi yang terautentikasi. API key tidak dicetak. Tidak membuat conversation, PAL, atau memakai menit Tavus.

| Profil | Autentikasi produksi | PAL Naia / Dr. Paws | Face Naia / Dr. Paws | Sesi aktif provider |
| --- | --- | --- | --- | --- |
| 1 | Berhasil | Tersedia / Tersedia | Tersedia / Tersedia | 0 |
| 2 | Berhasil | Tersedia / Tersedia | Tersedia / Tersedia | 0 |
| 3 | Berhasil | Tersedia / Tersedia | Tersedia / Tersedia | 0 |
| 4 | Berhasil | Tersedia / Tersedia | Tersedia / Tersedia | 0 |
| 5 | Berhasil | Tersedia / Tersedia | Tersedia / Tersedia | 0 |
| 6 | Berhasil | Tersedia / Tersedia | Tersedia / Tersedia | 0 |
| 7 | Berhasil | Tersedia / Tersedia | Tersedia / Tersedia | 0 |
| 8 | Berhasil | Tersedia / Tersedia | Tersedia / Tersedia | 0 |

Profil aktif produksi: 1. Mode Naia/Dr. Paws siap menurut konfigurasi. GET provider lokal menunjukkan pipeline full, Face cocok, hosted default LLM tanpa custom base_url, dan validasi client Naia berhasil pada seluruh profil.

Jalur Start: login -> profile aktif dari app_settings -> key/PAL/Face profil -> konteks Supabase -> validasi PAL -> POST conversation -> arsip sesi Supabase -> browser. Profil 1 pada Vercel masih memberikan opsi Gemini kompatibilitas lama ke validator; hosted default diizinkan dan audit validasi ini lulus. Opsi itu tidak mengubah LLM PAL atau payload conversation. Tidak ditemukan bukti bahwa opsi ini menyebabkan kegagalan, sehingga tidak diubah.

Log Vercel 24 jam terakhir berisi 3 request POST /api/conversations dengan HTTP 502. Salah satunya mencatat Tavus PAL ready. Log lama tidak menyimpan status provider atau detail stage sehingga penyebab tepat (kuota, batas akun, payload, network, dll.) belum terkonfirmasi. Tidak menyatakan profil sudah bisa membuat call hanya berdasarkan keberhasilan GET. Tidak mengubah profil aktif atau API key.

Patch diagnostik: simpan status HTTP upstream numerik pada error; tampilkan status pada CREATE_FAILED dan log aman tanpa response body, key, context, atau transcript. Tidak menambahkan retry/failover. Tests mock mencakup 400/401/402/403/429/500, satu create attempt, no secret leakage. Check, 100 tests, build lulus. Perlu pesan/screenshot error pengguna untuk memastikan akar masalah; tidak menjalankan live test.

Read-only session check menggunakan [List Conversations resmi](https://docs.tavus.io/api-reference/conversations/get-conversations) dengan status=active.

## Koreksi UI error — 4 Oktober 2026

Screenshot pengguna menampilkan pesan generic "Naia belum siap". Ditemukan friendlyCallError di frontend mencocokkan kata profil/config sebelum mempertahankan status provider, sehingga CREATE_FAILED kehilangan HTTP upstream lagi. Mapper sekarang memprioritaskan pola terstruktur "saat membuat sesi (HTTP NNN)" dan hanya menampilkan status numerik; tidak meneruskan body provider atau rahasia. App.js/cache v27. Regression test menjalankan fungsi mapper untuk 400/401/402/403/429/500 dan memastikan tidak berubah menjadi belum siap. 101 tests, check, build lulus.

Audit produksi ulang: aktif Profil 1, naya/drPaws true, seluruh Profil 1–8 autentikasi/PAL/Face berhasil. Belum membuat call untuk mereproduksi; penyebab penolakan provider masih perlu status dari percobaan pengguna, jangan mengklaim sudah memperbaiki kegagalan call.

## Profil 9 — 4 October 2026

Profil 9 ditambahkan dengan key server tersendiri dan credential Windows `api key naya 9`. GET daftar PAL berhasil (HTTP 200). Akun belum memiliki PAL Naia/Dr. Paws, sehingga status sebagian dikonfigurasi; tidak meminjam PAL profil lain. Tidak membuat PAL atau conversation, tidak memakai conversation minutes. Profil aktif tetap.
