// Logic test for recorded TTS: the REAL services/audioCache.ts and the REAL utils/googleTTS.ts loaded
// TOGETHER, with a fake file system, network, player and clock; plus scripts/recordTts.mjs (sentences,
// file names, speech guard, publishing) with fake storage. NOT an Android test. Every expectation is an
// assertion: any failure exits with code 1. Run from anywhere:  node recorded-tts-test.cjs
// Cases R1-R6 are the findings of CODEX_RECORDED_TTS_REPORT.md (2026-10-24).
const fs = require('fs'), vm = require('vm'), path = require('path'), assert = require('assert');
const { pathToFileURL } = require('url');
const root = path.resolve(__dirname, '../../..');
const ts = require(root + '/node_modules/typescript');
const tick  = () => new Promise(r => setImmediate(r));
const flush = async () => { for (let i = 0; i < 30; i++) await tick(); };
const BASE = 'https://qa.invalid';
const REC  = BASE + '/storage/v1/object/public/audio/tts/';
const transpile = (f, extra = '') => ts.transpileModule(fs.readFileSync(root + f, 'utf8') + extra,
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const deferred = () => { let resolve; const promise = new Promise(r => resolve = r); return { promise, resolve }; };

// ── one fake clock for everything ─────────────────────────────────────────────
function makeClock() {
  let now = 1_700_000_000_000, id = 0; const q = [];
  return {
    now: () => now,
    setTimeout: (fn, ms = 0) => { const t = { id: ++id, at: now + ms, fn }; q.push(t); return t.id; },
    clearTimeout: i => { const k = q.findIndex(t => t.id === i); if (k >= 0) q.splice(k, 1); },
    async advance(ms) {
      const end = now + ms;
      for (;;) {
        await flush();
        q.sort((a, b) => a.at - b.at);
        const t = q[0];
        if (!t || t.at > end) break;
        q.shift(); now = t.at; t.fn();
      }
      now = end; await flush();
    },
  };
}

// ── the real audioCache.ts + the real googleTTS.ts, wired together ────────────
// files: path -> { bytes, kind } where kind 'good' | 'loadfail' (cannot be opened) | 'silent' (errors while
// playing) | 'nostart' (opens, but the player refuses to start it)
function world(opts = {}) {
  const clock = makeClock();
  class FakeDate extends Date { static now() { return clock.now(); } }
  const files = new Map(), downloads = [], invoked = [], reports = [], indexFetches = [], played = [];
  let index = opts.index ?? { status: 200, body: { files: [] } };
  const clips = opts.clips ?? {};          // file name -> { kind, status, hold }
  const FS = {
    documentDirectory: 'file:///qa/',
    EncodingType: { Base64: 'base64' },
    getInfoAsync: async p => files.has(p) ? { exists: true, size: files.get(p).bytes } : { exists: false },
    makeDirectoryAsync: async () => {}, readDirectoryAsync: async () => [], readAsStringAsync: async () => '{}',
    writeAsStringAsync: async (p, data) => {
      if (p.endsWith('audio_cache_index.json')) return;
      files.set(p, { bytes: 20000, kind: data === 'BAD' ? 'loadfail' : (opts.liveKind ?? 'good') });
    },
    deleteAsync: async p => { if (opts.undeletable && opts.undeletable.includes(p)) throw new Error('cannot delete'); files.delete(p); },
    moveAsync: async ({ from, to }) => { files.set(to, files.get(from)); files.delete(from); },
    createDownloadResumable: (url, tmp) => ({
      downloadAsync: async () => {
        downloads.push(url);
        const c = clips[url.split('/').pop()] ?? {};
        if (c.hold) await c.hold;
        if (c.status && c.status !== 200) return { status: c.status, headers: {} };
        files.set(tmp, { bytes: 20000, kind: c.kind ?? 'good' });
        return { status: 200, headers: { 'content-length': '20000' } };
      },
      cancelAsync: async () => {},
    }),
  };
  const fakeFetch = async (url) => {
    indexFetches.push(url);
    if (index.error) throw new Error('network down');
    return { ok: index.status === 200, status: index.status, json: async () => index.body };
  };
  const cacheCtx = {
    exports: {}, console: { warn() {}, error() {}, log() {} },
    process: { env: { EXPO_PUBLIC_SUPABASE_URL: BASE } },
    setTimeout: clock.setTimeout, clearTimeout: clock.clearTimeout, Date: FakeDate,
    fetch: fakeFetch, AbortController,
    require: p =>
      p.includes('file-system')      ? FS :
      p.includes('bundledAudio')     ? { BUNDLED_AUDIO_NAMES: new Set() } :
      p.includes('errorReporter')    ? { reportError: (...a) => reports.push(a), errorText: e => String(e && e.message || e) } :
      p.includes('useNetworkStatus') ? { getIsConnected: () => true } : {},
  };
  vm.runInNewContext(transpile('/services/audioCache.ts', '\nexport const qa = { ttsFilename, recordedTtsFilename };'), cacheCtx);
  const cache = cacheCtx.exports;

  class Sound {
    constructor(uri) { this.uri = uri; this.cb = null; this.playing = false; this.unloaded = false; }
    static async createAsync({ uri }) {
      await tick();
      const f = uri.startsWith('data:') ? { kind: uri.includes('QkFE') ? 'loadfail' : 'good' } : files.get(uri);
      if (!f || f.kind === 'loadfail') throw new Error('cannot open ' + uri);
      return { sound: new Sound(uri) };
    }
    async playAsync() {
      const f = this.uri.startsWith('data:') ? { kind: 'good' } : files.get(this.uri) ?? { kind: 'good' };
      if (f.kind === 'nostart') throw new Error('player refused to start');
      this.playing = true; played.push(this.uri);
      clock.setTimeout(() => {
        if (this.unloaded || !this.cb) return;
        if (f.kind === 'silent') this.cb({ isLoaded: false, error: 'decoder error' });
        else this.cb({ isLoaded: true, isPlaying: false, didJustFinish: true, durationMillis: 500, positionMillis: 500 });
      }, 500);
      this.cb?.({ isLoaded: true, isPlaying: true, shouldPlay: true, durationMillis: 500, positionMillis: 0 });
    }
    async stopAsync() { this.playing = false; }
    async pauseAsync() { this.playing = false; }
    async unloadAsync() { this.unloaded = true; this.playing = false; }
    setOnPlaybackStatusUpdate(cb) { this.cb = cb; }
  }
  const ttsCtx = {
    exports: {}, console: { warn() {}, error() {}, log() {} }, process: { env: {} },
    setTimeout: clock.setTimeout, clearTimeout: clock.clearTimeout, Date: FakeDate,
    require: p =>
      p.endsWith('/sound')          ? { Sound, applyAudioMode: async () => {} } :
      p.endsWith('/audioCache')     ? cache :
      p.endsWith('/errorReporter')  ? { reportError: (...a) => reports.push(a), describeUri: () => ({}), httpStatusOf: () => null } :
      p.endsWith('/supabaseClient') ? { supabase: { functions: { invoke: async (_n, { body }) => {
        invoked.push(body.text);
        if (opts.liveHold) await opts.liveHold;
        return { data: { audioContent: opts.liveBad ? 'BAD' : 'R09PRA==' }, error: null };
      } } } } : {},
  };
  vm.runInNewContext(transpile('/utils/googleTTS.ts'), ttsCtx);
  const speakingEvents = [];
  ttsCtx.exports.onTTSSpeakingChange(v => speakingEvents.push(v));
  const recName = t => cache.qa.recordedTtsFilename(t);
  const liveName = t => cache.qa.ttsFilename(t);
  return {
    tts: ttsCtx.exports, cache, clock, files, downloads, invoked, reports, indexFetches, played, recName, liveName, speakingEvents,
    speaking: () => ttsCtx.exports.getIsTTSSpeaking(),
    setIndex: v => { index = v; },
    // speak and drive the clock until the call settles (or the limit)
    async speak(text, ms = 30_000) {
      let result = 'pending';
      const p = ttsCtx.exports.speakAndAwait(text).then(r => { result = r; });
      for (let t = 0; t < ms && result === 'pending'; t += 250) await clock.advance(250);
      await p.catch(() => {});
      return result;
    },
  };
}
const listed = (...names) => ({ status: 200, body: { files: names } });
const MISSING = { status: 400, body: { statusCode: '404', error: 'not_found', message: 'Object not found' } };

const results = [];
async function scenario(name, fn) {
  try { await fn(); results.push(['OK  ', name]); }
  catch (e) { results.push(['FAIL', name + '  ->  ' + String(e.message).split('\n')[0]]); }
}

(async () => {
  const rec = await import(pathToFileURL(root + '/scripts/recordTts.mjs').href);
  const guard = rec.speechGuard();
  const lists = { praises: guard.praises, numbers: guard.numbers };
  const subs = rec.subtopics();
  const allSentences = subs.flatMap(s => rec.sentencesFor(s, lists));
  const probe = world();

  // ── sentences and names ────────────────────────────────────────────────────
  await scenario('1 the script names every sentence exactly like the app does (all 5,157 + edge cases)', async () => {
    const samples = [...allSentences.map(x => x.text), '', 'a', 'ብራቮ!', 'x'.repeat(2000), '\u{1F600} emoji', 'ä ö ü'];
    for (const t of samples) {
      assert.strictEqual(rec.ttsFilename(t), probe.cache.qa.ttsFilename(t), 'live name differs for: ' + t.slice(0, 40));
      assert.strictEqual(rec.recordedFilename(t), probe.cache.qa.recordedTtsFilename(t), 'recorded name differs for: ' + t.slice(0, 40));
    }
    for (const x of allSentences) assert.ok(x.file.startsWith('rtts_'), 'manifest file is not a recording name: ' + x.file);
  });

  await scenario('2 every sentence the app pre-renders (real collectTtsTexts, both engines) is in the manifest', async () => {
    const have = new Set(allSentences.map(x => x.text));
    for (const s of subs) {
      const qs = s.questions.map(q => ({ question_amharic: q.question_amharic, answers: q.answers.map(a => ({ text_amharic: a.text_amharic })) }));
      for (const t of probe.tts.collectTtsTexts(qs, null)) assert.ok(have.has(t), s.id + ': missing ' + t.slice(0, 50));
    }
  });

  await scenario('3 manifest: 69 subtopics, 15 praises, all 25 sentences of every question present', async () => {
    assert.strictEqual(subs.length, 69);
    assert.strictEqual(lists.praises.length, 15);
    for (const s of subs) {
      const have = new Set(rec.sentencesFor(s, lists).map(x => x.text));
      s.questions.forEach((q, qi) => {
        const correct = q.answers.find(a => a.is_correct)?.text_amharic ?? '';
        const want = [q.question_amharic, ...q.answers.map(a => a.text_amharic), ...q.answers.map((a, i) => lists.numbers[i] + '። ' + a.text_amharic),
          ...lists.praises.map(p => p + ' ' + correct), 'ስህተት! ትክክለኛው መልስ: ' + correct];
        assert.strictEqual(want.length, 25);
        for (const t of want) assert.ok(have.has(t), s.id + ' q' + qi + ' missing: ' + t.slice(0, 40));
      });
    }
  });

  await scenario('4 the recording request is the Edge Function request (plain text, same voice, rate 0.85)', async () => {
    const fn = fs.readFileSync(root + '/supabase/functions/tts/index.ts', 'utf8').replace(/\s+/g, ' ');
    for (const part of ["input: { text }", "voice: { languageCode: 'am-ET', name: 'am-ET-Standard-A', ssmlGender: 'FEMALE' }", "audioConfig: { audioEncoding: 'MP3', speakingRate: 0.85 }"])
      assert.ok(fn.includes(part), 'Edge Function no longer has: ' + part);
    assert.strictEqual(rec.ttsRequestBody('ሀ'), JSON.stringify({ input: { text: 'ሀ' },
      voice: { languageCode: 'am-ET', name: 'am-ET-Standard-A', ssmlGender: 'FEMALE' }, audioConfig: { audioEncoding: 'MP3', speakingRate: 0.85 } }));
  });

  // ── R6: the speech guard ───────────────────────────────────────────────────
  await scenario('5 R6 speech guard: the app as it is passes; every changed spoken construction is refused', async () => {
    assert.deepStrictEqual(guard.problems, []);
    const rd = r => fs.readFileSync(root + '/' + r, 'utf8');
    const mut = (file, from, to) => rec.speechGuard(r => { const s = rd(r); if (r !== file) return s; assert.ok(s.includes(from), 'test pattern missing in ' + file); return s.replace(from, to); }).problems;
    const cases = [
      ['app/(engineA)/(tabs)/exam.tsx', "speakAndAwait(currentQuestion!.question_amharic ?? '')", "speakAndAwait('ጥያቄ ' + currentQuestion!.question_amharic)"],
      ['app/(engineA)/behavioral-subtopic/[id].tsx', 'speakAndAwait(currentQ!.answers[i].text_amharic)', 'speakAndAwait(currentQ!.answers[i].text_amharic.trim())'],
      ['app/(engineB)/behavioral-subtopic/[id].tsx', '${AMHARIC_NUMBERS[i]}። ', '${AMHARIC_NUMBERS[i]}፡ '],
      ['app/(engineA)/practice.tsx', 'ስህተት! ትክክለኛው መልስ: ${correctText}', 'ስህተት ነው! ${correctText}'],
      ['app/(engineA)/practice.tsx', '`${randomPraise()} ${correctText}`', '`${randomPraise()}, ${correctText}`'],
      ['app/(engineA)/topic-quiz/[topicId].tsx', 'answers.find(a => a.is_correct)?.text_amharic', 'answers.find(a => a.is_correct)?.text_hebrew'],
      ['app/(engineA)/(tabs)/exam.tsx', 'handleBehavioralAnswerAudioPress(answer.text_amharic!, index)', 'handleBehavioralAnswerAudioPress(answer.id, index)'],
      ['app/(engineA)/behavioral-subtopic/[id].tsx', 'ttsText={feedbackTTSText}', 'ttsText={feedbackTTSText + "!"}'],
    ];
    for (const [file, from, to] of cases) assert.ok(mut(file, from, to).length > 0, 'not refused: ' + to);
    assert.deepStrictEqual(mut('app/(engineA)/(tabs)/exam.tsx', 'import', '// speakAndAwait(anything)\nimport'), [], 'a comment must not count');
  });

  // ── runtime, both real modules together ────────────────────────────────────
  await scenario('6 a valid recording is played, live TTS is not called; the replay downloads nothing', async () => {
    const w = world();
    w.setIndex(listed(w.recName('hello')));
    assert.strictEqual(await w.speak('hello'), true);
    assert.deepStrictEqual(w.invoked, []);
    assert.deepStrictEqual(w.played, ['file:///qa/audio/' + w.recName('hello')]);
    assert.strictEqual(await w.speak('hello'), true);
    assert.strictEqual(w.downloads.length, 1, 'downloaded again');
    assert.deepStrictEqual(w.invoked, []);
  });

  await scenario('7 no recording -> live TTS exactly as before (and no clip download)', async () => {
    const w = world();
    assert.strictEqual(await w.speak('hello'), true);
    assert.deepStrictEqual(w.invoked, ['hello']);
    assert.deepStrictEqual(w.downloads, []);
    assert.deepStrictEqual(w.played, ['file:///qa/audio/' + w.liveName('hello')]);
  });

  await scenario('8 R1 a recording that cannot be opened: the SAME call says it live; the next call does not download it again', async () => {
    const w = world({ clips: { [probe.cache.qa.recordedTtsFilename('hello')]: { kind: 'loadfail' } } });
    w.setIndex(listed(w.recName('hello')));
    assert.strictEqual(await w.speak('hello'), true, 'no audible fallback');
    assert.deepStrictEqual(w.invoked, ['hello']);
    assert.strictEqual(await w.speak('hello'), true);
    assert.strictEqual(w.downloads.length, 1, 'bad recording downloaded again');
    assert.deepStrictEqual(w.invoked, ['hello'], 'second call should play the saved live rendering');
  });

  await scenario('9 R1 a recording that errors WHILE playing: the same call says it live', async () => {
    const w = world({ clips: { [probe.cache.qa.recordedTtsFilename('hello')]: { kind: 'silent' } } });
    w.setIndex(listed(w.recName('hello')));
    assert.strictEqual(await w.speak('hello'), true);
    assert.deepStrictEqual(w.invoked, ['hello']);
    assert.ok(!w.files.has('file:///qa/audio/' + w.recName('hello')), 'bad recording kept on the phone');
  });

  await scenario('10 R1 a bad recording saved by prefetch: heard live on first use, never downloaded twice', async () => {
    const w = world({ clips: { [probe.cache.qa.recordedTtsFilename('hello')]: { kind: 'loadfail' } } });
    w.setIndex(listed(w.recName('hello')));
    await w.tts.prefetchTtsForTexts(['hello']); await w.clock.advance(100);
    assert.deepStrictEqual(w.invoked, [], 'prefetch called live although a recording was listed');
    assert.strictEqual(await w.speak('hello'), true, 'not heard');
    assert.strictEqual(await w.speak('hello'), true);
    assert.strictEqual(w.downloads.length, 1, 'downloads: ' + w.downloads.length);
    assert.deepStrictEqual(w.invoked, ['hello']);
  });

  await scenario('11 R3 a recording that arrives late (after live was chosen) cannot keep the live result from being heard', async () => {
    const recHold = deferred(), liveHold = deferred();
    const w = world({ clips: { [probe.cache.qa.recordedTtsFilename('hello')]: { kind: 'loadfail', hold: recHold.promise } }, liveHold: liveHold.promise });
    w.setIndex(listed(w.recName('hello')));
    let result = 'pending';
    w.tts.speakAndAwait('hello').then(r => { result = r; });
    await w.clock.advance(8_100);
    assert.deepStrictEqual(w.invoked, ['hello'], 'live did not start at the deadline');
    recHold.resolve(); await w.clock.advance(10);            // the bad recording lands in ITS slot
    liveHold.resolve();
    for (let t = 0; t < 10_000 && result === 'pending'; t += 250) await w.clock.advance(250);
    assert.strictEqual(result, true, 'result: ' + result);
    assert.deepStrictEqual(w.played, ['file:///qa/audio/' + w.liveName('hello')]);
  });

  await scenario('12 R4 nothing published at first (Storage "400 / statusCode 404"), published later: found after the refresh time', async () => {
    const w = world({ index: MISSING });
    assert.strictEqual(await w.speak('a'), true);
    assert.deepStrictEqual(w.invoked, ['a']);
    assert.strictEqual(w.reports.filter(r => r[1] === 'recordedIndex').length, 0, 'a missing index was reported as an error');
    w.setIndex(listed(w.recName('b')));
    await w.clock.advance(11 * 60 * 1000);
    await w.speak('warm-up');                                 // starts the background refresh
    await w.clock.advance(100);
    assert.strictEqual(await w.speak('b'), true);
    assert.ok(!w.invoked.includes('b'), 'b went live although it is now published');
    assert.ok(w.indexFetches.length >= 2, 'index never read again');
  });

  await scenario('13 R4 a failing refresh keeps the index already loaded', async () => {
    const w = world();
    w.setIndex(listed(w.recName('a'), w.recName('b')));
    assert.strictEqual(await w.speak('a'), true);
    w.setIndex({ error: true });
    await w.clock.advance(11 * 60 * 1000);
    await w.speak('a'); await w.clock.advance(100);           // refresh fails in the background
    assert.strictEqual(await w.speak('b'), true);
    assert.deepStrictEqual(w.invoked, [], 'lost the loaded index');
  });

  await scenario('14 R5 prefetch: a slow recording does not hold up the live pre-rendering (8 s)', async () => {
    const recHold = deferred();
    const w = world({ clips: { [probe.cache.qa.recordedTtsFilename('slow')]: { hold: recHold.promise } } });
    w.setIndex(listed(w.recName('slow')));
    let done = false;
    w.tts.prefetchTtsForTexts(['slow']).then(() => { done = true; });
    await w.clock.advance(8_100);
    assert.deepStrictEqual(w.invoked, ['slow'], 'live pre-rendering did not start');
    await w.clock.advance(100);
    assert.ok(done, 'prefetch still waiting');
    recHold.resolve(); await flush();
  });

  await scenario('15 a stop while the recording downloads: nothing plays, nothing live, false', async () => {
    const recHold = deferred();
    const w = world({ clips: { [probe.cache.qa.recordedTtsFilename('hello')]: { hold: recHold.promise } } });
    w.setIndex(listed(w.recName('hello')));
    let result = 'pending';
    w.tts.speakAndAwait('hello').then(r => { result = r; });
    await w.clock.advance(1_000);
    await w.tts.stopTTS();
    recHold.resolve(); await w.clock.advance(10_000);
    assert.strictEqual(result, false);
    assert.deepStrictEqual(w.played, []);
    assert.deepStrictEqual(w.invoked, []);
  });

  await scenario('16 index cannot be loaded: live TTS, reported once, not asked again within 10 minutes', async () => {
    const w = world({ index: { error: true } });
    assert.strictEqual(await w.speak('a'), true);
    assert.strictEqual(await w.speak('b'), true);
    assert.deepStrictEqual(w.invoked, ['a', 'b']);
    assert.strictEqual(w.indexFetches.length, 1);
    assert.strictEqual(w.reports.filter(r => r[1] === 'recordedIndex').length, 1);
  });

  await scenario('17 a clip that is listed but missing / server error: live TTS', async () => {
    const w = world({ clips: { [probe.cache.qa.recordedTtsFilename('hello')]: { status: 500 } } });
    w.setIndex(listed(w.recName('hello')));
    assert.strictEqual(await w.speak('hello'), true);
    assert.deepStrictEqual(w.invoked, ['hello']);
  });

  // ── R2: publishing with fake storage ───────────────────────────────────────
  const store = (initial, opts = {}) => {
    const objects = new Map(initial === undefined ? [] : [['tts/index.json', JSON.stringify({ files: initial })]]);
    let reads = 0; const puts = [];
    return {
      objects, puts,
      getObject: async (p) => {
        reads++;
        if (opts.failRead && opts.failRead(reads)) return { status: 503, body: 'unavailable' };
        if (opts.badJson) return { status: 200, body: '{not json' };
        if (!objects.has(p)) return { status: 400, body: JSON.stringify({ statusCode: '404', error: 'not_found' }) };
        return { status: 200, body: objects.get(p) };
      },
      putObject: async (p, buf) => { puts.push(p); objects.set(p, buf.toString()); },
      synthesize: async () => Buffer.from('mp3'),
    };
  };
  const batch = [{ text: 'a', file: 'rtts_a.mp3', kind: 'question' }, { text: 'b', file: 'rtts_b.mp3', kind: 'answer_A' }];
  const indexOf = s => JSON.parse(s.objects.get('tts/index.json')).files;

  await scenario('18 R2 first publication (no index yet): clips, then an index listing them', async () => {
    const s = store(undefined);
    const r = await rec.publish(batch, s);
    assert.strictEqual(r.published, true);
    assert.deepStrictEqual(indexOf(s), ['rtts_a.mp3', 'rtts_b.mp3']);
    assert.strictEqual(s.puts[s.puts.length - 1], 'tts/index.json', 'index was not written last');
  });

  await scenario('19 R2 the first index read fails: nothing recorded, nothing uploaded', async () => {
    const s = store(['rtts_old.mp3'], { failRead: n => n === 1 });
    await assert.rejects(rec.publish(batch, s));
    assert.deepStrictEqual(s.puts, []);
  });

  await scenario('20 R2 the final index read fails: the index is NOT replaced, earlier entries survive', async () => {
    const s = store(['rtts_old.mp3'], { failRead: n => n === 2 });
    await assert.rejects(rec.publish(batch, s), /index NOT updated/);
    assert.deepStrictEqual(indexOf(s), ['rtts_old.mp3']);
    assert.ok(!s.puts.includes('tts/index.json'));
  });

  await scenario('21 R2 a malformed index is never read as "empty"', async () => {
    const s = store(['rtts_old.mp3'], { badJson: true });
    await assert.rejects(rec.publish(batch, s), /not valid JSON/);
    assert.deepStrictEqual(s.puts, []);
  });

  await scenario('22 R2 merge keeps what was there at the start AND at the end, plus the new clips; re-run is a no-op', async () => {
    const s = store(['rtts_old.mp3']);
    const realGet = s.getObject; let n = 0;
    s.getObject = async p => (++n === 2 ? { status: 200, body: JSON.stringify({ files: ['rtts_other.mp3'] }) } : realGet(p));
    await rec.publish(batch, s);
    assert.deepStrictEqual(indexOf(s), ['rtts_a.mp3', 'rtts_b.mp3', 'rtts_old.mp3', 'rtts_other.mp3']);
    const before = s.puts.length;
    const again = await rec.publish(batch, store(indexOf(s)));
    assert.strictEqual(again.recorded, 0);
    assert.strictEqual(again.published, false);
    assert.strictEqual(s.puts.length, before);
  });

  // ── Round 2 findings S1-S3 ─────────────────────────────────────────────────
  await scenario('23 S1 live audio that cannot be opened: false, and the speaking state is OFF', async () => {
    const w = world({ liveBad: true });
    assert.strictEqual(await w.speak('bad'), false);
    assert.strictEqual(w.speaking(), false, 'still "speaking": ' + JSON.stringify(w.speakingEvents));
  });

  await scenario('24 S1 bad recording, then the live retry fails too: false, speaking OFF, one live call only', async () => {
    const w = world({ clips: { [probe.cache.qa.recordedTtsFilename('hello')]: { kind: 'loadfail' } }, liveBad: true });
    w.setIndex(listed(w.recName('hello')));
    assert.strictEqual(await w.speak('hello'), false);
    assert.strictEqual(w.speaking(), false);
    assert.deepStrictEqual(w.invoked, ['hello'], 'retries were not bounded');
  });

  await scenario('25 S1 live clip the player refuses to start: false, speaking OFF', async () => {
    const w = world({ liveKind: 'nostart' });
    assert.strictEqual(await w.speak('x'), false);
    assert.strictEqual(w.speaking(), false);
    assert.deepStrictEqual(w.invoked, ['x']);
  });

  await scenario('26 S1 live clip that errors while playing: false, speaking OFF', async () => {
    const w = world({ liveKind: 'silent' });
    assert.strictEqual(await w.speak('x'), false);
    assert.strictEqual(w.speaking(), false);
  });

  await scenario('27 S2 a saved live file the player refuses to start: dropped, the FRESH live rendering is heard', async () => {
    const w = world();
    const path0 = 'file:///qa/audio/' + w.liveName('hello');
    w.files.set(path0, { bytes: 20000, kind: 'nostart' });
    assert.strictEqual(await w.speak('hello'), true);
    assert.deepStrictEqual(w.invoked, ['hello']);
    // The fresh response is what is heard (played from memory, since the saved
    // name is the one that just failed), and it is also what is saved for next time.
    assert.deepStrictEqual(w.played, ['data:audio/mp3;base64,R09PRA=='], 'played: ' + JSON.stringify(w.played));
    assert.strictEqual(w.files.get(path0).kind, 'good', 'the fresh rendering did not replace the failed file');
    assert.strictEqual(await w.speak('hello'), true, 'the next time, the saved fresh file must play');
    assert.deepStrictEqual(w.played.slice(1), [path0]);
    assert.deepStrictEqual(w.invoked, ['hello'], 'retries were not bounded');
    assert.strictEqual(w.speaking(), false);
  });

  await scenario('28 S2 ... and when the failed file cannot even be deleted, the fresh audio is played from memory', async () => {
    const w0 = world();
    const path0 = 'file:///qa/audio/' + w0.liveName('hello');
    const w = world({ undeletable: [path0] });
    w.files.set(path0, { bytes: 20000, kind: 'nostart' });
    assert.strictEqual(await w.speak('hello'), true);
    assert.deepStrictEqual(w.invoked, ['hello']);
    assert.ok(w.played.length === 1 && w.played[0].startsWith('data:'), 'played: ' + JSON.stringify(w.played));
  });

  await scenario('29 S3 speech guard: a doubled space or a new line INSIDE a spoken template is refused; layout outside quotes is not', async () => {
    const rd = r => fs.readFileSync(root + '/' + r, 'utf8');
    const mut = (file, from, to) => rec.speechGuard(r => { const s = rd(r); if (r !== file) return s; assert.ok(s.includes(from), 'test pattern missing'); return s.replace(from, to); }).problems;
    assert.ok(mut('app/(engineB)/behavioral-subtopic/[id].tsx', '${AMHARIC_NUMBERS[i]}። ${currentQ', '${AMHARIC_NUMBERS[i]}።  ${currentQ').length > 0, 'doubled space accepted');
    assert.ok(mut('app/(engineA)/practice.tsx', '`${randomPraise()} ${correctText}`', '`${randomPraise()}\n${correctText}`').length > 0, 'new line accepted');
    assert.ok(mut('app/(engineA)/practice.tsx', 'ስህተት! ትክክለኛው መልስ: ', 'ስህተት!  ትክክለኛው መልስ: ').length > 0, 'doubled space in the wrong-answer line accepted');
    assert.deepStrictEqual(mut('app/(engineA)/(tabs)/exam.tsx', "speakAndAwait(currentQuestion!.question_amharic ?? '')",
      "speakAndAwait(\n  currentQuestion!.question_amharic\n  ?? '' // q\n)"), [], 'layout outside quotes must not count');
  });

  for (const [s, n] of results) console.log(s, n);
  const bad = results.filter(r => r[0] === 'FAIL').length;
  console.log(`\n${results.length - bad} of ${results.length} scenarios passed`);
  process.exitCode = bad ? 1 : 0;
})().catch(e => { console.log('TEST ERROR', e); process.exitCode = 1; });
