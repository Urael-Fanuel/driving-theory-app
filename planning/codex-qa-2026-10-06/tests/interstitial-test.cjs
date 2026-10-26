// Logic test for services/interstitial.ts (full-screen ads at end points).
// Loads the REAL file with a fake disk, fake ad module, fake consent and a fake clock.
// NOT an Android test and NOT a test of Google's ads.
// Run from anywhere:  node interstitial-test.cjs
const fs = require('fs'), vm = require('vm'), path = require('path'), assert = require('assert');
const root = path.resolve(__dirname, '../../..');
const ts = require(root + '/node_modules/typescript');

const flush = async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); };

function load(opts = {}) {
  const disk = { data: opts.initial === undefined ? null : JSON.stringify(opts.initial), writes: 0 };
  const FileSystem = {
    documentDirectory: 'file:///doc/',
    getInfoAsync: async () => { if (opts.diskFails) throw new Error('disk'); return { exists: disk.data !== null }; },
    readAsStringAsync: async () => { if (opts.diskFails) throw new Error('disk'); return disk.data; },
    writeAsStringAsync: async (_p, s) => { if (opts.diskFails) throw new Error('disk'); disk.data = s; disk.writes++; },
  };
  const ads = { created: [], consentCalls: 0, readyListeners: [], covers: { open: 0, close: 0 } };
  const AdEventType = { LOADED: 'loaded', ERROR: 'error', CLOSED: 'closed' };
  class Inst {
    constructor() { this.l = {}; this.loadCalls = 0; this.showCalls = 0; this.removed = false; }
    removeAllListeners() { this.l = {}; this.removed = true; }
    addAdEventListener(t, fn) { (this.l[t] = this.l[t] || []).push(fn); return () => { this.l[t] = (this.l[t] || []).filter(f => f !== fn); }; }
    emit(t) { (this.l[t] || []).slice().forEach(f => f()); }
    load() { this.loadCalls++; if (opts.autoLoad !== false) Promise.resolve().then(() => this.emit('loaded')); }
    show() { this.showCalls++; if (opts.showRejects) return Promise.reject(new Error('x')); if (opts.autoClose) Promise.resolve().then(() => this.emit('closed')); return Promise.resolve(); }
  }
  const adsModule = { InterstitialAd: { createForAdRequest: (unit) => { const i = new Inst(); i.unit = unit; ads.created.push(i); return i; } }, AdEventType };
  const timers = [];
  const ctx = {
    exports: {}, Promise, console,
    setTimeout: (fn, ms) => { timers.push({ fn, ms }); return timers.length; },
    clearTimeout: (id) => { if (timers[id - 1]) timers[id - 1].cleared = true; },
    require: p => p.endsWith('expo-file-system/legacy') ? FileSystem
      : p.endsWith('adsConsent') ? {
          ensureAdsReady: () => { ads.consentCalls++; return opts.consentPending ? new Promise(() => {}) : Promise.resolve(opts.consent !== false); },
          onAdsReadyChange: fn => { ads.readyListeners.push(fn); return () => {}; },
        }
      : p.endsWith('/adEvents') ? { openCoveringOverlay: () => { ads.covers.open++; return () => { ads.covers.close++; }; } }
      : p === 'react-native-google-mobile-ads' ? adsModule : {},
  };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(root + '/services/interstitial.ts', 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText, ctx);
  return { api: ctx.exports, disk, ads, timers, prefs: () => JSON.parse(disk.data) };
}

const results = [];
async function scenario(name, fn) {
  try { await Promise.race([fn(), new Promise((_, rej) => setTimeout(() => rej(new Error('hung: a promise never resolved')), 3000))]); results.push(['OK  ', name]); } catch (e) { results.push(['FAIL', name + '  ->  ' + String(e.message).split('\n')[0]]); }
}

(async () => {
  await scenario('1 decide: first 2 launches never show and never count', async () => {
    const L = load();
    for (const opens of [0, 1, 2]) {
      const r = L.api.decide({ opens, sinceShown: 0 }, true);
      assert.strictEqual(r.show, false); assert.strictEqual(r.next.sinceShown, 0);
    }
  });

  await scenario('2 decide: from the 3rd launch, every 2nd end point; an unloaded ad stays due', async () => {
    const L = load();
    let p = { opens: 3, sinceShown: 0 };
    let r = L.api.decide(p, true);  assert.strictEqual(r.show, false); p = r.next; assert.strictEqual(p.sinceShown, 1);
    r = L.api.decide(p, false);     assert.strictEqual(r.show, false); p = r.next; assert.strictEqual(p.sinceShown, 2, 'due but not loaded must stay due');
    r = L.api.decide(p, true);      assert.strictEqual(r.show, true);  p = r.next; assert.strictEqual(p.sinceShown, 0);
    r = L.api.decide(p, true);      assert.strictEqual(r.show, false);
  });

  await scenario('3 startInterstitial counts a launch once, and prepares no ad in launches 1-2', async () => {
    const L = load();
    await L.api.startInterstitial(); await L.api.startInterstitial();
    assert.strictEqual(L.prefs().opens, 1);
    assert.strictEqual(L.ads.created.length, 0);
  });

  await scenario('4 from the 3rd launch the ad is prepared at launch, with our unit id', async () => {
    const L = load({ initial: { opens: 2, sinceShown: 0 } });
    await L.api.startInterstitial(); await flush();
    assert.strictEqual(L.prefs().opens, 3);
    assert.strictEqual(L.ads.created.length, 1);
    assert.strictEqual(L.ads.created[0].unit, 'ca-app-pub-8758594752714631/8327375631');
    assert.strictEqual(L.ads.created[0].loadCalls, 1);
  });

  await scenario('5 no consent: nothing is prepared and nothing is shown', async () => {
    const L = load({ initial: { opens: 5, sinceShown: 1 }, consent: false });
    await L.api.startInterstitial(); await L.api.maybeShowInterstitial(); await flush();
    assert.strictEqual(L.ads.created.length, 0);
  });

  await scenario('6 end points: 1st counts, 2nd shows and waits for CLOSED, then the next one is prepared', async () => {
    const L = load({ initial: { opens: 3, sinceShown: 0 }, autoClose: true });
    await L.api.startInterstitial(); await flush();
    const first = L.ads.created[0];
    await L.api.maybeShowInterstitial();
    assert.strictEqual(first.showCalls, 0); assert.strictEqual(L.prefs().sinceShown, 1);
    await L.api.maybeShowInterstitial();
    assert.strictEqual(first.showCalls, 1); assert.strictEqual(L.prefs().sinceShown, 0);
    await flush();
    assert.strictEqual(L.ads.created.length, 2, 'next ad not prepared');
  });

  await scenario('7 the caller waits until the ad is closed, and not longer', async () => {
    const L = load({ initial: { opens: 3, sinceShown: 1 } });
    await L.api.startInterstitial(); await flush();
    const inst = L.ads.created[0];
    let resolved = false;
    const p = L.api.maybeShowInterstitial().then(() => { resolved = true; });
    await flush();
    assert.strictEqual(inst.showCalls, 1); assert.strictEqual(resolved, false, 'returned while the ad was still open');
    inst.emit('closed'); await p;
    assert.strictEqual(resolved, true);
  });

  await scenario('8 a second call while an ad is open does not count or show again', async () => {
    const L = load({ initial: { opens: 3, sinceShown: 1 } });
    await L.api.startInterstitial(); await flush();
    const inst = L.ads.created[0];
    const p1 = L.api.maybeShowInterstitial(); await flush();
    const writes = L.disk.writes;
    const p2 = L.api.maybeShowInterstitial(); await flush();   // shares the open ad's promise (round 3, C1)
    assert.strictEqual(inst.showCalls, 1); assert.strictEqual(L.disk.writes, writes);
    inst.emit('closed'); await Promise.all([p1, p2]);
  });

  await scenario('9 an ad that never closes cannot hold the screen: a 90 s safety timer releases it', async () => {
    const L = load({ initial: { opens: 3, sinceShown: 1 } });
    await L.api.startInterstitial(); await flush();
    const p = L.api.maybeShowInterstitial(); await flush();
    const t = L.timers.find(x => x.ms === 90000 && !x.cleared);
    assert.ok(t, 'no safety timer'); t.fn(); await p;
  });

  await scenario('10 show() failing, or an ERROR event, releases the caller', async () => {
    const A = load({ initial: { opens: 3, sinceShown: 1 }, showRejects: true });
    await A.api.startInterstitial(); await flush(); await A.api.maybeShowInterstitial();
    const B = load({ initial: { opens: 3, sinceShown: 1 } });
    await B.api.startInterstitial(); await flush();
    const p = B.api.maybeShowInterstitial(); await flush(); B.ads.created[0].emit('error'); await p;
  });

  await scenario('11 due but not loaded: returns at once, asks for a new ad, shows it at the next end point', async () => {
    const L = load({ initial: { opens: 3, sinceShown: 1 }, autoLoad: false });
    await L.api.startInterstitial(); await flush();
    await L.api.maybeShowInterstitial();           // due, not loaded: skipped silently
    assert.strictEqual(L.ads.created[0].showCalls, 0); assert.strictEqual(L.prefs().sinceShown, 2);
    L.ads.created[0].emit('loaded');
    const p = L.api.maybeShowInterstitial(); await flush();
    assert.strictEqual(L.ads.created[0].showCalls, 1);
    L.ads.created[0].emit('closed'); await p;
  });

  await scenario('12 a failed load is dropped and a new one is requested later', async () => {
    const L = load({ initial: { opens: 3, sinceShown: 0 }, autoLoad: false });
    await L.api.startInterstitial(); await flush();
    L.ads.created[0].emit('error');
    await L.api.maybeShowInterstitial();
    await flush();
    assert.strictEqual(L.ads.created.length, 2);
  });

  await scenario('13 a broken disk never throws and never shows by mistake', async () => {
    const L = load({ diskFails: true });
    await L.api.startInterstitial();
    await L.api.maybeShowInterstitial();
    assert.strictEqual(L.ads.created.length, 0);
  });

  await scenario('14 wiring: only at the end screens, after audio is stopped and before leaving, and started at launch', async () => {
    const files = [['app/(engineA)/behavioral-subtopic/[id].tsx', 'complete'], ['app/(engineB)/behavioral-subtopic/[id].tsx', 'complete'],
      ['app/(engineA)/topic-quiz/[topicId].tsx', 'result'], ['app/(engineB)/topic-quiz/[topicId].tsx', 'result']];
    for (const [f, phase] of files) {
      const s = fs.readFileSync(root + '/' + f, 'utf8');
      const call = `if (phase === '${phase}') await maybeShowInterstitial();`;
      assert.strictEqual(s.split('maybeShowInterstitial()').length - 1, 1, f + ': must be called exactly once');
      const i = s.indexOf(call); assert.ok(i > 0, f + ' missing guard');
      const hb = s.lastIndexOf('const handleBack', i);
      assert.ok(hb > 0 && s.indexOf('stopTTS()', hb) < i, f + ': ad must come after the audio is stopped');
      { const b = s.indexOf('router.back()', i); assert.ok(b > i && !s.slice(i + call.length, b).includes('await '), f + ': nothing may be awaited between the ad and leaving'); }
    }
    const layout = fs.readFileSync(root + '/app/_layout.tsx', 'utf8');
    assert.ok(/startInterstitial\(\)\.catch/.test(layout));
    for (const f of ['app/result/[sessionId].tsx', 'app/(engineA)/practice.tsx', 'app/(engineB)/practice.tsx', 'app/(engineA)/(tabs)/exam.tsx', 'app/(engineB)/(tabs)/exam.tsx'])
      if (fs.existsSync(root + '/' + f)) assert.ok(!/maybeShowInterstitial/.test(fs.readFileSync(root + '/' + f, 'utf8')), f + ' must not show full-screen ads');
  });

  await scenario('15 CODEX round 3 C1: two exits at the same moment count ONE end point (no ad at the first one)', async () => {
    const L = load({ initial: { opens: 3, sinceShown: 0 }, autoClose: true });
    await L.api.startInterstitial(); await flush();
    await Promise.all([L.api.maybeShowInterstitial(), L.api.maybeShowInterstitial()]);
    assert.strictEqual(L.prefs().sinceShown, 1, 'counted twice');
    assert.strictEqual(L.ads.created[0].showCalls, 0, 'an ad at the first end point');
  });

  await scenario('16 CODEX round 3 C1: a second exit while the ad is open waits for the SAME close (no early navigation)', async () => {
    const L = load({ initial: { opens: 3, sinceShown: 1 } });
    await L.api.startInterstitial(); await flush();
    const inst = L.ads.created[0];
    let first = false, second = false;
    const p1 = L.api.maybeShowInterstitial().then(() => { first = true; }); await flush();
    const p2 = L.api.maybeShowInterstitial().then(() => { second = true; }); await flush();
    assert.strictEqual(second, false, 'the second caller was released while the ad was open');
    inst.emit('closed'); await Promise.all([p1, p2]);
    assert.ok(first && second);
    assert.strictEqual(inst.showCalls, 1);
  });

  await scenario('17 CODEX round 3: leaving a screen never waits for the consent step or for an ad to load', async () => {
    const L = load({ initial: { opens: 3, sinceShown: 0 }, consentPending: true });
    await L.api.startInterstitial();
    await L.api.maybeShowInterstitial();   // would hang (and fail this scenario) if it waited
    assert.strictEqual(L.prefs().sinceShown, 1);
  });

  await scenario('18 CODEX round 3 B2: after a change of ad choice the prepared ad is dropped and a new one is requested', async () => {
    const L = load({ initial: { opens: 3, sinceShown: 0 } });
    await L.api.startInterstitial(); await flush();
    assert.strictEqual(L.ads.created.length, 1);
    L.ads.readyListeners.forEach(fn => fn(true)); await flush();
    assert.strictEqual(L.ads.created[0].removed, true, 'old ad kept');
    assert.strictEqual(L.ads.created.length, 2, 'no new ad requested');
    L.ads.readyListeners.forEach(fn => fn(false)); await flush();
    assert.strictEqual(L.ads.created[1].removed, true);
    assert.strictEqual(L.ads.created.length, 2, 'requested an ad without consent');
  });

  await scenario('19 an ad that never appears (show refused) stays due for the next end point', async () => {
    const L = load({ initial: { opens: 3, sinceShown: 1 }, showRejects: true });
    await L.api.startInterstitial(); await flush();
    await L.api.maybeShowInterstitial();
    assert.strictEqual(L.prefs().sinceShown, 1, 'the due ad was used up although nothing was seen');
  });

  await scenario('20 while the full-screen ad is open our sponsor cards count as covered', async () => {
    const L = load({ initial: { opens: 3, sinceShown: 1 } });
    await L.api.startInterstitial(); await flush();
    const p = L.api.maybeShowInterstitial(); await flush();
    assert.deepStrictEqual({ ...L.ads.covers }, { open: 1, close: 0 });
    L.ads.created[0].emit('closed'); await p;
    assert.deepStrictEqual({ ...L.ads.covers }, { open: 1, close: 1 });
  });

  await scenario('21 wiring: every exit is single-flight, topic-quiz hardware back uses the same exit (both engines)', async () => {
    for (const f of ['app/(engineA)/behavioral-subtopic/[id].tsx', 'app/(engineB)/behavioral-subtopic/[id].tsx',
      'app/(engineA)/topic-quiz/[topicId].tsx', 'app/(engineB)/topic-quiz/[topicId].tsx']) {
      const s = fs.readFileSync(root + '/' + f, 'utf8');
      const hb = s.indexOf('const handleBack');
      const body = s.slice(hb, s.indexOf('router.back()', hb));
      assert.ok(/if \(leavingRef\.current\) return;/.test(body), f + ': no single-flight guard');
      assert.ok(body.indexOf('leavingRef.current = true') < body.indexOf('await '), f + ': guard set after the first await');
      assert.ok(/hardwareBackPress/.test(s), f + ': hardware back not routed through handleBack');
    }
  });

  await scenario('22 CODEX round 4: a consent answer during launch 1 or 2 does NOT prepare a full-screen ad', async () => {
    const L = load({});                       // first launch ever
    await L.api.startInterstitial(); await flush();
    L.ads.readyListeners.forEach(fn => fn(true)); await flush();
    assert.strictEqual(L.ads.created.length, 0, 'an ad was prepared in launch 1');
    const M = load({ initial: { opens: 3, sinceShown: 0 } });   // launch 4: allowed
    await M.api.startInterstitial(); await flush();
    M.ads.readyListeners.forEach(fn => fn(true)); await flush();
    assert.ok(M.ads.created.length >= 1);
  });

  for (const [s, n] of results) console.log(s, n);
  const bad = results.filter(r => r[0] === 'FAIL').length;
  console.log(`\n${results.length - bad} of ${results.length} scenarios passed`);
  process.exitCode = bad ? 1 : 0;
})().catch(e => { console.log('TEST ERROR', e); process.exitCode = 1; });
