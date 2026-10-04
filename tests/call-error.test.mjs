import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';

test('call UI preserves upstream HTTP status before generic profile wording',async()=>{
 const source=await readFile(new URL('../app/frontend/app.js',import.meta.url),'utf8');
 const fn=source.slice(source.indexOf('function friendlyCallError('),source.indexOf('function updateFullscreen()'));
 const format=runInNewContext(`(${fn.trim()})`,{modeName:'Naia'});
 for(const status of [400,401,402,403,429,500]){
  const message=format(`Profil aktif ditolak saat membuat sesi (HTTP ${status}). Periksa batas penggunaan dan konfigurasi profil.`);
  assert.match(message,new RegExp(`HTTP ${status}`));
  assert.doesNotMatch(message,/belum siap/);
 }
 assert.match(format('PAL tidak valid'),/belum siap/);
});
