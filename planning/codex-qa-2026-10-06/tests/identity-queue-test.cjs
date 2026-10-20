// Logic tests for CODEX QA Q09: services/identity.ts (late sign-in kept), services/identityRecovery.ts
// (adopting the server account) and utils/answerQueue.ts (answers kept until saved, moved to the
// signed-in id). Loads the REAL files with fakes for auth, network, storage and timers.
// NOT an Android test. Every expectation is an assertion; any failure exits with code 1.
const fs = require('fs'), vm = require('vm'), path = require('path'), assert = require('assert');
const root = path.resolve(__dirname, '../../..');
const ts = require(root + '/node_modules/typescript');
const tick  = () => new Promise(r => setImmediate(r));
const flush = async () => { for (let i = 0; i < 25; i++) await tick(); };
const deferred = () => { let resolve; const promise = new Promise(r => resolve = r); return { promise, resolve }; };
const load = (file, deps, extra = {}) => {
  const ctx = { exports: {}, console: { warn() {}, error() {}, log() {} }, process: { env: {} }, require: deps, ...extra };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(root + '/' + file, 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, ctx);
  return ctx.exports;
};
const fakeTimers = () => { const map = new Map(); let n = 1;
  return { map, setTimeout: (fn, ms) => { const id = n++; map.set(id, { fn, ms }); return id; }, clearTimeout: id => map.delete(id),
    fire(ms) { for (const [id, t] of [...map]) if (t.ms <= ms) { map.delete(id); t.fn(); } } }; };

const results = [];
async function scenario(name, fn) {
  try { await fn(); results.push(['OK  ', name]); }
  catch (e) { results.push(['FAIL', name + '  ->  ' + e.message.split('\n')[0]]); }
}
const SERVER = '11111111-1111-4111-8111-111111111111';
const OTHER  = '22222222-2222-4222-8222-222222222222';

// ── recovery world ─────────────────────────────────────────────────────────────
function recoveryWorld({ session = null, signInResult = SERVER, late } = {}) {
  const T = fakeTimers();
  const calls = { signIn: 0, adopted: [] };
  let authCb = null; let netCb = null; const unsub = { auth: 0, net: 0 };
  const auth = {
    getSession: async () => ({ data: { session: session ? { user: { id: session } } : null } }),
    signInAnonymously: async () => { calls.signIn++; return signInResult ? { data: { user: { id: signInResult } } } : { error: { message: 'Network request failed' } }; },
    onAuthStateChange: cb => { authCb = cb; return { data: { subscription: { unsubscribe: () => unsub.auth++ } } }; },
  };
  const mod = load('services/identityRecovery.ts', () => ({}));
  const start = (opts) => mod.startIdentityRecovery(
    { currentId: 'local-id', localOnly: true, onAdopt: id => calls.adopted.push(id), ...opts, lateSignIn: late ?? opts.lateSignIn },
    { auth, onConnectivityChange: fn => { netCb = fn; return () => unsub.net++; }, setTimer: T.setTimeout, clearTimer: T.clearTimeout });
  return { T, calls, start, unsub, setSession: s => { session = s; }, setSignIn: r => { signInResult = r; },
    authEvent: s => authCb && authCb('SIGNED_IN', { user: { id: s } }), reconnect: () => netCb && netCb(true) };
}

// ── queue world ────────────────────────────────────────────────────────────────
function queueWorld(results, { writeFails = false, fixedNow = null } = {}) {
  let file = null; const sent = []; const gates = {};
  const FS = { documentDirectory: 'file:///qa/',
    getInfoAsync: async () => ({ exists: file !== null }),
    readAsStringAsync: async () => { await tick(); return file; },
    writeAsStringAsync: async (p, s) => { await tick(); if (writeFails) throw new Error('ENOSPC: no space left'); file = s; } };
  const api = {
    saveAnswer: async (userId, q, ok, retries, id) => {
      sent.push({ userId, q, id });
      if (gates[q]) await gates[q].promise;
      const r = results(q, userId); return typeof r === 'function' ? r() : r; },
    // sign views are sent with their own function; results() sees them as 'view:<signId>'
    recordSignView: async (userId, signId, videoCompleted) => {
      sent.push({ userId, view: signId, videoCompleted });
      const r = results('view:' + signId, userId); return typeof r === 'function' ? r() : r; },
  };
  const net = [], T = fakeTimers();
  const mod = load('utils/answerQueue.ts', p =>
    p.includes('file-system') ? FS : p.endsWith('/api') ? api : p.includes('errorReporter') ? { reportError() {} }
    : p.includes('useNetworkStatus') ? { onConnectivityChange: fn => { net.push(fn); return () => { const i = net.indexOf(fn); if (i >= 0) net.splice(i, 1); }; } } : {},
    { setTimeout: T.setTimeout, clearTimeout: T.clearTimeout,
      ...(fixedNow !== null ? { Date: { now: () => fixedNow } } : {}) });   // the module runs in its own context: its own Date
  return { q: mod, sent, gates, net, T, read: () => file ? JSON.parse(file) : [], setFile: s => { file = s; },
    reconnect: () => net.slice().forEach(fn => fn(true)) };
}

(async () => {
  // identity.ts ---------------------------------------------------------------------
  await scenario('1 resolveUserId: a sign-in still running at the deadline is handed over (not dropped)', async () => {
    const T = fakeTimers(); const signIn = deferred();
    const identity = load('services/identity.ts', () => ({ supabase: null }), { setTimeout: T.setTimeout, clearTimeout: T.clearTimeout });
    let got;
    identity.resolveUserId(undefined, { getSession: async () => ({ data: { session: null } }), signInAnonymously: () => signIn.promise },
      { session: 5, signIn: 15 }).then(v => got = v);
    await flush(); T.fire(15); await flush();
    assert.ok(got && !got.fromSupabase, 'expected a local id first');
    assert.ok(got.lateSignIn, 'lateSignIn missing');
    signIn.resolve({ data: { user: { id: SERVER } } });
    assert.strictEqual(await got.lateSignIn, SERVER);
  });

  // identityRecovery.ts ---------------------------------------------------------
  await scenario('2 Q09 late sign-in finishes: its account is adopted, no second sign-in', async () => {
    const late = deferred();
    const w = recoveryWorld({ late: late.promise });
    w.start({});
    await flush();
    assert.strictEqual(w.calls.signIn, 0, 'started a sign-in while one was running');
    late.resolve(SERVER); await flush();
    assert.deepStrictEqual(w.calls.adopted, [SERVER]);
    assert.strictEqual(w.calls.signIn, 0);
  });

  await scenario('3 first start offline (local id): signs in once when the connection returns', async () => {
    const w = recoveryWorld({ signInResult: null });
    w.start({});
    await flush();                                  // immediate try fails (offline)
    assert.deepStrictEqual(w.calls.adopted, []);
    w.setSignIn(SERVER); w.reconnect(); await flush();
    assert.deepStrictEqual(w.calls.adopted, [SERVER]);
    assert.strictEqual(w.calls.signIn, 2, 'sign-in attempts: ' + w.calls.signIn);
  });

  await scenario('4 a SAVED account with no session yet is never replaced by a new sign-in', async () => {
    const w = recoveryWorld();
    w.start({ currentId: SERVER, localOnly: false });
    await flush(); w.reconnect(); await flush(); w.T.fire(600_000); await flush();
    assert.strictEqual(w.calls.signIn, 0, 'signed in over a saved account');
    w.authEvent(SERVER); await flush(); w.T.fire(0); await flush();
    assert.deepStrictEqual(w.calls.adopted, [SERVER], 'session coming back was not adopted');
  });

  await scenario('5 a session that is already there is adopted at once', async () => {
    const w = recoveryWorld({ session: OTHER });
    w.start({});
    await flush();
    assert.deepStrictEqual(w.calls.adopted, [OTHER]);
    assert.strictEqual(w.calls.signIn, 0);
  });

  await scenario('6 after adopting (or stop) everything is unsubscribed and nothing fires again', async () => {
    const w = recoveryWorld({ session: OTHER });
    const stop = w.start({});
    await flush(); stop();
    w.authEvent(SERVER); w.T.fire(1_000_000); w.reconnect(); await flush();
    assert.deepStrictEqual(w.calls.adopted, [OTHER]);
    assert.strictEqual(w.unsub.auth, 1); assert.strictEqual(w.unsub.net, 1);
  });

  // answerQueue.ts ----------------------------------------------------------------
  await scenario('7 Q09 an answer that could not be saved STAYS in the queue', async () => {
    const w = queueWorld(() => 'unreachable');
    await w.q.enqueue({ userId: SERVER, questionId: 'q1', isCorrect: true });
    await w.q.flushQueue(SERVER);
    assert.strictEqual(w.read().length, 1, 'queue: ' + JSON.stringify(w.read()));
  });

  await scenario('8 Q09 answers kept under a local id are sent under the signed-in id', async () => {
    const w = queueWorld((q, userId) => userId === SERVER ? 'saved' : 'rejected');
    await w.q.enqueue({ userId: 'local-id', questionId: 'q1', isCorrect: true });
    await w.q.enqueue({ userId: 'local-id', questionId: 'q2', isCorrect: false });
    await w.q.flushQueue(SERVER);
    assert.deepStrictEqual(w.sent.map(s => s.userId), [SERVER, SERVER]);
    assert.strictEqual(w.read().length, 0, 'left in queue: ' + w.read().length);
  });

  await scenario('9 no connection: the flush stops after the first failure (no pointless retries)', async () => {
    const w = queueWorld(() => 'unreachable');
    for (const q of ['q1', 'q2', 'q3']) await w.q.enqueue({ userId: SERVER, questionId: q, isCorrect: true });
    await w.q.flushQueue(SERVER);
    assert.strictEqual(w.sent.length, 1, 'sent: ' + w.sent.length);
    assert.strictEqual(w.read().length, 3);
    assert.ok(w.read().every(a => !a.rejections), '"no connection" must not count as a refusal');
  });

  await scenario('10 an answer the server keeps refusing is given up after 5 separate refusals', async () => {
    const w = queueWorld(() => 'rejected');
    await w.q.enqueue({ userId: SERVER, questionId: 'q1', isCorrect: true });
    for (let i = 0; i < 4; i++) await w.q.flushQueue(SERVER);
    assert.strictEqual(w.read().length, 1, 'given up too early');
    await w.q.flushQueue(SERVER);
    assert.strictEqual(w.read().length, 0, 'never given up');
  });

  await scenario('11 an answer added WHILE a flush is sending is not lost', async () => {
    const w = queueWorld(() => 'saved');
    await w.q.enqueue({ userId: SERVER, questionId: 'q1', isCorrect: true });
    w.gates.q1 = deferred();
    const flushing = w.q.flushQueue(SERVER); await flush();
    await w.q.enqueue({ userId: SERVER, questionId: 'q2', isCorrect: true });   // answered meanwhile
    w.gates.q1.resolve(); await flushing; await flush();
    const left = w.read().map(a => a.questionId);
    assert.deepStrictEqual(left, ['q2'], 'queue now: ' + JSON.stringify(left));
  });

  await scenario('12 two flushes at once send each answer once', async () => {
    const w = queueWorld(() => 'saved');
    await w.q.enqueue({ userId: SERVER, questionId: 'q1', isCorrect: true });
    await Promise.all([w.q.flushQueue(SERVER), w.q.flushQueue(SERVER)]);
    assert.strictEqual(w.sent.length, 1, 'sent: ' + w.sent.length);
  });

  // ── the REAL api.saveAnswer, cut out of backend/api.ts (R6) ─────────────────────
  const realSaveAnswer = (rpcResult) => {
    const src = fs.readFileSync(root + '/backend/api.ts', 'utf8').replace(/\r\n/g, '\n');
    const start = src.indexOf('export type SaveAnswerResult');
    const end = src.indexOf('/**\n * Record that a user watched', start);
    assert.ok(start > 0 && end > start, 'saveAnswer not found in backend/api.ts');
    const identity = load('services/identity.ts', () => ({ supabase: null }));
    const ctx = { exports: {}, USE_MOCK: false, console: { warn() {} }, setTimeout: fn => { fn(); return 0; },
      looksLikeNetworkFailure: identity.looksLikeNetworkFailure,
      supabase: { rpc: async () => (typeof rpcResult === 'function' ? rpcResult() : rpcResult) } };
    vm.runInNewContext(ts.transpileModule(src.slice(start, end), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, ctx);
    return ctx.exports.saveAnswer;
  };

  await scenario('13 R6 saveAnswer: 429 / 408 / 401 / 5xx / no connection are temporary, a refusal is not', async () => {
    const cases = [
      [{ error: { message: 'Too many requests' }, status: 429 }, 'unreachable'],
      [{ error: { message: 'Request Timeout' }, status: 408 }, 'unreachable'],
      [{ error: { message: 'JWT expired', code: 'PGRST301' }, status: 401 }, 'unreachable'],
      [{ error: { message: 'upstream error' }, status: 503 }, 'unreachable'],
      [{ error: { message: 'TypeError: Network request failed' }, status: 0 }, 'unreachable'],
      [{ error: { message: 'not authorized', code: 'P0001' }, status: 400 }, 'rejected'],
      [{ error: null, status: 204 }, 'saved'],
    ];
    for (const [rpc, want] of cases) {
      const got = await realSaveAnswer(rpc)('u', 'q', true);
      assert.strictEqual(got, want, 'status ' + rpc.status + ': ' + got);
    }
  });

  await scenario('14 R6 five flushes that all hit HTTP 429 do NOT delete the unsaved exam answer', async () => {
    const saveAnswer = realSaveAnswer({ error: { message: 'Too many requests' }, status: 429 });
    let file = null;
    const FS = { documentDirectory: 'file:///qa/', getInfoAsync: async () => ({ exists: file !== null }),
      readAsStringAsync: async () => file, writeAsStringAsync: async (p, t) => { file = t; } };
    const T14 = fakeTimers();
    const q = load('utils/answerQueue.ts', p => p.includes('file-system') ? FS : p.endsWith('/api') ? { saveAnswer }
      : p.includes('errorReporter') ? { reportError() {} } : p.includes('useNetworkStatus') ? { onConnectivityChange: () => () => {} } : {},
      { setTimeout: T14.setTimeout, clearTimeout: T14.clearTimeout });
    await q.enqueue({ userId: SERVER, questionId: 'q1', isCorrect: true });
    for (let i = 0; i < 6; i++) await q.flushQueue(SERVER);
    assert.strictEqual(await q.getQueueSize(), 1, 'the answer was deleted');
  });

  // ── R8: answers kept during a disconnection are sent when it comes back ─────────
  await scenario('15 R8 an answer kept while offline is sent when the connection returns (no app restart)', async () => {
    let online = false;
    const w = queueWorld(() => online ? 'saved' : 'unreachable');
    await w.q.enqueue({ userId: SERVER, questionId: 'q1', isCorrect: true });
    await w.q.flushQueue(SERVER);                       // confirmed account, but offline: kept
    assert.strictEqual(w.read().length, 1);
    assert.strictEqual(w.net.length, 1, 'not listening for the connection');
    online = true; w.reconnect(); await flush();
    assert.strictEqual(w.read().length, 0, 'still waiting after reconnect');
    assert.strictEqual(w.net.length, 0, 'still listening after the queue emptied');
  });

  await scenario('16 R8 the exam asks to retry an unsaved answer: sent on the slow timer as well', async () => {
    let up = false;
    const w = queueWorld(() => up ? 'saved' : 'unreachable');
    await w.q.flushQueue(SERVER);                       // this run has a confirmed account (queue empty)
    await w.q.enqueue({ userId: SERVER, questionId: 'q2', isCorrect: false });
    w.q.retryQueueLater();
    up = true; w.T.fire(60_000); await flush();
    assert.strictEqual(w.read().length, 0, 'not sent by the timer');
  });

  await scenario('17 R8 no confirmed account yet: nothing is sent on reconnect (a refusal would count against it)', async () => {
    const w = queueWorld(() => 'rejected');
    await w.q.enqueue({ userId: 'local-id', questionId: 'q3', isCorrect: true });
    w.q.retryQueueLater();
    w.reconnect(); w.T.fire(1_000_000); await flush();
    assert.strictEqual(w.sent.length, 0, 'sent without a confirmed account');
    assert.strictEqual(w.read()[0].rejections ?? 0, 0);
  });

  // ── CODEX QA round 3, S3: a server that stays out of reach for long ────────────────────────────
  const fireNext = async (w) => {   // fires the one pending timer, returns its delay
    const [[id, t]] = [...w.T.map]; w.T.map.delete(id); t.fn(); await flush(); return t.ms;
  };

  await scenario('18 S3 server out of reach for long: tries go on every 10 minutes, sent once it is back', async () => {
    let up = false;
    const w = queueWorld(() => up ? 'saved' : 'unreachable');
    await w.q.enqueue({ userId: SERVER, questionId: 'q1', isCorrect: true });
    await w.q.flushQueue(SERVER);
    const delays = [];
    for (let i = 0; i < 5; i++) delays.push(await fireNext(w));
    assert.deepStrictEqual(delays, [60_000, 180_000, 600_000, 600_000, 600_000], 'delays: ' + delays);
    assert.strictEqual(w.T.map.size, 1, 'stopped trying while the answer waits');
    up = true;                                        // the server is back; the phone never disconnected
    await fireNext(w);
    assert.strictEqual(w.read().length, 0, 'not sent after the server came back');
    assert.strictEqual(w.T.map.size, 0, 'timer left after the queue emptied');
    assert.strictEqual(w.net.length, 0, 'still listening after the queue emptied');
  });

  await scenario('19 S3 a server that REFUSES: the timer still stops after the third try (refusals count)', async () => {
    const w = queueWorld(() => 'rejected');
    await w.q.enqueue({ userId: SERVER, questionId: 'q1', isCorrect: true });
    await w.q.flushQueue(SERVER);
    for (let i = 0; i < 3; i++) await fireNext(w);
    assert.strictEqual(w.T.map.size, 0, 'kept trying on refusals: the answer would be given up early');
    assert.strictEqual(w.read().length, 1, 'given up by the timer alone');
    assert.strictEqual(w.read()[0].rejections, 4);
  });

  // ── practice answers through the queue (owner's decision, round 3) ─────────────────────────────
  await scenario('20 practice answer saved now: sent once with its queue id, nothing left on the phone', async () => {
    const w = queueWorld(() => 'saved');
    await w.q.saveAnswerKept(SERVER, 'p1', true);
    assert.strictEqual(w.sent.length, 1);
    assert.ok(w.sent[0].id && w.sent[0].id.startsWith(SERVER + '_p1_'), 'no queue id as submission id: ' + w.sent[0].id);
    assert.strictEqual(w.read().length, 0, 'left in queue');
  });

  await scenario('21 practice answer given offline: kept on the phone and sent when the connection returns', async () => {
    let online = false;
    const w = queueWorld(() => online ? 'saved' : 'unreachable');
    await w.q.flushQueue(SERVER);                       // app start: the account is confirmed
    await w.q.saveAnswerKept(SERVER, 'p2', false);
    assert.strictEqual(w.read().length, 1, 'lost: not kept on the phone');
    online = true; w.reconnect(); await flush();
    assert.strictEqual(w.read().length, 0, 'not sent on reconnect');
    assert.strictEqual(new Set(w.sent.map(s => s.id)).size, 1, 'sent under different submission ids (could count twice)');
  });

  await scenario('22 answer when the phone storage is full: still sent now (exam and practice)', async () => {
    const w = queueWorld(() => 'saved', { writeFails: true });
    await w.q.saveAnswerKept(SERVER, 'p3', true);
    assert.strictEqual(w.sent.length, 1, 'not sent at all');
  });

  // ── sign views through the queue (owner's decision, round 3) ───────────────────────────────────
  await scenario('23 sign viewed offline: kept, then sent with the sign view function on reconnect', async () => {
    let online = false;
    const w = queueWorld(() => online ? 'saved' : 'unreachable');
    await w.q.flushQueue(SERVER);
    await w.q.saveSignViewKept(SERVER, '814', true);
    assert.strictEqual(w.read().length, 1, 'lost: not kept on the phone');
    assert.strictEqual(w.read()[0].kind, 'signView');
    online = true; w.reconnect(); await flush();
    assert.strictEqual(w.read().length, 0, 'not sent on reconnect');
    assert.ok(w.sent.every(s => s.view === '814' && s.videoCompleted === true && !('q' in s)),
      'sent the wrong way: ' + JSON.stringify(w.sent));
  });

  await scenario('24 answers and sign views kept under a local id: each sent its own way, under the account', async () => {
    const w = queueWorld((what, userId) => userId === SERVER ? 'saved' : 'rejected');
    await w.q.enqueue({ userId: 'local-id', questionId: 'q1', isCorrect: true });
    await w.q.saveSignViewKept('local-id', '301', false);   // refused live (local id): kept
    await w.q.flushQueue(SERVER);
    const flushed = w.sent.slice(-2);
    assert.deepStrictEqual(flushed.map(s => s.q ? 'answer:' + s.q : 'view:' + s.view), ['answer:q1', 'view:301']);
    assert.ok(flushed.every(s => s.userId === SERVER), 'not moved to the account: ' + JSON.stringify(flushed));
    assert.strictEqual(w.read().length, 0, 'left in queue');
  });

  await scenario('25 a queue file written by the store version (entries with no kind) is still sent as answers', async () => {
    const w = queueWorld(() => 'saved');
    await w.q.enqueue({ userId: SERVER, questionId: 'old', isCorrect: true });
    const old = w.read().map(({ kind, ...rest }) => ({ ...rest, id: SERVER + '_old_1700000000000' }));
    assert.ok(old.every(e => !('kind' in e)));
    w.setFile(JSON.stringify(old));
    await w.q.flushQueue(SERVER);
    assert.deepStrictEqual(w.sent.slice(-1).map(s => [s.q, s.id]), [['old', SERVER + '_old_1700000000000']]);
    assert.strictEqual(w.read().length, 0);
  });

  await scenario('26 two views of the same sign in the same millisecond: removing one keeps the other', async () => {
    const w = queueWorld(() => 'unreachable', { fixedNow: 1700000000000 });   // the clock does not move
    await w.q.saveSignViewKept(SERVER, '814', false);
    await w.q.saveSignViewKept(SERVER, '814', false);
    const entries = w.read();
    assert.strictEqual(entries.length, 2);
    assert.notStrictEqual(entries[0].id, entries[1].id, 'same id: dequeue would remove both');
    await w.q.dequeue(entries[0].id);
    assert.deepStrictEqual(w.read().map(e => e.id), [entries[1].id]);
  });

  // ── the REAL api.recordSignView, cut out of backend/api.ts ─────────────────────────────────────
  await scenario('27 recordSignView: says saved / unreachable / rejected like saveAnswer (it said nothing)', async () => {
    const src = fs.readFileSync(root + '/backend/api.ts', 'utf8').replace(/\r\n/g, '\n');
    const start = src.indexOf('export type SaveAnswerResult');
    const end = src.indexOf('/**\n * Fetch a user\'s progress', start);
    assert.ok(start > 0 && end > start, 'recordSignView not found in backend/api.ts');
    const identity = load('services/identity.ts', () => ({ supabase: null }));
    const cases = [
      [{ error: null, status: 204 }, 'saved'],
      [{ error: { message: 'Too many requests' }, status: 429 }, 'unreachable'],
      [{ error: { message: 'TypeError: Network request failed' }, status: 0 }, 'unreachable'],
      [{ error: { message: 'JWT expired', code: 'PGRST301' }, status: 401 }, 'unreachable'],
      [{ error: { message: 'upstream error' }, status: 502 }, 'unreachable'],
      [{ error: { message: 'not authorized', code: 'P0001' }, status: 400 }, 'rejected'],
    ];
    for (const [rpc, want] of cases) {
      const ctx = { exports: {}, USE_MOCK: false, console: { warn() {} }, setTimeout: fn => { fn(); return 0; },
        looksLikeNetworkFailure: identity.looksLikeNetworkFailure, supabase: { rpc: async () => rpc } };
      vm.runInNewContext(ts.transpileModule(src.slice(start, end), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, ctx);
      const got = await ctx.exports.recordSignView('u', '814', true);
      assert.strictEqual(got, want, 'status ' + rpc.status + ': ' + got);
    }
  });

  for (const [mark, name] of results) console.log(mark, name);
  const failed = results.filter(r => r[0] === 'FAIL').length;
  console.log(failed ? `\n${failed} FAILED` : '\nALL PASSED');
  process.exitCode = failed ? 1 : 0;
})().catch(e => { console.error(e); process.exitCode = 1; });
