// Runs the REAL handleBack of the four end-point screens (extracted from the source with
// the TypeScript parser) with fake audio, router and ad service, to check the exit guard
// (CODEX round 3 C1 and round 4 R4-1): one exit at a time, a failed exit can be retried,
// a successful exit is not repeated. NOT a React or device test.
// Run from anywhere:  node handleback-test.cjs
const fs = require('fs'), vm = require('vm'), path = require('path'), assert = require('assert');
const root = path.resolve(__dirname, '../../..');
const ts = require(root + '/node_modules/typescript');

const SCREENS = [
  ['app/(engineA)/behavioral-subtopic/[id].tsx', 'complete'],
  ['app/(engineB)/behavioral-subtopic/[id].tsx', 'complete'],
  ['app/(engineA)/topic-quiz/[topicId].tsx', 'result'],
  ['app/(engineB)/topic-quiz/[topicId].tsx', 'result'],
];

/** The function text of `const handleBack = ...` (the first argument when wrapped in useCallback). */
function extract(file) {
  const src = fs.readFileSync(root + '/' + file, 'utf8');
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.ES2020, true, ts.ScriptKind.TSX);
  let found = null;
  const visit = n => {
    if (!found && ts.isVariableDeclaration(n) && n.name.getText(sf) === 'handleBack' && n.initializer) {
      let init = n.initializer;
      if (ts.isCallExpression(init) && init.expression.getText(sf) === 'useCallback') init = init.arguments[0];
      found = init.getText(sf);
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  assert.ok(found, file + ': handleBack not found');
  return found;
}

function make(file, phase, opts = {}) {
  const calls = { back: 0, ads: 0 };
  const env = {
    leavingRef: { current: false },
    phase,
    router: {
      canGoBack: () => opts.canGoBack !== false,
      back: () => { calls.back++; if (opts.backThrowsOnce && calls.back === 1) throw new Error('navigation failed'); },
    },
    stopTTS: async () => {},
    stopAudio: async () => { if (opts.stopRejectsOnce && !env._stopped) { env._stopped = true; throw new Error('audio'); } },
    cancelListening: () => { if (opts.auxThrowsOnce && !env._aux) { env._aux = true; throw new Error('listening'); } },
    soundRef: { current: { stopAsync: async () => {} } },
    ttsSpeakingRef: { current: true },
    setTtsSpeaking: () => { if (opts.auxThrowsOnce && !env._aux) { env._aux = true; throw new Error('state'); } },
    maybeShowInterstitial: async () => { calls.ads++; if (opts.adHold) await opts.adHold; },
    console: { warn() {}, log() {}, error() {} },
  };
  const js = ts.transpileModule('module.exports = ' + extract(file) + ';',
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const ctx = Object.assign({ module: { exports: null }, Promise }, env);
  vm.runInNewContext(js, ctx);
  return { fn: ctx.module.exports, env: ctx, raw: env, calls };
}

const results = [];
async function scenario(name, fn) {
  try { await fn(); results.push(['OK  ', name]); } catch (e) { results.push(['FAIL', name + '  ->  ' + String(e.message).split('\n')[0]]); }
}

(async () => {
  for (const [file, phase] of SCREENS) {
    const short = file.replace('app/', '');

    await scenario(`${short}: R4-1 navigation throws once -> the guard is released and the next tap leaves`, async () => {
      const t = make(file, phase, { backThrowsOnce: true });
      await t.fn();
      assert.strictEqual(t.env.leavingRef.current, false, 'guard stuck after a failed exit');
      await t.fn();
      assert.strictEqual(t.calls.back, 2, 'the retry never reached the router');
    });

    await scenario(`${short}: R4-1 an audio stop that rejects -> the guard is released and the next tap leaves`, async () => {
      const t = make(file, phase, { stopRejectsOnce: true });
      await t.fn().catch(() => {});
      await t.fn();
      assert.ok(t.calls.back >= 1, 'never left after the audio error');
      assert.ok(t.env.leavingRef.current === true || t.calls.back >= 1);
    });

    await scenario(`${short}: R4-1 the first step of the exit throws (Engine A: voice listening, Engine B: speaking state) -> released, the retry leaves`, async () => {
      const t = make(file, phase, { auxThrowsOnce: true });
      await t.fn();
      assert.strictEqual(t.raw._aux, true, 'the injected step was not reached, so this scenario proves nothing');
      assert.strictEqual(t.env.leavingRef.current, false, 'guard stuck');
      assert.strictEqual(t.calls.back, 0, 'left although the exit failed');
      await t.fn();
      assert.strictEqual(t.calls.back, 1, 'the retry did not leave');
    });

    await scenario(`${short}: a successful exit keeps the guard on (no second navigation from a late tap)`, async () => {
      const t = make(file, phase);
      await t.fn(); await t.fn();
      assert.strictEqual(t.calls.back, 1, 'navigated twice');
      assert.strictEqual(t.env.leavingRef.current, true);
    });

    await scenario(`${short}: C1 two taps while the ad is open -> one ad decision, one navigation`, async () => {
      let release; const hold = new Promise(r => { release = r; });
      const t = make(file, phase, { adHold: hold });
      const p1 = t.fn(); const p2 = t.fn();
      for (let i = 0; i < 20; i++) await Promise.resolve();
      assert.strictEqual(t.calls.back, 0, 'left before the ad closed');
      release(); await Promise.all([p1, p2]);
      assert.strictEqual(t.calls.ads, 1);
      assert.strictEqual(t.calls.back, 1);
    });

    await scenario(`${short}: nowhere to go back to -> the guard is released (the back button keeps working)`, async () => {
      const t = make(file, phase, { canGoBack: false });
      await t.fn();
      assert.strictEqual(t.env.leavingRef.current, false);
    });

    await scenario(`${short}: no ad outside the end screen`, async () => {
      const t = make(file, 'questions');
      await t.fn();
      assert.strictEqual(t.calls.ads, 0);
    });
  }

  for (const [s, n] of results) console.log(s, n);
  const bad = results.filter(r => r[0] === 'FAIL').length;
  console.log(`\n${results.length - bad} of ${results.length} scenarios passed`);
  process.exitCode = bad ? 1 : 0;
})().catch(e => { console.log('TEST ERROR', e); process.exitCode = 1; });
