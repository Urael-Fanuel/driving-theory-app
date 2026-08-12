-- ============================================================
-- backend/migration_client_errors.sql
--
-- Fixes the visibility gap in audit finding #3: when a real server error
-- happens (not just "no internet"), the app already recognizes that case
-- separately (see logFallbackToMock in backend/api.ts) and now writes a
-- row here instead of only logging to the device's own on-screen console
-- — which nobody is ever watching in real time. This table is real,
-- queryable documentation of every "SERVER ERROR while online" event,
-- checkable any time with a read-only query (the same way
-- api_rate_limits and answer_submissions were checked earlier).
--
-- Deliberately NOT a general crash-reporting system (that's Sentry —
-- already priority #4 on the roadmap, a separate, bigger piece of work).
-- This only records the one specific failure this fix already detects.
--
-- Run ONCE in Supabase Dashboard → SQL Editor → Run. Idempotent — safe
-- to re-run.
-- ============================================================

CREATE TABLE IF NOT EXISTS client_errors (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  function_name  TEXT NOT NULL,
  error_message  TEXT,
  user_id        UUID,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE client_errors ENABLE ROW LEVEL SECURITY;

-- Any signed-in app user (including anonymous sessions) can report an
-- error, but only about themselves — same identity check pattern used
-- everywhere else in this project (see e.g. own_progress_write in
-- backend/schema.sql, which uses the same no-TO-clause style). No one
-- can read this table with the app's own key; it's meant to be checked
-- directly (service role / SQL Editor), the same way the rate-limit and
-- idempotency tables were checked earlier today.
-- WITH CHECK allows user_id IS NULL (the app doesn't attach one — this
-- table is diagnostic, not per-user data) as well as a caller reporting
-- an error tagged with their own id. It only blocks one specific thing:
-- writing a row that names a DIFFERENT, real user's id.
DROP POLICY IF EXISTS "authenticated users can report their own errors" ON client_errors; -- old name from the first version of this migration
DROP POLICY IF EXISTS "users can report their own errors" ON client_errors;
CREATE POLICY "users can report their own errors"
  ON client_errors FOR INSERT
  WITH CHECK (user_id IS NULL OR auth.uid() = user_id);

-- RLS policies only FILTER rows — they don't substitute for the base table
-- privilege that says a role may run INSERT on this table at all. Every
-- other table this app writes to directly (topics, signs, user_progress,
-- sign_views, exam_sessions) already has this grant from however schema.sql
-- was originally applied; client_errors is a brand new table created fresh
-- through the SQL Editor, which does not automatically inherit it. Without
-- this line every insert fails with "new row violates row-level security
-- policy" — a misleading error, since the actual missing piece is this
-- grant, not the policy above.
GRANT INSERT ON client_errors TO anon, authenticated;

-- ============================================================
-- END OF MIGRATION
-- ============================================================
