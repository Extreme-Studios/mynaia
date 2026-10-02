# Naia — sahabat dan partner strategi

Tanggal: 2 Oktober 2026.

## Perubahan

- Runtime persona: sahabat dekat yang hangat, jujur, aktif menanggapi isi cerita dan memberi pendapat beralasan; tidak sekadar tanya-jawab atau terus mewawancarai.
- Diskusi ekonomi/marketing: segmentasi, positioning, harga, funnel, CAC/LTV, margin, arus kas, break-even, biaya peluang, insentif, elastisitas, persaingan, inflasi/daya beli. Pilih konsep relevan, satu prioritas, trade-off, eksperimen kecil, dan metrik. Jawaban strategi boleh 3–6 kalimat; casual tetap 1–3 kalimat.
- Curhat: mendengarkan dulu, tidak memaksa solusi bisnis. AI transparency, batas hubungan, keselamatan, dan larangan mengarang ingatan tetap ada.
- Pembuka memakai waktu backend Asia/Jakarta (WIB): pagi 05–10, siang 11–14, sore 15–17, malam 18–04. Ada tiga variasi, tidak memperkenalkan diri sebagai asisten pribadi. Waktu memakai WIB; bukan geolokasi otomatis.
- Conversation Naia memakai `custom_greeting` dan `dynamic_greeting: false`; konteks waktu dan Supabase tetap diinjeksi. Sapaan literal menang atas generated greeting menurut [Create conversation Tavus](https://docs.tavus.io/api-reference/conversations/create-conversation). Dr. Paws tetap memakai konfigurasi awal.

## Konfigurasi remote dan rollback

Delapan PAL existing Naia di Profil 1–8 berhasil PATCH dan GET verifikasi. Hanya `system_prompt`, `greeting`, dan `dynamic_greeting` disentuh dengan [JSON Patch resmi](https://docs.tavus.io/api-reference/pals/patch-pal). Verifikasi memastikan Face, layers/model/latency, languages, pipeline, nama PAL, guardrails, dan objectives tidak berubah. Tidak membuat PAL baru, conversation, ataupun mengakses Tavus memory.

Runtime prompt: 3.179 karakter, perkiraan 795 token (estimasi karakter/4, bukan tokenizer model). Tidak ada reasoning/thinking configuration baru. Dokumentasi panjang tetap terpisah di personality.md.

Backup rollback lokal: `tmp/naia-personality-2026-10-02T10-12-17-234Z/profile-1.json` sampai `profile-8.json`. Berisi hanya PAL ID dan operasi restore tiga authored fields, tanpa API key. Folder diabaikan Git/Vercel. Rollback dilakukan manual dengan API key backend dari profil terkait; jangan cetak atau salin key ke laporan. Untuk sinkronisasi berikutnya: `node --use-system-ca scripts/sync-naia-personality.mjs --apply`. Command hanya GET/PATCH/GET PAL existing, tanpa retries atau force untuk membuang perubahan PAL Maker.

## Validasi

Check dan build lulus; 99 tests lulus, termasuk batas jam WIB, variasi sapaan, payload Naia/Dr. Paws, Supabase context, absence of persistent Tavus memory fields, dan no-secret payload. Mock tidak membuktikan model akan selalu patuh atau kemampuan ekonomi meningkat. Tidak ada training model, pencarian internet baru, data pasar realtime, live call, atau menit conversation yang dipakai. Evaluasi gaya bicara/ketepatan saran dilakukan pengguna pada sesi berikutnya dengan checklist `tests/persona-scenarios.md`.
