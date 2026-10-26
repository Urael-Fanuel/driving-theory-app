# Round 4 — independent QA re-review

**Verdict: NOT APPROVED for production yet.** Most Round 3 defects are fixed and the original reproductions now pass. Four actionable issues remain: an exception can permanently latch the back guard; slow measurements defeat the claimed visibility sampling bound; an invalid clipping frame falls back to counting hidden content; and the revised privacy wording overstates what limited ads mean.

Reviewed 2026-10-26 against CODEX_ROUND4_BRIEF.md and the preceding two reports. The decision to follow Google's canRequestAds semantics is accepted. **Showing an eligible limited ad after refusal is not a defect in this report.** The old “refusal = no Google ads” requirement is retired.

Review/test only. No source edits, SQL, migration, build, live backend write, publication or .env read. Only planning/ad-events/CODEX_ROUND4_REPORT.md is written. File references below are relative to C:/Users/Yakov/Desktop/driving-theory-app.

## Actionable findings

### R4-1 — P2: a failed exit leaves leavingRef true and disables subsequent back attempts

Locations:
- app/(engineA)/behavioral-subtopic/[id].tsx:334–344
- app/(engineB)/behavioral-subtopic/[id].tsx:190–200
- app/(engineA)/topic-quiz/[topicId].tsx:427–436
- app/(engineB)/topic-quiz/[topicId].tsx:147–157

All four handlers set leavingRef before the first await, which fixes overlapping ordinary taps. They clear it only after router.back returns. There is no try/finally or error recovery. If router.back throws, or an earlier uncaught audio-stop operation rejects, the handler rejects with the guard still true. The hardware listener consumes future back presses, but the guarded handler immediately returns.

Independent reproduction: extracted each actual handleBack initializer with the TypeScript AST, executed it with fake audio functions and a router.back that throws, then called it again. All four ended with leavingRef=true and routerCallsAfterTwoAttempts=1. This is a controlled error injection, not a claim that router.back normally throws; the brief explicitly requires this failure case.

Change: make error recovery release the guard reliably and handle the rejected exit promise. Preserve single-flight navigation while leaving successfully; do not allow a second navigation merely because a finally block ran before the screen unmounted. Test router.back throwing and stopAudio rejecting, followed by a successful retry. The current source-string guard checks do not cover this.

### R4-2 — P2: the visibility gap is not bounded to less than 250 ms when measurement is slow

Locations: services/adEvents.ts:154–197; hooks/useSponsorAdTracking.ts:58–70.

The exact previous test with instantaneous measurements and an absence from 600 to 900 ms now passes. However, the next 250 ms delay begins only AFTER the asynchronous measurement finishes. Consequently the sample spacing is measurement latency plus 250 ms, potentially over a second. The hook now measures the parent and then the card, making this distinction relevant. The comment that every absence longer than a quarter-second resets the streak is false.

Independent reproduction with the real tracker, fake clock and each measurement resolving after 300 ms:
- Samples resolve at 550, 1100 and 1650 ms.
- Card is outside the viewport from 600 through 900 ms, a 300 ms absence.
- Actual result: a view at 1650 ms.
- The latest uninterrupted visible period is only 750 ms, so the continuous-second requirement is not met.

This is NOT a re-report of the documented sub-250 ms limitation. It exceeds that limit without using a device or assuming any particular native pixel behavior.

Change: obtain visibility changes from the scroll/list path, or conservatively invalidate a streak when measurement gaps are too large to support the promised sampling bound. A scroll integration can recompute visibility and reset only when eligibility drops; it need not reset every harmless slow scroll. If the owner accepts sampled exposure rather than continuous exposure, explicitly change the metric and document the actual latency-dependent approximation. Increasing poll frequency alone does not close this finding.

### R4-3 — P2: an unusable known clipping frame restores the full window and can count a hidden card

Locations: services/adEvents.ts:144–145; hooks/useSponsorAdTracking.ts:58–75; components/shared/AdClip.tsx:25–33.

The parent-frame intersection correctly closes the original normal-layout A4 reproduction. But clipViewport returns the entire window viewport for null, nonfinite, zero-width or zero-height parent frames. That conflates “no clipping context” with “a known clipping parent is invisible or cannot currently be measured.” A zero-height clipping parent has no visible area; it should not enlarge visibility.

Independent arithmetic reproduction with the real service:
- Window viewport: top=24, bottom=750, left=0, right=400.
- Card: x=10, y=300, width=300, height=120.
- Known parent: x=0, y=100, width=400, height=0.
- Actual visibleShare(card, clipViewport(window,parent)) = 1, although a zero-height parent cannot display it.

A null result from a provided AdClip follows the same fallback. The native case is not claimed as a device observation; the error is the explicit fallback rule. The brief lists that fallback as implemented, but does not waive hidden-card accuracy.

Change: distinguish an absent provider from a present provider whose measurement failed. With a known but unusable/zero-size frame, skip that sample and reset the eligibility interval; retain a window-only fallback only where there genuinely is no clipping ancestor/provider. Add zero-size, failed-frame and recovery tests at hook level, not just a normal intersection test.

### R4-4 — P2: “limited ads use no personal data” is too broad in both policy paragraphs

Locations: docs/privacy-policy.html:172,320; services/adsConsent.ts:15–18; CODEX_ROUND4_BRIEF.md's B1 explanation.

The corrected paragraphs now agree with the intended decision that ads may still be requested after refusal. The remaining problem is the unconditional promise that those ads do not use personal data.

Google's AdMob documentation says limited ads disable personal-data use **for personalization**. It also explicitly says IP addresses are still used to deliver the ad; programmatic limited ads can use fraud-detection storage. Thus no personalization is not equivalent to no personal-data processing. This wording issue does not challenge the owner's choice to allow Google's eligible limited ads. [Google AdMob: Limited ads](https://support.google.com/admob/answer/10105530?hl=en-GB).

Change both local language versions and the service comment to describe no use for ad personalization, while accurately explaining necessary delivery/security processing and linking Google's explanation. Do not promise that any answer always guarantees an ad; continue to gate on the SDK's returned canRequestAds. Have the owner/language reviewer approve the corresponding Amharic wording. I did not edit, publish or approve publication of the policy.

## Previous findings: disposition and evidence

| Previous item | Round 4 result |
|---|---|
| B1 old no-ads-on-refusal rule | Retired per the supplied owner decision. The canRequestAds gate is intended. Separate wording issue R4-4 remains. |
| B2 stale cached readiness / existing ads | Original reproduction fixed: form refresh changes cached readiness and announces it; mounted banners subscribe and change key; prepared interstitials are discarded on changes. |
| B3 native measurement delay | Fixed in local configuration: delayAppMeasurementInit:true is present. No build or independent introspection was run here. |
| C1 overlapping exit calls | Original simultaneous-call and while-showing service cases fixed. Screen guards block overlap, but exception recovery is still defective (R4-1). |
| C2 Android hardware back bypass | Fixed in both topic-quiz screens by focus-scoped handlers using the current handleBack ref. |
| Unloaded-ad navigation wait | Fixed: skipped opportunities do not await consent/preloading; prepareInBackground is fire-and-forget. |
| Failed show consumes due count | Promise rejection / ERROR-before-open paths restore due state; existing targeted tests pass. |
| Native forms/ad overlay registry | Both UMP paths and the interstitial open/close the registry; tests pass. Accepted 90-second limitation remains unchanged. |
| D1 cancelled/replaced TTS counted | Original reproductions fixed; return semantics remain true while success counters omit cancelled owners. Failure counting also checks current ownership after discard. |
| D2 arbitrary version row creation | Sequential row growth bounded by version folding and the cap. Concurrent overshoot remains a documented non-hard-bound qualification, discussed below. |
| TTS authenticated transport | Fixed in this service: plain public-key fetch replaces the shared signed-in Supabase client. Abort and retention tests pass. |
| A2 refusal save/read races | Original in-session reproductions fixed: immediate session answer, post-read recheck and unreadable-file fail-closed behavior. |
| A3 noncontinuous exposure | Instantaneous original case fixed; slow-measurement case remains (R4-2). |
| A4 missing parent clipping | Normal parent-frame case fixed; unusable-frame fallback remains (R4-3). |
| Earlier A1/A5/A6/A7 | No new changes to reopen SQL grouping/quota, late view eligibility or the specified audio-start click behavior were found. |

## Independent executions

The real current modules were transpiled and evaluated in memory. Fake dependencies supplied storage, player, ad SDK, clock and router; no network request, native ad, SQL statement or test-file edit was made. Existing harness setup was reused where appropriate, with additional schedules/error injections.

| Case | Observed result |
|---|---|
| B2 true at launch, then current consent false after privacy form | ensureAdsReady=false; notifications [true,false]; getConsentInfo called |
| C1 two immediate service calls, opens=4 and sinceShown=0 | Same Promise; sinceShown=1; zero ads shown |
| C1 second call while due ad open | Second caller stays pending until CLOSED; one show |
| A2 decline while write held pending | locationSource=none immediately |
| A2 existing file read throws | Real getLocationConsentState returns declined |
| D1 recorded clip stopped at 100 ms of 500 ms | Public result=true, stats=[] |
| D1 new live request replaces old clip at 100 ms | Old/new public results=true; exactly one live count |
| A3 old 600–900 ms absence, instantaneous measurement | No view by 1500 ms |
| A4 card below a valid shorter parent frame | visibleShare=0 |
| R4-1 router error in each actual handler | Guard stuck in all four; second attempt never reaches router |
| R4-2 300 ms measurement + 300 ms absence | Incorrect view at 1650 ms |
| R4-3 zero-height known parent | Incorrect visibleShare=1 |

## Hook, ref, layout and listener review

All seven requested sponsor placements provide AdClip:
- A/B home: new adClipRef attached to the existing FlatList.
- A/B topic-quiz result: adClipRef on the result ScrollView; the question ScrollView retains its separate scrollRef.
- A/B progress: adClipRef on the existing ScrollView.
- Exam result: adClipRef on the existing ScrollView.

The refs are declared with the other hooks before render early returns. No duplicate ref attribute or collision with an existing question-scroll/confetti ref was found. AdClip returns only a context provider with its children, so it adds no native view, padding, size or layout wrapper. Its FlatList path uses getNativeScrollRef; the context's async measurement is consumed by the tracking hook.

The new topic-quiz handleBackRef hooks and focus effects are above the result/loading returns. Each focused hardware subscription invokes the current ref and is removed on blur. Behavioral phase dependency/re-subscription remains correct. Engine A behavioral's older hook-after-missing-content-return issue is pre-existing, as explicitly acknowledged in the brief; it is not reclassified as a Round 4 regression.

SafeBannerAd keeps hooks unconditional, uses an alive guard, removes its readiness subscription on unmount, and remounts the native banner via generation key. Changing from true to true still refreshes the request after a choice change, which matters because canRequestAds can remain true for different choices. Expo Go remains protected from native banner import.

Interstitial single-flight covers both decision and presentation; discarded prepared instances call removeAllListeners. Its readiness subscription is intentionally module-lifetime and installed once. UMP privacy form double-tap uses formOpen, with release in finally. Overlay release also uses finally.

A small additional regression: the readiness subscriber in startInterstitial does not check the launch count before calling prepareInBackground (services/interstitial.ts:121–125). Reproducing a first-launch ready announcement produced opens=1, one prepared interstitial and zero shows. The owner’s first-two-launch **no-show** rule still holds because decide checks opens, so this is not a release blocker; however, the comments/test expectation that no ad is even prepared in launches 1–2 are no longer true. Add the eligibility check or correct that narrower claim/test. A composition test connecting launch readiness to the subscriber would catch it.

## D2 SQL and anonymous transport review

No SQL was executed.

The actual SQL regex is:
    ^[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3} \([0-9]{1,6}\)$

The brief's simplified “d” notation is not what the SQL file contains. The dots and parentheses are escaped and the expression is anchored. Under normal PostgreSQL standard-conforming string behavior it matches the intended version form. Representative pattern checks accepted “1.2.3 (45)” and rejected “1x2x3 (45)”, missing parentheses and trailing junk. These were an auxiliary JavaScript regex check, not certification by a PostgreSQL engine.

Static control-flow assessment:
- Null/range/platform checks remain intact; 200 is per counter, up to 600 total increments per call.
- Invalid version formats fold to other.
- For an unseen valid version at a day/platform row count >=40, the version folds to other.
- Existing version buckets continue to update even after the threshold.
- Sequentially, there are at most 40 named versions plus other (and if other exists early, it participates in the count and may reduce the named-version allowance).
- The count/check has no serialization. Concurrent inserts can all observe 39 and insert distinct versions. With N such transactions, the result can be 39+N, so “a few more” is not a numerical guarantee. Subsequent transactions that see the new count fold to other. This closes the old unbounded sequential version-growth vector but is not a strict 41-row security cap.
- If a hard cap is required, serialize admission per day/platform or use a pre-bounded version allowlist. This is the already disclosed concurrency limitation, not a claimed SQL execution failure.
- Empty search_path, qualified table access, RLS, table revocations, service-role SELECT and explicit function EXECUTE grants remain. No new dynamic SQL or arbitrary data-access primitive was found. Same-definition rerun and live ownership/ACL behavior still require the accepted external DB checks.
- Per-call counter bounds do not rate-limit anonymous requests or prevent diagnostic-number inflation. The endpoint remains diagnostic, not a billing ledger.

The new ttsStats implementation no longer imports the signed-in client. It posts only counters/version/platform with the configured public key as apikey and bearer credential. There is no user access token in this code path. The test harness throws if that signed-in client is imported and verifies the synthetic public-key headers. The abort timer is 10 seconds, cleaned in finally; failed batches are restored for retry. No real key value was read or printed.

The transport fix removes the direct authenticated-subject linkage identified previously. It does not make network IP metadata disappear, and sparse version/platform/day cohorts still should not be described as mathematically impossible to associate with a known tester. The SQL header's absolute anonymity sentence remains stronger than warranted. Received-day grouping, memory-only pending counts and potential duplication after a lost acknowledgement remain diagnostic limitations previously described, not new Round 4 findings.

## Policy consistency

The old sentence promising no Google ad requests after refusal is gone from both adsEurope paragraphs. Their intended serving semantics now match the owner's decision and the renamed/added consent tests. R4-4 is the remaining wording correction; do not restore the retired no-ads rule.

The voice-statistics text saying these counters are not linked to the app's anonymous ID now matches the new unauthenticated-public-key transport and counter table, subject to the network/small-cohort qualifications above. Broader app diagnostic reports and sponsor events are separate paths and may still carry the app ID; this transport change does not anonymize them.

The policy has only been reviewed as a local file. The brief says publication requires the owner's approval; none was sought or performed as part of this review.

## Verification, scope and next step

- node planning/codex-qa-2026-10-06/tests/run-all.cjs: **25/25 test files passed**, exit 0.
- npx --no-install tsc --noEmit --incremental false: **exit 0**, no diagnostics.
- Independent cases above additionally checked the real handlers and asynchronous measurement timings, which the current suite does not exercise.
- No applicable AGENTS.md was found for these paths; the discovered dashboard/AGENTS.md is outside this scope.
- Known/accepted limitations are not new defects here: no native device checks, no executed SQL, best-effort event delivery, and the 90-second safety timeout not dismissing a native ad.
- Fix R4-1 through R4-4, add their targeted tests, and rerun the suite. The previously acknowledged device/DB release checks remain necessary, but they are not the reason these four source-level issues are open.

## Reviewed fingerprints

SHA-256 of the reviewed source/test files; the closing verification checks these are unchanged:

- services/adEvents.ts: 39aa54c67e79973ee0cace765315b1bd3f151799993d7b7c3ae2676f36308d76
- services/adsConsent.ts: 2a752f8c39f37112fe2c35f08e165cee72edb4775a79be7c3009ad9c3fd3cf03
- services/interstitial.ts: 4c579c41c7c410c6af89abd3c36608ac9f9bde7c37defbbb648fe30f3c68196f
- services/ttsStats.ts: 0308dd9ef801f5c393c3c1bbf603a13e5df1e3e2d59a2f0b6ed29272c87d3368
- hooks/useLocationPrompt.ts: f2309df8900eb6fc1ad29bd1c2244d1d0828e80d3f5426f0791ae5be48bb6a6b
- hooks/useSponsorAdTracking.ts: f63f97878ccab4637e35ed46593989b88d988f1624befada9476459e077f2721
- hooks/usePrivacyOptions.ts: 0572f149d5d3c937a06ba29c9e516961b71fa1596f46312c482b42c78d19ddc5
- components/shared/AdClip.tsx: 248a22d1b7f350dfec28a6f1a0f911716ca1690d910631ebdb4a0753e5f86c01
- components/shared/SafeBannerAd.tsx: 1be9dc9d339dffbadf3f53bde0dc64e4042514dd19934e966b5573674c72f446
- backend/migration_tts_stats.sql: 9a66aa76fb6d00502f9a6a99ac032cae1017979663a1ceb393bd8e9f33b075e6
- backend/migration_sponsor_ad_events.sql: ebd27a68079fc820114bce4d370cfb6f4b38c25636e344341214a6c18486b664
- utils/googleTTS.ts: 7435ec86eedc52c9d7a20c6f956bafb387275dc389b46c643fd7bf4393b93ed7
- app.json: f0f8bc98ae707b8cb1329ed362f8c76fe44179e5ef5afc7554974df7643cf7e7
- docs/privacy-policy.html: 6cb55ffc15fd3b0f4816ae1abe5a1f07fc7e2f20e998129b9b271bd82b5e0ef3
- app/(engineA)/(tabs)/home.tsx: 81fe3efd44549c16581fcfe7f8c5a734e323970d6b4b7b45d0a1cabeaae5f155
- app/(engineA)/(tabs)/progress.tsx: df17e7197be9cceb6d3c9199c573c9917e22328c1ec06c32e42115aea0d11eb3
- app/(engineA)/topic-quiz/[topicId].tsx: a88b540c81edbac18ebd6b6ce5cfcea18afe2224f272cf2c33adc10e50d0cf6f
- app/(engineA)/behavioral-subtopic/[id].tsx: 35e0884dd473e7d53678b59f38296fe401ffc5ea5dfa3e8c3655f8eeeb9ecb1c
- app/(engineB)/(tabs)/home.tsx: 3ca662edac6b1bc10af3821b964ad7c9c5abf6df1ce24349c8ff8a385507fd6e
- app/(engineB)/(tabs)/progress.tsx: 5f4a29ec02f1ba5eda3cb6722ff01c9d6a536ca3fc36c1314014f36d16fc7486
- app/(engineB)/topic-quiz/[topicId].tsx: 4b9fb0c74e118e579efdf0bdaadf6950ace6682ac39783fd30cdab347f1ddad7
- app/(engineB)/behavioral-subtopic/[id].tsx: 9200b5a127d7c5b39333a596a429b7d007b70e27d0acd8213880aa0eb6aa9efd
- app/result/[sessionId].tsx: 9f7b65c9ae4708a0f857312917561dcf5a23a3c12484f067b79d03450518411a
- planning/codex-qa-2026-10-06/tests/ad-events-test.cjs: d9ab4e4f864e972df9e4f7bb61e95ec93a321a453bd54bc7896534f7705f5a2d
- planning/codex-qa-2026-10-06/tests/ads-consent-test.cjs: 05aa6bc95ef29442cb8e729fafdc2ebe7577d337c50a7c0994c8f0a13e156c4a
- planning/codex-qa-2026-10-06/tests/interstitial-test.cjs: 0f7a35aa0f616a7198fe4f8787fcafd1b7d4c283d2e08e1dafafb67cda7cf57f
- planning/codex-qa-2026-10-06/tests/recorded-tts-test.cjs: b4e8d2297ae5ba1e4693015d5abab0db1f19e6ffa6c0c9464a21688f85e3ff5d
- planning/codex-qa-2026-10-06/tests/tts-stats-test.cjs: 25146915d8ac039c559458c1ab610eb2a5697479da0fb5b0e6c1876fffe832f0

## סיכום לבעל האפליקציה

רוב התיקונים הצליחו, והשחזורים המקוריים של סירוב למיקום, הקראות וחזרה כפולה כבר עוברים.
הגרסה עדיין דורשת תיקון לפני אישור לפרודקשן.
שגיאה בזמן יציאה עלולה להשאיר את החזרה חסומה.
מדידת צפיות עדיין עלולה לטעות כשהמדידה איטית או כשאזור הגלילה אינו ניתן למדידה.
הצגת פרסומות מוגבלות אחרי סירוב היא תקינה לפי ההחלטה החדשה; צריך לדייק את ההסבר במדיניות.
כל 25 קובצי הבדיקות ובדיקת TypeScript עברו.
לא שונה קוד ולא פורסם דבר; נכתב רק הדוח הזה.
