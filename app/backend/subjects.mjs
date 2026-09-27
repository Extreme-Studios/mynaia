import { randomUUID } from 'node:crypto';
import { PRIMARY_USER_ID, StorageError } from './supabase.mjs';

const eq = (value) => `eq.${value}`;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class SubjectError extends Error {
  constructor(code, message, status = 400) { super(message); this.code = code; this.status = status; }
}

export function makeSubjectService({ store, userId = PRIMARY_USER_ID } = {}) {
  async function list() {
    if (!store.configured) throw new StorageError('SUPABASE_NOT_CONFIGURED');
    return store.select('subjects', { owner_user_id: eq(userId), order: 'created_at.asc' }, 'id,display_name,nickname,created_at');
  }
  async function requireSubject(id) {
    if (typeof id !== 'string' || !UUID.test(id)) throw new SubjectError('SUBJECT_REQUIRED', 'Pilih profil anak terlebih dahulu.');
    const rows = await store.select('subjects', { id: eq(id), owner_user_id: eq(userId) }, 'id,display_name,nickname,memory_reset_at');
    if (!rows.length) throw new SubjectError('SUBJECT_NOT_FOUND', 'Profil anak tidak ditemukan.', 404);
    return rows[0];
  }
  async function create({ displayName, nickname } = {}) {
    const name = String(displayName || '').trim();
    const nick = String(nickname || '').trim();
    if (!name || name.length > 80 || nick.length > 80 || /[\r\n<>]/.test(name + nick))
      throw new SubjectError('SUBJECT_NAME_INVALID', 'Nama profil tidak valid.');
    await store.upsert('users', { id: userId }, 'id');
    const id = randomUUID();
    await store.upsert('subjects', { id, owner_user_id: userId, display_name: name, nickname: nick || null }, 'id');
    return { id, display_name: name, nickname: nick || null };
  }
  async function reset(id, confirmed) {
    if (confirmed !== true) throw new SubjectError('CONFIRMATION_REQUIRED', 'Konfirmasi reset ingatan diperlukan.');
    await requireSubject(id);
    const resetAt = new Date().toISOString();
    await store.update('subjects', { id: eq(id), owner_user_id: eq(userId) }, { memory_reset_at: resetAt, updated_at: resetAt });
    const filters = { user_id: eq(userId), mode: 'eq.dr_paws', subject_id: eq(id) };
    await Promise.all(['memories', 'open_loops', 'session_summaries'].map((table) => store.remove(table, filters)));
    return { reset: true };
  }
  return { list, requireSubject, create, reset };
}
