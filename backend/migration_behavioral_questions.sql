-- ============================================================
-- backend/migration_behavioral_questions.sql
--
-- Fixes two separate problems, both discovered by testing against the
-- live database:
--
-- 1. REGRESSION (introduced by migration_agent_platform.sql):
--    That migration added an `app_id` column to `questions`. The
--    get_random_questions() function is declared `RETURNS SETOF questions`
--    but selected an explicit, now-outdated column list, so it started
--    failing with "Final statement returns too few columns" (42P13).
--    api.ts silently falls back to an unbalanced direct query, so exams
--    still work — but they lost their proportional per-topic balance.
--    Rewritten below to `SELECT q.*`, which cannot break again the next
--    time a column is added.
--
-- 2. PRE-EXISTING BUG (not caused by any recent work):
--    Behavioral questions (vehicle_knowledge, mind_safety, society_law,
--    the_road) live only in content/*_scaffold.json and have never had
--    rows in `questions`. Because user_progress.question_id and
--    question_difficulty.question_id are both foreign keys to
--    `questions`, EVERY behavioral answer failed to save with a 23503
--    FK violation — and api.ts's saveAnswer retries 3 times with backoff,
--    so each behavioral answer burned ~3 seconds on a user's device before
--    giving up. It also meant the learning agent could never track them.
--
--    Fixed by registering the behavioral questions as real rows. They keep
--    sign_id = NULL (they genuinely have no sign — the app already uses
--    `!question.sign_id` as its "is this behavioral?" test), which requires
--    dropping that column's NOT NULL constraint.
--
-- ⚠️ DELIBERATE DESIGN DECISION — the DB rows are a REGISTRY, not the
--    content source. The app still renders behavioral questions from the
--    bundled JSON, which is what makes them work offline. These rows exist
--    so foreign keys resolve for progress + agent tracking. Do not switch
--    the app to read behavioral content from the DB without first solving
--    offline availability, or the offline work will regress.
--
-- Run ONCE in Supabase Dashboard → SQL Editor → Run. Idempotent.
-- The 111 question rows themselves are inserted separately by
-- scripts/registerBehavioralQuestions.ts (run it AFTER this migration).
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. Allow sign_id to be NULL (behavioral questions have no sign)
-- ────────────────────────────────────────────────────────────
ALTER TABLE questions ALTER COLUMN sign_id DROP NOT NULL;

-- ────────────────────────────────────────────────────────────
-- 2. Repair get_random_questions
--
--    Two changes:
--    a) `SELECT q.*` instead of a hardcoded column list, so adding a
--       column to `questions` can never again break the return type.
--    b) `WHERE sign_id IS NOT NULL` everywhere, so the newly-registered
--       behavioral rows do NOT enter the exam pool. The app already adds
--       a fixed number of behavioral questions itself from local JSON
--       (loadBehavioralExamQuestions in backend/api.ts); without this
--       filter every exam would get behavioral questions twice.
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_random_questions(question_count INTEGER DEFAULT 30)
RETURNS SETOF questions
LANGUAGE sql
STABLE
AS $$
  WITH sign_questions AS (
    SELECT * FROM questions WHERE sign_id IS NOT NULL
  ),
  topic_counts AS (
    SELECT topic_id, COUNT(*) AS total
    FROM sign_questions
    GROUP BY topic_id
  ),
  proportional AS (
    SELECT
      sq.id,
      ROW_NUMBER() OVER (
        PARTITION BY sq.topic_id
        ORDER BY random()
      ) AS rn,
      CEIL(
        question_count::float *
        (tc.total::float / (SELECT COUNT(*) FROM sign_questions))
      )::int AS allocated
    FROM sign_questions sq
    JOIN topic_counts tc ON tc.topic_id = sq.topic_id
  )
  SELECT q.*
  FROM questions q
  WHERE q.id IN (SELECT id FROM proportional WHERE rn <= allocated)
  ORDER BY random()
  LIMIT question_count;
$$;

-- ============================================================
-- END OF MIGRATION
-- ============================================================
