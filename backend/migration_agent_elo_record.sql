-- ============================================================
-- backend/migration_agent_elo_record.sql
-- Second, small migration for the learning agent. Adds the one column
-- missed in migration_agent_platform.sql (user_ability.attempts, needed
-- to compute confidence) and the RPC that atomically records an ELO
-- update after an answer.
--
-- Run this ONCE in Supabase Dashboard → SQL Editor → Run, same as the
-- first migration. Idempotent — safe to re-run.
-- ============================================================

ALTER TABLE user_ability ADD COLUMN IF NOT EXISTS attempts INTEGER NOT NULL DEFAULT 0;

-- ────────────────────────────────────────────────────────────
-- record_agent_answer
--
-- The ELO MATH itself (expected score, K-factor, new rating) lives in
-- ONE place only: supabase/functions/_shared/elo.ts (plain TypeScript,
-- imported by both Edge Functions AND the offline simulation script —
-- so the number shown in a "the agent is improving" graph is computed
-- by the exact same code as production, never a second reimplementation
-- that could quietly drift from it).
--
-- This function's job is narrower: given numbers the Edge Function
-- already computed, store them atomically and bump the attempt
-- counters. It still independently checks auth.uid() = p_user_id,
-- exactly like upsert_user_progress — RLS on question_difficulty and
-- user_ability denies the anon key directly, but this function is
-- SECURITY DEFINER, so it must re-check identity itself rather than
-- relying on RLS to have already done it.
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION record_agent_answer(
  p_user_id        UUID,
  p_question_id    TEXT,
  p_topic_id       TEXT,
  p_is_correct     BOOLEAN,
  p_new_difficulty DOUBLE PRECISION,
  p_new_ability    DOUBLE PRECISION,
  p_app_id         UUID DEFAULT '678d1968-f21e-4d02-aa96-463eb4dddd6b'::uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR auth.uid() <> p_user_id THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  INSERT INTO question_difficulty (question_id, app_id, difficulty, attempts, correct, updated_at)
  VALUES (
    p_question_id, p_app_id, p_new_difficulty,
    1, CASE WHEN p_is_correct THEN 1 ELSE 0 END, NOW()
  )
  ON CONFLICT (question_id) DO UPDATE SET
    difficulty = p_new_difficulty,
    attempts   = question_difficulty.attempts + 1,
    correct    = question_difficulty.correct + CASE WHEN p_is_correct THEN 1 ELSE 0 END,
    updated_at = NOW();

  -- Always the topic-specific row (p_topic_id is never NULL here) — the
  -- overall (topic_id IS NULL) row/index is reserved for a future
  -- aggregation step and is not written by this function.
  INSERT INTO user_ability (app_id, user_id, topic_id, ability, attempts, confidence, updated_at)
  VALUES (p_app_id, p_user_id, p_topic_id, p_new_ability, 1, LEAST(1.0, 1.0 / 20), NOW())
  ON CONFLICT (user_id, topic_id) WHERE topic_id IS NOT NULL DO UPDATE SET
    ability    = p_new_ability,
    attempts   = user_ability.attempts + 1,
    confidence = LEAST(1.0, (user_ability.attempts + 1) / 20.0),
    updated_at = NOW();
END;
$$;

-- ============================================================
-- END OF MIGRATION
-- ============================================================
