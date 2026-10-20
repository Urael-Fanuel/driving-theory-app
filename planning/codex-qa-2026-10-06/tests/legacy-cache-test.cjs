// Logic test for copies saved by older app versions (CODEX QA Q08, R3, R5), services/audioCache.ts.
// Simulates a phone upgraded from an older version: cached files and an index WITHOUT the "verified"
// mark. Loads the REAL file with a fake file system (Android semantics: a move REPLACES an existing
// file in one step, like File.renameTo), network and HEAD responses.
// NOT an Android test. Every expectation is an assertion; any failure exits with code 1.
const fs = require('fs'), vm = require('vm'), path = require('path'), assert = require('assert');
const root = path.resolve(__dirname, '../../..');
const ts = require(root + '/node_modules/typescript');
const tick  = () => new Promise(r => setImmediate(r));
const flush = async () => { for (let i = 0; i < 40; i++) await tick(); };

const DOC = 'file:///qa/', DIR = DOC + 'audio/', INDEX = DOC + 'audio_cache_index.json';
const URL = name => 'https://qa.invalid/storage/v1/object/public/audio/' + name;

function world({ online = true, legacy = {}, head = () => ({ status: 200, length: 5000 }), serverSize = 5000, failMove = false } = {}) {
  const files = new Map();   // path -> size
  let indexText = null;
  for (const [name, size] of Object.entries(legacy)) files.set(DIR + name, size);
  if (Object.keys(legacy).length) {
    const plain = {}; for (const [name, size] of Object.entries(legacy)) plain[name] = { bytes: size, lastAccess: 1 };   // no "verified"
    indexText = JSON.stringify(plain);
  }
  const heads = [], downloads = [];
  const FS = {
    documentDirectory: DOC,
    getInfoAsync: async p => p === INDEX ? { exists: indexText !== null } : (p === DIR ? { exists: true } : { exists: files.has(p), size: files.get(p) }),
    makeDirectoryAsync: async () => {},
    readDirectoryAsync: async () => [...files.keys()].filter(p => p.startsWith(DIR)).map(p => p.slice(DIR.length)),
    readAsStringAsync: async p => p === INDEX ? indexText : '{}',
    writeAsStringAsync: async (p, s) => { if (p === INDEX) indexText = s; },
    deleteAsync: async p => { files.delete(p); },
    // Android: File.renameTo replaces an existing destination in one step.
    moveAsync: async ({ from, to }) => { if (failMove) throw new Error('simulated move failure'); files.set(to, files.get(from)); files.delete(from); },
    createDownloadResumable: (url, tmp) => ({ cancelAsync: async () => {},
      downloadAsync: async () => { downloads.push(url); files.set(tmp, serverSize); return { status: 200, headers: { 'content-length': String(serverSize) } }; } }),
  };
  const fetchMock = async (url, init) => {
    assert.strictEqual(init.method, 'HEAD', 'only HEAD requests expected');
    heads.push(url);
    const h = head(url);
    if (h instanceof Error) throw h;
    return { status: h.status, headers: { get: n => n.toLowerCase() === 'content-length' ? String(h.length) : null } };
  };
  const deps = p => p.includes('file-system') ? FS : p.includes('bundledAudio') ? { BUNDLED_AUDIO_NAMES: new Set() }
    : p.includes('errorReporter') ? { reportError() {}, errorText: String }
    : p.includes('useNetworkStatus') ? { getIsConnected: () => online } : {};
  const ctx = { exports: {}, console: { warn() {}, error() {}, log() {} }, process: { env: { EXPO_PUBLIC_SUPABASE_URL: 'https://qa.invalid' } },
    setTimeout, clearTimeout, Date, Math, AbortController, fetch: fetchMock, require: deps };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(root + '/services/audioCache.ts', 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, ctx);
  return { api: ctx.exports, files, heads, downloads, index: () => JSON.parse(indexText || '{}') };
}
const parts = w => [...w.files.keys()].filter(k => k.endsWith('.part'));

const results = [];
async function scenario(name, fn) {
  try { await fn(); results.push(['OK  ', name]); }
  catch (e) { results.push(['FAIL', name + '  ->  ' + e.message.split('\n')[0]]); }
}

(async () => {
  await scenario('1 Q08 an old copy cut short: played from the phone, checked, replaced, verified', async () => {
    const w = world({ legacy: { 'a.mp3': 3000 } });
    await w.api.preCacheAudioBatch([]);                       // loads the index, as at startup
    assert.strictEqual(await w.api.getLocalAudioUri(URL('a.mp3')), DIR + 'a.mp3', 'the copy on the phone was skipped');
    await flush(); await new Promise(r => setTimeout(r, 2200)); await flush();   // index flush is debounced 2 s
    assert.strictEqual(w.files.get(DIR + 'a.mp3'), 5000, 'copy not replaced: ' + w.files.get(DIR + 'a.mp3'));
    assert.strictEqual(w.index()['a.mp3'].verified, true, 'not marked verified');
    assert.strictEqual(await w.api.getLocalAudioUri(URL('a.mp3')), DIR + 'a.mp3');
    assert.strictEqual(w.heads.length, 1, 'checked more than once: ' + w.heads.length);
  });

  await scenario('2 an old copy that matches the server: only a HEAD, marked verified, never downloaded', async () => {
    const w = world({ legacy: { 'b.mp3': 5000 } });
    await w.api.preCacheAudioBatch([]);
    assert.strictEqual(await w.api.getLocalAudioUri(URL('b.mp3')), DIR + 'b.mp3');
    await flush();
    assert.strictEqual(w.heads.length, 1); assert.strictEqual(w.downloads.length, 0, 'downloaded although it was fine');
    await w.api.getLocalAudioUri(URL('b.mp3')); await flush();
    assert.strictEqual(w.heads.length, 1, 'checked again');
  });

  await scenario('3 offline: the old copy is used, nothing is checked', async () => {
    const w = world({ online: false, legacy: { 'c.mp3': 3000 } });
    await w.api.preCacheAudioBatch([]);
    assert.strictEqual(await w.api.getLocalAudioUri(URL('c.mp3')), DIR + 'c.mp3');
    await flush();
    assert.strictEqual(w.heads.length, 0);
  });

  await scenario('4 a copy downloaded by THIS version is trusted at once (no HEAD)', async () => {
    const w = world();
    await w.api.preCacheAudioBatch([URL('d.mp3')]);
    assert.strictEqual(await w.api.getLocalAudioUri(URL('d.mp3')), DIR + 'd.mp3');
    await flush();
    assert.strictEqual(w.heads.length, 0);
  });

  await scenario('5 R5 network on, server unreachable: the copy on the phone is STILL played, every time', async () => {
    const w = world({ legacy: { 'e.mp3': 3000 }, head: () => new Error('storage unreachable') });
    await w.api.preCacheAudioBatch([]);
    assert.strictEqual(await w.api.getLocalAudioUri(URL('e.mp3')), DIR + 'e.mp3', 'first play skipped the copy');
    await flush();
    assert.strictEqual(await w.api.getLocalAudioUri(URL('e.mp3')), DIR + 'e.mp3', 'second play skipped the copy');
    await flush();
    assert.strictEqual(w.files.get(DIR + 'e.mp3'), 3000, 'copy deleted');
    assert.strictEqual(w.heads.length, 2, 'not checked again on the next play');
  });

  await scenario('6 file no longer on the server (404): the copy is kept as it is', async () => {
    const w = world({ legacy: { 'f.mp3': 3000 }, head: () => ({ status: 404, length: 0 }) });
    await w.api.preCacheAudioBatch([]);
    await w.api.getLocalAudioUri(URL('f.mp3')); await flush();
    assert.strictEqual(w.files.get(DIR + 'f.mp3'), 3000);
    assert.strictEqual(w.downloads.length, 0);
  });

  await scenario('7 R3 the replacement downloads fine but the move fails: the old copy is still there', async () => {
    const w = world({ legacy: { 'g.mp3': 3000 }, failMove: true });
    await w.api.preCacheAudioBatch([]);
    await w.api.getLocalAudioUri(URL('g.mp3')); await flush();
    assert.strictEqual(w.downloads.length, 1, 'replacement not attempted');
    assert.strictEqual(w.files.get(DIR + 'g.mp3'), 3000, 'the only copy was lost');
    assert.deepStrictEqual(parts(w), [], 'temporary file left behind');
  });

  for (const [mark, name] of results) console.log(mark, name);
  const failed = results.filter(r => r[0] === 'FAIL').length;
  console.log(failed ? `\n${failed} FAILED` : '\nALL PASSED');
  process.exitCode = failed ? 1 : 0;
})().catch(e => { console.error(e); process.exitCode = 1; });
