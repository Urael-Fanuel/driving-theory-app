// Logic test for hooks/useAudio.ts cancellation (CODEX QA Q02 + Q03). Loads the REAL file with a fake
// player that behaves like the expo-audio wrapper: once a sound is unloaded it never reports again.
// NOT an Android test. Every expectation is an assertion; any failure exits with code 1.
const fs = require('fs'), vm = require('vm'), path = require('path'), assert = require('assert');
const root = path.resolve(__dirname, '../../..');
const ts = require(root + '/node_modules/typescript');
const tick  = () => new Promise(r => setImmediate(r));
const flush = async () => { for (let i = 0; i < 15; i++) await tick(); };
const deferred = () => { let resolve; const promise = new Promise(r => resolve = r); return { promise, resolve }; };
const ST = (x = {}) => ({ isLoaded: true, shouldPlay: true, isPlaying: true, isBuffering: false, didJustFinish: false,
  positionMillis: 10, durationMillis: 3000, interrupted: false, ...x });

function world(opts = {}) {
  const created = [], timers = new Map(), discarded = []; let nextTimer = 1;
  const discardGate = opts.slowDiscard ? deferred() : null;
  class Sound {
    constructor(uri, cb) { this.uri = uri; this.cb = cb; this.unloaded = false; this.playing = false; }
    static async createAsync({ uri }, init = {}, cb) {
      await tick();
      if (opts.loadFails && opts.loadFails(uri)) throw new Error('could not load ' + uri);
      const s = new Sound(uri, cb); created.push(s);
      if (init.shouldPlay) {
        s.playing = true;
        setImmediate(() => s.emit(ST()));
        if (opts.errorsAfterLoad && opts.errorsAfterLoad(uri)) setImmediate(() => setImmediate(() => s.emit({ isLoaded: false, error: 'decode failed' })));
      }
      return { sound: s };
    }
    emit(st) { if (!this.unloaded) this.cb?.(st); }
    async playAsync()   { if (this.unloaded) throw new Error('unloaded'); this.playing = true; }
    async pauseAsync()  { this.playing = false; this.emit(ST({ isPlaying: false, shouldPlay: false })); }
    async stopAsync()   { if (this.unloaded) throw new Error('unloaded'); await tick(); this.playing = false; }
    async unloadAsync() { this.unloaded = true; this.playing = false; this.cb = null; }   // like expo-audio: silent from here
    setOnPlaybackStatusUpdate(cb) { this.cb = cb; }
  }
  const react = { useState: x => [x, () => {}], useRef: x => ({ current: x }), useCallback: f => f, useEffect: () => {} };
  const deps = p =>
    p === 'react'                 ? react :
    p.endsWith('/sound')          ? { Sound, applyAudioMode: async () => {} } :
    p.endsWith('/supabaseClient') ? { getStorageUrl: (b, f) => 'https://cdn/' + f, BUCKETS: { AUDIO: 'audio' } } :
    p.endsWith('/audioCache')     ? {
      getLocalAudioUri: async u => (opts.saved && opts.saved(u)) ? 'file:///cache/' + u : u,
      discardCachedCopy: async u => { discarded.push(u); if (discardGate) await discardGate.promise; },
    } :
    p.endsWith('/errorReporter')  ? { reportError() {}, watchPlaybackStart() {}, describeUri: () => ({}) } : {};
  const ctx = {
    exports: {}, console: { warn() {}, error() {}, log() {} }, process: { env: {} },
    setTimeout: (fn, ms) => { const id = nextTimer++; timers.set(id, { fn, ms }); return id; },
    clearTimeout: id => timers.delete(id),
    require: deps,
  };
  const js = ts.transpileModule(fs.readFileSync(root + '/hooks/useAudio.ts', 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  vm.runInNewContext(js, ctx);
  const audible = () => created.filter(s => s.playing && !s.unloaded).map(s => s.uri);
  return { api: ctx.exports, hook: ctx.exports.useAudio(), created, timers, discarded, discardGate, audible };
}

const results = [];
async function scenario(name, fn) {
  try { await fn(); results.push(['OK  ', name]); }
  catch (e) { results.push(['FAIL', name + '  ->  ' + e.message.split('\n')[0]]); }
}

(async () => {
  await scenario('1 Q02 paused clip, then stop: the waiting sequence is let go at once', async () => {
    const w = world(); let result = 'pending';
    w.api.playAndAwaitAudio('A', () => false).then(r => result = r);
    await flush();
    await w.hook.pauseAudio(); await flush();
    await w.hook.stopAudio(); await flush();
    assert.strictEqual(result, true, 'waiter result: ' + result);
    assert.strictEqual(w.timers.size, 0, 'timers left running: ' + w.timers.size);
  });

  await scenario('2 Q02 playing clip, then stop: let go at once, not 2.5 minutes later', async () => {
    const w = world(); let result = 'pending';
    w.api.playAndAwaitAudio('A', () => false).then(r => result = r);
    await flush();
    await w.hook.stopAudio(); await flush();
    assert.strictEqual(result, true, 'waiter result: ' + result);
    assert.deepStrictEqual(w.audible(), []);
    assert.strictEqual(w.timers.size, 0, 'timers left running: ' + w.timers.size);
  });

  await scenario('3 Q02 a new clip replaces a waited one: old waiter let go, only the new one heard', async () => {
    const w = world(); let first = 'pending';
    w.api.playAndAwaitAudio('A', () => false).then(r => first = r);
    await flush();
    w.api.playAndAwaitAudio('B', () => false);
    await flush();
    assert.strictEqual(first, true, 'first waiter: ' + first);
    assert.deepStrictEqual(w.audible(), ['B']);
  });

  await scenario('4 Q03 playAudio: broken saved copy, newer request during discard -> no stale player', async () => {
    const w = world({ saved: u => u.endsWith('/x'), loadFails: u => u.startsWith('file:'), slowDiscard: true });
    const old = w.hook.playAudio('https://cdn/x');
    await flush();
    await w.hook.playAudio('https://cdn/B');
    w.discardGate.resolve(); await old; await flush();
    assert.deepStrictEqual(w.created.map(s => s.uri), ['https://cdn/B'], 'players created: ' + JSON.stringify(w.created.map(s => s.uri)));
  });

  await scenario('5 Q03 playAndAwaitAudio: same race -> no stale player, waiter let go', async () => {
    const w = world({ saved: u => u.endsWith('/x'), loadFails: u => u.startsWith('file:'), slowDiscard: true });
    let result = 'pending';
    w.api.playAndAwaitAudio('https://cdn/x', () => false).then(r => result = r);
    await flush();
    await w.hook.playAudio('https://cdn/B');
    w.discardGate.resolve(); await flush();
    assert.deepStrictEqual(w.created.map(s => s.uri), ['https://cdn/B'], 'players created: ' + JSON.stringify(w.created.map(s => s.uri)));
    assert.notStrictEqual(result, 'pending', 'waiter still pending');
  });

  await scenario('6 Q03 a saved copy that fails while playing is released before the original is tried', async () => {
    const w = world({ saved: u => u.endsWith('/y'), errorsAfterLoad: u => u.startsWith('file:') });
    let result = 'pending';
    w.api.playAndAwaitAudio('https://cdn/y', () => false).then(r => result = r);
    await flush();
    const savedSound = w.created.find(s => s.uri.startsWith('file:'));
    assert.ok(savedSound, 'saved copy was never tried');
    assert.ok(savedSound.unloaded, 'failed saved-copy player was left loaded');
    assert.deepStrictEqual(w.audible(), ['https://cdn/y'], 'audible: ' + JSON.stringify(w.audible()));
    assert.deepStrictEqual(w.discarded, ['https://cdn/y']);
  });

  await scenario('7 normal end still resolves true and leaves no timer', async () => {
    const w = world(); let result = 'pending';
    w.api.playAndAwaitAudio('A', () => false).then(r => result = r);
    await flush();
    w.created[0].emit(ST({ didJustFinish: true, isPlaying: false })); await flush();
    assert.strictEqual(result, true);
    assert.strictEqual(w.timers.size, 0);
  });

  await scenario('8 the caller\'s own cancel flag still works without any stop', async () => {
    const w = world(); let cancelled = false, result = 'pending';
    w.api.playAndAwaitAudio('A', () => cancelled).then(r => result = r);
    await flush();
    cancelled = true;
    w.created[0].emit(ST({ positionMillis: 500 })); await flush();
    assert.strictEqual(result, true);
  });

  await scenario('9 three quick requests: one voice, and every earlier waiter let go', async () => {
    const w = world(); const r = ['pending', 'pending'];
    w.api.playAndAwaitAudio('A', () => false).then(v => r[0] = v);
    w.api.playAndAwaitAudio('B', () => false).then(v => r[1] = v);
    w.hook.playAudio('C');
    await flush();
    assert.deepStrictEqual(w.audible(), ['C'], 'audible: ' + JSON.stringify(w.audible()));
    assert.deepStrictEqual(r, [true, true], 'waiters: ' + JSON.stringify(r));
  });

  await scenario('10 R2 a stream stuck part-way (buffering at 1 s of 120 s) is NOT counted as heard', async () => {
    const w = world(); let result = 'pending';
    w.api.playAndAwaitAudio('A', () => false).then(r => result = r);
    await flush();
    w.created[0].emit(ST({ positionMillis: 1_000, durationMillis: 120_000 }));
    w.created[0].emit(ST({ isPlaying: false, isBuffering: true, positionMillis: 1_000, durationMillis: 120_000 }));
    await flush();
    for (const [id, t] of [...w.timers]) { w.timers.delete(id); t.fn(); }
    await flush();
    assert.strictEqual(result, false, 'result: ' + result);
  });

  await scenario('11 R2 playing near its end when the finish callback is lost: counted as heard', async () => {
    const w = world(); let result = 'pending';
    w.api.playAndAwaitAudio('A', () => false).then(r => result = r);
    await flush();
    w.created[0].emit(ST({ positionMillis: 119_500, durationMillis: 120_000 }));
    w.created[0].emit(ST({ isPlaying: false, isBuffering: true, positionMillis: 119_800, durationMillis: 120_000 }));
    await flush();
    for (const [id, t] of [...w.timers]) { w.timers.delete(id); t.fn(); }
    await flush();
    assert.strictEqual(result, true, 'result: ' + result);
  });

  for (const [mark, name] of results) console.log(mark, name);
  const failed = results.filter(r => r[0] === 'FAIL').length;
  console.log(failed ? `\n${failed} FAILED` : '\nALL PASSED');
  process.exitCode = failed ? 1 : 0;
})().catch(e => { console.error(e); process.exitCode = 1; });
