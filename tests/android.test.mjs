import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { apiUrl, apiFetch, backAction, prepareMicrophone, permissionMessage, nativeLogout, nativePageUrl, setNativeCall, setNativeFullscreen } from '../app/frontend/platform.mjs';
const read = (path) => readFile(new URL('../' + path, import.meta.url),'utf8');

test('Android API resolver preserves web origin and rejects non-API destinations', () => {
  assert.equal(apiUrl('/api/access/status',false),'/api/access/status');
  assert.equal(apiUrl('/api/access/status',true),'https://mynaia.extremestudiosai.com/api/access/status');
  for (const path of ['https://evil.test/api/a','//evil.test/api/a','/api/../secret','/api/\\evil']) assert.throws(() => apiUrl(path,true));
});
test('native authenticated API uses native cookie transport without exposing cookie headers', async () => {
  let sent;
  globalThis.Capacitor = { getPlatform: () => 'android', Plugins: { CapacitorHttp: { request: async (request) => {
    sent = request; return { status:200, data:{authorized:true},headers:{'Set-Cookie':'private-session','content-type':'application/json'} }; } } } };
  try {
    const response = await apiFetch('/api/access/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({code:'mock-only'})});
    assert.equal(sent.url,'https://mynaia.extremestudiosai.com/api/access/login');
    assert.equal(sent.disableRedirects,true); assert.deepEqual(sent.data,{code:'mock-only'});
    assert.equal(response.headers.has('set-cookie'),false); assert.deepEqual(await response.json(),{authorized:true});
  } finally { delete globalThis.Capacitor; }
});
test('native PDF is returned as binary rather than JSON or public URL', async () => {
  globalThis.Capacitor = { getPlatform: () => 'android', Plugins: { CapacitorHttp: { request: async () => ({status:200,data:btoa('%PDF-mock'),headers:{'Content-Type':'application/pdf'}}) } } };
  try { assert.equal(await (await apiFetch('/api/dr-paws/case?action=pdf')).text(),'%PDF-mock'); }
  finally { delete globalThis.Capacitor; }
});
for (const result of [{granted:true},{granted:false,permanent:false},{granted:false,permanent:true}]) {
  test(`microphone permission ${JSON.stringify(result)} is handled before conversation start`, async () => {
    let started = 0;
    globalThis.Capacitor = { getPlatform: () => 'android', Plugins: { MyNaia: { microphone: async () => result } } };
    try {
      const start = async () => { await prepareMicrophone('naya'); started++; };
      if (result.granted) await start(); else await assert.rejects(start, (error) => error.permanent === result.permanent);
      assert.equal(started,result.granted ? 1 : 0);
    } finally { delete globalThis.Capacitor; }
  });
}
test('permission copy matches each companion and permanent-denial action', () => {
  assert.match(permissionMessage('dr_paws',true),/Dr\. Paws.*Buka Pengaturan Aplikasi/);
  assert.match(permissionMessage('naya'),/Naia.*Coba Lagi/);
});
test('Back closes settings first, confirms call, returns Home, or exits', () => {
  assert.equal(backAction({settings:true,active:true}),'settings');
  assert.equal(backAction({active:true}),'confirm');
  assert.equal(backAction({pathname:'/dr-paws/dashboard'}),'home');
  assert.equal(backAction(), 'exit');
});
test('packaged routes reuse the proper HTML without production rewrites', () => {
  const url = (path) => new URL(path,'https://localhost');
  assert.equal(nativePageUrl(url('/naia')),'/naia');
  assert.equal(nativePageUrl(url('/dr-paws')),'/dr-paws');
  assert.equal(nativePageUrl(url('/dr-paws/dashboard')),'/dashboard.html');
  assert.equal(nativePageUrl(url('/dr-paws/dashboard/subjects/child-id')),'/case.html?subject=child-id');
});
test('native call/fullscreen cleanup and logout use only the shell bridge', async () => {
  const calls=[];
  globalThis.Capacitor={getPlatform:()=> 'android',Plugins:{MyNaia:{
    callState:async (value)=>calls.push(['call',value.active]),fullscreen:async (value)=>calls.push(['fullscreen',value.active]),
    logout:async ()=>calls.push(['logout'])}}};
  try { await setNativeCall(true); await setNativeFullscreen(false); await setNativeCall(false); await nativeLogout();
    assert.deepEqual(calls,[['call',true],['fullscreen',false],['call',false],['logout']]); }
  finally { delete globalThis.Capacitor; }
});
test('Android config bundles assets and blocks cleartext, debug logging and remote server URL', async () => {
  const config=JSON.parse(await read('capacitor.config.json'));
  assert.equal(config.appId,'com.extremestudios.mynaia'); assert.equal(config.webDir,'dist/android-web');
  assert.equal(config.server.url,undefined); assert.equal(config.server.androidScheme,'https');
  assert.equal(config.server.hostname,'localhost'); assert.equal(config.server.cleartext,false);
  assert.equal(config.android.allowMixedContent,false); assert.equal(config.loggingBehavior,'none');
});
test('Android permissions are limited to media/network with optional camera hardware', async () => {
  const xml=await read('android/app/src/main/AndroidManifest.xml');
  const permissions=[...xml.matchAll(/uses-permission android:name="([^"]+)"/g)].map((match)=>match[1]);
  assert.deepEqual(permissions.sort(),['INTERNET','RECORD_AUDIO','CAMERA','MODIFY_AUDIO_SETTINGS'].map((name)=>'android.permission.'+name).sort());
  assert.match(xml,/android.hardware.camera" android:required="false"/);
  assert.match(xml,/allowBackup="false"/); assert.match(xml,/usesCleartextTraffic="false"/);
});
test('WebView grants only approved capture resources, denies unknown origins/resources', async () => {
  const java=await read('android/app/src/main/java/com/extremestudios/mynaia/MainActivity.java');
  assert.match(java,/ContextCompat.checkSelfPermission/); assert.match(java,/pending.grant\(approved.toArray/);
  assert.doesNotMatch(java,/grant\(request.getResources/); assert.match(java,/if \(!trusted/);
});
test('native lifecycle releases wake lock in background and does not create sessions', async () => {
  const java=await read('android/app/src/main/java/com/extremestudios/mynaia/MyNaiaPlugin.java');
  assert.match(java,/active && foreground/); assert.match(java,/handleOnPause\(\).*foreground = false/);
  assert.match(java,/handleOnDestroy\(\).*active = false/); assert.doesNotMatch(java,/conversations|createConversation/);
});
test('camera can start disabled and unavailable preview remains hidden', async () => {
  const app=await read('app/frontend/app.js'), self=await read('app/frontend/self-view.mjs');
  assert.match(app,/startVideoOff: isAndroid\(\)/); assert.match(self,/startVideoOff: true/);
  assert.match(self,/panel.hidden = !visible/); assert.match(self,/fallbackFailed = true/);
});
test('PDF sharing uses narrow private cache and explicit chooser', async () => {
  const xml=await read('android/app/src/main/res/xml/file_paths.xml');
  assert.doesNotMatch(xml,/external-path|path="\."/); assert.match(xml,/path="reports\/"/);
  const java=await read('android/app/src/main/java/com/extremestudios/mynaia/MyNaiaPlugin.java');
  assert.match(java,/getCacheDir/); assert.match(java,/Intent.createChooser/); assert.match(java,/%PDF-/);
});
test('packager copies only frontend, supports packaged routes and injects native runtime', async () => {
  const script=await read('scripts/build-android-web.mjs');
  assert.match(script,/cp\('public', out/); assert.doesNotMatch(script,/cp\(['"](?:\.env|app\/backend)/);
  assert.match(script,/dr-paws\/dashboard/); assert.match(script,/native-runtime.js/);
});
test('production signing is optional, private files ignored, version and SDK are declared', async () => {
  const gradle=await read('android/app/build.gradle'), ignore=await read('.gitignore');
  assert.match(gradle,/versionName "1.0.0"/); assert.match(gradle,/if \(signingAvailable\)/);
  assert.match(ignore,/\*\.jks/); assert.match(ignore,/keystore.properties/);
  assert.match(await read('android/variables.gradle'),/minSdkVersion = 24[\s\S]*compileSdkVersion = 36[\s\S]*targetSdkVersion = 36/);
});
