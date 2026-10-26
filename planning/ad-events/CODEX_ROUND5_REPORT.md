# Round 5 — independent QA re-review

**Verdict: APPROVED WITH FIXES for the reviewed code; NOT ready for unconditional production sign-off.** R4-1, R4-2 and R4-3 are closed under the explicitly accepted sampled-visibility rule. The additional launch-gating, SQL serialization and public-key transport changes look correct within the checks below. R4-4 remains partially open: the Amharic policy still contains the old no-personal-data claim. Correct that paragraph before publishing it. No additional blocking code regression was reproduced.

Reviewed 2026-10-26 against CODEX_ROUND5_BRIEF.md and CODEX_ROUND4_REPORT.md. Review/test only: no source edits, build, migration execution, live backend request, publication or .env read. Only this report was written. Paths below are relative to C:/Users/Yakov/Desktop/driving-theory-app.

## Remaining actionable finding

### R5-1 — P2: the Amharic paragraph retains the inaccurate promise (R4-4 partially open)

Location: docs/privacy-policy.html:320.

The sentence still contains:
“የግል ውሂብዎን የማይጠቀሙ”
meaning “that do not use your personal data.” The following newly added sentence says Google still uses some data including the IP address for delivery and fraud prevention. Adding that explanation does not qualify the preceding categorical claim with “for personalization”; the paragraph now contradicts itself.

The English paragraph at line 172 correctly limits its claim to personalization, and services/adsConsent.ts:15–18 now explains delivery/fraud processing. Google's documentation explicitly distinguishes disabling personal-data use for personalization from continued IP use for delivery; fraud-related local storage is conditional on programmatic limited ads. [Google AdMob: Limited ads](https://support.google.com/admob/answer/10105530?hl=en).

Required correction: replace the Amharic no-personal-data clause with the intended no-personalization meaning, have the language reviewer verify the whole paragraph against the English meaning, and retain the accurate delivery/security explanation. Match English “may still show” rather than promising ad availability. Do not restore the retired “refusal means no ad requests” rule. Publication still requires the owner's approval as the brief states; this review did not publish anything.

The passing consent test does not establish semantic equivalence of translated prose. The brief's claim that both languages now say the same thing is not fully supported by the actual file.

## Findings disposition

| Item | Result and evidence |
|---|---|
| R4-1 exit guard | Closed. All four real handlers put exit operations inside try/catch, release the guard on error, retain it after successful navigation, and release when canGoBack is false. |
| R4-2 delayed measurements | Closed under the revised accepted metric. Default maxGap is 500 ms; a larger gap restarts the observed interval. The original 300 ms measurement-latency reproduction no longer counts. |
| R4-3 unusable clipping frame | Closed. Null means no provider; invalid/zero frames yield an empty viewport. A provided measurement returning null or rejecting becomes EMPTY_FRAME in the hook. |
| R4-4 policy | English and comment fixed; Amharic remains open as R5-1. |
| First-two-launch preload | Closed. Readiness notifications do not create interstitials during launches 1–2. Launch 3 still prepares and refreshes normally. |
| SQL concurrent admission | Static review supports the fix for the normal RPC path: transaction advisory lock precedes checking/admitting rows, keyed by UTC day and platform. No database execution claimed. |
| Public publishable-key header | Corrected. Actual service sends apikey without Authorization or a user access token. Tested with synthetic credentials only. |

Handler locations: app/(engineA)/behavioral-subtopic/[id].tsx:334; app/(engineB)/behavioral-subtopic/[id].tsx:190; app/(engineA)/topic-quiz/[topicId].tsx:427; app/(engineB)/topic-quiz/[topicId].tsx:147.
Measurement locations: services/adEvents.ts:149–160,171,210; hooks/useSponsorAdTracking.ts:63–65.
Additional fixes: services/interstitial.ts:126; backend/migration_tts_stats.sql:80; services/ttsStats.ts:36.

## Independent executions and regression assessment

Real current TypeScript modules/functions were evaluated in memory using fake clocks, native dependencies, storage, router and network. Existing test setup was reused, with additional injections/schedules. No temporary source/test files were written.

- All four AST-extracted handleBack functions: inject a router exception once, then retry. Each releases the guard after the error and retains it after successful retry. The same result holds for an injected ad-service rejection.
- Both Engine B handlers: inject setTtsSpeaking throwing once; the guard releases and retry succeeds. Engine A handlers do not call that setter, so that injection is not applicable there. Their cancel/audio operations are inside the same try.
- The suite's 24 handleback scenarios cover successful single navigation, overlapping calls while an ad is pending, navigation failure, audio rejection, canGoBack=false and non-endpoint phases. Caveat: its generic stopAudio rejection injection does not exercise Engine A behavioral, which uses stopTTS/soundRef instead; the assertion in that scenario is weaker than the title implies. This is test-strength feedback, not a remaining implementation defect.
- Real tracker with 20 ms measurement latency: exactly one view at 1350 ms.
- Original slow reproduction: 300 ms measurement latency, offscreen from 600 to 900 ms, checked at 1650 ms: no view.
- Continue that tracker fully visible for another 10 seconds at 300 ms latency: still no view. Reduce latency to 20 ms: it recovers and emits once at 12630 ms.
- clipViewport and visibleShare: absent frame gives share 1 for the sample card; zero-height, NaN and EMPTY_FRAME each give share 0.
- Real interstitial service, readiness notification after startup: launches 1 and 2 create zero ads. Launch 3 creates its initial ad and then a replacement on the notification (two total instances, not two simultaneous shows).
- Real TTS statistics service: captured fake request contains Content-Type and apikey only; no Authorization header.

**Slow-device tradeoff:** each sample is separated by measurement time plus the 250 ms wait. When total measurement latency consistently exceeds 250 ms, sample gaps exceed 500 ms and even a genuinely visible card can remain uncounted indefinitely. This is conservative undercounting, not a UI delay or the previous false-positive defect. It follows directly from the accepted maxGap rule and is not raised as a new blocker. Do not describe these counts as exhaustive impression totals on every device. A later improvement can obtain more timely visibility evidence; merely raising the allowed gap changes the metric's tolerance.

The EMPTY_FRAME path is a temporary conservative exclusion, not permanent disabling: later valid measurements can start a fresh exposure interval. A rejected provider promise is caught and mapped to the empty frame; a never-resolving measurement is bounded by the tracker timeout. The hook's provider/card composition was inspected; this was not a native layout test.

## SQL and transport qualifications

No SQL was executed. The advisory lock is acquired before the version-existence/count checks and held through the upsert until transaction end. Its day/platform key matches the bucket used by the checks and insert. With ordinary READ COMMITTED RPC transactions and all admissions through this function, this removes the previously demonstrated concurrent check-then-insert overshoot. The bound is at most 40 named versions plus other. It does not repair an already oversized table or constrain privileged direct inserts.

Input validation, qualified table references, empty search_path, table access restrictions and explicit function EXECUTE grants remain. The revised small-cohort caveat is appropriate. Per-call count bounds still do not prevent repeated anonymous requests from inflating diagnostic totals; these remain non-billing counters.

The new transport agrees with Supabase's distinction between publishable application keys and user JWT authentication. The publishable key is not a JWT; no user identity token is attached by this service. [Supabase API keys](https://supabase.com/docs/guides/api/api-keys). This does not eliminate ordinary network metadata.

Claude's reported live 404 experiment was not repeated and is not counted as independent proof that the not-yet-deployed function works. Schema, grants and concurrent behavior still need the previously accepted database checks after implementation. The lock argument above is static reasoning, not a concurrency benchmark.

## Verification and scope

- node planning/codex-qa-2026-10-06/tests/run-all.cjs: **26/26 test files passed**, exit 0.
- npx --no-install tsc --noEmit --incremental false: **passed**, exit 0, no diagnostics. Incremental output was disabled to avoid writing build metadata.
- Independent cases above add delayed-measurement recovery, translated-policy inspection and explicit error injections.
- SQL coverage in the suite is static; native Android behavior and real ad serving were not exercised.
- Known/accepted device checks, unexecuted SQL, best-effort delivery, short missed absences within maxGap and prior overlay timeout limitations are not presented as new defects.
- Git status could not establish a working-tree diff in this execution context (“must be run in a work tree”). Review instead used actual file contents and the fingerprints below.
- The only discovered AGENTS.md was under dashboard, outside these reviewed paths.
- Recommended next action: correct R5-1, verify the revised Amharic sentence, then complete the already agreed DB/device checks before release. No broad code rewrite is requested.

## Reviewed fingerprints

SHA-256 of source/test files at this review; rechecked unchanged before final delivery:

- services/adEvents.ts: 16af7ce44ebbb209f1b1809a164eba9a340262c74eb7104f9a8b50a0b2415786
- hooks/useSponsorAdTracking.ts: 79cfa0344db2c111c0e35c079a1f4600a97816a443263660846b3f909d2e2ad6
- services/adsConsent.ts: eda4faedde4c5a67e459b2011410b16975891fdceffef6c850d2cc9fc0732c22
- services/interstitial.ts: 2e76dd8bae0c1a5ec78b6e5f106b4178c62dabfc667eccb5c14430dd5e45a531
- services/ttsStats.ts: d66433a98d0f9981dddd09adcb40604d54a07223e2d076e87adf1c09eb805c7a
- backend/migration_tts_stats.sql: 8161e524971d7546cf1bfc59e241cde654192af4fc1b1ecf010ff0885bf46e2f
- docs/privacy-policy.html: e45370a05f0231321cbd8dc8b8c68ee3cf770dad9b8dc61b879d350d81dc9c43
- app/(engineA)/behavioral-subtopic/[id].tsx: f7439516c9f2b3bff945df89c414d930101b1bba32e6ff42e4a6bf2ea9ed625f
- app/(engineA)/topic-quiz/[topicId].tsx: 6818afbda3112b0701f21643c5c07ad2a25ebba971aaa6fe2ef109f020b09d6f
- app/(engineB)/behavioral-subtopic/[id].tsx: 39642cc48dfe64794d5cd59928ae68dceb3f6c77ebcd361088f6d93b4a414f2c
- app/(engineB)/topic-quiz/[topicId].tsx: c1349a424fc7dadc844b1020d8aeeaa36fe66980b26f30e26f9d47492ad58a2b
- planning/codex-qa-2026-10-06/tests/ad-events-test.cjs: 2556900cf97b53e3f585d39a12edd1f3b9a0f16e23b5dc2f562833d45ebf2698
- planning/codex-qa-2026-10-06/tests/ads-consent-test.cjs: 6af2a777bfa03236845ad8deb4c2f3fc854813bdb189614aa9261d142d652e78
- planning/codex-qa-2026-10-06/tests/interstitial-test.cjs: 0d9fca04452e72931c9b608d030e015db93d146eed02b1ccba8b592da2a77ba3
- planning/codex-qa-2026-10-06/tests/tts-stats-test.cjs: f79e5c52a8db796974c3553bdf902fa3726992125e16f563cf0713c92eb40b55
- planning/codex-qa-2026-10-06/tests/handleback-test.cjs: abc3b76b3bdf452587d29c69b0ce1696c0c8d837a69ee597d04246cbe6e6fc83

## סיכום לבעל האפליקציה

תיקוני הקוד שנבדקו בסבב 5 עברו את הבדיקות.
כל 26 קובצי הבדיקות ובדיקת TypeScript עברו.
נשאר תיקון בנוסח האמהרי של מדיניות הפרטיות: המשפט הישן סותר את ההסבר החדש.
במדידה איטית מאוד ייתכן חוסר בספירת צפיות; זו פשרה של הכלל החדש, ולא האטה של האפליקציה.
אין עדיין אישור בלתי מסויג לפרודקשן: יש לתקן את הנוסח ולהשלים את בדיקות המכשיר והשרת שסוכמו.
לא שונה קוד, לא הורצה מיגרציה ולא פורסם דבר; נכתב רק הדוח הזה.
