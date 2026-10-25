# CODEX: final verification of the recorded-TTS rollout (all 69 subtopics published)

Prepared 2026-10-25 by Claude Code. The owner cannot tell by ear whether a sentence comes from a recording or
from live Google TTS (same voice), so he asks for an independent, evidence-based confirmation that the job is
done: every behavioral sentence has a published recording, and the app plays the recording, not Google.

## Rules
- Review only. Do not upload, edit, build or push. Do not print `.env`.
- Public read-only HTTP requests (GET/HEAD) to the public Storage URLs below are allowed; they need no key.
- Write only `planning/recorded-tts/CODEX_RECORDED_TTS_FINAL_REPORT.md`.

## What was done since your REPORT_3 approval
1. Pilot `tr_l2_s1` published. The first publish attempt uploaded its 75 clips but the index upload was refused
   (`415 invalid_mime_type`: the `audio` bucket accepted only `audio/mpeg`). Nothing was used by the app (fail-safe).
   With the owner's approval, the `audio` bucket's allowed MIME types were changed in the Supabase dashboard
   from `audio/mpeg` to `audio/mpeg, application/json`; public flag and the 5 MB limit unchanged. Re-run: index
   published with 75 entries. Owner tested both engines on the device and reported success.
2. The remaining 68 subtopics were published one run per subtopic, serially (log: every run "failed 0").
   Final index: 5,133 entries.
3. Implementer's own check: index entries 5,133 = unique manifest files 5,133, none missing, none extra;
   HEAD on all 5,133 clips: 200, `audio/mpeg`, > 1 KB.
4. No code changed after REPORT_3 (compare fingerprints in your REPORT_3 with the working tree).

Public base URL: `https://bpltieicivxixpogxfim.supabase.co/storage/v1/object/public/audio/tts/`
Index: `<base>index.json` (`{ updated, files: [...] }`). Clip: `<base><rtts_...mp3>`.

## Please verify
1. **Code unchanged since your approval**: SHA-256 of `services/audioCache.ts`, `utils/googleTTS.ts`,
   `scripts/recordTts.mjs`, `planning/codex-qa-2026-10-06/tests/recorded-tts-test.cjs` vs REPORT_3.
2. **Coverage, computed with the app's own code**: load the real `services/audioCache.ts` (as the tests do) and
   compute `recordedTtsFilename(text)` for every sentence the app can speak for behavioral content (you built this
   set yourself in rounds 1-3). Every one must be in the published index. Report the count and any gap.
3. **Every clip is real audio**: HEAD all listed clips (status, type, size); download a random sample (for example
   100) and confirm they are MP3 data (frame sync / ID3), not error bodies, with plausible size for their text length.
4. **The app takes the recording, not Google**: from the code, confirm that for a listed text with a reachable clip
   `speakAndAwait` and `prefetchTtsForTexts` never call the `tts` Edge Function, and list the only conditions under
   which they still do (not listed, download failure/timeout, bad clip, index unavailable, dynamic texts).
   If you can, run the integrated harness of `recorded-tts-test.cjs` against the REAL published index
   (fetch it once, then feed it to the fake network) for a sample of texts and show zero live calls.
5. **Bucket change**: confirm (from a public request) that `index.json` is served as `application/json` and the
   clips as `audio/mpeg`; say whether allowing `application/json` in the `audio` bucket adds any risk worth noting.
6. **Field evidence plan** (owner + implementer, after your report): the implementer will open the Supabase
   dashboard (Edge Functions -> `tts` -> invocations) before and after the owner uses behavioral lessons in both
   engines, and record the numbers. Tell us if you see a better objective signal we can collect without changing code.

## Deliverable
`CODEX_RECORDED_TTS_FINAL_REPORT.md`: verdict (`COMPLETE` / `INCOMPLETE`), evidence for 1-5 with numbers, any gaps,
and max 8 lines in Hebrew for the owner.
