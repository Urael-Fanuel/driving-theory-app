// Logic test for the Engine A SIGN screen (app/(engineA)/sign/[id].tsx): the official name clip, then the
// explanation clip. Owner's report 2026-10-25: going into the questions while the NAME was being read
// let the screen (still mounted underneath) start the EXPLANATION ("ይህ ምልክት..."), which the question
// then cut off a second later. Loads the REAL screen and the REAL audio engine (hooks/useAudio.ts) with
// the shared fake React / clock / player (tests/lib/screen-harness.cjs). NOT an Android test.
// Every expectation is an assertion; any failure exits with code 1.
const path = require('path'), assert = require('assert');
const projectRoot = path.resolve(__dirname, '../../..');
const root = process.env.QA_SOURCE_ROOT || projectRoot;
const { createWorld } = require('./lib/screen-harness.cjs');

const clipMs = n => n === 'name1' ? 1500 : n === 'expl1' ? 3000 : 3000;
const SIGN = { id: '301', topic_id: 't', display_order: 1, image_url: 'x',
  audio_name_url: 'https://cdn/name1.mp3', audio_explanation_url: 'https://cdn/expl1.mp3' };

function setup() {
  const w = createWorld({ root, tsRoot: projectRoot, clipMs, real: ['hooks/useAudio.ts'], stubs: (spec, relFile) => {
    const rel = relFile && relFile.replace(/\.tsx?$/, '');
    const RN = new Proxy({}, { get: (t, k) => k === 'StyleSheet' ? { create: x => x, absoluteFill: {}, absoluteFillObject: {}, hairlineWidth: 1, flatten: x => x }
      : k === 'Animated' ? { Value: class { constructor(v) { this.v = v; } setValue() {} stopAnimation() {} }, View: 'Animated.View',
          timing: () => ({ start() {} }), loop: () => ({ start() {} }), sequence: () => ({ start() {} }), parallel: () => ({ start() {} }) }
      : k === 'Dimensions' ? { get: () => ({ width: 400, height: 800 }) } : k === 'BackHandler' ? { addEventListener: () => ({ remove() {} }) }
      : k === 'Platform' ? { OS: 'android', select: o => o.android ?? o.default } : w.stubModule() });
    if (spec === 'react-native') return RN;
    if (spec === 'react-native-safe-area-context') return { useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) };
    if (spec === 'expo-router') return { useLocalSearchParams: () => ({ id: '301' }), useRouter: () => ({ replace() {}, push() {}, back() {} }),
      // focus: runs on mount, its cleanup is the "blur" a test triggers by pushing the next screen
      useFocusEffect: cb => w.R.useEffect(() => cb(), [cb]) };
    if (spec === 'expo-haptics') return { selectionAsync: async () => {}, impactAsync: async () => {}, notificationAsync: async () => {}, ImpactFeedbackStyle: { Medium: 1 }, NotificationFeedbackType: { Success: 1, Error: 2 } };
    if (rel === 'services/sound') return { Sound: w.Sound, applyAudioMode: async () => {}, isAudioInterrupted: () => false, onAudioInterruptedChange: () => () => {}, resumeInterruptedAudio() {} };
    if (rel === 'backend/supabaseClient') return { getStorageUrl: (b, f) => 'https://cdn/' + f, BUCKETS: { AUDIO: 'audio' } };
    if (rel === 'services/audioCache') return { getLocalAudioUri: async u => u, discardCachedCopy: async () => {}, prefetchSignAudio: async () => {} };
    if (rel === 'services/errorReporter') return { reportError() {}, watchPlaybackStart() {}, describeUri: () => ({}) };
    if (rel === 'backend/api') return { getSignsFromCache: () => [SIGN], getQuestionsFromCache: () => [], getAllSigns: async () => [SIGN], getQuestionsBySign: async () => [] };
    if (rel === 'hooks/useProgress') return { useProgress: () => ({ markSignViewed() {}, recordAnswer() {} }) };
    if (rel === 'utils/signNumber') return { extractSignNumber: () => '301', shouldShowSignBadge: () => false };
    return undefined;
  } });
  const screen = w.mount('app/(engineA)/sign/[id].tsx');
  const audio = w.loadFile(path.join(root, 'hooks/useAudio.ts'));
  const quizButton = () => screen.find(n => n.props && n.props.accessibilityLabel === 'ጥያቄ ጀምር')[0];
  return { w, screen, audio, quizButton };
}

const results = [];
async function scenario(name, fn) {
  try { await fn(setup()); results.push(['OK  ', name]); }
  catch (e) { results.push(['FAIL', name + '  ->  ' + String(e.message).split('\n')[0]]); }
}

(async () => {
  await scenario('1 the name is read first, then the explanation', async (t) => {
    await t.w.advance(6000);
    assert.deepStrictEqual(t.w.playedNames().filter(n => n === 'name1' || n === 'expl1'), ['name1', 'expl1']);
  });

  await scenario('2 into the questions during the NAME: the explanation never starts, only the question is heard', async (t) => {
    await t.w.advanceUntil(() => t.w.audible()[0] === 'name1');
    t.quizButton().props.onPress();                         // the learner goes into the questions
    // the question screen: stops what is playing and reads its question
    t.audio.playAndAwaitAudio('https://cdn/q1.mp3', () => false);
    await t.w.advance(6000);
    assert.ok(!t.w.playedNames().includes('expl1'), 'explanation started: ' + t.w.playedNames().join(' '));
    assert.ok(t.w.playedNames().includes('q1'), 'question not heard: ' + t.w.playedNames().join(' '));
  });

  await scenario('3 leaving by another way (the screen loses focus) during the name: no explanation either', async (t) => {
    await t.w.advanceUntil(() => t.w.audible()[0] === 'name1');
    t.screen.unmount();                                      // focus cleanup runs (blur)
    t.audio.playAndAwaitAudio('https://cdn/q1.mp3', () => false);
    await t.w.advance(6000);
    assert.ok(!t.w.playedNames().includes('expl1'), 'explanation started: ' + t.w.playedNames().join(' '));
  });

  for (const [s, n] of results) console.log(s, n);
  const bad = results.filter(r => r[0] === 'FAIL').length;
  console.log(`\n${results.length - bad} of ${results.length} scenarios passed`);
  process.exitCode = bad ? 1 : 0;
})().catch(e => { console.log('TEST ERROR', e); process.exitCode = 1; });
