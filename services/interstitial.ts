/**
 * services/interstitial.ts
 *
 * Full-screen Google ads, counted in ANSWERED QUESTIONS (not in finished quizzes), so
 * a learner who answers 9 questions spread over several topics gets the same ad as one
 * who finishes 3 whole quizzes. Same policy in Engine A and Engine B: signs and
 * behavioral topics, topic quizzes, the daily quiz and the exam.
 *
 * Rules agreed with the owner (2026-10-27, replacing the 2026-10-25 "every 2nd end point"):
 *   - none in the first 2 times the app is opened
 *   - then one ad for every 9 answered questions (a count, never a timer)
 *   - the answer itself only COUNTS (countAnsweredQuestion); the ad is shown only at the END of a
 *     quiz, after the feedback of its last answer (the move to the end screen / the result), never
 *     between two questions (owner's decision 2026-10-27). Never while a question is open, audio
 *     plays or a lesson runs, and never on a back button. An ad that falls due in the middle of a
 *     quiz waits for the end of it (or of the next one)
 *   - the exam counts its questions too, but shows the ad only when it ends
 *   - an ad that is not loaded is skipped silently; it never makes the learner wait
 *     and it stays "due" for the next transition
 *   - only after Google's consent step allows ads (services/adsConsent.ts)
 *
 * Everything here is fire-and-forget safe: maybeShowInterstitial() never throws and
 * always resolves, so the caller can simply `await` it and then move on.
 */
import * as FileSystem from 'expo-file-system/legacy';
import { ensureAdsReady, onAdsReadyChange } from './adsConsent';

export const INTERSTITIAL_UNIT_ID = 'ca-app-pub-8758594752714631/8327375631';

export const OPENS_WITHOUT_ADS = 2;     // the first 2 launches show no full-screen ad
export const QUESTIONS_PER_AD = 9;      // one ad for every 9 answered questions
const SHOW_TIMEOUT_MS = 90_000;         // safety: never hold the screen forever

const PREFS_PATH = (FileSystem.documentDirectory ?? '') + 'interstitial_prefs.json';

export interface InterstitialPrefs {
  /** How many times the app was opened (counted once per launch). */
  opens: number;
  /** Questions answered since the last ad (only counted from the 3rd launch on). */
  answersSinceShown: number;
}

/** Pure: one more answered question (nothing is counted in the first launches). */
export function countAnswer(prefs: InterstitialPrefs): InterstitialPrefs {
  if (prefs.opens <= OPENS_WITHOUT_ADS) return prefs;
  return { ...prefs, answersSinceShown: Math.min(prefs.answersSinceShown + 1, 10_000) };
}

/** Pure decision: what happens at a transition. Nothing is counted here. */
export function decide(prefs: InterstitialPrefs, adLoaded: boolean): { show: boolean; next: InterstitialPrefs } {
  if (prefs.opens <= OPENS_WITHOUT_ADS) return { show: false, next: prefs };
  if (prefs.answersSinceShown >= QUESTIONS_PER_AD && adLoaded) {
    return { show: true, next: { ...prefs, answersSinceShown: 0 } };
  }
  return { show: false, next: prefs };
}

async function readPrefs(): Promise<InterstitialPrefs> {
  try {
    const info = await FileSystem.getInfoAsync(PREFS_PATH);
    if (!info.exists) return { opens: 0, answersSinceShown: 0 };
    const p = JSON.parse(await FileSystem.readAsStringAsync(PREFS_PATH));
    return {
      opens: Number.isFinite(p?.opens) ? Math.max(0, Math.floor(p.opens)) : 0,
      answersSinceShown: Number.isFinite(p?.answersSinceShown) ? Math.max(0, Math.floor(p.answersSinceShown)) : 0,
    };
  } catch {
    return { opens: 0, answersSinceShown: 0 };
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

async function showOnce(canShow?: () => boolean): Promise<void> {
  const { show, opens } = await serial(async () => {
    const prefs = await readPrefs();
    const r = decide(prefs, adLoaded && !!ad);
    if (r.next.answersSinceShown !== prefs.answersSinceShown) await writePrefs(r.next);
    // The learner may have left the screen while the disk was read or written (CODEX round 6,
    // R6-4): then no ad is shown over another screen, and the ad stays due. Checked here, after
    // the last disk access and with no waiting between this check and show().
    if (r.show && canShow && !canShow()) {
      await writePrefs(prefs);
      return { show: false, opens: prefs.opens };
    }
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
  } catch {
    // show() threw at once (a destroyed ad, a lifecycle error): nothing was seen, so it is
    // handled below like any ad that never appeared and stays due (CODEX round 6).
  } finally {
    uncover();
    showing = false;
    discard();
  }
  if (!opened) {
    // It never appeared (show refused or an error): the learner saw nothing, so the
    // ad stays due for the next transition instead of being used up.
    await serial(async () => {
      const prefs = await readPrefs();
      await writePrefs({ ...prefs, answersSinceShown: Math.max(prefs.answersSinceShown, QUESTIONS_PER_AD) });
    });
  }
  prepareInBackground();
}

/**
 * Call once per ANSWERED question (at the moment the learner answers). Only counts:
 * never shows anything, never throws, never makes the caller wait.
 */
export function countAnsweredQuestion(): void {
  serial(async () => {
    const prefs = await readPrefs();
    const next = countAnswer(prefs);
    if (next.answersSinceShown !== prefs.answersSinceShown) await writePrefs(next);
    // Get the ad ready a few answers ahead, so it is loaded when it becomes due.
    if (next.opens > OPENS_WITHOUT_ADS && next.answersSinceShown >= QUESTIONS_PER_AD - 3 && !ad && !showing) {
      prepareInBackground();
    }
  }).catch(() => {});
}

/**
 * At a transition AFTER an answer's feedback (next question, end screen, end of the exam):
 * shows an ad when 9 answers have been counted and one is loaded, and resolves when it
 * is closed (or at once when nothing is shown). Never throws, never counts.
 *
 * Single flight (CODEX round 3, C1): a second call while one is still being decided
 * or shown gets the same promise, so a caller that moves on after awaiting it moves
 * on only after the ad is closed.
 *
 * `canShow` (CODEX round 6, R6-4): the screen that asks passes a check that is false once
 * the learner has left it. It is evaluated right before the ad would be shown; when it is
 * false nothing is shown and the ad stays due. After the await the caller must also check
 * that its screen is still the active one before it moves on.
 */
export function maybeShowInterstitial(canShow?: () => boolean): Promise<void> {
  if (inFlight) return inFlight;
  inFlight = showOnce(canShow)
    .catch(() => { showing = false; })
    .finally(() => { inFlight = null; });
  return inFlight;
}
