export const DEFAULT_MEMORY_STORE = 'naya-primary-user-v1';

export function memoryStoreTag(env = process.env) {
  const tag = env.NAYA_MEMORY_STORE?.trim() || DEFAULT_MEMORY_STORE;
  if (tag.length > 128 || !/^[A-Za-z0-9_-]+$/.test(tag)) {
    throw new Error('NAYA_MEMORY_STORE harus berupa ID stabil berisi huruf, angka, _ atau -.');
  }
  return tag;
}

export const MEMORY_CONTEXT = `Gunakan konteks percakapan terdahulu secara natural dan hanya bila relevan. Jangan menyebut database atau sistem memori, mengutip semua fakta sekaligus, atau mengarang detail yang tidak diketahui. Jangan ulangi pertanyaan yang jawabannya sudah diketahui. Untuk pembuka, utamakan tindak lanjut kejadian terbaru yang relevan; jika tidak ada, sapa secara akrab bila ada konteks personal, atau sapa netral dengan variasi. Jangan selalu memakai kalimat sama atau menanyakan "apa kabar?". Abaikan filler. Jangan jadikan diagnosis kesehatan atau mental sebagai profil permanen, dan jangan mengingat API key, password, token, kartu pembayaran, atau credential.`;
