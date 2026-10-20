// Logic test for the 🔊 buttons on the answers of the sign questions screen of Engine A
// (app/(engineA)/question/[id].tsx). Owner's report 2026-10-14: tapping 🔊 on answer 1 made answer 2
// start, answer 2 made 3 start, and quick taps on different speakers read the wrong answer.
// Loads the REAL screen file and the REAL audio engine (hooks/useAudio.ts); React, the clock and the
// player are stand-ins (tests/lib/screen-harness.cjs): a clip lasts a set time, the learner "taps" by
// calling the buttons' own onAudioPress / onPress props. NOT an Android test.
// Timeline of the automatic reading (fake ms): question 1000-4000, then per answer its number (600 ms)
// and the answer (2000 ms): number_1 4300, a1 4900, number_2 6900, a2 7500, number_3 9500, a3 10100,
// number_4 12100, a4 12700, finished at 14700.
// Every expectation is an assertion; any failure exits with code 1.
const path = require('path'), assert = require('assert');
const projectRoot = path.resolve(__dirname, '../../..');
const root = process.env.QA_SOURCE_ROOT || projectRoot;   // only the defect-put-back check sets this: a temp copy of the sources
const { createWorld } = require('./lib/screen-harness.cjs');

const clipMs = n => /^q\d?$/.test(n) ? 3000 : /^number_/.test(n) ? 600 : /^[ab]\d$/.test(n) ? 2000 : 1000;
const mkQuestion = (n, prefix) => ({ id: `301_q${n}`, sign_id: '301', topic_id: 't', question_audio_url: `https://cdn/q${n === 1 ? '' : n}.mp3`,
  answers: [1, 2, 3, 4].map(k => ({ id: 'A' + k, audio_url: `https://cdn/${prefix}${k}.mp3`, image_url: 'img', is_correct: k === 1 })) });
const QUESTIONS = [mkQuestion(1, 'a'), mkQuestion(2, 'b')];
const SIGN = { id: '301', topic_id: 't', display_order: 1, image_url: 'x' };
const VOICE = { voiceState: 'idle', startListening: async () => {}, stopListening: async () => {}, cancelListening() {} };   // stable, like the real hook

function setup() {
  const w = createWorld({ root, tsRoot: projectRoot, clipMs, real: ['hooks/useAudio.ts'], stubs: (spec, relFile) => {
    const rel = relFile && relFile.replace(/\.tsx?$/, '');   // by name, without .ts / .tsx
    const RN = new Proxy({}, { get: (t, k) => k === 'StyleSheet' ? { create: x => x, absoluteFill: {}, absoluteFillObject: {}, hairlineWidth: 1, flatten: x => x }
      : k === 'Dimensions' ? { get: () => ({ width: 400, height: 800 }) } : k === 'BackHandler' ? { addEventListener: () => ({ remove() {} }) }
      : k === 'Platform' ? { OS: 'android', select: o => o.android ?? o.default } : w.stubModule() });
    if (spec === 'react-native') return RN;
    if (spec === 'expo-router') return { useLocalSearchParams: () => ({ id: '301' }), useRouter: () => ({ replace() {}, push() {}, back() {} }), useFocusEffect: cb => w.R.useEffect(() => cb(), [cb]) };
    if (spec === 'expo-haptics') return { selectionAsync: async () => {}, notificationAsync: async () => {}, NotificationFeedbackType: { Success: 1, Error: 2 } };
    if (rel === 'services/sound') return { Sound: w.Sound, applyAudioMode: async () => {}, isAudioInterrupted: () => false, onAudioInterruptedChange: () => () => {}, resumeInterruptedAudio() {} };
    if (rel === 'backend/supabaseClient') return { getStorageUrl: (b, f) => 'https://cdn/' + f, BUCKETS: { AUDIO: 'audio' } };
    if (rel === 'services/audioCache') return { getLocalAudioUri: async u => u, discardCachedCopy: async () => {}, prefetchSignAudio: async () => {} };
    if (rel === 'services/errorReporter') return { reportError() {}, watchPlaybackStart() {}, describeUri: () => ({}) };
    if (rel === 'backend/api') return { getSignsFromCache: () => [SIGN], getQuestionsFromCache: () => QUESTIONS, getAllSigns: async () => [SIGN], getQuestionsBySign: async () => QUESTIONS };
    if (rel === 'hooks/useProgress') return { useProgress: () => ({ recordAnswer() {} }) };
    if (rel === 'hooks/useVoiceRecognition') return { useVoiceRecognition: () => VOICE };
    if (rel === 'hooks/useLocationPrompt') return { useLocationPrompt: () => ({ visible: false, maybeShow: async () => false, handleApprove() {}, handleNotNow() {} }) };
    if (rel === 'contexts/EngineContext') return { useEngine: () => ({ userId: 'u', engineType: 'A' }) };
    if (rel === 'utils/signNumber') return { extractSignNumber: () => '301', shouldShowSignBadge: () => false };
    return undefined;
  } });
  const screen = w.mount('app/(engineA)/question/[id].tsx');
  const cards = () => screen.find(n => 'cardState' in n.props);
  const buttons = () => screen.find(n => typeof n.props.onPress === 'function' && n.props.accessibilityLabel);
  return {
    w, screen,
    tapSpeaker: i => cards()[i].props.onAudioPress(),
    chooseAnswer: i => cards()[i].props.onPress(),
    nextQuestion: () => buttons()[2].props.onPress(),   // order: back, previous question, NEXT question, previous sign, ▶️, next sign
    highlight: () => { const c = cards().map(x => x.props.cardState); const i = c.indexOf('reading'); return i < 0 ? null : i; },
    since: m => w.playedNames().slice(m),
    mark: () => w.played.length,
  };
}

const results = [];
async function scenario(name, fn) {
  const t = setup();
  try { await t.w.advance(200); await fn(t); results.push(['OK  ', name]); }
  catch (e) { results.push(['FAIL', name + '  ->  ' + e.message.split('\n')[0]]); }
  finally { t.screen.unmount(); }
}
const FINISHED = 16000;   // the automatic reading has played out
const eq = (got, want, what) => assert.deepStrictEqual(got, want, what + ': ' + JSON.stringify(got));

(async () => {
  await scenario('1 test setup: the automatic reading is question, then number and answer for each of the 4 answers', async t => {
    await t.w.advance(FINISHED);
    eq(t.w.playedNames(), ['q', 'number_1', 'a1', 'number_2', 'a2', 'number_3', 'a3', 'number_4', 'a4'], 'reading');
    assert.strictEqual(t.screen.find(n => 'cardState' in n.props).length, 4);
  });

  await scenario('2 owner report: tap 🔊 on answer 1 after the reading finished -> only answer 1, answer 2 does NOT start', async t => {
    await t.w.advance(FINISHED);
    const m = t.mark();
    t.tapSpeaker(0); await t.w.advance(8000);
    eq(t.since(m), ['a1'], 'played after the tap');
    assert.strictEqual(t.highlight(), null, 'highlight left on a card');
    eq(t.w.audible(), [], 'still sounding');
  });

  await scenario('3 owner report: then 🔊 on answer 2 -> only answer 2 (answer 3 does NOT start), then 🔊 on answer 3 -> only answer 3', async t => {
    await t.w.advance(FINISHED);
    const m = t.mark();
    t.tapSpeaker(1); await t.w.advance(8000);
    t.tapSpeaker(2); await t.w.advance(8000);
    eq(t.since(m), ['a2', 'a3'], 'played');
  });

  await scenario('4 owner report: quick taps on different speakers -> each tapped answer plays once, the highlight follows the tap', async t => {
    await t.w.advance(FINISHED);
    const m = t.mark();
    t.tapSpeaker(0); await t.w.advance(300);
    eq([t.w.audible(), t.highlight()], [['a1'], 0], 'after tap 1');
    t.tapSpeaker(2); await t.w.advance(300);
    eq([t.w.audible(), t.highlight()], [['a3'], 2], 'after tap 2 (the owner saw answer 4 here)');
    t.tapSpeaker(1); await t.w.advance(300);
    eq([t.w.audible(), t.highlight()], [['a2'], 1], 'after tap 3');
    await t.w.advance(15000);
    eq(t.since(m), ['a1', 'a3', 'a2'], 'played');
    assert.strictEqual(t.highlight(), null);
    assert.strictEqual(t.w.stat.maxLive, 1, 'two clips sounded at once');
  });

  await scenario('5 taps on all four speakers one after another, 100 ms apart -> only the last one is heard to the end', async t => {
    await t.w.advance(FINISHED);
    const m = t.mark();
    for (const i of [0, 1, 2, 3]) { t.tapSpeaker(i); await t.w.advance(100); }
    await t.w.advance(15000);
    eq(t.since(m).slice(-1), ['a4'], 'last clip');
    assert.ok(!t.since(m).some(n => /^number_/.test(n)), 'the reading started again: ' + JSON.stringify(t.since(m)));
    assert.strictEqual(t.w.stat.maxLive, 1);
  });

  await scenario('6 tap on 🔊 while the question is being read -> only the replay (same as the other topics)', async t => {
    await t.w.advance(2500);                                   // question playing
    const m = t.mark();
    t.tapSpeaker(2); await t.w.advance(10000);
    eq(t.since(m), ['a3'], 'played after the tap');
  });

  await scenario('7 tap on answer 3 while answer 2 is read -> replay it, then the reading goes on after it (answer 4)', async t => {
    await t.w.advance(8000);                                   // answer 2 is playing, its number was said
    const m = t.mark();
    t.tapSpeaker(2); await t.w.advance(12000);
    eq(t.since(m), ['a3', 'number_4', 'a4'], 'played after the tap');
  });

  await scenario('8 tap on answer 1 while answer 2 is read -> replay it, then the reading goes on from answer 2', async t => {
    await t.w.advance(8000);
    const m = t.mark();
    t.tapSpeaker(0); await t.w.advance(16000);
    eq(t.since(m), ['a1', 'number_2', 'a2', 'number_3', 'a3', 'number_4', 'a4'], 'played after the tap');
  });

  await scenario('9 tap while only the number of answer 2 was said -> replay it, then answer 2 is read again', async t => {
    await t.w.advance(7000);                                   // number_2 is playing, the answer has not started
    const m = t.mark();
    t.tapSpeaker(3); await t.w.advance(16000);
    eq(t.since(m), ['a4', 'number_2', 'a2', 'number_3', 'a3', 'number_4', 'a4'], 'played after the tap');
  });

  await scenario('10 quick taps while the reading is on answer 2 -> every tap plays, the reading goes on ONCE, one voice at a time', async t => {
    await t.w.advance(8000);
    const m = t.mark();
    t.tapSpeaker(2); await t.w.advance(300);
    eq([t.w.audible(), t.highlight()], [['a3'], 2], 'after tap 1');
    t.tapSpeaker(0); await t.w.advance(300);
    eq([t.w.audible(), t.highlight()], [['a1'], 0], 'after tap 2');
    await t.w.advance(20000);
    eq(t.since(m), ['a3', 'a1', 'number_2', 'a2', 'number_3', 'a3', 'number_4', 'a4'], 'played after the taps');
    assert.strictEqual(t.w.stat.maxLive, 1, 'two clips sounded at once');
  });

  await scenario('11 tap on the LAST answer while the reading is on it -> replay it, nothing more to read', async t => {
    await t.w.advance(13500);                                  // a4 is playing
    const m = t.mark();
    t.tapSpeaker(3); await t.w.advance(8000);
    eq(t.since(m), ['a4'], 'played after the tap');
  });

  await scenario('12 the learner chooses an answer while a replay is playing -> the replay stops, nothing else starts', async t => {
    await t.w.advance(FINISHED);
    const m = t.mark();
    t.tapSpeaker(0); await t.w.advance(500);
    t.chooseAnswer(1); await t.w.advance(8000);
    eq(t.since(m), ['a1'], 'played');
    eq(t.w.audible(), [], 'still sounding');
    assert.strictEqual(t.highlight(), null);
  });

  await scenario('13 the learner goes to the next question while a replay is playing (reading had finished) -> the new question is read from its start', async t => {
    await t.w.advance(FINISHED);
    const m = t.mark();
    t.tapSpeaker(0); await t.w.advance(500);
    t.nextQuestion(); await t.w.advance(6000);
    eq(t.since(m).slice(0, 3), ['a1', 'q2', 'number_1'], 'played: ' + JSON.stringify(t.since(m)));
  });

  await scenario('14 the same, but the tap cut the reading off in the middle: the new question is still read from its start, not from answer 2', async t => {
    await t.w.advance(8000);                                   // answer 2 of the first question is being read
    const m = t.mark();
    t.tapSpeaker(0); await t.w.advance(500);
    t.nextQuestion(); await t.w.advance(12000);
    eq(t.since(m).slice(0, 3), ['a1', 'q2', 'number_1'], 'played: ' + JSON.stringify(t.since(m)));
    assert.ok(!t.since(m).includes('number_2') || t.since(m).indexOf('number_2') > t.since(m).indexOf('number_1'), 'answer 2 came before answer 1');
  });

  await scenario('15 a tap in the middle of the new question\'s reading after moving on still works as in scenarios 7-9', async t => {
    await t.w.advance(FINISHED);
    t.nextQuestion(); await t.w.advance(8000);                 // second question: its answer 2 is being read (about 1.1 s later than the first's timeline)
    const m = t.mark();
    t.tapSpeaker(0); await t.w.advance(16000);
    assert.strictEqual(t.since(m)[0], 'b1', 'the replay is of the new question: ' + JSON.stringify(t.since(m)));
    assert.ok(t.since(m).slice(1).every(n => /^number_|^b/.test(n)), 'something of the old question played: ' + JSON.stringify(t.since(m)));
  });

  await scenario('16 two taps at the very same moment, and a second tap a few steps after the first -> the LAST tap wins', async t => {
    await t.w.advance(8000);                                   // answer 2 is being read
    let m = t.mark();
    t.tapSpeaker(0); t.tapSpeaker(2);
    await t.w.advance(12000);
    eq(t.since(m), ['a3', 'number_4', 'a4'], 'same moment');
    for (const gap of [1, 3, 5, 8]) {
      m = t.mark();
      t.tapSpeaker(1);
      for (let i = 0; i < gap; i++) await Promise.resolve();
      t.tapSpeaker(3);
      await t.w.advance(3000);
      eq(t.since(m), ['a4'], gap + ' steps later');
    }
    assert.strictEqual(t.w.stat.maxLive, 1, 'two clips sounded at once');
  });

  for (const [mark, name] of results) console.log(mark, name);
  const failed = results.filter(r => r[0] === 'FAIL').length;
  console.log(failed ? `\n${failed} FAILED` : '\nALL PASSED');
  process.exitCode = failed ? 1 : 0;
})().catch(e => { console.error(e); process.exitCode = 1; });
