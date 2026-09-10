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
import { getLocationConsentState } from './useLocationPrompt';
import { supabase } from '../backend/supabaseClient';

/**
 * Session guard: this hook mounts on several screens (both home screens,
 * both progress screens, both topic-quiz results, the exam result), so
 * without this the IP lookup would fire on every single navigation. The
 * geolocation provider is rate-limited and an IP city does not change
 * mid-session, so once per app run is enough.
 */
let ipLookupDoneThisSession = false;

async function maybeResolveIpCity(userId: string): Promise<void> {
  if (ipLookupDoneThisSession) return;
  try {
    const state = await getLocationConsentState();
    if (state !== 'unknown') return; // 'approved' has a better source; 'declined' must not be worked around

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
    if (city) await api.updateUserIpCity(userId, city);
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

    (async () => {
      await maybeResolveIpCity(userId);
      const result = await api.getSponsorAd(userId, category);
      if (!cancelled) setAd(result);
    })().catch(() => {});

    return () => { cancelled = true; };
  }, [userId, category]);

  return ad;
}
