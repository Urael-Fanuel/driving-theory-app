/**
 * hooks/useLocationPrompt.ts
 * Shows the location-permission primer at whatever moment a screen calls
 * maybeShow() — the app owner's chosen moment is right after finishing a
 * sign/behavioral quiz (the last of its 3 questions), a "delighted moment"
 * right before returning to more content.
 *
 * Re-ask policy (not "once ever", not "every quiz" — both were rejected as
 * too extreme): if the user dismisses with "not now", maybeShow() stays
 * silent for RE_ASK_AFTER_QUIZZES more completed quizzes, then auto-prompts
 * ONE more time. After a second dismissal, maybeShow() never prompts again
 * on its own. Approving at any point stops all future auto-prompts.
 * Beyond that, a permanent low-friction entry point belongs in each engine's
 * Progress tab (see showManually()) so a user who changes their mind later
 * is never locked out — see app/(engineA|B)/(tabs)/progress.tsx.
 *
 * State is tracked in a local JSON file, independent of EngineContext's own
 * app_prefs.json — kept separate so this feature can be added/removed
 * without touching that file's shape.
 *
 * On approval: requests FOREGROUND-ONLY location (never background — this
 * is the most heavily scrutinized permission tier in Play Store review, and
 * unnecessary here since we only need "where is the user right now, while
 * they're using the app"), reads the current position ONCE, resolves it to a
 * city + country via the reverse-geocode Edge Function (Google Geocoding
 * API, works anywhere in the world — a hardcoded city list was tried first
 * and was wrong for an international app), and saves it to the user's own
 * row.
 *
 * Does not yet feed any ad-serving system — no such system exists yet
 * (see planning/platform-architecture.md). This hook's job ends at "the
 * user's city + country are saved", which is the prerequisite for that
 * future work, not a replacement for it.
 */

import { useCallback, useEffect, useState } from 'react';
import * as FileSystem from 'expo-file-system/legacy';
import * as Location from 'expo-location';
import { supabase } from '../backend/supabaseClient';
import { updateUserLocation } from '../backend/api';

const PREFS_PATH = (FileSystem.documentDirectory ?? '') + 'location_prompt.json';

/** How many more completed quizzes to wait before the one automatic re-ask. */
const RE_ASK_AFTER_QUIZZES = 7;
/** Total automatic prompts allowed: the first ask + the one re-ask. */
const MAX_AUTO_ASKS = 2;

interface LocationPrefs {
  /** How many times the user dismissed with "not now". */
  notNowCount?: number;
  /** User approved at least once — never auto-prompt again. */
  approved?: boolean;
  /** Quizzes completed since the last dismissal, toward the one re-ask. */
  quizzesSincePrompt?: number;
}

async function readPrefs(): Promise<LocationPrefs> {
  try {
    const info = await FileSystem.getInfoAsync(PREFS_PATH);
    if (!info.exists) return {};
    const content = await FileSystem.readAsStringAsync(PREFS_PATH);
    return JSON.parse(content) as LocationPrefs;
  } catch {
    return {};
  }
}

async function writePrefs(prefs: LocationPrefs): Promise<void> {
  try {
    await FileSystem.writeAsStringAsync(PREFS_PATH, JSON.stringify(prefs));
  } catch (err) {
    console.warn('[useLocationPrompt] Failed to write prefs:', err);
  }
}

export interface UseLocationPromptReturn {
  /** Whether the primer modal should currently be rendered. */
  visible: boolean;
  /** True once the user has approved at least once — callers (e.g. the
   *  Progress tab) can use this to hide the manual entry point. Starts
   *  false and updates asynchronously once prefs load from disk. */
  approved: boolean;
  /**
   * Call after finishing a quiz's last question. Returns true if it showed
   * the primer (caller should wait for the user's choice before
   * navigating); false if this was not an auto-prompt moment (caller should
   * navigate immediately). Silent between the first ask and the one re-ask,
   * and permanently silent after the re-ask is also dismissed — see
   * showManually() for how a user can still turn it on later.
   */
  maybeShow: () => Promise<boolean>;
  /** Force-show the primer regardless of the auto-ask state. For a
   *  permanent, low-friction entry point (e.g. a Progress-tab button) so a
   *  user who dismissed the auto-prompts can still change their mind later. */
  showManually: () => void;
  /** User tapped "yes" on the primer — triggers the REAL OS permission dialog. */
  handleApprove: () => void;
  /** User tapped "maybe later". */
  handleNotNow: () => void;
}

export function useLocationPrompt(userId: string | null): UseLocationPromptReturn {
  const [visible, setVisible] = useState(false);
  const [approved, setApproved] = useState(false);

  useEffect(() => {
    readPrefs().then(prefs => { if (prefs.approved) setApproved(true); });
  }, []);

  const maybeShow = useCallback(async (): Promise<boolean> => {
    const prefs = await readPrefs();
    if (prefs.approved) return false;

    const notNowCount = prefs.notNowCount ?? 0;

    if (notNowCount === 0) {
      setVisible(true);
      return true;
    }
    if (notNowCount >= MAX_AUTO_ASKS) return false; // exhausted — manual entry only from here

    // notNowCount === 1: waiting out RE_ASK_AFTER_QUIZZES before the one re-ask.
    const seen = (prefs.quizzesSincePrompt ?? 0) + 1;
    if (seen >= RE_ASK_AFTER_QUIZZES) {
      await writePrefs({ ...prefs, quizzesSincePrompt: 0 });
      setVisible(true);
      return true;
    }
    await writePrefs({ ...prefs, quizzesSincePrompt: seen });
    return false;
  }, []);

  const showManually = useCallback(() => {
    setVisible(true);
  }, []);

  const handleApprove = useCallback(() => {
    setVisible(false);
    setApproved(true);
    // Fire-and-forget: the quiz navigation the caller does right after this
    // must not wait on GPS + network, which can take several seconds.
    (async () => {
      const prefs = await readPrefs();
      await writePrefs({ ...prefs, approved: true });
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') return;

        const position = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced, // city-level is enough — no need for precise/GPS-grade accuracy
        });

        const { data, error } = await supabase.functions.invoke('reverse-geocode', {
          body: { lat: position.coords.latitude, lon: position.coords.longitude },
        });
        if (error) throw error;

        const city: string | null = data?.city ?? null;
        if (userId && city) await updateUserLocation(userId, city);
      } catch (err) {
        console.warn('[useLocationPrompt] Location fetch failed:', err);
      }
    })();
  }, [userId]);

  const handleNotNow = useCallback(() => {
    setVisible(false);
    (async () => {
      const prefs = await readPrefs();
      const notNowCount = (prefs.notNowCount ?? 0) + 1;
      await writePrefs({ ...prefs, notNowCount, quizzesSincePrompt: 0 });
    })().catch(() => {});
  }, []);

  return { visible, approved, maybeShow, showManually, handleApprove, handleNotNow };
}
