import { TavusError } from './tavus.mjs';
import { StorageError } from './supabase.mjs';

export const PROFILE_COUNT = 8;
export const ACTIVE_PROFILE_KEY = 'tavus_active_profile';

export function parseProfile(value) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1 || number > PROFILE_COUNT || String(value).trim() !== String(number)) {
    throw new TavusError('INVALID_PROFILE', 'Pilih profil Tavus 1 sampai 8.', 400);
  }
  return number;
}

export function resolveTavusProfile(number, env = process.env) {
  const profile = parseProfile(number);
  const prefix = `TAVUS_PROFILE_${profile}_`;
  const ownKey = env[`${prefix}API_KEY`]?.trim() || '';
  // Legacy credentials are a complete profile 1 only when no profile 1 key is set.
  const fallback = profile === 1 && !ownKey;
  return {
    profile,
    apiKey: ownKey || (fallback ? env.TAVUS_API_KEY?.trim() || '' : ''),
    nayaPalId: env[`${prefix}NAYA_PAL_ID`]?.trim() || (fallback ? (env.TAVUS_NAYA_PAL_ID || env.TAVUS_PAL_ID || '').trim() : ''),
    nayaFaceId: env[`${prefix}NAYA_FACE_ID`]?.trim() || (fallback ? 'rc9cff32ceba' : ''),
    drPawsPalId: env[`${prefix}DR_PAWS_PAL_ID`]?.trim() || (fallback ? env.TAVUS_DR_PAWS_PAL_ID?.trim() || '' : ''),
    drPawsFaceId: env[`${prefix}DR_PAWS_FACE_ID`]?.trim() || (fallback ? env.TAVUS_DR_PAWS_FACE_ID?.trim() || '' : ''),
  };
}

export function modeProfileError(config, mode) {
  if (mode === 'naya' && (!config.apiKey || !config.nayaPalId || !config.nayaFaceId)) {
    return new TavusError('PROFILE_NOT_CONFIGURED', `Naia belum dikonfigurasi untuk Tavus ${config.profile}.`, 503);
  }
  if (mode === 'dr_paws' && (!config.apiKey || !config.drPawsPalId || !config.drPawsFaceId)) {
    return new TavusError('PROFILE_NOT_CONFIGURED', `Dr. Paws belum dikonfigurasi untuk Tavus ${config.profile}.`, 503);
  }
  return null;
}

export function publicProfileStatus(config, active) {
  return {
    profile: config.profile,
    configured: Boolean(config.apiKey && config.nayaPalId && config.nayaFaceId && config.drPawsPalId && config.drPawsFaceId),
    apiConfigured: Boolean(config.apiKey),
    nayaConfigured: !modeProfileError(config, 'naya'),
    drPawsConfigured: !modeProfileError(config, 'dr_paws'),
    active: config.profile === active,
  };
}

export function makeActiveProfileStore({ store }) {
  async function getActive() {
    if (!store.configured) throw new StorageError('SUPABASE_NOT_CONFIGURED');
    const rows = await store.select('app_settings', { setting_key: `eq.${ACTIVE_PROFILE_KEY}` }, 'setting_value');
    return rows.length ? parseProfile(rows[0].setting_value) : 1;
  }
  async function setActive(profile) {
    const value = parseProfile(profile);
    if (!store.configured) throw new StorageError('SUPABASE_NOT_CONFIGURED');
    await store.upsert('app_settings', { setting_key: ACTIVE_PROFILE_KEY, setting_value: String(value) }, 'setting_key');
    return value;
  }
  return { getActive, setActive };
}
