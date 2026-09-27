import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const SESSION_AGE_MS = 24 * 60 * 60 * 1000;

export function equalSecret(left, right) {
  const a = createHash('sha256').update(String(left || '')).digest();
  const b = createHash('sha256').update(String(right || '')).digest();
  return timingSafeEqual(a, b);
}

export function sessionToken(secret, now = Date.now()) {
  const payload = `${now.toString(36)}.${randomBytes(16).toString('hex')}`;
  const signature = createHmac('sha256', secret).update(payload).digest('hex');
  return `${payload}.${signature}`;
}

export function authorized(request, accessCode, now = Date.now()) {
  if (!accessCode) return true;
  const cookie = String(request.headers.cookie || '').split(';').map((item) => item.trim())
    .find((item) => item.startsWith('naya_access='));
  const token = cookie?.slice('naya_access='.length);
  const match = token?.match(/^([0-9a-z]+)\.([0-9a-f]{32})\.([0-9a-f]{64})$/);
  if (!match) return false;
  const created = parseInt(match[1], 36);
  if (!Number.isSafeInteger(created) || created > now || now - created > SESSION_AGE_MS) return false;
  const expected = createHmac('sha256', accessCode).update(`${match[1]}.${match[2]}`).digest('hex');
  return equalSecret(match[3], expected);
}

export function sameOrigin(request) {
  const origin = request.headers.origin;
  if (!origin) return true;
  try {
    const url = new URL(origin);
    const host = String(request.headers['x-forwarded-host'] || request.headers.host || '').split(',')[0].trim();
    return (url.protocol === 'https:' || url.hostname === 'localhost' || url.hostname === '127.0.0.1') && url.host === host;
  } catch { return false; }
}
