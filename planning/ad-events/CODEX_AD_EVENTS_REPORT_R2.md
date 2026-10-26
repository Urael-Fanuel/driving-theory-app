# Sponsor ad events — Round 2 independent re-review

**Verdict: NOT APPROVED.** Reviewed 2026-10-25–26 against the Round 2 instructions and the current working files. A1, A5, A6 and the newly specified A7 behavior are addressed; A2, A3 and A4 are only partially addressed. The SQL improvements are substantial, but the location-decline guarantee and visibility definition still have reproducible gaps.

This is part A of CODEX_ROUND3_BRIEF.md. The other new features are reviewed separately in CODEX_ROUND3_REPORT.md. Paths below are relative to C:/Users/Yakov/Desktop/driving-theory-app. No SQL, migration, live API request, build or deployment was executed. Only the two requested reports are written.

## Findings still requiring changes

### A2 — P1: local decline is not authoritative until an asynchronous disk write finishes; read errors fail open

Locations: hooks/useLocationPrompt.ts:87–106,180–199,225–230; services/adEvents.ts:46–53,66–68; backend/migration_sponsor_ad_events.sql:100–106.

The new city_source flag correctly protects an event when getLocationConsentState actually returns declined. The trigger then leaves city NULL even if the server still contains an IP city. The newly clarified boundary for an event whose request left BEFORE refusal is reasonable and is not counted as a defect in this review.

However, the real consent reader differs from the stub in ad-events-test.cjs:

- readPrefs catches file-read/JSON errors and returns an empty object. getLocationConsentState therefore returns unknown, and locationSource returns ip. Its outer catch never sees the error.
- handleNotNow hides the modal first, then asynchronously reads and writes the preference file. Until that save finishes, a new event can read the old consent and send ip AFTER the user has refused. A failed write is swallowed, leaving this state in place. This is a different ordering from the explicitly accepted pre-refusal request.

Independent execution of the real consent hook and event module, with synthetic in-memory storage:
1. Existing preference file whose read throws -> getLocationConsentState = unknown; locationSource = ip.
2. Call the real handleNotNow, hold writeAsStringAsync unresolved, then ask locationSource -> ip.
3. Release the save and drain promises -> none.

These tests use no database. The SQL consequence is direct: an ip event copies users.city or users.ip_city if present. Thus the claim “every event sent after no carries none” is still false.

Change: record refusal synchronously in a shared in-memory consent state before hiding/navigating, persist it with explicit failure handling, and distinguish unavailable/corrupt preferences from a genuinely never-asked user. Event attribution must fail closed when consent cannot be established. Protect pending consent reads with a generation/version so an older read cannot undo a newer refusal. Add integration tests using the real reader, delayed/failed saves, and delayed reads rather than only a mocked declined/throw return.

### A3 — P2: scrolling out and back between polls still joins two noncontinuous exposures

Locations: services/adEvents.ts:139–186; hooks/useSponsorAdTracking.ts:43–76.

The original premature 500 ms credit, missing post-measurement activity check, and focus/AppState reset problems have been fixed. The tracker now starts at the first observation and uses elapsed time. Generation invalidation also rejects a measurement started before a reset.

But the hook subscribes only to focus, AppState, Dimensions and the overlay registry. No scroll/parent-visibility event resets or updates the streak. A card can disappear and return entirely between 500 ms samples.

Independent reproduction with the real tracker:
- First visible observation at 500 ms.
- Card outside the window from 600 through 900 ms.
- Visible again at 1000 and 1500 ms.
- Actual result: one view at 1500 ms, although the latest uninterrupted visible period is only 600 ms.

Change: connect the actual scroll/list visibility signal to eligibility and invalidate stale geometry when visibility drops or scrolling makes it uncertain. A conservative reset on scrolling is preferable to asserting a continuous second from three disconnected snapshots. Add this exact between-sample case. Do not describe this as a regression in the newly fixed AppState handling: it is the remaining geometry/timing part of the previous finding.

### A4 — P2: safe-area/tab-bar subtraction still does not represent the home list's viewport

Locations: hooks/useSponsorAdTracking.ts:39–40,57–60; app/(engineA)/(tabs)/home.tsx:180–233; app/(engineB)/(tabs)/home.tsx:137–204.

The x/width, invalid dimensions, two-axis intersection, tab-bar inset and three registered modal fixes are correct. The outstanding issue is the clipping parent. The Round 2 statement that all existing placements have scroll edges matching the full available screen is not true for the home screens: a header precedes the FlatList, and the AdMob container and bottom action area follow it.

The hook still supplies only the window minus safe areas/tab bar. Example with the real visibleShare:
- Card x=10, y=650, width=300, height=120.
- Hook-style viewport top=24, bottom=750, left=0, right=400 -> 0.833333.
- Actual shorter list viewport top=100, bottom=600 -> 0.

The example establishes the missing geometry input; it is not a claim that Android pixels were observed. Native clipping can affect measurement behavior, so a device check is still necessary, but it cannot be substituted for representing the actual parent viewport in the logic.

Change: intersect the card with its containing scroll/list viewport and relevant ancestors, using measured/list visibility information. Check both home footers under the header, above the bottom controls, after orientation changes and on small screens. The test that manually passes bottom=600 verifies the arithmetic, not that the real hook ever obtains that boundary.

## A1–A7 disposition

| Finding | Result | Evidence / qualification |
|---|---|---|
| A1 SQL GROUP BY ambiguity | Closed by static review | Full UTC date and COALESCE(e.city,'unknown') expressions replace ambiguous aliases. No database execution certification. |
| A2 city after refusal | Partially fixed, open | city_source solves pending server wipe only after local state is correctly read; actual reader/save races above remain. |
| A3 continuous foreground exposure | Partially fixed, open | Real elapsed time, post-await check and lifecycle resets fixed; between-poll scroll interruption remains. |
| A4 false visibility | Partially fixed, open | Invalid size/horizontal clipping and registered modals fixed; actual list clipping still omitted. |
| A5 timestamp/quota/grants | Closed by static review | Server timestamp, identity check, restricted columns, per-user transaction advisory lock before count, hardened search_path. Requires isolated DB verification. |
| A6 ten-minute expiry | Closed | Give-up removed; targeted late-view test passes. Mounted unseen cards remain eligible. |
| A7 banner audio tap | Closed for the Round 2 specification | Start logs one click; views:false prevents a second view tracker. Stop/resume are intentionally excluded in Round 2. |

A7 metric qualification: the initial brief says “any tap,” whereas Round 2 expressly narrows the wrapper's audio metric to starts. The current code follows that Round 2 instruction. Keep the sponsor-facing definition consistent: it is not literally every interaction with the wrapper audio button. Native nested-touch dispatch still needs a device check; source matching alone cannot prove one physical tap produces exactly one event.

## SQL and integration re-check

- BEGIN/COMMIT, schema-qualified relations and empty search_path address the earlier hardening comments.
- The authenticated role gets INSERT only on the five supplied columns. Defaults supply id/user_id/time, and the BEFORE trigger checks identity before privileged lookups. Anonymous authenticated Supabase sessions are distinct from unauthenticated requests using only the public key.
- The sender inserts without select/returning. A write-only table is compatible with PostgREST's minimal-return path; do not add .select() without revisiting grants. This is a static/client-path conclusion, not a live PostgREST test. [PostgREST return preferences](https://docs.postgrest.org/en/stable/references/api/preferences.html).
- The timestamp cannot be supplied through the allowed client columns and is also overwritten in the trigger. The transaction advisory lock serializes the same user's quota checks under the intended normal request isolation. This does not make events fraud-proof or prevent abuse through multiple accounts.
- No new reason was found to grant clients direct EXECUTE on the trigger function. A migration-role trigger creation and actual authenticated insert should be tested together in an isolated DB.
- Table/view revocations include PUBLIC, anon and authenticated; the summary view explicitly grants service_role SELECT. Normal app clients must not read/update/delete the event history.
- ON DELETE RESTRICT preserves sponsor history; deactivate sponsors instead of deleting them. Retention and user-deletion handling still need an actual owner policy and implementation; a comment that rows persist is not a retention mechanism.
- IF NOT EXISTS supports a same-definition rerun, not an upgrade from the old table: it will not add city_source or replace an already-existing CASCADE foreign key. The brief says neither version was applied, so this is a deployment prerequisite rather than a newly blocking defect.
- The imported BottomTabBarHeightContext exists in the installed expo-router/build/react-navigation/bottom-tabs/index.js, and TabsClient imports that same navigator implementation. The deep import is compatible with the installed version, but should be rechecked on upgrades.
- The new modal hooks run unconditionally. AdCard/SponsorAdBanner hook placement is valid. The event -> location hook -> backend/api import path did not reveal a return dependency to the tracker/event module in the reviewed import graph.
- A view remains best-effort: failed/offline inserts are not queued, and the view is already marked seen. This is the agreed behavior, not exhaustive billing-grade delivery.
- Screen identity is fixed at mount using route segments, avoiding concrete result-session IDs. Engine attribution is refreshed. Stopping a tracker prevents late emission; an in-flight measurement's bounded timeout can remain for up to one second after unmount, but does not emit.
- New native UMP/interstitial surfaces are not registered in the sponsor overlay registry. Verify actual focus/AppState behavior under these surfaces and explicitly cover them if the underlying screen remains active. Do not assume the three existing React modals cover every native overlay. Round 3 describes the related consent work.

## Verification and remaining release checks

- Full suite rerun on 2026-10-26: **25/25 test files passed** (the total grew with Round 3).
- npx --no-install tsc --noEmit --incremental false: **exit 0**, no diagnostics.
- The ad-events suite includes 19 scenarios. Its real-tracker tests support the closed timing/expiry cases; its mocked consent getter hides A2's real file-reader behavior.
- Independent in-memory executions reproduced A2, A3 and A4 as detailed above. No test files were changed.
- No Android/iOS device, native modal/gesture test, live AdMob account or database was used. Database syntax, ACLs, fresh/rerun behavior, return=minimal insert and concurrent quota checks remain implementer-run integration gates.
- Before sponsor reporting: fix the open items and validate both engines' home clipping, scrolling, modal coverage and single-tap dispatch.
- The previous report's pseudonymous user-id/city disclosure still applies. city_source and route templates do not make the stored user_id anonymous.


## Reviewed source fingerprints

SHA-256 fingerprints of the reviewed working files (no claim of a clean Git tree):

- services/adEvents.ts: c11751f4284a07caa3f54c3dce1bf25e85ac56742d3e6b0dc3af0036f94ad562
- hooks/useSponsorAdTracking.ts: f1a5b345965e081d38057e1095cbf32bd2d3bd5d6112a1c213a2acf98a2933c1
- hooks/useLocationPrompt.ts: 2e8f4f880a47d6a7b20e48afa45dfbe6d80f7114bb1bd49891f22f843c0059a8
- components/shared/AdCard.tsx: c11150b9c22c696e00eb152afb6180faf3b7878209c606488ed97e607045cdad
- components/shared/SponsorAdBanner.tsx: 7b8ea2875ff6c32743c547a7b49b2537652d73c17b1da30651cb94100874b57b
- backend/migration_sponsor_ad_events.sql: ebd27a68079fc820114bce4d370cfb6f4b38c25636e344341214a6c18486b664
- services/adsConsent.ts: f85a79d42538b4a5a53521bf05ad5ee672bcacd20b72ff412866bb876f25a771
- services/interstitial.ts: e1f5cb5ec0540c99935594dc57cccf7a11068790236663441fe44eb2e20ef605
- services/ttsStats.ts: 0164e374bbda506fdeee4708ea51e85ce8d2d6f0d91033a6d454d15767e43d23
- backend/migration_tts_stats.sql: fe805999adae7398048c38c4747cdc60b7b7b23c2159d4a22937bcf200f22ad7
- hooks/usePrivacyOptions.ts: 0572f149d5d3c937a06ba29c9e516961b71fa1596f46312c482b42c78d19ddc5
- components/shared/SafeBannerAd.tsx: bda65cfd7062a5fe033dc714a020c90e8caa18638bb4196b9394cc5b45b39c82
- utils/googleTTS.ts: 20c0fe7e7a1ff9f99a682a149e0494e9521990baf58ef081b58a188d53b230c1
- app.json: 261a58de2a6675e0e5230603618a30004db91198a78174458f59362ddc00e704
- app/_layout.tsx: ad70eefcb08745cd864a2eca414f02c12221bdaff35cce4d9e8d714ffdd550f5
- app/(engineA)/(tabs)/progress.tsx: 9687e0bb769804940a1140f865cc5df35728bda6f3ad932bc2e0404d5b8885a1
- app/(engineB)/(tabs)/progress.tsx: 812671bb97fa75932b1be67e61dabdeb4b64ea464f2c0047a21cada588e96491
- app/(engineA)/(tabs)/home.tsx: 2d28980606086b0939a912f77a047fdfdfd1aa30f29d64d65212d7f346874874
- app/(engineB)/(tabs)/home.tsx: 49b02259c9f93b8d1e1fb23631cfaaa2285aa43416a44b1053998fd8e5cf4367
- app/(engineA)/topic-quiz/[topicId].tsx: 35df85c5ea2ae193167c6c793af09f6bbd79386fb54068a85862533ff1474f08
- app/(engineB)/topic-quiz/[topicId].tsx: 8d43c93745630552b00090315eb89abed63fb41a631550eb3285b30e40e59ccb
- app/(engineA)/behavioral-subtopic/[id].tsx: 5729685ee91dc0787d3115f795ed8ebc9a2ec0a04a49208546d8f4f58250a8f5
- app/(engineB)/behavioral-subtopic/[id].tsx: 5fec74aa758f6b1648d3e7734c4c673adbe0213439961fbeaf089e4f2aba2979
- planning/ad-events/CODEX_ROUND3_BRIEF.md: 96e9bc13b7be58fedc5f29e8b948ec78b78b4bad83f0fee4f14da3535a28a9d4
- planning/ad-events/CODEX_AD_EVENTS_BRIEF.md: 67637e84ece9313699fc5f732a4ccd6b80c79317d9c7d14e10bae9e1cd03d6c1
- planning/codex-qa-2026-10-06/tests/ad-events-test.cjs: 05798dbaf88cc284ab4f68d50c06fcbfda1b58aeadd39246bc999a830077ac3d
- planning/codex-qa-2026-10-06/tests/ads-consent-test.cjs: d6b226bab571e4324b9be20adc5c8a2fe25aa97eb37c72b3a0ff36cf805c0949
- planning/codex-qa-2026-10-06/tests/interstitial-test.cjs: c2120a61e0e620f6ace1fb45f6f5ef5d33856aafff1f783da6775d700033e07f
- planning/codex-qa-2026-10-06/tests/tts-stats-test.cjs: ee1f1e9743f0e164c6690e1194dd1351c0be407526d086786a3c972c31e98420
- planning/codex-qa-2026-10-06/tests/recorded-tts-test.cjs: b1a0181b6a71e748d679f1a0e2abee08196df791172a173852017362980f7c4c

## סיכום לבעל האפליקציה

הבדיקה החוזרת הושלמה, אך המימוש עדיין אינו מאושר להפעלה.
תוקנו השאילתה, הגבלת הקצב, ספירת צפיות מאוחרות וכפתור השמע.
סירוב למיקום עדיין עלול שלא להישמר בזמן או להיקרא כראוי.
צפיות עדיין עלולות להיספר אחרי חשיפה לא רצופה או כשהכרטיס חתוך באזור הגלילה.
כל 25 קובצי הבדיקות ובדיקת TypeScript עברו, אך השחזורים הנוספים חשפו את הפערים.
לא שונה קוד ולא הופעלה מיגרציה; נכתבו רק הדוחות שהתבקשו.
