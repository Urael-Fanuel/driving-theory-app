// Logic test for services/adsConsent.ts (Google ad consent, EU / UK users).
// Loads the REAL file with a fake ads module. NOT an Android test, and NOT a test of Google's form.
// Run from anywhere:  node ads-consent-test.cjs
const fs = require('fs'), vm = require('vm'), path = require('path'), assert = require('assert');
const root = path.resolve(__dirname, '../../..');
const ts = require(root + '/node_modules/typescript');

function load(opts = {}) {
  const calls = { gather: 0, info: 0, init: 0, form: 0 };
  const covers = { open: 0, close: 0, openDuringGather: 0 };
  let coverDepth = 0;
  const consent = {
    gatherConsent: async () => { calls.gather++; if (coverDepth > 0) covers.openDuringGather++; if (opts.gather instanceof Error) throw opts.gather; return opts.gather; },
    getConsentInfo: async () => { calls.info++; if (opts.stored instanceof Error) throw opts.stored; return opts.stored; },
    showPrivacyOptionsForm: async () => { calls.form++; if (opts.formHold) await opts.formHold; if (opts.formFails) throw new Error('x'); return opts.formResult; },
  };
  const ads = { AdsConsent: consent, AdsConsentPrivacyOptionsRequirementStatus: { REQUIRED: 'REQUIRED', NOT_REQUIRED: 'NOT_REQUIRED', UNKNOWN: 'UNKNOWN' }, default: () => ({ initialize: async () => { calls.init++; if (opts.initFails) throw new Error('x'); } }) };
  const exec = { StoreClient: 'storeClient' };
  const ctx = { exports: {}, require: p => p === 'expo-constants'
    ? { __esModule: true, default: { executionEnvironment: opts.expoGo ? 'storeClient' : 'standalone' }, ExecutionEnvironment: exec }
    : p === 'react-native-google-mobile-ads' ? ads
    : p.endsWith('/adEvents') ? { openCoveringOverlay: () => { covers.open++; coverDepth++; return () => { covers.close++; coverDepth--; }; } }
    : {} };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(root + '/services/adsConsent.ts', 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, ctx);
  return { api: ctx.exports, calls, covers, setStored: v => { opts.stored = v; }, setGather: v => { opts.gather = v; } };
}

const results = [];
async function scenario(name, fn) {
  try { await fn(); results.push(['OK  ', name]); } catch (e) { results.push(['FAIL', name + '  ->  ' + String(e.message).split('\n')[0]]); }
}

(async () => {
  await scenario('1 consent not required / given: ads allowed and the ad SDK is started, once, however often it is asked', async () => {
    const L = load({ gather: { canRequestAds: true } });
    assert.strictEqual(await L.api.ensureAdsReady(), true);
    assert.strictEqual(await L.api.ensureAdsReady(), true);
    assert.deepStrictEqual({ ...L.calls }, { gather: 1, info: 0, init: 1, form: 0 });
  });

  await scenario('2 the form was not answered (Google says not yet): no ads, SDK not started, the form is not reopened on every screen', async () => {
    const L = load({ gather: { canRequestAds: false } });
    assert.strictEqual(await L.api.ensureAdsReady(), false);
    assert.strictEqual(await L.api.ensureAdsReady(), false);
    assert.deepStrictEqual({ ...L.calls }, { gather: 1, info: 0, init: 0, form: 0 });
  });

  await scenario('3 no connection but Google stored an earlier yes: ads allowed', async () => {
    const L = load({ gather: new Error('network'), stored: { canRequestAds: true } });
    assert.strictEqual(await L.api.ensureAdsReady(), true);
    assert.strictEqual(L.calls.init, 1);
  });

  await scenario('4 no connection and nothing stored: no ads now, and the next call tries again (never stuck)', async () => {
    const L = load({ gather: new Error('network'), stored: { canRequestAds: false } });
    assert.strictEqual(await L.api.ensureAdsReady(), false);
    assert.strictEqual(await L.api.ensureAdsReady(), false);
    assert.strictEqual(L.calls.gather, 2, 'did not retry');
    assert.strictEqual(L.calls.init, 0);
  });

  await scenario('5 everything fails (even the stored answer): resolves false, never throws', async () => {
    const L = load({ gather: new Error('a'), stored: new Error('b') });
    assert.strictEqual(await L.api.ensureAdsReady(), false);
  });

  await scenario('6 the ad SDK failing to start does not block a banner that has consent', async () => {
    const L = load({ gather: { canRequestAds: true }, initFails: true });
    assert.strictEqual(await L.api.ensureAdsReady(), true);
  });

  await scenario('7 Expo Go (no ad module): false, nothing touched', async () => {
    const L = load({ gather: { canRequestAds: true }, expoGo: true });
    assert.strictEqual(await L.api.ensureAdsReady(), false);
    assert.deepStrictEqual({ ...L.calls }, { gather: 0, info: 0, init: 0, form: 0 });
  });

  await scenario('8 wiring: asked at launch, and a banner renders nothing until consent answered', async () => {
    const layout = fs.readFileSync(root + '/app/_layout.tsx', 'utf8');
    assert.ok(/ensureAdsReady\(\)\.catch/.test(layout), 'not started at launch');
    const banner = fs.readFileSync(root + '/components/shared/SafeBannerAd.tsx', 'utf8');
    assert.ok(/!ready\) return null/.test(banner), 'banner renders before consent');
    assert.ok(/if \(alive\) setReady\(ok\)/.test(banner), 'banner updates after unmount');
  });

  await scenario('9 privacy-options button: only when Google says REQUIRED (EU / UK / CH); never elsewhere', async () => {
    for (const [status, want] of [['REQUIRED', true], ['NOT_REQUIRED', false], ['UNKNOWN', false]]) {
      const L = load({ gather: { canRequestAds: true }, stored: { privacyOptionsRequirementStatus: status } });
      assert.strictEqual(await L.api.privacyOptionsRequired(), want, status);
    }
  });

  await scenario('10 a user who refused ads still gets the button (to change their mind); errors and Expo Go give false', async () => {
    const A = load({ gather: { canRequestAds: false }, stored: { privacyOptionsRequirementStatus: 'REQUIRED' } });
    assert.strictEqual(await A.api.privacyOptionsRequired(), true);
    const B = load({ gather: { canRequestAds: true }, stored: new Error('x') });
    assert.strictEqual(await B.api.privacyOptionsRequired(), false);
    const C = load({ expoGo: true, stored: { privacyOptionsRequirementStatus: 'REQUIRED' } });
    assert.strictEqual(await C.api.privacyOptionsRequired(), false);
    assert.strictEqual(C.calls.info, 0);
  });

  await scenario('11 opening the form: Google form shown; a failure never throws', async () => {
    const A = load({ gather: { canRequestAds: true } }); await A.api.openPrivacyOptions(); assert.strictEqual(A.calls.form, 1);
    const B = load({ gather: { canRequestAds: true }, formFails: true }); await B.api.openPrivacyOptions();
  });

  await scenario('12 wiring: button on both Progress screens, rendered only when required, label empty = icon only', async () => {
    for (const f of ['app/(engineA)/(tabs)/progress.tsx', 'app/(engineB)/(tabs)/progress.tsx']) {
      const t = fs.readFileSync(root + '/' + f, 'utf8');
      assert.ok(/privacyOptions\.required && \(/.test(t), f + ' not conditional');
      assert.ok(/onPress=\{privacyOptions\.open\}/.test(t), f + ' not wired');
      assert.ok(t.indexOf('privacyOptions.required') < t.indexOf('Start exam'), f + ' button should sit above the exam button');
    }
    const hook = fs.readFileSync(root + '/hooks/usePrivacyOptions.ts', 'utf8');
    assert.ok(/useState\(false\)/.test(hook), 'must start hidden');
  });

  await scenario('13 CODEX round 3 B1: a user who REFUSED gets Google’s own answer (canRequestAds true = limited ads), not "no ads"', async () => {
    // UMP: after any answer the status is OBTAINED and canRequestAds is true; Google itself limits the ads.
    const L = load({ gather: { status: 'OBTAINED', canRequestAds: true } });
    assert.strictEqual(await L.api.ensureAdsReady(), true);
    const src = fs.readFileSync(root + '/services/adsConsent.ts', 'utf8');
    assert.ok(/limited ads/.test(src) && !/the user said no\)/.test(src), 'the comments still promise "no ads after a refusal"');
  });

  await scenario('14 CODEX round 3 B2: after the user changes the choice, the stored answer is refreshed and listeners are told', async () => {
    const L = load({ gather: { canRequestAds: true }, stored: { canRequestAds: true } });
    assert.strictEqual(await L.api.ensureAdsReady(), true);
    const heard = []; L.api.onAdsReadyChange(v => heard.push(v));
    L.setStored({ canRequestAds: false });
    await L.api.openPrivacyOptions();
    assert.strictEqual(await L.api.ensureAdsReady(), false, 'still the launch answer');
    assert.deepStrictEqual(heard, [false]);
    L.setStored({ canRequestAds: true });
    await L.api.openPrivacyOptions();
    assert.strictEqual(await L.api.ensureAdsReady(), true);
    assert.deepStrictEqual(heard, [false, true]);
    assert.strictEqual(L.calls.init, 1, 'SDK started more than once');
  });

  await scenario('15 a launch that failed offline and succeeded later tells waiting banners', async () => {
    const L = load({ gather: new Error('offline'), stored: { canRequestAds: false } });
    const heard = []; L.api.onAdsReadyChange(v => heard.push(v));
    assert.strictEqual(await L.api.ensureAdsReady(), false);
    assert.deepStrictEqual(heard, [], 'told about a failure');
    L.setGather({ canRequestAds: true });          // back online
    assert.strictEqual(await L.api.ensureAdsReady(), true);
    assert.deepStrictEqual(heard, [true], 'waiting banners were not told');
  });

  await scenario('16 Google’s screens cover our sponsor cards: during the launch form and the change-choice form', async () => {
    const L = load({ gather: { canRequestAds: true }, stored: { canRequestAds: true } });
    await L.api.ensureAdsReady();
    assert.strictEqual(L.covers.openDuringGather, 1, 'not covered while the launch form may be open');
    await L.api.openPrivacyOptions();
    assert.deepStrictEqual({ open: L.covers.open, close: L.covers.close }, { open: 2, close: 2 });
  });

  await scenario('17 a second tap while the change-choice form is open does not open it twice', async () => {
    let release; const hold = new Promise(r => { release = r; });
    const L = load({ gather: { canRequestAds: true }, stored: { canRequestAds: true }, formHold: hold });
    await L.api.ensureAdsReady();
    const p1 = L.api.openPrivacyOptions(); const p2 = L.api.openPrivacyOptions();
    release(); await Promise.all([p1, p2]);
    assert.strictEqual(L.calls.form, 1);
  });

  await scenario('18 CODEX round 3 B3: Google measurement waits for the first ad request (app.json plugin setting)', async () => {
    const app = JSON.parse(fs.readFileSync(root + '/app.json', 'utf8'));
    const entry = app.expo.plugins.find(p => Array.isArray(p) && p[0] === 'react-native-google-mobile-ads');
    assert.ok(entry, 'plugin entry missing');
    assert.strictEqual(entry[1].delayAppMeasurementInit, true);
  });

  await scenario('19 CODEX round 4 R4-4: nothing says limited ads use NO personal data (code comment and both policy texts)', async () => {
    const src = fs.readFileSync(root + '/services/adsConsent.ts', 'utf8');
    assert.ok(!/use no personal data/.test(src) && /not personalised/.test(src), 'code comment still too broad');
    const page = fs.readFileSync(root + '/docs/privacy-policy.html', 'utf8');
    assert.ok(!/do not use your personal data/.test(page), 'English policy still too broad');
    assert.ok(/not personalised with your data/.test(page) && /IP address/.test(page), 'English policy lacks the accurate wording');
    assert.strictEqual((page.match(/support\.google\.com\/admob\/answer\/10105530/g) || []).length, 2, 'Google link not in both languages');
    // CODEX round 5, R5-1: the Amharic must not keep the old "do not use your personal data" clause
    assert.ok(!page.includes('\u12e8\u130d\u120d \u12cd\u1202\u1265\u12ce\u1295 \u12e8\u121b\u12ed\u1320\u1240\u1219'), 'Amharic still says the ads do not use personal data');
  });

  for (const [s, n] of results) console.log(s, n);
  const bad = results.filter(r => r[0] === 'FAIL').length;
  console.log(`\n${results.length - bad} of ${results.length} scenarios passed`);
  process.exitCode = bad ? 1 : 0;
})().catch(e => { console.log('TEST ERROR', e); process.exitCode = 1; });
