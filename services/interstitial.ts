/**
 * services/interstitial.ts
 *
 * Full-screen Google ads at natural END POINTS only: when the learner leaves the
 * "subtopic finished" screen or the "topic quiz result" screen (the handleBack of
 * those screens). Never during a lesson, while audio plays, after a wrong answer,
 * or on the way into an exam. Same policy in Engine A and Engine B.
 *
 * Rules agreed with the owner (2026-10-25):
 *   - none in the first 2 times the app is opened
 *   - then one ad for every 2nd finished subtopic / topic quiz (a count, never a timer)
 *   - an ad that is not loaded is skipped silently; it never makes the learner wait
 *     and it stays "due" for the next end point
 *   - only after Google's consent step allows ads (services/adsConsent.ts)
 *
 * Everything here is fire-and-forget safe: maybeShowInterstitial() never throws and
 * always resolves, so the caller can simply `await` it and then navigate.
 */
import * as FileSystem from 'expo-file-system/legacy';
import { ensureAdsReady, onAdsReadyChange } from './adsConsent';

export const INTERSTITIAL_UNIT_ID = 'ca-app-pub-8758594752714631/8327375631';

export const OPENS_WITHOUT_ADS = 2;     // the first 2 launches show no full-screen ad
export const END_POINTS_PER_AD = 2;     // one ad for every 2nd end point
const SHOW_TIMEOUT_MS = 90_000;         // safety: never hold the screen forever

const PREFS_PATH = (FileSystem.documentDirectory ?? '') + 'interstitial_prefs.json';

export interface InterstitialPrefs {
  /** How many times the app was opened (counted once per launch). */
  opens: number;
  /** End points reached since the last ad (only counted from the 3rd launch on). */
  sinceShown: number;
}

/** Pure decision: what happens at an end point. */
export function decide(prefs: InterstitialPrefs, adLoaded: boolean): { show: boolean; next: InterstitialPrefs } {
  if (prefs.opens <= OPENS_WITHOUT_ADS) return { show: false, next: prefs };
  const sinceShown = prefs.sinceShown + 1;
  if (sinceShown >= END_POINTS_PER_AD && adLoaded) {
    return { show: true, next: { ...prefs, sinceShown: 0 } };
  }
  return { show: false, next: { ...prefs, sinceShown } };
}

async function readPrefs(): Promise<InterstitialPrefs> {
  try {
    const info = await FileSystem.getInfoAsync(PREFS_PATH);
    if (!info.exists) return { opens: 0, sinceShown: 0 };
    const p = JSON.parse(await FileSystem.readAsStringAsync(PREFS_PATH));
    return {
      opens: Number.isFinite(p?.opens) ? Math.max(0, Math.floor(p.opens)) : 0,
      sinceShown: Number.isFinite(p?.sinceShown) ? Math.max(0, Math.floor(p.sinceShown)) : 0,
    };
  } catch {
    return { opens: 0, sinceShown: 0 };
  }
}

async function writePrefs(p: InterstitialPrefs): Promise<void> {
  try { await FileSystem.writeAsStringAsync(PREFS_PATH, JSON.stringify(p)); } catch { /* next launch tries again */ }
}

// Reads and writes of the counters run one after the other, so two quick calls
// cannot both read the same value.
let queue: Promise<unknown> = Promise.resolve();
function serial<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(fn, fn);
  queue = run.catch(() => {});
  return run;
}

// ─── the ad itself ────────────────────────────────────────────────────────────

let ad: any = null;
let adLoaded = false;
let showing = false;
let counted = false;
let subscribed = false;
let inFlight: Promise<void> | null = null;
let opensThisLaunch = 0;   // set by startInterstitial; 0 until then (= no full-screen ad yet)

/** Drops a prepared ad (its listeners too). */
function discard(): void {
  const old = ad;
  ad = null;
  adLoaded = false;
  try { old?.removeAllListeners?.(); } catch { /* nothing to clean */ }
}

function preload(): void {
  if (ad || showing) return;
  try {
    const { InterstitialAd, AdEventType } = require('react-native-google-mobile-ads');
    const inst = InterstitialAd.createForAdRequest(INTERSTITIAL_UNIT_ID, { requestNonPersonalizedAdsOnly: false });
    ad = inst;
    adLoaded = false;
    inst.addAdEventListener(AdEventType.LOADED, () => { if (ad === inst) adLoaded = true; });
    inst.addAdEventListener(AdEventType.ERROR, () => { if (ad === inst && !showing) discard(); });
    inst.load();
  } catch {
    discard();
  }
}

/** Prepares the next ad in the background. Never awaited by a screen that is being left. */
function prepareInBackground(): void {
  ensureAdsReady().then(ok => { if (ok) preload(); }).catch(() => {});
}

/**
 * Call once per app launch (app/_layout.tsx): counts the launch and, from the
 * 3rd one on, prepares the first ad in the background.
 */
export async function startInterstitial(): Promise<void> {
  try {
    if (!subscribed) {
      subscribed = true;
      // The user changed the ad choice: an ad prepared under the old choice is dropped,
      // the next one is requested under the new one (CODEX round 3, B2).
      onAdsReadyChange(ok => {
        if (showing) return;
        discard();
        // never in the first launches, which show no full-screen ad at all (CODEX round 4)
        if (ok && opensThisLaunch > OPENS_WITHOUT_ADS) prepareInBackground();
      });
    }
    if (!counted) {
      counted = true;
      await serial(async () => {
        const p = await readPrefs();
        await writePrefs({ ...p, opens: p.opens + 1 });
      });
    }
    const p = await serial(readPrefs);
    opensThisLaunch = p.opens;
    if (p.opens <= OPENS_WITHOUT_ADS) return;
    prepareInBackground();
  } catch { /* an ad is never worth a crash */ }
}

async function showOnce(): Promise<void> {
  const { show, opens } = await serial(async () => {
    const prefs = await readPrefs();
    const r = decide(prefs, adLoaded && !!ad);
    if (r.next.sinceShown !== prefs.sinceShown) await writePrefs(r.next);
    return { show: r.show, opens: prefs.opens };
  });
  if (!show) {
    // Not due, or not loaded yet: prepare one for next time, WITHOUT making the
    // learner wait for it (CODEX round 3: this used to await the consent step).
    // Never in the first launches, which show no full-screen ad at all.
    if (opens > OPENS_WITHOUT_ADS && !ad) prepareInBackground();
    return;
  }
  const inst = ad;
  if (!inst) return;
  showing = true;
  let opened = false;
  const uncover = (() => {
    try { const { openCoveringOverlay } = require('./adEvents'); return typeof openCoveringOverlay === 'function' ? openCoveringOverlay() : () => {}; }
    catch { return () => {}; }
  })();
  try {
    const { AdEventType } = require('react-native-google-mobile-ads');
    await new Promise<void>(resolve => {
      let timer: ReturnType<typeof setTimeout> | null = null;
      const unsub: Array<() => void> = [];
      const done = () => {
        if (timer) clearTimeout(timer);
        unsub.forEach(u => { try { u(); } catch {} });
        resolve();
      };
      if (AdEventType.OPENED) unsub.push(inst.addAdEventListener(AdEventType.OPENED, () => { opened = true; }));
      unsub.push(inst.addAdEventListener(AdEventType.CLOSED, () => { opened = true; done(); }));
      unsub.push(inst.addAdEventListener(AdEventType.ERROR, done));
      timer = setTimeout(done, SHOW_TIMEOUT_MS);
      Promise.resolve(inst.show()).catch(done);
    });
  } finally {
    uncover();
    showing = false;
    discard();
  }
  if (!opened) {
    // It never appeared (show refused or an error): the learner saw nothing, so the
    // ad stays due for the next end point instead of being used up.
    await serial(async () => {
      const prefs = await readPrefs();
      await writePrefs({ ...prefs, sinceShown: Math.max(prefs.sinceShown, END_POINTS_PER_AD - 1) });
    });
  }
  prepareInBackground();
}

/**
 * At an end point: shows an ad when one is due and loaded, and resolves when it
 * is closed (or at once when nothing is shown). Never throws.
 *
 * Single flight (CODEX round 3, C1): a second call while one is still being decided
 * or shown does NOT count another end point; it gets the same promise, so a caller
 * that navigates after awaiting it navigates only after the ad is closed.
 */
export function maybeShowInterstitial(): Promise<void> {
  if (inFlight) return inFlight;
  inFlight = showOnce()
    .catch(() => { showing = false; })
    .finally(() => { inFlight = null; });
  return inFlight;
}
