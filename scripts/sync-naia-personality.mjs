// Explicit maintenance command. No conversation creation, no retries, no PAL creation.
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { loadRuntimePrompt } from '../app/backend/tavus.mjs';
import { PROFILE_COUNT, resolveTavusProfile } from '../app/backend/tavus-profiles.mjs';

if (!process.argv.includes('--apply')) throw new Error('Use --apply to update existing Naia PALs only.');
process.loadEnvFile(resolve('.env'));
const prompt = await loadRuntimePrompt();
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupDir = resolve('tmp', `naia-personality-${stamp}`);
await mkdir(backupDir, { recursive: true });
const results = [];
const seen = new Set();
for (let profile = 1; profile <= PROFILE_COUNT; profile++) {
  const config = resolveTavusProfile(profile);
  if (!config.apiKey || !config.nayaPalId) { results.push({ profile, status: 'unconfigured' }); continue; }
  if (seen.has(config.nayaPalId)) { results.push({ profile, status: 'shared-pal-already-processed' }); continue; }
  seen.add(config.nayaPalId);
  const url = `https://tavusapi.com/v2/pals/${encodeURIComponent(config.nayaPalId)}`;
  async function request(method, body) {
    const response = await fetch(url, { method, headers: { 'x-api-key': config.apiKey, 'content-type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(20000) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.status === 204 ? {} : response.json();
  }
  try {
    const before = await request('GET');
    if (before.pal_id !== config.nayaPalId || !/^(naia|naya)/i.test(before.pal_name || '') ||
      (before.default_face_id && before.default_face_id !== config.nayaFaceId) || config.nayaPalId === config.drPawsPalId) {
      throw new Error('PAL identity mismatch');
    }
    // Back up only the authored fields being changed. Never persist API secrets.
    const fields = ['system_prompt', 'greeting', 'dynamic_greeting'];
    const restore = fields.map(key => Object.hasOwn(before, key) ? { op: 'add', path: `/${key}`, value: before[key] } : { op: 'remove', path: `/${key}` });
    await writeFile(resolve(backupDir, `profile-${profile}.json`), JSON.stringify({ palId: before.pal_id, restore }, null, 2), { mode: 0o600 });
    const desired = { system_prompt: prompt, greeting: '', dynamic_greeting: true };
    const patch = Object.entries(desired).filter(([key, value]) => before[key] !== value)
      .map(([key, value]) => ({ op: Object.hasOwn(before, key) ? 'replace' : 'add', path: `/${key}`, value }));
    if (patch.length) await request('PATCH', patch);
    const after = patch.length ? await request('GET') : before;
    if (Object.entries(desired).some(([key, value]) => after[key] !== value)) throw new Error('Authored fields verification failed');
    for (const key of ['default_face_id', 'layers', 'languages', 'pipeline_mode', 'pal_name', 'guardrail_ids', 'objectives_id']) {
      if (JSON.stringify(after[key]) !== JSON.stringify(before[key])) throw new Error(`Preserved field changed: ${key}`);
    }
    results.push({ profile, status: patch.length ? 'updated-and-verified' : 'already-current', promptCharacters: prompt.length });
  } catch (error) {
    // Only our sanitized status text reaches the console. Never print provider bodies.
    results.push({ profile, status: 'failed', reason: error.message.startsWith('HTTP ') ? error.message : 'Verification or network failure' });
  }
  console.log(JSON.stringify(results.at(-1)));
}
await writeFile(resolve(backupDir, 'results.json'), JSON.stringify(results, null, 2));
console.log(`Backup: ${backupDir}`);
if (results.some(result => result.status === 'failed' || result.status === 'unconfigured')) process.exitCode = 1;
