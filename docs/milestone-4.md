# Milestone 4 — Supabase Persistent Memory + Personalization

Status (27 September 2026): project Supabase `mynaia` aktif, migrasi berhasil, tujuh tabel dan RLS telah diverifikasi, dan koneksi baca/tulis server lokal berhasil. Environment Supabase Production Vercel terpasang dan deployment siap; endpoint memori mengembalikan `enabled: true` melalui alias Vercel dan domain khusus. Uji recall dua sesi masih diperlukan. **SOURCE OF TRUTH = SUPABASE**. Tavus tetap penyedia avatar/video, STT, TTS, dan lip sync. Gemini memproses transkrip setelah sesi. Vercel hanya backend aplikasi dan tidak menyimpan state permanen di filesystem.

## Aktivasi

1. Project tujuan adalah Supabase `mynaia` (`fonhzclqymvqlqghmiwv`) di organisasi Extreme Studios, region Seoul. `supabase/migrations/001_naya_memory.sql` telah dijalankan melalui SQL Editor. Query verifikasi menemukan tepat tujuh tabel `naya_` dan `rowsecurity = true` untuk semuanya. Project PARFI tidak diubah.
2. `SUPABASE_URL` dan `SUPABASE_SERVICE_ROLE_KEY` telah disimpan di `.env` lokal dan environment Production Vercel, tanpa masuk source control. Jangan taruh key di frontend, source control, atau chat. Uji lokal berhasil membuat/membaca `naya_primary_user` melalui Data API dengan key server.
3. Pastikan `GEMINI_API_KEY` server-side tersedia untuk ekstraksi pasca-sesi. `GEMINI_MEMORY_MODEL` default `gemini-2.5-flash`, terpisah dari LLM percakapan Tavus-hosted.
4. `GET /api/memory/status` pada `mynaia.vercel.app` dan `mynaia.extremestudiosai.com` terverifikasi mengembalikan `enabled: true`, `provider: supabase`, `storeConfigured: true`, dan `pendingSessions: 0`. Angka pending menunjukkan sesi yang belum selesai diproses. Endpoint ini tidak mengirim isi transkrip, memori, user ID, atau key. Nilai nol saat ini belum membuktikan pipeline transkrip/Gemini atau recall live.

Jika Supabase tidak dikonfigurasi pada deployment lain, alur panggilan lama tetap bisa dipakai dan Tavus `participant_tags` lama dikirim sebagai fallback sementara. Pada konfigurasi Production ini, backend **tidak** mengirim `participant_tags`; kontinuitas hanya memakai `naya_primary_user` di database aplikasi. Tidak ada Tavus PAL, Face, Sparrow-2, patience, interruptibility, atau LLM yang diubah.

## Alur data

- Sebelum panggilan, backend membaca profil, maksimal 12 memori aktif, tiga ringkasan terbaru, dan tiga open loop dari Supabase. Context dibatasi 5.000 karakter, sekitar 500–1.500 token tergantung isinya, lalu disisipkan ke `conversational_context` Tavus. Sapaan dinamis tetap aktif; Naya memakai fakta relevan secara natural tanpa menyebut database.
- Setelah Tavus mengakhiri sesi, backend memanggil `GET /v2/conversations/{conversation_id}?verbose=true` dan hanya mengambil `application.transcription_ready.properties.transcript`. Jika belum ada, sesi tetap pending. Browser mengirim satu sinkronisasi tambahan delapan detik setelah End; sebelum panggilan berikutnya backend juga mencoba menyelesaikan sesi pending. `POST /api/memory/sync` tersedia untuk sinkronisasi manual; pada Vercel dibatasi kode akses.
- Transcript disimpan per giliran di `conversation_messages` dengan role, content, timestamp, seconds_from_start, duration, dan urutan. `(session_id, position)` unik, sehingga impor ulang tidak menggandakan baris. Audio dan video tidak disimpan.
- Gemini membaca teks yang sudah disaring, menghasilkan JSON berisi ringkasan, tone, topik, follow-up, memori, open loop, dan pembaruan profil. Memori memakai `(user_id, category, normalized_key)` untuk deduplikasi; fakta bertentangan memperbarui key lama atau menonaktifkan key yang digantikan. Open loop dapat ditandai resolved. Seluruh transkrip tetap menjadi arsip historis, sedangkan memori adalah indeks/interpretasi.

Identitas aplikasi `naya_primary_user` stabil dan tidak berasal dari Tavus key, PAL, Face, IP, browser, atau perangkat. Perubahan provider atau deployment tidak mengganti identitas. Untuk multi-user kelak, login harus memetakan akun ke user ID berbeda; login belum dibuat. Jangan membuka akses panggilan untuk banyak orang dengan satu akun prototype, karena semua sesi akan berbagi memori yang sama.

## Privasi dan batas

Transkrip dimaksudkan sebagai arsip tekstual, tetapi pola yang tampak seperti API key, token, password, dan kartu pembayaran disamarkan sebelum disimpan. Karena rahasia yang diucapkan bisa berbentuk bebas, penyaringan ini tidak bisa menjamin menangkap semuanya; jangan menyebut rahasia saat panggilan. Prompt ekstraksi menolak filler dan diagnosis kesehatan/mental sebagai profil otomatis, lalu output Gemini divalidasi lagi. Tidak ada klaim bahwa model selalu tepat. Akses database memakai service role di server; tabel RLS aktif tanpa policy browser. Pengguna perlu kebijakan retensi dan kontrol hapus sebelum rilis luas.

## Tes manusia dua sesi

Jangan buat conversation otomatis untuk pengujian. Setelah Supabase dan migrasi aktif:

1. Sesi 1: katakan “Namaku Adi”, “Aku suka kopi susu”, “Aku lagi ngerjain Naya Virtual Girl”, dan “Besok aku ada meeting penting”. Akhiri normal.
2. Tunggu sampai `/api/memory/status` menunjukkan tidak ada sesi pending. Periksa di Supabase bahwa session, pesan teks, ringkasan, memori, dan open loop tersimpan. Jangan buka transkrip lewat endpoint publik.
3. Sesi 2 dari HP atau browser lain: jangan ulang fakta. Tanyakan secara natural ingin minum apa dan proyek apa yang sedang dikerjakan. Amati apakah Naya menindaklanjuti meeting bila relevan, tanpa memuntahkan seluruh memori.
4. Ulangi pemeriksaan setelah mengganti PAL/key hanya bila memang diperlukan nantinya; desain identitas sudah independen, tetapi migrasi provider nyata belum diuji.

Tes mock lokal tidak membuat Tavus conversation dan tidak memakai menit Tavus. Hasil live hanya boleh disebut PASSED setelah seluruh alur Supabase dan recall dua sesi diverifikasi.

Referensi resmi: [Tavus Get Conversation](https://docs.tavus.io/api-reference/conversations/get-conversation), [Tavus Create Conversation](https://docs.tavus.io/api-reference/conversations/create-conversation), [Gemini structured output](https://ai.google.dev/gemini-api/docs/structured-output), [Supabase API keys](https://supabase.com/docs/guides/api/api-keys).
