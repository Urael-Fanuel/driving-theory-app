-- ============================================================
-- AGENT 2 — schema.sql
-- Ethiopian Driving Theory App — Supabase Database Schema
-- ============================================================
-- Run this in your Supabase SQL Editor (Dashboard → SQL Editor)
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- EXTENSIONS
-- ────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ────────────────────────────────────────────────────────────
-- TABLES
-- ────────────────────────────────────────────────────────────

-- Topics (6 categories of traffic knowledge)
CREATE TABLE IF NOT EXISTS topics (
  id               TEXT        PRIMARY KEY,          -- e.g. "regulatory"
  name_amharic     TEXT        NOT NULL,             -- "አስገዳጅ ምልክቶች"
  name_hebrew      TEXT,                             -- "תמרורי חובה" (internal reference only)
  icon             TEXT,                             -- emoji "🔴"
  color            TEXT,                             -- hex "#C62828"
  description_amharic TEXT,                          -- shown as topic intro text
  audio_intro_url  TEXT,                             -- Supabase Storage URL for topic intro MP3
  sign_count       INTEGER     DEFAULT 0,
  display_order    INTEGER     DEFAULT 0
);

-- Signs (Traffic signs / road rules)
CREATE TABLE IF NOT EXISTS signs (
  id                        TEXT    PRIMARY KEY,     -- e.g. "SIGN_STOP"
  topic_id                  TEXT    NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
  display_order             INTEGER DEFAULT 0,
  name_amharic              TEXT    NOT NULL,        -- "ቁም"
  name_hebrew               TEXT,                   -- "עצור" (internal only)
  explanation_amharic       TEXT    NOT NULL,        -- full Amharic explanation
  image_url                 TEXT,                   -- Supabase Storage URL (sign PNG)
  video_url                 TEXT,                   -- Supabase Storage URL (MP4)
  audio_name_url            TEXT,                   -- Supabase Storage URL (name MP3)
  audio_explanation_url     TEXT,                   -- Supabase Storage URL (explanation MP3)
  difficulty                INTEGER DEFAULT 1       -- 1=easy, 2=medium, 3=hard
);

-- Questions (linked to signs, 3 per sign = 180 total)
CREATE TABLE IF NOT EXISTS questions (
  id                          TEXT    PRIMARY KEY,   -- e.g. "Q_STOP_001"
  sign_id                     TEXT    NOT NULL REFERENCES signs(id) ON DELETE CASCADE,
  topic_id                    TEXT    NOT NULL REFERENCES topics(id),
  question_amharic            TEXT    NOT NULL,
  question_audio_url          TEXT,                  -- Supabase Storage URL
  -- answers stored as JSONB array:
  -- [{ "id":"A", "text_amharic":"...", "image_url":"...", "audio_url":"...", "is_correct":true }]
  answers                     JSONB   NOT NULL,
  explanation_correct_amharic TEXT    NOT NULL,
  explanation_wrong_amharic   TEXT    NOT NULL,
  explanation_correct_audio_url TEXT,
  explanation_wrong_audio_url   TEXT,
  difficulty                  INTEGER DEFAULT 1
);

-- Users
CREATE TABLE IF NOT EXISTS users (
  id             UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  phone          TEXT    UNIQUE,                     -- optional, for account linking
  display_name   TEXT,
  engine_type    TEXT    DEFAULT 'A' CHECK (engine_type IN ('A', 'B')),
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  last_seen      TIMESTAMPTZ DEFAULT NOW()
);

-- Per-question progress tracking
CREATE TABLE IF NOT EXISTS user_progress (
  id              UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID    NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  question_id     TEXT    NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  correct_count   INTEGER DEFAULT 0,
  attempt_count   INTEGER DEFAULT 0,
  last_attempted  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, question_id)
);

-- Sign views (Group A: track video watches)
CREATE TABLE IF NOT EXISTS sign_views (
  id               UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID    NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  sign_id          TEXT    NOT NULL REFERENCES signs(id) ON DELETE CASCADE,
  view_count       INTEGER DEFAULT 1,
  video_completed  BOOLEAN DEFAULT false,
  last_viewed      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, sign_id)
);

-- Exam sessions
CREATE TABLE IF NOT EXISTS exam_sessions (
  id               UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID    NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  engine_type      TEXT    CHECK (engine_type IN ('A', 'B')),
  score            INTEGER NOT NULL,
  total_questions  INTEGER NOT NULL,
  passed           BOOLEAN NOT NULL,
  pass_threshold   INTEGER DEFAULT 24,               -- 24/30 = 80% to pass
  duration_seconds INTEGER,
  -- { "regulatory": { "correct": 8, "total": 10 }, ... }
  topic_breakdown  JSONB,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

-- ────────────────────────────────────────────────────────────
-- INDEXES (performance)
-- ────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_signs_topic_id       ON signs(topic_id);
CREATE INDEX IF NOT EXISTS idx_questions_sign_id    ON questions(sign_id);
CREATE INDEX IF NOT EXISTS idx_questions_topic_id   ON questions(topic_id);
CREATE INDEX IF NOT EXISTS idx_user_progress_user   ON user_progress(user_id);
CREATE INDEX IF NOT EXISTS idx_sign_views_user      ON sign_views(user_id);
CREATE INDEX IF NOT EXISTS idx_exam_sessions_user   ON exam_sessions(user_id);

-- ────────────────────────────────────────────────────────────
-- ROW LEVEL SECURITY (RLS)
-- ────────────────────────────────────────────────────────────
ALTER TABLE topics         ENABLE ROW LEVEL SECURITY;
ALTER TABLE signs          ENABLE ROW LEVEL SECURITY;
ALTER TABLE questions      ENABLE ROW LEVEL SECURITY;
ALTER TABLE users          ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_progress  ENABLE ROW LEVEL SECURITY;
ALTER TABLE sign_views     ENABLE ROW LEVEL SECURITY;
ALTER TABLE exam_sessions  ENABLE ROW LEVEL SECURITY;

-- Public read for content (no auth required to learn)
CREATE POLICY "public_read_topics"    ON topics     FOR SELECT USING (true);
CREATE POLICY "public_read_signs"     ON signs      FOR SELECT USING (true);
CREATE POLICY "public_read_questions" ON questions  FOR SELECT USING (true);

-- Users can only read/write their own data
CREATE POLICY "users_own_row"         ON users          FOR ALL  USING (auth.uid() = id);
CREATE POLICY "own_progress_read"     ON user_progress  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "own_progress_write"    ON user_progress  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own_progress_update"   ON user_progress  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "own_views_read"        ON sign_views     FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "own_views_write"       ON sign_views     FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own_views_update"      ON sign_views     FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "own_exams_read"        ON exam_sessions  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "own_exams_write"       ON exam_sessions  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- ────────────────────────────────────────────────────────────
-- STORAGE BUCKETS
-- (Run separately in Supabase Dashboard → Storage, or via API)
-- ────────────────────────────────────────────────────────────
-- INSERT INTO storage.buckets (id, name, public) VALUES ('images', 'images', true);
-- INSERT INTO storage.buckets (id, name, public) VALUES ('audio',  'audio',  true);
-- INSERT INTO storage.buckets (id, name, public) VALUES ('videos', 'videos', true);

-- ────────────────────────────────────────────────────────────
-- STORED PROCEDURE: get_random_questions
-- Used by exam mode to pull a random 30-question set
-- balanced across topics
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_random_questions(question_count INTEGER DEFAULT 30)
RETURNS SETOF questions
LANGUAGE sql
STABLE
AS $$
  -- Pick questions proportionally from each topic
  -- then shuffle and limit to question_count
  WITH topic_counts AS (
    SELECT topic_id, COUNT(*) as total
    FROM questions
    GROUP BY topic_id
  ),
  proportional AS (
    SELECT
      q.*,
      ROW_NUMBER() OVER (
        PARTITION BY q.topic_id
        ORDER BY random()
      ) as rn,
      CEIL(
        question_count::float *
        (tc.total::float / (SELECT COUNT(*) FROM questions))
      )::int as allocated
    FROM questions q
    JOIN topic_counts tc ON tc.topic_id = q.topic_id
  )
  SELECT id, sign_id, topic_id, question_amharic, question_audio_url,
         answers, explanation_correct_amharic, explanation_wrong_amharic,
         explanation_correct_audio_url, explanation_wrong_audio_url, difficulty
  FROM proportional
  WHERE rn <= allocated
  ORDER BY random()
  LIMIT question_count;
$$;

-- ────────────────────────────────────────────────────────────
-- STORED PROCEDURE: upsert_user_progress
-- Atomically increment correct/attempt counts
-- ────────────────────────────────────────────────────────────
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

-- ────────────────────────────────────────────────────────────
-- STORED PROCEDURE: upsert_sign_view
-- ────────────────────────────────────────────────────────────
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

-- ────────────────────────────────────────────────────────────
-- VIEWS: user_topic_progress
-- Aggregated progress per user per topic (for progress screen)
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW user_topic_progress AS
SELECT
  up.user_id,
  q.topic_id,
  COUNT(DISTINCT q.id)                                          AS total_questions,
  COUNT(DISTINCT CASE WHEN up.attempt_count > 0 THEN q.id END) AS attempted,
  COUNT(DISTINCT CASE WHEN up.correct_count > 0 THEN q.id END) AS mastered,
  ROUND(
    100.0 * COUNT(DISTINCT CASE WHEN up.correct_count > 0 THEN q.id END)
    / NULLIF(COUNT(DISTINCT q.id), 0)
  )                                                             AS mastery_percent
FROM questions q
LEFT JOIN user_progress up ON up.question_id = q.id
GROUP BY up.user_id, q.topic_id;
