import { mkdir, copyFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = join(root, 'app', 'frontend');
const destination = join(root, 'public');
await mkdir(destination, { recursive: true });
await mkdir(join(destination, 'icons'), { recursive: true });
for (const name of ['index.html', 'styles.css', 'app.js', 'controller.mjs', 'manifest.webmanifest', 'sw.js',
  'self-view.mjs', 'motion.mjs', 'icons/icon-192.png', 'icons/icon-512.png']) {
  await copyFile(join(source, name), join(destination, name));
}
await copyFile(join(root, 'node_modules', '@daily-co', 'daily-js', 'dist', 'daily-esm.js'), join(destination, 'daily-esm.js'));
await copyFile(join(root, 'node_modules', 'gsap', 'dist', 'gsap.min.js'), join(destination, 'gsap.min.js'));
console.log('Frontend siap untuk Vercel.');
