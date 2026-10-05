-- ============================================================
-- audio_file_sizes(names) — real size of audio files on the server
-- (2026-10-01)
--
-- Used by verifyCacheAgainstServer() in services/audioCache.ts. The app keeps
-- an offline copy of every clip it played. A copy can be broken (a download
-- that died half-way leaves a partial file that still "exists") or outdated
-- (the clip was re-recorded on the server since). Either way it used to stay
-- on the phone forever and play as silence or as old content.
--
-- The phone sends the names of the files it has; this returns
-- { "<name>": <bytes>, ... } for the ones that exist in the public 'audio'
-- bucket. Any cached copy whose size differs is re-downloaded.
--
-- Why a function and not a static list file: it is always exactly what the
-- bucket holds, with nothing to remember to regenerate after uploading audio,
-- and the phone only receives sizes for the files it actually has.
--
-- Exposure: names + sizes of files that are already publicly downloadable,
-- and only the ones asked for (max 3000 per call; a full phone cache is about
-- 2000 files).
-- ============================================================

CREATE OR REPLACE FUNCTION public.audio_file_sizes(names text[])
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT coalesce(jsonb_object_agg(o.name, (o.metadata->>'size')::bigint), '{}'::jsonb)
  FROM storage.objects o
  WHERE o.bucket_id = 'audio'
    AND cardinality(names) <= 3000
    AND o.name = ANY (names);
$$;

REVOKE ALL ON FUNCTION public.audio_file_sizes(text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.audio_file_sizes(text[]) TO anon, authenticated;
