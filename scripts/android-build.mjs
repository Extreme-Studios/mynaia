import { existsSync } from 'node:fs';
import { cp, mkdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
const mode = process.argv[2] || 'debug';
if (!['debug','release'].includes(mode)) throw new Error('Use debug or release');
const env = { ...process.env };
const java = [env.JAVA_HOME, join(env.USERPROFILE || '', '.jdks','ms-21.0.11')].find((path) => {
  if (!path || !existsSync(join(path,'bin','java.exe'))) return false;
  const result = spawnSync(join(path,'bin','java.exe'),['-version'],{encoding:'utf8'});
  return /version "21\./.test(result.stderr || '');
});
if (!java) throw new Error('JDK 21 required; set JAVA_HOME');
env.JAVA_HOME = java;
// A missing Unix socket directory forces Java's TCP loopback fallback on Windows.
env.JAVA_TOOL_OPTIONS = `${env.JAVA_TOOL_OPTIONS || ''} -Djdk.net.unixdomain.tmpdir=C:/mynaia-no-unix-sockets -Djavax.net.ssl.trustStoreType=Windows-ROOT -Djavax.net.ssl.trustStore=NONE`.trim();
env.ANDROID_HOME ||= join(env.LOCALAPPDATA || '', 'Android','Sdk');
if (!existsSync(join(env.ANDROID_HOME,'platforms','android-36'))) throw new Error('Android SDK platform 36 missing');
for (const args of [['run','android:sync']]) {
  const result = spawnSync('npm.cmd',args,{env,stdio:'inherit',shell:true});
  if (result.status !== 0) process.exit(result.status || 1);
}
const tasks = mode === 'release' ? ['assembleRelease','bundleRelease'] : ['assembleDebug'];
const result = spawnSync(join(java,'bin','java.exe'),['-jar','gradle/wrapper/gradle-wrapper.jar','--no-daemon',...tasks],{cwd:'android',env,stdio:'inherit'});
if (result.status !== 0) process.exit(result.status || 1);
await mkdir('release/android',{recursive:true});
if (mode === 'debug') await cp('android/app/build/outputs/apk/debug/app-debug.apk','release/android/MyNaiA-debug.apk');
else {
  const signed = existsSync('android/app/build/outputs/apk/release/app-release.apk');
  await cp(`android/app/build/outputs/apk/release/app-release${signed ? '' : '-unsigned'}.apk`, `release/android/MyNaiA-release${signed ? '' : '-unsigned'}.apk`);
  await cp('android/app/build/outputs/bundle/release/app-release.aab','release/android/MyNaiA-release.aab');
  console.log(signed ? 'Production signing configured; verify certificate before distribution.' : 'Release APK/AAB generated WITHOUT production signing.');
}
