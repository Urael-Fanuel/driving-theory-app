/**
 * services/identity.ts
 * Decides WHO the user is at launch (the anonymous Supabase account), without
 * ever waiting for the network indefinitely and without creating a new account
 * just because the network was bad.
 *
 * Two bugs this replaces (found 2026-10-05):
 *
 *  1. No deadline. getSession() can sit in the token-refresh retry loop for
 *     tens of seconds when the connection is poor, and signInAnonymously() had
 *     no limit at all. The first screen waited for both, so a poor connection
 *     meant a long blank start.
 *
 *  2. A new account after a failed refresh. When the saved session had expired
 *     and the refresh failed ONLY because the server could not be reached,
 *     getSession() returned no session, and the old code treated that as
 *     "nobody is signed in" and signed in anonymously again: a brand-new
 *     user_id, orphaning the user's whole progress. (The same failure turned 26
 *     testers into 800+ rows once, see the header of EngineContext.) Not being
 *     able to reach the server is not evidence that the account is gone.
 *
 * Rule: a new anonymous account is created only when there is NOTHING saved to
 * resume (first launch, or data was cleared) — never because of slowness or a
 * network failure while a saved identity exists. In that case the saved id is
 * kept (fromSupabase:false) and the session recovers by itself when the
 * connection returns (auth-js keeps refreshing in the background).
 */

import { supabase } from '../backend/supabaseClient';

export interface ResolvedIdentity {
  id:           string;
  /** true = a live auth session backs this id; false = saved/local id only. */
  fromSupabase: boolean;
  /** Why a saved id was kept instead of confirming the session (diagnostics). */
  note?: 'auth_timeout' | 'auth_unreachable';
  /** true = a NEW anonymous account was created (for a returning user this means the old one was lost). */
  createdNew?: boolean;
  /**
   * Set when the anonymous sign-in was still running at the deadline. It keeps
   * running; this resolves with the account it created (or null if it failed).
   * Its result used to be ignored: the app went on with a local id while auth
   * held a different, real account (CODEX QA 2026-10-08, Q09). See
   * services/identityRecovery.ts, which adopts it.
   */
  lateSignIn?: Promise<string | null>;
}

interface AuthLike {
  getSession: () => Promise<any>;
  signInAnonymously: () => Promise<any>;
}

const SESSION_WAIT_MS = 5_000;    // returning users: the first screen never waits longer
// First launch: the first screen waits this long for the anonymous sign-in. It
// was 15 s; a sign-in that finishes later is no longer lost (it comes back as
// lateSignIn and services/identityRecovery.ts adopts it), so the learner does
// not have to wait for it (CODEX QA 2026-10-08, Q10).
const SIGN_IN_WAIT_MS = 4_000;

/** RFC 4122 v4 UUID — used when there is no Supabase account to use. */
export function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

/** Returns true if s looks like a valid UUID */
export function isUUID(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}

const TIMED_OUT = Symbol('timed out');

function raceTimeout<T>(p: Promise<T>, ms: number): Promise<T | typeof TIMED_OUT> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => resolve(TIMED_OUT), ms);
    // p keeps running if the timeout wins; its later result is simply ignored
    // (and its rejection is handled here, so it never becomes "unhandled").
    p.then(
      v => { clearTimeout(timer); resolve(v); },
      e => { clearTimeout(timer); reject(e); },
    );
  });
}

/** True when an auth error only says "could not reach the server". */
export function looksLikeNetworkFailure(error: any): boolean {
  if (!error) return false;
  if (error.name === 'AuthRetryableFetchError') return true;
  if (error.status === 0 || error.status === 502 || error.status === 503 || error.status === 504) return true;
  return /network|fetch|timed out|timeout|abort|offline|unreachable/i.test(String(error.message ?? ''));
}

export async function resolveUserId(
  storedId?: string,
  auth: AuthLike | null = (supabase && process.env.EXPO_PUBLIC_SUPABASE_URL ? (supabase.auth as unknown as AuthLike) : null),
  waits: { session: number; signIn: number } = { session: SESSION_WAIT_MS, signIn: SIGN_IN_WAIT_MS },
): Promise<ResolvedIdentity> {
  const stored = storedId && isUUID(storedId) ? storedId : null;
  let lateSignIn: Promise<string | null> | undefined;

  if (auth) {
    try {
      const got: any = await raceTimeout(auth.getSession(), waits.session);

      if (got === TIMED_OUT) {
        // Slow is not gone. Keep the identity the user already has.
        if (stored) return { id: stored, fromSupabase: false, note: 'auth_timeout' };
      } else {
        const id = got?.data?.session?.user?.id;
        if (id) return { id, fromSupabase: true };
        if (stored && looksLikeNetworkFailure(got?.error)) {
          return { id: stored, fromSupabase: false, note: 'auth_unreachable' };
        }
      }

      // Nothing saved to resume (or the server clearly said the session is gone):
      // create the anonymous account.
      const signIn = auth.signInAnonymously();
      const created: any = await raceTimeout(signIn, waits.signIn);
      if (created !== TIMED_OUT && !created?.error && created?.data?.user?.id) {
        return { id: created.data.user.id, fromSupabase: true, createdNew: true };
      }
      if (created === TIMED_OUT) {
        // Still running: hand its eventual result to the caller instead of
        // dropping it.
        lateSignIn = signIn.then(
          (r: any) => (!r?.error && r?.data?.user?.id) ? String(r.data.user.id) : null,
          () => null,
        );
      }
      if (stored) return { id: stored, fromSupabase: false, note: created === TIMED_OUT ? 'auth_timeout' : 'auth_unreachable', lateSignIn };
    } catch {
      if (stored) return { id: stored, fromSupabase: false, note: 'auth_unreachable', lateSignIn };
    }
  }

  // No account available: use the saved id if there is one, otherwise a local one.
  if (stored) return { id: stored, fromSupabase: false, lateSignIn };
  return { id: generateUUID(), fromSupabase: false, lateSignIn };
}
