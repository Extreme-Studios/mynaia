import { mkdir, copyFile, readdir, unlink, writeFile, readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = join(root, 'app', 'frontend');
const destination = join(root, 'public');
await mkdir(destination, { recursive: true });
for (const name of await readdir(destination)) {
  if (/^cinematic-[A-Z0-9]+\.js$/.test(name)) await unlink(join(destination, name));
}
await mkdir(join(destination, 'icons'), { recursive: true });
for (const name of ['index.html', 'styles.css', 'app.js', 'dashboard.html', 'dashboard.js', 'dashboard.css', 'case.html', 'case.js', 'case.css', 'controller.mjs', 'manifest.webmanifest', 'sw.js',
  'self-view.mjs', 'motion.mjs', 'hero-media.mjs', 'icons/icon-192.png', 'icons/icon-512.png']) {
  await copyFile(join(source, name), join(destination, name));
}
await copyFile(join(root, 'node_modules', '@daily-co', 'daily-js', 'dist', 'daily-esm.js'), join(destination, 'daily-esm.js'));
await copyFile(join(root, 'node_modules', 'gsap', 'dist', 'gsap.min.js'), join(destination, 'gsap.min.js'));
await build({ entryPoints: [join(source, 'cinematic', 'engine.mjs')], bundle: true, splitting: true,
  format: 'esm', platform: 'browser', target: 'es2022', minify: true, outdir: destination,
  entryNames: 'cinematic', chunkNames: 'cinematic-[hash]' });
console.log('Frontend siap untuk Vercel.');

const heroSource=join(source,'assets','hero'), heroDestination=join(destination,'assets','hero');
await mkdir(heroDestination,{recursive:true});
const allowed=/^(?:naia|dr-paws)-hero-(?:poster\.png|loop\.(?:mp4|webm))$/;
// Drive holds the originals. Deploy only compact, silent web derivatives.
for(const name of await readdir(heroDestination)) if(allowed.test(name) || /^(naia|dr-paws)-hero-poster\.jpg$/.test(name)) await unlink(join(heroDestination,name));
for(const key of ['naia','dr-paws']) for(const suffix of ['hero-poster.jpg','hero-loop.mp4'])
  await copyFile(join(heroSource,`${key}-${suffix}`),join(heroDestination,`${key}-${suffix}`));
const manifest=JSON.parse(await readFile(join(heroSource,'catalog.json'),'utf8'));
await writeFile(join(heroDestination,'manifest.json'),JSON.stringify(manifest));
