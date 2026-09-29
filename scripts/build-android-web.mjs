import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { build } from 'esbuild';
await import('./build-web.mjs');
const out = 'dist/android-web';
await mkdir(out, { recursive: true });
await cp('public', out, { recursive: true });
await build({ stdin: { contents: "import { Capacitor, CapacitorHttp, registerPlugin } from '@capacitor/core'; globalThis.Capacitor = Object.assign(Capacitor, { Plugins: { CapacitorHttp, MyNaia: registerPlugin('MyNaia') } });", resolveDir: process.cwd() },
  bundle: true, format: 'iife', minify: true, outfile: `${out}/native-runtime.js` });
for (const name of ['index','dashboard','case']) {
  const path = `${out}/${name}.html`;
  const html = (await readFile(path,'utf8')).replace('<head>', '<head><script src="/native-runtime.js"></script>');
  await writeFile(path,html);
}
// Capacitor serves bundled paths, without Vercel rewrites.
for (const route of ['naia','naya','dr-paws','dr-paws/dashboard']) {
  await mkdir(`${out}/${route}`,{recursive:true});
  await cp(`${out}/${route.endsWith('dashboard') ? 'dashboard' : 'index'}.html`,`${out}/${route}/index.html`);
}
console.log('Android frontend bundled; no backend or environment files copied.');
