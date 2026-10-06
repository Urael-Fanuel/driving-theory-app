// Logic test: "Android paused our audio" handling. Loads the REAL services/sound.ts,
// hooks/useAudio.ts and utils/googleTTS.ts with a fake expo-audio player that
// emits the same status events the native module does. NOT an Android test.
const fs = require('fs'), vm = require('vm');
const root = 'C:/Users/Yakov/Desktop/driving-theory-app';
const ts = require(root + '/node_modules/typescript');
const tr = p => ts.transpileModule(fs.readFileSync(root + '/' + p, 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); await new Promise(r => setImmediate(r)); };

function world() {
  // fake timers so we can "wait" 3 minutes instantly
  let now = 0; const timers = new Map(); let tid = 0;
  const T = {
    setTimeout: (fn, ms) => { const id = ++tid; timers.set(id, { fn, at: now + ms }); return id; },
    clearTimeout: id => { timers.delete(id); },
    advance: ms => { const end = now + ms; for (;;) { let next = null; for (const [id, t] of timers) if (t.at <= end && (!next || t.at < next[1].at)) next = [id, t]; if (!next) break; timers.delete(next[0]); now = next[1].at; next[1].fn(); } now = end; },
  };
  const players = [];
  class FakePlayer {
    constructor(uri) { this.uri = uri; this.l = null; this.state = 'idle'; this.playing = false; this.t = 0; players.push(this); }
    addListener(_e, fn) { this.l = fn; return { remove: () => { this.l = null; } }; }
    get currentStatus() { return this.st(); }
    st(extra = {}) { return { isLoaded: this.state !== 'idle', playbackState: this.state, playing: this.playing, isBuffering: this.state === 'buffering', didJustFinish: false, currentTime: this.t, duration: 10, ...extra }; }
    emit(extra) { this.l && this.l(this.st(extra)); }
    // native-like behaviour
    play() { this.wantPlay = true; if (this.state === 'ready') { this.playing = true; this.emit(); } }
    pause() { this.playing = false; if (this.state !== 'idle') this.emit(); }
    remove() {} release() { this.released = true; }
    // test controls
    load() { this.state = 'buffering'; this.emit(); this.state = 'ready'; this.playing = !!this.wantPlay; this.emit(); }
    tick(sec) { this.t += sec; this.emit(); }
    androidPause() { this.playing = false; this.emit(); }           // focus loss: native pause, app intent unchanged
    androidResume() { this.playing = true; this.emit(); }           // focus regained
    end() { this.playing = false; this.state = 'ended'; this.emit({ didJustFinish: true }); }
  }
  const expoAudio = { createAudioPlayer: (uri) => new FakePlayer(uri), setAudioModeAsync: async () => {} };
  const mods = {};
  const req = p => {
    if (p.endsWith('bundledAudio')) return { bundledAudioFor: () => null, BUNDLED_AUDIO_NAMES: new Set() };
    if (p === 'react-native') return { Platform: { OS: 'android' }, AppState: { currentState: 'active' } };
    if (p === 'expo-audio') return expoAudio;
    if (p === 'react') return { useState: x => [typeof x === 'function' ? x() : x, () => {}], useRef: x => ({ current: x }), useCallback: x => x, useEffect: () => {} };
    if (p.endsWith('services/sound')) return mods.sound;
    if (p.endsWith('audioCache')) return { getLocalAudioUri: async u => u, discardCachedCopy: async () => {}, getCachedTtsUri: async () => 'file:///tts.mp3', storeTtsAudio: async () => {}, releaseAudioFiles: async () => {} };
    if (p.endsWith('errorReporter')) return { reportError() {}, watchPlaybackStart() {}, describeUri: () => ({}), httpStatusOf: () => null };
    if (p.endsWith('supabaseClient')) return { getStorageUrl: (b, f) => 'https://cdn/' + f, BUCKETS: { AUDIO: 'audio' }, supabase: {} };
    throw new Error('unexpected require ' + p);
  };
  const load = (p) => { const ctx = { exports: {}, require: req, console: { warn() {}, log() {}, error() {} }, setTimeout: T.setTimeout, clearTimeout: T.clearTimeout, process: { env: {} } }; vm.runInNewContext(tr(p), ctx); return ctx.exports; };
  mods.sound = load('services/sound.ts');
  return { T, players, sound: mods.sound, load };
}

const ok = (c) => c ? 'OK' : 'FAIL';
(async () => {
  // ── 1. sound.ts status + global signal ────────────────────────────────────
  let w = world();
  const seen = [];
  const pending = w.sound.Sound.createAsync({ uri: 'a.mp3' }, { shouldPlay: true }, s => seen.push(s));
  const p = w.players[0]; p.load(); const { sound } = await pending;
  p.tick(1);
  const playingOk = seen.at(-1).isPlaying && !seen.at(-1).interrupted && !w.sound.isAudioInterrupted();
  p.androidPause();
  const intr = seen.at(-1).interrupted && w.sound.isAudioInterrupted();
  p.androidResume();
  const back = seen.at(-1).isPlaying && !seen.at(-1).interrupted && !w.sound.isAudioInterrupted();
  await sound.pauseAsync();
  const userPause = !seen.at(-1).interrupted && !w.sound.isAudioInterrupted();
  await sound.playAsync();
  p.state = 'buffering'; p.playing = false; p.emit();
  const buffering = !seen.at(-1).interrupted;
  p.state = 'ready'; p.playing = true; p.emit();
  p.androidPause(); w.sound.resumeInterruptedAudio();
  const tapResume = p.playing && !w.sound.isAudioInterrupted();
  p.end();
  const ended = seen.at(-1).didJustFinish && !seen.at(-1).interrupted;
  p.androidPause(); await sound.unloadAsync();
  const disposed = !w.sound.isAudioInterrupted();
  console.log('1 sound layer: playing', ok(playingOk), '| android pause -> interrupted', ok(intr), '| resume', ok(back),
    '| user pause not interrupted', ok(userPause), '| buffering not interrupted', ok(buffering), '| ▶️ tap resumes', ok(tapResume),
    '| end not interrupted', ok(ended), '| unload clears signal', ok(disposed));

  // ── 2. useAudio: phone call of 3 minutes in the middle of a clip ──────────
  w = world();
  const ua = w.load('hooks/useAudio.ts');
  const hook = ua.useAudio();
  let result = 'pending';
  const done = ua.playAndAwaitAudio('https://cdn/clip.mp3', () => false).then(v => { result = v; });
  await flush(); w.players[0].load(); await flush();
  w.players[0].tick(2);
  const s1 = ua.getGlobalAudioState();
  w.players[0].androidPause(); await flush();
  const s2 = ua.getGlobalAudioState();
  w.T.advance(180_000); await flush();          // a 3-minute call
  const stillWaiting = result === 'pending';
  w.players[0].androidResume(); await flush();   // call ends, expo-audio resumes
  const s3 = ua.getGlobalAudioState();
  w.players[0].end(); await done;
  console.log('2 useAudio + 3-min call: playing->', s1, '| call->', s2, ok(s2 === 'paused'), '| sequence still waits after 3 min', ok(stillWaiting),
    '| resumed->', s3, ok(s3 === 'playing'), '| finished heard=', result, ok(result === true));

  // ── 3. useAudio: safety still rescues a clip whose finish never arrives ───
  w = world();
  const ua2 = w.load('hooks/useAudio.ts'); ua2.useAudio();
  let r2 = 'pending';
  const d2 = ua2.playAndAwaitAudio('https://cdn/clip.mp3', () => false).then(v => { r2 = v; });
  await flush(); w.players[0].load(); await flush(); w.players[0].tick(1);
  w.T.advance(151_000); await d2;
  console.log('3 dropped finish callback still rescued after 150s of playing:', r2, ok(r2 === true));

  // ── 4. useAudio: ▶️ during the call continues (resumeAudio on 'paused') ─────
  w = world();
  const ua3 = w.load('hooks/useAudio.ts'); const h3 = ua3.useAudio();
  ua3.playAndAwaitAudio('https://cdn/clip.mp3', () => false);
  await flush(); w.players[0].load(); await flush(); w.players[0].tick(1);
  w.players[0].androidPause(); await flush();
  await h3.resumeAudio(); await flush();
  console.log('4 ▶️ tap during call: player playing', ok(w.players[0].playing), '| state', ua3.getGlobalAudioState());

  // ── 5. TTS: speaking flag drops during the call, comes back after ─────────
  w = world();
  const tts = w.load('utils/googleTTS.ts');
  const flags = []; tts.onTTSSpeakingChange(v => flags.push(v));
  let r5 = 'pending';
  const d5 = tts.speakAndAwait('ሰላም').then(v => { r5 = v; });
  await flush(); const tp = w.players.at(-1); tp.load(); await flush(); tp.tick(1);
  tp.androidPause(); await flush();
  const offDuringCall = tts.getIsTTSSpeaking() === false;
  w.T.advance(60_000); await flush();
  const notFinished = r5 === 'pending';
  tp.androidResume(); await flush();
  const onAgain = tts.getIsTTSSpeaking() === true;
  tp.end(); await d5;
  console.log('5 TTS + 1-min call: ⏸ hidden during call', ok(offDuringCall), '| sentence not abandoned after 60s', ok(notFinished),
    '| ⏸ back after call', ok(onAgain), '| result', r5, ok(r5 === true));
})().catch(e => console.log('TEST ERROR', e));
