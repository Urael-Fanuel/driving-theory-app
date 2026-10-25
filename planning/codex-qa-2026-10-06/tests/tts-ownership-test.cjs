// Logic test for utils/googleTTS.ts ownership (CODEX QA Q01). Loads the REAL file with a fake
// player, network and timers. NOT an Android test. Every expectation is an assertion: any failure
// exits with code 1. Run from anywhere:  node tts-ownership-test.cjs
const fs = require('fs'), vm = require('vm'), path = require('path'), assert = require('assert');
const root = path.resolve(__dirname, '../../..');
const ts = require(root + '/node_modules/typescript');
const tick  = () => new Promise(r => setImmediate(r));
const flush = async () => { for (let i = 0; i < 12; i++) await tick(); };

function world(opts = {}) {
  const created = [], timers = new Map(); let nextTimer = 1;
  const speaking = [];
  class Sound {
    constructor(uri) { this.uri = uri; this.unloaded = false; this.playing = false; this.cb = null; }
    static async createAsync({ uri }) { await tick(); if (opts.hold && opts.hold[uri]) await opts.hold[uri]; const s = new Sound(uri); created.push(s); return { sound: s }; }
    async playAsync()   { if (this.unloaded) throw new Error('Sound is unloaded'); this.playing = true; }
    async stopAsync()   { await tick(); this.playing = false; }          // native stop takes a moment
    async pauseAsync()  { this.playing = false; }
    async unloadAsync() { this.unloaded = true; this.playing = false; this.cb = null; }
    setOnPlaybackStatusUpdate(cb) { this.cb = cb; }
    end() { this.cb?.({ isLoaded: true, didJustFinish: true, isPlaying: false }); }
  }
  const deps = p =>
    p.endsWith('/sound')          ? { Sound, applyAudioMode: async () => {} } :
    p.endsWith('/supabaseClient') ? { supabase: { functions: { invoke: async () => ({ data: { audioContent: 'QUFB' }, error: null }) } } } :
    p.endsWith('/audioCache')     ? { getCachedTtsUri: async t => (opts.missing && opts.missing.includes(t)) ? null : 'file:///tts/' + t + '.mp3', storeTtsAudio: async () => {}, releaseAudioFiles: async () => {}, fetchRecordedTts: async () => null, skipRecordedTts: async () => {}, isRecordedTtsUri: () => false } :
    p.endsWith('/errorReporter')  ? { reportError() {}, describeUri: () => ({}), httpStatusOf: () => null } : {};
  const ctx = {
    exports: {}, console: { warn() {}, error() {}, log() {} }, process: { env: {} },
    setTimeout: (fn, ms) => { const id = nextTimer++; timers.set(id, { fn, ms }); return id; },
    clearTimeout: id => timers.delete(id),
    require: deps,
  };
  const js = ts.transpileModule(fs.readFileSync(root + '/utils/googleTTS.ts', 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  vm.runInNewContext(js, ctx);
  ctx.exports.onTTSSpeakingChange(v => speaking.push(v));
  const audible = () => created.filter(s => s.playing && !s.unloaded).map(s => s.uri);
  return { tts: ctx.exports, created, timers, speaking, audible };
}

const results = [];
async function scenario(name, fn) {
  try { await fn(); results.push(['OK  ', name]); }
  catch (e) { results.push(['FAIL', name + '  ->  ' + e.message]); }
}

(async () => {
  await scenario('1 two playUrlAndAwait started together: only the LAST one is heard', async () => {
    const w = world();
    let done1 = false, done2 = false;
    w.tts.playUrlAndAwait('A').then(() => done1 = true);
    w.tts.playUrlAndAwait('B').then(() => done2 = true);
    await flush();
    assert.deepStrictEqual(w.audible(), ['B'], 'audible now: ' + JSON.stringify(w.audible()));
    await w.tts.stopTTS(); await flush();
    assert.deepStrictEqual(w.audible(), [], 'still audible after stopTTS: ' + JSON.stringify(w.audible()));
    assert.ok(done1 && done2, 'a caller was left waiting (done1=' + done1 + ', done2=' + done2 + ')');
  });

  await scenario('2 two speakAndAwait started together: only the LAST one is heard', async () => {
    const w = world();
    w.tts.speakAndAwait('x'); w.tts.speakAndAwait('y');
    await flush();
    assert.deepStrictEqual(w.audible(), ['file:///tts/y.mp3'], 'audible now: ' + JSON.stringify(w.audible()));
    await w.tts.stopTTS(); await flush();
    assert.deepStrictEqual(w.audible(), [], 'still audible after stopTTS');
  });

  await scenario('3 a new request replaces the one playing: old is released, its caller is let go', async () => {
    const w = world();
    let doneA = false;
    w.tts.playUrlAndAwait('A').then(() => doneA = true);
    await flush();
    assert.deepStrictEqual(w.audible(), ['A']);
    w.tts.playUrlAndAwait('B');
    await flush();
    assert.deepStrictEqual(w.audible(), ['B'], 'audible now: ' + JSON.stringify(w.audible()));
    assert.ok(w.created.find(s => s.uri === 'A').unloaded, 'A was not released');
    assert.ok(doneA, 'caller of A still waiting');
  });

  await scenario('4 a stop that is still finishing never kills audio that started after it', async () => {
    const w = world();
    w.tts.playUrlAndAwait('A');
    await flush();
    const stopping = w.tts.stopTTS();          // not awaited: its stopAsync is still in progress...
    w.tts.playUrlAndAwait('B');                // ...when the user starts something new
    await stopping; await flush();
    assert.deepStrictEqual(w.audible(), ['B'], 'audible now: ' + JSON.stringify(w.audible()));
    assert.ok(w.created.find(s => s.uri === 'A').unloaded, 'A was not released');
  });

  await scenario('5 a finished clip resolves true and leaves nothing behind', async () => {
    const w = world();
    let result = null;
    w.tts.playUrlAndAwait('A').then(r => result = r);
    await flush();
    w.created[0].end(); await flush();
    assert.strictEqual(result, true);
    assert.deepStrictEqual(w.audible(), []);
    assert.strictEqual(w.timers.size, 0, 'safety timer left running');
    assert.strictEqual(w.speaking[w.speaking.length - 1], false, 'speaking state left on');
  });

  await scenario('6 after stopTTS nothing is audible, no timer runs and speaking is off', async () => {
    const w = world();
    w.tts.speakAndAwait('x'); await flush();
    w.tts.playUrlAndAwait('B'); await flush();
    await w.tts.stopTTS(); await flush();
    assert.deepStrictEqual(w.audible(), []);
    assert.strictEqual(w.timers.size, 0, 'timers left: ' + w.timers.size);
    assert.strictEqual(w.speaking[w.speaking.length - 1], false);
    assert.ok(w.created.every(s => s.unloaded), 'a sound was never released: ' + w.created.filter(s => !s.unloaded).map(s => s.uri));
  });

  // ── Q04: outcome must say whether anything was heard ──────────────────────────
  const ST = (x = {}) => ({ isLoaded: true, shouldPlay: true, isPlaying: true, didJustFinish: false,
    positionMillis: 100, durationMillis: 4000, interrupted: false, ...x });
  const fireTimersUpTo = (w, ms) => { for (const [id, t] of [...w.timers]) if (t.ms <= ms) { w.timers.delete(id); t.fn(); } };

  await scenario('7 Q04 an error after loading returns false at once (not true after 30 s)', async () => {
    const w = world(); let result = 'pending';
    w.tts.playUrlAndAwait('bad').then(r => result = r);
    await flush();
    w.created[0].cb({ isLoaded: false, error: 'decode failed' }); await flush();
    assert.strictEqual(result, false, 'result: ' + result);
    assert.strictEqual(w.timers.size, 0, 'timers left: ' + w.timers.size);
    assert.deepStrictEqual(w.audible(), []);
  });

  await scenario('8 Q04 a clip that never played and never finished counts as NOT heard', async () => {
    const w = world(); let result = 'pending';
    w.tts.speakAndAwait('x').then(r => result = r);
    await flush();
    fireTimersUpTo(w, 200_000); await flush();
    // The saved clip made no sound, so it is dropped and the sentence is tried
    // live once (CODEX QA 2026-10-24, R1). That one makes no sound either here.
    assert.strictEqual(w.created.length, 2, 'no live retry after the silent saved clip');
    fireTimersUpTo(w, 200_000); await flush();
    assert.strictEqual(result, false, 'result: ' + result);
  });

  await scenario('9 a long explanation (2 minutes) is not cut off after 30 seconds', async () => {
    const w = world(); let result = 'pending';
    w.tts.speakAndAwait('long').then(r => result = r);
    await flush();
    w.created[0].cb(ST({ durationMillis: 120_000, positionMillis: 200 })); await flush();
    fireTimersUpTo(w, 30_000); await flush();
    assert.strictEqual(result, 'pending', 'finished early: ' + result);
    assert.ok(!w.created[0].unloaded, 'the sound was cut off');
    w.created[0].cb(ST({ didJustFinish: true, isPlaying: false, positionMillis: 120_000, durationMillis: 120_000 })); await flush();
    assert.strictEqual(result, true);
    assert.strictEqual(w.timers.size, 0);
  });

  await scenario('10 a pause holds the safety clock (a long pause does not end the sentence)', async () => {
    const w = world(); let result = 'pending';
    w.tts.speakAndAwait('x').then(r => result = r);
    await flush();
    w.created[0].cb(ST()); await flush();
    w.created[0].cb(ST({ isPlaying: false, shouldPlay: false })); await flush();   // paused
    assert.strictEqual(w.timers.size, 0, 'clock still running during pause');
    w.created[0].cb(ST()); await flush();                                           // resumed
    assert.strictEqual(w.timers.size, 1, 'clock not restarted after resume');
    assert.strictEqual(result, 'pending');
  });

  await scenario('11 a replaced clip does not switch the NEW clip\'s "speaking" state off', async () => {
    const w = world();
    w.tts.playUrlAndAwait('A'); await flush();
    w.tts.playUrlAndAwait('B'); await flush();
    assert.deepStrictEqual(w.audible(), ['B']);
    assert.strictEqual(w.speaking[w.speaking.length - 1], true, 'speaking state: ' + JSON.stringify(w.speaking.slice(-4)));
  });

  // ── Long "why?" explanations: whole text, in parts the tts function accepts ───
  const word = n => 'ሀ'.repeat(n);
  const sentence = n => word(n) + ' ' + word(n) + '። ';          // ends with the Ethiopic full stop

  await scenario('12 splitForTts: every part <= 900 chars, no text lost, sentence ends kept', async () => {
    const w = world();
    const text = Array.from({ length: 40 }, () => sentence(30)).join('');   // ~2,500 chars
    const parts = w.tts.splitForTts(text);
    assert.ok(parts.length >= 3, 'parts: ' + parts.length);
    assert.ok(parts.every(p => p.length <= 900), 'a part is too long: ' + parts.map(p => p.length));
    assert.strictEqual(parts.join(' ').replace(/\s+/g, ''), text.replace(/\s+/g, ''), 'text was lost or changed');
    assert.ok(parts.slice(0, -1).every(p => p.endsWith('።')), 'a part was cut mid-sentence');
  });

  await scenario('13 splitForTts: one sentence longer than 900 chars is broken between words', async () => {
    const w = world();
    const text = Array.from({ length: 150 }, () => word(9)).join(' ');      // 1,499 chars, no full stop
    const parts = w.tts.splitForTts(text);
    assert.ok(parts.every(p => p.length <= 900));
    assert.strictEqual(parts.join(' '), text);
  });

  await scenario('14 short text is spoken as is (one part)', async () => {
    const w = world();
    // (compared as JSON: the array comes from the test's isolated VM context)
    assert.strictEqual(JSON.stringify(w.tts.splitForTts('  ' + sentence(5) + '  ')), JSON.stringify([sentence(5).trim()]));
  });

  await scenario('15 speakLongAndAwait reads every part in order, then resolves true', async () => {
    const w = world(); let result = 'pending';
    const text = Array.from({ length: 40 }, () => sentence(30)).join('');
    const expected = w.tts.splitForTts(text).length;
    w.tts.speakLongAndAwait(text).then(r => result = r);
    for (let i = 0; i < expected; i++) {
      await flush();
      assert.strictEqual(w.audible().length, 1, 'part ' + (i + 1) + ' not playing alone: ' + w.audible().length);
      w.created[w.created.length - 1].end();
    }
    await flush();
    assert.strictEqual(result, true);
    assert.strictEqual(w.created.length, expected, 'parts played: ' + w.created.length + ' of ' + expected);
  });

  await scenario('16 stop during part 2: the rest of the explanation is NOT started', async () => {
    const w = world(); let result = 'pending';
    const text = Array.from({ length: 40 }, () => sentence(30)).join('');
    w.tts.speakLongAndAwait(text).then(r => result = r);
    await flush(); w.created[0].end();                 // part 1 heard
    await flush();
    assert.strictEqual(w.created.length, 2);
    await w.tts.stopTTS(); await flush(); await flush();
    assert.strictEqual(w.created.length, 2, 'a further part started after stop');
    assert.deepStrictEqual(w.audible(), []);
    assert.strictEqual(result, true);
  });

  await scenario('17 areTtsTextsCached: true only when every answer reading is saved', async () => {
    assert.strictEqual(await world().tts.areTtsTextsCached(['a', 'b', '']), true);
    assert.strictEqual(await world({ missing: ['b'] }).tts.areTtsTextsCached(['a', 'b']), false);
  });

  await scenario('18 R1 an older request arriving late never switches the speaking state off over a live voice', async () => {
    let releaseA; const holdA = new Promise(r => releaseA = r);
    const w = world({ hold: { A: holdA } });
    w.tts.playUrlAndAwait('A');                       // A waits for its player...
    await flush();
    w.tts.playUrlAndAwait('B');                       // ...B starts and speaks
    await flush();
    assert.deepStrictEqual(w.audible(), ['B']);
    assert.strictEqual(w.tts.getIsTTSSpeaking(), true, 'B is not shown as speaking');
    releaseA(); await flush();                        // A finally gets its player, sees it lost its place
    assert.strictEqual(w.tts.getIsTTSSpeaking(), true, 'the late A switched speaking off while B talks');
    assert.deepStrictEqual(w.audible(), ['B']);
  });

  await scenario('19 R2 TTS stuck part-way (buffering at 1 s of 120 s) is NOT counted as heard', async () => {
    const w = world(); let result = 'pending';
    w.tts.speakAndAwait('stalls').then(r => result = r);
    await flush();
    w.created[0].cb(ST({ durationMillis: 120_000, positionMillis: 1_000 }));
    w.created[0].cb(ST({ isPlaying: false, isBuffering: true, durationMillis: 120_000, positionMillis: 1_000 }));
    await flush();
    fireTimersUpTo(w, 1_000_000); await flush();
    // Stuck part-way = not heard: dropped and tried live once (R1), silent too here.
    assert.strictEqual(w.created.length, 2, 'no live retry after the stuck saved clip');
    fireTimersUpTo(w, 1_000_000); await flush();
    assert.strictEqual(result, false, 'result: ' + result);
  });

  await scenario('20 R2 TTS playing, then the player goes quiet (callbacks lost): still counted as heard', async () => {
    const w = world(); let result = 'pending';
    w.tts.speakAndAwait('quiet').then(r => result = r);
    await flush();
    w.created[0].cb(ST({ durationMillis: 20_000, positionMillis: 5_000 }));
    await flush();
    fireTimersUpTo(w, 1_000_000); await flush();
    assert.strictEqual(result, true, 'result: ' + result);
  });

  for (const [mark, name] of results) console.log(mark, name);
  const failed = results.filter(r => r[0] === 'FAIL').length;
  console.log(failed ? `\n${failed} FAILED` : '\nALL PASSED');
  process.exitCode = failed ? 1 : 0;
})().catch(e => { console.error(e); process.exitCode = 1; });
