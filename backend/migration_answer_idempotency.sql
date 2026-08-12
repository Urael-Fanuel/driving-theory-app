-- ============================================================
-- backend/migration_answer_idempotency.sql
--
-- Fixes audit finding #2: an answer can get counted twice.
--
-- Why it happens: saveAnswer() retries up to 3 times on any error (network
-- hiccup, timeout), and separately, a queued answer stays in
-- pending_answers.json until the app confirms the write locally — if the
-- server actually saved it but the app never got to record that
-- confirmation (e.g. it crashed or lost connection right after), the same
-- answer gets replayed on next launch. Either way, upsert_user_progress()
-- runs a second time for an answer that was already recorded, inflating
-- attempt_count/correct_count.
--
-- Fix: the app now sends a submission_id (a random ID generated once per
-- answer, the same one already used to track the local queue entry) with
-- every save. This migration adds a table to remember which submission_ids
-- have already been applied, and teaches upsert_user_progress() to skip
-- the increment (but still report success) when it sees a submission_id
-- it has already processed.
--
-- Backward compatible: p_submission_id defaults to NULL, so any client
-- that doesn't send one yet behaves exactly as before this migration —
-- nothing existing breaks while an old app build is still in the field.
--
-- Run ONCE in Supabase Dashboard → SQL Editor → Run. Idempotent — safe
-- to re-run.
-- ============================================================

CREATE TABLE IF NOT EXISTS answer_submissions (
  submission_id TEXT PRIMARY KEY,
  user_id       UUID NOT NULL,
  question_id   TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION upsert_user_progress(
  p_user_id        UUID,
  p_question_id    TEXT,
  p_is_correct     BOOLEAN,
  p_submission_id  TEXT DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_already_applied TEXT;
BEGIN
  -- Security: SECURITY DEFINER bypasses RLS, so the caller identity must be
  -- verified here — otherwise anyone with the anon key can write as any user.
  IF auth.uid() IS NULL OR auth.uid() <> p_user_id THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  -- Idempotency: if this exact submission was already recorded, do nothing
  -- and return success — the caller (a retry or a replayed queue entry)
  -- gets the same "it's saved" outcome without a second increment.
  IF p_submission_id IS NOT NULL THEN
    SELECT submission_id INTO v_already_applied
    FROM answer_submissions WHERE submission_id = p_submission_id;

    IF v_already_applied IS NOT NULL THEN
      RETURN;
    END IF;

    INSERT INTO answer_submissions (submission_id, user_id, question_id)
    VALUES (p_submission_id, p_user_id, p_question_id);
  END IF;

  -- Ensure user row exists (defensive: in case client-side upsertUser failed)
  INSERT INTO users (id) VALUES (p_user_id) ON CONFLICT (id) DO NOTHING;

  INSERT INTO user_progress (user_id, question_id, correct_count, attempt_count, last_attempted)
  VALUES (
    p_user_id,
    p_question_id,
    CASE WHEN p_is_correct THEN 1 ELSE 0 END,
    1,
    NOW()
  )
  ON CONFLICT (user_id, question_id) DO UPDATE SET
    correct_count  = user_progress.correct_count + CASE WHEN p_is_correct THEN 1 ELSE 0 END,
    attempt_count  = user_progress.attempt_count + 1,
    last_attempted = NOW();
END;
$$;

-- ============================================================
-- END OF MIGRATION
-- ============================================================
