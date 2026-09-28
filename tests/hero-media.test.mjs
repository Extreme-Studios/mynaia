import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { createHeroMedia, videoSources } from '../app/frontend/hero-media.mjs';

function harness({videos=[],reduced=false,fail=false,blocked=false,mode='naya'}={}) {
  let plays=0,pauses=0;const handlers={},sources=[];
  const video={hidden:true,muted:false,loop:false,append:s=>sources.push(s),querySelector:()=>sources[0],
    addEventListener:(event,fn)=>handlers[event]=fn,pause:()=>pauses++,play:()=>{plays++;return blocked?Promise.reject(new Error('blocked')):Promise.resolve();}};
  const image={};const node={dataset:{hero:'naia'},querySelector:s=>s==='img'?image:video,closest:()=>null};
  const listeners={};const doc={hidden:false,querySelectorAll:()=>[node],querySelector:()=>node,createElement:()=>({}),addEventListener:(n,f)=>listeners[n]=f,removeEventListener:n=>delete listeners[n]};
  const media={matches:reduced,addEventListener:()=>{},removeEventListener:()=>{}};
  const app=createHeroMedia({mode,document:doc,mediaQuery:media,fetch:async()=>{if(fail)throw new Error('offline');return {ok:true,json:async()=>({'naia':{videos},'dr-paws':{videos}})};}});
  return {app,doc,node,image,video,sources,handlers,listeners,media,get plays(){return plays;},get pauses(){return pauses;}};
}
test('hero source whitelist rejects URLs, arbitrary files and unknown identities',()=>{
 assert.deepEqual(videoSources({naia:{videos:['naia-hero-loop.webm','naia-hero-loop.mp4','https://secret/key','../private.mp4']}},'naia'),['naia-hero-loop.webm','naia-hero-loop.mp4']);
 assert.deepEqual(videoSources({},'unknown'),[]);
});
test('no video assets: poster renders without video loads/playback',async()=>{const h=harness();await h.app.ready;assert.equal(h.node.dataset.media,'poster');assert.equal(h.plays,0);assert.equal(h.sources.length,0);assert.match(h.image.src,/naia-hero-poster/);h.app.destroy();});
test('present loop: muted media appears only after loadeddata, error restores poster',async()=>{const h=harness({videos:['naia-hero-loop.mp4']});await h.app.ready;assert.equal(h.video.muted,true);assert.equal(h.video.hidden,true);assert.equal(h.sources.length,1);h.handlers.loadeddata();assert.equal(h.video.hidden,false);h.handlers.error();assert.equal(h.video.hidden,true);const before=h.plays;h.app.setCallActive(false);assert.equal(h.plays,before);h.app.destroy();});
test('blocked autoplay and manifest failure keep poster usable',async()=>{for(const options of [{videos:['naia-hero-loop.mp4'],blocked:true},{fail:true}]){const h=harness(options);await h.app.ready;await Promise.resolve();assert.equal(h.video.hidden,true);assert.equal(h.node.dataset.media,'poster');h.app.destroy();}});
test('reduced motion, hidden page, and call all pause decorative loops',async()=>{const h=harness({videos:['naia-hero-loop.mp4'],reduced:true});await h.app.ready;assert.equal(h.plays,0);h.media.matches=false;h.app.setCallActive(false);h.handlers.loadeddata();assert.equal(h.video.hidden,false);h.app.setCallActive(true);h.handlers.loadeddata();assert.equal(h.video.hidden,true);h.doc.hidden=true;h.app.setCallActive(false);assert.equal(h.video.hidden,true);h.app.destroy();assert.deepEqual(h.listeners,{});});
test('Dr. Paws precall uses its own portrait and sources',async()=>{const h=harness({mode:'dr_paws',videos:['dr-paws-hero-loop.webm']});await h.app.ready;assert.equal(h.node.dataset.hero,'dr-paws');assert.equal(h.image.alt,'Dr. Paws');assert.match(h.sources[0].src,/dr-paws-hero-loop/);h.app.destroy();});
test('scene has no orb/egg geometry; posters, controls and keyboard/tap focus remain',async()=>{const scene=await readFile(new URL('../app/frontend/cinematic/scene.mjs',import.meta.url),'utf8');const html=await readFile(new URL('../app/frontend/index.html',import.meta.url),'utf8');const app=await readFile(new URL('../app/frontend/app.js',import.meta.url),'utf8');assert.doesNotMatch(scene,/IcosahedronGeometry|SphereGeometry|TorusGeometry|Sprite/);assert.match(html,/data-hero="naia"/);assert.match(html,/data-hero="dr-paws"/);assert.match(app,/pointerdown/);assert.match(app,/focusout/);assert.match(app,/heroMedia.setCallActive/);assert.doesNotMatch(html,/TAVUS_API_KEY|GEMINI_API_KEY|SUPABASE_SERVICE_ROLE_KEY/);});
test('build manifest keeps absent loops absent and posters valid PNG files',async()=>{const manifest=JSON.parse(await readFile(new URL('../public/assets/hero/manifest.json',import.meta.url),'utf8'));for(const key of ['naia','dr-paws']){const names=await readdir(new URL('../app/frontend/assets/hero/',import.meta.url));assert.deepEqual(manifest[key].videos,['webm','mp4'].map(ext=>`${key}-hero-loop.${ext}`).filter(name=>names.includes(name)));const image=await readFile(new URL(`../app/frontend/assets/hero/${key}-hero-poster.png`,import.meta.url));assert.equal(image.subarray(1,4).toString(),'PNG');assert.ok(image.readUInt32BE(16)>=1000);}});
