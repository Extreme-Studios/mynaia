import { redactSensitive } from './transcript.mjs';

export const MEMORY_CATEGORIES = ['PROFILE','PREFERENCE','RELATIONSHIP','EPISODIC','PROJECT','ROUTINE','INTERACTION_STYLE','OPEN_LOOP','INSIDE_JOKE'];
const schema = {
  type: 'OBJECT', properties: {
    summary: { type: 'STRING' }, tone: { type: 'STRING' },
    topics: { type: 'ARRAY', items: { type: 'STRING' } },
    follow_ups: { type: 'ARRAY', items: { type: 'STRING' } },
    memories: { type: 'ARRAY', items: { type: 'OBJECT', properties: {
      category: { type: 'STRING', enum: MEMORY_CATEGORIES }, content: { type: 'STRING' },
      normalized_key: { type: 'STRING' }, importance: { type: 'NUMBER' }, confidence: { type: 'NUMBER' },
      supersedes_keys: { type: 'ARRAY', items: { type: 'STRING' } },
    }, required: ['category','content','normalized_key','importance','confidence'] } },
    open_loops: { type: 'ARRAY', items: { type: 'OBJECT', properties: {
      content: { type: 'STRING' }, normalized_key: { type: 'STRING' },
    }, required: ['content','normalized_key'] } },
    resolved_open_loop_keys: { type: 'ARRAY', items: { type: 'STRING' } },
    profile: { type: 'OBJECT', properties: {
      display_name: { type: 'STRING' }, preferred_language: { type: 'STRING' }, interaction_style: { type: 'STRING' },
    } },
  }, required: ['summary','tone','topics','follow_ups','memories','open_loops','resolved_open_loop_keys','profile'],
};

const instruction = `Ekstrak memori percakapan Naia dalam JSON. Bahasa Indonesia. Ringkas sesi, tone, topik, follow-up. Buat memori hanya untuk fakta yang mungkin berguna di sesi mendatang; abaikan filler. normalized_key harus stabil untuk fakta yang sama (contoh preference:coffee), walau parafrase/bahasa berbeda. Jika fakta baru mengganti fakta lama, pakai key yang sama atau isi supersedes_keys; jangan simpan dua fakta yang kontradiktif sebagai aktif. Tandai open loop spesifik, dan resolved_open_loop_keys untuk loop yang sudah dijawab. Jangan profilkan diagnosis medis/mental otomatis. Jangan keluarkan API key, password, token, kartu pembayaran, credential, atau rahasia. Jangan mengarang fakta atau emosi dari avatar/kamera. Maksimal 8 memori per sesi.`;
const childInstruction = `Ekstrak memori aman percakapan Dr. Paws untuk anak dalam JSON Bahasa Indonesia. Simpan hanya fakta ringan yang dinyatakan jelas oleh anak: nama panggilan, hobi, permainan/hewan/makanan favorit, kegiatan sekolah ringan, teman yang disebut casual, gambar atau mainan yang dibuat, rencana ringan, serta hal yang ingin ditanyakan lagi. Ringkas sesi secara singkat. normalized_key stabil untuk satu topik (contoh preference:favorite_color); bila preferensi berubah gunakan key yang sama agar fakta terbaru menang. Maksimal 6 memori. Jangan menyimpulkan kepribadian, kondisi mental, IQ, trauma, autisme, ADHD, diagnosis, risiko klinis, atau kondisi medis. Jangan simpan alamat lengkap, nomor identitas, nomor telepon, lokasi rinci, password, API key, token, pembayaran, atau informasi sensitif lain. Jangan mengarang; bila tidak ada fakta aman, keluarkan array kosong. Open loop hanya topik ringan untuk obrolan berikutnya. Jangan minta anak mengungkap rahasia.`;
const childSensitive = /\b(diagnos\w*|depresi|bipolar|skizofrenia|autis\w*|adhd|trauma|iq|kepribadian|gangguan mental|risiko klinis|perkembangan anak|penyakit|obat|alamat|jalan\s+\w+|nomor telepon|nomor hp|nik|ktp|password|kata sandi|api key|token|kartu kredit|rekening|pin)\b|\b(?:\+?62|0)8\d{8,12}\b|\b\d{16}\b/i;

const cleanText = (value, max = 400) => redactSensitive(String(value || '').trim()).slice(0, max);
const cleanKey = (value) => String(value || '').toLowerCase().replace(/[^a-z0-9:_-]/g, '_').slice(0, 100);
const score = (value) => Math.max(0, Math.min(1, Number(value) || 0));
const list = (value, max = 8) => Array.isArray(value) ? value.slice(0, max) : [];

export function validateExtraction(value) {
  if (!value || typeof value !== 'object' || typeof value.summary !== 'string' || !Array.isArray(value.memories)) throw new Error('MEMORY_EXTRACTION_INVALID');
  const memories = list(value.memories).flatMap((item) => {
    if (!MEMORY_CATEGORIES.includes(item?.category) || !item.content?.trim() || !item.normalized_key?.trim()) return [];
    const content = cleanText(item.content);
    const normalizedKey = cleanKey(item.normalized_key);
    if (!normalizedKey) return [];
    if (/^(iya|ya|oke|ok|hmm|hm|sip|yes)[.!\s]*$/i.test(content) || score(item.confidence) < 0.6 ||
      content.includes('[REDACTED_') || /\b(diagnosis|depresi|bipolar|skizofrenia)\b/i.test(content)) return [];
    return [{ category: item.category, content, normalized_key: normalizedKey,
      importance: score(item.importance), confidence: score(item.confidence),
      supersedes_keys: list(item.supersedes_keys).map(cleanKey).filter((key) => key && key !== normalizedKey) }];
  });
  return { summary: cleanText(value.summary, 1200), tone: cleanText(value.tone, 120),
    topics: list(value.topics).map((x) => cleanText(x, 80)),
    follow_ups: list(value.follow_ups).map((x) => cleanText(x, 160)), memories,
    open_loops: list(value.open_loops).flatMap((x) => x?.content && x?.normalized_key ? [{ content: cleanText(x.content, 250), normalized_key: cleanKey(x.normalized_key) }] : []),
    resolved_open_loop_keys: list(value.resolved_open_loop_keys).map(cleanKey).filter(Boolean),
    profile: Object.fromEntries(['display_name','preferred_language','interaction_style'].flatMap((key) =>
      typeof value.profile?.[key] === 'string' && value.profile[key].trim() ? [[key, cleanText(value.profile[key], 160)]] : [])),
  };
}

export function validateChildExtraction(value) {
  const result = validateExtraction(value);
  const safe = (text) => !childSensitive.test(text) && !text.includes('[REDACTED_');
  result.memories = result.memories.filter((item) =>
    ['PROFILE', 'PREFERENCE', 'EPISODIC', 'PROJECT', 'ROUTINE', 'OPEN_LOOP'].includes(item.category) &&
    safe(item.content) && safe(item.normalized_key));
  result.open_loops = result.open_loops.filter((item) => safe(item.content) && safe(item.normalized_key));
  result.resolved_open_loop_keys = result.resolved_open_loop_keys.filter(safe);
  result.summary = safe(result.summary) ? result.summary : 'Percakapan Dr. Paws selesai.';
  result.tone = safe(result.tone) ? result.tone : '';
  result.topics = result.topics.filter(safe);
  result.follow_ups = result.follow_ups.filter(safe);
  result.profile = {};
  return result;
}

export async function extractWithGemini(messages, { apiKey = process.env.GEMINI_API_KEY,
  model = process.env.GEMINI_MEMORY_MODEL || 'gemini-2.5-flash', fetchImpl = fetch, mode = 'naya' } = {}) {
  if (!apiKey?.trim()) throw new Error('GEMINI_KEY_REQUIRED');
  const transcript = messages.filter((x) => x.role === 'user' || x.role === 'assistant')
    .map((x) => `${x.role}: ${redactSensitive(x.content)}`).join('\n').slice(0, 30000);
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  let response;
  try { response = await fetchImpl(endpoint, { method: 'POST',
    headers: { 'x-goog-api-key': apiKey, 'content-type': 'application/json' },
    body: JSON.stringify({ systemInstruction: { parts: [{ text: mode === 'dr_paws' ? childInstruction : instruction }] },
      contents: [{ role: 'user', parts: [{ text: transcript }] }],
      generationConfig: { responseMimeType: 'application/json', responseSchema: schema, temperature: 0.2, maxOutputTokens: 1400 } }),
    signal: AbortSignal.timeout(30000),
  }); } catch { throw new Error('GEMINI_NETWORK_ERROR'); }
  if (!response.ok) throw new Error(`GEMINI_HTTP_${response.status}`);
  let raw;
  try { raw = await response.json(); } catch { throw new Error('GEMINI_INVALID_RESPONSE'); }
  try { return (mode === 'dr_paws' ? validateChildExtraction : validateExtraction)(JSON.parse(raw.candidates?.[0]?.content?.parts?.[0]?.text || '')); }
  catch { throw new Error('GEMINI_EXTRACTION_INVALID'); }
}
