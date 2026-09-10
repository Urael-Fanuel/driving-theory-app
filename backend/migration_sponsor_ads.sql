-- ============================================================
-- backend/migration_sponsor_ads.sql
-- Adds: sponsor_ads — a lightweight, DB-driven sponsor-listing table so
-- new advertisers (starting with driving instructors) can be added/edited/
-- removed without an app-store release. Also adds raw coordinates to
-- `users` (GPS-based, opt-in — see hooks/useLocationPrompt.ts) and to
-- `sponsor_ads` itself, so matching can fall back to "nearest sponsor
-- within N km" when there is no sponsor in the user's exact city (e.g. a
-- small town/kibbutz whose residents drive to a nearby city for lessons).
--
-- Deliberately NOT the full advertising platform from
-- planning/platform-architecture.md section 3.4 (advertisers/campaigns/
-- creatives/placements/campaign_targeting/ad_impressions) — that is
-- scoped for when there is an actual audience to sell to and a need for
-- per-campaign reporting. This is the minimum real thing: one row per
-- sponsor, one location, on/off.
--
-- Run this ONCE in Supabase Dashboard → SQL Editor → Run.
-- Safe to re-run: every statement is idempotent.
-- ============================================================

CREATE TABLE IF NOT EXISTS sponsor_ads (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id           UUID NOT NULL REFERENCES apps(id)
                     DEFAULT '678d1968-f21e-4d02-aa96-463eb4dddd6b'::uuid,
  category         TEXT NOT NULL DEFAULT 'driving_instructor',
                     -- future: 'insurance' | 'garage' | 'ethnic_business' | ...
  name             TEXT NOT NULL,                -- instructor/business name
  tagline_amharic  TEXT NOT NULL,                 -- short marketing text, Amharic — Engine B reads this
  audio_url        TEXT,                          -- recorded Amharic ad narration — Engine A needs this to show the ad at all
  phone            TEXT NOT NULL,
  avatar_url       TEXT,
  city             TEXT NOT NULL,                 -- display/exact-match name (same reverse-geocoded city names as users.city)
  lat              DOUBLE PRECISION,               -- sponsor's city coordinates, for nearest-match fallback
  lon              DOUBLE PRECISION,
  is_active        BOOLEAN NOT NULL DEFAULT true,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sponsor_ads_city_active
  ON sponsor_ads(city, category) WHERE is_active = true;

ALTER TABLE sponsor_ads ENABLE ROW LEVEL SECURITY;

-- Public read of ACTIVE rows only — the app's anon key needs this to show
-- ads. Writes are service-role only (Claude runs a script to add/edit a
-- sponsor), matching how signs/topics/questions content is managed.
DO $$ BEGIN
  CREATE POLICY "public_read_active_sponsor_ads" ON sponsor_ads
    FOR SELECT USING (is_active = true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ────────────────────────────────────────────────────────────
-- Raw coordinates on the user's own row. hooks/useLocationPrompt.ts
-- already fetches these from the device GPS and resolves them to a city
-- name via the reverse-geocode Edge Function — today it discards the
-- coordinates themselves after that. Storing them too (opt-in, same
-- consent flow, no new prompt) is what lets "nearest sponsor" work.
-- ────────────────────────────────────────────────────────────
ALTER TABLE users ADD COLUMN IF NOT EXISTS lat DOUBLE PRECISION;
ALTER TABLE users ADD COLUMN IF NOT EXISTS lon DOUBLE PRECISION;

-- Also carries the IP-based coarse fallback (see planning/platform-
-- architecture.md section 3.1) for a user who has not yet been asked for
-- GPS — never for a user who explicitly declined, per that same principle
-- (a purpose-specific "no" must not be worked around a different way).
ALTER TABLE users ADD COLUMN IF NOT EXISTS ip_city TEXT;

-- ============================================================
-- END OF MIGRATION
-- ============================================================
