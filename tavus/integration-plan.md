# Rencana integrasi Tavus Free

## Alur yang dituju

`Microphone pengguna → browser/perizinan → conversational session → Tavus realtime pipeline (STT, LLM Tavus-hosted, TTS, turn-taking) → stock AI Human/Face → video dan audio kembali ke browser`.

Naya adalah identitas produk dan suara/persona percakapan. Wajah stock sementara tidak boleh dipresentasikan sebagai wajah pribadi Naya yang telah dibuat khusus.

## Pelaksanaan Milestone 2

1. Periksa dashboard Tavus: akun Free aktif, saldo menit, aturan kuota/overage, dan ketentuan privasi. Hentikan eksperimen sebelum biaya muncul. Langkah akun ini masih tertunda karena API key belum tersedia.
2. Gunakan stock Anna Face `rc9cff32ceba`, ID yang tercantum pada dokumentasi resmi Tavus. Ini visual sementara dan tidak otomatis sesuai brief perempuan Indonesia. Tidak membuat custom Face/Replica.
3. Backend sudah siap membuat PAL dengan `system_prompt` dari `character/system-prompt.md`, pipeline `full`, Face Anna, dan LLM Tavus-hosted. PAL ID disimpan di `app/backend/.naya-pal.json` lokal atau disediakan lewat `TAVUS_PAL_ID`; keduanya tanpa API key. Pembuatan PAL nyata masih tertunda.
4. Backend memanggil `POST /v2/conversations` menggunakan `x-api-key` dari server dan `pal_id`; `face_id` boleh dikirim jika tidak sudah ada pada PAL. Browser hanya mendapat `conversation_url`/token sesi yang diperlukan. Jangan pernah menaruh API key di frontend.
5. Browser memakai iframe `conversation_url` resmi Tavus dengan `allow` untuk microphone/camera. Tavus/Daily UI di iframe menangani izin mic dan mute. Host menampilkan Ready, Connecting, ruang termuat, Ended, dan Error. Listening/Thinking/Speaking tidak diklaim oleh host tanpa event media yang sah.
6. Batasi durasi eksperimen, log penggunaan tanpa data sensitif, dan jalankan `tests/avatar-test-checklist.md` serta `tests/conversation-scenarios.md` pada desktop dan HP.

## Kontrak internal yang menjaga opsi LLM

Frontend bergantung pada `startConversation()` yang mengembalikan `joinUrl`, `sessionId`, dan status, bukan pada payload Tavus. Backend menyimpan adapter penyedia sesi. Perilaku Naya tetap bersumber dari satu system prompt. Jika nanti perlu Gemini/API lain, evaluasi apakah jalur custom LLM Tavus mendukung penyedia tersebut secara langsung atau melalui gateway yang kompatibel, dengan kredensial dan biaya terpisah. Perubahan itu berada di adapter/pipeline, tanpa membongkar UI. Opsi ini belum dibeli, diuji, atau diaktifkan.

## Status implementasi

Milestone 1 tetap PASS. Kode Milestone 2 dan test mock sudah tersedia, tetapi tidak ada API key, PAL nyata, sesi realtime, atau bukti avatar bergerak pada lingkungan lokal ini. `config.example.json` adalah ringkasan rencana internal, bukan payload API siap kirim. Lihat `docs/milestone-2.md`.
