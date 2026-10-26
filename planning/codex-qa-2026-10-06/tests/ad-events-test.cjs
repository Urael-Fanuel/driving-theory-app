// Logic test for services/adEvents.ts (counting views and taps of OUR OWN sponsor ads).
// Loads the REAL file with a fake clock, fake measurements and a fake database client.
// NOT an Android test and NOT a database test (the SQL is only checked as text in scenario 13).
// Every expectation is an assertion; any failure exits with code 1.
// Run from anywhere:  node ad-events-test.cjs
const fs = require('fs'), vm = require('vm'), path = require('path'), assert = require('assert');
const root = path.resolve(__dirname, '../../..');
const ts = require(root + '/node_modules/typescript');

function load(opts = {}) {
  const inserts = [], reports = [];
  const consent = { state: opts.consent || 'unknown' };
  const supabase = { from: (t) => ({ insert: async (row) => { inserts.push({ table: t, row }); return { error: opts.dbError ? new Error('rls') : null }; } }) };
  const ctx = { exports: {}, require: p => p.endsWith('supabaseClient') ? { supabase }
    : p.endsWith('errorReporter') ? { reportError: (...a) => reports.push(a), errorText: e => String(e && e.message || e) }
    : p.endsWith('useLocationPrompt') ? { getLocationConsentState: async () => { if (consent.state === 'throw') throw new Error('x'); return consent.state; } }
    : {} };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(root + '/services/adEvents.ts', 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, ctx);
  return { api: ctx.exports, inserts, reports, consent };
}

// a controllable clock: timers run when time is advanced
function clock() {
  let now = 0, id = 0; const q = [];
  return {
    now: () => now,
    setTimeout: (fn, ms) => { const t = { id: ++id, at: now + ms, fn }; q.push(t); return t.id; },
    clearTimeout: i => { const k = q.findIndex(t => t.id === i); if (k >= 0) q.splice(k, 1); },
    async advance(ms) {
      const end = now + ms;
      for (;;) {
        for (let i = 0; i < 10; i++) await Promise.resolve();
        q.sort((a, b) => a.at - b.at);
        if (!q.length || q[0].at > end) break;
        const t = q.shift(); now = t.at; t.fn();
      }
      now = end; for (let i = 0; i < 10; i++) await Promise.resolve();
    },
  };
}

const VP = { top: 0, bottom: 800, left: 0, right: 400 };
const R = (y, h = 120, x = 10, w = 300) => ({ x, y, width: w, height: h });

function tracker(L, c, state, seen, extra = {}) {
  return L.api.createViewTracker(Object.assign({
    measure: async () => state.rect, viewport: () => state.vp || VP, isActive: () => state.active, onSeen: () => seen.push(c.now()),
    now: c.now, setTimeout: c.setTimeout, clearTimeout: c.clearTimeout,
  }, extra));
}

// The REAL hooks/useLocationPrompt.ts (CODEX round 2: the consent reader must not be a stub).
function loadLocationPrompt(fsOpts = {}) {
  const disk = { data: fsOpts.data === undefined ? null : fsOpts.data, holdWrites: !!fsOpts.holdWrites, pending: [] };
  const FileSystem = {
    documentDirectory: 'file:///doc/',
    getInfoAsync: async () => ({ exists: disk.data !== null }),
    readAsStringAsync: async () => { if (fsOpts.readFails) throw new Error('read'); return disk.data; },
    writeAsStringAsync: (_p, v) => disk.holdWrites
      ? new Promise(res => disk.pending.push(() => { disk.data = v; res(); }))
      : (disk.data = v, Promise.resolve()),
  };
  const React = { useState: v => [typeof v === 'function' ? v() : v, () => {}], useCallback: f => f, useEffect: () => {}, useRef: v => ({ current: v }) };
  const ctx = { exports: {}, console: { warn() {}, log() {}, error() {} }, require: p =>
    p === 'react' ? React : p.endsWith('expo-file-system/legacy') ? FileSystem
    : p === 'expo-location' ? { requestForegroundPermissionsAsync: async () => ({ status: 'denied' }) }
    : p.endsWith('supabaseClient') ? { supabase: { functions: { invoke: async () => ({ data: null, error: null }) } } }
    : p.endsWith('backend/api') ? { updateUserLocation: async () => {}, clearUserIpCity: async () => true } : {} };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(root + '/hooks/useLocationPrompt.ts', 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.React } }).outputText, ctx);
  return { lp: ctx.exports, disk };
}

const results = [];
async function scenario(name, fn) {
  try { await fn(); results.push(['OK  ', name]); } catch (e) { results.push(['FAIL', name + '  ->  ' + String(e.message).split('\n')[0]]); }
}

(async () => {
  await scenario('1 fully visible: counted once, only a full second after it was FIRST seen', async () => {
    const L = load(), c = clock(), s = { rect: R(300), active: true }, seen = [];
    tracker(L, c, s, seen, { stepMs: 500 }).start();   // timings below assume a sample every 500 ms
    await c.advance(1400); assert.strictEqual(seen.length, 0, 'counted too early');
    await c.advance(1500); assert.strictEqual(seen.length, 1);
    assert.ok(seen[0] - 500 >= 1000, 'counted ' + (seen[0] - 500) + ' ms after first seen');
    await c.advance(10000); assert.strictEqual(seen.length, 1, 'counted twice');
  });

  await scenario('2 below the visible part of the screen (a list footer nobody scrolled to): never counted', async () => {
    const L = load(), c = clock(), s = { rect: R(900), active: true }, seen = [];
    tracker(L, c, s, seen).start();
    await c.advance(30000); assert.strictEqual(seen.length, 0);
  });

  await scenario('3 visible share in both directions; bad sizes are never visible (CODEX A4)', async () => {
    const L = load();
    assert.strictEqual(L.api.visibleShare(R(740), VP), 0.5);
    assert.ok(L.api.visibleShare(R(760), VP) < 0.5);
    assert.strictEqual(L.api.visibleShare(R(-60), VP), 0.5);
    assert.strictEqual(L.api.visibleShare(R(100, 0), VP), 0, 'zero height');
    assert.strictEqual(L.api.visibleShare(R(100, 120, 10, 0), VP), 0, 'zero width');
    assert.strictEqual(L.api.visibleShare(R(100, 120, 10000, 300), VP), 0, 'off to the side');
    assert.strictEqual(L.api.visibleShare(R(100, 120, 250, 300), VP), 0.5, 'half off to the side');
    assert.strictEqual(L.api.visibleShare(R(NaN), VP), 0, 'not a number');
    assert.strictEqual(L.api.visibleShare(null, VP), 0);
    // under the tab bar (visible part ends at 600) is not visible, even though it is inside the window
    assert.strictEqual(L.api.visibleShare(R(650), { top: 0, bottom: 600, left: 0, right: 400 }), 0);
  });

  await scenario('4 scrolled in and out again before a full second: the clock starts over', async () => {
    const L = load(), c = clock(), s = { rect: R(900), active: true }, seen = [];
    tracker(L, c, s, seen).start();
    await c.advance(1000); s.rect = R(300);
    await c.advance(500); s.rect = R(900);
    await c.advance(1500); s.rect = R(300);
    await c.advance(1000); assert.strictEqual(seen.length, 0, 'counted from two short glimpses');
    await c.advance(1500); assert.strictEqual(seen.length, 1);
  });

  await scenario('5 screen not in front / app in the background: not counted until it is', async () => {
    const L = load(), c = clock(), s = { rect: R(300), active: false }, seen = [];
    tracker(L, c, s, seen).start();
    await c.advance(20000); assert.strictEqual(seen.length, 0);
    s.active = true; await c.advance(2500); assert.strictEqual(seen.length, 1);
  });

  await scenario('6 stop() ends it: nothing is counted afterwards', async () => {
    const L = load(), c = clock(), s = { rect: R(300), active: true }, seen = [];
    const t = tracker(L, c, s, seen); t.start(); await c.advance(1000); t.stop();
    await c.advance(10000); assert.strictEqual(seen.length, 0);
  });

  await scenario('7 a card that cannot be measured is never counted; a throwing or silent measurement does not break it', async () => {
    const L = load(), c = clock(), seen = [], st = { n: 0 };
    const t = L.api.createViewTracker({ measure: async () => { st.n++; if (st.n < 3) throw new Error('x'); return null; },
      viewport: () => VP, isActive: () => true, onSeen: () => seen.push(1), now: c.now, setTimeout: c.setTimeout, clearTimeout: c.clearTimeout });
    t.start(); await c.advance(10000); assert.strictEqual(seen.length, 0); assert.ok(st.n > 5);
    // a measurement that never answers counts as "not visible", and looking goes on
    const c2 = clock(), seen2 = [], st2 = { n: 0 };
    const t2 = L.api.createViewTracker({ measure: () => { st2.n++; return st2.n < 3 ? new Promise(() => {}) : Promise.resolve(R(300)); },
      viewport: () => VP, isActive: () => true, onSeen: () => seen2.push(1), now: c2.now, setTimeout: c2.setTimeout, clearTimeout: c2.clearTimeout });
    t2.start(); await c2.advance(10000); assert.strictEqual(seen2.length, 1, 'stuck after a silent measurement');
  });

  await scenario('8 CODEX A6: first visible after 10+ minutes off screen is still counted', async () => {
    const L = load(), c = clock(), s = { rect: R(900), active: true }, seen = [];
    tracker(L, c, s, seen).start();
    await c.advance(600000); s.rect = R(300);
    await c.advance(5000); assert.strictEqual(seen.length, 1);
  });

  await scenario('8b CODEX A3: visible from t=499 is not counted at t=1000', async () => {
    const L = load(), c = clock(), s = { rect: R(900), active: true }, seen = [];
    tracker(L, c, s, seen).start();
    await c.advance(499); s.rect = R(300);
    await c.advance(501); assert.strictEqual(seen.length, 0, 'counted after 501 ms');
    await c.advance(1000); assert.strictEqual(seen.length, 1);
  });

  await scenario('8c CODEX A3: app backgrounded between two samples starts the second over', async () => {
    const L = load(), c = clock(), s = { rect: R(300), active: true }, seen = [];
    const t = tracker(L, c, s, seen); t.start();
    await c.advance(600); s.active = false; t.reset();      // what the hook does on AppState change
    await c.advance(300); s.active = true; t.reset();
    await c.advance(100); assert.strictEqual(seen.length, 0, 'counted across the interruption');
    await c.advance(1600); assert.strictEqual(seen.length, 1);
  });

  await scenario('8d CODEX A3: became inactive while a measurement was pending: not counted', async () => {
    const L = load(), c = clock(), s = { active: true }, seen = [], pending = [];
    let n = 0;
    const t = tracker(L, c, s, seen, { measure: () => { n++; if (n === 2) return new Promise(r => pending.push(r)); return Promise.resolve(R(300)); } });
    t.start();
    await c.advance(1400);                  // seen at t=500; 2nd measurement (t=1000) still waiting
    assert.strictEqual(pending.length, 1);
    s.active = false; t.reset(); pending[0](R(300));
    await c.advance(10); assert.strictEqual(seen.length, 0, 'counted while inactive');
    await c.advance(5000); assert.strictEqual(seen.length, 0);
  });

  await scenario('8e a dialog over the screen: registry opens and closes exactly once', async () => {
    const L = load(), calls = [];
    const off = L.api.onOverlayChange(() => calls.push(L.api.isCoveredByOverlay()));
    const close = L.api.openCoveringOverlay();
    assert.strictEqual(L.api.isCoveredByOverlay(), true);
    close(); close();
    assert.strictEqual(L.api.isCoveredByOverlay(), false);
    assert.deepStrictEqual(calls, [true, false]);
    off();
  });

  await scenario('9 sendSponsorAdEvent writes exactly: ad, event, screen, engine, city_source (no city, no user, no time)', async () => {
    const L = load();
    assert.strictEqual(await L.api.sendSponsorAdEvent('ad-1', 'call', '/(engineB)/(tabs)/home', 'B'), true);
    assert.deepStrictEqual(JSON.parse(JSON.stringify(L.inserts)), [{ table: 'sponsor_ad_events', row: { ad_id: 'ad-1', event: 'call', screen: '/(engineB)/(tabs)/home', engine: 'B', city_source: 'ip' } }]);
  });

  await scenario('9b CODEX A2: the location answer at the moment of sending decides city_source', async () => {
    const L = load();
    for (const [st, want] of [['approved', 'gps'], ['unknown', 'ip'], ['declined', 'none'], ['throw', 'none']]) {
      L.consent.state = st; L.inserts.length = 0;
      await L.api.sendSponsorAdEvent('ad-1', 'view', '/x', 'A');
      assert.strictEqual(L.inserts[0].row.city_source, want, st);
    }
  });

  await scenario('10 no ad id: nothing is sent; a very long screen name is cut to 80 characters', async () => {
    const L = load();
    assert.strictEqual(await L.api.sendSponsorAdEvent('', 'view', '/x', 'A'), false);
    assert.strictEqual(L.inserts.length, 0);
    await L.api.sendSponsorAdEvent('ad-1', 'view', '/'.padEnd(300, 'x'), null);
    assert.strictEqual(L.inserts[0].row.screen.length, 80);
    assert.strictEqual(L.inserts[0].row.engine, null);
  });

  await scenario('10b a click is sent with the event name click', async () => {
    const L = load();
    await L.api.sendSponsorAdEvent('ad-1', 'click', '/(engineA)/(tabs)/home', 'A');
    assert.strictEqual(L.inserts[0].row.event, 'click');
  });

  await scenario('11 a refused or failed write is swallowed (reported quietly, never thrown to the learner)', async () => {
    const L = load({ dbError: true });
    assert.strictEqual(await L.api.sendSponsorAdEvent('ad-1', 'view', '/x', 'A'), false);
    assert.strictEqual(L.reports.length, 1);
    assert.deepStrictEqual(JSON.parse(JSON.stringify(L.reports[0][4])), { skipIfOffline: true });
  });

  await scenario('12 wiring: ids everywhere, press counted before the dialer, banner 🔊 counted (CODEX A7), dialogs cover ads', async () => {
    const card = fs.readFileSync(root + '/components/shared/AdCard.tsx', 'utf8');
    assert.ok(/useSponsorAdTracking\(adId\)/.test(card));
    assert.ok(card.indexOf('tracking.onCall()') > 0 && card.indexOf('tracking.onCall()') < card.indexOf('Linking.openURL(`tel:'), 'press must be counted before the dialer opens');
    assert.ok(/ref=\{tracking\.ref\}\s+collapsable=\{false\}/.test(card), 'card must be measurable');
    assert.ok(/onPress=\{tracking\.onClick\}/.test(card), 'a tap on the card must count as a click');
    assert.ok(card.indexOf('tracking.onClick();') < card.indexOf('playAudio(audioUri)'), 'the 🔊 tap must be counted');
    const banner = fs.readFileSync(root + '/components/shared/SponsorAdBanner.tsx', 'utf8');
    assert.ok(/useSponsorAdTracking\(ad\.id, \{ views: false \}\)/.test(banner), 'banner must not start a second view tracker');
    const from = banner.indexOf('const handlePlay');
    const play = banner.slice(from, banner.indexOf('\n  };', from));
    const click = play.indexOf('tracking.onClick();');
    assert.ok(click > play.lastIndexOf('return;') && click < play.indexOf('playAndAwaitAudio'), 'banner 🔊: one click when playing starts, none on stop/resume');
    for (const f of ['app/(engineA)/(tabs)/home.tsx', 'app/(engineA)/topic-quiz/[topicId].tsx', 'app/(engineB)/(tabs)/home.tsx', 'app/(engineB)/topic-quiz/[topicId].tsx', 'components/shared/SponsorAdBanner.tsx'])
      assert.ok(/adId=\{(sponsorAd|ad)\.id\}/.test(fs.readFileSync(root + '/' + f, 'utf8')), f + ' does not pass the ad id');
    for (const f of ['LocationPermissionModal', 'DisclaimerModal', 'VideoModal'])
      assert.ok(/useCoversAds\(visible\)/.test(fs.readFileSync(root + '/components/shared/' + f + '.tsx', 'utf8')), f + ' does not cover ads');
  });

  await scenario('13 migration text holds the requested fixes (static check only, the SQL was NOT executed)', async () => {
    const sql = fs.readFileSync(root + '/backend/migration_sponsor_ad_events.sql', 'utf8');
    assert.ok(/GROUP BY e\.ad_id, a\.name, \(e\.created_at AT TIME ZONE 'UTC'\)::date, COALESCE\(e\.city, 'unknown'\), e\.engine;/.test(sql), 'A1 group by');
    assert.ok(/NEW\.created_at := pg_catalog\.now\(\)/.test(sql), 'A5 server clock');
    assert.ok(/pg_advisory_xact_lock/.test(sql), 'A5 atomic quota');
    assert.ok(/GRANT INSERT \(ad_id, event, screen, engine, city_source\)/.test(sql), 'A5 column grant');
    assert.ok(/REVOKE ALL ON public\.sponsor_ad_events FROM PUBLIC, anon, authenticated/.test(sql));
    assert.ok(/SET search_path = ''/.test(sql), 'hardened search_path');
    assert.ok(/IS DISTINCT FROM auth\.uid\(\)/.test(sql), 'identity check first');
    assert.ok(/NEW\.city := NULL;[\s\S]*city_source = 'gps'[\s\S]*city_source = 'ip'/.test(sql), 'A2 consent-aware city');
    assert.ok(/^BEGIN;/m.test(sql) && /^COMMIT;/m.test(sql), 'one transaction');
    assert.ok(/GRANT SELECT ON public\.sponsor_ad_daily_stats TO service_role/.test(sql));
    assert.ok(!/ON DELETE CASCADE/.test(sql), 'deleting a sponsor must not wipe its history');
  });

  await scenario('14 CODEX round 2 A2: a refusal counts AT ONCE, while its save is still running (real consent reader)', async () => {
    const { lp, disk } = loadLocationPrompt({ holdWrites: true });
    assert.strictEqual(await lp.getLocationConsentState(), 'unknown');
    lp.useLocationPrompt('user-1').handleNotNow();
    assert.strictEqual(await lp.getLocationConsentState(), 'declined', 'the old answer was used while saving');
    // and the event that would be sent now carries no city
    const L = load(); L.consent.state = await lp.getLocationConsentState();
    await L.api.sendSponsorAdEvent('ad-1', 'view', '/x', 'A');
    assert.strictEqual(L.inserts[0].row.city_source, 'none');
    disk.pending.forEach(f => f());
  });

  await scenario('15 CODEX round 2 A2: a refusal whose save never completes still counts for the rest of the session', async () => {
    const { lp } = loadLocationPrompt({ holdWrites: true });
    lp.useLocationPrompt('user-1').handleNotNow();
    for (let i = 0; i < 20; i++) await Promise.resolve();
    assert.strictEqual(await lp.getLocationConsentState(), 'declined');
  });

  await scenario('16 CODEX round 2 A2: a settings file that exists but cannot be read is declined, never "never asked"', async () => {
    const A = loadLocationPrompt({ data: '{"approved":true}', readFails: true });
    assert.strictEqual(await A.lp.getLocationConsentState(), 'declined');
    const B = loadLocationPrompt({ data: 'not json' });
    assert.strictEqual(await B.lp.getLocationConsentState(), 'declined');
    const C = loadLocationPrompt({});
    assert.strictEqual(await C.lp.getLocationConsentState(), 'unknown');
    const D = loadLocationPrompt({ data: '{"notNowCount":1}' });
    assert.strictEqual(await D.lp.getLocationConsentState(), 'declined');
  });

  await scenario('17 CODEX round 2 A3: out of view between two samples (600-900 ms) is noticed with the default sampling', async () => {
    const L = load(), c = clock(), s = { rect: R(300), active: true }, seen = [];
    tracker(L, c, s, seen).start();
    await c.advance(600); s.rect = R(900);
    await c.advance(300); s.rect = R(300);
    await c.advance(600); assert.strictEqual(seen.length, 0, 'counted from two separate glimpses');
    await c.advance(1000); assert.strictEqual(seen.length, 1);
  });

  await scenario('18 CODEX round 2 A4: a card hidden by the header or below the list is not visible (scroll-area frame)', async () => {
    const L = load();
    const vp = { top: 24, bottom: 750, left: 0, right: 400 };
    const list = { x: 0, y: 100, width: 400, height: 500 };
    assert.ok(Math.abs(L.api.visibleShare(R(650), vp) - 0.8333) < 0.001, 'arithmetic of the old window-only check');
    assert.strictEqual(L.api.visibleShare(R(650), L.api.clipViewport(vp, list)), 0, 'counted below the list');
    assert.strictEqual(L.api.visibleShare(R(40, 120), L.api.clipViewport(vp, list)), 0.5, 'half under the header is half');
    assert.deepStrictEqual(JSON.parse(JSON.stringify(L.api.clipViewport(vp, null))), vp, 'no frame: the screen is used');
    // CODEX round 4, R4-3: a frame that cannot show anything must not widen what counts
    assert.strictEqual(L.api.visibleShare(R(300), L.api.clipViewport(vp, { x: 0, y: 100, width: 400, height: 0 })), 0, 'zero-height frame counted the card');
    assert.strictEqual(L.api.visibleShare(R(300), L.api.clipViewport(vp, { x: 0, y: NaN, width: 400, height: 500 })), 0, 'broken frame counted the card');
  });

  await scenario('19 wiring: all 7 screens with a sponsor card give the counter their scroll-area frame', async () => {
    const files = ['app/(engineA)/(tabs)/home.tsx', 'app/(engineB)/(tabs)/home.tsx', 'app/(engineA)/topic-quiz/[topicId].tsx',
      'app/(engineB)/topic-quiz/[topicId].tsx', 'app/(engineA)/(tabs)/progress.tsx', 'app/(engineB)/(tabs)/progress.tsx', 'app/result/[sessionId].tsx'];
    for (const f of files) {
      const t = fs.readFileSync(root + '/' + f, 'utf8');
      const open = t.indexOf('<AdClip target={adClipRef}>'), close = t.indexOf('</AdClip>');
      assert.ok(open > 0 && close > open, f + ': no AdClip');
      const inside = t.slice(open, close);
      assert.ok(inside.includes('ref={adClipRef}'), f + ': the scroll area is not the measured one');
      assert.ok(inside.includes('<AdCard') || inside.includes('<SponsorAdBanner'), f + ': the ad card is outside the frame');
    }
    const hook = fs.readFileSync(root + '/hooks/useSponsorAdTracking.ts', 'utf8');
    assert.ok(hook.includes('useContext(AdClipContext)') && hook.includes('clipViewport('));
  });

  await scenario('20 CODEX round 4 R4-2: slow measurements (300 ms) cannot join two separate exposures into one view', async () => {
    const L = load(), c = clock(), s = { rect: R(300), active: true }, seen = [];
    const slow = () => new Promise(res => c.setTimeout(() => res(s.rect), 300));
    tracker(L, c, s, seen, { measure: slow }).start();
    await c.advance(600); s.rect = R(900);      // away 600-900 ms, between two slow looks
    await c.advance(300); s.rect = R(300);
    await c.advance(1500);
    assert.strictEqual(seen.length, 0, 'counted although the looks were too far apart to prove a continuous second');
  });

  await scenario('21 normal measurement speed (20 ms) still counts a card that stays visible', async () => {
    const L = load(), c = clock(), s = { rect: R(300), active: true }, seen = [];
    const fast = () => new Promise(res => c.setTimeout(() => res(s.rect), 20));
    tracker(L, c, s, seen, { measure: fast }).start();
    await c.advance(2500);
    assert.strictEqual(seen.length, 1);
  });

  await scenario('22 CODEX round 4 R4-3: a screen whose frame cannot be measured gives an EMPTY frame, not the whole screen', async () => {
    const hook = fs.readFileSync(root + '/hooks/useSponsorAdTracking.ts', 'utf8');
    assert.ok(/\?\? EMPTY_FRAME\)/.test(hook), 'a failed frame measurement falls back to the whole screen');
    const L = load();
    assert.strictEqual(L.api.visibleShare(R(300), L.api.clipViewport({ top: 0, bottom: 800, left: 0, right: 400 }, L.api.EMPTY_FRAME)), 0);
  });

  for (const [s, n] of results) console.log(s, n);
  const bad = results.filter(r => r[0] === 'FAIL').length;
  console.log(`\n${results.length - bad} of ${results.length} scenarios passed`);
  process.exitCode = bad ? 1 : 0;
})().catch(e => { console.log('TEST ERROR', e); process.exitCode = 1; });
