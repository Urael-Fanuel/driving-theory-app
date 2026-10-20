// Logic test for the 🔊 buttons on the answers of the Engine A EXAM and TOPIC QUIZ screens, for sign
// questions (pre-recorded clips) and behavioral questions (spoken live). Same owner report as
// sign-replay-test.cjs (2026-10-14): quick taps on different speakers made the wrong answer start by itself.
// Loads the REAL screen files, the REAL hooks/useAudio.ts and the REAL utils/googleTTS.ts; React, the clock,
// the player and the network are stand-ins (tests/lib/screen-harness.cjs, tests/lib/engineA-world.cjs).
// NOT an Android test. Every expectation is an assertion; any failure exits with code 1.
// Timeline of the automatic reading (fake ms): question 0-3000, 1 s pause, then per answer its number
// (600 ms) and the answer (2000 ms): number_1 4000, a1 4600, number_2 6600, a2 7200, number_3 9200, a3 9800,
// number_4 11800, a4 12400, finished at 14400.
const path = require('path'), assert = require('assert');
const projectRoot = path.resolve(__dirname, '../../..');
const root = process.env.QA_SOURCE_ROOT || projectRoot;   // only the defect-put-back check sets this: a temp copy of the sources
const { setup } = require('./lib/engineA-world.cjs');

const KINDS = {
  sign:       { q: 'q',  q2: 'q2',  a: ['a1', 'a2', 'a3', 'a4'] },
  behavioral: { q: 'bq', q2: 'bq2', a: ['ba1', 'ba2', 'ba3', 'ba4'] },
};
const eq = (got, want, what) => assert.deepStrictEqual(got, want, what + ': ' + JSON.stringify(got));
const results = [];

async function scenario(screen, kind, name, fn) {
  const t = setup({ screen, kind, root, projectRoot });
  const K = KINDS[kind];
  try { await t.w.advance(200); await fn(t, K); results.push(['OK  ', `[${screen}/${kind}] ${name}`]); }
  catch (e) { results.push(['FAIL', `[${screen}/${kind}] ${name}  ->  ${e.message.split('\n')[0]}`]); }
  finally { t.view.unmount(); }
}

async function runAll(screen, kind) {
  const S = (name, fn) => scenario(screen, kind, name, fn);
  const FIN = 16000;

  await S('1 the automatic reading is question, then number and answer for each of the 4 answers', async (t, K) => {
    await t.w.advance(FIN);
    eq(t.w.playedNames(), [K.q, 'number_1', K.a[0], 'number_2', K.a[1], 'number_3', K.a[2], 'number_4', K.a[3]], 'reading');
  });

  await S('2 tap 🔊 after the reading finished -> only that answer; the next one does NOT start', async (t, K) => {
    await t.w.advance(FIN);
    const m = t.mark();
    t.tapSpeaker(0); await t.w.advance(8000);
    t.tapSpeaker(1); await t.w.advance(8000);
    eq(t.since(m), [K.a[0], K.a[1]], 'played after the taps');
    assert.strictEqual(t.highlight(), null, 'highlight left on a card');
  });

  await S('3 quick taps on different speakers (finished reading) -> each tapped answer plays once, the highlight follows the tap', async (t, K) => {
    await t.w.advance(FIN);
    const m = t.mark();
    t.tapSpeaker(0); await t.w.advance(300);
    eq([t.w.audible(), t.highlight()], [[K.a[0]], 0], 'after tap 1');
    t.tapSpeaker(2); await t.w.advance(300);
    eq([t.w.audible(), t.highlight()], [[K.a[2]], 2], 'after tap 2');
    t.tapSpeaker(1); await t.w.advance(300);
    eq([t.w.audible(), t.highlight()], [[K.a[1]], 1], 'after tap 3');
    await t.w.advance(15000);
    eq(t.since(m), [K.a[0], K.a[2], K.a[1]], 'played');
    assert.strictEqual(t.highlight(), null);
    assert.strictEqual(t.w.stat.maxLive, 1, 'two clips sounded at once');
  });

  await S('4 taps on all four speakers 100 ms apart -> only the last one is heard to the end, the reading does not start again', async (t, K) => {
    await t.w.advance(FIN);
    const m = t.mark();
    for (const i of [0, 1, 2, 3]) { t.tapSpeaker(i); await t.w.advance(100); }
    await t.w.advance(15000);
    eq(t.since(m).slice(-1), [K.a[3]], 'last clip');
    assert.ok(!t.since(m).some(n => /^number_/.test(n)), 'the reading started again: ' + JSON.stringify(t.since(m)));
    assert.strictEqual(t.w.stat.maxLive, 1);
  });

  await S('5 tap while the question is being read -> only the replay', async (t, K) => {
    await t.w.advanceUntil(() => t.w.audible()[0] === K.q);
    const m = t.mark();
    t.tapSpeaker(2); await t.w.advance(10000);
    eq(t.since(m), [K.a[2]], 'played after the tap');
  });

  await S('6 tap on answer 3 while answer 2 is read -> replay it, then the reading goes on after it (answer 4)', async (t, K) => {
    await t.w.advanceUntil(() => t.w.audible()[0] === K.a[1]);
    const m = t.mark();
    t.tapSpeaker(2); await t.w.advance(12000);
    eq(t.since(m), [K.a[2], 'number_4', K.a[3]], 'played after the tap');
  });

  await S('7 tap on answer 1 while answer 2 is read -> replay it, then the reading goes on from answer 2', async (t, K) => {
    await t.w.advanceUntil(() => t.w.audible()[0] === K.a[1]);
    const m = t.mark();
    t.tapSpeaker(0); await t.w.advance(16000);
    eq(t.since(m), [K.a[0], 'number_2', K.a[1], 'number_3', K.a[2], 'number_4', K.a[3]], 'played after the tap');
  });

  await S('8 tap while only the number of answer 2 was said -> replay it, then answer 2 is read again', async (t, K) => {
    await t.w.advanceUntil(() => t.w.audible()[0] === 'number_2');
    const m = t.mark();
    t.tapSpeaker(3); await t.w.advance(16000);
    eq(t.since(m), [K.a[3], 'number_2', K.a[1], 'number_3', K.a[2], 'number_4', K.a[3]], 'played after the tap');
  });

  await S('9 quick taps while the reading is on answer 2 -> every tap plays, the reading goes on ONCE, one voice at a time', async (t, K) => {
    await t.w.advanceUntil(() => t.w.audible()[0] === K.a[1]);
    const m = t.mark();
    t.tapSpeaker(2); await t.w.advance(300);
    eq([t.w.audible(), t.highlight()], [[K.a[2]], 2], 'after tap 1');
    t.tapSpeaker(0); await t.w.advance(300);
    eq([t.w.audible(), t.highlight()], [[K.a[0]], 0], 'after tap 2');
    await t.w.advance(20000);
    eq(t.since(m), [K.a[2], K.a[0], 'number_2', K.a[1], 'number_3', K.a[2], 'number_4', K.a[3]], 'played after the taps');
    assert.strictEqual(t.w.stat.maxLive, 1, 'two clips sounded at once');
  });

  await S('10 the learner chooses an answer while a replay is playing -> the replay stops, nothing else starts', async (t, K) => {
    await t.w.advance(FIN);
    const m = t.mark();
    t.tapSpeaker(0); await t.w.advance(500);
    t.chooseAnswer(1); await t.w.advance(8000);
    eq(t.since(m), [K.a[0]], 'played');
    eq(t.w.audible(), [], 'still sounding');
    assert.strictEqual(t.highlight(), null);
  });

  await S('11 next question during a replay (the tap cut the reading off in the middle) -> the new question is read from its start, not from answer 2', async (t, K) => {
    await t.w.advanceUntil(() => t.w.audible()[0] === K.a[1]);
    const m = t.mark();
    t.tapSpeaker(0); await t.w.advance(500);
    t.nextQuestion(); await t.w.advance(12000);
    eq(t.since(m).slice(0, 3), [K.a[0], K.q2, 'number_1'], 'played: ' + JSON.stringify(t.since(m)));
  });

  await S('12 two taps at the very same moment while an answer is read -> the LAST tap wins (never the older one)', async (t, K) => {
    await t.w.advanceUntil(() => t.w.audible()[0] === K.a[1]);
    const m = t.mark();
    t.tapSpeaker(0); t.tapSpeaker(2);                          // no time in between: the older one may be slower to get going
    await t.w.advance(20000);
    eq(t.since(m), [K.a[2], 'number_4', K.a[3]], 'played after the taps');
    assert.strictEqual(t.w.stat.maxLive, 1, 'two clips sounded at once');
  });

  await S('13 two taps at the very same moment while only a number is being said -> the LAST tap wins, then the answer is read again', async (t, K) => {
    await t.w.advanceUntil(() => t.w.audible()[0] === 'number_2');
    const m = t.mark();
    t.tapSpeaker(0); t.tapSpeaker(2);                          // the number clip has to be stopped first: the older tap is slower
    await t.w.advance(20000);
    eq(t.since(m), [K.a[2], 'number_2', K.a[1], 'number_3', K.a[2], 'number_4', K.a[3]], 'played after the taps');
    assert.strictEqual(t.w.stat.maxLive, 1, 'two clips sounded at once');
  });

  // The second tap comes a few steps after the first, when the older tap is in the middle of stopping what is
  // playing (the exact step depends on the screen, so several gaps are tried): the LAST tap must still win.
  for (const gap of [1, 2, 3, 4, 5, 6]) {
    await S(`14 a second tap ${gap} steps after the first, while the older tap is still stopping the reading -> the LAST tap wins`, async (t, K) => {
      await t.w.advanceUntil(() => t.w.audible()[0] === K.a[1]);
      const m = t.mark();
      t.tapSpeaker(0);
      for (let i = 0; i < gap; i++) await Promise.resolve();
      t.tapSpeaker(2);
      await t.w.advance(20000);
      eq(t.since(m), [K.a[2], 'number_4', K.a[3]], 'played after the taps');
      assert.strictEqual(t.w.stat.maxLive, 1, 'two clips sounded at once');
    });
  }

  // Known, NOT changed (owner's decision pending, see CODEX_FIX_REPORT R4.5): pressing the stop button
  // (pause) while a tapped answer is playing, with the reading cut off in the middle, stops the replay and
  // then the reading starts again by itself. It is the same family (a tap let go by something else resumes
  // the reading) and it is the same in the store version. Calling t.pressAudioButton() 500 ms into a replay
  // that cut the reading off at answer 2 shows it.
}

(async () => {
  for (const screen of ['topic', 'exam']) for (const kind of ['sign', 'behavioral']) await runAll(screen, kind);
  for (const [mark, name] of results) console.log(mark, name);
  const failed = results.filter(r => r[0] === 'FAIL').length;
  console.log(failed ? `\n${failed} FAILED` : '\nALL PASSED');
  process.exitCode = failed ? 1 : 0;
})().catch(e => { console.error(e); process.exitCode = 1; });
