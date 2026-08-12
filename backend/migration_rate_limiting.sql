-- ============================================================
-- backend/migration_rate_limiting.sql
--
-- Fixes audit finding #1: the paid-API edge functions (tts, stt,
-- rag-explain) had no limit on how many times a single caller could hit
-- them per minute. Since signInAnonymously() lets anyone mint a fresh
-- signed-in session with no signup step, a script (not a real learner)
-- could open sessions and hammer these endpoints, running up the
-- Google/Gemini bill with no ceiling.
--
-- This migration only ADDS a new table + function. It does not touch
-- any existing table, column, or RPC — nothing that works today changes.
--
-- Run ONCE in Supabase Dashboard → SQL Editor → Run. Idempotent — safe
-- to re-run.
-- ============================================================

CREATE TABLE IF NOT EXISTS api_rate_limits (
  user_id       UUID NOT NULL,
  endpoint      TEXT NOT NULL,
  window_start  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  request_count INT  NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, endpoint)
);

-- ────────────────────────────────────────────────────────────
-- check_rate_limit
--
-- Atomically bumps the caller's request count for one endpoint and
-- reports whether they're still under the limit. "Atomic" matters here:
-- two requests arriving at the same instant must not both read the same
-- pre-increment count and both get waved through — the single UPSERT
-- below is what Postgres guarantees can't happen.
--
-- The window auto-resets: once window_start is older than
-- p_window_seconds, the next call restarts the count at 1 instead of
-- continuing to add to a stale window.
--
-- SECURITY DEFINER + the auth.uid() check is the same defense-in-depth
-- pattern as record_agent_answer() and upsert_user_progress() elsewhere
-- in this project: RLS alone would deny the anon key, but this function
-- runs as its owner, so it must re-check identity itself.
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION check_rate_limit(
  p_user_id        UUID,
  p_endpoint       TEXT,
  p_max_requests   INT,
  p_window_seconds INT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INT;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() <> p_user_id THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  INSERT INTO api_rate_limits (user_id, endpoint, window_start, request_count)
  VALUES (p_user_id, p_endpoint, NOW(), 1)
  ON CONFLICT (user_id, endpoint) DO UPDATE SET
    request_count = CASE
      WHEN api_rate_limits.window_start < NOW() - (p_window_seconds || ' seconds')::interval
        THEN 1
      ELSE api_rate_limits.request_count + 1
    END,
    window_start = CASE
      WHEN api_rate_limits.window_start < NOW() - (p_window_seconds || ' seconds')::interval
        THEN NOW()
      ELSE api_rate_limits.window_start
    END
  RETURNING request_count INTO v_count;

  RETURN v_count <= p_max_requests;
END;
$$;

GRANT EXECUTE ON FUNCTION check_rate_limit(UUID, TEXT, INT, INT) TO authenticated, anon;

-- ============================================================
-- END OF MIGRATION
-- ============================================================
