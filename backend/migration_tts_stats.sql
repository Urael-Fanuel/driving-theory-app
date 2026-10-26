-- ============================================================
-- backend/migration_tts_stats.sql
--
-- Anonymous daily COUNTERS for the recorded-voice system, so we can see in real
-- use how often a sentence is read from a recording and how often it falls back
-- to the live Google voice. Today the Supabase logs cannot say which device made
-- a call, so this is the only way to prove the recordings work in the field.
--
-- What is stored (and nothing else): per UTC day, per app version, per platform
-- ('android' / 'ios'), three counters:
--   recorded         a sentence was read from a recorded clip
--   live             a sentence was read with the live Google voice
--   recorded_failed  a recorded clip could not be played (the live voice followed)
-- NO user id, NO device id, NO text, NO time of day, NO location. A row names no
-- person. (A very small group, for example one test version on one day, could still
-- correspond to one known tester; such rows must not be shared outside the team.) The app sends the counts in small batches (in the
-- background, when the app is left, or after about 25 sentences).
--
-- The "live" counter also includes sentences that never have a recording (app
-- messages, new text not recorded yet), so read the numbers as a trend between
-- versions, not as an exact percentage.
--
-- Run ONCE in Supabase Dashboard -> SQL Editor -> Run. Safe to re-run. One
-- transaction: everything or nothing.
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.tts_daily_stats (
  day              DATE   NOT NULL,
  app_version      TEXT   NOT NULL CHECK (char_length(app_version) BETWEEN 1 AND 40),
  platform         TEXT   NOT NULL CHECK (platform IN ('android', 'ios')),
  recorded         BIGINT NOT NULL DEFAULT 0,
  live             BIGINT NOT NULL DEFAULT 0,
  recorded_failed  BIGINT NOT NULL DEFAULT 0,
  PRIMARY KEY (day, app_version, platform)
);

-- Nobody reads or writes the table directly with the app's key; only the function
-- below writes, and only the service role (dashboard) reads.
ALTER TABLE public.tts_daily_stats ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.tts_daily_stats FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.tts_daily_stats TO service_role;

-- Adds a batch of counts to today's row. Runs as the table owner; every name is
-- written in full (empty search_path). Each count is limited per call (at most 200
-- of each kind), so a single call cannot move the numbers by much.
--
-- The function is callable with the app's public key (the app sends these counts
-- WITHOUT the user's identity). Anyone holding that key could call it, so the number
-- of ROWS is bounded too (CODEX round 3, D2): an app version that does not look like
-- the app's own "1.2.3 (45)" form is counted under 'other', and once a day already
-- has 40 version rows for a platform any further new version is also counted under
-- 'other'. New rows of one day and platform are admitted one at a time (a lock held to
-- the end of the call), so this is a hard limit: at most 41 rows per platform per day
-- (CODEX round 4). Inflating the counts stays possible; these are diagnostics, not
-- billing figures.
CREATE OR REPLACE FUNCTION public.bump_tts_stats(
  p_app_version      TEXT,
  p_platform         TEXT,
  p_recorded         INT,
  p_live             INT,
  p_recorded_failed  INT
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_version TEXT;
BEGIN
  IF p_app_version IS NULL OR char_length(p_app_version) NOT BETWEEN 1 AND 40
     OR p_platform IS NULL OR p_platform NOT IN ('android', 'ios')
     OR p_recorded IS NULL OR p_live IS NULL OR p_recorded_failed IS NULL
     OR least(p_recorded, p_live, p_recorded_failed) < 0
     OR greatest(p_recorded, p_live, p_recorded_failed) > 200 THEN
    RAISE EXCEPTION 'bad tts stats';
  END IF;
  IF p_recorded + p_live + p_recorded_failed = 0 THEN RETURN; END IF;

  -- one admission at a time per day and platform, so the 40-row check below cannot be
  -- passed by many simultaneous calls
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'tts_daily_stats:' || ((now() AT TIME ZONE 'UTC')::date)::text || ':' || p_platform, 0));

  v_version := p_app_version;
  IF v_version !~ '^[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3} \([0-9]{1,6}\)$' THEN
    v_version := 'other';
  ELSIF NOT EXISTS (SELECT 1 FROM public.tts_daily_stats t
                     WHERE t.day = (now() AT TIME ZONE 'UTC')::date AND t.app_version = v_version AND t.platform = p_platform)
    AND (SELECT count(*) FROM public.tts_daily_stats t
          WHERE t.day = (now() AT TIME ZONE 'UTC')::date AND t.platform = p_platform) >= 40 THEN
    v_version := 'other';
  END IF;

  INSERT INTO public.tts_daily_stats AS t (day, app_version, platform, recorded, live, recorded_failed)
  VALUES ((now() AT TIME ZONE 'UTC')::date, v_version, p_platform, p_recorded, p_live, p_recorded_failed)
  ON CONFLICT (day, app_version, platform) DO UPDATE
    SET recorded        = t.recorded        + EXCLUDED.recorded,
        live            = t.live            + EXCLUDED.live,
        recorded_failed = t.recorded_failed + EXCLUDED.recorded_failed;
END $$;

REVOKE ALL ON FUNCTION public.bump_tts_stats(TEXT, TEXT, INT, INT, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bump_tts_stats(TEXT, TEXT, INT, INT, INT) TO anon, authenticated;

COMMIT;

-- ============================================================
-- END OF MIGRATION
-- ============================================================
