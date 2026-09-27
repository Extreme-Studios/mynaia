# Tavus pada Naya

Tavus direncanakan sebagai mesin percakapan video realtime awal. Milestone 1 hanya menyiapkan kontrak dan dokumentasi; belum menghubungi API, membuat PAL, atau memakai kuota. Mulai dari paket Free dan pilih stock Face yang tersedia pada akun. Jangan membeli paket, mengaktifkan overage, atau membuat custom Face/Replica.

Istilah dokumentasi Tavus saat ini: **PAL** mengatur perilaku dan pipeline, **Face** mengatur visual, dan **Conversation** adalah sesi. Dokumen lama mungkin menyebut Persona/Replica; placeholder itu tetap ada di `.env.example` karena diminta, tetapi integrasi baru harus diverifikasi terhadap API akun saat Milestone 2.

Rujukan resmi yang diperiksa 27 September 2026:

- [Tavus pricing](https://www.tavus.io/pricing) — paket Free dan stock AI humans; kuota serta syarat dapat berubah, jadi cek dashboard sebelum sesi nyata.
- [API Conversation Quickstart](https://docs.tavus.io/sections/conversational-video-interface/quickstart/cvi-quickstart) — PAL, `POST /v2/conversations`, dan `conversation_url`.
- [Create conversation](https://docs.tavus.io/api-reference/conversations/create-conversation) — field `pal_id`, `face_id`, dan respons sesi.
- [Stock Faces](https://docs.tavus.io/sections/faces/stock-faces) — katalog Face siap pakai.
- [LLM layer](https://docs.tavus.io/sections/conversational-video-interface/pal/llm) — model Tavus-hosted dan opsi LLM kompatibel OpenAI.
