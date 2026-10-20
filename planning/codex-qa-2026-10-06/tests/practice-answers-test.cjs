// Logic test (CODEX QA round 3, owner's decisions): answers and sign views are kept on the phone until
// the server has them. Loads the REAL hooks/useProgress.ts (one sign's questions and sign views),
// hooks/usePracticeWeak.ts (weak-question practice) and hooks/useExam.ts (the exam) with fake React,
// account, api and queue, and checks that each goes through utils/answerQueue (saveAnswerKept /
// saveSignViewKept), never straight to the server. The queue helpers themselves are tested in
// identity-queue-test.cjs (scenarios 20-27).
// NOT an Android test. Every expectation is an assertion; any failure exits with code 1.
const fs = require('fs'), vm = require('vm'), path = require('path'), assert = require('assert');
const root = path.resolve(__dirname, '../../..');
const ts = require(root + '/node_modules/typescript');
const USER = '11111111-1111-4111-8111-111111111111';

function load(file, useState) {
  const calls = { kept: [], views: [], direct: [], saving: [] };
  const react = { useState, useCallback: f => f, useRef: x => ({ current: x }), useEffect: () => {} };
  const deps = p =>
    p === 'react'                    ? react :
    p.endsWith('/EngineContext')     ? { useEngine: () => ({ userId: USER, engineType: 'A' }) } :
    p.endsWith('/answerQueue')       ? { saveAnswerKept: async (...a) => { calls.kept.push(a); },
                                         saveSignViewKept: async (...a) => { calls.views.push(a); } } :
    p.endsWith('/api')               ? { saveAnswer: async (...a) => { calls.direct.push(['saveAnswer', ...a]); return 'saved'; },
                                         recordSignView: async (...a) => { calls.direct.push(['recordSignView', ...a]); return 'saved'; },
                                         getUserProgress: async () => [], getUserSignViews: async () => [],
                                         getQuestionsByIds: async () => [], getRandomExamQuestions: async () => [] } :
    p.endsWith('/audioCache')        ? { prefetchQuestionAudio() {}, releaseQuestionAudio() {} } :
    p.endsWith('/googleTTS')         ? { collectTtsTexts: () => [], prefetchTtsForTexts: async () => {} } :
    p.endsWith('.json')              ? [] : {};
  const ctx = { exports: {}, console: { warn() {}, error() {}, log() {} }, process: { env: {} }, require: deps,
    __DEV__: false, setTimeout: fn => { fn(); return 0; }, clearTimeout() {}, setInterval: () => 0, clearInterval() {} };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(root + '/' + file, 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText, ctx);
  return { mod: ctx.exports, calls };
}

const results = [];
async function scenario(name, fn) {
  try { await fn(); results.push(['OK  ', name]); }
  catch (e) { results.push(['FAIL', name + '  ->  ' + e.message.split('\n')[0]]); }
}

(async () => {
  await scenario('1 one sign\'s questions (useProgress.recordAnswer): the answer is kept until saved', async () => {
    const w = load('hooks/useProgress.ts', x => [typeof x === 'function' ? x() : x, () => {}]);
    w.mod.useProgress().recordAnswer('q-301-1', '301', 'prohibitions', true);
    await new Promise(r => setImmediate(r));
    assert.deepStrictEqual(w.calls.kept, [[USER, 'q-301-1', true]], 'kept: ' + JSON.stringify(w.calls.kept));
    assert.deepStrictEqual(w.calls.direct, [], 'still sent straight to the server');
  });

  await scenario('2 weak-question practice (usePracticeWeak.submitAnswer): the answer is kept until saved', async () => {
    const question = { id: 'q-9', answers: [{ id: 'a', is_correct: false }, { id: 'b', is_correct: true }] };
    // useState call order in the hook: phase, queue, currentIndex, lastAnswerCorrect, selectedAnswerId, total
    const preset = ['question', [question], 0, null, null, 1]; let n = 0;
    const w = load('hooks/usePracticeWeak.ts', () => [preset[n++], () => {}]);
    w.mod.usePracticeWeak(['q-9']).submitAnswer('b');
    await new Promise(r => setImmediate(r));
    assert.deepStrictEqual(w.calls.kept, [[USER, 'q-9', true]], 'kept: ' + JSON.stringify(w.calls.kept));
    assert.deepStrictEqual(w.calls.direct, [], 'still sent straight to the server');
  });

  await scenario('3 a sign viewed (useProgress.markSignViewed, both engines): the view is kept until saved', async () => {
    const w = load('hooks/useProgress.ts', x => [typeof x === 'function' ? x() : x, () => {}]);
    const p = w.mod.useProgress();
    p.markSignViewed('814');             // Engine B: on opening the sign
    p.markSignViewed('301', true);       // Engine A: at the end of the sign's video / audio
    await new Promise(r => setImmediate(r));
    assert.deepStrictEqual(w.calls.views, [[USER, '814', false], [USER, '301', true]], 'kept: ' + JSON.stringify(w.calls.views));
    assert.deepStrictEqual(w.calls.direct, [], 'still sent straight to the server');
  });

  await scenario('4 the exam (useExam.submitAnswer): the same keeping, which also sends when the phone is full', async () => {
    const question = { id: 'q-1', topic_id: 'warning', answers: [{ id: 'A', is_correct: true }, { id: 'B', is_correct: false }] };
    // useState call order in the hook: phase, questions, currentIndex, answers, result, lastAnswerCorrect,
    // selectedAnswerId, elapsedSeconds, isSaving
    const preset = ['question', [question], 0, [], null, null, null, 0, false]; let n = 0; const saving = [];
    const w = load('hooks/useExam.ts', () => { const i = n++; return [preset[i], i === 8 ? v => saving.push(v) : () => {}]; });
    w.mod.useExam().submitAnswer('B');
    await new Promise(r => setImmediate(r));
    assert.deepStrictEqual(w.calls.kept, [[USER, 'q-1', false]], 'kept: ' + JSON.stringify(w.calls.kept));
    assert.deepStrictEqual(w.calls.direct, [], 'still sent without the shared keeping');
    assert.deepStrictEqual(saving, [true, false], 'the "saving" mark did not go back off: ' + JSON.stringify(saving));
  });

  for (const [mark, name] of results) console.log(mark, name);
  const failed = results.filter(r => r[0] === 'FAIL').length;
  console.log(failed ? `\n${failed} FAILED` : '\nALL PASSED');
  process.exitCode = failed ? 1 : 0;
})().catch(e => { console.error(e); process.exitCode = 1; });
