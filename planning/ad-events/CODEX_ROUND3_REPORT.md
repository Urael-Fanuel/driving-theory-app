# Round 3 — independent QA of consent, interstitials and TTS counters

**Verdict: NOT APPROVED for production in this state.**

Reviewed 2026-10-25–26 against CODEX_ROUND3_BRIEF.md. The separate CODEX_AD_EVENTS_REPORT_R2.md covers part A. Parts B–F are covered here. All **25 test files pass** and TypeScript reports no errors, but independent executions and installed-library review expose defects the current tests miss.

No code, test, configuration or database was edited. No migration, SQL statement, build, deployment or live ad/API request was executed. Only the two named reports are written. Paths/line numbers are relative to C:/Users/Yakov/Desktop/driving-theory-app.

## Findings, ordered by impact

### B1 — P1: canRequestAds does not implement the promised “refuse = no ads” rule

Locations: services/adsConsent.ts:24–40; planning/codex-qa-2026-10-06/tests/ads-consent-test.cjs scenario 2; installed react-native-google-mobile-ads/src/AdsConsent.ts:89–96 and android/src/main/java/io/invertase/googlemobileads/ReactNativeGoogleMobileAdsConsentModule.java:73–83.

The installed package is 17.2.0. Its gatherConsent requests an information update and then loads/shows the form if required. The Android bridge returns the SDK's canRequestAds value unchanged. The application's only policy gate is that boolean.

Google documents canRequestAds as true for NOT_REQUIRED or OBTAINED after the update request. OBTAINED describes collection of a response, not necessarily acceptance of advertising purposes. A completed refusal can therefore still permit an SDK ad request, potentially for a restricted serving mode. The library also exposes actual purpose/user choices separately. This is a mismatch with the brief's explicit stronger product rule, not a claim that any SDK-permitted limited ad is inherently unlawful. [Google UMP reference](https://developers.google.com/admob/android/reference/privacy/com/google/android/ump/ConsentInformation), [library consent documentation](https://docs.page/invertase/react-native-google-mobile-ads/european-user-consent).

The test named “the user said no” supplies canRequestAds:false. It proves the false branch, not actual UMP refusal semantics. With a completed refusal represented by canRequestAds:true, the real service permits initialization and both ad paths.

Change: separate Google's request eligibility from the owner's no-ads-after-refusal policy. Derive and document that policy from the actual UMP choices in applicable regions, fail closed when required choice information cannot be read, and keep outside-region behavior explicit. Do not use personalization alone as a substitute for permission to show any ad. Add realistic OBTAINED/refusal tests and an EEA debug-device test.

### B2 — P1: changing privacy choices leaves the cached grant and existing ads unchanged

Locations: services/adsConsent.ts:21,45–50,72–77; components/shared/SafeBannerAd.tsx:32–38; hooks/usePrivacyOptions.ts:13–19; services/interstitial.ts:120–158.

openPrivacyOptions discards the form's result and never refreshes/invalidate started. ensureAdsReady then returns the launch promise indefinitely. SafeBannerAd reads readiness once on mount; the interstitial service also retains a preloaded ad and does not recheck current consent before the loaded-ad show branch.

Independent execution of the actual adsConsent module:
1. Launch with canRequestAds:true -> SDK initialized once.
2. Make the mocked current consent info false and open the privacy form.
3. ensureAdsReady still returns true; call counts are gather=1, info=0, init=1, form=1.

This synthetic test demonstrates missing state propagation; it does not pretend UMP always flips canRequestAds on refusal. B1 explains why actual user choices must also participate. The reverse transition is stale too: a previously cached false result does not become true after the form.

Change: publish a current consent/policy state and generation after each successful form/update. Mounted banners must subscribe, unmount on withdrawal and recreate with current choices. Discard old preloaded interstitials, gate every load/show with current eligibility, and coordinate an in-flight load with the consent generation. Add change-to-refusal and change-to-approval tests across already mounted screens and already loaded ads.

### B3 — P1: the native app-measurement delay is not configured

Locations: app.json:40–48,97–99; installed react-native-google-mobile-ads/plugin/src/index.ts:102–110,156–159.

JavaScript gates SDK initialize and BannerAd mounting, but app.json does not set the Google Mobile Ads plugin's delayAppMeasurementInit. No app.config override was found. The installed plugin omits the Android DELAY_APP_MEASUREMENT_INIT metadata when this option is undefined and defaults the iOS setting to false.

The library documents that default native app measurement may start at application startup and recommends delaying it until the first ad request after consent. Thus the JavaScript gate alone is insufficient to claim that all ad-related measurement waits for the decision. This is native measurement, not evidence of an early BannerAd request. [Library consent setup](https://docs.page/invertase/react-native-google-mobile-ads/european-user-consent).

Change: configure delayAppMeasurementInit:true in the actual Expo plugin configuration and verify the generated manifest/Info.plist and device startup traffic in the implementer's normal build process. This review did not generate a build or inspect a resulting APK.

### C1 — P2: concurrent/repeated exits count twice and can navigate while an ad is open

Locations: services/interstitial.ts:120–158; the four handleBack functions at engineA behavioral-subtopic:333, engineB behavioral-subtopic:189, engineA topic-quiz:423 and engineB topic-quiz:143.

showing is checked before an asynchronous queue operation, but is set only later, after a show decision. The queue protects individual counter reads/writes; it does not make one screen exit a single operation. None of the four handlers locks its whole exit sequence before awaiting audio stops.

Independent execution of the real interstitial service with the existing harness:
- Starting from opens=3/sinceShown=0, call startInterstitial (opens becomes 4), then invoke maybeShowInterstitial twice without awaiting the first. Result: one ad shown at that first physical end-point opportunity, and sinceShown reset to 0. Two calls consumed the two-end-point quota.
- Starting due, open an ad and invoke a second exit while it is open. The second call returns immediately because showing is true. A caller that navigates after awaiting it navigates before CLOSED; when the first finishes it navigates again. Observed navigation counters in a caller-equivalent wrapper: 1 before close, 2 after close.

The existing scenario 8 calls again only after the first ad is already showing and checks ad count/disk writes; it does not check caller navigation and misses the pre-show race.

Change: make exit handling single-flight at the screen level before the first await, and make the service serialize/deduplicate the complete decision/show lifecycle. Repeated input must not trigger another navigation or increment another end point. Test truly simultaneous calls, quick UI/hardware-back combinations, and repeated back during an open ad.

### C2 — P2: Android hardware back bypasses the topic-quiz end-point policy in both engines

Locations: app/(engineA)/topic-quiz/[topicId].tsx:423–429,543–551; app/(engineB)/topic-quiz/[topicId].tsx:143–150,260–279; compare the behavioral BackHandler subscriptions at engineA:343–349 and engineB:204–211.

The two behavioral screens route Android hardware back through handleBack. Neither topic-quiz screen imports or registers BackHandler, nor was another topic-quiz removal handler found. Their displayed result-back buttons use handleBack, but the navigator's default hardware back does not. A result exited through hardware back therefore does not increment the end-point counter or show an otherwise due ad.

Change: route eligible result exits through one deduplicated exit path for both engines. Keep mid-question/wrong-answer exits and the explicit exam action ad-free. Cover navigator/gesture exits supported by the app as well as Android back; do not indiscriminately block or advertise every route removal.

The result retry buttons call restart directly. The brief anchors interstitials to leaving via handleBack; this report does not demand an ad when restarting inside the same route. Document this distinction explicitly. Exam navigation intentionally bypasses ads and must stay that way.

### D1 — P2: an interrupted or superseded clip is counted as successfully played

Locations: utils/googleTTS.ts:311–316,330–331,462–479.

_playTtsUri deliberately maps a stop during playback to done to preserve the older sequence-control behavior. The new counters reuse that result as evidence that playback completed, even though the brief expressly excludes stopped/cancelled/replaced clips.

Independent executions using the real googleTTS and audioCache together, with fake files/player/clock:
- Start a 500 ms recorded clip; stopTTS at 100 ms -> speakAndAwait returns true and stats contains recorded.
- Start a live clip; replace it with another request at 100 ms; let the second finish -> stats contains live, live. The replaced clip is counted too.

Scenario T1 checks ordinary recorded/live/failure paths and a request cancelled before it is heard, not a stop during playback.

Change: retain a distinct completion outcome for diagnostics. Do not change the public playback/sequence semantics blindly: callers may depend on cancellation unblocking the sequence. Count only actual qualifying completion; a replaced owner must not increment success. Recheck ownership after asynchronous discard/failure handling before recording a failure as well. Add mid-play stop, replacement, cancellation during discard and normal completion tests.

### D2 — P2: anonymous callers can create unlimited distinct rows, not merely inflate three counters

Locations: backend/migration_tts_stats.sql:35,48–74.

The RPC is callable by anon and authenticated. Its app_version argument is arbitrary text of length 1–40 and is part of the primary key. An attacker can vary that value on every call, with any valid platform and a counter of 1, and create a new row each time. There is no request quota or bound on version cardinality. The 200 check limits each counter increment, not row creation or request rate.

This is static analysis; no SQL or attack request was run. The function contains no dynamic SQL, and no route to arbitrary table reads/updates was found. Nevertheless, “it cannot do more than inflate the numbers” is too strong: it also permits unbounded table/index growth and database work using the public app key.

Change: validate against a bounded set of supported version buckets (or map unknown versions to a single bucket), and add an enforceable ingestion/request budget. Monitor and retain these diagnostics for a defined period. Note that the current maximum is 200 per kind, up to 600 total increments per call, not 200 total. Decide whether that matches the intended limit.

## Coverage of all requested areas

### B. Consent and privacy-options UI

- Whole application-source search found one raw BannerAd wrapper, one SDK initialize call (adsConsent), and one interstitial creation path. No extra rewarded/app-open/interstitial request path or old raw banner mount was found. The current JS paths await ensureAdsReady before initial loading; B1–B3 qualify what that guarantees.
- Successful consent gathering is deduplicated for a launch. On an error, stored info is consulted; a false fallback clears started so a later call can retry. A screen already mounted with ready=false does not subscribe to later success. Add a retry/subscription strategy without opening a consent form unexpectedly during learning.
- SafeBannerAd calls hooks before returning null, uses an alive guard on async completion, and avoids importing the native ad module in Expo Go. No new hook-order defect was found there.
- privacyOptionsRequired compares Google's status to REQUIRED rather than hardcoding geography. It can return true even when ad readiness is false, as required. The progress hook is unconditional and guards unmount. Errors return false.
- A transient status-read failure currently leaves the button hidden for that mount, because the effect runs once. Refresh on focus/current consent changes, especially after recovering from an offline launch.
- Form-opening errors are caught and leave the screen usable. They are silently swallowed, so the user receives no retry explanation; this is a usability follow-up, not a crash. Consider a small failure indication and prevent duplicate form openings.
- Comparing both Progress files to commit a3d7439 found only the new imports, hook call, conditional privacy button and its styles. Existing sections were not removed/reordered. The extra button naturally consumes space when required. Empty Amharic wording/icon-only behavior is intentional and is NOT reported as a defect.
- The published AdMob message, country coverage, English-only form and console frequency settings were supplied in the brief, not independently inspected.

### C. Interstitial lifecycle, audio and policy

| Area | Assessment |
|---|---|
| First two launches | decide rejects them and does not count end points; start is deduplicated in memory. Tests pass. |
| Every second eligible end point | Correct for serial, distinct exits; C1 breaks duplicate-call behavior. |
| Unloaded ad | Remains due; no automatic show when loading later finishes. Failed load is retried on a later opportunity. |
| Mid-lesson / wrong answer | Explicit phase guards skip interstitials. No direct interstitial call found on exam/practice paths. |
| Both engines | Same service, threshold and four phase guards. Behavioral hardware back covered; topic-quiz hardware back missing in both. |
| Audio before ordinary endpoint show | Handlers await stopTTS; quiz handlers stop useAudio, Engine A cancels recognition, Engine B clears its read-aloud sequence ref. Behavioral A stops its narration sound and cancels recognition. |
| Phase dependencies | Behavioral handleBack includes phase; its focused BackHandler effect re-subscribes and removes the old subscription. No stale phase closure found in that path. |
| CLOSE / ERROR / show rejection | Resolve the caller and clear the show timer/listeners; covered by tests. |
| 90-second release | Resolves navigation, but does not dismiss a native ad. This is a recovery timeout, not proof that the ad is closed. |
| Background while open | Service has no AppState/foreground guard. JS timeout delivery may be delayed while suspended; on resume it can release the screen while the native presentation still exists. Requires device validation and a presentation lock separate from the caller timeout. |
| Preferences | Serial queue avoids lost ordinary writes; invalid JSON/non-finite/negative counts reset/clamp conservatively. Write failures are swallowed, so durable pacing is best effort under storage failure. |

Additional limitations:
- “An unloaded ad never makes the learner wait” is not completely enforced: the no-show path can await ensureAdsReady when ad is null. That promise includes consent gathering/SDK initialization and has no application deadline. Make background preparation fire-and-forget after deciding to skip; do not put a new consent UI/network wait in the navigation path.
- Loaded ads are not invalidated by privacy changes (B2), and no foreground check exists just before show. A show failure consumes the current due count because it was reset before presentation; decide explicitly whether failed presentation should remain due.
- The timeout removes the temporary close/error listeners and clears the module reference; it does not cancel the SDK's native presentation. Do not preload/show another ad until actual presentation state is resolved.
- SDK load listeners are not disposed when instances are discarded. Review cleanup with the installed SDK and repeated loads/errors; no native leak measurement was performed.
- Engine A behavioral hooks below its missing-content early return already existed in a3d7439. That is a pre-existing conditional-hook concern if the route's content validity changes, not a regression caused by adding phase/interstitial.
- No console-side frequency setting can be certified from local code. The client passes the correct interstitial unit ID and does not bypass the SDK to force an ad. The owner's rule must still be enforced by the app.

### D. SQL security, counter accuracy and privacy

The table has only UTC day, app_version, platform and three BIGINT counters. It has no user/device/text/location field. RLS is enabled, direct table grants are revoked from PUBLIC/anon/authenticated, and only service_role is explicitly granted SELECT. The definer RPC has an empty search_path and a qualified target table, validates nulls/platform/length/ranges, performs an atomic upsert and returns no row. PUBLIC EXECUTE is revoked, with anon/authenticated allowed. Static review found no SQL injection or generic data-read primitive. These conclusions assume the normal privileged migration owner and intended ACLs; no live roles/schema were inspected. Fresh installation/rerun and role tests are still required before application.

Operational qualifications:
- Counter sends are not awaited by playback. flush serialization and subtract/restore protect ordinary concurrent sends and failures; unknown platforms send nothing.
- Counts are memory-only: app termination loses unsent totals. A timeout after the server commits can cause retry duplication because no batch idempotency key exists. An RPC that never settles holds the local flushing guard. These are diagnostics, not billing evidence.
- Day is the server's day at flush time, not the event's day. Counts held overnight/offline can land in the next UTC day. Label them as received-day totals or preserve occurrence-day buckets if that distinction matters.
- recorded_failed is emitted for a downloaded/cached recording that fails playback; it is not a complete count of absent recordings, download failures and deadline fallbacks. live also includes intentionally live-only text. Do not interpret the three totals as an exact recording-cache hit percentage.
- Counter-only TABLE storage is not the same as anonymous transport. This uses the shared authenticated Supabase client. The installed supabase-js fetch wrapper attaches the current access token as Authorization when present. A request can therefore be associated with the authenticated subject by the backend even though the RPC omits user_id and the aggregate table does not store it. Network infrastructure also observes the request's IP; actual log retention was not inspected.
- Small version/platform/day cohorts may correspond to one known tester/user. A table row does not directly name a person, but “nothing can be tied to a person” is not a defensible unconditional claim. Aggregate/suppress very small cohorts before sharing; avoid unnecessary fine-grained version segmentation.

For Google Play, review App activity/App interactions and App info and performance/Diagnostics for these usage/failure counters, with Analytics as the purpose. Do not claim an anonymized-data exemption merely because the final table omits IDs; account for authenticated transport and any logging. The existing user-ID and advertising/location flows still require their own accurate disclosures. The privacy policy should explain background usage diagnostics, version/platform grouping, service providers, retention/deletion and advertising-choice handling. Existing declarations may already cover some categories; the current Play form was not inspected, so exact checkbox deltas cannot be certified. No audio recording, sentence text or coordinates are added by this RPC. [Google Play Data safety guidance](https://support.google.com/googleplay/android-developer/answer/10787469?hl=en).

### E. Per-screen unit IDs

Source search confirmed the requested grouping and no remaining old …/6072135007 ID in application source:

| Placement | Production suffix | Screens |
|---|---|---|
| Home | 5981036016 | A + B |
| Progress | 3110707977 | A + B |
| Lessons | 5845304640 | topic and behavioral, A + B |
| Quiz/results | 2049529867 | topic-quiz A + B, app/result/[sessionId].tsx |
| Interstitial | 8327375631 | shared endpoint service |

Development/test-ID branches remain separate. This verifies code strings and placement, not ownership/configuration/serving in the AdMob console.

## F. Verification and why the suite did not catch these issues

Final captured run on 2026-10-26:
- node planning/codex-qa-2026-10-06/tests/run-all.cjs: **25 of 25 test files passed**, exit 0.
- npx --no-install tsc --noEmit --incremental false: **exit 0**, no diagnostics. Incremental output disabled to avoid a build-info write.
- Consent tests contain 12 scenarios, interstitial 14, stats 8; the early “8 consent scenarios” description predates the privacy-options additions.
- Independent executions used the REAL current TypeScript modules, transpiled in memory, with fake SDK/player/filesystem/clock. Reused harness setup was separated from its existing scenario runner; additional schedules/assertions were chosen independently. No external network or filesystem mutations were made by these reproductions.

| Independent case | Observed result |
|---|---|
| Change privacy result after launch | readiness stays true; no info refresh |
| Two simultaneous eligible exit calls, initial sinceShown=0 | ad displayed after both count; first endpoint can trigger an ad |
| Repeated exit while presentation remains open | caller navigates before close, then again after close |
| Recorded clip stopped at 100/500 ms | recorded success incremented |
| Live clip replaced at 100 ms | both old and new requests increment live |

Existing tests mock refusal as false, test concurrency only after showing is established, inspect route wiring by strings, and do not stop playback midway in T1. Add the cases above and device-level route/consent tests. TypeScript cannot validate UMP semantics, touch/navigation order or SQL ACLs.

Before release: fix B1–B3, C1–C2, D1–D2 and the open part-A items; rerun targeted tests; have the implementer validate SQL in an isolated environment and UMP/refusal/change-of-choice, hardware/gesture back, audio, foreground/background, timeout and clipping on real Android. This is a review conclusion, not authorization to run those mutations in this review.


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

הבדיקה הושלמה; הגרסה הזאת עדיין אינה מוכנה להעלאה לפרודקשן.
סירוב לפרסומות ושינוי הבחירה בהמשך אינם מטופלים לפי הכלל שסוכם.
לחיצות חזרה מהירות עלולות להציג פרסומת מוקדם מדי ולגרום לניווט כפול.
כפתור החזרה של אנדרואיד עוקף את הספירה במסכי תוצאות של שאלון נושא.
מונה ההקראות סופר גם קטעים שנעצרו; נדרשת גם הגנה מפני יצירת רשומות אבחון ללא הגבלה.
כל 25 קובצי הבדיקות ובדיקת TypeScript עברו, אך אינם מכסים את התקלות ששוחזרו.
מזהי הפרסומות והוספת כפתור הפרטיות למסכי ההתקדמות נבדקו ונמצאו תואמים לבקשה.
נכתבו רק שני דוחות; לא שונה קוד, לא הופעלה מיגרציה ולא פורסם דבר.
