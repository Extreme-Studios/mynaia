import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const MAX_AGE_MS = 15 * 60 * 1000;
const COOKIE = 'mynaia_admin';

export function secretMatches(input, secret) {
  if (!secret || typeof input !== 'string') return false;
  const a = createHash('sha256').update(input).digest();
  const b = createHash('sha256').update(secret).digest();
  return timingSafeEqual(a, b);
}

export function createAdminCookie(secret, { secure = true, now = Date.now() } = {}) {
  const payload = `${now.toString(36)}.${randomBytes(16).toString('hex')}`;
  const signature = createHmac('sha256', secret).update(payload).digest('hex');
  return `${COOKIE}=${payload}.${signature}; HttpOnly; SameSite=Strict; Path=/api/admin; Max-Age=900${secure ? '; Secure' : ''}`;
}

export function adminAuthorized(request, secret, now = Date.now()) {
  if (!secret) return false;
  const cookie = String(request.headers.cookie || '').split(';').map((part) => part.trim())
    .find((part) => part.startsWith(`${COOKIE}=`));
  const match = cookie?.slice(COOKIE.length + 1).match(/^([0-9a-z]+)\.([0-9a-f]{32})\.([0-9a-f]{64})$/);
  if (!match) return false;
  const issued = parseInt(match[1], 36);
  if (!Number.isSafeInteger(issued) || issued > now || now - issued > MAX_AGE_MS) return false;
  const expected = createHmac('sha256', secret).update(`${match[1]}.${match[2]}`).digest('hex');
  return secretMatches(match[3], expected);
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
