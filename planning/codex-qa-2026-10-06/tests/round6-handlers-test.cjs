// CODEX round 6 (R6-1, R6-2, R6-3, R6-4): runs the REAL handlers of the quiz screens (extracted with the TypeScript
// parser) with fake audio, router, feedback state and ad service, and the failures CODEX reproduced:
//   - two answer taps before the first await finishes count ONE answer toward the ad (R6-1)
//   - the feedback is closed and its speech stopped BEFORE the ad is asked for (R6-2)
//   - two Next taps / arrow+Next overlap move on once (R6-3)
//   - leaving the screen during the ad wait: no ad over the other screen, and the old "next question" does not run (R6-4)
// NOT a React or device test.   Run from anywhere:  node round6-handlers-test.cjs
const fs = require('fs'), vm = require('vm'), path = require('path'), assert = require('assert');
const root = path.resolve(__dirname, '../../..');
const ts = require(root + '/node_modules/typescript');

function extract(file, name) {
  const src = fs.readFileSync(root + '/' + file, 'utf8');
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
  // several functions in one scope, so handleNext can call passAdGate like in the screen
  const code = Object.entries(texts).map(([n, t]) => `const ${n} = ${t};`).join('\n') + '\nmodule.exports = { ' + Object.keys(texts).join(', ') + ' };';
  return ts.transpileModule(code, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
}
const tick = async () => { for (let i = 0; i < 60; i++) await Promise.resolve(); };

const results = [];
async function scenario(name, fn) {
  try { await fn(); results.push(['OK  ', name]); } catch (e) { results.push(['FAIL', name + '  ->  ' + String(e.message).split('\n')[0]]); }
}

(async () => {
  // ---------- R6-1: one answer, one count ----------
  const ANSWER = [
    // file, answer arg(s), extra env
    ['app/(engineA)/question/[id].tsx', 1, { answeredIndex: null }],
    ['app/(engineB)/question/[id].tsx', 'a2', { selectedId: null }],
    ['app/(engineA)/behavioral-subtopic/[id].tsx', 1, { answeredIndex: null }],
    ['app/(engineB)/behavioral-subtopic/[id].tsx', 1, { selectedAnswer: null }],
  ];
  for (const [file, arg, extra] of ANSWER) {
    const short = file.replace('app/', '');
    await scenario(`R6-1 ${short}: two taps before the first await finishes -> ONE answer counted`, async () => {
      const calls = { count: 0 };
      let release; const hold = new Promise(r => { release = r; });
      const answers = [{ id: 'a1', is_correct: false, text_amharic: 'x' }, { id: 'a2', is_correct: true, text_amharic: 'y' }, { id: 'a3', is_correct: false }];
      const q = { id: 'q1', answers };
      const env = Object.assign({
        module: { exports: null }, Promise, console: { warn() {}, log() {}, error() {} },
        currentQuestion: q, currentQ: q, sign: { topic_id: 't' }, signId: 's',
        answerLockedRef: { current: false },
        ttsSpeakingRef: { current: true }, setTtsSpeaking() {}, stopTTS: () => hold, stopAudio: () => hold, cancelListening() {},
        Haptics: { impactAsync: async () => {}, notificationAsync: () => Promise.resolve(), selectionAsync() {}, ImpactFeedbackStyle: { Light: 1 }, NotificationFeedbackType: { Success: 1, Error: 2 } },
        setSelectedAnswer() {}, setSelectedId() {}, setAnsweredIndex() {}, setPlayingAnswerIndex() {},
        setFeedbackText() {}, setFeedbackTTSText() {}, setShowFeedback() {}, setTimeout: () => 0,
        randomPraise: () => 'ok', recordAnswer() {},
        countAnsweredQuestion: () => { calls.count++; },
      }, extra);
      vm.runInNewContext(compile({ handleAnswerSelect: extract(file, 'handleAnswerSelect') }), env);
      const h = env.module.exports.handleAnswerSelect;
      const p1 = h(arg); const p2 = h(arg);
      release(); await Promise.all([p1, p2]); await tick();
      assert.strictEqual(calls.count, 1, 'counted ' + calls.count + ' times for one question');
    });
  }

  // ---------- R6-2 / R6-3 / R6-4: the transition after an answer ----------
  const NEXT = [
    // file, extra env for the screen
    ['app/(engineB)/behavioral-subtopic/[id].tsx', 'handleNext', (last) => ({ qIndex: last ? 1 : 0, questions: [1, 2], setQIndex() {}, setSelectedAnswer() {}, setFeedbackText() {}, setPhase() {}, ttsSpeakingRef: { current: true }, setTtsSpeaking() {}, stopAudio: async () => {}, stopTTS: async () => {} })],
    ['app/(engineA)/behavioral-subtopic/[id].tsx', 'handleNext', (last) => ({ qIndex: last ? 1 : 0, questions: [1, 2], navigateToQuestion() {}, setPhase() {}, soundRef: { current: { stopAsync: async () => {} } }, cancelListening() {}, stopTTS: async () => {} })],
    ['app/(engineA)/topic-quiz/[topicId].tsx', 'handleNext', (last) => ({ currentIndex: last ? 1 : 0, questions: [1, 2], sequenceCancelledRef: { current: false }, cancelListening() {}, stopAudio: async () => {}, stopTTS: async () => {}, scrollRef: { current: null }, nextQuestion() {} })],
    ['app/(engineB)/topic-quiz/[topicId].tsx', 'handleNext', (last) => ({ currentIndex: last ? 1 : 0, questions: [1, 2], ttsSpeakingRef: { current: true }, setTtsSpeaking() {}, stopAudio: async () => {}, stopTTS: async () => {}, scrollRef: { current: null }, nextQuestion() {} })],
    ['app/(engineA)/question/[id].tsx', 'handleNext', (last) => ({ qIndex: last ? 1 : 0, questions: [1, 2], navigateToQuestion: async () => {}, handleBack: async () => {}, stopAudio: async () => {} })],
  ];
  function makeNext(file, fnName, extraFn, last = true) {
    const events = [];
    const active = { current: true };
    let releaseAd; const adHold = new Promise(r => { releaseAd = r; });
    const env = Object.assign({
      module: { exports: null }, Promise, console: { warn() {}, log() {}, error() {} },
      activeRef: active, advancingRef: { current: false },
      setShowFeedback: v => events.push('feedback:' + v),
      maybeShowInterstitial: async (canShow) => { events.push('ad-asked'); events.canShow = canShow; await adHold; events.push('ad-closed'); },
      maybeShowLocationPrompt: async () => { events.push('location'); return false; },
    }, extraFn(last));
    const wrap = (name, f) => (...a) => { events.push(name); return f(...a); };
    for (const k of ['navigateToQuestion', 'nextQuestion', 'setQIndex', 'setPhase', 'handleBack']) {
      if (env[k]) { const orig = env[k]; env[k] = (...a) => { events.push(k); return orig(...a); }; }
    }
    const texts = { passAdGate: extract(file, 'passAdGate'), [fnName]: extract(file, fnName) };
    vm.runInNewContext(compile(texts), env);
    return { events, active, releaseAd, run: env.module.exports[fnName], env };
  }

  for (const [file, fnName, extraFn] of NEXT) {
    const short = file.replace('app/', '');
    await scenario(`R6-2 ${short}: at the END of the quiz the feedback is closed (speech stopped) BEFORE the ad is asked for`, async () => {
      const t = makeNext(file, fnName, extraFn);
      const p = t.run(); await tick();
      assert.ok(t.events.indexOf('feedback:false') >= 0 && t.events.indexOf('feedback:false') < t.events.indexOf('ad-asked'), JSON.stringify(t.events));
      assert.ok(!t.events.some(e => /^(navigateToQuestion|nextQuestion|setQIndex|setPhase)$/.test(e)), 'moved on while the ad was open: ' + JSON.stringify(t.events));
      t.releaseAd(); await p;
    });
    await scenario(`${short}: BETWEEN two questions nothing is shown: no ad is asked for, the next question opens at once`, async () => {
      const t = makeNext(file, fnName, extraFn, false);
      await t.run(); await tick();
      assert.ok(!t.events.includes('ad-asked'), 'an ad was asked for in the middle of a quiz: ' + JSON.stringify(t.events));
      assert.strictEqual(t.events.filter(e => /^(navigateToQuestion|nextQuestion|setQIndex)$/.test(e)).length, 1, JSON.stringify(t.events));
      assert.strictEqual(t.env.advancingRef.current, false);
    });
    await scenario(`R6-3 ${short}: two Next taps while the ad is open move on ONCE`, async () => {
      const t = makeNext(file, fnName, extraFn);
      const p1 = t.run(); const p2 = t.run(); await tick();
      t.releaseAd(); await Promise.all([p1, p2]); await tick();
      const moves = t.events.filter(e => /^(navigateToQuestion|nextQuestion|setQIndex|setPhase|handleBack)$/.test(e));
      assert.strictEqual(moves.length, 1, JSON.stringify(t.events));
      assert.strictEqual(t.env.advancingRef.current, false, 'the guard stayed on');
    });
    await scenario(`R6-4 ${short}: the learner left during the ad wait -> the old "next question" does not run, the guard is released`, async () => {
      const t = makeNext(file, fnName, extraFn);
      const p = t.run(); await tick();
      assert.strictEqual(typeof t.events.canShow, 'function', 'the ad was not given the still-on-this-screen check');
      t.active.current = false;                      // physical Back
      assert.strictEqual(t.events.canShow(), false);
      t.releaseAd(); await p; await tick();
      assert.ok(!t.events.some(e => /^(navigateToQuestion|nextQuestion|setQIndex|setPhase|location|handleBack)$/.test(e)), 'continued after the screen was left: ' + JSON.stringify(t.events));
      assert.strictEqual(t.env.advancingRef.current, false);
    });
  }

  for (const [s, n] of results) console.log(s, n);
  const bad = results.filter(r => r[0] === 'FAIL').length;
  console.log(`\n${results.length - bad} of ${results.length} scenarios passed`);
  process.exitCode = bad ? 1 : 0;
})().catch(e => { console.log('TEST ERROR', e); process.exitCode = 1; });
