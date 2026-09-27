import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

const port = 3009;
const base = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, ['app/backend/server.mjs'], {
  cwd: new URL('../', import.meta.url),
  env: { ...process.env, PORT: String(port) },
  stdio: 'ignore',
});

try {
  let ready = false;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      const health = await fetch(`${base}/api/health`);
      const data = await health.json();
      if (health.status === 200 && data.status === 'ok') ready = true;
      if (ready) break;
    } catch { /* server starting */ }
    await delay(100);
  }
  if (!ready) throw new Error('Server tidak siap.');

  const page = await fetch(base);
  const html = await page.text();
  if (page.status !== 200 || !html.includes('Mulai Ngobrol')) throw new Error('Frontend gagal dimuat.');

  console.log('Smoke PASS: health dan frontend. Tidak membuat conversation.');
} finally {
  server.kill();
}
