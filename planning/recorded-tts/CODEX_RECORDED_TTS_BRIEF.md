# CODEX brief: QA of "recorded TTS" for the behavioral topics (before anything is uploaded)

Prepared 2026-10-24 by Claude Code (the implementer). Branch `upgrade/expo-57`, uncommitted working tree.
The app owner is a non-programmer and decides. **Nothing has been uploaded yet.** Uploading starts only after
you approve, one subtopic at a time.

## 0. Ground rules

- **Review and test only.** Do not edit files, push, build, or run anything with `--upload`. Do not print `.env`.
- The only file you may write: `planning/recorded-tts/CODEX_RECORDED_TTS_REPORT.md`.
- The `--list`, `--subtopic=<id>` (without `--upload`) and `--all` modes of the script make NO network calls and
  write only manifests to `planning/recorded-tts/`; you may run them.

## 1. What this is

Behavioral questions, answers and feedback are spoken today by **live** Google TTS through the Supabase Edge
Function `supabase/functions/tts` (cost per call, and silence if Google/the function fails). The owner wants the
SAME sentences, in the SAME voice, stored as files and played from storage, with live TTS kept as the fallback.

**The owner's key requirement: not one word may change.** The recordings must be of exactly the strings the app
already sends to live TTS. No new text is written anywhere.

## 2. What changed (please review all of it)

| File | Change |
|---|---|
| `services/audioCache.ts` | new section "Recorded TTS": `fetchRecordedTts(text, priority)`, `skipRecordedTts(text)`, private `loadRecordedIndex()`. A recorded clip lives in Storage as `audio/tts/<ttsFilename(text)>` and is downloaded with the existing `downloadAtomic()` straight into that text's existing TTS cache slot (same name the live path uses), then `record()`ed in the same index/budget. `audio/tts/index.json` (`{files:[...]}`) says which texts have a recording; 404 = nothing published (quiet); other failures = live TTS for 10 minutes, reported once. |
| `utils/googleTTS.ts` | `speakAndAwait`: after the cache miss and BEFORE the Edge Function, try `fetchRecordedTts(text,'now')` raced against 8 s; null/slow/failed -> the unchanged live path. If a recorded clip fails to load/play it is reported (`from_recording`) and `skipRecordedTts(text)` makes that text live for the session. `prefetchTtsForTexts`: tries `fetchRecordedTts(text,'background')` before the Edge Function. Ownership/cancel checks kept after every await. |
| `scripts/recordTts.mjs` | NEW. Builds, per subtopic, the exact sentences the app speaks and (only with `--upload`) records + uploads them. Index is uploaded LAST, merged. |
| `planning/codex-qa-2026-10-06/tests/recorded-tts-test.cjs` | NEW logic test (14 scenarios). |
| `tests/tts-ownership-test.cjs`, `tests/interrupt-test.cjs`, `tests/lib/engineA-world.cjs` | their fake `audioCache` gained `fetchRecordedTts: async () => null, skipRecordedTts() {}` only. |

## 3. What to verify

### 3.1 Vocabulary: the sentences are exactly what the app sends (most important)
`node scripts/recordTts.mjs --all` writes `planning/recorded-tts/manifest_all.json` (69 subtopics, 5,157 sentences,
5,133 unique files). Per question the script builds 25 sentences:

- question: `question_amharic`
- Engine A answer: `answers[i].text_amharic`
- Engine B answer: `` `${AMHARIC_NUMBERS[i]}። ${answers[i].text_amharic}` ``
- correct feedback: `` `${praise} ${correctText}` `` for every phrase of every `CORRECT_PRAISES` list (union = 15)
- wrong feedback: `` `ስህተት! ትክክለኛው መልስ: ${correctText}` ``, `correctText` = text of the answer with `is_correct`

Check against the code (every `speakAndAwait`/`speakLongAndAwait`/`speakAmharic` call site, see
`grep -rn "speakAndAwait(" app components`): sources are the bundled scaffolds `content/*_scaffold.json` (same
8 files and order as `BEHAVIORAL_SCAFFOLD_MAP` in `backend/api.ts`, `loadBehavioralExamQuestions`), answers
are never re-ordered at runtime, the praise lists and number prefixes are read by the script from the screens'
own source (it stops if a screen changed its template). Confirm there is no trimming/normalisation anywhere
between these strings and `speakAndAwait`. Report any sentence the app can speak for behavioral content that the
manifest lacks, and any manifest sentence the app never speaks.

Known and intentionally NOT recorded (stay live): the RAG "why?" explanations (generated at runtime), the fixed
phrases `'ብራቮ!'`, `'ጥያቄዎች ለዛሬ'`, and the location-permission sentence. Say if you think any must be added.

### 3.2 Same audio as live
`synthesize()` in the script must send the byte-identical request of `supabase/functions/tts/index.ts`
(plain `input.text`, `am-ET-Standard-A`, FEMALE, MP3, `speakingRate 0.85`, no SSML, no effects profile).

### 3.3 Same file name as the app
`ttsFilename` in the script must equal `ttsFilename` in `services/audioCache.ts` for every string (the app's
version multiplies with a plain `*`, not `Math.imul`; the port must keep that). Test scenario 1 checks all 5,157.

### 3.4 Runtime safety and no regression
- Can a recording ever make the app quieter than today? (no index, 404, slow CDN, HTTP errors, a bad clip,
  airplane mode, rate limit 429 on the shared download line, cache budget eviction)
- Cancel/ownership: a stop or a newer request during `fetchRecordedTts` must not play anything old.
- Offline: after one play (or a prefetch) the sentence must work offline exactly like today.
- Low-storage rule: nothing is downloaded in bulk; only sentences the user actually reaches (or the existing
  exam prefetch) are fetched, inside the same 120 MB budget.
- Both engines (A and B), the exam, daily practice, topic quizzes and the subtopic screens.
- Run `node planning/codex-qa-2026-10-06/tests/run-all.cjs` (expected: 19 of 19) and `npx tsc --noEmit`.

### 3.5 Upload procedure (read only)
With `--upload` the script records only files not yet in the index, uploads each clip, and only then writes the
merged `index.json` (cacheControl 60; clips 31536000 since the name is a content hash). Confirm a crash half-way
leaves the app in a safe state (unlisted clips are simply unused) and that re-running is idempotent.

## 4. Deliverable

`planning/recorded-tts/CODEX_RECORDED_TTS_REPORT.md`:
1. Verdict: `APPROVED`, `APPROVED WITH FIXES` or `NOT APPROVED`.
2. Findings, most severe first, each with file:line, what happens, and what must change.
3. Results of 3.1 (missing / extra sentences, with examples), 3.2, 3.3, the test run and tsc.
4. Max 8 lines in Hebrew for the owner: is it safe to start uploading the first subtopic (`tr_l2_s1`)?

---

## Round 2 (after CODEX_RECORDED_TTS_REPORT.md) — please re-review

Write `planning/recorded-tts/CODEX_RECORDED_TTS_REPORT_2.md`. Same rules (review only, no `--upload`).

| Finding | What changed |
|---|---|
| R1 | `utils/googleTTS.ts` `speakAndAwait` now has three sources: cache, recording, live. Playing is in `_playTtsUri()`; a saved clip (cached rendering OR recording) that will not load, start or play is discarded and the SAME request then says the sentence live, once. Recordings are recognised by name (`isRecordedTtsUri`, `rtts_*`), so a bad recording saved by prefetch is also skipped (`skipRecordedTts` marks the text and deletes the file) and never downloaded again this session. |
| R2 | `scripts/recordTts.mjs` `readIndex()` reads with a direct authenticated GET and returns `[]` ONLY for "missing" (Storage answers 400 + `{"statusCode":"404","error":"not_found"}`, checked on this project); every other status, invalid JSON or a bad `files` list throws. `publish()` fails closed: first read fails -> nothing done; final read fails -> index not written. The new index is the union of the first read, the final read and this run's clips. `--upload --all` is refused (one subtopic at a time). Synthesis has a 30 s timeout and 3 tries. |
| R3 | Recordings have their own cache slot `rtts_<name>` (Storage `audio/tts/rtts_<name>`), live renderings keep `tts_<name>`. They never overwrite each other; `getCachedTtsUri` prefers the live slot; `_fetchLiveTts` plays the live rendering it just fetched. |
| R4 | `services/audioCache.ts` `recordedIndex()`: the loaded index (and "nothing published") is trusted 10 minutes, then refreshed in the background; a failed refresh keeps the previous index; failures back off 10 minutes. The app also treats Storage's 400/`statusCode 404` as "nothing published" (not an error). |
| R5 | `prefetchTtsForTexts` uses the same 8 s `withRecordedDeadline()` as speaking. |
| R6 | The script's guard is now a TypeScript-AST check of EVERY `speakAndAwait` / `speakLongAndAwait` / `speakAmharic` call in `app/` and `components/`, every `ttsText` prop, every feedback setter, `correctText`, `randomPraise`, `handleBehavioralAnswerAudioPress` argument, and the `CORRECT_PRAISES` / `AMHARIC_NUMBERS` literals. Any construction not on its list stops the script. Comments do not count. Limitation: an argument named `text` (the A answer-replay handlers, checked through their callers) is accepted by name; a NEW unrelated call with an argument named `text` would only ever be spoken live, never recorded wrongly. |

Tests: `recorded-tts-test.cjs` now loads the REAL `audioCache.ts` and the REAL `googleTTS.ts` together (fake file system, network, player and one clock) and reproduces each of your cases (22 scenarios), plus the publishing cases with fake storage. Mutation check done by the implementer: removing the live fallback fails 3 scenarios; giving the recording slot priority fails the R3 scenario. Two older scenarios in `tts-ownership-test.cjs` (8, 19) now also expect the one live retry after a silent saved clip. `node planning/codex-qa-2026-10-06/tests/run-all.cjs`: 19 of 19. `npx tsc --noEmit`: clean. Manifests were regenerated (`rtts_` names).

Behaviour kept from before (please confirm): a reading stopped on purpose while it was playing still returns true; a stop before playback returns false; a failure while a newer request owns the audio is not reported and not retried.

---

## Round 3 (after CODEX_RECORDED_TTS_REPORT_2.md) — please re-review

Write `planning/recorded-tts/CODEX_RECORDED_TTS_REPORT_3.md`. Same rules.

| Finding | What changed |
|---|---|
| S1 | `speakAndAwait`: after the final live attempt, a not-heard result switches the speaking state off with `_stopSpeakingIfMine(myGeneration)` (only the owning request can). `_playTtsUri` doc now says the caller must switch it off when it does not try again. Every other terminal exit already did. |
| S2 | A clip whose `playAsync()` rejects is now treated like any clip that will not play: reported, the saved file discarded, and the caller says it live once (no "the file is fine" assumption). `_fetchLiveTts(text, gen, failedUri)` never returns the URI that just failed: if the save kept that name, the fresh response is played from memory (`data:`), while the fresh rendering is what is saved for next time. |
| S3 | The guard compares token sequences (`canonText`, TypeScript scanner, template parts re-scanned): line breaks, indentation and comments outside quotes do not matter, every character inside a string or template literal does (doubled space, new line, other characters). Changing quote style `''` to `""` is also refused (fail closed). The `text` parameter limitation stays as disclosed. `--upload` now requires exactly one subtopic. |

Tests: `recorded-tts-test.cjs` 29 scenarios (new 23-29: final live load / start / playback failure with speaking OFF, bad recording + failing live with one live call only, saved live file that will not start -> fresh rendering heard and saved, undeletable failed file -> fresh audio from memory, whitespace/new-line mutations refused and layout accepted). Implementer mutation check: removing the S1 line fails 4 scenarios; removing the `failedUri` check fails 27 and 28. `run-all.cjs` 19/19, `tsc` clean, manifests regenerated (unchanged content).
