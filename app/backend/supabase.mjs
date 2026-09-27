export const PRIMARY_USER_ID = 'naya_primary_user';
const TABLES = new Set(['users','conversation_sessions','conversation_messages','memories','user_profile','open_loops','session_summaries','subjects','app_settings']);

export class StorageError extends Error {
  constructor(code) { super(code); this.name = 'StorageError'; this.code = code; }
}

export function makeSupabaseStore({ url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY,
  fetchImpl = fetch } = {}) {
  const configured = Boolean(url?.trim() && key?.trim());
  let origin;
  if (configured) {
    try { origin = new URL(url); } catch { throw new StorageError('SUPABASE_URL_INVALID'); }
    if (origin.protocol !== 'https:' || origin.username || origin.password) throw new StorageError('SUPABASE_URL_INVALID');
  }

  async function query(table, { method = 'GET', filters = {}, columns = '*', body, conflict } = {}) {
    if (!configured) throw new StorageError('SUPABASE_NOT_CONFIGURED');
    if (!TABLES.has(table)) throw new StorageError('SUPABASE_TABLE_INVALID');
    const target = new URL(`/rest/v1/naya_${table}`, origin);
    if (method === 'GET') target.searchParams.set('select', columns);
    if (conflict) target.searchParams.set('on_conflict', conflict);
    for (const [name, value] of Object.entries(filters)) target.searchParams.set(name, value);
    let response;
    try {
      response = await fetchImpl(target, {
        method,
        headers: {
          apikey: key,
          ...(key.startsWith('sb_secret_') ? {} : { authorization: `Bearer ${key}` }),
          'content-type': 'application/json',
          prefer: method === 'GET' ? 'count=exact' : 'resolution=merge-duplicates,return=representation',
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: AbortSignal.timeout(12000),
      });
    } catch { throw new StorageError('SUPABASE_NETWORK_ERROR'); }
    if (!response.ok) throw new StorageError(`SUPABASE_HTTP_${response.status}`);
    try { return response.status === 204 ? [] : await response.json(); }
    catch { throw new StorageError('SUPABASE_INVALID_RESPONSE'); }
  }

  const select = (table, filters = {}, columns = '*') => query(table, { filters, columns });
  const upsert = (table, body, conflict) => query(table, { method: 'POST', body, conflict });
  const update = (table, filters, body) => query(table, { method: 'PATCH', filters, body });
  const remove = (table, filters) => query(table, { method: 'DELETE', filters });
  return { configured, select, upsert, update, remove };
}
