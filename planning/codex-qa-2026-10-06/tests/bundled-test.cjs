// Logic tests for the bundled system audio (services/bundledAudio.ts, services/sound.ts,
// services/audioCache.ts). Real files; fake player, file system and network. NOT an Android test.
const fs = require('fs'), vm = require('vm');
const root = 'C:/Users/Yakov/Desktop/driving-theory-app';
const ts = require(root + '/node_modules/typescript');
const tr = p => ts.transpileModule(fs.readFileSync(root + '/' + p, 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const settle = async () => { for (let i = 0; i < 40; i++) await Promise.resolve(); await new Promise(r => setImmediate(r)); };
const ok = c => c ? 'OK' : 'FAIL';

// Fake "require" of an mp3: a module number per file, like Metro does.
const assetIds = new Map(); let nextId = 1000;
const mp3Require = p => { const name = p.split('/').pop(); if (!fs.existsSync(root + '/assets/system-audio/' + name)) throw new Error('missing asset ' + name); if (!assetIds.has(name)) assetIds.set(name, nextId++); return assetIds.get(name); };

function loadModule(p, mods, extra = {}) {
  const ctx = { exports: {}, console: { warn() {}, log() {}, error() {} }, process: { env: {} }, setTimeout, clearTimeout, ...extra,
    require: n => n.endsWith('.mp3') ? mp3Require(n) : (n in mods ? mods[n] : (() => { throw new Error('unexpected require ' + n); })()) };
  vm.createContext(ctx); vm.runInContext(tr(p), ctx); return ctx.exports;
}

(async () => {
  const bundled = loadModule('services/bundledAudio.ts', {});
  const forms = {
    cdn:      'https://abc.supabase.co/storage/v1/object/public/audio/number_1.mp3',
    asset:    'assets/audio/try_again.mp3',
    cache:    'file:///data/user/0/app/files/audio/offline_notice.mp3',
    query:    'https://abc.supabase.co/storage/v1/object/public/audio/number_4.mp3?v=2',
    sign:     'https://abc.supabase.co/storage/v1/object/public/audio/814_explanation.mp3',
    cheer:    'https://abc.supabase.co/storage/v1/object/public/audio/crowd_cheer.mp3',
    data:     'data:audio/mp3;base64,AAAA',
  };
  const r = Object.fromEntries(Object.entries(forms).map(([k, v]) => [k, bundled.bundledAudioFor(v)]));
  console.log('1 lookup: server URL / asset path / cached file / with ?query all found',
    ok(typeof r.cdn === 'number' && typeof r.asset === 'number' && typeof r.cache === 'number' && typeof r.query === 'number'),
    '| sign audio, celebration sound, data: not bundled', ok(r.sign === null && r.cheer === null && r.data === null));
  const names = [...bundled.BUNDLED_AUDIO_NAMES];
  const onDisk = fs.readdirSync(root + '/assets/system-audio');
  console.log('2 every listed file exists in assets/system-audio and nothing extra:', names.length, 'listed /', onDisk.length, 'on disk',
    ok(names.length === 16 && names.every(n => onDisk.includes(n)) && onDisk.every(n => names.includes(n))));

  // 3. sound.ts hands the bundled module to the player, other URIs untouched
  const created = [];
  const expoAudio = { setAudioModeAsync: async () => {}, createAudioPlayer: (src) => { created.push(src); return {
    addListener: (_e, fn) => { setTimeout(() => fn({ isLoaded: true, playbackState: 'ready', playing: true, currentTime: 0, duration: 1 }), 0); return { remove() {} }; },
    play() {}, pause() {}, remove() {}, release() {}, currentStatus: null } } };
  const sound = loadModule('services/sound.ts', { 'react-native': { Platform: { OS: 'android' } }, 'expo-audio': expoAudio, './bundledAudio': bundled });
  await sound.Sound.createAsync({ uri: forms.cdn }, { shouldPlay: true });
  await sound.Sound.createAsync({ uri: forms.sign }, { shouldPlay: true });
  await sound.Sound.createAsync({ uri: 'file:///x/tts_abc.mp3' }, { shouldPlay: true });
  console.log('3 player got: number_1 ->', typeof created[0], ok(typeof created[0] === 'number'),
    '| sign audio ->', typeof created[1], ok(created[1] === forms.sign), '| TTS file ->', ok(created[2] === 'file:///x/tts_abc.mp3'));

  // 4. audioCache: no download / no copy for bundled clips; old copies removed; celebration still cached
  const files = new Map(); const downloads = [];
  const FS = {
    documentDirectory: 'file:///docs/',
    getInfoAsync: async p => files.has(p) ? { exists: true, size: files.get(p) } : { exists: false },
    makeDirectoryAsync: async () => {}, readDirectoryAsync: async () => [...files.keys()].map(k => k.split('/').pop()),
    readAsStringAsync: async () => '{}', writeAsStringAsync: async () => {},
    deleteAsync: async p => { files.delete(p); }, moveAsync: async ({ from, to }) => { files.set(to, files.get(from)); files.delete(from); },
    createDownloadResumable: (url, p) => ({ downloadAsync: async () => { downloads.push(url.split('/').pop()); files.set(p, 50_000); return { status: 200, headers: { 'Content-Length': '50000' } }; }, cancelAsync: async () => {} }),
  };
  files.set('file:///docs/audio/number_2.mp3', 8_000);          // cached by an older version
  files.set('file:///docs/audio/try_again.mp3', 57_000);
  const cache = loadModule('services/audioCache.ts', {
    'expo-file-system/legacy': FS, './errorReporter': { reportError() {}, errorText: e => String(e) }, './bundledAudio': bundled,
    '../hooks/useNetworkStatus': { getIsConnected: () => true },   // audioCache checks connectivity (CODEX QA Q08)
  });
  const got = await cache.getLocalAudioUri(forms.cdn); await settle();
  const noDl1 = downloads.length === 0;
  await cache.preCacheSystemAudio('https://abc.supabase.co/storage/v1/object/public'); await settle();
  console.log('4 playing a bundled clip downloads nothing', ok(got === forms.cdn && noDl1),
    '| startup: copies left by the old version removed', ok(!files.has('file:///docs/audio/number_2.mp3') && !files.has('file:///docs/audio/try_again.mp3')),
    '| only the celebration sound is still downloaded:', JSON.stringify(downloads), ok(downloads.length === 1 && downloads[0] === 'crowd_cheer.mp3'));
  await cache.preCacheAudioBatch([forms.cdn, forms.sign]); await settle();
  console.log('5 a prefetch list that contains a bundled clip skips it:', JSON.stringify(downloads.slice(1)), ok(downloads.slice(1).join() === '814_explanation.mp3'));
})().catch(e => { console.log('TEST ERROR', e); process.exitCode = 1; });
