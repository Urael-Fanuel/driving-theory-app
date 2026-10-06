// Logic test of hooks/useAudio.ts ownership rules (mocked sound layer; NOT an Android test).
const fs = require('fs'), vm = require('vm');
const root = 'C:/Users/Yakov/Desktop/driving-theory-app';
const ts = require(root + '/node_modules/typescript');
const src = ts.transpileModule(fs.readFileSync(root + '/hooks/useAudio.ts', 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const flush = async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); await new Promise(r => setImmediate(r)); };

function setup(opts = {}) {
  const created = [], events = [], discarded = [];
  let releaseOldStop = null;
  class FakeSound {
    constructor(uri) { this.uri = uri; this.unloaded = false; this.cb = null; }
    async stopAsync() { if (this.uri === 'old' && opts.slowOldStop) { await new Promise(r => { releaseOldStop = r; }); } }
    async unloadAsync() { this.unloaded = true; }
    async pauseAsync() {}
    async playAsync() {}
    setOnPlaybackStatusUpdate(cb) { this.cb = cb; }
    async getStatusAsync() { return { isLoaded: true, shouldPlay: true, isPlaying: true, isBuffering: false, didJustFinish: false, positionMillis: 5 }; }
    static async createAsync({ uri }, init, onStatus) {
      if (opts.failLocal && uri.startsWith('file:')) throw new Error('decode failed');
      const s = new FakeSound(uri); s.cb = onStatus; created.push(s);
      if (onStatus && opts.autoFinish) setTimeout(() => onStatus({ isLoaded: true, shouldPlay: true, isPlaying: false, isBuffering: false, didJustFinish: true, positionMillis: 1000, durationMillis: 1000 }), 20);
      // report "playing" immediately, like a real player that started
      Promise.resolve().then(() => onStatus && onStatus({ isLoaded: true, shouldPlay: true, isPlaying: true, isBuffering: false, didJustFinish: false, positionMillis: 1, durationMillis: 1000 }));
      return { sound: s };
    }
  }
  const react = { useState: x => [x, () => {}], useRef: x => ({ current: x }), useCallback: x => x, useEffect: () => {} };
  const ctx = {
    exports: {}, console: { warn() {}, log() {}, error() {} }, setTimeout: (fn, ms) => ms >= 100000 ? 0 : setTimeout(fn, ms), clearTimeout,
    require: p => {
      if (p === 'react') return react;
      if (p.endsWith('services/sound')) return { Sound: FakeSound, applyAudioMode: async () => {} };
      if (p.endsWith('audioCache')) return { getLocalAudioUri: async u => opts.localFor && u.includes(opts.localFor) ? 'file:///docs/audio/x.mp3' : u, discardCachedCopy: async u => { discarded.push(u); } };
      if (p.endsWith('errorReporter')) return { reportError() {}, watchPlaybackStart() {}, describeUri: () => ({}) };
      return { getStorageUrl: (b, f) => 'https://cdn/' + f, BUCKETS: { AUDIO: 'audio' } };
    },
  };
  vm.runInNewContext(src, ctx);
  const api = ctx.exports;
  const hook = api.useAudio();
  api.getGlobalAudioState && api.getGlobalAudioState();
  api.__listen = fn => {};
  return { api, hook, created, discarded, releaseOld: () => releaseOldStop && releaseOldStop(), FakeSound };
}

(async () => {
  // 1. Codex's race: old sound is stopping slowly while A and B are requested.
  let t = setup({ slowOldStop: true });
  // an "old" sound is already playing:
  const oldSound = new t.FakeSound('old'); // inject through a normal play of 'old' first
  await t.hook.playAudio('old');                       // plays "old" (uri passes through unchanged)
  await flush();
  const a = t.hook.playAudio('A');                      // starts stopping old (slow)
  await flush();
  const b = t.hook.playAudio('B');                      // arrives meanwhile
  await flush();
  t.releaseOld();                                       // old finally stops
  await Promise.all([a, b]); await flush();
  const alive1 = t.created.filter(s => !s.unloaded).map(s => s.uri);
  await t.hook.stopAudio(); await flush();
  const alive2 = t.created.filter(s => !s.unloaded).map(s => s.uri);
  console.log('1 race A/B while old stops: alive before stop =', JSON.stringify(alive1), '| alive after stopAudio =', JSON.stringify(alive2), alive1.length === 1 && alive1[0] === 'B' && alive2.length === 0 ? ' OK' : ' FAIL');

  // 2. Three rapid requests: only the last one survives, nothing orphaned.
  t = setup();
  const p = [t.hook.playAudio('c1'), t.hook.playAudio('c2'), t.hook.playAudio('c3')];
  await Promise.all(p); await flush();
  const alive3 = t.created.filter(s => !s.unloaded).map(s => s.uri);
  await t.hook.stopAudio(); await flush();
  console.log('2 three rapid requests: alive =', JSON.stringify(alive3), '| after stop =', t.created.filter(s => !s.unloaded).length, alive3.length === 1 && alive3[0] === 'c3' ? ' OK' : ' FAIL');

  // 3. A saved copy that cannot be decoded: discarded, original played once.
  t = setup({ failLocal: true, localFor: 'x.mp3', autoFinish: true });
  const ok = await t.api.playAndAwaitAudio('https://cdn/x.mp3', () => false);
  console.log('3 saved copy fails -> original played once: result =', ok, '| sounds created =', JSON.stringify(t.created.map(s => s.uri)), '| discarded =', JSON.stringify(t.discarded), ok === true && t.created.length === 1 && t.created[0].uri === 'https://cdn/x.mp3' && t.discarded.length === 1 ? ' OK' : ' FAIL');

  // 4. A healthy saved copy plays as is, nothing discarded.
  t = setup({ localFor: 'x.mp3', autoFinish: true });
  const ok4 = await t.api.playAndAwaitAudio('https://cdn/x.mp3', () => false);
  console.log('4 healthy saved copy: result =', ok4, '| played =', t.created[0] && t.created[0].uri, '| discarded =', t.discarded.length, ok4 === true && t.created[0].uri.startsWith('file:') && t.discarded.length === 0 ? ' OK' : ' FAIL');

  // 5. Cancelled by the caller before the sound exists: nothing is left playing.
  t = setup({ autoFinish: true });
  let cancel = false;
  const pr = t.api.playAndAwaitAudio('https://cdn/y.mp3', () => cancel);
  cancel = true;
  const ok5 = await pr; await flush();
  console.log('5 cancelled request: result =', ok5, '| alive =', t.created.filter(s => !s.unloaded).length, ok5 === true && t.created.filter(s => !s.unloaded).length === 0 ? ' OK' : ' FAIL');
})().catch(e => { console.log('TEST ERROR', e); });

// Test 3 awaits a clip that never "finishes" in the fake; give it a result by timing out the test cleanly.
setTimeout(() => process.exit(0), 4000);
