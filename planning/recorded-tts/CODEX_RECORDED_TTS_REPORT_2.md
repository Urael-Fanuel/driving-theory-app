# Recorded TTS — Round 2 independent QA

**Verdict: NOT APPROVED.**

Reviewed 2026-10-24. The original publication/index-loss and late-download collision defects are fixed. Text coverage, file naming and provider settings pass. Two error-path defects remain in the refactored playback code; one is a new speaking-state regression. Fix S1 and S2 before accepting this runtime candidate. S3 is a guard hardening issue, not a current vocabulary mismatch.

The first subtopic's text and publication procedure pass this review under the documented serial workflow. The overall feature is not approved for deployment yet. I have not uploaded the first subtopic or authorized production rollout.

## Findings

### S1 — P2: terminal live playback failure leaves “speaking” permanently true

Locations: utils/googleTTS.ts:321–323, 397–416, 423–432, 444–454. UI consumers: app/(engineA)/(tabs)/exam.tsx:559,660; app/(engineA)/practice.tsx:287,303; app/(engineA)/topic-quiz/[topicId].tsx:325,463.

_playTtsUri deliberately leaves speaking enabled on 'failed' so a saved-file failure can proceed to live recovery. But the final live attempt uses the same helper and returns its comparison with 'done' directly. A terminal load, start or playback failure therefore returns false without calling _stopSpeakingIfMine. No further recovery owns that true state. The subscribed screens keep their pause icon and treat the next tap as a stop instead of a new reading until something resets TTS.

Reproduction: load the actual audioCache.ts and googleTTS.ts together with fake I/O, return unusable audio from the live provider, subscribe to onTTSSpeakingChange, and await speakAndAwait('bad'). Result: false; events [false,true]; getIsTTSSpeaking() remains true. This requires no recording to be published: it also regresses today's live-only path. A successful HTTP response does not guarantee successful local playback.

Required: clear speaking on every terminal exit, using the captured generation so an older request cannot clear a newer request's state. Keep speaking enabled only while the same request will actually retry. Add assertions for final load failure, playAsync rejection and playback failure, including failure of the live recovery after a bad saved clip. Preserve the newer-owner test.

### S2 — P2: a cached live file that fails to start is reused instead of the new live rendering

Locations: utils/googleTTS.ts:375–384,423–432; services/audioCache.ts:1005–1009. Native adapter: services/sound.ts:290–293.

The playAsync catch assumes the file is fine and keeps it. When that saved file is a live tts_* rendering, the fallback fetch succeeds, but storeTtsAudio sees the old file and does not write the new response. _fetchLiveTts then returns that same cached URI. The second attempt therefore repeats the failed file rather than trying the audio just fetched. This is narrower than the original recording/live filename collision, which is fixed.

Reproduction: seed a tts_* file that loads but whose player rejects playAsync for that file; let the fake provider return valid new audio. The two actual modules return false, invoke live once, play nothing and retain the failed file. The fake player was extended only to model this start failure; production source was unchanged. The adapter calls native player.play() without classifying its exceptions, so the unconditional claim that every start exception proves a healthy file is not established by the code. A transient audio-focus failure may succeed on retry, but that does not cover every exception.

Required: ensure the bounded recovery really plays the fresh response, for example by bypassing the old slot for this attempt or safely replacing it. If retaining the file for a known transient error is intentional, classify that case explicitly. Do not assume every playAsync exception is transient. Add a test proving the attempted URI/audio changes to the fresh rendering and that retries stay bounded. This is also a mismatch with the Round 2 brief's statement that a saved clip that will not start is discarded.

### S3 — P2 hardening: the AST guard still ignores meaningful whitespace inside speech literals

Locations: scripts/recordTts.mjs:99,127–133.

The guard parses AST nodes, but then collapses all whitespace in each node's source text, including text inside template literals. Changing Engine B's numbered answer from one space after the Ethiopic punctuation to two spaces is accepted: speechGuard.problems remains empty. The generator still emits one space. The changed runtime string has a different content hash and no longer matches its recording. The live fallback prevents wrong recorded words from being heard, but exact-text coverage and the claimed drift check are no longer guaranteed.

Reproduction was an in-memory source replacement in app/(engineB)/behavioral-subtopic/[id].tsx:

- Existing numbered-answer template: one space after the Ethiopic punctuation, before the answer expression.
- Mutation: the identical template with two spaces before the answer expression.
- Guard returned zero problems; the manifest builder retained the original single space.

Required before relying on this guard as an exact-text gate: compare AST expression structure while preserving literal/template text exactly. Add mutations for doubled spaces, newlines and other meaningful literal characters. The disclosed generic argument-name limitation ('text') also remains; the guard is a useful allowlist, not whole-program data-flow proof. Current unmodified texts pass, so S3 is not evidence of a present recording mismatch.

## Previous findings: disposition

| Previous item | Round 2 result |
|---|---|
| R1: bad saved recording, including prefetched recording | Load and playback-error recovery now work within the same request; rtts_* provenance and session skip prevent repeated bad recording downloads. Start-failure handling is not fully closed: S2. Final failure cleanup has S1. |
| R2: final index-read error erases older entries | Closed for the reviewed serial workflow. readIndex fails on network/server/auth errors and malformed schema; publish merges initial, final and newly uploaded filenames and does not write the index if the final read fails. |
| R3: late recording defeats live result | Closed. rtts_* and tts_* are separate local and Storage names. Cache lookup prefers live; a late recording cannot occupy the live slot. The integrated delayed-download test passes. S2 concerns reuse within the live slot, not this old collision. |
| R4: index/404 cached forever | Closed. Ten-minute refresh, including negative results; previous index survives failed refresh. Independently observed two index fetches, one refresh error and successful playback from the retained index with zero live calls. |
| R5: unbounded optional recording prefetch wait | Closed for the recording stage. Speaking and prefetch use withRecordedDeadline at eight seconds. This does not impose an eight-second bound on the subsequent live prefetch request or native playback. |
| R6: string-search drift guard | Substantially improved: AST traversal checks speech calls, feedback construction/props, correct-answer extraction and replay callers. Existing mutation scenarios pass. Exact-literal whitespace remains unchecked: S3. |

## 3.1 Vocabulary and coverage

PASS for the current candidate. Read all eight scaffolds and the current call-site inventory across app/ and components/. Checked the current speech guard and constructed a separate expected set from the questions, four answers, current praise/number arrays, correct-answer selection and literal wrong-answer prefix. Compared both set differences with the generator output. The existing manifest_all.json exactly equals the newly computed sentence records, including the new rtts_* names; generation was in memory, without running a manifest-writing CLI mode.

- 69 subtopics, 207 questions; 15 unique praises.
- 5,157 per-subtopic records, 5,133 unique exact texts/files.
- Missing intended sentences: 0. Extra sentences in the reviewed behavioral scope: 0.
- Longest text: 141 characters; none exceed the provider's 1,000-character input limit.
- tr_l2_s1: 75 records. As in Round 1, vk_l2_s5 has 58 and vk_l3_s2 has 74 due to deduplication; not every subtopic has 75.
- Engine A raw question/answer speech, Engine B numbered answers, and the exam/practice/topic-quiz/subtopic feedback paths retain the constructions reviewed in Round 1. No new normalization of these fixed texts was introduced in the reviewed path. The runtime's long-text splitter remains for the dynamic explanation path.

Intentionally live: dynamic “why?” explanations, standalone celebration, daily-questions announcement and location-permission primer. No need to add those to this first behavioral publication. Sign-audio fallback remains outside this change.

## 3.2 Provider request and 3.3 filename checks

PASS. Extracted the provider request object from the actual Edge Function's TypeScript AST, evaluated it for all 5,157 strings and compared its serialized JSON with ttsRequestBody(text): zero mismatches. Plain input.text, am-ET, am-ET-Standard-A, FEMALE, MP3 and speakingRate 0.85 remain identical; no SSML or effects profile was added.

Compared all 5,157 manifest filenames against recordedTtsFilename from the actual audioCache module: zero mismatches. The ordinary-multiplication hash is preserved; recordings now use rtts_* and live renderings retain tts_*. The manifest matches the new convention. No Google synthesis or listening test was performed; request equivalence establishes configuration, not identical audio bytes or device playback quality.

## Runtime and automated validation

Commands completed successfully:

- node planning/codex-qa-2026-10-06/tests/run-all.cjs — **19/19 test files passed**, including recorded-tts-test.cjs and the updated ownership tests.
- npx --no-install tsc --noEmit --incremental false — **exit 0, no diagnostics**. Incremental output disabled to avoid writing a build-info file.

The recorded suite has 22 scenarios and now connects the real cache and TTS modules, which is a meaningful improvement over Round 1. Its publishing scenarios exercise real exported helpers with fake storage. Reviewed assertions cover bad recording load/playback, bad prefetched recording, delayed recording/live overlap, index refresh, eight-second prefetch fallback, cancellation before playback, index failure, clip failure, first publication, initial/final read failure, malformed JSON and merge/re-run. The suite's player does not reject playAsync, and it does not assert speaking=false after a failed final live attempt; passing it does not rule out S1/S2.

Additional in-memory checks, using real source modules and mocked I/O:

| Check | Result |
|---|---|
| Cached recording replay with failed-network fixture | true; zero index requests and zero live calls |
| Shared download 429 | Live fallback succeeds |
| Failed refresh after a valid index | Previous index remains usable; no live call for its listed text |
| Stop after playback started | true, speaking=false, as required |
| Old recording completes after a newer request starts | Old returns false, no report or retry, only new audio plays; newer speaking state stays true and newer request finishes true |
| Stop before playback | Covered by integrated scenario 15: false, no playback or live call |
| Failed final live load | false but speaking=true: S1 |
| Cached live file rejects start, valid fresh provider response | false, old file reused, no audio: S2 |
| Double a template's literal space | Guard accepts: S3 |

Recordings still use the shared atomic download queue and 120 MB accounting/eviction. Separation of live and recorded slots can retain two copies of one sentence after fallback, but both are accounted in the same budget. No bulk manifest download is added. Offline coverage means a healthy cached clip can be replayed; uncached speech still requires a connection, and eviction can remove offline availability.

This is source/logic QA, not an Android device or production-network test. Existing sound/cache tests passed; real decoding, audio focus, weak-network timing and listening on a device remain the final rollout check.

## 3.5 Publication and restart safety

PASS for serial one-subtopic publication. readIndex uses the authenticated object endpoint, accepts absence via HTTP 404 or the recognized Storage missing-object body, rejects other failures and invalid files lists. The implementation's reported live Storage 400/404 observation was not independently repeated against production during this read-only review.

Clips are written first and the union index last. Partial failures only add successfully uploaded clips. Final read failure leaves the old index untouched; orphan clips are safe and can be regenerated on a later run. Re-running an indexed batch skips it. Index cache-control remains 60 seconds; clips remain 31,536,000 seconds. Synthesis now has a 30-second abort and three attempts. Storage GET/POST themselves have no explicit timeout; that can hang an operator run but does not justify replacing an unreadable index.

The CLI refuses --upload with --all, but accepts comma-separated subtopics. It does not strictly enforce exactly one subtopic, and re-read/union is not a concurrent-writer lock. Use the documented single tr_l2_s1 invocation and one publisher at a time. An explicit wanted.length === 1 upload gate would make the stated restriction enforceable; this is not a blocker for the specified serial single-subtopic procedure.

## סיכום לבעל האפליקציה

התיקונים סגרו את תקלות ההורדה המאוחרת, רענון האינדקס ואובדן הרשומות בזמן פרסום.
כל 19 קובצי הבדיקות ובדיקת TypeScript עברו; המשפטים, הקול ושמות הקבצים תואמים.
נשארה רגרסיה: אחרי כשל סופי בניגון, החיווי עלול להישאר במצב „מדבר”.
בנוסף, הגיבוי החי עלול לנסות שוב קובץ שמור שלא הצליח להתחיל לנגן.
יש לתקן את S1 ו־S2; מומלץ גם להשלים את בדיקת הרווחים בטקסט לפי S3.
הטקסטים ותהליך הפרסום של tr_l2_s1 תקינים, אך איני נותן עדיין אישור כולל להפעלת הפיצ'ר.
לאחר התיקונים והבדיקה החוזרת, התחילו בנושא אחד ובדקו האזנה וגיבוי במכשיר.
נכתב רק דוח זה; לא שונו קוד או תוכן ולא בוצעה העלאה.

## Scope and fingerprints

Only CODEX_RECORDED_TTS_REPORT_2.md is written. No source edits, builds, uploads, production requests or manifest regeneration on disk. Reproductions and mutations were in memory. No credentials were read or printed. Paths and line references are relative to C:/Users/Yakov/Desktop/driving-theory-app.

SHA-256 of reviewed artifacts:

- services/audioCache.ts: 09aaa8f0aad4daf9a1be9f6c678b748eb0a935548dcba3aab3659dbe68fab722
- utils/googleTTS.ts: 8bcef806e0d5b82b79132304fb0b7724daf90989e188eea72144a091a5130bf3
- scripts/recordTts.mjs: a27b3e5543e71caaf8c1d14b1bc816fa1502885619f61363e8db15c4582578fc
- supabase/functions/tts/index.ts: 9e2baab6ce82774ee7c463704ea47dc479ac088fdaafcaca6f923d68bc42e67b
- services/sound.ts: 5aaae1d60fee07fdb8c9003494e79ae3386515594ff6a1f5dfd05644ca72b76b
- planning/codex-qa-2026-10-06/tests/recorded-tts-test.cjs: e96d7b005f6ac4134a2af946701832be502b36c5cc940b6a85f99c062232146c
- planning/recorded-tts/CODEX_RECORDED_TTS_BRIEF.md: 8edad5ce1416aa9945642e7926e755b2ba9c6fc5745293aa3e61588b5c02de26
- planning/recorded-tts/CODEX_RECORDED_TTS_REPORT.md: c1180056555062afbc0b8c82cb93092cc225764bf74a09e4062db2331d9989d9
- planning/recorded-tts/manifest_all.json: 827526933506424dd08d12549812b0145bd2b160d3fa089be288d1aee6c88b70
- planning/recorded-tts/manifest_tr_l2_s1.json: 4e4fa06fb534de05da3f1782d79f225d15d708c07ebc463878798ab5d42f3aaa
