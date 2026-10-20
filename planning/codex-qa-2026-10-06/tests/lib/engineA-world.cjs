// Shared set-up for the tests that drive a REAL Engine A question screen with tests/lib/screen-harness.cjs:
// the exam (app/(engineA)/(tabs)/exam.tsx) and the topic quiz (app/(engineA)/topic-quiz/[topicId].tsx).
// Real files: the screen, hooks/useAudio.ts (pre-recorded clips) and utils/googleTTS.ts (spoken behavioral
// answers). Stubs: everything else (the exam / quiz hooks are small stand-ins that keep the question index and
// the phase). Two kinds of question, 4 answers each:
//   'sign'       answers are clips a1..a4 (second question b1..b4), question clip q (q2)
//   'behavioral' answers are spoken: ba1..ba4 (second question bb1..bb4), question bq (bq2)
// NOT an Android test.
const path = require('path');
const { createWorld } = require('./screen-harness.cjs');

const FILES = {
  exam:  'app/(engineA)/(tabs)/exam.tsx',
  topic: 'app/(engineA)/topic-quiz/[topicId].tsx',
};
const clipMs = n => /^(q|bq)\d?$/.test(n) ? 3000 : /^number_/.test(n) ? 600 : /^(a|b|ba|bb)\d$/.test(n) ? 2000 : 1000;

function makeQuestions(kind) {
  const mk = (n, ans, qText) => kind === 'sign'
    ? { id: 'S' + n, sign_id: '301', topic_id: 't', question_audio_url: `https://cdn/q${n === 1 ? '' : n}.mp3`,
        answers: [1, 2, 3, 4].map(k => ({ id: 'A' + k, audio_url: `https://cdn/${ans}${k}.mp3`, image_url: 'img', is_correct: k === 1 })) }
    : { id: 'B' + n, topic_id: 't', question_amharic: qText,
        answers: [1, 2, 3, 4].map(k => ({ id: 'A' + k, text_amharic: `${ans}${k}`, image_url: null, is_correct: k === 1 })) };
  return kind === 'sign' ? [mk(1, 'a'), mk(2, 'b')] : [mk(1, 'ba', 'bq'), mk(2, 'bb', 'bq2')];
}

function setup({ screen, kind, root, projectRoot }) {
  const QUESTIONS = makeQuestions(kind);
  const VOICE = { voiceState: 'idle', startListening: async () => {}, stopListening: async () => {}, cancelListening() {} };   // stable, like the real hook
  let phaseSetter = null;
  const w = createWorld({ root, tsRoot: projectRoot, clipMs, real: ['hooks/useAudio.ts', 'utils/googleTTS.ts'], stubs: (spec, relFile) => {
    const rel = relFile && relFile.replace(/\.tsx?$/, '');
    const RN = new Proxy({}, { get: (t, k) => k === 'StyleSheet' ? { create: x => x, absoluteFill: {}, absoluteFillObject: {}, hairlineWidth: 1, flatten: x => x }
      : k === 'Dimensions' ? { get: () => ({ width: 400, height: 800 }) } : k === 'BackHandler' ? { addEventListener: () => ({ remove() {} }) }
      : k === 'Platform' ? { OS: 'android', select: o => o.android ?? o.default } : w.stubModule() });
    if (spec === 'react-native') return RN;
    if (spec === 'expo-router') return { useLocalSearchParams: () => ({ topicId: 't' }), useRouter: () => ({ replace() {}, push() {}, back() {}, navigate() {} }), useFocusEffect: cb => w.R.useEffect(() => cb(), [cb]) };
    if (spec === 'expo-haptics') return { selectionAsync: async () => {}, notificationAsync: async () => {}, NotificationFeedbackType: { Success: 1, Error: 2 } };
    if (rel === 'services/sound') return { Sound: w.Sound, applyAudioMode: async () => {}, isAudioInterrupted: () => false, onAudioInterruptedChange: () => () => {}, resumeInterruptedAudio() {} };
    if (rel === 'backend/supabaseClient') return { getStorageUrl: (b, f) => 'https://cdn/' + f, BUCKETS: { AUDIO: 'audio' },
      supabase: { functions: { invoke: async () => ({ data: { audioContent: 'QUFB' }, error: null }) } } };
    if (rel === 'services/audioCache') return { getLocalAudioUri: async u => u, discardCachedCopy: async () => {}, prefetchSignAudio: async () => {},
      isQuestionAudioReady: async () => true, prefetchQuestionAudio() {}, preCacheAudioBatch: async () => {},
      getCachedTtsUri: async t => 'file:///tts/' + t + '.mp3', storeTtsAudio: async () => {}, releaseAudioFiles: async () => {} };
    if (rel === 'services/errorReporter') return { reportError() {}, watchPlaybackStart() {}, describeUri: () => ({}), httpStatusOf: () => null };
    if (rel === 'backend/api') return { getAllSigns: async () => [{ id: '301', topic_id: 't', image_url: 'x' }] };
    if (rel === 'hooks/useVoiceRecognition') return { useVoiceRecognition: () => VOICE };
    if (rel === 'hooks/useAudioInterrupted') return { useAudioInterrupted: () => false, resumeInterruptedAudio() {} };
    if (rel === 'hooks/useSponsorAd') return { useSponsorAd: () => null };
    if (rel === 'hooks/useNetworkStatus') return { useNetworkStatus: () => true };
    if (rel === 'utils/examResult') return { storeExamResult() {} };
    if (rel === 'contexts/EngineContext') return { useEngine: () => ({ userId: 'u', engineType: 'A' }) };
    if (rel === 'utils/signNumber') return { extractSignNumber: () => '301', shouldShowSignBadge: () => false };
    // The exam / quiz hooks: the question index and the phase are real state; everything else is inert.
    const quizHook = () => {
      const [i, setI] = w.R.useState(0);
      const [phase, setPhase] = w.R.useState('question');
      phaseSetter = setPhase;
      return { phase, currentQuestion: QUESTIONS[i], questions: QUESTIONS, currentIndex: i, progress: { current: i + 1, total: QUESTIONS.length },
        submitAnswer: () => setPhase('feedback_correct'), nextQuestion() {}, goToQuestion: setI, result: null, lastAnswerCorrect: null,
        selectedAnswerId: null, answers: [], isSaving: false, restart() {} };
    };
    if (rel === 'hooks/useExam') return { useExam: quizHook };
    if (rel === 'hooks/useTopicQuiz') return { useTopicQuiz: quizHook };
    return undefined;
  } });
  const view = w.mount(FILES[screen]);
  const cards = () => view.find(n => 'cardState' in n.props);
  const byName = name => view.find(n => typeof n.props.onPress === 'function' && n.props.onPress.name === name)[0];
  return {
    w, view, QUESTIONS,
    tapSpeaker: i => cards()[i].props.onAudioPress(),
    chooseAnswer: i => cards()[i].props.onPress(),
    nextQuestion: () => byName('handleNavNext').props.onPress(),
    pressAudioButton: () => byName('handleAudioButton').props.onPress(),
    highlight: () => { const c = cards().map(x => x.props.cardState); const i = c.indexOf('reading'); return i < 0 ? null : i; },
    since: m => w.playedNames().slice(m),
    mark: () => w.played.length,
  };
}

module.exports = { setup, clipMs };
