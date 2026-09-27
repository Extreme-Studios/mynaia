import { TavusError } from './tavus.mjs';

export async function inspectTavusProfile(config, { fetchImpl = fetch } = {}) {
  if (!config.apiKey) return { profile: config.profile, apiAuthenticated: false,
    nayaPalAccessible: false, drPawsPalAccessible: false,
    nayaFaceAccessible: false, drPawsFaceAccessible: false };
  async function read(path) {
    let response;
    try {
      response = await fetchImpl(`https://tavusapi.com${path}`, {
        headers: { 'x-api-key': config.apiKey }, signal: AbortSignal.timeout(15000),
      });
    } catch { throw new TavusError('NETWORK_ERROR', 'Tavus tidak dapat dihubungi.'); }
    if (response.status === 401 || response.status === 403) {
      throw new TavusError('PROFILE_AUTH_FAILED', `Autentikasi Tavis ${config.profile} gagal.`, 502);
    }
    if (!response.ok) throw new TavusError('API_ERROR', `Validasi Tavis ${config.profile} gagal (HTTP ${response.status}).`, 502);
    try { return await response.json(); }
    catch { throw new TavusError('MALFORMED_RESPONSE', 'Respons Tavus tidak valid.'); }
  }
  await read('/v2/pals?limit=1&pal_type=user');
  async function accessible(kind, id) {
    if (!id) return false;
    try {
      const value = await read(`/v2/${kind}/${encodeURIComponent(id)}`);
      return (kind === 'pals' ? value.pal_id : value.face_id) === id;
    } catch (error) {
      if (error.code === 'API_ERROR') return false;
      throw error;
    }
  }
  const [nayaPalAccessible, drPawsPalAccessible, nayaFaceAccessible, drPawsFaceAccessible] = await Promise.all([
    accessible('pals', config.nayaPalId), accessible('pals', config.drPawsPalId),
    accessible('faces', config.nayaFaceId), accessible('faces', config.drPawsFaceId),
  ]);
  return { profile: config.profile, apiAuthenticated: true, nayaPalAccessible,
    drPawsPalAccessible, nayaFaceAccessible, drPawsFaceAccessible };
}
