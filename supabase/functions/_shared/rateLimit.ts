// supabase/functions/_shared/rateLimit.ts
//
// Per-caller throttling for the paid-API edge functions (tts, stt,
// rag-explain). signInAnonymously() lets anyone mint a fresh signed-in
// session with no signup step, so without this a script could open
// sessions and hammer these endpoints, running up the Google/Gemini bill
// with no ceiling. A real learner tapping play/record/explain buttons
// never comes close to these limits.
//
// Enforcement lives in Postgres (check_rate_limit RPC, see
// backend/migration_rate_limiting.sql) so the count is atomic across
// concurrent requests and survives Edge Function cold starts — an
// in-memory counter here would reset every time the function spins up
// a new instance and wouldn't be shared across instances anyway.

/**
 * Reads the `sub` claim out of a JWT WITHOUT verifying its signature.
 * Safe here specifically because Supabase's platform-level verify_jwt has
 * already checked the signature before this function ever runs — this is
 * only extracting a claim from an already-trusted token, not doing auth
 * itself. (Same helper as supabase/functions/agent-record-answer/index.ts.)
 */
export function subFromJwt(authHeader: string | null): string | null {
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.slice('Bearer '.length);
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    let b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    while (b64.length % 4) b64 += '=';
    const payload = JSON.parse(atob(b64));
    return typeof payload.sub === 'string' ? payload.sub : null;
  } catch {
    return null;
  }
}

export interface RateLimitOptions {
  supabaseUrl: string;
  anonKey: string;
  /** The caller's own "Bearer ..." header, forwarded as-is so auth.uid() resolves to them. */
  authHeader: string;
  userId: string;
  endpoint: string;
  maxRequests: number;
  windowSeconds: number;
}

/**
 * Returns true if the request should be allowed, false if the caller has
 * hit the limit and should be throttled.
 *
 * Fails OPEN on any infrastructure problem (RPC unreachable, bad response,
 * etc.) — this guard is defense-in-depth against abuse, not the only
 * thing standing between the app and working. A rate-limit outage must
 * never be able to take real learners down.
 */
export async function checkRateLimit(opts: RateLimitOptions): Promise<boolean> {
  try {
    const res = await fetch(`${opts.supabaseUrl}/rest/v1/rpc/check_rate_limit`, {
      method: 'POST',
      headers: {
        apikey: opts.anonKey,
        Authorization: opts.authHeader,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        p_user_id: opts.userId,
        p_endpoint: opts.endpoint,
        p_max_requests: opts.maxRequests,
        p_window_seconds: opts.windowSeconds,
      }),
    });
    if (!res.ok) {
      console.error('[rateLimit] check_rate_limit call failed:', await res.text().catch(() => ''));
      return true;
    }
    return (await res.json()) === true;
  } catch (err) {
    console.error('[rateLimit] error:', err);
    return true;
  }
}
