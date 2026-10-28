// CODEX round 7 (R7-1 .. R7-4): the four findings, run against the REAL functions (extracted with the TypeScript
// parser) with controlled speech, preferences, ad and navigation fakes. NOT a React or device test.
//   R7-1  the two floating Back buttons of Engine A sit below the status bar
//   R7-2  the feedback speech is cancelled when the feedback goes away, and the exam stops audio before its ad
//   R7-3  an OLD reading finishing late cannot clear the flags of a NEWER one (Engine B feedback)
//   R7-4  leaving during the location-preferences read: no primer, no old Back / complete
// Run from anywhere:  node round7-fixes-test.cjs
const fs = require('fs'), vm = require('vm'), path = require('path'), assert = require('assert');
const root = path.resolve(__dirname, '../../..');
const ts = require(root + '/node_modules/typescript');
const read = f => fs.readFileSync(root + '/' + f, 'utf8');
const tick = async () => { for (let i = 0; i < 60; i++) await Promise.resolve(); };

function extract(file, name) {
  const src = read(file);
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.ES2020, true, ts.ScriptKind.TSX);
  let found = null;
  const visit = n => {
    if (!found && ts.isVariableDeclaration(n) && n.name.getText(sf) === name && n.initializer) {
      let init = n.initializer;
      if (ts.isCallExpression(init) && init.expression.getText(sf) === 'useCallback') init = init.arguments[0];
      found = init.getText(sf);
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  assert.ok(found, file + ': ' + name + ' not found');
  return found;
}
function compile(texts) {
  const code = Object.entries(texts).map(([n, t]) => `const ${n} = ${t};`).join('\n') + '\nmodule.exports = { ' + Object.keys(texts).join(', ') + ' };';
  return ts.transpileModule(code, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
}
const deferred = () => { let resolve; const p = new Promise(r => { resolve = r; }); return { p, resolve }; };

const results = [];
async function scenario(name, fn) {
  try { await fn(); results.push(['OK  ', name]); } catch (e) { results.push(['FAIL', name + '  ->  ' + String(e.message).split('\n')[0]]); }
}

(async () => {
  // ================= R7-1 =================
  await scenario('R7-1 the two floating Back buttons are pushed down by the status-bar inset (absolute children ignore the frame padding)', async () => {
    for (const [f, style] of [['app/(engineA)/question/[id].tsx', 'backButton'], ['app/(engineA)/behavioral-subtopic/[id].tsx', 'backButtonFloating']]) {
      const s = read(f);
      assert.ok(new RegExp(`style=\\{\\[styles\\.${style}, \\{ top: 12 \\+ insets\\.top \\}\\]\\}`).test(s), f + ': top inset missing');
      assert.ok(/const insets = useSafeAreaInsets\(\);/.test(s), f + ': no insets');
    }
  });

  // ================= R7-3: the real handlers of TextFeedback =================
  function makeFeedback() {
    const calls = { stop: 0, next: 0 };
    const pend = { feedback: [], why: [] };
    const state = { tts: false, rag: false };
    const env = {
      module: { exports: null }, Promise, console: { warn() {}, log() {}, error() {} },
      ttsText: 'text', ragExplanation: 'why', audioInterrupted: false, resumeInterruptedAudio() {},
      mountedRef: { current: true },
      ttsSpeakingRef: { current: false }, ragSpeakingRef: { current: false }, readingOp: { current: 0 },
      setTtsSpeaking: v => { state.tts = v; }, setRagSpeaking: v => { state.rag = v; },
      speakAndAwait: () => { const d = deferred(); pend.feedback.push(d); return d.p; },
      speakLongAndAwait: () => { const d = deferred(); pend.why.push(d); return d.p; },
      stopTTS: async () => { calls.stop++; },
      onNext: () => { calls.next++; },
    };
    const f = 'components/engineB/TextFeedback.tsx';
    vm.runInNewContext(compile({ endReading: extract(f, 'endReading'), handleTtsSpeak: extract(f, 'handleTtsSpeak'),
      handleRagSpeak: extract(f, 'handleRagSpeak'), handleNext: extract(f, 'handleNext') }), env);
    return { env, calls, pend, state, h: env.module.exports };
  }

  await scenario('R7-3 feedback A -> why B -> feedback C, then A finishes late: C keeps its flag, Next still stops the speech', async () => {
    const t = makeFeedback();
    const a = t.h.handleTtsSpeak(); await tick();
    const b = t.h.handleRagSpeak(); await tick();
    const c = t.h.handleTtsSpeak(); await tick();
    assert.strictEqual(t.env.ttsSpeakingRef.current, true);
    t.pend.feedback[0].resolve(true); await a; await tick();              // the OLD reading (A) ends
    assert.strictEqual(t.env.ttsSpeakingRef.current, true, 'an old reading cleared the flag of the newer one');
    assert.strictEqual(t.state.tts, true, 'an old reading switched off the indicator of the newer one');
    t.h.handleNext();
    assert.strictEqual(t.calls.stop, 1, 'Next did not stop the speech that is still going');
    assert.strictEqual(t.calls.next, 1);
    t.pend.why[0].resolve(true); t.pend.feedback[1].resolve(true); await Promise.all([b, c]);
  });

  await scenario('R7-3 the same the other way round: a why-reading is replaced, the old feedback ends late', async () => {
    const t = makeFeedback();
    const a = t.h.handleTtsSpeak(); await tick();
    const b = t.h.handleRagSpeak(); await tick();                         // replaces A
    t.pend.feedback[0].resolve(true); await a; await tick();             // A ends late
    assert.strictEqual(t.env.ragSpeakingRef.current, true, 'the why-reading lost its flag');
    t.h.handleNext();
    assert.strictEqual(t.calls.stop, 1);
    t.pend.why[0].resolve(true); await b;
  });

  await scenario('R7-3 a reading that ends normally clears its own flags, and Next with nothing playing stops nothing', async () => {
    const t = makeFeedback();
    const a = t.h.handleTtsSpeak(); await tick();
    t.pend.feedback[0].resolve(true); await a; await tick();
    assert.strictEqual(t.env.ttsSpeakingRef.current, false); assert.strictEqual(t.state.tts, false);
    t.h.handleNext();
    assert.strictEqual(t.calls.stop, 0); assert.strictEqual(t.calls.next, 1);
  });

  await scenario('R7-3 tapping ▶️ again while it plays stops it (and its late completion changes nothing)', async () => {
    const t = makeFeedback();
    const a = t.h.handleTtsSpeak(); await tick();
    await t.h.handleTtsSpeak();                                           // second tap = stop
    assert.strictEqual(t.env.ttsSpeakingRef.current, false); assert.strictEqual(t.calls.stop, 1);
    const c = t.h.handleTtsSpeak(); await tick();                         // a new reading
    t.pend.feedback[0].resolve(true); await a; await tick();             // the stopped one ends late
    assert.strictEqual(t.env.ttsSpeakingRef.current, true, 'the stopped reading cleared the new one');
    t.pend.feedback[1].resolve(true); await c;
  });

  // ================= R7-2 =================
  await scenario('R7-2 Engine A feedback: the speech is marked active while loading/playing, and unmounting cancels it', async () => {
    const s = read('components/engineA/AudioFeedback.tsx');
    assert.ok(/const ttsActiveRef\s*= useRef\(false\)/.test(s));
    const mountEff = s.slice(s.indexOf('setTtsPlaying(true);'), s.indexOf('return () => clearTimeout(stalled);'));
    assert.ok(mountEff.indexOf('ttsActiveRef.current = true') >= 0 && mountEff.indexOf('ttsActiveRef.current = true') < mountEff.indexOf('speakAndAwait(ttsText)'));
    assert.ok(/ttsActiveRef\.current = false;/.test(mountEff), 'flag never cleared when the speech ends');
    const cleanup = s.slice(s.indexOf('mountedRef.current = false;'), s.indexOf('}, []);', s.indexOf('mountedRef.current = false;')));
    assert.ok(/ragSpeakingRef\.current \|\| ttsActiveRef\.current/.test(cleanup) && /stopTTS\(\)/.test(cleanup), 'unmount does not cancel the feedback speech');
  });

  await scenario('R7-2 both exams stop their audio BEFORE they ask for the ad of the result', async () => {
    for (const e of ['A', 'B']) {
      const s = read(`app/(engine${e})/(tabs)/exam.tsx`);
      const i = s.indexOf('maybeShowInterstitial(() => activeRef.current)');
      assert.ok(i > 0);
      const before = s.slice(s.lastIndexOf("phase === 'result'", i), i);
      assert.ok(/stopAudio\(\)/.test(before), e + ': audio not stopped before the ad');
      if (e === 'A') assert.ok(/stopTTS\(\)/.test(before), 'A: speech not stopped before the ad');
    }
  });

  // ================= R7-4: the real location hook =================
  function makeLocation(prefs, opts = {}) {
    const calls = { visible: [], written: [] };
    const env = {
      module: { exports: null }, Promise, console: { warn() {}, log() {}, error() {} },
      MAX_AUTO_ASKS: 2, RE_ASK_AFTER_QUIZZES: 3,
      readPrefs: async () => { if (opts.holdRead) await opts.holdRead.p; return { ...prefs }; },
      writePrefs: async p => { calls.written.push(p); if (opts.holdWrite) await opts.holdWrite.p; },
      setVisible: v => calls.visible.push(v),
    };
    vm.runInNewContext(compile({ maybeShow: extract('hooks/useLocationPrompt.ts', 'maybeShow') }), env);
    return { calls, maybeShow: env.module.exports.maybeShow };
  }
  const real = read('hooks/useLocationPrompt.ts');
  const consts = { MAX: +(real.match(/const MAX_AUTO_ASKS\s*=\s*(\d+)/) || [])[1], RE: +(real.match(/const RE_ASK_AFTER_QUIZZES\s*=\s*(\d+)/) || [])[1] };

  await scenario('R7-4 location hook: the learner left while the preferences were read -> no primer', async () => {
    let still = true; const hold = deferred();
    const t = makeLocation({ approved: false, notNowCount: 0 }, { holdRead: hold });
    const p = t.maybeShow(() => still);
    still = false; hold.resolve();
    assert.strictEqual(await p, false);
    assert.deepStrictEqual(t.calls.visible, [], 'a primer was shown over another screen');
  });

  await scenario('R7-4 location hook: still on the screen -> the primer is shown as before (first ask and the re-ask)', async () => {
    const first = makeLocation({ approved: false, notNowCount: 0 });
    assert.strictEqual(await first.maybeShow(() => true), true); assert.deepStrictEqual(first.calls.visible, [true]);
    const reask = makeLocation({ approved: false, notNowCount: 1, quizzesSincePrompt: 99 });
    assert.strictEqual(await reask.maybeShow(), true);     // no canShow given: old callers still work
    assert.deepStrictEqual(reask.calls.visible, [true]);
    const approved = makeLocation({ approved: true });
    assert.strictEqual(await approved.maybeShow(() => true), false);
  });

  await scenario('R7-4 location hook: left while the re-ask preferences were WRITTEN -> no primer', async () => {
    let still = true; const hold = deferred();
    const t = makeLocation({ approved: false, notNowCount: 1, quizzesSincePrompt: 99 }, { holdWrite: hold });
    const p = t.maybeShow(() => still);
    await tick(); still = false; hold.resolve();
    assert.strictEqual(await p, false);
    assert.deepStrictEqual(t.calls.visible, []);
  });

  // ---- the screens' last-question transition with the real hook contract ----
  const SCREENS = [
    // file, handler, extra env, what must NOT happen after the learner left
    ['app/(engineB)/question/[id].tsx', 'handleFeedbackNext', () => ({ canGoNextQ: false, handleNextQuestion: async () => {}, router: { back() { this.n = (this.n || 0) + 1; }, n: 0 }, stopAudio: async () => {} }), env => env.router.n === 0],
    ['app/(engineA)/question/[id].tsx', 'handleNext', () => ({ qIndex: 2, questions: [1, 2, 3], navigateToQuestion: async () => {}, handleBack: async () => { env_phase.push('back'); }, stopAudio: async () => {} }), () => env_phase.length === 0],
    ['app/(engineA)/behavioral-subtopic/[id].tsx', 'handleNext', () => ({ qIndex: 1, questions: [1, 2], navigateToQuestion() {}, setPhase(p) { env_phase.push(p); }, soundRef: { current: { stopAsync: async () => {} } }, cancelListening() {}, stopTTS: async () => {} }), () => env_phase.length === 0],
    ['app/(engineB)/behavioral-subtopic/[id].tsx', 'handleNext', () => ({ qIndex: 1, questions: [1, 2], setQIndex() {}, setSelectedAnswer() {}, setFeedbackText() {}, setPhase(p) { env_phase.push(p); }, ttsSpeakingRef: { current: false }, setTtsSpeaking() {}, stopAudio: async () => {}, stopTTS: async () => {} }), () => env_phase.length === 0],
  ];
  let env_phase = [];
  for (const [file, fnName, extraFn, untouched] of SCREENS) {
    const short = file.replace('app/', '');
    await scenario(`R7-4 ${short}: left during the location read -> no primer, no old Back / complete, guard released`, async () => {
      env_phase = [];
      const active = { current: true }; const holdLoc = deferred(); const asked = [];
      const env = Object.assign({
        module: { exports: null }, Promise, console: { warn() {}, log() {}, error() {} },
        activeRef: active, advancingRef: { current: false },
        setShowFeedback() {}, maybeShowInterstitial: async () => {},
        maybeShowLocationPrompt: async (canShow) => { asked.push(canShow); await holdLoc.p; return false; },
      }, extraFn());
      vm.runInNewContext(compile({ passAdGate: extract(file, 'passAdGate'), [fnName]: extract(file, fnName) }), env);
      const p = env.module.exports[fnName](); await tick();
      assert.strictEqual(asked.length, 1, 'the location step was never reached');
      assert.strictEqual(typeof asked[0], 'function', 'the location hook was not told how to see that the screen was left');
      active.current = false;                    // physical Back while the preferences are read
      assert.strictEqual(asked[0](), false);
      holdLoc.resolve(); await p; await tick();
      assert.ok(untouched(env), 'an old Back / complete ran after the learner left');
      assert.strictEqual(env.advancingRef.current, false, 'guard stuck');
    });
  }

  // ================= Engine B "Next" responds at once, in every question type =================
  function runNext(file, name, extra) {
    const calls = { hide: 0, next: 0, replace: 0, order: [] };
    const hold = deferred();
    const env = Object.assign({
      module: { exports: null }, Promise, console: { warn() {}, log() {}, error() {} },
      advancedRef: { current: false }, advancingRef: { current: false },
      setShowFeedback: v => { if (v === false) { calls.hide++; calls.order.push('hide'); } },
      stopAudio: () => { calls.order.push('stop'); return hold.p; },
      nextQuestion: () => { calls.next++; calls.order.push('next'); return Promise.resolve(); },
      setSelectedId() {}, router: { replace: () => { calls.replace++; calls.order.push('replace'); } },
      Haptics: { selectionAsync() {} }, canGoNextQ: true, questionIndex: 0, signId: 's',
    }, extra || {});
    vm.runInNewContext(compile({ [name]: extract(file, name) }), env);
    return { env, calls, hold, fn: env.module.exports[name] };
  }
  await scenario('Next (B exam): the panel closes on the tap, the audio stop is not awaited, a double tap moves on ONCE', async () => {
    const t = runNext('app/(engineB)/(tabs)/exam.tsx', 'handleNext');
    t.fn(); t.fn(); await tick();
    assert.strictEqual(t.calls.next, 1, 'nextQuestion ran ' + t.calls.next + ' times (a question was skipped)');
    assert.deepStrictEqual(t.calls.order.slice(0, 2), ['hide', 'stop'], 'the panel must close before anything slow: ' + t.calls.order);
    assert.strictEqual(t.calls.order.indexOf('next') > -1, true, 'waited for the audio stop before moving on');
  });
  await scenario('Next (B practice): a double tap takes ONE question out of the queue', async () => {
    const t = runNext('app/(engineB)/practice.tsx', 'handleNext');
    t.fn(); t.fn(); await tick();
    assert.strictEqual(t.calls.next, 1, 'nextQuestion ran ' + t.calls.next + ' times');
    assert.strictEqual(t.calls.hide, 1);
  });
  await scenario('Next (B sign quiz, middle question): the next question opens without waiting for the audio to stop', async () => {
    const t = runNext('app/(engineB)/question/[id].tsx', 'handleNextQuestion');
    const p = t.fn(); await tick();            // the audio stop is still pending (held)
    assert.strictEqual(t.calls.replace, 1, 'waited for the audio stop before opening the next question');
    assert.strictEqual(t.calls.order[0], 'hide');
    t.hold.resolve(); await p;
  });
  await scenario('Next (B topic quiz / daily quiz and B behavioral, middle question): nothing slow before the move', async () => {
    for (const [file, extra] of [
      ['app/(engineB)/topic-quiz/[topicId].tsx', { currentIndex: 0, questions: [1, 2], scrollRef: { current: null }, passAdGate: async () => true, activeRef: { current: true } }],
      ['app/(engineB)/behavioral-subtopic/[id].tsx', { qIndex: 0, questions: [1, 2], setQIndex() { this.moved = 1; }, setSelectedAnswer() {}, setFeedbackText() {}, setPhase() {}, passAdGate: async () => true, maybeShowLocationPrompt: async () => false, activeRef: { current: true } }],
    ]) {
      const t = runNext(file, 'handleNext', extra);
      t.env.setQIndex = () => { t.calls.order.push('next'); t.calls.next++; };
      t.fn(); await tick();
      assert.strictEqual(t.calls.next, 1, file + ': did not move on at once');
      assert.strictEqual(t.calls.order[0], 'hide', file + ': the panel must close first');
      assert.ok(!t.calls.order.includes('stop') || t.calls.order.indexOf('stop') > t.calls.order.indexOf('hide'), file);
    }
  });

  for (const [s, n] of results) console.log(s, n);
  const bad = results.filter(r => r[0] === 'FAIL').length;
  console.log(`\n${results.length - bad} of ${results.length} scenarios passed`);
  process.exitCode = bad ? 1 : 0;
})().catch(e => { console.log('TEST ERROR', e); process.exitCode = 1; });
