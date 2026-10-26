# CODEX brief: Round 3 (2026-10-25). Three NEW features + the ad-events fixes from round 2

Branch `upgrade/expo-57`, uncommitted working tree. The app owner is a non-programmer.
**Nothing here is applied to Supabase or published (except the AdMob console items listed in section 1).**

## 0. Ground rules
- Review and test only. Do not edit files, apply migrations, push, build, or write to Supabase. Do not print `.env`.
- Only files you may write: `planning/ad-events/CODEX_ROUND3_REPORT.md` (and `CODEX_AD_EVENTS_REPORT_R2.md` for part A).
- Same standard as before: independent reproductions beat reading. Say what you could NOT verify (no device, no live DB).
- Max 8 lines of Hebrew for the owner at the end.

## A. Round 2 of the ad-events fixes
See the section "Round 2" at the end of `planning/ad-events/CODEX_AD_EVENTS_BRIEF.md` and re-verify A1 to A7 as asked there.
Report to `planning/ad-events/CODEX_AD_EVENTS_REPORT_R2.md`.

## B. NEW: EU / UK ad consent (Google UMP)
Files: `services/adsConsent.ts`, `components/shared/SafeBannerAd.tsx`, `app/_layout.tsx`, test `ads-consent-test.cjs` (8 scenarios).
Behavior: asked once at launch (`ensureAdsReady`), banners render nothing until it resolves true; offline falls back to the stored answer, else no ads and a retry next call.
AdMob side (done in the console by Claude Code, owner approved): one published Europe (GDPR) message, app selected, privacy policy URL set,
"Do not consent" turned on for all listed countries, English only. Cannot be executed without a device in the EEA.
Please check: (1) can any ad request happen before consent (BannerAd mounted elsewhere, `mobileAds().initialize()` anywhere else, interstitial)? grep the whole app. (2) does `canRequestAds` semantics in react-native-google-mobile-ads 17.2.0 match what the code assumes (read node_modules source)? (3) a user who refuses: no ads, form not shown again on every screen, app still fully usable. (4) hook order / unmount safety in SafeBannerAd. (5) NEW since the first draft: the "ad privacy choices" button on both Progress screens (`hooks/usePrivacyOptions.ts`, `privacyOptionsRequired` / `openPrivacyOptions` in `services/adsConsent.ts`, tests 9-12). It must render ONLY when Google reports `privacyOptionsRequirementStatus === REQUIRED` (EU/UK/CH), also for a user who refused; never for anyone else. Its Amharic label `UiStrings.privacyOptions` is deliberately EMPTY until the owner approves Gemini's wording (empty = icon only); do not report the empty label as a bug. Check hook order, the form opening failure, and that nothing else in the Progress screens moved.

## C. NEW: full-screen ads (interstitial) at end points
Files: `services/interstitial.ts`, wiring in `app/(engineA|B)/behavioral-subtopic/[id].tsx` and `app/(engineA|B)/topic-quiz/[topicId].tsx` (inside `handleBack`), start in `app/_layout.tsx`, test `interstitial-test.cjs` (14 scenarios).
Owner-agreed policy: same in both engines; only when LEAVING the "subtopic finished" screen (`phase === 'complete'`) or the "topic quiz result" screen (`phase === 'result'`); never mid-lesson, during audio, after a wrong answer, or on the way into an exam; none in the first 2 launches; then one ad for every 2nd end point (a count, never a timer); an unloaded ad is skipped silently and stays due; only after consent.
Unit id `ca-app-pub-8758594752714631/8327375631` ("Interstitial - Transitions", created in AdMob).
Please check: (1) every route out of those two screens, including the Android hardware back (`BackHandler`) and the in-quiz back button: does the ad ever appear mid-lesson or twice? (2) `handleBack` now has `phase` in its deps: any stale-closure or re-subscribe problem (BackHandler effect depends on handleBack)? (3) audio: is anything still playing or restarting when the ad opens or closes (TTS, `useAudio`, the voice recognition in Engine A)? (4) the 90 s safety release, a closed/failed ad, an app sent to background while the ad is open. (5) the counters file `interstitial_prefs.json` under concurrent calls and a corrupt file. (6) is the ad SDK's own frequency control or the owner's rule violated anywhere. (7) both engines really identical.

## D. NEW: anonymous recorded-voice counters
Files: `services/ttsStats.ts`, `backend/migration_tts_stats.sql` (NOT applied), counting calls in `utils/googleTTS.ts` `speakAndAwait`, tests `tts-stats-test.cjs` (8) and scenario T1 in `recorded-tts-test.cjs`.
Stores only per UTC day, app version, platform: three counters (recorded, live, recorded_failed). No user id, no device id, no text, no time of day.
Please check: (1) can anything in a row identify a person (app version + platform + day on a small user base)? (2) the SQL as a security reviewer (SECURITY DEFINER, empty search_path, grants to anon+authenticated only on the function, the per-call limit of 200, can the table be read or written directly with the app key?). It was NOT executed. (3) is the counting placed so a stopped or cancelled clip, or a clip replaced by a newer request, is not counted; a counter must never delay or break the audio. (4) abuse: a client can inflate the numbers; confirm it cannot do more than that (it is a diagnostic, not billing). (5) write what must change in the Google Play Data safety form and privacy policy, if anything.

## E. AdMob unit ids per screen (already committed locally as a3d7439)
Home `…/5981036016` (A+B home), Progress `…/3110707977` (A+B progress), Lessons `…/5845304640` (topic and behavioral, both engines), Quiz results `…/2049529867` (topic-quiz A+B and `app/result/[sessionId].tsx`). Check that no screen still uses the old shared unit `…/6072135007` and that each id matches its group.

## F. Tests
`node planning/codex-qa-2026-10-06/tests/run-all.cjs` is 25 of 25. `npx tsc --noEmit` exit 0. Please also run both and say if anything differs.
