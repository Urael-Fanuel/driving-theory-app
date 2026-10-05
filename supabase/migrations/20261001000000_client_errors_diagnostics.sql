-- ============================================================
-- client_errors: richer diagnostics (2026-10-01)
--
-- client_errors started as a log of one thing only (API calls that failed
-- while online, see backend/migration_client_errors.sql). It now also takes
-- audio, download, TTS/STT, recording and JS-crash reports from
-- services/errorReporter.ts, so it needs to say WHAT kind of failure each row
-- is and on WHICH phone / app build it happened:
--
--   category     what failed (audio, audio_stuck, download, tts, api, js_fatal …)
--   details      context as JSON (cached file vs streamed, file size, network
--                type, app state, …) — never personal data or audio content
--   app_version  "1.0.0 (9)" = version name + build number
--   platform     "android 14 (API 34)"
--   device       manufacturer + model, e.g. "samsung SM-A125F"
--
-- Additive only: every new column is nullable, so app builds that still
-- insert just function_name + error_message keep working unchanged.
--
-- The size guard matters because this table accepts inserts from the public
-- app key (any app user may report): it caps what a single row can hold.
-- Every existing row is far below these limits.
-- ============================================================

ALTER TABLE client_errors ADD COLUMN IF NOT EXISTS category    TEXT;
ALTER TABLE client_errors ADD COLUMN IF NOT EXISTS details     JSONB;
ALTER TABLE client_errors ADD COLUMN IF NOT EXISTS app_version TEXT;
ALTER TABLE client_errors ADD COLUMN IF NOT EXISTS platform    TEXT;
ALTER TABLE client_errors ADD COLUMN IF NOT EXISTS device      TEXT;

DO $$ BEGIN
  ALTER TABLE client_errors ADD CONSTRAINT client_errors_size_guard CHECK (
        char_length(function_name)                 <= 200
    AND coalesce(char_length(error_message), 0)    <= 2000
    AND coalesce(char_length(category), 0)         <= 50
    AND coalesce(char_length(app_version), 0)      <= 200
    AND coalesce(char_length(platform), 0)         <= 200
    AND coalesce(char_length(device), 0)           <= 200
    AND coalesce(octet_length(details::text), 0)   <= 8000
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_client_errors_created_at ON client_errors (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_client_errors_category   ON client_errors (category, created_at DESC);
