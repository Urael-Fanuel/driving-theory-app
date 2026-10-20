// Logic test for hooks/useVoiceRecognition.ts cancellation (CODEX QA Q05). Loads the REAL hook with a
// fake recorder, speech service, haptics and timers. NOT an Android test. Every expectation is an
// assertion; any failure exits with code 1.
const fs = require('fs'), vm = require('vm'), path = require('path'), assert = require('assert');
const root = path.resolve(__dirname, '../../..');
const ts = require(root + '/node_modules/typescript');
const tick  = () => new Promise(r => setImmediate(r));
const flush = async () => { for (let i = 0; i < 15; i++) await tick(); };
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };

function world(opts = {}) {
  const startGate = deferred(), sttGate = deferred(), answers = [], timers = new Map(), effects = [], cleanups = [];
  let nextTimer = 1;
  const rec = { cancelled: 0, stopped: 0,
    cancel: async () => { rec.cancelled++; },
    stopAndUnload: async () => { rec.stopped++; return 'file:///voice.amr'; } };
  const react = { useState: v => [v, () => {}], useRef: v => ({ current: v }), useCallback: f => f, useEffect: fn => effects.push(fn) };
  const deps = p =>
    p === 'react'                    ? react :
    p === 'expo-audio'               ? { getRecordingPermissionsAsync: async () => ({ granted: true }), requestRecordingPermissionsAsync: async () => ({ granted: true }) } :
    p.endsWith('/recorder')          ? { ActiveRecording: { start: () => opts.instantStart ? Promise.resolve(rec) : startGate.promise } } :
    p.endsWith('/sound')             ? { applyAudioMode: async () => {} } :
    p.includes('file-system')        ? { deleteAsync: async () => {} } :
    p === 'react-native'             ? { Platform: { OS: 'android' } } :
    p === 'expo-haptics'             ? { impactAsync: async () => { if (opts.hapticsFails) throw new Error('no vibrator'); }, ImpactFeedbackStyle: { Light: 1, Heavy: 2 } } :
    p.includes('speechRecognition')  ? { recognizeAmharicAnswer: () => sttGate.promise, mockRecognizeAmharicAnswer: async () => ({ isRecognized: true, answer: 1 }) } :
    p.includes('errorReporter')      ? { reportError() {} } : {};
  const ctx = {
    exports: {}, console: { warn() {}, error() {}, log() {} }, process: { env: { EXPO_PUBLIC_SUPABASE_URL: 'https://qa.invalid' } },
    setTimeout: (fn, ms) => { const id = nextTimer++; timers.set(id, { fn, ms }); return id; },
    clearTimeout: id => timers.delete(id),
    require: deps,
  };
  const js = ts.transpileModule(fs.readFileSync(root + '/hooks/useVoiceRecognition.ts', 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  vm.runInNewContext(js, ctx);
  const hook = ctx.exports.useVoiceRecognition(x => answers.push(x));
  for (const fn of effects) { const c = fn(); if (typeof c === 'function') cleanups.push(c); }   // mount
  const unmount = () => cleanups.forEach(c => c());
  return { hook, startGate, sttGate, rec, answers, timers, unmount };
}

const results = [];
async function scenario(name, fn) {
  try { await fn(); results.push(['OK  ', name]); }
  catch (e) { results.push(['FAIL', name + '  ->  ' + e.message.split('\n')[0]]); }
}

(async () => {
  await scenario('1 Q05 cancel while the microphone is starting: the late recorder is shut, nothing armed', async () => {
    const w = world();
    const starting = w.hook.startListening(); await flush();
    await w.hook.cancelListening();
    w.startGate.resolve(w.rec); await starting; await flush();
    assert.strictEqual(w.rec.cancelled, 1, 'recorder cancelled ' + w.rec.cancelled + ' times');
    assert.strictEqual(w.timers.size, 0, 'a recording timeout is still armed');
    assert.deepStrictEqual(w.answers, []);
  });

  await scenario('2 Q05 cancel while the answer is being recognized: the late result is NOT used', async () => {
    const w = world({ instantStart: true });
    await w.hook.startListening();
    const stopping = w.hook.stopListening(); await flush();
    await w.hook.cancelListening();
    w.sttGate.resolve({ isRecognized: true, answer: 2 }); await stopping; await flush();
    assert.deepStrictEqual(w.answers, [], 'answers delivered after cancel: ' + JSON.stringify(w.answers));
  });

  await scenario('3 leaving the screen while recognizing: the late result is NOT used', async () => {
    const w = world({ instantStart: true });
    await w.hook.startListening();
    const stopping = w.hook.stopListening(); await flush();
    w.unmount();
    w.sttGate.resolve({ isRecognized: true, answer: 3 }); await stopping; await flush();
    assert.deepStrictEqual(w.answers, [], 'answers delivered after unmount: ' + JSON.stringify(w.answers));
  });

  await scenario('4 normal use still works: start, stop, recognized answer delivered once', async () => {
    const w = world({ instantStart: true });
    await w.hook.startListening();
    const stopping = w.hook.stopListening(); await flush();
    w.sttGate.resolve({ isRecognized: true, answer: 2 }); await stopping; await flush();
    assert.deepStrictEqual(w.answers, [2]);
    assert.strictEqual(w.rec.stopped, 1);
  });

  await scenario('5 a failing vibration does not block the stop (answer still delivered)', async () => {
    const w = world({ instantStart: true, hapticsFails: true });
    await w.hook.startListening().catch(() => {});
    const stopping = w.hook.stopListening().catch(() => {}); await flush();
    w.sttGate.resolve({ isRecognized: true, answer: 4 }); await stopping; await flush();
    assert.deepStrictEqual(w.answers, [4], 'answers: ' + JSON.stringify(w.answers));
  });

  await scenario('6 a second stop while the first is running does nothing (no double recognition)', async () => {
    const w = world({ instantStart: true });
    await w.hook.startListening();
    const a = w.hook.stopListening(); const b = w.hook.stopListening(); await flush();
    w.sttGate.resolve({ isRecognized: true, answer: 1 }); await a; await b; await flush();
    assert.deepStrictEqual(w.answers, [1]);
    assert.strictEqual(w.rec.stopped, 1);
  });

  for (const [mark, name] of results) console.log(mark, name);
  const failed = results.filter(r => r[0] === 'FAIL').length;
  console.log(failed ? `\n${failed} FAILED` : '\nALL PASSED');
  process.exitCode = failed ? 1 : 0;
})().catch(e => { console.error(e); process.exitCode = 1; });
