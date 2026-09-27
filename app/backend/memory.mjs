export const DEFAULT_MEMORY_STORE = 'naya-primary-user-v1';

export function memoryStoreTag(env = process.env) {
  const tag = env.NAYA_MEMORY_STORE?.trim() || DEFAULT_MEMORY_STORE;
  if (tag.length > 128 || !/^[A-Za-z0-9_-]+$/.test(tag)) {
    throw new Error('NAYA_MEMORY_STORE harus berupa ID stabil berisi huruf, angka, _ atau -.');
  }
  return tag;
}

export function memoryStatus(env = process.env) {
  memoryStoreTag(env);
  return { enabled: true, provider: 'tavus', storeConfigured: true };
}

export const MEMORY_CONTEXT = `Gunakan memori Tavus yang tersedia secara natural dan hanya bila relevan. Jangan menyebut sistem memori, mengutip semua fakta sekaligus, atau mengarang detail yang tidak diketahui. Jangan ulangi pertanyaan yang jawabannya sudah diketahui. Untuk pembuka, utamakan tindak lanjut kejadian terbaru yang relevan; jika tidak ada, sapa secara akrab bila ada konteks personal, atau sapa netral dengan variasi. Jangan selalu memakai kalimat sama atau menanyakan "apa kabar?". Simpan hanya informasi yang berguna untuk sesi mendatang; abaikan filler. Jangan jadikan diagnosis kesehatan atau mental sebagai profil permanen, dan jangan mengingat API key, password, token, kartu pembayaran, atau credential.`;
