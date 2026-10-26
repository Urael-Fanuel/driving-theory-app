# CODEX brief: Round 5 (2026-10-26). Fixes for CODEX_ROUND4_REPORT.md

Branch `upgrade/expo-57`, uncommitted. Same ground rules (review/test only; write only the report). Nothing
applied to Supabase, no build. The 28 files you fingerprinted were confirmed unchanged before these fixes.

| Finding | Fix | Where | Test |
|---|---|---|---|
| R4-1 guard stuck after a failed exit | The whole exit runs in `try`. Success keeps the guard on (the screen is leaving, no second navigation). A throw anywhere (audio stop, ad, navigation) releases it in `catch`. Also released when `router.canGoBack()` is false (nothing to go back to). | 4 screens' `handleBack` | NEW `handleback-test.cjs`: extracts the REAL `handleBack` of each screen with the TS parser and runs it with injected failures (24 scenarios) |
| R4-2 slow measurement widens the gap | Tracker option `maxGapMs` (default 2 x step = 500 ms): two visible looks further apart than that do not join; the second restarts. Stated rule: an absence longer than maxGap always restarts; a shorter one between two looks can be missed. | services/adEvents.ts | ad-events 20 (your 300 ms latency case: no view), 21 (20 ms latency still counts) |
| R4-3 unusable frame widened the viewport | `clipViewport(vp, null)` = no frame (window). A zero/invalid frame = empty viewport (nothing visible). The hook passes `EMPTY_FRAME` when a screen HAS an AdClip but its measurement failed. | adEvents.ts, useSponsorAdTracking.ts | ad-events 18 (updated: zero-height and NaN frames give 0), 22 |
| R4-4 "limited ads use no personal data" | Code comment and policy now say: limited ads are not personalised with the user's data, but Google still uses some data, such as the IP address, to deliver the ad and to prevent fraud, with a link to support.google.com/admob/answer/10105530 (link checked: HTTP 200). Amharic by Gemini with the app glossary; tags identical; the other 8 Amharic snippets unchanged. Local only, NOT yet republished (needs the owner's OK). | services/adsConsent.ts, docs/privacy-policy.html (2 lines vs live) | consent 19 |
| Extra: subscriber prepared an ad in launches 1-2 | The change-of-choice listener prepares an ad only when this launch is beyond the first two. | services/interstitial.ts | interstitial 22 |
| Extra: SQL row cap under concurrency | `pg_advisory_xact_lock` per (UTC day, platform) before the 40-row check: hard cap of 41 rows per platform per day. Header no longer claims rows cannot be tied to a person (small cohorts noted). | backend/migration_tts_stats.sql | tts-stats 13 (static) |
| Extra (found by Claude Code) | The project uses Supabase's NEW publishable key (`sb_publishable_...`), which is not a JWT. Counters now send it in `apikey` only, no Authorization header. Both forms were tried against the LIVE server with a no-op call (the function does not exist yet): both returned 404 PGRST202, i.e. authorization accepted. | services/ttsStats.ts | tts-stats 9 (updated) |

Also: interstitial scenario 14 now checks that nothing is awaited between the ad and `router.back()` instead of a
200-character distance (the new comments made the old measure fail; behavior unchanged).

## Please verify
1. R4-1 to R4-4 and the extras against your reproductions; anything new these broke (the try/catch around the
   exits and React state setters, the `maxGap` effect on legitimate views on slow devices, the EMPTY_FRAME path).
2. The policy wording (English and the Amharic paragraph) for accuracy against Google's limited-ads page.
3. Run `node planning/codex-qa-2026-10-06/tests/run-all.cjs` (expected 26 of 26) and `npx tsc --noEmit`.

Known and accepted, not new: device-only checks, SQL not executed by you (the implementer will run it in Supabase
after your approval and check it there), best-effort delivery, sampled (not continuous) visibility within maxGap.

## Deliverable
`planning/ad-events/CODEX_ROUND5_REPORT.md`, same format. Write findings into the report as you go, so a stop does
not lose them. If you cannot write into the project folder, put the report text in your final message instead.
