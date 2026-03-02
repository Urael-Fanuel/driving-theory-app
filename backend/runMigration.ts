/**
 * runMigration.ts
 * Prints the SQL migration that must be run in the Supabase dashboard.
 *
 * Adds a defensive "ensure user exists" step inside upsert_sign_view
 * and upsert_user_progress — fixing error 23503 (FK violation on sign_views).
 *
 * Run: npx tsx backend/runMigration.ts
 * Then paste the output into: Supabase Dashboard → SQL Editor → Run
 */

const SQL = `
-- ─────────────────────────────────────────────────────────────────
-- Migration: Fix FK violation 23503 in upsert_sign_view and
--            upsert_user_progress by ensuring user row exists first.
-- ─────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION upsert_user_progress(
  p_user_id     UUID,
  p_question_id TEXT,
  p_is_correct  BOOLEAN
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
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


CREATE OR REPLACE FUNCTION upsert_sign_view(
  p_user_id         UUID,
  p_sign_id         TEXT,
  p_video_completed BOOLEAN DEFAULT false
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Ensure user row exists (defensive: in case client-side upsertUser failed)
  INSERT INTO users (id) VALUES (p_user_id) ON CONFLICT (id) DO NOTHING;

  INSERT INTO sign_views (user_id, sign_id, view_count, video_completed, last_viewed)
  VALUES (p_user_id, p_sign_id, 1, p_video_completed, NOW())
  ON CONFLICT (user_id, sign_id) DO UPDATE SET
    view_count       = sign_views.view_count + 1,
    video_completed  = sign_views.video_completed OR p_video_completed,
    last_viewed      = NOW();
END;
$$;
`;

console.log('='.repeat(60));
console.log('MIGRATION SQL — paste this into Supabase SQL Editor and Run:');
console.log('='.repeat(60));
console.log(SQL);
console.log('='.repeat(60));
console.log('Steps:');
console.log('  1. Open https://supabase.com/dashboard');
console.log('  2. Select your project');
console.log('  3. Go to SQL Editor → New query');
console.log('  4. Paste the SQL above → click Run');
console.log('='.repeat(60));
