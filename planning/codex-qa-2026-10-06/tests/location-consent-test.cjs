// Logic test for hooks/useSponsorAd.ts and the location "no" (CODEX QA Q11 + R7 + round 3 S1/S2).
// Loads the REAL hook with a fake api, consent state, decline notifications, IP lookup, connectivity
// and timers. The fake server row (state.row) holds the IP city. NOT an Android test.
// Every expectation is an assertion; any failure exits with code 1.
const fs = require('fs'), vm = require('vm'), path = require('path'), assert = require('assert');
const root = path.resolve(__dirname, '../../..');
const ts = require(root + '/node_modules/typescript');
const tick  = () => new Promise(r => setImmediate(r));
const flush = async () => { for (let i = 0; i < 25; i++) await tick(); };
const deferred = () => { let resolve; const promise = new Promise(r => resolve = r); return { promise, resolve }; };
const plain = v => JSON.parse(JSON.stringify(v));
const USER  = '11111111-1111-4111-8111-111111111111';
const LOCAL = 'local-id';

function world(initialConsent, { holdAds = false, wipeOk = true, hasLocation = false, holdWrite = false } = {}) {
  const calls = { update: [], wipes: 0, sponsor: [], shown: [] };
  const lookup = deferred();
  const writeGate = deferred();
  const adGates = [], wipeGates = [];
  // row: the IP city on the server. A wipe is applied when SENT (its answer may be held), a write
  // when its gate opens: so a held write can land after a wipe, like a slow request in the field.
  const state = { consent: initialConsent, wipeOk, row: hasLocation ? 'Netanya' : null, holdWipeAnswers: false };
  const declineListeners = new Set();
  const cleanups = [];
  const net = [];
  const timers = new Map(); let nextTimer = 1;
  const api = {
    userHasLocation: async () => hasLocation,
    updateUserIpCity: async (id, city) => { calls.update.push(city); if (holdWrite) await writeGate.promise; state.row = city; },
    clearUserIpCity: async () => {
      calls.wipes++;
      const ok = state.wipeOk;
      if (ok) state.row = null;
      if (state.holdWipeAnswers) { const g = deferred(); wipeGates.push(g); await g.promise; }
      return ok;
    },
    getSponsorAd: async (id, category, opts) => {
      calls.sponsor.push(opts === undefined ? 'no options' : plain(opts));
      const ad = opts && opts.useIpCity ? { name: 'ip-matched' } : { name: 'no-ip' };
      if (!holdAds) return ad;
      const g = deferred(); adGates.push({ g, ad }); return g.promise;
    },
  };
  const react = { useState: v => [v, x => calls.shown.push(x === null ? null : x.name)], useEffect: fn => { const c = fn(); if (c) cleanups.push(c); } };
  const deps = p =>
    p === 'react'                    ? react :
    p.endsWith('/api')               ? api :
    p.endsWith('/useLocationPrompt') ? { getLocationConsentState: async () => state.consent,
                                         onLocationDeclined: fn => { declineListeners.add(fn); return () => declineListeners.delete(fn); } } :
    p.endsWith('/useNetworkStatus')  ? { onConnectivityChange: fn => { net.push(fn); return () => { const i = net.indexOf(fn); if (i >= 0) net.splice(i, 1); }; } } :
    p.endsWith('/supabaseClient')    ? { supabase: { functions: { invoke: () => lookup.promise } } } : {};
  const ctx = { exports: {}, console: { warn() {}, error() {}, log() {} }, process: { env: {} }, require: deps,
    setTimeout: (fn, ms) => { const id = nextTimer++; timers.set(id, { fn, ms }); return id; },
    clearTimeout: id => timers.delete(id) };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(root + '/hooks/useSponsorAd.ts', 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, ctx);
  return {
    mount: (id = USER) => ctx.exports.useSponsorAd(id),
    unmountAll: () => cleanups.splice(0).forEach(c => c()),
    calls, lookup, state, adGates, wipeGates, writeGate, net, timers,
    // like useLocationPrompt handleNotNow: saved first, then every listener told, with the user's id
    decline: (id = USER) => { state.consent = 'declined'; declineListeners.forEach(fn => fn(id)); },
    reconnect: () => net.slice().forEach(fn => fn(true)),
    fireTimers: () => { for (const [id, t] of [...timers]) { timers.delete(id); t.fn(); } },
    timerDelays: () => [...timers.values()].map(t => t.ms),
  };
}

const results = [];
async function scenario(name, fn) {
  try { await fn(); results.push(['OK  ', name]); }
  catch (e) { results.push(['FAIL', name + '  ->  ' + e.message.split('\n')[0]]); }
}

(async () => {
  await scenario('1 Q11 "not now" while the IP lookup is on its way: the city is NOT written', async () => {
    const w = world('unknown');
    w.mount(); await flush();
    w.state.consent = 'declined';
    w.lookup.resolve({ data: { city: 'Netanya' }, error: null }); await flush();
    assert.deepStrictEqual(w.calls.update, [], 'city written after the no: ' + JSON.stringify(w.calls.update));
  });

  await scenario('2 never asked: the IP city is still saved (unchanged behavior)', async () => {
    const w = world('unknown');
    w.mount(); await flush();
    w.lookup.resolve({ data: { city: 'Netanya' }, error: null }); await flush();
    assert.deepStrictEqual(w.calls.update, ['Netanya']);
  });

  await scenario('3 Q11 after a "no", ads never match on the IP city', async () => {
    const w = world('declined');
    w.mount(); await flush();
    assert.deepStrictEqual(w.calls.sponsor, [{ useIpCity: false }], 'lookups: ' + JSON.stringify(w.calls.sponsor));
  });

  await scenario('4 after a "no", once the server confirmed the wipe it is not repeated in this run', async () => {
    const w = world('declined');
    w.mount(); await flush();
    w.mount(); await flush();
    assert.strictEqual(w.calls.wipes, 1, 'wipes: ' + w.calls.wipes);
  });

  await scenario('5 R7 a wipe that FAILED (no connection) is tried again until the server confirms it', async () => {
    const w = world('declined', { wipeOk: false });
    w.mount(); await flush();
    w.mount(); await flush();
    assert.strictEqual(w.calls.wipes, 2, 'not retried: ' + w.calls.wipes);
    w.state.wipeOk = true;
    w.mount(); await flush();
    w.mount(); await flush();
    assert.strictEqual(w.calls.wipes, 3, 'kept wiping after success: ' + w.calls.wipes);
  });

  await scenario('6 approved: no IP lookup, ads may still use every tier', async () => {
    const w = world('approved');
    w.mount(); await flush();
    assert.deepStrictEqual(w.calls.update, []);
    assert.strictEqual(w.calls.wipes, 0);
    assert.deepStrictEqual(w.calls.sponsor[0], { useIpCity: true });
  });

  await scenario('7 R7 "not now" while an ad lookup is on its way: its IP-based result is NOT shown', async () => {
    const w = world('unknown', { holdAds: true, hasLocation: true });
    w.mount(); await flush();
    assert.strictEqual(w.adGates.length, 1, 'no ad lookup started');
    w.decline(); await flush();                              // the user says no meanwhile
    w.adGates[0].g.resolve(w.adGates[0].ad); await flush();  // the old, IP-based answer arrives
    for (const g of w.adGates.slice(1)) g.g.resolve(g.ad);   // newer lookups (without IP) answer
    await flush();
    assert.ok(!w.calls.shown.includes('ip-matched'), 'IP-based ad shown after the no: ' + JSON.stringify(w.calls.shown));
    assert.ok(w.calls.sponsor.slice(1).every(o => o.useIpCity === false), 'looked again WITH the IP city');
  });

  await scenario('8 R7 an ad already on screen is removed at once when the user says "not now"', async () => {
    const w = world('unknown', { hasLocation: true });
    w.mount(); await flush();
    assert.deepStrictEqual(w.calls.shown, ['ip-matched']);
    w.decline(); await flush();
    assert.strictEqual(w.calls.shown[1], null, 'not removed: ' + JSON.stringify(w.calls.shown));
    assert.strictEqual(w.calls.shown[w.calls.shown.length - 1], 'no-ip', 'not looked up again without the IP city');
  });

  await scenario('9 R7 an IP lookup earlier in the same run does not skip the wipe after a later "no"', async () => {
    const w = world('unknown');
    w.mount(); await flush();
    w.lookup.resolve({ data: { city: 'Netanya' }, error: null }); await flush();
    w.state.consent = 'declined';
    w.mount(); await flush();
    assert.strictEqual(w.calls.wipes, 1, 'wipe skipped: ' + w.calls.wipes);
  });

  await scenario('10 leaving the screen stops listening for the decline', async () => {
    const w = world('unknown', { hasLocation: true });
    w.mount(); await flush();
    const before = w.calls.sponsor.length;
    w.unmountAll();
    w.decline(); await flush();
    assert.strictEqual(w.calls.sponsor.length, before, 'looked up again after the screen closed');
  });

  // ── CODEX QA round 3, S1: a wipe that failed is sent again without leaving the screen ──────────
  await scenario('11 S1 "no" given offline, connection back on the SAME screen: the city is wiped', async () => {
    const w = world('declined', { wipeOk: false, hasLocation: true });
    w.mount(); await flush();
    assert.strictEqual(w.calls.wipes, 1);
    assert.strictEqual(w.state.row, 'Netanya');
    w.state.wipeOk = true;
    w.reconnect(); await flush();                     // no new screen, no new lookup
    assert.strictEqual(w.calls.wipes, 2, 'not sent again on reconnect: ' + w.calls.wipes);
    assert.strictEqual(w.state.row, null, 'city still on the server');
    assert.strictEqual(w.net.length, 0, 'still listening after the server confirmed');
    assert.strictEqual(w.timers.size, 0, 'a retry timer is left after the server confirmed');
  });

  await scenario('12 S1 server error while connected: the slow timer sends the wipe again', async () => {
    const w = world('declined', { wipeOk: false, hasLocation: true });
    w.mount(); await flush();
    assert.deepStrictEqual(w.timerDelays(), [60_000]);
    w.state.wipeOk = true;
    w.fireTimers(); await flush();
    assert.strictEqual(w.state.row, null, 'city still on the server');
    assert.strictEqual(w.timers.size, 0);
  });

  await scenario('13 S1 the timer goes on (1, 3, 10, then every 10 minutes) until the server confirms', async () => {
    const w = world('declined', { wipeOk: false, hasLocation: true });
    w.mount(); await flush();
    const delays = [];
    for (let i = 0; i < 5; i++) { delays.push(...w.timerDelays()); w.fireTimers(); await flush(); }
    assert.deepStrictEqual(delays, [60_000, 180_000, 600_000, 600_000, 600_000], 'delays: ' + delays);
    assert.strictEqual(w.timers.size, 1, 'gave up while the city is still on the server');
    w.state.wipeOk = true;
    w.fireTimers(); await flush();
    assert.strictEqual(w.state.row, null);
    assert.strictEqual(w.timers.size, 0);
    assert.strictEqual(w.net.length, 0);
  });

  await scenario('14 S1 "no" on a screen with NO ad (a question screen), offline: retried on reconnect', async () => {
    const w = world('unknown', { wipeOk: false, hasLocation: true });
    w.decline(); await flush();                       // nothing mounted: only the app-wide listener
    assert.strictEqual(w.calls.wipes, 1, 'the app-wide listener did not wipe');
    w.state.wipeOk = true;
    w.reconnect(); await flush();
    assert.strictEqual(w.state.row, null, 'city still on the server');
  });

  // ── CODEX QA round 3, S2: a city write already on its way when the user says no ────────────────
  await scenario('15 S2 the write lands AFTER the wipe: wiped again, the city does not come back', async () => {
    const w = world('unknown', { holdWrite: true });
    w.mount(); await flush();
    w.lookup.resolve({ data: { city: 'Netanya' }, error: null }); await flush();
    assert.deepStrictEqual(w.calls.update, ['Netanya'], 'the write did not start');
    w.decline(); await flush();                       // wipes go out while the write is on its way
    w.writeGate.resolve(); await flush();             // ...and the write lands after them
    assert.strictEqual(w.state.row, null, 'the city came back: ' + w.state.row);
    const wipes = w.calls.wipes;
    w.mount(); await flush();
    assert.strictEqual(w.calls.wipes, wipes, 'kept wiping after a confirmed wipe');
  });

  await scenario('16 S2 a wipe SENT while the write was pending never counts as confirmed, even if it answers late', async () => {
    const w = world('unknown', { holdWrite: true });
    w.mount(); await flush();
    w.lookup.resolve({ data: { city: 'Netanya' }, error: null }); await flush();
    w.state.holdWipeAnswers = true;
    w.decline(); await flush();                       // wipes applied now, their answers held
    w.state.holdWipeAnswers = false;
    w.state.wipeOk = false;                           // the wipe after the write fails (connection lost)
    w.writeGate.resolve(); await flush();             // the write lands: the city is back
    assert.strictEqual(w.state.row, 'Netanya');
    w.wipeGates.forEach(g => g.resolve()); await flush();   // the early wipes answer "done", late
    w.state.wipeOk = true;
    w.fireTimers(); await flush();                    // the retry must still go out
    assert.strictEqual(w.state.row, null, 'an early wipe was taken as confirmed: the city stays');
  });

  await scenario('17 a wipe confirmed under the local id does not count for the server account', async () => {
    const w = world('declined');
    w.mount(LOCAL); await flush();
    w.mount(USER); await flush();
    assert.strictEqual(w.calls.wipes, 2, 'the server account was not wiped: ' + w.calls.wipes);
  });

  for (const [mark, name] of results) console.log(mark, name);
  const failed = results.filter(r => r[0] === 'FAIL').length;
  console.log(failed ? `\n${failed} FAILED` : '\nALL PASSED');
  process.exitCode = failed ? 1 : 0;
})().catch(e => { console.error(e); process.exitCode = 1; });
