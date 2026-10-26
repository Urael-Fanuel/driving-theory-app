// Logic test for services/ttsStats.ts (anonymous counters of recorded vs live voice).
// Loads the REAL file with a fake database client and a fake app state.
// NOT a database test: the SQL (backend/migration_tts_stats.sql) is only checked as text in scenario 8.
// Run from anywhere:  node tts-stats-test.cjs
const fs = require('fs'), vm = require('vm'), path = require('path'), assert = require('assert');
const root = path.resolve(__dirname, '../../..');
const ts = require(root + '/node_modules/typescript');
const flush = async () => { for (let i = 0; i < 40; i++) await Promise.resolve(); };

function load(opts = {}) {
  const calls = [], listeners = [], requests = [];
  const state = { fail: !!opts.fail, throws: !!opts.throws, os: opts.os || 'android', hang: !!opts.hang };
  // The service now calls the database function directly with the PUBLIC key (no user token).
  const fetch = async (url, init) => {
    requests.push({ url, headers: init.headers, signal: init.signal });
    const body = JSON.parse(init.body);
    if (state.hang) return new Promise((_, rej) => init.signal && init.signal.addEventListener('abort', () => rej(new Error('aborted'))));
    calls.push({ name: url.split('/').pop(), args: body });
    if (state.throws) throw new Error('offline');
    return { ok: !state.fail };
  };
  const timers = [];
  const ctx = { exports: {}, Promise, fetch, AbortController,
    process: { env: opts.noEnv ? {} : { EXPO_PUBLIC_SUPABASE_URL: 'https://x.supabase.co', EXPO_PUBLIC_SUPABASE_ANON_KEY: 'PUBLIC-ANON-KEY' } },
    setTimeout: (fn, ms) => { const t = { fn, ms }; timers.push(t); return timers.length; },
    clearTimeout: id => { if (timers[id - 1]) timers[id - 1].cleared = true; },
    require: p =>
    p === 'react-native' ? { AppState: { addEventListener: (_t, fn) => { listeners.push(fn); return { remove() {} }; } }, Platform: { get OS() { return state.os; } } }
    : p === 'expo-application' ? { nativeApplicationVersion: '1.0.1', nativeBuildVersion: '9' }
    : p.endsWith('supabaseClient') ? (() => { throw new Error('the counters must not use the signed-in client'); })() : {} };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(root + '/services/ttsStats.ts', 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText, ctx);
  return { api: ctx.exports, calls, listeners, state, requests, timers };
}

const results = [];
async function scenario(name, fn) {
  try { await Promise.race([fn(), new Promise((_, rej) => setTimeout(() => rej(new Error('hung')), 3000))]); results.push(['OK  ', name]); }
  catch (e) { results.push(['FAIL', name + '  ->  ' + String(e.message).split('\n')[0]]); }
}

(async () => {
  await scenario('1 nothing is sent for a few sentences; the counts go out when the app is left', async () => {
    const L = load();
    L.api.countTts('recorded'); L.api.countTts('recorded'); L.api.countTts('live');
    await flush(); assert.strictEqual(L.calls.length, 0);
    L.listeners[0]('background'); await flush();
    assert.deepStrictEqual(JSON.parse(JSON.stringify(L.calls)), [{ name: 'bump_tts_stats', args:
      { p_app_version: '1.0.1 (9)', p_platform: 'android', p_recorded: 2, p_live: 1, p_recorded_failed: 0 } }]);
  });

  await scenario('2 coming back to the foreground sends nothing', async () => {
    const L = load(); L.api.countTts('live'); L.listeners[0]('active'); await flush();
    assert.strictEqual(L.calls.length, 0);
  });

  await scenario('3 after 25 sentences it sends by itself, and only the counts (no text, no user)', async () => {
    const L = load();
    for (let i = 0; i < 25; i++) L.api.countTts(i % 5 === 0 ? 'recorded_failed' : 'recorded');
    await flush();
    assert.strictEqual(L.calls.length, 1);
    assert.deepStrictEqual(Object.keys(L.calls[0].args).sort(), ['p_app_version', 'p_live', 'p_platform', 'p_recorded', 'p_recorded_failed']);
    assert.strictEqual(L.calls[0].args.p_recorded + L.calls[0].args.p_recorded_failed, 25);
  });

  await scenario('4 offline or refused: the counts are kept and sent with the next batch', async () => {
    const L = load({ throws: true });
    L.api.countTts('live'); L.api.countTts('live'); await L.api.flushTtsStats();
    L.state.throws = false; L.api.countTts('recorded');
    await L.api.flushTtsStats();
    const last = L.calls[L.calls.length - 1].args;
    assert.deepStrictEqual([last.p_live, last.p_recorded], [2, 1]);
    const R = load({ fail: true }); R.api.countTts('live'); await R.api.flushTtsStats();
    R.state.fail = false; await R.api.flushTtsStats();
    assert.strictEqual(R.calls[R.calls.length - 1].args.p_live, 1);
  });

  await scenario('5 never more than 200 of a kind per call (the server limit); the rest follows in the next call', async () => {
    const L = load();
    for (let i = 0; i < 450; i++) L.api.countTts('live');
    await L.api.flushTtsStats(); await flush();
    const sent = L.calls.map(c => c.args.p_live);
    assert.ok(sent.every(n => n <= 200), JSON.stringify(sent));
    assert.strictEqual(sent.reduce((a, b) => a + b, 0), 450);
  });

  await scenario('6 two flushes at the same moment do not send the same counts twice', async () => {
    const L = load();
    for (let i = 0; i < 10; i++) L.api.countTts('recorded');
    await Promise.all([L.api.flushTtsStats(), L.api.flushTtsStats(), L.api.flushTtsStats()]);
    assert.strictEqual(L.calls.reduce((a, c) => a + c.args.p_recorded, 0), 10);
  });

  await scenario('7 an unknown platform sends nothing; nothing to send sends nothing', async () => {
    const L = load({ os: 'web' }); L.api.countTts('live'); await L.api.flushTtsStats();
    assert.strictEqual(L.calls.length, 0);
    const M = load(); await M.api.flushTtsStats(); assert.strictEqual(M.calls.length, 0);
  });

  await scenario('8 migration text: counters only, locked table, limited function (static check, NOT executed)', async () => {
    const sql = fs.readFileSync(root + '/backend/migration_tts_stats.sql', 'utf8');
    assert.ok(!/user_id|device|text_|created_at/i.test(sql.replace(/--.*$/gm, '')), 'must not store anything about a person');
    assert.ok(/ENABLE ROW LEVEL SECURITY/.test(sql) && /REVOKE ALL ON public\.tts_daily_stats FROM PUBLIC, anon, authenticated/.test(sql));
    assert.ok(/SECURITY DEFINER SET search_path = ''/.test(sql));
    assert.ok(/> 200 THEN/.test(sql) && /NOT IN \('android', 'ios'\)/.test(sql));
    assert.ok(/GRANT EXECUTE ON FUNCTION public\.bump_tts_stats\(TEXT, TEXT, INT, INT, INT\) TO anon, authenticated/.test(sql));
    assert.ok(/^BEGIN;/m.test(sql) && /^COMMIT;/m.test(sql));
  });

  await scenario('9 CODEX round 3: sent with the PUBLIC key only, never a user token, to the counters function', async () => {
    const L = load(); L.api.countTts('live'); await L.api.flushTtsStats();
    assert.strictEqual(L.requests.length, 1);
    const r = L.requests[0];
    assert.strictEqual(r.url, 'https://x.supabase.co/rest/v1/rpc/bump_tts_stats');
    assert.strictEqual(r.headers.apikey, 'PUBLIC-ANON-KEY');
    assert.strictEqual(r.headers.Authorization, undefined, 'must not carry any Authorization (no user token; the publishable key goes in apikey only)');
  });

  await scenario('10 a request that never answers is given up after 10 s and the counts are kept', async () => {
    const L = load({ hang: true }); L.api.countTts('recorded'); L.api.countTts('recorded');
    const p = L.api.flushTtsStats(); await flush();
    const t = L.timers.find(x => x.ms === 10000 && !x.cleared); assert.ok(t, 'no give-up timer');
    t.fn(); await p;
    L.state.hang = false; await L.api.flushTtsStats();
    assert.strictEqual(L.calls[L.calls.length - 1].args.p_recorded, 2);
  });

  await scenario('11 without the app address or key nothing is sent and nothing is lost', async () => {
    const L = load({ noEnv: true }); L.api.countTts('live'); await L.api.flushTtsStats();
    assert.strictEqual(L.requests.length, 0);
  });

  await scenario('12 CODEX round 3 D2: the SQL folds unknown versions and caps rows per day (static check, NOT executed)', async () => {
    const sql = fs.readFileSync(root + '/backend/migration_tts_stats.sql', 'utf8');
    assert.ok(/v_version := 'other'/.test(sql) && sql.includes("!~ '^[0-9]{1,3}"), 'unknown version not folded');
    assert.ok(/>= 40 THEN/.test(sql), 'no daily row cap');
    assert.ok(/VALUES \(\(now\(\) AT TIME ZONE 'UTC'\)::date, v_version,/.test(sql), 'the folded version is not the one stored');
  });

  await scenario('13 CODEX round 4: the 40-row admission is serialized per day and platform (hard cap), static check', async () => {
    const sql = fs.readFileSync(root + '/backend/migration_tts_stats.sql', 'utf8');
    const lock = sql.indexOf('pg_advisory_xact_lock'), check = sql.indexOf('>= 40 THEN');
    assert.ok(lock > 0 && lock < check, 'no lock before the row-count check');
    assert.ok(!/Nothing in a row\s*--\s*can be tied to a person/.test(sql), 'absolute anonymity claim still there');
  });

  for (const [s, n] of results) console.log(s, n);
  const bad = results.filter(r => r[0] === 'FAIL').length;
  console.log(`\n${results.length - bad} of ${results.length} scenarios passed`);
  process.exitCode = bad ? 1 : 0;
})().catch(e => { console.log('TEST ERROR', e); process.exitCode = 1; });
