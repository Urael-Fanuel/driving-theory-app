/**
 * services/identityRecovery.ts
 * Finishes what services/identity.ts had to leave open at launch, so the app
 * ends up on the user's real server account instead of a local stand-in.
 *
 * Why (CODEX QA 2026-10-08, Q09): when the anonymous sign-in did not finish
 * before its deadline, or there was no connection at the first start, the app
 * went on with an id made on the phone. The server only accepts answers under
 * the signed-in user's own id, so everything answered under that local id could
 * never be saved, and a sign-in that finished a moment later was ignored.
 *
 * What it does, in this order, until it has a server account to hand over:
 *   1. A sign-in still running from launch: wait for it. Its account wins, and
 *      no second sign-in is ever started alongside it (that would create two
 *      accounts, and the session would end up on the other one).
 *   2. A session that came back by itself (auth-js keeps refreshing in the
 *      background): adopt it. Also listened for through onAuthStateChange.
 *   3. Only for an id made on this phone (it never had an account): sign in
 *      anonymously once. A saved account is never replaced this way: signing
 *      in would create a second, empty account and orphan its progress.
 * Tried at once, again when the connection comes back, and on a slow backoff.
 *
 * Kept free of React and of the real Supabase client: everything it needs is
 * passed in, so it can be tested on its own.
 */

export interface RecoveryAuth {
  getSession: () => Promise<any>;
  signInAnonymously: () => Promise<any>;
  onAuthStateChange: (cb: (event: string, session: any) => void) => any;
}

export interface RecoveryOptions {
  /** The id the app is using now (the saved one, or one made on this phone). */
  currentId: string;
  /** true = currentId was made on this phone and never had a server account. */
  localOnly: boolean;
  /** A sign-in still running from launch (ResolvedIdentity.lateSignIn). */
  lateSignIn?: Promise<string | null>;
  /** Called once, with the server account the app should use from now on. */
  onAdopt: (serverId: string) => void;
}

export interface RecoveryDeps {
  auth: RecoveryAuth;
  /** Subscribe to connectivity changes; returns the unsubscribe. */
  onConnectivityChange: (fn: (connected: boolean) => void) => () => void;
  setTimer?: (fn: () => void, ms: number) => any;
  clearTimer?: (t: any) => void;
}

/** Retries while nothing else triggers one (a reconnect starts the list again). */
const RETRY_DELAYS_MS = [30_000, 120_000, 600_000];

const idOf = (r: any): string | null => (!r?.error && r?.data?.user?.id) ? String(r.data.user.id) : null;

/** Starts recovery; returns a stop function (also called by itself once done). */
export function startIdentityRecovery(opts: RecoveryOptions, deps: RecoveryDeps): () => void {
  const setTimer   = deps.setTimer   ?? ((fn: () => void, ms: number) => setTimeout(fn, ms));
  const clearTimer = deps.clearTimer ?? ((t: any) => clearTimeout(t));

  let finished = false;
  let busy     = false;
  let retryAt  = 0;
  let timer: any = null;
  let signInInFlight: Promise<string | null> | null = opts.lateSignIn ?? null;
  let authSub: any = null;
  let unsubNet: (() => void) | null = null;

  const stop = () => {
    if (finished) return;
    finished = true;
    if (timer) { clearTimer(timer); timer = null; }
    try { authSub?.data?.subscription?.unsubscribe?.(); } catch {}
    try { unsubNet?.(); } catch {}
  };

  const adopt = (serverId: string) => {
    if (finished) return;
    stop();
    opts.onAdopt(serverId);
  };

  const scheduleRetry = () => {
    if (finished || retryAt >= RETRY_DELAYS_MS.length) return;
    if (timer) clearTimer(timer);
    timer = setTimer(() => { timer = null; void attempt(); }, RETRY_DELAYS_MS[retryAt++]);
  };

  const attempt = async (): Promise<void> => {
    if (finished || busy) return;
    busy = true;
    try {
      // 1. A sign-in already on its way: wait for it, never start another.
      if (signInInFlight) {
        const id = await signInInFlight;
        signInInFlight = null;
        if (id) { adopt(id); return; }
      }
      if (finished) return;

      // 2. A session that is there now.
      const got = await deps.auth.getSession();
      const sessionId = got?.data?.session?.user?.id;
      if (sessionId) { adopt(String(sessionId)); return; }
      if (finished) return;

      // 3. Only an id that never had an account may get one now.
      if (opts.localOnly) {
        signInInFlight = deps.auth.signInAnonymously().then(idOf, () => null);
        const id = await signInInFlight;
        signInInFlight = null;
        if (id) { adopt(id); return; }
      }
    } catch {
      // Network trouble: the next trigger tries again.
    } finally {
      busy = false;
    }
    scheduleRetry();
  };

  authSub = deps.auth.onAuthStateChange((_event: string, session: any) => {
    const id = session?.user?.id;
    // Deferred: calling back into auth or the database from inside this
    // callback can deadlock auth-js.
    if (id) setTimer(() => adopt(String(id)), 0);
  });
  unsubNet = deps.onConnectivityChange(connected => {
    if (connected) { retryAt = 0; void attempt(); }
  });

  void attempt();   // at once: settles a late sign-in the moment it ends
  return stop;
}
