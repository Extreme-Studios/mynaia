import { mkdir, copyFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = join(root, 'app', 'frontend');
const destination = join(root, 'public');
await mkdir(destination, { recursive: true });
for (const name of ['index.html', 'styles.css', 'app.js', 'controller.mjs']) {
  await copyFile(join(source, name), join(destination, name));
}
console.log('Frontend siap untuk Vercel.');
