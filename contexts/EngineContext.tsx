/**
 * AGENT 3 — contexts/EngineContext.tsx
 * Global state: engine type (A|B), user identity, and session data.
 *
 * Engine A = Non-reader (video + voice input)
 * Engine B = Amharic reader (text + tap input)
 *
 * UI prefs (engine choice, disclaimer seen, last-known userId) persist to
 * expo-file-system. The Supabase AUTH SESSION itself persists separately,
 * through AsyncStorage wired into createClient() in backend/supabaseClient.ts
 * — that wiring is what makes getSession() below actually find a session on
 * relaunch instead of silently returning null every time. (It was missing
 * for a while: every launch then went straight to signInAnonymously(),
 * minting a brand-new user_id and orphaning that user's whole progress
 * history. See the resolvedId !== prefs.userId warning below — that log
 * firing again in production would mean this has regressed.)
 * Falls back to locally-generated UUID if Supabase is unavailable.
 */

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  ReactNode,
} from 'react';
import * as FileSystem from 'expo-file-system/legacy';
import { supabase } from '../backend/supabaseClient';
import * as api from '../backend/api';
import { flushQueue } from '../utils/answerQueue';

// ─── Types ────────────────────────────────────────────────────────────────────

export type EngineType = 'A' | 'B';

export interface EngineContextValue {
  /** Which engine the user is using: A (non-reader) or B (reader) */
  engineType: EngineType | null;
  /** Set the engine type and persist it */
  setEngineType: (engine: EngineType) => void;
  /** Supabase anonymous user ID (UUID, persisted across sessions) */
  userId: string | null;
  /** True once the engine has been selected (past onboarding) */
  hasSelectedEngine: boolean;
  /** Reset engine selection (for "change mode" feature) */
  reset: () => void;
  /** Whether loading from storage is still in progress */
  isLoading: boolean;
  /** True if user has already accepted the disclaimer */
  hasSeenDisclaimer: boolean;
  /** Mark disclaimer as accepted and persist */
  acceptDisclaimer: () => void;
}

// ─── Storage helpers ──────────────────────────────────────────────────────────

const PREFS_PATH = (FileSystem.documentDirectory ?? '') + 'app_prefs.json';

interface StoredPrefs {
  engineType?: EngineType;
  userId?: string;
  hasSeenDisclaimer?: boolean;
}

async function readPrefs(): Promise<StoredPrefs> {
  try {
    const info = await FileSystem.getInfoAsync(PREFS_PATH);
    if (!info.exists) return {};
    const content = await FileSystem.readAsStringAsync(PREFS_PATH);
    return JSON.parse(content) as StoredPrefs;
  } catch {
    return {};
  }
}

async function writePrefs(prefs: StoredPrefs): Promise<void> {
  try {
    await FileSystem.writeAsStringAsync(PREFS_PATH, JSON.stringify(prefs));
  } catch (err) {
    console.warn('[EngineContext] Failed to write prefs:', err);
  }
}

/** RFC 4122 v4 UUID — used as fallback when Supabase is not available */
function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

/** Returns true if s looks like a valid UUID */
function isUUID(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}

/**
 * Resolve user ID via Supabase anonymous auth (preferred) or local UUID fallback.
 * Anonymous auth gives a real auth.uid() that satisfies RLS policies.
 */
async function resolveUserId(storedId?: string): Promise<{ id: string; fromSupabase: boolean }> {
  if (supabase && process.env.EXPO_PUBLIC_SUPABASE_URL) {
    try {
      // Re-use existing session if available (persists across restarts)
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user?.id) {
        console.log('[EngineContext] Reusing Supabase anonymous session');
        return { id: session.user.id, fromSupabase: true };
      }

      // Sign in anonymously — creates a new session stored by Supabase
      const { data, error } = await supabase.auth.signInAnonymously();
      if (!error && data?.user?.id) {
        if (__DEV__) console.log('[EngineContext] Signed in anonymously:', data.user.id);
        return { id: data.user.id, fromSupabase: true };
      }
      console.warn('[EngineContext] Anonymous sign-in failed:', error?.message);
    } catch (err) {
      console.warn('[EngineContext] Supabase auth error:', err);
    }
  }

  // Fallback: use stored ID if it's a valid UUID, otherwise generate one
  // Note: fromSupabase=false means upsertUser will be skipped (no valid auth session)
  if (storedId && isUUID(storedId)) return { id: storedId, fromSupabase: false };
  const newId = generateUUID();
  console.log('[EngineContext] Using local UUID fallback:', newId);
  return { id: newId, fromSupabase: false };
}

// ─── Context ──────────────────────────────────────────────────────────────────

const EngineContext = createContext<EngineContextValue | null>(null);

// ─── Provider ─────────────────────────────────────────────────────────────────

export function EngineProvider({ children }: { children: ReactNode }) {
  const [engineType,         setEngineTypeState]  = useState<EngineType | null>(null);
  const [userId,             setUserId]           = useState<string | null>(null);
  const [isLoading,          setIsLoading]        = useState(true);
  const [hasSeenDisclaimer,  setHasSeenDisclaimer] = useState(false);

  // ── Load persisted prefs + resolve userId on mount ──────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const prefs = await readPrefs();

        if (prefs.engineType) setEngineTypeState(prefs.engineType);
        if (prefs.hasSeenDisclaimer) setHasSeenDisclaimer(true);

        // Resolve userId via anonymous auth (or fallback UUID)
        const { id: resolvedId, fromSupabase } = await resolveUserId(prefs.userId);
        setUserId(resolvedId);

        // Persist resolved userId (may differ from stored if session resumed)
        if (resolvedId !== prefs.userId) {
          // A returning user (prefs.userId already set) getting a DIFFERENT
          // Supabase-backed id means the persisted auth session was NOT
          // found — i.e. the exact failure mode this file's header comment
          // warns about. Not fatal (the new id still works), but it silently
          // orphans that user's server-side progress, so it must be visible.
          if (prefs.userId && fromSupabase) {
            console.warn(
              '[EngineContext] Supabase session was not resumed — got a new user_id ' +
              `(had ${prefs.userId}, now ${resolvedId}). Progress under the old id is orphaned.`
            );
          }
          await writePrefs({ ...prefs, userId: resolvedId });
        }

        // Ensure user row exists in DB — only when Supabase auth succeeded
        // (avoids RLS violation when using local fallback UUID)
        if (prefs.engineType && fromSupabase) {
          api.upsertUser(resolvedId, prefs.engineType).catch(() => {});
        }

        // Flush any answers that were saved locally but not yet sent to Supabase
        flushQueue().catch(() => {});
      } catch (err) {
        console.warn('[EngineContext] Failed to load prefs:', err);
        setUserId(generateUUID());
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  // ── Set engine + persist + register user in DB ───────────────────────────────
  const setEngineType = useCallback(async (engine: EngineType) => {
    setEngineTypeState(engine);

    // Get current userId from state (captured in closure)
    setUserId(currentId => {
      if (currentId) {
        // Create/update user row in DB so foreign keys resolve
        api.upsertUser(currentId, engine).catch(() => {});
      }
      return currentId;
    });

    try {
      const prefs = await readPrefs();
      await writePrefs({ ...prefs, engineType: engine });
    } catch {
      // Non-critical — engine type still set in memory
    }
  }, []) as (engine: EngineType) => void;

  // ── Reset ────────────────────────────────────────────────────────────────────
  const reset = useCallback(async () => {
    setEngineTypeState(null);
    // On reset, sign out and sign in again to get a fresh anonymous session
    if (supabase && process.env.EXPO_PUBLIC_SUPABASE_URL) {
      try {
        await supabase.auth.signOut();
        const { data } = await supabase.auth.signInAnonymously();
        if (data?.user?.id) {
          setUserId(data.user.id);
          await writePrefs({ userId: data.user.id });
          return;
        }
      } catch {
        // Fall through
      }
    }
    const newId = generateUUID();
    setUserId(newId);
    try {
      await writePrefs({ userId: newId });
    } catch {
      // Non-critical
    }
  }, []) as () => void;

  const acceptDisclaimer = useCallback(() => {
    setHasSeenDisclaimer(true);
    readPrefs().then(prefs => writePrefs({ ...prefs, hasSeenDisclaimer: true })).catch(() => {});
  }, []) as () => void;

  const value: EngineContextValue = {
    engineType,
    setEngineType,
    userId,
    hasSelectedEngine: engineType !== null,
    reset,
    isLoading,
    hasSeenDisclaimer,
    acceptDisclaimer,
  };

  return (
    <EngineContext.Provider value={value}>
      {children}
    </EngineContext.Provider>
  );
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useEngine(): EngineContextValue {
  const ctx = useContext(EngineContext);
  if (!ctx) throw new Error('useEngine must be used inside <EngineProvider>');
  return ctx;
}
