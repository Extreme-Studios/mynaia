export const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/openai/';
export const DEFAULT_GEMINI_MODEL = 'gemini-3.8-flash';

export function geminiConfig(env = process.env) {
  return {
    configured: Boolean(env.GEMINI_API_KEY?.trim()),
    model: env.GEMINI_MODEL?.trim() || DEFAULT_GEMINI_MODEL,
  };
}

// One small, explicit text request. Never include provider response bodies in errors.
export async function testGeminiCompletion({
  apiKey = process.env.GEMINI_API_KEY,
  model = geminiConfig().model,
  fetchImpl = fetch,
} = {}) {
  if (!apiKey?.trim()) throw new Error('GEMINI_KEY_REQUIRED');
  let response;
  try {
    response = await fetchImpl(`${GEMINI_BASE_URL}chat/completions`, {
      method: 'POST',
      headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({ model, reasoning_effort: 'low', messages: [{ role: 'user', content: 'Balas hanya dengan kata: SIAP' }], stream: false }),
      signal: AbortSignal.timeout(20000),
    });
  } catch { throw new Error('GEMINI_NETWORK_ERROR'); }
  if (!response.ok) throw new Error(`GEMINI_HTTP_${response.status}`);
  let data;
  try { data = await response.json(); }
  catch { throw new Error('GEMINI_INVALID_JSON'); }
  const answer = data?.choices?.[0]?.message?.content?.trim();
  if (answer !== 'SIAP') throw new Error('GEMINI_UNEXPECTED_ANSWER');
  return { ok: true, model, answer };
}
