-- ============================================================
-- backend/migration_sponsor_ads_international.sql
--
-- Extends the EXISTING sponsor system (sponsor_ads + sponsor_ad_events) for:
--   * any country (the app is international, Vienna Convention countries)
--   * a WhatsApp number and the language of the ready-made WhatsApp message
--   * a monthly price and currency per sponsor, and a subscription end date
--   * featured (premium) placement
--   * a 'whatsapp' event type (a press on the WhatsApp button)
--   * monthly report and income-by-currency views for the owner (service role only)
--
-- SECURITY (this is the fix for the idea taken from Gemini's design):
--   The app signs users in ANONYMOUSLY, and an anonymous user has the role "authenticated".
--   So a policy like "TO authenticated USING (true)" would give EVERY app user full access.
--   Here nothing is granted to authenticated/anon except reading the columns the app already
--   needs to show an ad. Price, currency, subscription date and the WhatsApp number of inactive
--   rows are NOT readable with the app's key. Writing and reporting are service-role only
--   (a Vercel server function, never the browser).
--
-- Additive and safe to re-run. The live app reads exactly these columns:
--   id, name, tagline_amharic, audio_url, phone, avatar_url, city, lat, lon  (+ category, is_active in the filter)
-- Run ONCE in Supabase SQL Editor. One transaction.
-- ============================================================

BEGIN;

ALTER TABLE public.sponsor_ads ADD COLUMN IF NOT EXISTS country_code  CHAR(2)       NOT NULL DEFAULT 'IL';
ALTER TABLE public.sponsor_ads ADD COLUMN IF NOT EXISTS whatsapp_number TEXT;                      -- digits only, international format, no plus
ALTER TABLE public.sponsor_ads ADD COLUMN IF NOT EXISTS contact_lang  TEXT          NOT NULL DEFAULT 'he';  -- language of the ready-made WhatsApp message to the sponsor
ALTER TABLE public.sponsor_ads ADD COLUMN IF NOT EXISTS tagline_local TEXT;                         -- optional line in the sponsor's local language
ALTER TABLE public.sponsor_ads ADD COLUMN IF NOT EXISTS is_featured   BOOLEAN       NOT NULL DEFAULT false;
ALTER TABLE public.sponsor_ads ADD COLUMN IF NOT EXISTS monthly_price NUMERIC(10,2) NOT NULL DEFAULT 0;  -- 0 = free trial
ALTER TABLE public.sponsor_ads ADD COLUMN IF NOT EXISTS currency_code CHAR(3)       NOT NULL DEFAULT 'ILS';
ALTER TABLE public.sponsor_ads ADD COLUMN IF NOT EXISTS expires_at    TIMESTAMPTZ;                  -- NULL = no end date

DO $$ BEGIN
  ALTER TABLE public.sponsor_ads ADD CONSTRAINT sponsor_ads_country_code_check CHECK (country_code ~ '^[A-Z]{2}$');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.sponsor_ads ADD CONSTRAINT sponsor_ads_currency_code_check CHECK (currency_code ~ '^[A-Z]{3}$');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.sponsor_ads ADD CONSTRAINT sponsor_ads_whatsapp_check CHECK (whatsapp_number IS NULL OR whatsapp_number ~ '^[0-9]{8,15}$');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.sponsor_ads ADD CONSTRAINT sponsor_ads_contact_lang_check CHECK (contact_lang ~ '^[a-z]{2}$');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_sponsor_ads_country_city ON public.sponsor_ads (country_code, city) WHERE is_active = true;

-- An ad whose subscription ended stops showing by itself (no app update, no manual step).
DROP POLICY IF EXISTS "public_read_active_sponsor_ads" ON public.sponsor_ads;
CREATE POLICY "public_read_active_sponsor_ads" ON public.sponsor_ads
  FOR SELECT USING (is_active = true AND (expires_at IS NULL OR expires_at > now()));

-- Column-level read for the app's keys: only what is shown to a learner.
REVOKE ALL ON public.sponsor_ads FROM anon, authenticated;
GRANT SELECT (id, category, name, tagline_amharic, audio_url, phone, avatar_url, city, lat, lon,
              is_active, country_code, whatsapp_number, contact_lang, tagline_local, is_featured, expires_at)
  ON public.sponsor_ads TO anon, authenticated;
GRANT ALL ON public.sponsor_ads TO service_role;

-- 'whatsapp' = a press on the sponsor's WhatsApp button (written by the app from version 13).
DO $$ DECLARE c text; BEGIN
  SELECT conname INTO c FROM pg_constraint
   WHERE conrelid = 'public.sponsor_ad_events'::regclass AND contype = 'c' AND pg_get_constraintdef(oid) LIKE '%''view''%';
  IF c IS NOT NULL THEN EXECUTE format('ALTER TABLE public.sponsor_ad_events DROP CONSTRAINT %I', c); END IF;
  ALTER TABLE public.sponsor_ad_events ADD CONSTRAINT sponsor_ad_events_event_check
    CHECK (event IN ('view', 'click', 'call', 'whatsapp'));
END $$;

-- Monthly numbers per sponsor, for the report the owner sends to a sponsor (service role only).
CREATE OR REPLACE VIEW public.sponsor_ad_monthly_stats AS
SELECT
  a.id AS ad_id, a.name AS sponsor_name, a.country_code, a.city AS sponsor_city,
  date_trunc('month', e.created_at AT TIME ZONE 'UTC')::date AS month,
  count(*) FILTER (WHERE e.event = 'view')                    AS views,
  count(*) FILTER (WHERE e.event = 'click')                   AS clicks,
  count(*) FILTER (WHERE e.event = 'call')                    AS calls,
  count(*) FILTER (WHERE e.event = 'whatsapp')                AS whatsapps,
  count(*) FILTER (WHERE e.event IN ('call', 'whatsapp'))     AS leads,
  count(DISTINCT e.user_id) FILTER (WHERE e.event = 'view')   AS unique_viewers
FROM public.sponsor_ads a
JOIN public.sponsor_ad_events e ON e.ad_id = a.id
GROUP BY a.id, a.name, a.country_code, a.city, date_trunc('month', e.created_at AT TIME ZONE 'UTC')::date;

-- Monthly recurring income by country and currency (active, not expired).
CREATE OR REPLACE VIEW public.sponsor_mrr_by_currency AS
SELECT country_code, currency_code, count(*) AS active_sponsors, sum(monthly_price) AS monthly_income
FROM public.sponsor_ads
WHERE is_active = true AND (expires_at IS NULL OR expires_at > now())
GROUP BY country_code, currency_code
ORDER BY monthly_income DESC;

REVOKE ALL ON public.sponsor_ad_monthly_stats, public.sponsor_mrr_by_currency FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.sponsor_ad_monthly_stats, public.sponsor_mrr_by_currency TO service_role;

COMMIT;
