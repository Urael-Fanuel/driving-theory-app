// Runs a REAL screen file (.tsx) of the app, unchanged, so a test can press its buttons the way a
// learner does and see what is audible. Not a phone: React is a small stand-in (state, refs, effects,
// re-render), time is a fake clock, the player is a fake that finishes a clip after a set time, and every
// module the screen imports is a stub, EXCEPT the files a test names as real (the audio engine
// hooks/useAudio.ts, loaded from disk, so its ownership rules are the real ones).
// NOT an Android test. Used by sign-replay-test.cjs.
const fs = require('fs'), vm = require('vm'), path = require('path');

// tsRoot: where node_modules/typescript lives (default: root). A test may point root at a temporary copy
// of the sources (a defect put back on purpose) while the compiler stays the project's.
function createWorld({ root, tsRoot = root, clipMs, real = [], stubs = () => undefined, env = {} }) {
  const ts = require(path.join(tsRoot, 'node_modules/typescript'));

  // ── fake clock ───────────────────────────────────────────────────────────────────────────────
  const clock = { now: 0 };
  const timers = new Map(); let nextTimer = 1;
  const setTimeoutF = (fn, ms = 0) => { const id = nextTimer++; timers.set(id, { at: clock.now + ms, fn }); return id; };
  const clearTimeoutF = id => { timers.delete(id); };
  const tick = () => new Promise(r => setImmediate(r));
  const settle = async (n = 25) => { for (let i = 0; i < n; i++) await tick(); };
  async function advance(ms) {
    const end = clock.now + ms;
    await settle();
    for (;;) {
      let next = null;
      for (const [id, t] of timers) if (t.at <= end && (!next || t.at < next[1].at)) next = [id, t];
      if (!next) break;
      timers.delete(next[0]); clock.now = Math.max(clock.now, next[1].at); next[1].fn(); await settle();
    }
    clock.now = end; await settle();
  }

  // ── fake player: a clip lasts clipMs(name) of fake time, then reports "finished" ───────────────
  const played = [];            // every clip that STARTED: { t, name }
  const live = new Set();       // clips sounding right now
  const stat = { maxLive: 0 };
  const nameOf = uri => String(uri).split('/').pop().replace(/\.mp3$/, '');
  const ST = (x = {}) => ({ isLoaded: true, shouldPlay: true, isPlaying: true, isBuffering: false, didJustFinish: false,
    positionMillis: 10, durationMillis: 3000, interrupted: false, ...x });
  class Sound {
    constructor(uri, cb) { this.uri = uri; this.cb = cb; this.unloaded = false; this.playing = false; this.timer = null; this.dur = clipMs(nameOf(uri)); }
    static async createAsync({ uri }, init = {}, cb) { await tick(); const s = new Sound(uri, cb); if (init.shouldPlay) s.start(); return { sound: s }; }
    start() {
      this.playing = true; live.add(this); stat.maxLive = Math.max(stat.maxLive, live.size);
      played.push({ t: clock.now, name: nameOf(this.uri) });
      setImmediate(() => this.emit(ST({ durationMillis: this.dur })));
      this.timer = setTimeoutF(() => {
        if (this.unloaded) return;
        this.playing = false; live.delete(this);
        this.emit(ST({ didJustFinish: true, isPlaying: false, positionMillis: this.dur, durationMillis: this.dur }));
      }, this.dur);
    }
    emit(st) { if (!this.unloaded) this.cb?.(st); }
    async playAsync()   { if (this.unloaded) throw new Error('unloaded'); if (!this.playing) this.start(); }
    async pauseAsync()  { this.playing = false; live.delete(this); clearTimeoutF(this.timer); this.emit(ST({ isPlaying: false, shouldPlay: false })); }
    async stopAsync()   { if (this.unloaded) throw new Error('unloaded'); await tick(); this.playing = false; live.delete(this); clearTimeoutF(this.timer); }
    async unloadAsync() { this.unloaded = true; this.playing = false; live.delete(this); clearTimeoutF(this.timer); this.cb = null; }
    setOnPlaybackStatusUpdate(cb) { this.cb = cb; }
  }

  // ── a small stand-in for React: state, refs, memo, effects, re-render ──────────────────────────
  let cur = null;               // the mounted component's slots while it renders
  const R = {
    useState(init) {
      const s = cur, i = s.i++;
      if (!(i in s.slots)) s.slots[i] = { v: typeof init === 'function' ? init() : init };
      const slot = s.slots[i];
      return [slot.v, nv => { const val = typeof nv === 'function' ? nv(slot.v) : nv; if (!Object.is(val, slot.v)) { slot.v = val; s.schedule(); } }];
    },
    useRef(init) { const s = cur, i = s.i++; if (!(i in s.slots)) s.slots[i] = { current: init }; return s.slots[i]; },
    useMemo(fn, deps) {
      const s = cur, i = s.i++, old = s.slots[i];
      if (old && deps && old.deps && deps.length === old.deps.length && deps.every((d, k) => Object.is(d, old.deps[k]))) return old.val;
      const val = fn(); s.slots[i] = { val, deps }; return val;
    },
    useCallback(fn, deps) { return R.useMemo(() => fn, deps); },
    useEffect(fn, deps) {
      const s = cur, i = s.i++, old = s.slots[i];
      const changed = !old || !deps || !old.deps || deps.length !== old.deps.length || deps.some((d, k) => !Object.is(d, old.deps[k]));
      if (!changed) return;
      s.effects.push(() => {
        const prev = s.slots[i];
        if (prev && prev.cleanup) prev.cleanup();
        const cleanup = fn();
        s.slots[i] = { deps, cleanup: typeof cleanup === 'function' ? cleanup : null };
      });
      if (!old) s.slots[i] = { deps: null, cleanup: null, fresh: true };
    },
    createElement(type, props, ...children) { return { type, props: props || {}, children: children.flat(Infinity) }; },
    Fragment: 'Fragment',
  };
  R.useLayoutEffect = R.useEffect; R.default = R; R.__esModule = true;

  // ── modules: real files where named, stubs everywhere else ─────────────────────────────────────
  const cache = new Map();
  const stubModule = () => { const p = new Proxy(function () {}, {
    get: (t, k) => k === '__esModule' ? false : k === Symbol.toPrimitive ? () => '' : p,
    apply: () => p, construct: () => p }); return p; };
  const asRel = f => path.relative(root, f).replace(/\\/g, '/');
  // A relative import that is not on disk (a test may work on a partial copy of the sources) still gets a
  // path, so a stub can match it by name; it is never loaded.
  function resolveFile(fromDir, spec) {
    const base = path.resolve(fromDir, spec);
    for (const ext of ['.ts', '.tsx', '/index.ts', '/index.tsx', '']) { const f = base + ext; if (fs.existsSync(f) && fs.statSync(f).isFile()) return f; }
    return base + '.ts';
  }
  function makeRequire(fromDir) {
    return spec => {
      if (spec === 'react') return R;
      const file = spec.startsWith('.') ? resolveFile(fromDir, spec) : null;
      const override = stubs(spec, file && asRel(file));
      if (override !== undefined) return override;
      if (file && real.includes(asRel(file))) return loadFile(file);
      return stubModule();
    };
  }
  function loadFile(file) {
    if (cache.has(file)) return cache.get(file).exports;
    const mod = { exports: {} }; cache.set(file, mod);
    const js = ts.transpileModule(fs.readFileSync(file, 'utf8'), { fileName: file,
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.React } }).outputText;
    const ctx = { exports: mod.exports, module: mod, console: { warn() {}, error() {}, log() {} }, process: { env },
      setTimeout: setTimeoutF, clearTimeout: clearTimeoutF, setInterval: () => 0, clearInterval() {}, __DEV__: false,
      require: makeRequire(path.dirname(file)) };
    vm.runInNewContext(js, ctx);
    return mod.exports;
  }

  // ── mounting a screen ──────────────────────────────────────────────────────────────────────────
  function mount(file) {
    const Component = loadFile(path.join(root, file)).default;
    const s = { slots: [], i: 0, effects: [], tree: null, scheduled: false, dead: false, renders: 0 };
    s.schedule = () => { if (s.scheduled || s.dead) return; s.scheduled = true; setImmediate(() => { s.scheduled = false; if (!s.dead) render(); }); };
    function render() {
      cur = s; s.i = 0; s.effects = [];
      try { s.tree = Component(); } finally { cur = null; }
      s.renders++;
      for (const run of s.effects) run();
    }
    render();
    const walk = (node, out, pred) => {
      if (!node || typeof node !== 'object') return out;
      if (Array.isArray(node)) { node.forEach(n => walk(n, out, pred)); return out; }
      if (node.props && pred(node)) out.push(node);
      (node.children || []).forEach(n => walk(n, out, pred));
      return out;
    };
    return {
      find: pred => walk(s.tree, [], pred),
      get renders() { return s.renders; },
      unmount() { s.dead = true; s.slots.forEach(x => x && x.cleanup && x.cleanup()); },
    };
  }

  // Moves time on in small steps until pred() holds (a test says "the reading is on answer 2" instead of
  // hard-coding a time).
  async function advanceUntil(pred, maxMs = 40000, step = 50) {
    let t = 0;
    while (!pred() && t < maxMs) { await advance(step); t += step; }
    if (!pred()) throw new Error('condition not reached within ' + maxMs + ' fake ms; played so far: ' + played.map(p => p.name).join(' '));
  }

  return { R, Sound, clock, timers, advance, advanceUntil, settle, played, live, stat, nameOf, loadFile, mount, makeRequire, stubModule,
    audible: () => [...live].map(x => nameOf(x.uri)),
    playedNames: () => played.map(p => p.name) };
}

module.exports = { createWorld };
