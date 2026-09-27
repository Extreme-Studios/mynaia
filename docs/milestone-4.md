# Milestone 4 — Persistent Memory + Personalization

Status: implementasi siap; uji dua sesi oleh manusia belum dilakukan.

## Integrasi Tavus

Dokumentasi resmi Tavus terbaru memakai `participant_tags: ["naya-primary-user-v1"]` pada Create Conversation. `memory_stores` adalah field legacy yang deprecated; jangan kirim keduanya. Tag adalah identitas peserta stabil, bukan `memory_store_id` resource. Tavus membuat atau memakai kembali satu memory store untuk pasangan PAL + tag. PAL tetap `p54bfaf633c5`. Tidak ada PAL, Face, Sparrow-2, patience, interruptibility, LLM, atau key yang diubah pada milestone ini.

Backend mengambil tag dari `NAYA_MEMORY_STORE`; jika kosong, default `naya-primary-user-v1`. Frontend, IP, fingerprint, browser, dan perangkat tidak menentukan tag. Desktop dan HP yang mengakses backend yang sama memakai store yang sama. Untuk prototype single-user, batasi akses situs agar percakapan orang lain tidak tercampur ke memori primary user.

Setiap create conversation mengirim `participant_tags` tunggal, `dynamic_greeting: true`, dan `conversational_context` ringkas tentang penggunaan memori yang relevan dan sapaan bervariasi. Context ini menambah runtime prompt tanpa memodifikasi PAL existing. Tavus menyatakan `dynamic_greeting: true` pada conversation mengalahkan greeting tertulis PAL; greeting dihasilkan dari PAL dan context. Apakah hasilnya benar memakai learned memory saat opening masih perlu uji manusia.

`GET /api/memory/status` hanya menampilkan `enabled`, `provider`, dan `storeConfigured`. Endpoint ini tidak membaca isi memori atau mengekspos tag. Nilai `enabled: true` berarti konfigurasi aplikasi aktif, bukan bukti learned memory sudah terbentuk.

Pemeriksaan API read-only `GET /v2/memory-stores` untuk PAL existing mendapat HTTP 200 pada 27 September 2026. Ini menunjukkan endpoint daftar dapat diakses pada akun sekarang. Create/reuse store dan learned memory belum diverifikasi karena tidak ada conversation live otomatis. Bila create conversation nanti ditolak karena plan, hentikan pengujian; jangan upgrade atau membeli paket. Fallback yang didokumentasikan adalah Supabase untuk memory/profile + `conversational_context`, tetapi belum diimplementasikan.

## Kebijakan memori

| Kategori | Contoh |
| --- | --- |
| PROFILE | nama, panggilan, bahasa, preferensi gaya bicara |
| PREFERENCES | makanan, musik, hobi, aktivitas favorit |
| RELATIONSHIPS | keluarga/teman yang sering disebut dan hubungan relevan |
| EPISODIC | kejadian, aktivitas penting, pengalaman yang dibagikan |
| OPEN_LOOPS | rencana mendatang dan hal yang layak ditindaklanjuti |
| INTERACTION_STYLE | panjang jawaban, humor, gaya tenang |

Utamakan informasi yang berguna untuk percakapan mendatang. Abaikan filler seperti “iya”, “hmm”, dan “oke”. Jangan jadikan diagnosis kesehatan/mental sebagai profil permanen otomatis. Jangan sengaja menyimpan API key, password, token, kartu pembayaran, atau credential. Instruksi prompt tidak menjamin Tavus tidak akan mempelajari informasi sensitif yang diucapkan; sebelum penggunaan lebih luas, audit kebijakan retensi Tavus serta kemampuan melihat dan menghapus learned memory. Jangan memasukkan rahasia ke percakapan.

Tavus Memories memberi kontinuitas percakapan, bukan arsip verbatim. Milestone ini tidak menambah database transkrip, audio, atau video. Jika arsip persis dibutuhkan nanti, Supabase dapat menjadi backend opsional terpisah dengan persetujuan dan aturan retensi.

Untuk multi-user kelak, autentikasi harus memetakan setiap user ke tag `naya_user_<stable_user_uuid>` di backend. Tiap user memakai store berbeda; jangan pernah berbagi satu tag antar-user. Login belum dibuat.

## Uji manusia dua sesi

Jalankan hanya bila siap memakai Tavus minutes. Satu sesi A, akhiri, tunggu proses pembelajaran Tavus, lalu satu sesi B. Jangan menekan Start berulang kali.

1. Sesi A: katakan “Hai Naya, namaku Adi.”, “Aku suka kopi susu.”, dan “Besok pagi aku ada meeting penting.” Akhiri conversation.
2. Setelah memori selesai diproses, buka sesi B di browser atau perangkat lain dengan backend yang sama. Jangan ulang tiga fakta tadi.
3. Periksa apakah Naya mengenali nama jika relevan, memakai preferensi kopi secara wajar, dapat menindaklanjuti meeting, dan tidak selalu menyapa seperti pertemuan pertama. Tidak perlu menyebut semua fakta sekaligus. Jika semua fakta dimuntahkan di pembuka, anggap tidak natural.
4. Catat apakah greeting bervariasi, dan apakah tag/store benar-benar tersambung. Jika Tavus memberi error plan pada sesi pertama, hentikan dan laporkan `MILESTONE 4: TAVUS MEMORY PLAN BLOCKED`.

Tes mock lokal tidak menciptakan Tavus conversation. Hasil 21/21 lulus; uji manusia masih diperlukan untuk klaim PASS.

Referensi resmi: [Memories](https://docs.tavus.io/sections/conversational-video-interface/memories), [Create Conversation](https://docs.tavus.io/api-reference/conversations/create-conversation), [List Memory Stores](https://docs.tavus.io/api-reference/memory-stores/list-memory-stores).
