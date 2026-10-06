// Logic tests for the loading fixes: backend/topicsLoader.ts, services/identity.ts and the
// request deadline in backend/supabaseClient.ts. Real files, fake network/storage/timers.
// NOT an Android test.
const fs = require('fs'), vm = require('vm');
const root = 'C:/Users/Yakov/Desktop/driving-theory-app';
const ts = require(root + '/node_modules/typescript');
const tr = p => ts.transpileModule(fs.readFileSync(root + '/' + p, 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const settle = async () => { for (let i = 0; i < 40; i++) await Promise.resolve(); await new Promise(r => setImmediate(r)); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ok = c => c ? 'OK' : 'FAIL';

function load(p, mods = {}, extraCtx = {}) {
  const ctx = { exports: {}, console: { warn() {}, log() {}, error() {} }, process: { env: {} }, ...extraCtx,
    require: n => { if (!(n in mods)) throw new Error('unexpected require ' + n); return mods[n]; } };
  vm.createContext(ctx); vm.runInContext(tr(p), ctx); return ctx.exports;
}

(async () => {
  // ───────────────────────── A. topics loader ─────────────────────────
  const { createTopicsLoader } = load('backend/topicsLoader.ts');
  const T = n => Array.from({ length: n }, (_, i) => ({ id: 't' + i }));
  const mk = (o = {}) => {
    const calls = { server: 0, write: 0, failure: [] };
    const deps = {
      fetchFromServer: o.server || (async () => { calls.server++; return T(17); }),
      readStored: o.readStored || (async () => null),
      writeStored: o.writeStored || (async () => { calls.write++; }),
      bundled: () => T(17),
      onServerFailure: e => calls.failure.push(String(e && e.message || e)),
    };
    if (!o.server) {} else { const inner = o.server; deps.fetchFromServer = async () => { calls.server++; return inner(); }; }
    return { loader: createTopicsLoader(deps), calls };
  };

  let r = mk(); let got = await r.loader.get(); await r.loader.get();
  console.log('A1 first launch, server ok: topics', got.length, '| saved for next time', r.calls.write, '| asked server only once', ok(r.calls.server === 1 && r.calls.write === 1 && got.length === 17));

  let release; const slow = new Promise(res => { release = res; });
  r = mk({ readStored: async () => T(15), server: () => slow.then(() => T(17)) });
  const t0 = Date.now(); const quick = await r.loader.get(); const waited = Date.now() - t0;
  const many = await Promise.all([r.loader.get(), r.loader.get(), r.loader.get(), r.loader.get()]);
  console.log('A2 saved copy: answered at once with', quick.length, 'topics in', waited, 'ms WITHOUT waiting for a stuck server', ok(quick.length === 15 && waited < 50), '| 4 more calls, server asked', r.calls.server, 'time(s)', ok(r.calls.server === 1));
  release(); await settle();
  const fresh = await r.loader.get();
  console.log('   after the server answered: next call gives fresh list', fresh.length, ok(fresh.length === 17), '| saved again', ok(r.calls.write === 1));

  r = mk({ server: async () => { throw new Error('network down'); } });
  got = await r.loader.get();
  console.log('A3 server down, nothing saved: bundled list', got.length, ok(got.length === 17), '| failure reported', JSON.stringify(r.calls.failure), ok(r.calls.failure.length === 1));

  r = mk({ readStored: async () => [] , server: async () => [] });
  got = await r.loader.get();
  console.log('A4 empty saved list + empty server list -> bundled', got.length, ok(got.length === 17 && r.calls.failure.length === 1));

  r = mk({ readStored: async () => { throw new Error('storage broken'); } });
  got = await r.loader.get();
  console.log('A5 storage read throws -> still gets server list', got.length, ok(got.length === 17));

  r = mk({ writeStored: async () => { throw new Error('disk full'); } });
  got = await r.loader.get();
  console.log('A6 saving fails -> list still returned', got.length, ok(got.length === 17));

  // the bundled fallback really lists all 17 (the file the app ships)
  const topicsJson = JSON.parse(fs.readFileSync(root + '/content/topics.json', 'utf8'));
  const extra = JSON.parse(fs.readFileSync(root + '/backend/fallbackTopics.json', 'utf8'));
  const ids = new Set([...topicsJson.map(t => t.id), ...extra.map(t => t.id)]);
  console.log('A7 bundled 15 + fallback', extra.length, '=', ids.size, 'distinct topics', ok(ids.size === 17 && extra.every(t => !topicsJson.some(b => b.id === t.id))), '| content/topics.json untouched at', topicsJson.length);

  // ───────────────────────── B. identity ─────────────────────────
  const idm = load('services/identity.ts', { '../backend/supabaseClient': { supabase: null } }, { setTimeout, clearTimeout });
  const U = '11111111-1111-4111-8111-111111111111';
  const fakeAuth = o => { const c = { getSession: 0, signIn: 0 };
    return { c, auth: {
      getSession: () => { c.getSession++; return o.getSession(); },
      signInAnonymously: () => { c.signIn++; return o.signIn ? o.signIn() : Promise.resolve({ data: { user: { id: 'new-user' } }, error: null }); } } }; };
  const W = { session: 40, signIn: 60 };
  const sess = id => () => Promise.resolve({ data: { session: { user: { id } } }, error: null });
  const none  = () => Promise.resolve({ data: { session: null }, error: null });
  const netErr = () => Promise.resolve({ data: { session: null }, error: { name: 'AuthRetryableFetchError', status: 0, message: 'fetch failed' } });
  const hang = () => new Promise(() => {});

  let f = fakeAuth({ getSession: sess(U) }); let res = await idm.resolveUserId(U, f.auth, W);
  console.log('B1 session found ->', res.id === U && res.fromSupabase === true ? 'its id' : 'WRONG', ok(res.id === U && res.fromSupabase && f.c.signIn === 0));

  f = fakeAuth({ getSession: none }); res = await idm.resolveUserId(undefined, f.auth, W);
  console.log('B2 first launch, nothing saved -> new anonymous account', ok(res.id === 'new-user' && res.fromSupabase && res.createdNew && f.c.signIn === 1));

  f = fakeAuth({ getSession: netErr }); res = await idm.resolveUserId(U, f.auth, W);
  console.log('B3 returning user, refresh failed on the NETWORK -> keeps saved id, NO new account', ok(res.id === U && !res.fromSupabase && res.note === 'auth_unreachable' && f.c.signIn === 0));

  f = fakeAuth({ getSession: hang }); const t1 = Date.now(); res = await idm.resolveUserId(U, f.auth, W);
  console.log('B4 returning user, auth stuck -> keeps saved id after', Date.now() - t1, 'ms, NO new account', ok(res.id === U && res.note === 'auth_timeout' && f.c.signIn === 0 && Date.now() - t1 < 500));

  f = fakeAuth({ getSession: hang }); res = await idm.resolveUserId(undefined, f.auth, W);
  console.log('B5 first launch, auth stuck -> signs in (nothing to lose)', ok(res.id === 'new-user' && f.c.signIn === 1));

  f = fakeAuth({ getSession: none, signIn: hang }); res = await idm.resolveUserId(U, f.auth, W);
  console.log('B6 saved id, no session, sign-in stuck -> keeps saved id', ok(res.id === U && !res.fromSupabase && res.note === 'auth_timeout'));

  f = fakeAuth({ getSession: none, signIn: () => Promise.resolve({ data: null, error: { message: 'offline' } }) }); res = await idm.resolveUserId(undefined, f.auth, W);
  console.log('B7 first launch, sign-in fails -> local id, no account', ok(/^[0-9a-f-]{36}$/.test(res.id) && !res.fromSupabase));

  f = fakeAuth({ getSession: () => Promise.reject(new Error('boom')) }); res = await idm.resolveUserId(U, f.auth, W);
  console.log('B8 getSession throws -> keeps saved id', ok(res.id === U && !res.fromSupabase));

  f = fakeAuth({ getSession: none }); res = await idm.resolveUserId('not-a-uuid', f.auth, W);
  console.log('B9 corrupt saved id is ignored (treated as first launch)', ok(res.id === 'new-user' && res.createdNew));

  res = await idm.resolveUserId(U, null, W);
  console.log('B10 no server configured -> saved id', ok(res.id === U && !res.fromSupabase), '| none saved -> local id', ok(/^[0-9a-f-]{36}$/.test((await idm.resolveUserId(undefined, null, W)).id)));

  // ───────────────────────── C. request deadline ─────────────────────────
  let now = 0; const timers = new Map(); let tid = 0;
  const FT = { setTimeout: (fn, ms) => { const id = ++tid; timers.set(id, { fn, at: now + ms }); return id; }, clearTimeout: id => timers.delete(id),
    advance: async ms => { const end = now + ms; for (;;) { let n = null; for (const [id, t] of timers) if (t.at <= end && (!n || t.at < n[1].at)) n = [id, t]; if (!n) break; timers.delete(n[0]); now = n[1].at; n[1].fn(); await settle(); } now = end; await settle(); } };
  const net = { calls: [], mode: 'hang' };
  const fakeFetch = (input, init) => { const c = { url: String(input), signal: init && init.signal }; net.calls.push(c);
    return new Promise((resolve, reject) => {
      if (net.mode === 'ok') return resolve({ ok: true, status: 200 });
      if (net.mode === 'neterr') return reject(new TypeError('Network request failed'));
      c.signal.addEventListener('abort', () => { const e = new Error('Aborted'); e.name = 'AbortError'; reject(e); }); }); };
  let captured = null;
  const sbm = load('backend/supabaseClient.ts', {
    '@supabase/supabase-js': { createClient: (u, k, o) => { captured = o; return { auth: {} }; } },
    '@react-native-async-storage/async-storage': { default: {} },
  }, { fetch: fakeFetch, AbortController, setTimeout: FT.setTimeout, clearTimeout: FT.clearTimeout, Date: { now: () => now },
       process: { env: { EXPO_PUBLIC_SUPABASE_URL: 'https://x.supabase.co', EXPO_PUBLIC_SUPABASE_ANON_KEY: 'k' } } });
  const df = sbm.fetchWithDeadline;
  console.log('C0 the client really uses the deadline wrapper', ok(captured && captured.global && captured.global.fetch === df));

  const D = 'https://x.supabase.co/rest/v1/topics';
  net.mode = 'ok'; let resp = await df(D, {});
  console.log('C1 answer in time passes through', ok(resp.status === 200 && timers.size === 0));

  net.mode = 'hang'; net.calls.length = 0;
  let p = df(D, {}).then(() => 'resolved', e => e.message); await FT.advance(14_000);
  const before = net.calls[0].signal.aborted; await FT.advance(1_500); const msg = await p;
  console.log('C2 data request: still waiting at 14 s', ok(!before), '| gave up at 15 s with', JSON.stringify(msg), ok(/timed out after 15s/.test(msg) && net.calls[0].signal.aborted));

  p = df(D, {}).then(() => 'resolved', e => e.message); await FT.advance(15_500); await p;           // 2nd timeout in a row -> pause starts
  net.calls.length = 0;
  const skipped = await df(D, {}).then(() => 'resolved', e => e.message);
  console.log('C3 after 2 timeouts in a row: next data request fails at once without touching the network', ok(/skipped/.test(skipped) && net.calls.length === 0));
  await FT.advance(20_500); net.mode = 'ok'; net.calls.length = 0; resp = await df(D, {});
  console.log('   after the 20 s pause the network is used again', ok(net.calls.length === 1 && resp.status === 200));

  net.mode = 'hang'; net.calls.length = 0;
  p = df('https://x.supabase.co/auth/v1/token', {}).then(() => 'resolved', e => e.message); await FT.advance(10_500);
  console.log('C4 sign-in / token refresh gives up at 10 s', ok(/timed out after 10s/.test(await p)));
  p = df('https://x.supabase.co/functions/v1/tts', {}).then(() => 'resolved', e => e.message); await FT.advance(20_000);
  const stillWaiting = net.calls[net.calls.length - 1].signal.aborted === false; await FT.advance(10_500);
  const c5 = await p; net.mode = 'ok'; net.calls.length = 0; const after = await df(D, {}).then(() => 'resolved', e => e.message);
  console.log('C5 speech function waits up to 30 s', ok(stillWaiting && /timed out after 30s/.test(c5)), '| its timeouts do not pause data requests', ok(after === 'resolved' && net.calls.length === 1));

  net.mode = 'neterr';
  const ne = await df(D, {}).then(() => 'resolved', e => e.message);
  console.log('C6 an ordinary network failure passes through unchanged', ok(ne === 'Network request failed'));

  net.mode = 'hang'; await FT.advance(25_000); net.calls.length = 0;
  const ac = new AbortController(); p = df(D, { signal: ac.signal }).then(() => 'resolved', e => e.name); ac.abort(); await settle();
  console.log('C7 the caller\'s own cancel still works', ok((await p) === 'AbortError' && net.calls[0].signal.aborted));
})().catch(e => console.log('TEST ERROR', e));
