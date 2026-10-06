// Logic tests for services/errorReporter.ts (CODEX section 5 findings).
// Loads the REAL file; replaces the phone's file system, network, database client and
// timers with controllable fakes. NOT an Android test.
const fs = require('fs'), vm = require('vm');
const root = 'C:/Users/Yakov/Desktop/driving-theory-app';
const ts = require(root + '/node_modules/typescript');
const src = fs.readFileSync(root + '/services/errorReporter.ts', 'utf8')
  + '\nexport const qa = { keyCount: () => _keyCounts.size, sessionCount: () => _sessionCount };';
const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;

const AM = '\u12A0';   // one Amharic letter (3 bytes in UTF-8)
const settle = async () => { for (let i = 0; i < 40; i++) await Promise.resolve(); await new Promise(r => setImmediate(r)); };

// What the table measures: octet_length(details::text) with jsonb's ": " and ", " separators.
function jb(v) {
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return '[' + v.map(jb).join(', ') + ']';
  return '{' + Object.entries(v).map(([k, x]) => JSON.stringify(k) + ': ' + jb(x)).join(', ') + '}';
}
const octets = v => Buffer.byteLength(jb(v), 'utf8');

function world(opts = {}) {
  const files = opts.files || new Map();
  const dirs = new Set(); dirs.add('file:///docs/diagnostics/');
  const writes = [];
  const inserts = [];
  const behaviors = [];
  const state = { online: opts.online ?? true, userId: opts.userId ?? 'user-1', appState: 'active' };
  // fake timers
  let now = 0; const timers = new Map(); let tid = 0;
  const T = {
    setTimeout: (fn, ms) => { const id = ++tid; timers.set(id, { fn, at: now + ms }); return id; },
    clearTimeout: id => { timers.delete(id); },
    advance: async ms => {
      const end = now + ms;
      for (;;) {
        let next = null;
        for (const [id, t] of timers) if (t.at <= end && (!next || t.at < next[1].at)) next = [id, t];
        if (!next) break;
        timers.delete(next[0]); now = next[1].at; next[1].fn(); await settle();
      }
      now = end; await settle();
    },
  };
  const FS = {
    documentDirectory: 'file:///docs/',
    getInfoAsync: async p => files.has(p) ? { exists: true, size: files.get(p).length } : { exists: false },
    readAsStringAsync: async p => { if (!files.has(p)) throw new Error('ENOENT'); return files.get(p); },
    writeAsStringAsync: (p, c) => { writes.push(p); if (opts.hangWrites) return new Promise(() => {}); files.set(p, c); return Promise.resolve(); },
    deleteAsync: async p => { files.delete(p); },
    makeDirectoryAsync: async p => { dirs.add(p); },
    readDirectoryAsync: async p => {
      if (!dirs.has(p)) throw new Error('ENOENT');
      return [...files.keys()].filter(k => k.startsWith(p) && !k.slice(p.length).includes('/')).map(k => k.slice(p.length));
    },
  };
  const supabase = {
    auth: { getSession: async () => ({ data: { session: state.userId ? { user: { id: state.userId } } : null } }) },
    from: () => ({
      insert: row => {
        const call = { row, signal: null };
        inserts.push(call);
        const run = () => new Promise(resolve => {
          const b = behaviors.length ? behaviors.shift() : 'ok';
          if (b === 'hang') { if (call.signal) call.signal.addEventListener('abort', () => resolve({ error: { message: 'AbortError', code: '' }, status: 0 })); return; }
          if (b === 'hangIgnoreAbort') return;
          if (b === 'ok') return resolve({ error: null, status: 201 });
          resolve(b);
        });
        const builder = { abortSignal(sig) { call.signal = sig; return builder; }, then(res, rej) { return run().then(res, rej); } };
        return builder;
      },
    }),
  };
  const mods = {
    'react-native': { Platform: { OS: 'android', Version: 34, constants: { Manufacturer: 'samsung', Model: 'SM-A125F', Release: '14' } }, AppState: { get currentState() { return state.appState; } } },
    'expo-file-system/legacy': FS,
    'expo-network': { getNetworkStateAsync: async () => ({ isConnected: state.online, isInternetReachable: state.online, type: 'WIFI' }) },
    'expo-application': { nativeApplicationVersion: '1.0.0', nativeBuildVersion: '10' },
    '../backend/supabaseClient': { supabase },
    './bundledAudio': { BUNDLED_AUDIO_NAMES: new Set(['number_1.mp3']) },
  };
  const ctx = {
    exports: {}, console: { warn() {}, log() {}, error() {} },
    setTimeout: T.setTimeout, clearTimeout: T.clearTimeout, AbortController,
    __DEV__: false, require: p => { if (!(p in mods)) throw new Error('unexpected require ' + p); return mods[p]; },
  };
  vm.createContext(ctx);
  vm.runInContext(js, ctx);
  return { api: ctx.exports, ctx, files, writes, inserts, behaviors, state, T, dirs };
}
const ok = c => c ? 'OK' : 'FAIL';
const queueFiles = w => [...w.files.keys()].filter(k => k.startsWith('file:///docs/diagnostics/'));
const seed = (w, name, row) => w.files.set('file:///docs/diagnostics/' + name, typeof row === 'string' ? row : JSON.stringify(row));
const baseRow = (id, over = {}) => ({ id, function_name: 'w', error_message: 'm', category: 'audio', details: { a: 1 }, app_version: '1.0.0 (10)', platform: 'android 14', device: 'x', user_id: null, ...over });

(async () => {
  // 1. UTF-8 bytes: CODEX reproduced 3000 Amharic chars -> 9179 bytes passing a string-length filter
  let w = world();
  w.api.reportError('audio', 'w', AM.repeat(3000), { long: AM.repeat(3000), stack: 'x'.repeat(5000) });
  await settle();
  let row = w.inserts[0] && w.inserts[0].row;
  const wide = {}; for (let i = 0; i < 80; i++) wide['key_' + i] = AM.repeat(300);
  const w1b = world(); w1b.api.reportError('audio', 'w2', 'boom', wide); await settle();
  const r1b = w1b.inserts[0] && w1b.inserts[0].row;
  console.log('1 UTF-8 budget: 3000-letter message+detail -> details', row && octets(row.details), 'bytes (limit 8000)', ok(row && octets(row.details) <= 8000 && row.error_message.length <= 2000 && row.function_name.length <= 200),
    '| 80 keys x 300 letters ->', r1b && octets(r1b.details), 'bytes', ok(r1b && octets(r1b.details) <= 8000), '| essential fields kept', ok(r1b && r1b.details.session && r1b.details.occurred_at));

  // 2. redaction
  w = world();
  const dirty = 'GET https://abc.supabase.co/storage/v1/object/public/audio/a.mp3?token=SECRET123&apikey=KEY456 failed; Bearer ZZZtoken999; eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.sig_abc; mail me@example.com; data:audio/mp3;base64,QUFBQUJCQkJDQ0NDRERERA== end';
  w.api.reportError('audio', 'w', dirty, { url: dirty, file: '814_explanation.mp3', stack: 'at f (' + dirty + ')' });
  await settle();
  const all = JSON.stringify(w.inserts[0].row);
  const leaks = ['SECRET123', 'KEY456', 'ZZZtoken999', 'eyJhbGci', 'me@example.com', 'QUFBQUJC', 'storage/v1/object'].filter(x => all.includes(x));
  console.log('2 redaction: leaked strings =', JSON.stringify(leaks), ok(leaks.length === 0), '| host kept', ok(all.includes('abc.supabase.co')), '| file name kept', ok(all.includes('814_explanation.mp3')));

  // 3. offline skips must not use up the per-key budget (CODEX reproduced the suppression)
  w = world({ online: false });
  for (let i = 0; i < 3; i++) { w.api.reportError('download', 'w', 'same failure', {}, { skipIfOffline: true }); await settle(); }
  const offlineSent = w.inserts.length;
  w.state.online = true;
  w.api.reportError('download', 'w', 'same failure', {}, { skipIfOffline: true }); await settle();
  console.log('3 offline skips: sent while offline =', offlineSent, '| first online error reported =', w.inserts.length, ok(offlineSent === 0 && w.inserts.length === 1), '| session budget back to', w.api.qa.sessionCount());

  // 4. throttles and memory
  w = world();
  for (let i = 0; i < 6; i++) { w.api.reportError('audio', 'w', 'same', {}); await settle(); }
  const same = w.inserts.length;
  const w4 = world();
  for (let i = 0; i < 500; i++) { w4.api.reportError('audio', 'w', 'distinct ' + i, {}); }
  await settle();
  console.log('4 throttle: same x6 ->', same, 'sent', ok(same === 3), '| 500 distinct ->', w4.inserts.length, 'sent (cap 60)', ok(w4.inserts.length === 60), '| keys remembered', w4.api.qa.keyCount(), '(cap 200)', ok(w4.api.qa.keyCount() <= 200));

  // 5. no lock during network: a stalled flush must not block saving a new report
  w = world();
  seed(w, '5000000000000_a.json', baseRow('a'));
  w.behaviors.push('hangIgnoreAbort');            // flush's send never returns
  const flush = w.api.flushPendingReports();
  await settle();
  w.behaviors.push({ error: { message: 'x', code: '' }, status: 503 });   // a live report fails -> must be queued at once
  w.api.reportError('audio', 'w', 'new report during stall', {}); await settle();
  const savedWhileStalled = queueFiles(w).length === 2;
  await w.T.advance(12_000);                       // timeout elapses
  await flush;
  console.log('5 stalled flush: new report saved while the send was stuck', ok(savedWhileStalled), '| flush finished after timeout', ok(true), '| old row kept for retry', ok(queueFiles(w).some(f => f.includes('_a.json'))));

  // 6. corrupt / torn / stale files
  w = world();
  seed(w, '5000000000001_good.json', baseRow('good'));
  seed(w, '5000000000002_torn.json', '{"id":"torn","function_name":"w","categ');
  seed(w, '5000000000003_garbage.json', 'not json at all');
  seed(w, '1000_old.json', baseRow('old'));                       // far older than 14 days
  await w.api.flushPendingReports(); await settle();
  console.log('6 corrupt files: sent ids =', JSON.stringify(w.inserts.map(c => c.row.id)), ok(w.inserts.length === 1 && w.inserts[0].row.id === 'good'), '| queue now empty', ok(queueFiles(w).length === 0));

  // 7. permanent vs retryable failures
  const cases = [
    ['23514 size guard -> drop',        { error: { code: '23514', message: 'check' }, status: 400 }, false],
    ['42501 row security -> drop',      { error: { code: '42501', message: 'rls' }, status: 403 }, false],
    ['400 other -> drop',               { error: { code: 'PGRST102', message: 'bad' }, status: 400 }, false],
    ['23505 already stored -> removed', { error: { code: '23505', message: 'dup' }, status: 409 }, false],
    ['500 server -> keep',              { error: { code: '', message: 'srv' }, status: 500 }, true],
    ['429 slow down -> keep',           { error: { code: '', message: 'rate' }, status: 429 }, true],
    ['401 token -> keep',               { error: { code: 'PGRST301', message: 'jwt' }, status: 401 }, true],
    ['0 network -> keep',               { error: { code: '', message: 'net' }, status: 0 }, true],
  ];
  const res7 = [];
  for (const [label, behavior, keep] of cases) {
    const wx = world(); seed(wx, '5000000000010_r.json', baseRow('r')); wx.behaviors.push(behavior);
    await wx.api.flushPendingReports(); await settle();
    res7.push(label + ' ' + ok((queueFiles(wx).length === 1) === keep));
  }
  console.log('7 failure types:\n   ' + res7.join('\n   '));

  // 8. identity changed since the row was queued
  w = world({ userId: 'new-user' });
  seed(w, '5000000000020_x.json', baseRow('x', { user_id: 'old-user' }));
  seed(w, '5000000000021_y.json', baseRow('y', { user_id: 'new-user' }));
  await w.api.flushPendingReports(); await settle();
  const sent = Object.fromEntries(w.inserts.map(c => [c.row.id, c.row.user_id]));
  console.log('8 identity: old id sent as', JSON.stringify(sent.x), ok(sent.x === null), '| same id kept as', JSON.stringify(sent.y), ok(sent.y === 'new-user'));

  // 9. crash handler: the original runs at once, even if the file system is stuck or the original throws
  w = world({ hangWrites: true });
  let prevCalls = 0, prevThrows = false, installed = null;
  w.ctx.ErrorUtils = { getGlobalHandler: () => () => { prevCalls++; if (prevThrows) throw new Error('boom from original'); }, setGlobalHandler: h => { installed = h; } };
  w.api.installGlobalErrorReporting();
  installed(new Error('crash 1'), true);
  const sync1 = prevCalls === 1 && w.writes.some(p => p.endsWith('diag_fatal.json'));
  prevThrows = true; let thrown = null;
  try { installed(new Error('crash 2'), true); } catch (e) { thrown = e.message; }
  prevThrows = false; installed(new Error('plain'), false); await settle();
  console.log('9 crash handler: original called in the same tick', ok(sync1), '| its exception reaches the caller unchanged', ok(thrown === 'boom from original'), '| non-fatal also passes through', ok(prevCalls === 3));

  //   ...and the report saved during the crash is sent on the next launch
  const A = world();
  A.ctx.ErrorUtils = { getGlobalHandler: () => () => {}, setGlobalHandler: h => { installed = h; } };
  A.api.installGlobalErrorReporting(); installed(new Error('fatal at ' + 'https://x.co/p?token=SECRET'), true); await settle();
  const fatalFile = A.files.get('file:///docs/diag_fatal.json');
  const B = world({ files: A.files }); await B.api.flushPendingReports(); await settle();
  const fr = B.inserts[0] && B.inserts[0].row;
  console.log('   next launch: crash file existed', ok(!!fatalFile), '| sent as js_fatal with no user id', ok(fr && fr.category === 'js_fatal' && fr.user_id === null), '| secret redacted', ok(fr && !JSON.stringify(fr).includes('SECRET')), '| file removed', ok(!B.files.has('file:///docs/diag_fatal.json')));

  // 10. rejection tracker: a rejection handled a moment later is not a fault
  w = world(); let tracker = null;
  w.ctx.HermesInternal = { enablePromiseRejectionTracker: cfg => { tracker = cfg; } };
  w.ctx.ErrorUtils = { getGlobalHandler: () => () => {}, setGlobalHandler: () => {} };
  w.api.installGlobalErrorReporting();
  tracker.onUnhandled(1, new Error('late handled')); await w.T.advance(1_000); tracker.onHandled(1); await w.T.advance(5_000);
  const afterHandled = w.inserts.length;
  tracker.onUnhandled(2, new Error('really unhandled')); await w.T.advance(3_100);
  console.log('10 rejections: handled-later reported =', afterHandled, ok(afterHandled === 0), '| truly unhandled reported =', w.inserts.length, ok(w.inserts.length === 1 && w.inserts[0].row.category === 'promise'));

  // 11. a send that never answers is cancelled after 10 s and the row is kept
  w = world(); w.behaviors.push('hang');
  w.api.reportError('audio', 'w', 'slow server', {}); await settle();
  const before = queueFiles(w).length;
  await w.T.advance(10_500);
  console.log('11 send timeout: nothing queued while waiting', ok(before === 0), '| request aborted', ok(w.inserts[0].signal && w.inserts[0].signal.aborted), '| row saved for later', ok(queueFiles(w).length === 1));

  // 12. playback watcher
  const mk = (statusFn, appFn) => { const wx = world(); const sound = { getStatusAsync: async () => { if (appFn) appFn(wx); return statusFn(); } }; return { wx, sound }; };
  const loaded = o => ({ isLoaded: true, shouldPlay: true, isPlaying: false, isBuffering: false, didJustFinish: false, positionMillis: 0, durationMillis: 5000, interrupted: false, ...o });
  const run12 = async (statusFn, appFn, adv) => { const { wx, sound } = mk(statusFn, appFn); wx.api.watchPlaybackStart(sound, () => true, 'clip', 'https://x/a.mp3?token=T'); await wx.T.advance(adv); return wx.inserts.map(c => c.row.category); };
  const stuck   = await run12(() => loaded({}), null, 3_000);
  const intr    = await run12(() => loaded({ interrupted: true }), null, 3_000);
  const bg      = await run12(() => loaded({}), wx => { wx.state.appState = 'background'; }, 3_000);
  const slow    = await run12(() => loaded({ isBuffering: true }), null, 11_000);
  const playing = await run12(() => loaded({ isPlaying: true, positionMillis: 400 }), null, 3_000);
  console.log('12 watcher: stuck ->', JSON.stringify(stuck), ok(stuck.length === 1 && stuck[0] === 'audio_stuck'),
    '| Android pause ->', JSON.stringify(intr), ok(intr.length === 0),
    '| went to background while checking ->', JSON.stringify(bg), ok(bg.length === 0),
    '| still buffering at 10 s ->', JSON.stringify(slow), ok(slow.length === 1 && slow[0] === 'audio_slow'),
    '| playing ->', JSON.stringify(playing), ok(playing.length === 0));
})().catch(e => console.log('TEST ERROR', e));
