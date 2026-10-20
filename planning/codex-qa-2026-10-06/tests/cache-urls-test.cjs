// Logic test for services/audioCache.ts: which URLs get downloaded (CODEX QA Q06). Loads the REAL file
// with a fake file system and network. NOT an Android test. Every expectation is an assertion.
const fs = require('fs'), vm = require('vm'), path = require('path'), assert = require('assert');
const root = path.resolve(__dirname, '../../..');
const ts = require(root + '/node_modules/typescript');
const BASE = 'https://qa.invalid/storage/v1/object/public/audio';

function world() {
  const started = [];
  const FS = {
    documentDirectory: 'file:///qa/',
    getInfoAsync: async () => ({ exists: false }),
    makeDirectoryAsync: async () => {}, readDirectoryAsync: async () => [], readAsStringAsync: async () => '{}',
    writeAsStringAsync: async () => {}, deleteAsync: async () => {}, moveAsync: async () => {},
    createDownloadResumable: (url) => ({ downloadAsync: async () => { started.push(url); return { status: 404, headers: {} }; }, cancelAsync: async () => {} }),
  };
  const deps = p =>
    p.includes('file-system')  ? FS :
    p.includes('bundledAudio') ? { BUNDLED_AUDIO_NAMES: new Set() } :
    p.includes('errorReporter') ? { reportError() {}, errorText: String } : {};
  const ctx = { exports: {}, console: { warn() {}, error() {}, log() {} },
    process: { env: { EXPO_PUBLIC_SUPABASE_URL: 'https://qa.invalid' } },
    setTimeout: () => 1, clearTimeout() {}, require: deps };
  const src = fs.readFileSync(root + '/services/audioCache.ts', 'utf8') + '\nexport const qa = { collectQuestionUrls };';
  vm.runInNewContext(ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, ctx);
  return { api: ctx.exports, started };
}
const plain = v => JSON.parse(JSON.stringify(v));   // arrays come from the VM context
const results = [];
async function scenario(name, fn) {
  try { await fn(); results.push(['OK  ', name]); }
  catch (e) { results.push(['FAIL', name + '  ->  ' + e.message.split('\n')[0]]); }
}

(async () => {
  const behavioral = { id: 'beh_mind_safety_0_0_0', sign_id: '', answers: ['A', 'B', 'C', 'D'].map(id => ({ id })) };

  await scenario('1 Q06 a behavioral question (spoken by TTS) yields NO mp3 URLs', async () => {
    const w = world();
    assert.deepStrictEqual(plain(w.api.qa.collectQuestionUrls(behavioral)), []);
  });

  await scenario('2 Q06 behavioral even when the caller left sign_id out (id beh_...)', async () => {
    const w = world();
    const { sign_id, ...noSignField } = behavioral;
    assert.deepStrictEqual(plain(w.api.qa.collectQuestionUrls(noSignField)), []);
  });

  await scenario('3 a sign question keeps its stored URLs, nothing invented', async () => {
    const w = world();
    const q = { id: '716_q3', sign_id: 'TRAFFIC_716', question_audio_url: BASE + '/716_q3_question.mp3',
      explanation_correct_audio_url: BASE + '/716_q3_correct.mp3', explanation_wrong_audio_url: BASE + '/716_q3_wrong.mp3',
      answers: ['A', 'B', 'C', 'D'].map(id => ({ id, audio_url: `${BASE}/answer_716_q3_${id}.mp3` })) };
    assert.deepStrictEqual(plain(w.api.qa.collectQuestionUrls(q)).length, 7);
  });

  await scenario('4 a sign question with a missing stored URL still gets the screens\' fallback name', async () => {
    const w = world();
    const q = { id: '716_q3', sign_id: 'TRAFFIC_716', answers: [{ id: 'A', audio_url: '' }] };
    const urls = plain(w.api.qa.collectQuestionUrls(q));
    assert.ok(urls.includes(`${BASE}/716_q3.mp3`), 'question fallback missing: ' + JSON.stringify(urls));
    assert.ok(urls.includes(`${BASE}/answer_716_q3_A.mp3`), 'answer fallback missing');
  });

  await scenario('5 Q06 prefetching a behavioral question downloads nothing', async () => {
    const w = world();
    w.api.prefetchQuestionAudio(behavioral);
    for (let i = 0; i < 30; i++) await new Promise(r => setImmediate(r));
    assert.deepStrictEqual(w.started, [], 'downloads started: ' + JSON.stringify(w.started));
  });

  for (const [mark, name] of results) console.log(mark, name);
  const failed = results.filter(r => r[0] === 'FAIL').length;
  console.log(failed ? `\n${failed} FAILED` : '\nALL PASSED');
  process.exitCode = failed ? 1 : 0;
})().catch(e => { console.error(e); process.exitCode = 1; });
