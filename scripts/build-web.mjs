import { mkdir, copyFile, readdir, unlink, writeFile } from 'node:fs/promises';
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
for (const name of ['index.html', 'styles.css', 'app.js', 'controller.mjs', 'manifest.webmanifest', 'sw.js',
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
const heroNames=await readdir(heroSource);
const allowed=/^(?:naia|dr-paws)-hero-(?:poster\.png|loop\.(?:mp4|webm))$/;
for(const name of await readdir(heroDestination)) if(allowed.test(name) && !heroNames.includes(name)) await unlink(join(heroDestination,name));
for(const name of heroNames) if(allowed.test(name)) await copyFile(join(heroSource,name),join(heroDestination,name));
const manifest=Object.fromEntries(['naia','dr-paws'].map(key=>[key,{poster:`${key}-hero-poster.png`,videos:['webm','mp4'].map(ext=>`${key}-hero-loop.${ext}`).filter(name=>heroNames.includes(name))}]));
await writeFile(join(heroDestination,'manifest.json'),JSON.stringify(manifest));
