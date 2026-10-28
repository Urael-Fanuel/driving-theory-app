// QA round 8 (R8-A, R8-B and notes N5/N6): run against the REAL functions (extracted with the TypeScript parser)
// with controlled fakes. NOT a React or device test.
//   R8-A  Engine A "why?" reading: an old reading finishing late cannot clear the flag of a newer one
//   R8-B  Next onto an already answered question shows it answered (topic / daily quiz and exam, both engines),
//         and the feedback panel follows the question as well as the phase
//   N5/N6 Engine B behavioral shows the answer without awaiting; Engine B practice Next stops the explanation clip
// Run from anywhere:  node round8-fixes-test.cjs
const fs = require('fs'), vm = require('vm'), path = require('path'), assert = require('assert');
const root = path.resolve(__dirname, '../../..');
const ts = require(root + '/node_modules/typescript');
const read = f => fs.readFileSync(root + '/' + f, 'utf8');
const tick = async () => { for (let i = 0; i < 60; i++) await Promise.resolve(); };
const deferred = () => { let resolve; const p = new Promise(r => { resolve = r; }); return { p, resolve }; };

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

const results = [];
async function scenario(name, fn) {
  try { await fn(); results.push(['OK  ', name]); } catch (e) { results.push(['FAIL', name + '  ->  ' + String(e.message).split('\n')[0]]); }
}

(async () => {
  // ================= R8-A =================
  await scenario('R8-A Engine A "why?": start, stop, start again, the FIRST reading ends late -> the second keeps its flag (unmount still stops it)', async () => {
    const pend = [];
    const env = {
      module: { exports: null }, Promise, console: { warn() {}, log() {}, error() {} },
      ragQuery: { q: 1 }, ragLoading: false, audioInterrupted: false, resumeInterruptedAudio() {},
      ragSpeakingRef: { current: false }, ragOp: { current: 0 }, ragTextRef: { current: 'explanation' }, mountedRef: { current: true },
      setRagSpeaking() {}, setRagLoading() {}, fetchWrongAnswerExplanation: async () => 'explanation',
      stopTTS: async () => {}, speakLongAndAwait: () => { const d = deferred(); pend.push(d); return d.p; },
    };
    vm.runInNewContext(compile({ handleExplainWhy: extract('components/engineA/AudioFeedback.tsx', 'handleExplainWhy') }), env);
    const h = env.module.exports.handleExplainWhy;
    const a = h(); await tick();           // reading 1 (its speech promise stays pending: slow network)
    await h();                             // tap again = stop
    const b = h(); await tick();           // reading 2
    assert.strictEqual(env.ragSpeakingRef.current, true);
    pend[0].resolve(); await a; await tick();   // reading 1 finishes LATE
    assert.strictEqual(env.ragSpeakingRef.current, true, 'the old reading cleared the flag: the unmount would not stop the new one');
    pend[1].resolve(); await b; await tick();
    assert.strictEqual(env.ragSpeakingRef.current, false, 'a reading that ends normally must clear its own flag');
  });

  // ================= R8-B (1): nextQuestion of the two hooks =================
  for (const [file, isAsync] of [['hooks/useTopicQuiz.ts', false], ['hooks/useExam.ts', true]]) {
    await scenario(`R8-B ${file}: Next onto an ANSWERED question shows it answered; onto an unanswered one opens it`, async () => {
      const run = async (answers, currentIndex) => {
        const st = {};
        const env = {
          module: { exports: null }, Promise, console: { warn() {}, log() {}, error() {} },
          currentIndex, questions: [{ id: 'q1' }, { id: 'q2' }, { id: 'q3' }], answersRef: { current: answers },
          setSelectedAnswerId: v => { st.selected = v; }, setLastAnswerCorrect: v => { st.correct = v; },
          setCurrentIndex: v => { st.index = v; }, setPhase: v => { st.phase = v; },
          setResult() {}, finishExam: async () => {}, releaseQuestionAudio: async () => {}, prefetchQuestionAudio() {},
          PASS_THRESHOLD_PCT: 0.7,
        };
        vm.runInNewContext(compile({ nextQuestion: extract(file, 'nextQuestion') }), env);
        await env.module.exports.nextQuestion();
        return st;
      };
      const answered = await run([{ questionId: 'q1', selectedAnswerId: 'a', isCorrect: true }, { questionId: 'q2', selectedAnswerId: 'b', isCorrect: false }], 0);
      assert.deepStrictEqual(answered, { selected: 'b', correct: false, index: 1, phase: 'feedback_wrong' }, 'answered next question: ' + JSON.stringify(answered));
      const open = await run([{ questionId: 'q1', selectedAnswerId: 'a', isCorrect: true }], 0);
      assert.strictEqual(open.phase, 'question'); assert.strictEqual(open.index, 1); assert.strictEqual(open.selected, null);
    });
  }

  // ================= R8-B (2): the panel follows the question too =================
  await scenario('R8-B the feedback panel effect is keyed on the question as well as the phase (4 screens)', async () => {
    for (const f of ['app/(engineA)/topic-quiz/[topicId].tsx', 'app/(engineA)/(tabs)/exam.tsx', 'app/(engineB)/topic-quiz/[topicId].tsx', 'app/(engineB)/(tabs)/exam.tsx']) {
      const s = read(f);
      const i = s.indexOf("if (phase === 'feedback_correct' || phase === 'feedback_wrong') {");
      assert.ok(i > 0, f);
      const effEnd = s.indexOf('}, [', i);
      assert.ok(s.slice(effEnd, effEnd + 30).startsWith('}, [phase, currentIndex]);'), f + ': the panel effect still depends on the phase only');
    }
    const ex = read('app/(engineB)/(tabs)/exam.tsx');
    assert.ok(/useEffect\(\(\) => \{ advancedRef\.current = false; \}, \[phase, currentIndex\]\);/.test(ex), 'B exam Next guard must open again on every move');
    const pr = read('app/(engineB)/practice.tsx');
    assert.ok(/useEffect\(\(\) => \{ if \(phase === 'question' \|\| phase === 'done'\) advancedRef\.current = false; \}, \[phase\]\);/.test(pr), 'B practice Next guard must open again');
  });

  // ================= N5 / N6 =================
  await scenario('N5 Engine B behavioral: the answer and its panel are shown before anything is awaited', async () => {
    let shownBeforeAwait = null; const hold = deferred();
    const env = {
      module: { exports: null }, Promise, console: { warn() {}, log() {}, error() {} },
      selectedAnswer: null, currentQ: { answers: [{ is_correct: true, text_amharic: 'x' }] }, answerLockedRef: { current: false },
      ttsSpeakingRef: { current: true }, setTtsSpeaking() {}, stopTTS: () => hold.p,
      Haptics: { impactAsync: () => hold.p, ImpactFeedbackStyle: { Light: 1 } },
      setSelectedAnswer() {}, countAnsweredQuestion() {}, setFeedbackText() {}, randomPraise: () => 'ok',
      setShowFeedback: v => { if (v) shownBeforeAwait = true; },
    };
    vm.runInNewContext(compile({ handleAnswerSelect: extract('app/(engineB)/behavioral-subtopic/[id].tsx', 'handleAnswerSelect') }), env);
    env.module.exports.handleAnswerSelect(0);       // stopTTS and the haptic stay pending
    assert.strictEqual(shownBeforeAwait, true, 'the panel waited for the speech stop / haptic');
    hold.resolve();
  });

  await scenario('N6 Engine B practice: Next stops the explanation clip', async () => {
    let stops = 0, nexts = 0;
    const env = { module: { exports: null }, Promise, advancedRef: { current: false }, setShowFeedback() {},
      stopAudio: async () => { stops++; }, nextQuestion: () => { nexts++; } };
    vm.runInNewContext(compile({ handleNext: extract('app/(engineB)/practice.tsx', 'handleNext') }), env);
    env.module.exports.handleNext();
    assert.strictEqual(stops, 1); assert.strictEqual(nexts, 1);
  });

  // ================= R8-C: the exam is finished and saved once =================
  await scenario('R8-C useExam.nextQuestion at the last question: Next, Next (slow save) finishes the exam ONCE', async () => {
    let finished = 0; const hold = deferred();
    const env = {
      module: { exports: null }, Promise, console: { warn() {}, log() {}, error() {} },
      currentIndex: 29, questions: new Array(30).fill({ id: 'q' }), answersRef: { current: [] }, finishingRef: { current: false },
      setSelectedAnswerId() {}, setLastAnswerCorrect() {}, setCurrentIndex() {}, setPhase() {}, prefetchQuestionAudio() {},
      finishExam: () => { finished++; return hold.p; },
    };
    vm.runInNewContext(compile({ nextQuestion: extract('hooks/useExam.ts', 'nextQuestion') }), env);
    const a = env.module.exports.nextQuestion(); const b = env.module.exports.nextQuestion(); await tick();
    assert.strictEqual(finished, 1, 'the exam was finished ' + finished + ' times (saved twice)');
    hold.resolve(); await Promise.all([a, b]);
  });
  await scenario('R8-C the finishing guard opens again when a new exam is loaded', async () => {
    const s = read('hooks/useExam.ts');
    assert.ok(/async function loadQuestions\(\) \{\s*finishingRef\.current = false;/.test(s));
  });

  // ================= R8-D: Engine A speaks the feedback of the question on screen =================
  function extractEffect(file, mustInclude) {
    const src = read(file);
    const sf = ts.createSourceFile(file, src, ts.ScriptTarget.ES2020, true, ts.ScriptKind.TSX);
    let found = null;
    const visit = n => {
      if (!found && ts.isCallExpression(n) && n.expression.getText(sf) === 'useEffect' && n.arguments[0] && mustInclude.every(m => n.arguments[0].getText(sf).includes(m))) found = n.arguments[0].getText(sf);
      ts.forEachChild(n, visit);
    };
    visit(sf);
    assert.ok(found, file + ': effect not found');
    return found;
  }
  for (const file of ['app/(engineA)/topic-quiz/[topicId].tsx', 'app/(engineA)/(tabs)/exam.tsx']) {
    await scenario(`R8-D ${file}: the spoken feedback is built from the question on screen when the panel opens; the 300 ms timer is cancelled by a move`, async () => {
      let said = null; let timers = []; let cleared = 0;
      const mk = (qId, correct) => ({
        module: { exports: null }, Promise, console: { warn() {}, log() {}, error() {} },
        phase: correct ? 'feedback_correct' : 'feedback_wrong', lastAnswerCorrect: correct,
        currentQuestion: { id: qId, sign_id: '', answers: [{ id: 'ok', is_correct: true, text_amharic: 'RIGHT-' + qId }, { id: 'bad', is_correct: false, text_amharic: 'x' }] },
        selectedAnswerId: correct ? 'ok' : 'bad',
        randomPraise: () => 'PRAISE', setFeedbackTTSText: v => { said = v; }, setShowFeedback: () => {},
        setTimeout: fn => { timers.push(fn); return timers.length; }, clearTimeout: () => { cleared++; },
      });
      // evaluate the effect function under the fake environment
      const evalEffect = env => { const code = ts.transpileModule('module.exports = ' + extractEffect(file, ['feedback_correct', 'setFeedbackTTSText']) + ';', { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText; vm.runInNewContext(code, env); return env.module.exports(); };
      const cleanup = evalEffect(mk('q1', false));        // the question on screen was answered WRONG
      assert.strictEqual(said, 'ስህተት! ትክክለኛው መልስ: RIGHT-q1', 'the voice would speak: ' + said);
      evalEffect(mk('q2', true));                          // another question, answered right
      assert.strictEqual(said, 'PRAISE RIGHT-q2');
      assert.strictEqual(typeof cleanup, 'function'); cleanup(); assert.strictEqual(cleared, 1, 'the timer is not cancelled by a move');
    });
  }

  // ================= owner: the "ቀጣይ ›" label is readable =================
  await scenario('Engine B feedback "ቀጣይ ›": white label (contrast >= 4.5 on both panel colours), border and the rest of the button unchanged', async () => {
    const tf = read('components/engineB/TextFeedback.tsx');
    const lum = h => { h = h.replace('#', ''); const [r, g, b] = [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16) / 255).map(c => c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
    const cr = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
    const colors = read('constants/colors.ts');
    const get = k => (colors.match(new RegExp(k + ':\\s*\'(#[0-9A-Fa-f]{6})\'')) || [])[1];
    for (const k of ['correctDark', 'wrongDark']) assert.ok(cr('#FFFFFF', get(k)) >= 4.5, k + ' contrast too low');
    const style = tf.slice(tf.indexOf('nextButtonText: {'), tf.indexOf('});', tf.indexOf('nextButtonText: {')));
    assert.ok(/color:\s*'#FFFFFF'/.test(style), 'the label is not white');
    assert.ok(/<Text style=\{styles\.nextButtonText\}>/.test(tf) && !/nextButtonText, \{ color: borderColor/.test(tf), 'the label still takes the border colour');
    assert.ok(/style=\{\[styles\.nextButton, \{ borderColor \}\]\}/.test(tf), 'the border colour must stay');
  });

  // ================= gaps the QA agent found in the tests (cheap closures) =================
  await scenario('R8-D the 300 ms delay before the Engine A overlay is unchanged, and only BEHAVIORAL questions get a rebuilt spoken text', async () => {
    for (const file of ['app/(engineA)/topic-quiz/[topicId].tsx', 'app/(engineA)/(tabs)/exam.tsx']) {
      const eff = (() => { const src = read(file); const i = src.indexOf('the spoken feedback of a behavioral question is built HERE'.replace('the', 'The')); assert.ok(i > 0, file); return src.slice(i, src.indexOf('}, [phase, currentIndex]);', i)); })();
      assert.ok(/setTimeout\(\(\) => setShowFeedback\(true\), 300\)/.test(eff), file + ': the 300 ms delay changed');
      assert.ok(/if \(currentQuestion && !currentQuestion\.sign_id\) \{/.test(eff), file + ': sign questions must not get a rebuilt text');
    }
  });
  await scenario('label fix leaves the rest of the Next button as it was (border 2, radius 16, padding 14/40, stretch)', async () => {
    const tf = read('components/engineB/TextFeedback.tsx');
    const st = tf.slice(tf.indexOf('  nextButton: {'), tf.indexOf('  nextButtonText: {'));
    for (const re of [/borderWidth:\s*2,/, /borderRadius:\s*16,/, /paddingVertical:\s*14,/, /paddingHorizontal:\s*40,/, /alignSelf:\s*'stretch',/, /marginTop:\s*8,/])
      assert.ok(re.test(st), 'nextButton style changed: ' + re);
  });

  for (const [s, n] of results) console.log(s, n);
  const bad = results.filter(r => r[0] === 'FAIL').length;
  console.log(`\n${results.length - bad} of ${results.length} scenarios passed`);
  process.exitCode = bad ? 1 : 0;
})().catch(e => { console.log('TEST ERROR', e); process.exitCode = 1; });
