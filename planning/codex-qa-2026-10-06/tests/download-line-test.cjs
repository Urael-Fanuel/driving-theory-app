// Logic test for the app-wide download line in services/audioCache.ts (CODEX QA Q07). Loads the REAL
// file with a fake file system / network where every download is held until the test releases it.
// NOT an Android test. Every expectation is an assertion; any failure exits with code 1.
const fs = require('fs'), vm = require('vm'), path = require('path'), assert = require('assert');
const root = path.resolve(__dirname, '../../..');
const ts = require(root + '/node_modules/typescript');
const tick  = () => new Promise(r => setImmediate(r));
const flush = async () => { for (let i = 0; i < 30; i++) await tick(); };
const sleep = ms => new Promise(r => setTimeout(r, ms));

function world(statusFor = () => 200) {
  const files = new Map(), log = [], waiting = [];   // waiting: { url, release(status, headers) }
  let active = 0, maxActive = 0;
  const FS = {
    documentDirectory: 'file:///qa/',
    getInfoAsync: async p => ({ exists: files.has(p), size: files.get(p) ?? 0 }),
    makeDirectoryAsync: async () => {}, readDirectoryAsync: async () => [], readAsStringAsync: async () => '{}',
    writeAsStringAsync: async () => {}, deleteAsync: async p => { files.delete(p); },
    moveAsync: async ({ from, to }) => { files.set(to, files.get(from)); files.delete(from); },
    createDownloadResumable: (url, tmp) => ({
      cancelAsync: async () => {},
      downloadAsync: () => new Promise(resolve => {
        active++; maxActive = Math.max(maxActive, active); log.push(url);
        waiting.push({ url, release: (status = statusFor(url), headers = {}) => {
          active--; if (status === 200) files.set(tmp, 5000);
          resolve({ status, headers: { 'content-length': status === 200 ? '5000' : '0', ...headers } });
        } });
      }),
    }),
  };
  const reports = [];
  const deps = p => p.includes('file-system') ? FS : p.includes('bundledAudio') ? { BUNDLED_AUDIO_NAMES: new Set() }
    : p.includes('errorReporter') ? { reportError: (c, w, m, d) => reports.push(m), errorText: String } : {};
  const ctx = { exports: {}, console: { warn() {}, error() {}, log() {} }, process: { env: { EXPO_PUBLIC_SUPABASE_URL: 'https://qa.invalid' } },
    // unref: a long pause (Retry-After 120) must not keep this test process alive
    setTimeout: (fn, ms) => { const t = setTimeout(fn, ms); if (t.unref) t.unref(); return t; }, clearTimeout, Date, Math, require: deps };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(root + '/services/audioCache.ts', 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, ctx);
  const releaseAll = async (status) => { while (waiting.length) { waiting.shift().release(status); await flush(); } };
  return { api: ctx.exports, log, waiting, reports, releaseAll, get active() { return active; }, get maxActive() { return maxActive; } };
}
const urls = (p, n) => Array.from({ length: n }, (_, i) => `https://qa.invalid/storage/v1/object/public/audio/${p}${i}.mp3`);

const results = [];
async function scenario(name, fn) {
  try { await fn(); results.push(['OK  ', name]); }
  catch (e) { results.push(['FAIL', name + '  ->  ' + e.message.split('\n')[0]]); }
}

(async () => {
  await scenario('1 Q07 two batches started together never run more than 3 downloads at once', async () => {
    const w = world();
    const a = w.api.preCacheAudioBatch(urls('a', 5)), b = w.api.preCacheAudioBatch(urls('b', 5));
    await flush();
    assert.strictEqual(w.active, 3, 'active now: ' + w.active);
    await w.releaseAll(200); await a; await b;
    assert.strictEqual(w.maxActive, 3, 'max at once: ' + w.maxActive);
    assert.strictEqual(w.log.length, 10, 'downloads done: ' + w.log.length);
  });

  await scenario('2 what the user is looking at now goes before the rest of the topic', async () => {
    const w = world();
    const topic = w.api.prefetchTopicAudio([{ id: 's1', audio_explanation_url: urls('topic', 1)[0] }],
      [{ sign_id: 's1', id: 'x', answers: urls('t', 6).map((u, i) => ({ id: 'A' + i, audio_url: u })) }]);
    await flush();
    const sign = w.api.preCacheAudioBatch(urls('now', 2));   // default priority: now
    await flush();
    w.waiting.shift().release(200); await flush();           // one slot frees up
    assert.ok(w.log[3].includes('/now0'), 'next started: ' + w.log[3]);
    await w.releaseAll(200); await topic; await sign;
  });

  await scenario('3 Q07 HTTP 429: every download pauses for Retry-After, then the file is tried once more', async () => {
    const w = world();
    const one = w.api.preCacheAudioBatch(urls('r', 1));
    await flush();
    w.waiting.shift().release(429, { 'retry-after': '1' }); await flush();
    const other = w.api.preCacheAudioBatch(urls('o', 1));
    await flush();
    assert.strictEqual(w.active, 0, 'a download started during the pause');
    await sleep(1200); await flush();
    assert.strictEqual(w.active, 2, 'after the pause: ' + w.active);
    await w.releaseAll(200); await one; await other;
    assert.strictEqual(w.log.filter(u => u.includes('/r0')).length, 2, 'the 429 file was not retried exactly once');
    assert.ok(w.reports.some(m => /429/.test(m)), 'the pause was not reported');
  });

  await scenario('4 a second 429 for the same file is a failure, not an endless loop', async () => {
    const w = world();
    const one = w.api.preCacheAudioBatch(urls('z', 1));
    await flush(); w.waiting.shift().release(429, { 'retry-after': '0' }); await flush(); await sleep(50); await flush();
    w.waiting.shift().release(429, { 'retry-after': '0' }); await flush();
    await one;
    assert.strictEqual(w.log.length, 2, 'attempts: ' + w.log.length);
    assert.ok(w.reports.includes('HTTP 429'), 'final failure not reported: ' + JSON.stringify(w.reports));
  });

  await scenario('5 R4 a download already waiting in line does NOT start when another gets HTTP 429', async () => {
    const w = world();
    for (let i = 0; i < 4; i++) w.api.preCacheAudioBatch(urls('q' + i + '_', 1));
    await flush();
    assert.strictEqual(w.log.length, 3, 'started: ' + w.log.length);
    w.waiting.shift().release(429, { 'retry-after': '120' }); await flush();
    assert.strictEqual(w.log.length, 3, 'the 4th started during the pause: ' + w.log.length);
  });

  await scenario('6 R4 a second 429 renews the pause (nothing new starts at once)', async () => {
    const w = world();
    w.api.preCacheAudioBatch(urls('s', 1)); await flush();
    w.waiting.shift().release(429, { 'retry-after': '1' }); await flush();
    await sleep(1200); await flush();                    // pause over: the same file is tried again
    assert.strictEqual(w.log.length, 2, 'retry not started: ' + w.log.length);
    w.waiting.shift().release(429, { 'retry-after': '120' }); await flush();
    w.api.preCacheAudioBatch(urls('later', 1)); await flush();
    assert.strictEqual(w.log.length, 2, 'started although the second 429 should pause: ' + w.log.length);
  });

  for (const [mark, name] of results) console.log(mark, name);
  const failed = results.filter(r => r[0] === 'FAIL').length;
  console.log(failed ? `\n${failed} FAILED` : '\nALL PASSED');
  process.exitCode = failed ? 1 : 0;
})().catch(e => { console.error(e); process.exitCode = 1; });
