# Milestone 8 — Dr. Paws Longitudinal Assessment & Multi-Source Review

## Status

Implementasi siap untuk validasi manusia. Tidak ada percakapan Tavus yang dibuat untuk uji ini. Data mock/PDF mock bukan bukti mutu klinis. Sesi terstruktur Milestone 7 juga masih memerlukan validasi manusia.

## Alur produk

1. Dashboard `/dr-paws/dashboard` menautkan setiap anak ke `/dr-paws/dashboard/subjects/:subjectId`. Halaman kasus menampilkan ringkasan, sesi terbaru, timeline, matriks area, sumber, pola, hipotesis, bukti, rencana sesi, dan laporan. UUID hanya untuk lookup internal.
2. Admin/reviewer yang sudah masuk dapat mencatat informasi orang tua, guru, profesional, atau pengasuh lain. Setiap catatan menyimpan `subject_id`, jenis/nama sumber, hubungan, tanggal observasi, jawaban, catatan, versi, dan reviewer. Form original tidak memakai instrumen berlisensi atau skor diagnosis. Tidak ada tautan form publik.
3. Analisis memakai maksimal 100 potongan bukti terstruktur dari analisis sesi dan sumber kolateral, bukan transkrip penuh. Data dibatasi pada 100 sesi terbaru dan 120 sumber terbaru; halaman memperingatkan bila batas tercapai. Referensi `t:<session UUID>:<turn>` menunjuk giliran anak; `s:<source UUID>:<field>` menunjuk jawaban asli. Evidence Explorer mengambil konten asli sesuai kasus. Sumber rumah/sekolah/profesional tetap berlabel dan kontradiksi dipertahankan.
4. Tombol **Update analysis** memanggil Gemini dengan prompt tersendiri `dr-paws-longitudinal-v1`. Hasil mencakup pola (`EMERGING`, `REPEATED`, `INCONSISTENT`, `RESOLVED`, `INSUFFICIENT_DATA`), perubahan waktu, kekuatan, hipotesis, kontradiksi, informasi kurang, dan saran sesi. Validator membuang referensi palsu, klaim pasti, serta perubahan dengan waktu terbalik; `REPEATED` memerlukan lebih dari satu rekaman independen. Kekuatan bukti kualitatif bukan probabilitas diagnosis. AI hanya menghasilkan `AI_PRELIMINARY`.
5. Fingerprint SHA-256 sumber membuat refresh idempoten dan menandai hasil stale bila input berubah. Gemini tidak dipanggil pada setiap page load. Reviewer tetap perlu menilai relevansi semantik, konteks, alternatif, dan kekurangan setiap rujukan.
6. Reviewer dapat menerima hipotesis untuk asesmen lanjut, meminta data, merevisi, menolak, atau mengonfirmasi eksplisit. Audit mencatat profil reviewer, waktu, aksi, state lama dan baru. AI tidak dapat memberi status `PROFESSIONALLY_CONFIRMED`. Laporan draf → reviewed → final dengan riwayat versi; edit setelah final membuka draf baru. PDF privat hanya untuk reviewed/final dan tetap menyebut bukan diagnosis final.
7. Next Session Planner menyimpan tujuan yang dapat diedit. **Buat Sesi Follow-up** hanya menyiapkan form sesi di browser; Tavus baru dipanggil setelah manusia menekan Start. Tujuan klinis langsung ditolak dari konteks anak. Memori anak dan open loop aman tetap mengikuti alur lama.

## Database, akses, penghapusan

Migrasi `supabase/migrations/008_dr_paws_longitudinal.sql` menambah tujuh tabel: `naya_reviewers`, `naya_case_sources`, `naya_case_audit`, `naya_longitudinal_analyses`, `naya_follow_up_plans`, `naya_longitudinal_reports`, `naya_longitudinal_report_revisions`. RLS aktif dan hanya service role server yang diberi akses. Data assessment lama tidak dihapus. Penghapusan profil mencakup data baru; penghapusan satu sesi membersihkan hasil longitudinal yang bisa mengutipnya. Hapus sumber memakai RPC transaksional dan konfirmasi eksplisit, termasuk audit yang berisi versi lama dan analisis/laporan turunan. Reset memori, hapus sesi, hapus sumber, dan hapus profil adalah operasi terpisah.

Password MyNaiA/cookie HttpOnly melindungi API profesional, dan POST memeriksa Origin. Profil reviewer diisi sendiri; **identitas dan lisensi belum diverifikasi**. Audit menunjukkan profil yang dipilih, bukan bukti siapa yang memegang perangkat. Pilot klinis memerlukan login per orang, verifikasi kredensial, persetujuan, kebijakan retensi, serta penilaian profesional. Sumber kolateral yang dimasukkan admin belum diverifikasi langsung kepada penuturnya. Analisis tidak boleh dipakai sebagai diagnosis otomatis. PWA hanya menyimpan aset statis; halaman kasus, API, transkrip, dan PDF tidak masuk cache. Naia tetap memakai `mode=naya` dan tidak membaca tabel kasus.

## Observabilitas dan validasi

API assessment/kasus mencatat route, action, waktu, durasi, status, dan kategori kegagalan (`SUPABASE`, `GEMINI`, `CASE_VALIDATION`, `SERVER`) tanpa password, key, transkrip, atau isi laporan. Untuk 503 berulang, lihat log fungsi Vercel. Satu 503 lama belum terbukti berasal dari cold start. Dashboard menampilkan **Data belum berhasil dimuat** dan **Coba Lagi**.

Tes mock mencakup tiga sesi satu anak, sumber orang tua/guru/profesional, pola sekali dan berulang, kontradiksi, perubahan waktu, referensi palsu, isolasi anak, audit, idempotensi, PDF, planner tanpa Tavus, route/cache, dan regresi tes Naia. Tidak ada profil anak palsu di production. Validasi manusia: gunakan sesi nyata yang dibuat secara sadar, masukkan sumber sebenarnya, refresh, periksa kontradiksi/bukti satu per satu, tinjau laporan, dan unduh PDF. Jangan klaim hasil klinis sebelum itu.
