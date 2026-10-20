/**
 * hooks/useSponsorAd.ts
 * Fetches one active, location-matched sponsor ad for the current user
 * (see backend/api.ts getSponsorAd) — starts as null and stays null
 * whenever there is no match, so callers should render nothing rather
 * than a placeholder while/if this never resolves.
 *
 * Also owns the ONE piece of IP-based location logic in the app: when the
 * user has never been asked for (precise, GPS-based) location at all yet
 * — see hooks/useLocationPrompt.ts getLocationConsentState — this silently
 * resolves a coarse IP city and saves it as a one-off fallback, purely so
 * this ad lookup has something to match on. It never runs for a user who
 * already approved (their precise city is used instead) or who explicitly
 * declined (their "not now" must not be worked around a different way).
 */

import { useEffect, useState } from 'react';
import * as api from '../backend/api';
import { SponsorAd } from '../backend/api';
import { getLocationConsentState, onLocationDeclined } from './useLocationPrompt';
import { onConnectivityChange } from './useNetworkStatus';
import { supabase } from '../backend/supabaseClient';

/**
 * Session guard: this hook mounts on several screens (both home screens,
 * both progress screens, both topic-quiz results, the exam result), so
 * without this the IP lookup would fire on every single navigation. The
 * geolocation provider is rate-limited and an IP city does not change
 * mid-session, so once per app run is enough.
 */
let ipLookupDoneThisSession = false;
/** The user whose IP city the server has CONFIRMED wiped after a decline, in this app run. */
let wipeConfirmedFor: string | null = null;
/**
 * IP city writes that may still reach the server: counted from just before the
 * consent check that lets one go until its answer. A wipe sent meanwhile may
 * arrive BEFORE the write and be undone by it (CODEX QA round 3, S2).
 */
let ipWritesPending = 0;

/**
 * A "no" must stay a no. The wipe made at the moment of the decline
 * (useLocationPrompt handleNotNow) can fail with no connection, and a lookup
 * already on its way could write the city back after it. So for a declined
 * user the wipe is repeated on every lookup until the server confirms it once
 * in this app run (a harmless no-op when the city is already empty). It runs
 * BEFORE the once-per-run IP lookup shortcut below: that shortcut used to skip
 * it when the decline came after a lookup in the same run (CODEX QA R7).
 * A wipe counts as confirmed only when no IP city write could still land
 * after it (S2); until then it is also sent again when the connection comes
 * back and on a slow timer, not only by the next lookup (S1).
 * Returns true when the user has declined.
 */
async function wipeIfDeclined(userId: string): Promise<boolean> {
  if ((await getLocationConsentState()) !== 'declined') {
    stopWipeRetry();
    return false;
  }
  if (wipeConfirmedFor !== userId) {
    const nothingPending = ipWritesPending === 0;
    const wiped = await api.clearUserIpCity(userId).catch(() => false);
    if (wiped && nothingPending) {
      wipeConfirmedFor = userId;
      stopWipeRetry();
    } else {
      retryWipeLater(userId);
    }
  }
  return true;
}

// ─── Until the server confirms the wipe (CODEX QA round 3, S1) ────────────────
// A wipe that failed (no connection) used to be sent again only by the next
// ad lookup: the next screen that shows an ad, or the next app start. Staying
// on the same screen left the city on the server after the connection came
// back. Now it is also sent when the connection returns, and on a slow timer
// (for a server error while connected), until the server confirms it.

const WIPE_RETRY_MS = [60_000, 180_000, 600_000];   // then every 10 minutes
let wipeRetryUserId: string | null = null;
let wipeReconnectWatch: (() => void) | null = null;
let wipeRetryTimer: ReturnType<typeof setTimeout> | null = null;
let wipeRetryStep = 0;

function retryWipeLater(userId: string): void {
  wipeRetryUserId = userId;
  if (!wipeReconnectWatch) {
    wipeReconnectWatch = onConnectivityChange(connected => {
      if (connected && wipeRetryUserId) void wipeIfDeclined(wipeRetryUserId).catch(() => {});
    });
  }
  if (!wipeRetryTimer) {
    const delay = WIPE_RETRY_MS[Math.min(wipeRetryStep, WIPE_RETRY_MS.length - 1)];
    wipeRetryStep++;
    wipeRetryTimer = setTimeout(() => {
      wipeRetryTimer = null;
      if (wipeRetryUserId) void wipeIfDeclined(wipeRetryUserId).catch(() => {});
    }, delay);
  }
}

function stopWipeRetry(): void {
  try { wipeReconnectWatch?.(); } catch {}
  wipeReconnectWatch = null;
  if (wipeRetryTimer) { clearTimeout(wipeRetryTimer); wipeRetryTimer = null; }
  wipeRetryStep = 0;
  wipeRetryUserId = null;
}

// "Not now" pressed on a screen with no ad (the question screens): the wipe
// made there gets the same retries as one made here (S1).
onLocationDeclined(userId => {
  if (userId) void wipeIfDeclined(userId).catch(() => {});
});

async function maybeResolveIpCity(userId: string): Promise<void> {
  try {
    if (await wipeIfDeclined(userId)) return;
    if (ipLookupDoneThisSession) return;
    const state = await getLocationConsentState();
    if (state !== 'unknown') return; // 'approved' has a better source

    // Already have something to match on (from an earlier run) — don't
    // spend another provider request on it.
    if (await api.userHasLocation(userId)) {
      ipLookupDoneThisSession = true;
      return;
    }

    ipLookupDoneThisSession = true;
    const { data, error } = await supabase.functions.invoke('ip-geolocate', { body: {} });
    if (error) throw error;
    const city: string | null = data?.city ?? null;
    // The user may have said "not now" while the lookup was on its way: that
    // decision wins, the city is not written (CODEX QA 2026-10-08, Q11).
    let wrote = false;
    ipWritesPending++;   // from before the check: a "no" from here on may race the write
    try {
      if (city && (await getLocationConsentState()) === 'unknown') {
        wrote = true;
        await api.updateUserIpCity(userId, city);
      }
    } finally {
      ipWritesPending--;
    }
    // "Not now" pressed while the write was on its way: it may have landed
    // after the wipe. Wipe again now that it is done (CODEX QA round 3, S2).
    if (wrote && (await getLocationConsentState()) === 'declined') {
      wipeConfirmedFor = null;
      await wipeIfDeclined(userId);
    }
  } catch (err) {
    console.warn('[useSponsorAd] IP city resolution failed:', err);
  }
}

export function useSponsorAd(
  userId: string | null,
  category: string = 'driving_instructor'
): SponsorAd | null {
  const [ad, setAd] = useState<SponsorAd | null>(null);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    let run = 0;   // a newer lookup makes the result of an older one stale

    const lookUp = async (): Promise<void> => {
      const mine = ++run;
      await maybeResolveIpCity(userId);
      // After a "no", never match on an IP city, even one still on the server.
      const useIpCity = (await getLocationConsentState()) !== 'declined';
      const result = await api.getSponsorAd(userId, category, { useIpCity });
      if (cancelled || mine !== run) return;
      // "Not now" may have been pressed while this lookup was on its way: a
      // result that may rest on the IP city is not shown; look again without
      // it (CODEX QA 2026-10-08, R7).
      if (useIpCity && (await getLocationConsentState()) === 'declined') {
        if (!cancelled && mine === run) void lookUp().catch(() => {});
        return;
      }
      if (!cancelled && mine === run) setAd(result);
    };

    void lookUp().catch(() => {});

    // "Not now" pressed while this screen is open: drop an ad that may rest on
    // the IP city at once, and look again without it.
    const unsubscribe = onLocationDeclined(() => {
      if (cancelled) return;
      setAd(null);
      void lookUp().catch(() => {});
    });

    return () => { cancelled = true; unsubscribe(); };
  }, [userId, category]);

  return ad;
}
