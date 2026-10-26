-- ============================================================
-- backend/migration_sponsor_ad_events.sql
--
-- Records how often OUR OWN sponsor ads (sponsor_ads: driving instructors)
-- are seen and how often they are tapped, so a sponsor can be shown real
-- numbers: views, clicks, calls, per city.
--
-- NOT for Google AdMob banners: AdMob reports its own numbers.
--
-- What a row holds (and nothing else):
--   ad_id       which sponsor ad
--   event       'view'  = at least half of the ad card on screen for 1 second,
--                         while its screen was in front, the app in the
--                         foreground and no dialog over it (once per time the
--                         card is shown)
--               'click' = any tap on the ad (its text, picture or a 🔊 button)
--               'call'  = the "call now" button was pressed (the most valuable
--                         click; a report counts clicks as click + call). A press,
--                         not proof that a call was made.
--   screen      the app route template it was on (e.g. /(engineA)/(tabs)/home)
--   engine      'A' or 'B'
--   city_source what the user allows right now, sent by the app:
--                 'gps'  said yes to location -> only their GPS city (users.city)
--                 'ip'   never asked yet      -> GPS city if any, else IP city
--                 'none' said no               -> no city at all
--               A "no" is saved on the phone before anything else happens, so
--               after it every event says 'none', even while the server still
--               holds an IP city whose wipe has not gone through.
--   city        copied BY THE SERVER, per city_source above. The app never sends
--               a city (a sent one is overwritten). No coordinates, phone or name.
--   user_id     the anonymous app user id (same id the app already uses),
--               kept to count distinct users. Pseudonymous, not anonymous: an
--               administrator can join it to the users row.
--   created_at  always the server's clock (a sent value is overwritten).
--
-- Retention: rows stay until deleted. Deleting a sponsor_ads row is blocked
-- while it has events (switch the sponsor off with is_active = false instead),
-- so a sponsor's history is never erased by accident.
--
-- Run ONCE in Supabase Dashboard -> SQL Editor -> Run. Safe to re-run. All of
-- it runs as one transaction: either everything is created or nothing is.
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.sponsor_ad_events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ad_id       UUID NOT NULL REFERENCES public.sponsor_ads(id) ON DELETE RESTRICT,
  event       TEXT NOT NULL CHECK (event IN ('view', 'click', 'call')),
  screen      TEXT NOT NULL CHECK (char_length(screen) <= 80),
  engine      TEXT CHECK (engine IN ('A', 'B')),
  city_source TEXT NOT NULL DEFAULT 'none' CHECK (city_source IN ('gps', 'ip', 'none')),
  city        TEXT,
  user_id     UUID NOT NULL DEFAULT auth.uid()
);

CREATE INDEX IF NOT EXISTS idx_sponsor_ad_events_ad_time ON public.sponsor_ad_events (ad_id, created_at);
CREATE INDEX IF NOT EXISTS idx_sponsor_ad_events_user_time ON public.sponsor_ad_events (user_id, created_at);

ALTER TABLE public.sponsor_ad_events ENABLE ROW LEVEL SECURITY;

-- Any signed-in app user (anonymous sessions included) may ADD an event about
-- themselves. Nobody can read, change or delete rows with the app's own key.
DROP POLICY IF EXISTS "users can record their own sponsor ad events" ON public.sponsor_ad_events;
CREATE POLICY "users can record their own sponsor ad events"
  ON public.sponsor_ad_events FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Supabase gives new tables to the app roles by default: take all of that back,
-- then allow inserting ONLY the columns the app sends. id, created_at, city and
-- user_id cannot be supplied at all; they come from their defaults and the trigger.
REVOKE ALL ON public.sponsor_ad_events FROM PUBLIC, anon, authenticated;
GRANT INSERT (ad_id, event, screen, engine, city_source) ON public.sponsor_ad_events TO authenticated;

-- Runs before every insert, as the table owner (it must read users, which the
-- caller cannot). Every name is written in full (empty search_path), so nothing
-- the caller creates can stand in for users or sponsor_ad_events.
CREATE OR REPLACE FUNCTION public.sponsor_ad_events_before_insert() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  -- Only ever about the signed-in caller (the policy checks this too, but only
  -- after this function has already read their row).
  IF auth.uid() IS NULL OR NEW.user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'sponsor ad event for another user';
  END IF;

  NEW.created_at := pg_catalog.now();   -- the server's clock, never the caller's

  -- At most 120 events per user per minute. The lock makes two inserts of the
  -- same user wait for each other, so both cannot pass the count at once.
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('sponsor_ad_events:' || NEW.user_id::text, 0));
  IF (SELECT pg_catalog.count(*) FROM public.sponsor_ad_events e
        WHERE e.user_id = NEW.user_id AND e.created_at > NEW.created_at - INTERVAL '1 minute') >= 120 THEN
    RAISE EXCEPTION 'too many sponsor ad events';
  END IF;

  NEW.city := NULL;
  IF NEW.city_source = 'gps' THEN
    SELECT NULLIF(u.city, '') INTO NEW.city FROM public.users u WHERE u.id = NEW.user_id;
  ELSIF NEW.city_source = 'ip' THEN
    SELECT COALESCE(NULLIF(u.city, ''), NULLIF(u.ip_city, '')) INTO NEW.city
      FROM public.users u WHERE u.id = NEW.user_id;
  END IF;
  RETURN NEW;
END $$;

REVOKE ALL ON FUNCTION public.sponsor_ad_events_before_insert() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_sponsor_ad_events_before_insert ON public.sponsor_ad_events;
CREATE TRIGGER trg_sponsor_ad_events_before_insert
  BEFORE INSERT ON public.sponsor_ad_events
  FOR EACH ROW EXECUTE FUNCTION public.sponsor_ad_events_before_insert();

-- ────────────────────────────────────────────────────────────
-- Numbers per sponsor, per day (UTC), per city: for a report to the sponsor.
-- Read with the service role (Vercel dashboard later); not readable by the app.
-- unique_viewers is distinct users WITHIN one row; adding rows up does not give
-- a total of distinct people.
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW public.sponsor_ad_daily_stats AS
SELECT
  e.ad_id,
  a.name                                            AS sponsor_name,
  (e.created_at AT TIME ZONE 'UTC')::date           AS day,
  COALESCE(e.city, 'unknown')                       AS city,
  e.engine,
  count(*) FILTER (WHERE e.event = 'view')          AS views,
  count(*) FILTER (WHERE e.event IN ('click', 'call')) AS clicks,   -- any tap on the ad, calls included
  count(*) FILTER (WHERE e.event = 'call')          AS calls,
  count(DISTINCT e.user_id) FILTER (WHERE e.event = 'view') AS unique_viewers
FROM public.sponsor_ad_events e
JOIN public.sponsor_ads a ON a.id = e.ad_id
-- Written out in full: sponsor_ads has its own "city" column, so the bare name
-- would be ambiguous here.
GROUP BY e.ad_id, a.name, (e.created_at AT TIME ZONE 'UTC')::date, COALESCE(e.city, 'unknown'), e.engine;

REVOKE ALL ON public.sponsor_ad_daily_stats FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.sponsor_ad_daily_stats TO service_role;

COMMIT;

-- ============================================================
-- END OF MIGRATION
-- ============================================================
