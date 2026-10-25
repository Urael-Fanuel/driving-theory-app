# Recorded TTS — Round 3 independent QA

**Verdict: APPROVED for the first-subtopic pilot (tr_l2_s1).**

Reviewed 2026-10-25 against CODEX_RECORDED_TTS_BRIEF.md, including Round 3, and both earlier reports. S1, S2 and S3 are closed for the reviewed candidate. The earlier R1–R6 fixes remain effective in the tested scope. No blocking code defect was found in this re-review. It is reasonable to record/upload the first subtopic through the documented serial procedure, then listen and exercise fallback/offline playback on a device before expanding publication. This is approval of that staged step, not proof that every Android device or the whole app is production-ready.

No upload was performed in this review.

## Findings and remaining limitations

### N1 — P3 documentation precision: fresh audio is not always saved when the old file is undeletable

Locations: utils/googleTTS.ts:386–392; services/audioCache.ts:1005–1009,1175–1180; recorded-tts-test.cjs scenario 28.

The repaired current request plays fresh audio from a data URI if the old cache filename failed. This works even if deleting the failed file is denied. However, storeTtsAudio returns without writing when that old filename still exists. Therefore the Round 3 brief's phrase that the fresh rendering is saved for next time needs a condition: it is saved when deletion/replacement succeeds. With an undeletable failed file, the old file remains, so future attempts can need live recovery again and offline playback of that sentence is not repaired.

Independently reproduced: undeletable nostart file -> true, fresh data URI heard, speaking=false, but the old file's kind remains nostart. Normal deletion -> fresh good file saved, next replay succeeds without another live call.

This does not reopen S2: the valid fresh response is now heard within the same request, as requested. A storage failure can prevent offline repair, and the implementation no longer lets it prevent current online playback. Correct the unconditional wording; a future persistent-cache repair policy is optional and not required before this pilot.

No other actionable finding was identified. Existing limits remain: the speech guard is an allowlist rather than whole-program data-flow analysis; a generic argument named text is accepted as disclosed. Concurrent publishers are not locked. Storage GET/POST have no explicit operator-side timeout. Use one publisher at a time. These are not new regressions or blockers for the specified single-subtopic pilot.

## Round 2 findings: verified closure

| Finding | Evidence and disposition |
|---|---|
| S1: speaking stays true after final live failure | CLOSED. utils/googleTTS.ts:323–330 clears the state on a not-heard final result through the captured generation. Independently exercised final load failure, start rejection and playback error: each returns false, invokes live once and leaves speaking=false. Also forced the data-URI recovery player to reject loading: false, speaking=false, one live request. |
| S2: retry reuses the failed saved live file | CLOSED. utils/googleTTS.ts:308–323 passes failedUri; :389–392 excludes that URI; :432–444 discards a file whose playAsync rejects. A seeded cached nostart file is replaced under normal filesystem conditions, fresh data audio is heard, and subsequent cached playback succeeds without a second live request. An undeletable file still recovers from the fresh data response. See N1 for persistence wording. |
| S3: guard collapses literal whitespace | CLOSED for the reported cases. scripts/recordTts.mjs:104–133 scans tokens and preserves template/string token text. Independent doubled-space, literal-newline and tab mutations of Engine B's spoken template each produce a guard problem. Suite scenario 29 additionally tests feedback whitespace and accepts layout changes outside literals. |
| Multiple subtopics could pass the upload gate | CLOSED. scripts/recordTts.mjs:405 rejects --all and wanted.length !== 1 before provider/storage operations. Reviewed statically; no upload command was run. |

I also removed the fixes in isolated in-memory source variants to test whether the checks actually distinguish broken behavior. Removing S1's cleanup reproduced false with speaking=true. Removing the failedUri exclusion reproduced false with no playback for the undeletable-file case. The real source files were never edited.

## Earlier findings and regression coverage

The actual audioCache.ts, sound.ts and provider Edge Function hashes are unchanged from Round 2. The playback helper changes and script guard were inspected directly. The updated integrated suite reruns the earlier cases.

| Earlier issue | Round 3 status |
|---|---|
| R1: bad recording/prefetch causes silence instead of recovery | Closed: recorded load/playback failures recover live within the same request; recorded provenance and session skip remain. Start failure is now handled consistently by S2. |
| R2: final index-read failure loses older entries | Closed: scripts/recordTts.mjs:319–331 rejects unreadable indexes; :340–371 preserves the initial/final/new union and does not update the index if its final read fails. Mock-storage scenarios pass. |
| R3: late recording preempts live audio | Closed: rtts_* and tts_* slots remain separate, live is preferred, and the delayed-recording integrated test passes. |
| R4: successful/negative index cached forever | Closed: ten-minute refresh and retention of a prior index on refresh failure remain; integrated tests pass. |
| R5: optional recorded prefetch wait unbounded | Closed for the recording stage: both callers use the eight-second deadline. Subsequent live prefetch is not covered by that deadline. |
| R6: incomplete construction guard | The reported question/answer/feedback mutations are rejected; S3 closes the literal-whitespace hole. The disclosed argument-name limitation remains. |

Additional independent real-module checks used fake files, network, player and one logical clock:

- Old recorded request completed after a new request started: old returned false; only new audio played; no stale error report; speaking remained true for the newer request, which then completed successfully.
- Intentional stop after playback began: true and speaking=false, preserving the requested behavior. Before-playback stop remains false under integrated scenario 15.
- Cached recording replay with an unavailable-network fixture: true, zero index requests and zero live calls.
- Recorded download HTTP 429: bounded foreground fallback succeeded and speaking ended false.
- Final live load/start/playback failure and failed memory recovery: no unbounded retry and no stuck speaking state.

The cache still uses the shared atomic download path, three-download limit and 120 MB budget. Both live and recorded slots count toward that same budget. No new bulk download or startup download of every manifest entry was introduced. A cached healthy sentence can replay offline; an uncached or evicted sentence still needs a connection. The eight-second deadline bounds waiting for a recording, not all decoding/playback or the total request duration.

## 3.1 Exact vocabulary and manifests

PASS. Recomputed the generator's records in memory, read the existing manifests, checked current speech call sites across app/ and components/, and constructed a separate expected text set from the scaffold questions, answers, correct-answer selection, current praise/number arrays and feedback prefix. Compared both set differences. No CLI mode that writes a manifest was run.

| Check | Result |
|---|---|
| Scaffold topics | 8, matching backend/api.ts:327–336 order |
| Subtopics / questions | 69 / 207 |
| Unique praise strings | 15 |
| Manifest records | 5,157 |
| Unique exact texts/files | 5,133 |
| Missing intended sentences | 0 |
| Extra sentences in the behavioral scope | 0 |
| Existing manifest_all.json sentence records vs current generator | Exact match |
| First subtopic tr_l2_s1 | 75 records |
| Length | No text over 1,000 characters; prior maximum remains 141 |

The exact-text paths remain: Engine A raw questions/answers, Engine B number + Ethiopic punctuation + space + answer, correct praise + correct answer, and the fixed wrong-answer prefix + correct answer. These cover the exam, practice, topic quizzes and subtopic screens. No new trim/normalization was added to the fixed-text path. Dynamic long explanations still use their existing splitter.

As before, per-subtopic deduplication means vk_l2_s5 has 58 records and vk_l3_s2 has 74; the other 67 have 75. Excluded intentionally and still live: generated why-explanations, standalone celebration, daily-questions announcement and the location primer. They need not be added to this first behavioral batch. Sign-audio fallback remains separate.

## 3.2 Provider request and 3.3 filenames

PASS. Extracted the actual Edge Function request object with the TypeScript AST and compared its evaluated serialized JSON to ttsRequestBody(text) for every one of the 5,157 records: zero mismatches. Plain exact input.text; am-ET / am-ET-Standard-A / FEMALE; MP3; speakingRate 0.85; no SSML or effects profile.

Compared all generated filenames to recordedTtsFilename from the real cache module: zero mismatches. Ordinary multiplication in the hash remains unchanged; rtts_* recording names agree across runtime, script and manifests, while live renderings use tts_*.

No Google audio was synthesized or listened to in QA. Identical request configuration does not establish identical MP3 bytes or device audio quality; the first-subtopic listening check remains necessary.

## Automated tests

- node planning/codex-qa-2026-10-06/tests/run-all.cjs: **19/19 test files passed**, including the recorded TTS suite's 29 scenarios.
- npx --no-install tsc --noEmit --incremental false: **exit 0, no diagnostics**. Disabling incremental output avoids a build-info write.

Read the new assertions and fake player behavior, then extended the in-memory harness for the extra data-URI failure check above. These are logic tests, not physical Android tests. The mutation experiments show the new cleanup and failed-URI guards are necessary for the tested cases; they do not prove every possible platform failure is covered.

## 3.5 Publication procedure

Approved for one serial tr_l2_s1 batch. Existing valid index entries are retained; missing-object responses allow first publication; authentication/network/server/JSON/schema failures are not treated as an empty index. Successful clips are uploaded before the merged index. Failed clip uploads are not listed. A crash or failed final index read leaves unlisted objects unused; retry can regenerate those orphan objects, while already listed clips are skipped.

The index retains cacheControl 60; clips retain 31536000. Synthesis has a 30-second abort and up to three attempts. Exactly one subtopic is now enforced before any upload. This is not a concurrent-publisher lock, so keep the documented one-run-at-a-time workflow.

The next validation step is to publish only tr_l2_s1, listen to question/answer/feedback in both engines, replay after disconnecting, and exercise fallback, stop and rapid replay on an Android device. Expand batches after that succeeds. No build, upload or production request was made during this review.

## סיכום לבעל האפליקציה

מאושר להתחיל בהקלטה ובהעלאה של תת־הנושא הראשון tr_l2_s1, בתהליך המדורג שסוכם.
שלושת הממצאים מהדוח השני תוקנו ולא שוחזרו בבדיקה החוזרת.
כל 19 קובצי הבדיקות ובדיקת TypeScript עברו; נבדקו גם מקרי כשל וביטול נוספים.
כל 5,157 המשפטים תואמים, ללא חסרים או תוספות, וגם שמות הקבצים והגדרות הקול תואמים.
אם המכשיר אינו מאפשר למחוק קובץ פגום, ההקראה החיה נשמעת אבל התיקון המקומי אינו מובטח.
לפני הרחבת ההעלאה, יש להאזין לנושא הראשון במכשיר ולבדוק גיבוי, עצירה וניגון ללא רשת.
זהו אישור לפיילוט המדורג, ולא אישור גורף לכל האפליקציה בכל מכשיר.
נכתב רק דוח זה; לא שונו קוד או תוכן ולא הועלה דבר.

## Scope and fingerprints

Only planning/recorded-tts/CODEX_RECORDED_TTS_REPORT_3.md is written. All experiments and mutations were in memory with fake I/O. Existing manifests and previous reports were read only. Credentials were not read or printed. File:line references are relative to C:/Users/Yakov/Desktop/driving-theory-app.

SHA-256 of reviewed artifacts:

- services/audioCache.ts: 09aaa8f0aad4daf9a1be9f6c678b748eb0a935548dcba3aab3659dbe68fab722
- utils/googleTTS.ts: 037082049b1d1ed251c4154a23d6ff2bd9f000c8d390488095ad53b086c708a5
- scripts/recordTts.mjs: ea0f58b0df29c09820c72d540984b1259550ddd09cd7e351802643ee28b70d8c
- supabase/functions/tts/index.ts: 9e2baab6ce82774ee7c463704ea47dc479ac088fdaafcaca6f923d68bc42e67b
- services/sound.ts: 5aaae1d60fee07fdb8c9003494e79ae3386515594ff6a1f5dfd05644ca72b76b
- planning/codex-qa-2026-10-06/tests/recorded-tts-test.cjs: dd8d48eca79201f0aac64cf17195451e4f309884f8baffea28b540a91ea49741
- planning/recorded-tts/CODEX_RECORDED_TTS_BRIEF.md: a7623ac64a7d276be90ebba059f4883677e5d2c2f862bdf01b23f651eaf28438
- planning/recorded-tts/CODEX_RECORDED_TTS_REPORT.md: c1180056555062afbc0b8c82cb93092cc225764bf74a09e4062db2331d9989d9
- planning/recorded-tts/CODEX_RECORDED_TTS_REPORT_2.md: 56225e2e5c872647e59b4531fe805fa293eed1b96e7b0aa89db7d96803b14198
- planning/recorded-tts/manifest_all.json: 74db465cc44567c4b9b444c3be9870048f943f5aae5e50d549aef49f84a74bb1
- planning/recorded-tts/manifest_tr_l2_s1.json: 06e8a527db4995ac7bba75c57eb9e639533292e4deec059b1654113f1634c9dd
