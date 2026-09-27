# Keputusan desain

1. **Identitas Naya dipisah dari wajah avatar.** Pada tahap awal stock Face Tavus adalah visual sementara. UI menyebut Naya sebagai AI; kecocokan visual karakter diuji kemudian.
2. **PAL + Face mengikuti dokumentasi Tavus terkini.** Variabel `TAVUS_PERSONA_ID`/`TAVUS_REPLICA_ID` tetap ada sebagai placeholder yang diminta, tetapi jalur integrasi baru memakai `TAVUS_PAL_ID`/`TAVUS_FACE_ID` bila API akun memakai nomenklatur terbaru. Jangan mengisi keduanya dengan ID rekaan.
3. **Backend menjadi pemilik secret dan sesi.** Browser hanya mendapat URL sesi yang dibutuhkan; API key tidak diekspos lewat variabel frontend.
4. **LLM Tavus-hosted direncanakan untuk proof of concept.** Opsi Gemini disimpan sebagai batas adapter, belum diaktifkan dan bisa memerlukan biaya/akun terpisah.
5. **Memori masih konseptual.** Tidak ada database, profil tersimpan, atau klaim ingatan persisten pada Milestone 1.
6. **Skeleton UI statis.** Tidak ada panggilan Tavus, akses microphone, atau simulasi avatar. Kontrol belum aktif agar statusnya jujur.
7. **Krisis tidak diatasi oleh prompt saja.** Pengujian perilaku, alur bantuan manusia, dan kebijakan data harus diselesaikan sebelum pilot.
8. **PoC memakai iframe `conversation_url` resmi.** Tavus merekomendasikannya sebagai jalur cepat; frontend tetap vanilla tanpa migrasi React. Status host hanya membuktikan ruang termuat, bukan media tersambung.
9. **PAL Anna stock disimpan lokal.** ID `rc9cff32ceba` berasal dari dokumentasi Tavus. PAL dibuat sekali, ID tersimpan tanpa key, dan sesi dibatasi 180 detik untuk menjaga kuota Free.
