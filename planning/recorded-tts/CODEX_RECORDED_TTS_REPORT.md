# Recorded TTS — independent QA

**Verdict: NOT APPROVED.**

Reviewed 2026-10-24 against CODEX_RECORDED_TTS_BRIEF.md. Do not start publishing the first subtopic through this candidate yet. Text coverage, filename compatibility and Google request parameters pass. Playback recovery and index publication have reproducible defects. R1–R3 below should be fixed and re-tested before approval.

## Findings, most severe first

### R1 — P1: an unplayable recording does not fall back to live TTS; prefetch can create a repeating failure

Locations: services/audioCache.ts:1088–1091; utils/googleTTS.ts:297–311, 351–365, 384–394; planning/codex-qa-2026-10-06/tests/recorded-tts-test.cjs:140–145.

A downloaded file can pass byte-count validation yet fail audio decoding. The load-error branch marks a fresh recording bad, deletes it and returns false. It never invokes live TTS for the current request. The same applies to a playback error. This contradicts the stated guarantee that recordings cannot make playback quieter than the live path.

There is a second path: prefetch saves the bad recording into the ordinary TTS cache. Playback then sees fromCache=true and fromRecording=false. It deletes the file on failure without calling skipRecordedTts. The next attempt downloads the same recording again. In an integrated real-source test, prefetch followed by two attempts returned false twice, downloaded twice, and invoked live TTS zero times.

Required change: recover within the same owned request by discarding an unusable saved clip and trying live TTS once. Preserve generation/cancel checks and avoid infinite retry. A bad prefetched/cached recording must also be bypassed rather than downloaded repeatedly. Provenance or a suitable per-text failure policy can provide that guarantee. Handle load failure, playback failure and playAsync failure consistently.

Current scenario 7 explicitly asserts false and only checks the skip call. Despite its title, it does not retry and prove live recovery. Change it to test the intended audible fallback; add the prefetched-file case using both real modules together.

### R2 — P1: a transient final index read can erase previously published entries

Locations: scripts/recordTts.mjs:210–214, 216–218, 240–244.

readIndex treats every Storage error as an empty index. The final merge uses only that new read plus this run's done list, discarding even the initial successfully read published set. A 503 during the final read therefore leads to uploading an index containing only the new batch. Earlier audio objects remain stored but disappear from discovery for clients loading that index.

Reproduction using the actual main function in a fully mocked VM: initial index contained already-published.mp3; final read returned a simulated 503; 75 clips for tr_l2_s1 were synthesized/uploaded to fake Storage; the final index had 75 entries and omitted already-published.mp3. No real provider or Storage call occurred.

Required change: distinguish a genuinely missing index from authentication, network and server failures; fail closed on an unreadable or invalid index. Preserve the initially known published entries as well as any successfully re-read entries. Do not publish a destructive replacement when the final read fails. A malformed JSON/schema must not be interpreted as a safe empty index. Keep publishing serially, one subtopic at a time; re-read/merge alone is not a concurrency lock.

Add an assertion that previously published entries survive initial/final read failures. Also test a genuine first-publication missing index.

### R3 — P1: the abandoned recording download can defeat a successful live fallback

Locations: utils/googleTTS.ts:307–310, 319–345; services/audioCache.ts:540, 995–999, 1088–1091.

The eight-second race intentionally leaves the download running. Both producers write the same final cache filename, but the live writer returns without saving its valid response when a file already exists. If the late recording completes after the deadline but before the live response is saved, that recording wins the cache slot. A bad recording can then prevent the already successful live response from being heard.

Integrated reproduction: hold recording download; advance the logical clock to eight seconds; confirm live TTS begins; complete the bad recorded download; release a valid live response. Result: live TTS was invoked once, no sound was played, and speakAndAwait returned false. The valid provider response had been ignored because the downloaded file existed.

Required change: coordinate the two writers for the same text/cache slot. After selecting live fallback, ensure the live result can be played and an abandoned download cannot replace or preempt it with a failed clip. Consider cancellation or producer ownership/versioning; simply shortening a timeout does not solve the race. Re-check cancellation before any recovery playback.

### R4 — P2: a successful index load or 404 is cached forever in the running process

Locations: services/audioCache.ts:1047–1049, 1058–1065.

The ten-minute query bucket affects the URL only when a fetch occurs. Once _recorded holds a Set, loadRecordedIndex always returns immediately. A 404 stores an empty Set and is equally permanent until the app process restarts.

Reproduction: fetch index while it returns 404; switch the fake server to a published index; advance eleven minutes; fetch a listed text. There was still only one index request and no clip download. Later subtopic batches are similarly invisible to a session that loaded an earlier successful index.

Required change: apply an explicit expiry/refresh policy to successful and negative results, retaining the previous usable index if refresh fails. Keep the retry backoff for failures. This does not by itself silence the app because live fallback continues, but it defeats staged publication and the intended ongoing cost reduction during long sessions.

### R5 — P2: prefetch has no eight-second recording deadline

Locations: utils/googleTTS.ts:574–578; services/audioCache.ts:360, 478–493.

Foreground speech has an eight-second race; prefetch directly awaits fetchRecordedTts. A slow recording can occupy a three-item prefetch batch until the shared 90-second download timeout, plus queue/cooldown time, before live prefetch starts. The timeout starts after obtaining a download slot, so queue time is additional.

Reproduction: hold a prefetch recording download and advance eight seconds. Prefetch remained pending and no live call had started; live prefetch began only after releasing the failed download.

Required change: bound the optional recording lookup/download wait in prefetch as well, and settle producer races safely as in R3. Do not describe the eight-second bound as covering all prefetch work until this is implemented.

### R6 — P2 hardening: the advertised screen-template drift guard does not guard all spoken templates

Locations: scripts/recordTts.mjs:96–117, 139–148.

The guard checks selected feedback snippets and the beginning of Engine B's number template with string includes. It does not verify the Engine A question/answer call expressions. In a read-only in-memory mutation, changing Engine A's question call to prepend a word left phraseLists successful. Thus the claim that the script stops whenever any screen constructs a sentence differently is too broad.

Current data does match, so this is not evidence of an existing vocabulary change. Before relying on the guard for later releases, add AST/template assertions for each actual speech construction and a test that changed question/answer/feedback/prefix expressions fail the gate. Existing text in comments or an unused expression should not satisfy the guard.

## 3.1 Vocabulary and manifest audit

All analysis used bundled content and source files; no content or text was edited. The manifest-building helpers were evaluated in memory rather than running CLI modes that write manifests. The two existing manifest files were only read.

| Check | Independent result |
|---|---|
| Bundled scaffold topics | 8; same files/order as backend/api.ts:327–335 and the subtopic screens |
| Subtopics / questions | 69 / 207 |
| Answers per question / correct answers | All 207 have four answers and exactly one correct answer |
| Praise strings | 15 unique; AST-decoded screen arrays agree with the script |
| Per-screen praise counts | A subtopic 15; B subtopic 15; A exam 15; A practice 15; A topic quiz 11 |
| Manifest records after per-subtopic de-duplication | 5,157 |
| Unique exact texts / unique filenames | 5,133 / 5,133 |
| Missing intended sentences | 0 |
| Extra unreachable sentences within the reviewed behavioral scope | 0 |
| Over-1,000-character texts | 0; longest is 141 characters |
| Existing manifest_all.json | Same ordered text/file pairs as the computed candidate |
| First subtopic tr_l2_s1 | 75 texts; 4,323 input characters |

The statement “75 per subtopic” needs qualification: vk_l2_s5 has 58 and vk_l3_s2 has 74 because duplicate texts are removed within each subtopic. The remaining 67 have 75. Before de-duplication, every question contributes the expected 25 constructions: one question, four raw answers, four numbered answers, fifteen praise/correct-answer combinations, and one wrong-answer line.

The independent expected set was assembled using TypeScript AST-decoded praise/number arrays and each question's correct answer; both set differences against the manifest were empty. All fifteen praise choices are reachable for behavioral questions through Engine A's exam/practice/subtopic paths even though A's topic-quiz list has only eleven choices.

Reviewed speech paths:

| Path | Construction and coverage |
|---|---|
| Engine A behavioral subtopic, lines 260/276 and 415–419 | Raw question/answers; praise or wrong-prefix plus correct answer |
| Engine B behavioral subtopic, lines 250–254 and 451/455 | Same question/feedback; spoken number + Ethiopic punctuation + space + answer |
| Engine A exam, lines 288–292, 350/430 and 640 | Same behavioral text; replay uses the same raw answer |
| Engine A daily practice, lines 162–166, 204/231 and 413 | Same construction; replay uses raw answer |
| Engine A topic quiz, lines 188–192, 233/270 and 386 | Same construction, smaller reachable praise subset |
| Engine B topic quiz, lines 382/385 | Raw question and numbered answers; no additional synthesized behavioral feedback construction found |
| AudioFeedback:136 / TextFeedback:124 | Pass supplied ttsText directly to speakAndAwait |
| AudioFeedback:108 / TextFeedback:103 | Dynamic RAG uses speakLongAndAwait; intentionally excluded |

The backend maps text with nullish defaults and maps answers without reordering (backend/api.ts:391–405, 553–567). Question shuffling changes question order, not answer order. The subtopic screens use the same scaffold arrays. No trim or normalization lies between these fixed question/answer/feedback constructions and speakAndAwait. splitForTts does trim/split its input (utils/googleTTS.ts:432–468), but that is used for the excluded dynamic RAG path, not these fixed constructions. The expected fixed-text set contains no leading/trailing whitespace.

Intentionally absent and still live: dynamic “why?” explanations, the standalone celebration phrase, the daily-questions announcement and the assembled location-permission primer. I found no need to add them to this first behavioral batch to meet the stated scope. They still require the same live-fallback runtime to remain healthy. Sign-audio fallback is a separate change and was not treated as part of this implementation.

## 3.2 Google request compatibility

PASS at request level. For all 5,157 manifest records, evaluated serialized JSON request bodies from scripts/recordTts.mjs and supabase/functions/tts/index.ts matched byte for byte:

- input.text is the exact string; no SSML.
- Voice: am-ET / am-ET-Standard-A / FEMALE.
- MP3, speakingRate 0.85; no effects profile.
- Same provider URL, POST and JSON/API-key header form; actual secret values were not read or printed.

No Google synthesis was called during QA. Matching parameters establish the same configured voice, not a guarantee that separately generated MP3 bytes are identical or a substitute for listening to a sample.

The 5,133 unique texts total 228,047 characters. At the published Standard rate of $4 per million characters, one successful synthesis per unique text is about $0.912 before applicable free usage, retries and other services. Thus “under $1” is consistent with this candidate's text volume, not an account-billing guarantee. [Google Cloud pricing](https://cloud.google.com/text-to-speech/pricing).

## 3.3 Filename compatibility

PASS. All 5,157 script filenames equal the actual audioCache.ts function's output. The script correctly retains ordinary multiplication rather than Math.imul. No distinct-text collision was found among the 5,133 unique filenames. Number prefixes and exact punctuation/spaces remain part of the cache key.

## Runtime evidence and test results

The repository test runner passed **19/19 test files**, including the new recorded test file. TypeScript passed with exit 0 and no diagnostics using:

- node planning/codex-qa-2026-10-06/tests/run-all.cjs
- npx --no-install tsc --noEmit --incremental false

Disabling incremental output prevents an extra build-info write and does not skip type checking. Tests run against fake providers/storage/players. No Android build or physical-device playback was run.

The new file contains fourteen scenarios; the runner passed it. That pass is insufficient for the guarantees claimed: its TTS world replaces audioCache with independent stubs, scenario 6 does not actually exercise a cache hit, scenario 7 expects no current-call recovery and does not perform the promised next try, and successful filename comparison does not exercise concurrent cache writers.

Independent experiments loaded the actual two TypeScript modules together via transpilation/VM, using in-memory files and controlled clocks. Upload experiments evaluated the actual script branch with entirely fake Google/Storage implementations and in-memory manifest writes; no real --upload command was executed.

| Experiment | Observed result |
|---|---|
| Valid recording, then cached replay | Both true; zero live calls; replay made zero extra downloads |
| Stop while recording is pending | False, zero playback, zero live calls |
| Newer speech request while older recording is pending | Older false; only newer sound played; speaking state remained with newer request |
| Slow foreground recording at 8 seconds | Live TTS started and valid live audio played |
| Clip HTTP 500 | Live fallback succeeded |
| Clip HTTP 429 with shared cooldown | Foreground live fallback succeeded at the deadline |
| Bad first recording | False, zero live calls: R1 |
| Bad prefetched recording, two attempts | False twice, two downloads, zero live calls: R1 |
| Late bad recording after live start, before live response save | One successful live response, no audio played, false: R3 |
| 404, then publication, then 11 minutes | Only one index fetch, no recording discovered: R4 |
| Prefetch recording still pending at 8 seconds | Prefetch pending, zero live calls: R5 |
| 120 MiB old cache plus new recording | Old file evicted, new file present, recorded URI returned |
| Final upload index read returns 503 | Prior published entry omitted from replacement: R2 |
| Changed question template in memory | Guard still accepted: R6 |

The recorded path uses the shared three-download line, atomic temporary-file download, index accounting and 120 MiB budget. It does not fetch every manifest clip on startup: downloads remain per requested sentence and existing prefetch input. The index itself is metadata. Healthy cached speech avoids recording-index and provider requests and can be replayed offline. This does not guarantee survival after deliberate eviction or device storage exhaustion; it preserves the existing cache model. In uncached airplane mode, neither a new recording nor live TTS can be fetched.

## 3.5 Publication, crash recovery and re-runs

The intended order is correct: clips first, index last; index cacheControl 60 and clip cacheControl 31536000. A crash before publication leaves unlisted audio objects unused by the app. With a readable correct index, re-running skips listed files; unlisted files from an interrupted run are synthesized/uploaded again with upsert, so recovery is safe but may repeat synthesis work. It does not resume directly from those orphan objects.

The destructive index-read behavior in R2 prevents unqualified approval of idempotence/preservation across transient failures. Concurrent publishers are also not protected by the merge; keep the owner's serial workflow. Provider synthesis has no explicit timeout in the recording script, unlike the live Edge Function; adding bounded timeout/retry would make batch operations easier to recover, without changing the text.

## סיכום לבעל האפליקציה

הגרסה עדיין אינה מאושרת להתחלת העלאה של tr_l2_s1 בתהליך הזה.
המשפטים עצמם תואמים: לא נמצאו מילים חסרות או נוספות, וגם שמות הקבצים והגדרות הקול נכונים.
כל 19 קובצי הבדיקות ובדיקת TypeScript עברו, אך הבדיקות הקיימות מחמיצות תקלות חשובות.
הקלטה פגומה עלולה להשאיר שקט ואף להיכשל שוב ושוב במקום לעבור לגוגל.
הורדה שמסתיימת באיחור יכולה לגרום להתעלמות מתשובת גוגל התקינה.
שגיאה בקריאת האינדקס בזמן הפרסום יכולה להעלים מהרשימה הקלטות שכבר פורסמו.
נדרשים תיקוני ההתאוששות והפרסום שבדוח, בדיקה חוזרת ואז האזנה לנושא הראשון במכשיר.
בבדיקה הזו לא הועלה דבר ולא שונו קוד, תוכן או קובצי הקלטה.

## Review boundaries and fingerprints

Only this report is written. Existing manifests are unchanged; no CLI manifest generation, upload, build, push or production call was performed. No credentials were exposed. The runtime and script experiments used mocked I/O only. Source line references are relative to the repository root C:/Users/Yakov/Desktop/driving-theory-app.

SHA-256 fingerprints of reviewed artifacts:

- services/audioCache.ts: 8cd5062e6d8d951a9bfcf755130e13549a206716ae3e97ac998d11bd0ea4d1ec
- utils/googleTTS.ts: 333a777b82632667d87e9baf9f813e06c8ba346d265e9442b70c3b41b1766def
- scripts/recordTts.mjs: 46a5270211ae25da0a3339953cf6f9f397b02c601d98d4cf65b8e08712b3a301
- supabase/functions/tts/index.ts: 9e2baab6ce82774ee7c463704ea47dc479ac088fdaafcaca6f923d68bc42e67b
- planning/codex-qa-2026-10-06/tests/recorded-tts-test.cjs: 4eb95b78f3392c4817159573cade3ecfd2ad8daba23000b3e4b1c7d8f1ff55bd
- planning/recorded-tts/CODEX_RECORDED_TTS_BRIEF.md: ede08022c0e165945d060e8ecbc9b87dd8e760b75f7ec77d59049c4ab24145ef
- planning/recorded-tts/manifest_all.json: 027c6e44b3d9351e965dc64ba15bf43ed7f109dd1b98347fd05db8503718f062
- planning/recorded-tts/manifest_tr_l2_s1.json: d22fdc2ce9a34de5a5b352c96681f28e17054566213499c2219afd412ff639ca
