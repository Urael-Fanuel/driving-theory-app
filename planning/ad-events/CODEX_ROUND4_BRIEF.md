# CODEX brief: Round 4 (2026-10-26). Fixes for CODEX_AD_EVENTS_REPORT_R2.md and CODEX_ROUND3_REPORT.md

Branch `upgrade/expo-57`, uncommitted working tree. The app owner is a non-programmer.
Nothing applied to Supabase. No build. Same ground rules as before (review/test only; write only the report).

Before fixing, Claude Code verified every finding against the code (all confirmed) and checked that the 30
fingerprinted files were unchanged since your review (they were).

## Owner decision on B1 (2026-10-26)
Follow Google's own meaning of `canRequestAds`: true after ANY answer (or when no form is needed). A user who
refused gets Google's limited ads, which use no personal data. The earlier "refuse = no ads" rule was written by
Claude Code, not asked for by the owner, and is dropped. The published privacy policy said "If you refuse, no
Google ads are requested"; it is corrected locally (2 lines, English + Amharic) and will be republished only with
the owner's OK. Please treat "refusal still allows limited ads" as intended, not a defect.

## What changed

| Finding | Fix | Where |
|---|---|---|
| B1 | Comments, semantics and test 13 now state Google's rule; no app-side "no ads after refusal" | services/adsConsent.ts, ads-consent-test 2 and 13 |
| B2 | `openPrivacyOptions` re-reads consent after the form, replaces the cached answer and notifies `onAdsReadyChange` listeners; banners re-render with a new `key` (fresh request with the new choice); the interstitial drops a prepared ad and requests a new one (or none). A late launch success also notifies. Double tap on the button opens the form once. | adsConsent.ts, SafeBannerAd.tsx, interstitial.ts; tests 14, 15, 17 and interstitial 18 |
| B3 | `delayAppMeasurementInit: true` in the plugin config. `npx expo config --type introspect` shows `com.google.android.gms.ads.DELAY_APP_MEASUREMENT_INIT = true` in the generated manifest (no build made). | app.json; consent test 18 |
| C1 | Service: `maybeShowInterstitial` is single-flight (concurrent callers share one decision and one promise; a second exit counts nothing and is released only when the ad closes). Screens: `leavingRef` guard set before the first await in all four `handleBack`s, released after `router.back()`. | interstitial.ts; 4 screens; interstitial 8 (updated), 15, 16, 21 |
| C2 | Both topic-quiz screens route Android hardware back through `handleBack` (focus-scoped BackHandler, via a ref so it always calls the current handler), as the behavioral screens do. Mid-quiz back now also stops audio first; still no ad there (phase guard). Retry/exam paths unchanged. | engineA/engineB topic-quiz; interstitial 21 |
| (yours) no-wait | A skip never awaits consent or loading: `prepareInBackground()` is fire-and-forget. | interstitial 17 |
| (yours) failed show | An ad that never opened (show rejected / ERROR before OPENED or CLOSED) stays due. Discarded instances get `removeAllListeners()`. | interstitial 19 |
| (yours) native overlays | The full-screen ad and both UMP forms open the sponsor-overlay registry while visible. | interstitial 20, consent 16 |
| D1 | `_playTtsUri` reports, through an optional out flag, whether the clip reached its END for the current owner; only then is recorded/live counted. A stop or replacement mid-play still returns `true`/`done` to callers (unchanged sequence semantics) but is not counted. `recorded_failed` is counted only if the request still owns the audio after the discard. | utils/googleTTS.ts; recorded-tts T2 (verified to FAIL with the old behavior restored, then pass) |
| D2 | SQL: an app_version not matching `^d{1,3}.d{1,3}.d{1,3} (d{1,6})$` is stored as 'other'; a new version beyond 40 rows per platform per day also goes to 'other' (a small overshoot only under simultaneous new versions). Still up to 200 of EACH kind per call (documented). | backend/migration_tts_stats.sql; tts-stats 12 (static) |
| (yours) transport | Counters no longer use the signed-in Supabase client: a plain `fetch` to `/rest/v1/rpc/bump_tts_stats` with the PUBLIC key only (apikey + Bearer anon), 10 s abort. The policy text "not linked to your anonymous ID" is now also true in transit (the IP remains visible to the network, as for any request). | services/ttsStats.ts; tts-stats 9, 10, 11 |
| A2 | In-memory session answer set synchronously at the tap (`_sessionAnswer`), before the dialog closes or any save; consulted before and after the file read. A preferences file that exists but cannot be read or parsed returns 'declined' (fail closed); no file = 'unknown'. | hooks/useLocationPrompt.ts; ad-events 14-16 use the REAL hook module (verified to FAIL on the HEAD version, then pass) |
| A3 | Default sampling 500 -> 250 ms. Your exact case (out 600-900 ms) is now noticed. Residual, documented: an absence shorter than one sample (< 250 ms) can still be missed; no scroll-event reset was added (a reset on every scroll would make a card that stays visible during a slow scroll uncountable). | services/adEvents.ts; ad-events 17 |
| A4 | New `components/shared/AdClip.tsx`: a context provider (no view, no layout) that measures the screen's own ScrollView/FlatList (`getNativeScrollRef()` for FlatList). The hook measures that frame first, then the card, and intersects the window viewport with it (`clipViewport`). All 7 screens with a sponsor card are wrapped: A/B home (FlatList), A/B topic-quiz result, A/B progress, exam result (ScrollView). Without a usable frame the previous window viewport is used. | adEvents.ts, useSponsorAdTracking.ts, 7 screens; ad-events 18, 19 |

## Please verify
1. Each fix above against your reproductions (re-run them), and that nothing new is broken: hook order in the 7
   wrapped screens and the 4 handleBack screens (new refs are placed with the other hooks, before early returns;
   Engine A behavioral already had hooks after an early return before this change, as you noted), the BackHandler
   ref pattern, the `key` remount of BannerAd, listener cleanup, the single-flight promise and the screen guard
   together (no double navigation, no stuck guard if `router.back()` throws).
2. That wrapping in `AdClip` cannot change layout (it renders only a context provider) and that `ref` on the
   existing FlatList/ScrollView does not collide with an existing ref.
3. The D2 SQL logic as a reviewer (not executed): regex escaping, the 40-row cap query, the 'other' bucket.
4. Whether anything in B1 (Google semantics) still contradicts a comment, test name or the corrected policy text
   (`docs/privacy-policy.html`, the adsEurope paragraph in English and Amharic).
5. Run `node planning/codex-qa-2026-10-06/tests/run-all.cjs` (expected 25 of 25) and `npx tsc --noEmit`.

Known and accepted, do not report as new: device-only checks (EEA form, native overlays, touch dispatch, Android
pixels), the SQL not being executed, best-effort event delivery, the 90 s timeout not dismissing a native ad.

## Deliverable
`planning/ad-events/CODEX_ROUND4_REPORT.md`: verdict, findings most severe first with file:line, max 8 lines of
Hebrew for the owner. If you are stopped midway, write what you have checked so far into the report first, so a
restart does not lose it.
