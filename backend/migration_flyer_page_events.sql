-- ============================================================
-- backend/migration_flyer_page_events.sql
--
-- Counts what happens on the public flyer landing page (docs/start.html, opened from the QR code on printed flyers):
--   'visit'       page opened (once per browser session)
--   'play_click'  the blue "download and install" button was pressed
--   'share_click' the green share button was pressed
-- per place tag (src, e.g. yerushalayim_ethiopia_st). Counts only: no user id, no IP, no city, no device data.
-- The page uses the app's public anon key; it can ONLY add rows (checked below), never read, change or delete.
-- Reading is done by the owner with scripts/flyerStats.mjs (service role).
--
-- Additive and safe to re-run (new table only). One transaction.
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.flyer_page_events (
  id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  src        TEXT NOT NULL CHECK (src ~ '^[A-Za-z0-9_-]{1,40}$'),
  event      TEXT NOT NULL CHECK (event IN ('visit', 'play_click', 'share_click'))
);

CREATE INDEX IF NOT EXISTS idx_flyer_page_events_src_time ON public.flyer_page_events (src, created_at);

ALTER TABLE public.flyer_page_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anyone can add a flyer page event" ON public.flyer_page_events;
CREATE POLICY "anyone can add a flyer page event"
  ON public.flyer_page_events FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- Only the INSERT privilege is given; no select/update/delete for the public keys.
REVOKE ALL ON public.flyer_page_events FROM anon, authenticated;
GRANT INSERT ON public.flyer_page_events TO anon, authenticated;

COMMIT;
