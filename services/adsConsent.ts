/**
 * services/adsConsent.ts
 *
 * Consent for Google ads (Google's User Messaging Platform, "UMP"). Users in the
 * EU / UK / Switzerland must be asked before an ad is requested; everywhere else
 * Google says "not required" and nothing is shown. The form text itself is set in
 * the AdMob console (Privacy & messaging), not here.
 *
 * ensureAdsReady() is started once at app launch (app/_layout.tsx), so the
 * question appears at the start and never in the middle of a lesson. The banner
 * (components/shared/SafeBannerAd.tsx) shows nothing until it resolves true.
 *
 * What "ready" means is Google's own rule (canRequestAds), decided with the owner on
 * 2026-10-26 after CODEX round 3 (B1): it is true once the user has ANSWERED the form,
 * whatever the answer, or when no form is needed. A user who refused then gets
 * Google's "limited ads": they are not personalised with the user's data, but Google
 * still uses some data (for example the IP address) to deliver the ad and to prevent
 * fraud, see https://support.google.com/admob/answer/10105530 (CODEX round 4, R4-4).
 * Google applies the choice itself on every ad request (the answer is stored on the
 * phone by the UMP SDK). The app does not try to second-guess that.
 *
 * Resolves true  = ads may be requested.
 * Resolves false = not yet (the form was not answered) or Expo Go (no ad module).
 * An error (for example no connection) falls back to the last answer Google stored
 * on the phone; with none, no ad is requested and the next call tries again, so it
 * can never leave the app stuck.
 *
 * Changing the choice later (openPrivacyOptions) refreshes the stored answer and
 * tells every listener (onAdsReadyChange), so banners and the full-screen ad follow it.
 */
import Constants, { ExecutionEnvironment } from 'expo-constants';

let started: Promise<boolean> | null = null;
let initialized = false;
const readyListeners = new Set<(ready: boolean) => void>();

/** Google's own consent screens cover the app: our sponsor ads under them are not "seen". */
function coverAds(): () => void {
  try {
    const { openCoveringOverlay } = require('./adEvents');
    return typeof openCoveringOverlay === 'function' ? openCoveringOverlay() : () => {};
  } catch {
    return () => {};
  }
}

function announce(ready: boolean): void {
  readyListeners.forEach(fn => { try { fn(ready); } catch {} });
}

async function initializeOnce(ads: any): Promise<void> {
  if (initialized) return;
  initialized = true;
  try { await ads.default().initialize(); } catch { /* the banner still requests its own ad */ }
}

async function run(): Promise<boolean> {
  const ads = require('react-native-google-mobile-ads');
  const consent = ads.AdsConsent;
  let canRequest = false;
  const uncover = coverAds();
  try {
    const info = await consent.gatherConsent();
    canRequest = !!info?.canRequestAds;
  } catch {
    try {
      const info = await consent.getConsentInfo();
      canRequest = !!info?.canRequestAds;
    } catch {
      canRequest = false;
    }
    if (!canRequest) started = null;   // could not reach Google: try again next time
  } finally {
    uncover();
  }
  if (canRequest) await initializeOnce(ads);
  return canRequest;
}

export function ensureAdsReady(): Promise<boolean> {
  if (Constants.executionEnvironment === ExecutionEnvironment.StoreClient) return Promise.resolve(false);
  if (!started) {
    started = run()
      .then(ok => { if (ok) announce(true); return ok; })
      .catch(() => { started = null; return false; });
  }
  return started;
}

/**
 * Told whenever the answer may have changed: after a late success (the launch step
 * failed offline and a later try worked) and after the user changed the choice.
 * Returns the unsubscribe.
 */
export function onAdsReadyChange(fn: (ready: boolean) => void): () => void {
  readyListeners.add(fn);
  return () => { readyListeners.delete(fn); };
}

/**
 * True only for users Google says must be able to change their ad choices later
 * (EU / UK / Switzerland). Everyone else: false, and the button is never shown.
 * Waits for the launch consent step first, so the answer is current. A user who
 * refused still gets true, so they can change their mind.
 */
export async function privacyOptionsRequired(): Promise<boolean> {
  if (Constants.executionEnvironment === ExecutionEnvironment.StoreClient) return false;
  try {
    await ensureAdsReady();
    const ads = require('react-native-google-mobile-ads');
    const info = await ads.AdsConsent.getConsentInfo();
    return info?.privacyOptionsRequirementStatus === ads.AdsConsentPrivacyOptionsRequirementStatus.REQUIRED;
  } catch {
    return false;
  }
}

let formOpen = false;

/**
 * Opens Google's own form where the user changes their choices, then refreshes the
 * stored answer and tells every listener (CODEX round 3, B2). Never throws. A second
 * tap while the form is open does nothing.
 */
export async function openPrivacyOptions(): Promise<void> {
  if (formOpen) return;
  formOpen = true;
  const uncover = coverAds();
  try {
    const ads = require('react-native-google-mobile-ads');
    let info: any = null;
    try { info = await ads.AdsConsent.showPrivacyOptionsForm(); } catch { /* not shown */ }
    try { info = await ads.AdsConsent.getConsentInfo(); } catch { /* keep what the form returned */ }
    if (info) {
      const ok = !!info.canRequestAds;
      started = Promise.resolve(ok);
      if (ok) await initializeOnce(ads);
      announce(ok);
    }
  } catch {
    /* nothing to show or no connection: the user simply stays on the screen */
  } finally {
    uncover();
    formOpen = false;
  }
}
