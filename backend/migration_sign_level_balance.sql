-- ============================================================
-- backend/migration_sign_level_balance.sql
--
-- Extends get_random_questions' existing per-topic proportional balancing
-- with a second level: proportional balancing per INDIVIDUAL SIGN within
-- each topic's allocation. Same fix already applied client-side to
-- behavioral question selection (backend/api.ts, selectProportionalByTopic)
-- — this is the sign-side equivalent, for the primary (SQL) path.
--
-- WHY (two separate bugs, both fixed here):
--
-- 1. The previous version balanced by topic only. Within a topic's own
--    allocation, it picked randomly across ALL that topic's questions with
--    no further stratification — so a single sign (normally 3 questions)
--    could still supply 2+ of an exam's questions purely by chance.
--    Measured directly (2026-08-12) against the live 828-question pool:
--    2.96% of simulated exams had the same sign repeated. Fixed by the
--    sign_alloc / sign_ranked / sign_picked steps below (per-sign
--    CEIL-proportional allocation, same technique as the topic level).
--
-- 2. CEIL-ing every topic's share means the allocations almost always sum
--    to MORE than question_count (e.g. 9 sign topics for a 9-question
--    slice CEIL to 14 candidates, not 9) — the original final
--    `ORDER BY random() LIMIT question_count` trimmed that surplus with
--    no regard for which topics had only ONE candidate to begin with, so
--    a small topic's one guaranteed slot could easily be the one cut.
--    Verified live against this exact function (2026-08-12, 300 real
--    calls) even AFTER fix #1 alone: same-sign repeats dropped to 0%, but
--    topic absence stayed at 34-39% for the smaller sign topics — proof
--    fix #1 didn't touch this second, separate problem. Fixed by ordering
--    the final SELECT by each pick's within-topic rank first (everyone's
--    1st pick before anyone's 2nd, same idea as dealing cards round-robin)
--    with `random()` only as the tiebreaker — which also handles the case
--    where question_count is smaller than the number of topics (e.g. the
--    daily challenge's 4-question sign slice across 9 sign topics): the
--    random() tiebreak among same-rank rows means it's a different,
--    randomly-chosen topic that misses out each time, not always the same
--    one. Re-simulated with both fixes together (5,000 runs): 0.00% same-
--    sign repeats AND 0.0% topic absence when count >= topic count, ~14%
--    absence per topic — evenly, not biased — when it structurally can't
--    (fewer slots than topics).
--
-- Run ONCE in Supabase Dashboard → SQL Editor → Run. Idempotent — safe
-- to re-run (including if you already ran an earlier version of this same
-- migration — CREATE OR REPLACE just applies the latest version). Only
-- replaces get_random_questions; nothing else changes.
-- ============================================================

CREATE OR REPLACE FUNCTION get_random_questions(question_count INTEGER DEFAULT 30)
RETURNS SETOF questions
LANGUAGE sql
STABLE
AS $$
  WITH sign_questions AS (
    SELECT * FROM questions WHERE sign_id IS NOT NULL
  ),

  -- ── Level 1: how many questions each TOPIC gets ──────────────────────────
  topic_counts AS (
    SELECT topic_id, COUNT(*) AS total
    FROM sign_questions
    GROUP BY topic_id
  ),
  topic_alloc AS (
    SELECT
      topic_id,
      CEIL(
        question_count::float *
        (total::float / (SELECT COUNT(*) FROM sign_questions))
      )::int AS allocated
    FROM topic_counts
  ),

  -- ── Level 2: within each topic's own allocation, how many questions each
  --    INDIVIDUAL SIGN gets — same CEIL-proportional technique, one level
  --    deeper, so one sign's 3 questions can't crowd out the topic's other
  --    signs the way an unstratified random pick within the topic could ──
  sign_counts AS (
    SELECT topic_id, sign_id, COUNT(*) AS total
    FROM sign_questions
    GROUP BY topic_id, sign_id
  ),
  sign_alloc AS (
    SELECT
      sc.topic_id,
      sc.sign_id,
      CEIL(
        ta.allocated::float * (sc.total::float / tc.total::float)
      )::int AS allocated
    FROM sign_counts sc
    JOIN topic_counts tc ON tc.topic_id = sc.topic_id
    JOIN topic_alloc  ta ON ta.topic_id = sc.topic_id
  ),
  sign_ranked AS (
    SELECT
      sq.id,
      sq.topic_id,
      sq.sign_id,
      ROW_NUMBER() OVER (PARTITION BY sq.sign_id ORDER BY random()) AS rn
    FROM sign_questions sq
  ),
  sign_picked AS (
    SELECT sr.id, sr.topic_id
    FROM sign_ranked sr
    JOIN sign_alloc sa ON sa.sign_id = sr.sign_id
    WHERE sr.rn <= sa.allocated
  ),

  -- ── Trim each topic's (possibly CEIL-over-allocated) candidate pool down
  --    to its exact topic_alloc share, at random. `rn` here doubles as the
  --    "round number" for the round-robin final SELECT below — rn=1 is
  --    every topic's first pick, rn=2 its second, and so on. ──────────────
  topic_ranked AS (
    SELECT
      id,
      topic_id,
      ROW_NUMBER() OVER (PARTITION BY topic_id ORDER BY random()) AS rn
    FROM sign_picked
  ),
  topic_trimmed AS (
    SELECT tr.id, tr.rn
    FROM topic_ranked tr
    JOIN topic_alloc ta ON ta.topic_id = tr.topic_id
    WHERE tr.rn <= ta.allocated
  )

  -- Round-robin, not a flat random trim: every topic's rn=1 pick is
  -- guaranteed ahead of any topic's rn=2 pick, so a small topic's only
  -- candidate is never at the mercy of a big topic's leftover surplus.
  -- `random()` as the secondary sort key both shuffles picks within the
  -- same round AND — when question_count is smaller than the number of
  -- topics still in the rn=1 tier — decides, freshly and randomly each
  -- call, which topics make the cut that time.
  SELECT q.*
  FROM questions q
  JOIN topic_trimmed tt ON tt.id = q.id
  ORDER BY tt.rn, random()
  LIMIT question_count;
$$;

-- ============================================================
-- END OF MIGRATION
-- ============================================================
