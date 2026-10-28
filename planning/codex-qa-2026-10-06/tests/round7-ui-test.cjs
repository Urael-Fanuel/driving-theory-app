// Round 7 (owner's phone testing of the 2026-10-27 APK): checks for the screen fixes.
//   - every screen frame keeps out of the status bar (ScreenSafeArea), and the screens that had no bottom
//     room now keep their last buttons above the Android navigation bar
//   - Engine B feedback is never read aloud by itself (a ▶️ button reads it), and its Next stops any reading
//   - behavioral ‹ › arrows keep the step (lesson -> lesson, quiz / end screen -> quiz)
//   - the daily quiz ends with the same review as the exam (one shared component, real helper run below)
//   - Engine B progress shows Amharic topic names
//   - Engine A feedback offers Next when the clip never starts (weak connection)
// Static checks on the REAL files plus a run of the real utils/quizReview.ts. NOT a device test.
// Run from anywhere:  node round7-ui-test.cjs
const fs = require('fs'), vm = require('vm'), path = require('path'), assert = require('assert');
const root = path.resolve(__dirname, '../../..');
const ts = require(root + '/node_modules/typescript');
const read = f => fs.readFileSync(root + '/' + f, 'utf8');

const results = [];
function scenario(name, fn) {
  try { fn(); results.push(['OK  ', name]); } catch (e) { results.push(['FAIL', name + '  ->  ' + String(e.message).split('\n')[0]]); }
}

const SCREENS = [
  'app/(engineA)/(tabs)/exam.tsx', 'app/(engineA)/(tabs)/home.tsx', 'app/(engineA)/(tabs)/progress.tsx',
  'app/(engineA)/behavioral-subtopic/[id].tsx', 'app/(engineA)/behavioral/[id].tsx', 'app/(engineA)/practice.tsx',
  'app/(engineA)/question/[id].tsx', 'app/(engineA)/sign/[id].tsx', 'app/(engineA)/topic-quiz/[topicId].tsx',
  'app/(engineA)/topic/[id].tsx',
  'app/(engineB)/(tabs)/exam.tsx', 'app/(engineB)/(tabs)/home.tsx', 'app/(engineB)/(tabs)/progress.tsx',
  'app/(engineB)/behavioral-subtopic/[id].tsx', 'app/(engineB)/behavioral/[id].tsx', 'app/(engineB)/practice.tsx',
  'app/(engineB)/question/[id].tsx', 'app/(engineB)/sign/[id].tsx', 'app/(engineB)/topic-quiz/[topicId].tsx',
  'app/(engineB)/topic/[id].tsx', 'app/result/[sessionId].tsx',
];

scenario('safe area: every screen uses ScreenSafeArea, none uses React Native\'s SafeAreaView (a no-op on Android)', () => {
  for (const f of SCREENS) {
    const s = read(f);
    assert.ok(/import \{ ScreenSafeArea as SafeAreaView \} from '[./]+components\/shared\/ScreenSafeArea'/.test(s), f + ': not on ScreenSafeArea');
    for (const m of s.matchAll(/import \{([^}]*)\} from 'react-native';/g))
      assert.ok(!/\bSafeAreaView\b/.test(m[1]), f + ': still imports SafeAreaView from react-native');
  }
  const c = read('components/shared/ScreenSafeArea.tsx');
  assert.ok(/\['top', 'left', 'right'\]/.test(c), 'the frame must keep the top (and not add a second bottom gap)');
});

scenario('safe area: the 6 places that had no bottom room now add insets.bottom', () => {
  const want = [
    ['app/result/[sessionId].tsx', /paddingBottom: 24 \+ insets\.bottom/],
    ['app/(engineB)/topic-quiz/[topicId].tsx', /resultContent, \{ paddingBottom: 32 \+ insets\.bottom/],
    ['app/(engineB)/topic-quiz/[topicId].tsx', /styles\.content, \{ paddingBottom: 24 \+ insets\.bottom/],
    ['app/(engineA)/topic-quiz/[topicId].tsx', /resultContent, \{ paddingBottom: 32 \+ insets\.bottom/],
    ['app/(engineB)/practice.tsx', /styles\.content, \{ paddingBottom: 16 \+ insets\.bottom/],
    ['app/(engineB)/question/[id].tsx', /styles\.bottomNav, \{ paddingBottom: 16 \+ insets\.bottom \}/],
    ['app/(engineB)/behavioral-subtopic/[id].tsx', /styles\.bottomNav, \{ paddingBottom: 16 \+ insets\.bottom \}/],
  ];
  for (const [f, re] of want) assert.ok(re.test(read(f)), f + ' ' + re);
});

scenario('status bar: dark icons on the light screens, light icons on the two dark practice screens', () => {
  assert.ok(/<StatusBar style="dark" \/>/.test(read('app/_layout.tsx')));
  for (const f of ['app/(engineA)/practice.tsx', 'app/(engineB)/practice.tsx'])
    assert.strictEqual((read(f).match(/<StatusBar style="light" \/>/g) || []).length, 2, f + ': both return paths');
});

scenario('Engine B feedback: nothing is read by itself; a ▶️ button reads it; Next stops the reading first', () => {
  const s = read('components/engineB/TextFeedback.tsx');
  const mount = s.slice(s.indexOf('    // Slide up animation'), s.indexOf('  const bgColor'));
  assert.ok(!/speakAndAwait|speakLongAndAwait/.test(mount), 'the mount effect still speaks');
  assert.ok(/onPress=\{handleTtsSpeak\}/.test(s), 'no button for the spoken feedback');
  const next = s.slice(s.indexOf('const handleNext = () => {'), s.indexOf('onNext();', s.indexOf('const handleNext = () => {')));
  assert.ok(/stopTTS\(\)/.test(next), 'Next does not stop the reading');
  assert.ok(/onPress=\{handleNext\}/.test(s));
});

scenario('behavioral arrows keep the step: from the quiz or the end screen they open the next QUIZ (both engines)', () => {
  for (const e of ['A', 'B']) {
    const s = read(`app/(engine${e})/behavioral-subtopic/[id].tsx`);
    assert.ok(/const toQuiz = phase !== 'explanation' \? '&start=quiz' : '';/.test(s), e + ': arrows do not pass the step');
    assert.ok(/\$\{levelId\}\$\{toQuiz\}/.test(s), e + ': URL without the step');
    assert.ok(/useState<Phase>\(\(\) => \(start === 'quiz' && questions\.length > 0 \? 'questions' : 'explanation'\)\)/.test(s), e + ': start=quiz not honoured');
  }
});

scenario('daily quiz: the review shared with the exam result is used by the exam and by both daily quizzes', () => {
  assert.ok(/<QuizReview\b/.test(read('app/result/[sessionId].tsx')), 'exam result');
  for (const e of ['A', 'B']) {
    const s = read(`app/(engine${e})/topic-quiz/[topicId].tsx`);
    assert.ok(/\{isDaily && dailyReview && \(\s*<QuizReview/.test(s), e + ': daily review missing');
    assert.ok(new RegExp(`isEngineA=\\{${e === 'A'}\\}`).test(s), e + ': wrong engine flag');
  }
});

scenario('daily quiz: buildQuizReview (REAL file) counts only answered questions, per topic, and lists the wrong ones', () => {
  const js = ts.transpileModule(read('utils/quizReview.ts'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const ctx = { exports: {}, require: () => ({}) }; vm.runInNewContext(js, ctx);
  const qs = [
    { id: 'q1', sign_id: 's1', topic_id: 'warning', question_image_url: null },
    { id: 'q2', sign_id: '', topic_id: 'mind_safety', question_image_url: 'img2' },
    { id: 'q3', sign_id: 's3', topic_id: 'warning' },
    { id: 'q4', sign_id: 's4', topic_id: 'regulatory' },      // skipped with the › arrow: not answered
  ];
  const r = ctx.exports.buildQuizReview(qs, [
    { questionId: 'q1', isCorrect: true }, { questionId: 'q2', isCorrect: false }, { questionId: 'q3', isCorrect: false },
  ]);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(r.topicBreakdown)), { warning: { correct: 1, total: 2 }, mind_safety: { correct: 0, total: 1 } });
  assert.deepStrictEqual(JSON.parse(JSON.stringify(r.wrongQuestions)), [
    { questionId: 'q2', signId: '', topicId: 'mind_safety', questionImageUrl: 'img2' },
    { questionId: 'q3', signId: 's3', topicId: 'warning' },
  ]);
});

scenario('Engine B progress shows the Amharic topic name (one shared list with the exam result)', () => {
  const s = read('app/(engineB)/(tabs)/progress.tsx');
  assert.ok(/\{topicName\(t\.topicId\)\}/.test(s) && !/>\{t\.topicId\}</.test(s));
  const names = read('constants/topicNames.ts');
  for (const id of ['regulatory', 'warning', 'right_of_way', 'prohibitions', 'information_guidance', 'vehicle_knowledge', 'road_decisions'])
    assert.ok(new RegExp('\\b' + id + ':').test(names), id + ' has no Amharic name');
});

scenario('Engine A feedback: a clip that never starts still gets a Next button (weak connection)', () => {
  const s = read('components/engineA/AudioFeedback.tsx');
  assert.ok(/const CLIP_START_TIMEOUT_MS = 6_000;/.test(s) && /const SPEECH_TIMEOUT_MS = 15_000;/.test(s));
  const eff = s.slice(s.indexOf('the clip never started'), s.indexOf('const bgColor'));
  assert.ok(/audioState === 'playing' \|\| audioState === 'paused'\) return;/.test(eff), 'must wait normally once the clip plays');
  assert.ok(/setTimeout\(\(\) => setShowNext\(true\), CLIP_START_TIMEOUT_MS\)/.test(eff));
});

scenario('Engine B feedback appears at once and does not slide (the Next button must be there when the finger arrives)', () => {
  const tf = read('components/engineB/TextFeedback.tsx');
  assert.ok(!/translateY|Animated\.spring|slideAnim/.test(tf), 'the panel still slides in');
  assert.ok(/Animated\.timing\(fadeAnim, \{ toValue: 1, duration: 120/.test(tf));
  for (const f of ['app/(engineB)/question/[id].tsx', 'app/(engineB)/topic-quiz/[topicId].tsx', 'app/(engineB)/behavioral-subtopic/[id].tsx', 'app/(engineB)/(tabs)/exam.tsx', 'app/(engineB)/practice.tsx'])
    assert.ok(!/setTimeout\(\(\) => setShowFeedback\(true\)/.test(read(f)) && /setShowFeedback\(true\);/.test(read(f)), f + ': feedback still delayed');
});

for (const [s, n] of results) console.log(s, n);
const bad = results.filter(r => r[0] === 'FAIL').length;
console.log(`\n${results.length - bad} of ${results.length} scenarios passed`);
process.exitCode = bad ? 1 : 0;
