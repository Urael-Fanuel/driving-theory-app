-- ============================================================
-- backend/migration_agent_platform.sql
-- Adds: multi-tenancy (apps + app_id), analytics event collection,
-- and the learning-agent's own tables (ELO difficulty/ability,
-- decision log, offline-evaluation metrics, A/B experiments).
--
-- Scope, matching planning/platform-architecture.md section 7:
--   IN this migration : apps, app_id everywhere, analytics_*, agent_*
--   NOT in this migration: advertising tables, consent/deletion tables —
--     those are additive later and were deliberately deferred.
--
-- Run this ONCE in Supabase Dashboard → SQL Editor → Run.
-- After it succeeds, Claude can read/write everything below via the
-- REST API using the service-role key — no further manual SQL needed
-- for this feature.
--
-- Safe to re-run: every statement is idempotent (IF NOT EXISTS / DO
-- blocks / ON CONFLICT), so re-running after a partial failure will
-- not error out or duplicate data.
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- SECTION 1 — MULTI-TENANCY (apps + app_id)
--
-- This is the one piece that is expensive to add later: once the
-- Arabic copy of the app exists and both write to the same
-- database, every table needs to already know which app a row
-- belongs to. Adding app_id to a table with live rows today is one
-- ALTER TABLE with a constant DEFAULT (cheap); doing it after two
-- apps are mixed together in the same rows would require figuring
-- out after the fact which app each historical row belongs to.
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS apps (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code          TEXT UNIQUE NOT NULL,        -- e.g. 'am-driving-theory'
  display_name  TEXT NOT NULL,
  language      TEXT NOT NULL,               -- ISO 639-1-ish, e.g. 'am', 'ar'
  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed the current (Amharic) app with a FIXED id — every DEFAULT clause
-- below points at this exact literal, so it must stay in sync if this
-- migration is ever edited.
INSERT INTO apps (id, code, display_name, language)
VALUES (
  '678d1968-f21e-4d02-aa96-463eb4dddd6b',
  'am-driving-theory',
  'Ethiopian Driving Theory (Amharic)',
  'am'
)
ON CONFLICT (code) DO NOTHING;

-- Tag every existing table with app_id. NOT NULL + a constant DEFAULT
-- backfills every existing row in one pass (Postgres 11+ does this
-- without rewriting the table) and requires no app-code changes today —
-- the app doesn't send app_id yet, and doesn't need to until a second
-- app actually exists.
ALTER TABLE users         ADD COLUMN IF NOT EXISTS app_id UUID NOT NULL
  DEFAULT '678d1968-f21e-4d02-aa96-463eb4dddd6b'::uuid REFERENCES apps(id);
ALTER TABLE topics         ADD COLUMN IF NOT EXISTS app_id UUID NOT NULL
  DEFAULT '678d1968-f21e-4d02-aa96-463eb4dddd6b'::uuid REFERENCES apps(id);
ALTER TABLE signs          ADD COLUMN IF NOT EXISTS app_id UUID NOT NULL
  DEFAULT '678d1968-f21e-4d02-aa96-463eb4dddd6b'::uuid REFERENCES apps(id);
ALTER TABLE questions      ADD COLUMN IF NOT EXISTS app_id UUID NOT NULL
  DEFAULT '678d1968-f21e-4d02-aa96-463eb4dddd6b'::uuid REFERENCES apps(id);
ALTER TABLE exam_sessions  ADD COLUMN IF NOT EXISTS app_id UUID NOT NULL
  DEFAULT '678d1968-f21e-4d02-aa96-463eb4dddd6b'::uuid REFERENCES apps(id);
ALTER TABLE user_progress  ADD COLUMN IF NOT EXISTS app_id UUID NOT NULL
  DEFAULT '678d1968-f21e-4d02-aa96-463eb4dddd6b'::uuid REFERENCES apps(id);
ALTER TABLE sign_views     ADD COLUMN IF NOT EXISTS app_id UUID NOT NULL
  DEFAULT '678d1968-f21e-4d02-aa96-463eb4dddd6b'::uuid REFERENCES apps(id);

-- Index only where it will matter soon (users grow fastest; content tables
-- are a few hundred rows and a sequential scan of them is instant).
CREATE INDEX IF NOT EXISTS idx_users_app_id         ON users(app_id);
CREATE INDEX IF NOT EXISTS idx_exam_sessions_app_id ON exam_sessions(app_id);

-- Context columns for the advertising/analytics dashboard's audience
-- questions (who are they, not what did they do — that part is in
-- analytics_events below). country/region/city are resolved from IP
-- address server-side — NOT GPS, no location permission needed, and a
-- lighter Data Safety category than precise location.
ALTER TABLE users ADD COLUMN IF NOT EXISTS country     TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS region      TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS city        TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS platform    TEXT;  -- 'ios' | 'android'
ALTER TABLE users ADD COLUMN IF NOT EXISTS os_version  TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS app_version TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS locale      TEXT;

ALTER TABLE apps ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "public_read_apps" ON apps FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ────────────────────────────────────────────────────────────
-- SECTION 2 — ANALYTICS (event sourcing)
--
-- One events table, not one column per metric. Every dashboard number
-- (DAU, session length, screen popularity, retention) is a QUERY over
-- this table, not a schema change. `name` is deliberately free TEXT, not
-- a CHECK-constrained enum — new event types must never require a
-- migration. Suggested names so far: screen_view, topic_open, sign_view,
-- question_answered, exam_started, exam_finished.
--
-- Collection is consent-gated at the CLIENT: these RPCs simply accept
-- whatever the app sends. The app must not call them until the user has
-- consented to analytics (see planning/platform-architecture.md §2.3) —
-- that gate does not exist in the app yet and is intentionally out of
-- scope for this migration.
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS analytics_sessions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id            UUID NOT NULL REFERENCES apps(id),
  user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  engine_type       TEXT CHECK (engine_type IN ('A', 'B')),
  started_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at          TIMESTAMPTZ,
  duration_seconds  INTEGER,
  app_version       TEXT,
  country           TEXT
);

CREATE TABLE IF NOT EXISTS analytics_events (
  id            BIGSERIAL PRIMARY KEY,
  app_id        UUID NOT NULL REFERENCES apps(id),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_id    UUID REFERENCES analytics_sessions(id) ON DELETE SET NULL,
  name          TEXT NOT NULL,
  screen        TEXT,
  properties    JSONB NOT NULL DEFAULT '{}'::jsonb,
  occurred_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_analytics_events_app_time ON analytics_events(app_id, occurred_at);
CREATE INDEX IF NOT EXISTS idx_analytics_events_user     ON analytics_events(user_id);
CREATE INDEX IF NOT EXISTS idx_analytics_events_name     ON analytics_events(name);
CREATE INDEX IF NOT EXISTS idx_analytics_sessions_user   ON analytics_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_analytics_sessions_app    ON analytics_sessions(app_id, started_at);

ALTER TABLE analytics_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE analytics_events   ENABLE ROW LEVEL SECURITY;
-- Deliberately NO policies here: every write goes through the
-- SECURITY DEFINER functions below (single audited path, matches
-- upsert_user_progress's existing pattern), and reads are for the
-- dashboard's service-role key only, never the anon key.

CREATE OR REPLACE FUNCTION start_analytics_session(
  p_user_id     UUID,
  p_engine_type TEXT,
  p_app_version TEXT DEFAULT NULL,
  p_country     TEXT DEFAULT NULL,
  p_app_id      UUID DEFAULT '678d1968-f21e-4d02-aa96-463eb4dddd6b'::uuid
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session_id UUID;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() <> p_user_id THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  INSERT INTO analytics_sessions (app_id, user_id, engine_type, app_version, country)
  VALUES (p_app_id, p_user_id, p_engine_type, p_app_version, p_country)
  RETURNING id INTO v_session_id;

  RETURN v_session_id;
END;
$$;

CREATE OR REPLACE FUNCTION end_analytics_session(
  p_session_id UUID,
  p_user_id    UUID
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

  UPDATE analytics_sessions
  SET ended_at         = NOW(),
      duration_seconds = EXTRACT(EPOCH FROM (NOW() - started_at))::INTEGER
  WHERE id = p_session_id AND user_id = p_user_id AND ended_at IS NULL;
END;
$$;

CREATE OR REPLACE FUNCTION log_analytics_event(
  p_user_id    UUID,
  p_name       TEXT,
  p_session_id UUID DEFAULT NULL,
  p_screen     TEXT DEFAULT NULL,
  p_properties JSONB DEFAULT '{}'::jsonb,
  p_app_id     UUID DEFAULT '678d1968-f21e-4d02-aa96-463eb4dddd6b'::uuid
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

  INSERT INTO analytics_events (app_id, user_id, session_id, name, screen, properties)
  VALUES (p_app_id, p_user_id, p_session_id, p_name, p_screen, p_properties);
END;
$$;

-- ────────────────────────────────────────────────────────────
-- SECTION 3 — LEARNING AGENT
--
-- ELO-style rating, exactly like chess: every question has a difficulty
-- rating, every user has an ability rating, every answer moves both.
-- Chosen over a neural model deliberately — it produces a sane answer
-- from the very first attempt (no cold-start problem), and its output
-- is one number that is trivial to defend in a project review.
--
-- All tables here are written by server-side code (an Edge Function,
-- or an offline evaluation script) using the service-role key, which
-- bypasses RLS — so RLS is enabled with NO policies, meaning the anon
-- key (the mobile app) cannot read or write any of this directly.
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS question_difficulty (
  question_id  TEXT PRIMARY KEY REFERENCES questions(id) ON DELETE CASCADE,
  app_id       UUID NOT NULL REFERENCES apps(id),
  difficulty   DOUBLE PRECISION NOT NULL DEFAULT 1200,  -- Elo-style rating; 1200 = starting default for every question
  attempts     INTEGER NOT NULL DEFAULT 0,
  correct      INTEGER NOT NULL DEFAULT 0,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_ability (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id      UUID NOT NULL REFERENCES apps(id),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  topic_id    TEXT REFERENCES topics(id) ON DELETE CASCADE,  -- NULL = overall ability across all topics
  ability     DOUBLE PRECISION NOT NULL DEFAULT 1200,
  confidence  DOUBLE PRECISION NOT NULL DEFAULT 0,           -- 0 = no answers observed yet
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Two partial unique indexes instead of one UNIQUE(user_id, topic_id):
-- Postgres treats every NULL as distinct for uniqueness, so a plain
-- UNIQUE constraint would silently allow duplicate "overall" (topic_id
-- IS NULL) rows per user. These enforce exactly one overall row and one
-- row per (user, topic) instead.
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_ability_per_topic
  ON user_ability(user_id, topic_id) WHERE topic_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_ability_overall
  ON user_ability(user_id) WHERE topic_id IS NULL;

CREATE TABLE IF NOT EXISTS agent_decisions (
  id                    BIGSERIAL PRIMARY KEY,
  app_id                UUID NOT NULL REFERENCES apps(id),
  user_id               UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_id            UUID REFERENCES analytics_sessions(id) ON DELETE SET NULL,
  policy_version        TEXT NOT NULL,
  selected_question_ids TEXT[] NOT NULL,
  rationale             JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS agent_metrics (
  id             BIGSERIAL PRIMARY KEY,
  app_id         UUID NOT NULL REFERENCES apps(id),
  policy_version TEXT NOT NULL,
  evaluated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sample_size    INTEGER NOT NULL,
  log_loss       DOUBLE PRECISION,
  auc            DOUBLE PRECISION,
  accuracy       DOUBLE PRECISION,
  -- true = computed by replaying/simulating data to prove the algorithm
  -- works before enough real traffic exists; false = computed from real
  -- production logs. The agent dashboard must show these as clearly
  -- separate series, never blended into one line.
  is_simulated   BOOLEAN NOT NULL DEFAULT false,
  notes          TEXT
);

CREATE TABLE IF NOT EXISTS agent_experiments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id      UUID NOT NULL REFERENCES apps(id),
  name        TEXT NOT NULL,
  variant_a   TEXT NOT NULL,
  variant_b   TEXT NOT NULL,
  metric      TEXT NOT NULL,
  started_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at    TIMESTAMPTZ,
  result      JSONB
);

CREATE INDEX IF NOT EXISTS idx_question_difficulty_app ON question_difficulty(app_id);
CREATE INDEX IF NOT EXISTS idx_user_ability_user        ON user_ability(user_id);
CREATE INDEX IF NOT EXISTS idx_agent_decisions_user     ON agent_decisions(user_id);
CREATE INDEX IF NOT EXISTS idx_agent_metrics_policy     ON agent_metrics(app_id, policy_version, evaluated_at);

ALTER TABLE question_difficulty ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_ability        ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_decisions     ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_metrics       ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_experiments   ENABLE ROW LEVEL SECURITY;
-- No policies on any of the five: service-role only, by design.

-- ============================================================
-- END OF MIGRATION
-- ============================================================
