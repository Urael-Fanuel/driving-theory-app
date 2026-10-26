# CODEX brief: QA of "sponsor ad views and call presses" logging (before anything touches the live database)

Prepared 2026-10-25 by Claude Code. Branch `upgrade/expo-57`, uncommitted working tree.
The app owner is a non-programmer. **Nothing has been applied to Supabase yet.** The SQL migration is a file only.

## 0. Ground rules
- Review and test only. Do not edit files, apply the migration, push, build or write to Supabase. Do not print `.env`.
- Only file you may write: `planning/ad-events/CODEX_AD_EVENTS_REPORT.md`.

## 1. What this is
The owner will sell small ads to driving instructors (our own `sponsor_ads`, not Google AdMob). A sponsor must be
shown real numbers: how many people saw the ad and how many pressed "call now", per city. Today nothing is recorded.

Agreed with the owner:
- A **view** = at least 50% of the ad card inside the window for 1 continuous second, while its screen is in front
  and the app is in the foreground; once per time the screen is opened (once per mount of the card).
- A **click** = any tap on the ad card (text, picture or its 🔊 button): event `click`. A **call** = the "call now"
  button: event `call` (also a click; the report counts clicks as click + call).
- Stored: ad id, event, screen (route), engine (A/B), city, anonymous user id, time. City is added **by the server**
  from the user's own row (`users.city`, else `users.ip_city`), never sent by the app. No coordinates, phone or name.
  A user who declined location has no city stored, so none is recorded.

## 2. Files
| File | Purpose |
|---|---|
| `backend/migration_sponsor_ad_events.sql` | NEW table `sponsor_ad_events`, RLS insert-only, grant, BEFORE INSERT trigger (server city + 120 events/user/minute guard), view `sponsor_ad_daily_stats` (service role only) |
| `services/adEvents.ts` | NEW `sendSponsorAdEvent` (fire-and-forget insert) and the pure `createViewTracker` / `visibleShare` |
| `hooks/useSponsorAdTracking.ts` | NEW: measures the card (`measureInWindow`), screen focus, AppState; sends events |
| `components/shared/AdCard.tsx` | instructor card takes optional `adId`, attaches the ref (`collapsable={false}`), counts the press before opening the dialer |
| `components/shared/SponsorAdBanner.tsx` | passes `ad.id` |
| `backend/api.ts` | `SponsorAd` has `id`; `getSponsorAd` selects it |
| 4 screens (A and B home, A and B topic-quiz result) | pass `adId={sponsorAd.id}` |
| `planning/codex-qa-2026-10-06/tests/ad-events-test.cjs` | NEW, 12 scenarios |

## 3. Please verify
1. **SQL correctness and safety** (you cannot run it): syntax, idempotence on re-run, `DEFAULT auth.uid()` for an
   anonymous Supabase session, the RLS `WITH CHECK (user_id = auth.uid())`, the `SECURITY DEFINER` trigger (search_path,
   can a caller influence `NEW.city`/`NEW.user_id` in a way that matters?), the rate-limit count and its index, FK to
   `sponsor_ads(id)` (and what happens when a sponsor row is deleted), the view's grants, and that the app key
   cannot read, update or delete rows. Anything that would make a normal insert fail (for example the missing
   `GRANT`, a column default, `users` RLS blocking the trigger's lookup).
2. **Privacy**: confirm what is stored matches section 1; is there any way a row identifies a person, or reveals a
   city for a user who declined location (see `hooks/useLocationPrompt.ts`, the wipe-on-decline rules, and
   `getSponsorAd`'s `useIpCity:false`)? Note what must be added to the Google Play Data safety form.
3. **View definition**: do the tracker rules in `services/adEvents.ts` implement exactly section 1? Can a view be
   counted for a card that is not visible (list footer below the fold, a screen under another screen in the stack,
   app in the background, a hidden/zero-height card)? Can it be counted twice for one visit? Behaviour on screen
   re-focus, orientation change, and ListFooterComponent re-mounts.
4. **No harm to the app**: a failed or slow insert must never block, throw, or change what the learner hears or sees.
   Timers are cleaned on unmount. Check `hooks/useSponsorAdTracking.ts` for hook-order/stale-closure issues (`adId`
   changes, `screenRef`, `engineRef`), and that `measureInWindow` on a `collapsable={false}` View works in a FlatList footer.
5. **Both engines**: every place a sponsor ad card is rendered must pass the id (grep `<AdCard` and `<SponsorAdBanner`).
6. Run `node planning/codex-qa-2026-10-06/tests/run-all.cjs` (expected 22 of 22) and `npx tsc --noEmit`.

## 4. Deliverable
`planning/ad-events/CODEX_AD_EVENTS_REPORT.md`: verdict (`APPROVED` / `APPROVED WITH FIXES` / `NOT APPROVED`),
findings most severe first with file:line, what to change, and max 8 lines in Hebrew for the owner.

---

# Round 2 (2026-10-25): fixes for CODEX_AD_EVENTS_REPORT.md (NOT APPROVED)

Each finding was first checked against the code by Claude Code before fixing; all seven were confirmed real.
Still: **nothing applied to Supabase.** No local PostgreSQL exists on this machine, so the SQL was NOT executed;
scenario 13 only checks its text. Please review the SQL with that in mind.

| # | Fix | Where |
|---|---|---|
| A1 | GROUP BY written as full expressions (`(e.created_at AT TIME ZONE 'UTC')::date`, `COALESCE(e.city,'unknown')`) | migration |
| A2 | App sends `city_source` read from the local location answer AT SEND TIME (`approved`->`gps`, `unknown`->`ip`, `declined`/error->`none`). Trigger: `none` = city NULL, `gps` = users.city only, `ip` = city else ip_city. The decline is saved locally before the wipe is attempted, so every event sent after a "no" is `none`, whatever the server still holds. Boundary: an event whose request left before the "no" keeps its earlier answer (it happened before the decision). | services/adEvents.ts `locationSource`, migration trigger |
| A3 | Tracker uses a real clock: a run starts at the first OBSERVED visible sample, counts only when `now - since >= 1000` on a later visible sample. `isActive` re-checked after the measurement. `reset()` (generation counter) on focus/blur, AppState change, Dimensions change, dialog open/close; a measurement started before a reset never counts. Measurement bounded (1 s -> not visible). Screen label fixed at mount as a route template (`useSegments`), so a later screen cannot relabel it and no session id is stored. | services/adEvents.ts, hooks/useSponsorAdTracking.ts |
| A4 | Rect keeps x/width; non-finite or non-positive sizes = 0; 2-D intersection with the visible part of the screen: top = safe-area top, bottom = window minus the tab bar height (`BottomTabBarHeightContext`, the same module expo-router's Tabs provides; checked in node_modules) or the bottom inset where there is no tab bar. Full-screen dialogs (LocationPermissionModal, DisclaimerModal, VideoModal) call `useCoversAds(visible)`; while one is open no card is active. Known limit: a card clipped by its own ScrollView edges other than these is not detected (all current placements are full-screen scroll views whose edges are these); needs device validation. | same + 3 modals |
| A5 | Trigger: identity check first (`auth.uid()` NULL or mismatch -> error), `created_at := now()` always, per-user `pg_advisory_xact_lock` before the 120/min count. `REVOKE ALL ... FROM PUBLIC, anon, authenticated` (Supabase default grants) then `GRANT INSERT (ad_id, event, screen, engine, city_source) TO authenticated` only. Policy `TO authenticated`. `search_path = ''`, every relation schema-qualified; function EXECUTE revoked from client roles. | migration |
| A6 | No give-up: polls every 500 ms while mounted and unseen (only a boolean check while inactive). | services/adEvents.ts |
| A7 | SponsorAdBanner uses `useSponsorAdTracking(ad.id, { views: false })` (no second view tracker) and sends ONE click when its 🔊 starts playing; stop and resume-after-interruption are not new clicks. | components/shared/SponsorAdBanner.tsx |
| other | `BEGIN/COMMIT` around the migration; `ON DELETE RESTRICT` (deactivate sponsors with is_active=false); `GRANT SELECT` on the view to service_role, revoked from PUBLIC; header documents pseudonymity, retention (rows kept until deleted, retention period is an owner decision) and that a call row is a press, not a completed call. | migration |

Tests: `ad-events-test.cjs` now 19 scenarios, including CODEX's reproductions (8, 8b, 8c, 8d, 3 zero-width/off-side/under-tab-bar).
`run-all.cjs` 22/22, `tsc --noEmit` exit 0.

Please re-verify A1-A7 and look for anything new these changes broke (hook order in AdCard/SponsorAdBanner/modals,
the deep import `expo-router/build/react-navigation/bottom-tabs`, the circular-import risk services/adEvents.ts ->
hooks/useLocationPrompt.ts, the trigger under a PostgREST insert with `return=minimal`). Write the result to
`planning/ad-events/CODEX_AD_EVENTS_REPORT_R2.md`. Same ground rules as section 0.
