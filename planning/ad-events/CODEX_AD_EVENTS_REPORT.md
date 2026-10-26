# Sponsor ad events — independent QA

**Verdict: NOT APPROVED.**

Reviewed 2026-10-25 against planning/ad-events/CODEX_AD_EVENTS_BRIEF.md. Do not apply this migration or use this candidate's metrics in sponsor reporting yet. There is a blocking SQL name-resolution defect, the location-decline guarantee is not enforced by this new event path, and view eligibility differs from the agreed definition. All 22 test files and TypeScript pass, but those checks do not cover the defects below.

No SQL was executed, no migration was applied, and no request was sent to Supabase. SQL conclusions are static analysis checked against the existing schema and PostgreSQL documentation. Runtime reproductions used the real TypeScript service/hook with in-memory clocks and dependency stubs.

## Findings, most severe first

### A1 — P1: GROUP BY city is ambiguous; the statistics view cannot be created against the existing schema

Locations: backend/migration_sponsor_ad_events.sql:81–94; backend/migration_sponsor_ads.sql:33.

The query joins sponsor_ad_events e and sponsor_ads a. Both tables have a city column. GROUP BY uses the unqualified name city, although the SELECT also aliases COALESCE(e.city, 'unknown') as city. PostgreSQL resolves an ambiguous GROUP BY name as an input column, and there are two matching input columns here. The output alias does not disambiguate them. This produces a column-reference ambiguity during CREATE VIEW. Depending on how the migration is submitted, the surrounding transaction fails or earlier statements can be left applied without the intended view/revocation.

Fix: explicitly group by COALESCE(e.city, 'unknown') and the full UTC date expression (or use an unambiguous subquery/ordinals). Grouping by the coalesced expression also keeps the displayed unknown bucket consistent. Validate creation and a second application in an isolated database before live application; none was run during this review. See [PostgreSQL SELECT / GROUP BY](https://www.postgresql.org/docs/current/sql-select.html).

### A2 — P1: the new server city lookup bypasses the decline safeguard while a wipe is pending

Locations: backend/migration_sponsor_ad_events.sql:61–63; services/adEvents.ts:28–37; hooks/useSponsorAdTracking.ts:38,46–53; hooks/useLocationPrompt.ts:180–199; hooks/useSponsorAd.ts:45–64,179–202; backend/api.ts:931–945,1016–1018.

The event trigger always reads users.city / users.ip_city. It has no consent state. The event sender has no consent check or location-suppression flag. The previous ad-serving fix deliberately uses useIpCity:false because a declined user's ip_city can still be on the server while its deletion is failing or in flight. That protection only affects ad selection; it is not passed to the event trigger.

A concrete ordering to cover: a view/call insert is already in flight; the user declines; local consent is saved and the existing banner is removed, but the server wipe is delayed or fails; the event insert reaches the trigger before a confirmed wipe. The trigger copies the stale city into a permanent event row. A later successful wipe of users.ip_city does not erase that event's city. This is a source-proven ordering vulnerability, not a claim that it was observed in production or that the existing UI keeps displaying IP-targeted ads after decline.

Fix: make event location attribution explicitly consent-aware instead of treating nonempty users.ip_city as proof of permission. Keep city derivation server-side. Coordinate server consent/wipe state with local decline/pending cleanup and in-flight events so a declined event is stored without location or delayed/suppressed as appropriate. Specify and test the boundary for events begun before decline and committed afterward; offline consent cannot be magically known to the server. Include wipe failure, delayed insert, reconnect and delayed IP write tests. Merely retaining the ad lookup's useIpCity:false does not protect this new table.

### A3 — P2: the tracker credits unobserved time and can count a backgrounded screen

Locations: services/adEvents.ts:84–101; hooks/useSponsorAdTracking.ts:23–25,31–38.

Each visible measurement adds 500 ms immediately, including the first visible observation. Two visible samples at 500 ms and 1000 ms are enough. This does not establish one second of continuous visibility. isActive is tested only before awaiting measurement, not afterward; blur/background does not immediately invalidate the streak, because the hook just reads the current state during polls.

Independent reproductions with the real createViewTracker:

- Card below the window until t=499 ms, visible thereafter: one view at t=1000 ms, after only 501 ms of visibility.
- First visible sample at t=500; app inactive from t=600 to t=900; active at t=1000: one view, despite the interruption.
- First valid sample, then the second measure promise is held; app becomes inactive before that promise resolves: one view is emitted while inactive.

Fix: start an elapsed-time interval at the first qualifying observation rather than adding a nominal tick immediately. Reset/invalidate on focus loss and AppState changes, and recheck activity after each asynchronous measurement before emitting. Track/invalidate stale geometry during scrolling/layout changes; periodic snapshots alone cannot prove continuous visibility between samples. Add these exact timing and async race cases, including a delayed measurement after navigation so an old card is not labeled with a newer screenRef route.

### A4 — P2: the visibility calculation cannot distinguish clipped or zero-width cards from visible ones

Locations: services/adEvents.ts:49,66–70; hooks/useSponsorAdTracking.ts:31–36; app/(engineA)/(tabs)/home.tsx:202–226; app/(engineB)/(tabs)/home.tsx:167–197.

Only y and height are retained; x and width are discarded. The denominator/intersection use the entire window, not the containing FlatList viewport. Home lists have content above/below them, so a geometrically measurable footer can be within the window coordinates yet clipped by its scroll parent or covered by other UI. Native clipping/measurement behavior needs device validation; measureInWindow is not a visibility/occlusion guarantee.

The actual hook, given measureInWindow(x=10000,y=100,width=0,height=120), returned {y:100,height:120}; visibleShare reported 1. A footer at y=650,height=120 reports 1 for an 800-high window even if its list's visible viewport ends at y=600, where its actual visible area is zero. Zero height is correctly rejected; zero width is not. Likewise screen focus alone does not establish that a local modal is not covering the card.

Fix: reject nonpositive/nonfinite dimensions, measure/intersect the relevant visible viewport in both axes, and gate known covering overlays. Integrate list visibility/scroll information as needed, then validate a partially clipped footer, orientation changes and modal coverage on Android. Keep the non-collapsable native host ref.

### A5 — P2: client-controlled timestamps bypass the rate limit and alter daily statistics

Locations: backend/migration_sponsor_ad_events.sql:32,53,65–66,85.

DEFAULT NOW() applies only when created_at is omitted. The table-wide INSERT grant permits a caller to supply a different created_at, and neither RLS nor the trigger overwrites it. A signed-in client can repeatedly insert old timestamps: its new events never enter the last-minute count, so even sequential inserts bypass the advertised 120/minute limit. It can also attribute events to arbitrary reporting days. This is static SQL analysis; no attack or database insert was run.

Even with trustworthy timestamps, concurrent transactions can each see a count below 120 and both pass because count/check is not atomic. The (user_id,created_at) index fits the query, but does not serialize it.

Fix: stamp created_at on the server regardless of client input, restrict insertable columns where practical, and serialize/count quota usage atomically per user if 120/minute is intended as a hard bound. Explicitly validate/use the authenticated subject before privileged lookups. Add isolated database tests for supplied old/future timestamps and concurrent inserts. Client-side deduplication alone cannot make sponsor statistics fraud-proof.

### A6 — P2: a legitimate view after ten minutes is silently impossible until a remount

Locations: services/adEvents.ts:63,77,87,100; hooks/useSponsorAdTracking.ts:28–44.

After 600,000 ms of polling, an unseen card stops scheduling checks forever. The hook starts a tracker only when adId changes/mounts; re-focus or scrolling it into view does not restart it. A user can leave a screen open, return from another screen/background, or scroll to the footer later and meet every agreed visibility condition without ever being counted.

Independent reproduction: keep the card below the fold for 600,000 ms, move it into view for five seconds -> zero views.

Fix: suspend work when inactive/offscreen and resume on visibility/focus/foreground changes until counted or unmounted. Do not silently expire eligibility after ten minutes unless the owner changes the view definition. The existing scenario 8 enshrines this give-up behavior rather than testing the agreed lifetime rule.

### A7 — P2: the sponsor banner's only audio button is not logged as a click

Locations: components/shared/SponsorAdBanner.tsx:43–53,60–75; app/result/[sessionId].tsx:335; app/(engineA)/(tabs)/progress.tsx:133.

In Engine A, SponsorAdBanner renders the sole audio button outside the nested AdCard. handlePlay can play both the wrapper and the sponsor's pitch, but never sends a click. The nested AdCard intentionally receives no audioUri, so its tracked handleAudio cannot run for this placement. Users who listen to the sponsor in these banners generate no click event from that action.

Fix: log one click for ad.id from the banner's audio control using the same event sender/context. Avoid introducing a second view tracker for the same visible card and avoid counting the same action twice. Test banner play/stop/resume and plain-card audio independently. If the owner intends to exclude this sponsor-playing button, document that narrower metric explicitly rather than presenting all sponsor audio taps as counted.

## SQL safety, privileges and lifecycle review

The migration was read against backend/schema.sql, migration_agent_platform.sql and migration_sponsor_ads.sql. Apart from A1, the table/index/trigger/policy constructs are plausible PostgreSQL; syntax and grants were not certified by execution.

- Anonymous Supabase sign-in uses an authenticated session, so auth.uid() can supply its UUID. The unauthenticated anon key alone has no user subject and cannot satisfy this NOT NULL/default/RLS combination. GRANT INSERT is present and the client does not request returned rows. [Supabase anonymous sign-ins](https://supabase.com/docs/guides/auth/auth-anonymous).
- WITH CHECK(user_id=auth.uid()) prevents committing a different user's id under this policy. A supplied city is overwritten by the trigger. However, the definer trigger reads NEW.user_id before the policy check; reject mismatched identity at its start as defense in depth. PostgreSQL applies INSERT checks after BEFORE triggers. [CREATE POLICY](https://www.postgresql.org/docs/current/sql-createpolicy.html).
- With a normal privileged Supabase migration owner, SECURITY DEFINER permits the users lookup/rate count despite caller RLS. That depends on function ownership and privileges; it is not a reason to grant ordinary clients access to users or event reads.
- Harden SET search_path=public and unqualified users/sponsor_ad_events: schema-qualify relations and use a hardened path (for example an empty path with fully qualified relations). Unlisted pg_temp can precede public for relation lookup. This is a conditional SQL-access hardening issue, not proof of a REST client exploit. [Supabase function security](https://supabase.com/docs/guides/database/functions), [PostgreSQL SECURITY DEFINER guidance](https://www.postgresql.org/docs/16/sql-createfunction.html).
- Under a fresh schema containing only this insert policy, normal app roles cannot SELECT, UPDATE or DELETE event rows through RLS. A SELECT may return zero visible rows rather than a permission error. The app should continue using insert without select/returning. This is a static conclusion, not a live permissions audit.
- The summary view uses owner privileges by default, so its grant boundary matters. The explicit REVOKE from anon/authenticated is good. Make the service-role read grant explicit, and revoke PUBLIC as defense in depth; the script currently relies on project defaults for service-role access and has not inspected inherited grants. Do not infer those ACLs from the file alone.
- IF NOT EXISTS plus DROP/CREATE policy and trigger support a same-definition rerun once A1 is fixed. They do not reconcile an older table definition or remove unrelated permissive policies. An explicit transaction and isolated rerun check would avoid uncertain partial setup.
- ad_id UUID FK matches sponsor_ads.id. ON DELETE CASCADE permanently removes that sponsor's event history; the inner-join report then has no rows for it. Deactivate sponsors with is_active=false if history must survive. Sponsor-name changes also rename historical report labels because the view joins the current name.
- user_id has no FK to users/auth.users and no retention/deletion job in this change. Removing a user does not automatically remove these event rows. Define retention and deletion handling for this new history; do not assume existing user deletion cascades cover it.
- UTC day grouping is explicit. unique_viewers counts distinct ids within each ad/day/city/engine group; adding those group totals is not a global distinct-person total. A call is a button press, not proof of a connected or completed telephone call. Call rows are included once in clicks by the aggregate filter.

## Privacy and Google Play disclosure

The normal client payload has exactly ad_id, event, screen (up to 80 characters), engine. The server adds id, created_at, user_id and city. There is no direct coordinate/phone/name field in an event. But user_id is a stable pseudonymous identifier, not irreversible anonymity: it joins to users.id, whose schema includes display_name and optional phone, and the user location columns. An administrator with suitable access can associate those records. usePathname also stores concrete routes, potentially including a result session id, rather than necessarily a route template. Prefer a normalized route if instance identifiers are unnecessary. I did not inspect any user's actual data.

Update the Google Play Data safety answers for App activity / App interactions (views and taps), Personal info / User IDs for the Supabase user identity, and Location / Approximate location for city, including IP-derived city. Declare the applicable advertising/marketing and analytics purposes; do not claim pseudonymous or persisted data is outside collection or ephemeral. Review required/optional collection, retention/deletion and privacy-policy wording against the real behavior. Names/phone/precise coordinates are not newly transmitted by this event payload, but the app-wide disclosure must still cover existing flows. Assess sharing based on what sponsors/providers actually receive: genuinely anonymized totals differ from identifiable small-group reports or user-level exports. Source: [Google Play Data safety guidance](https://support.google.com/googleplay/android-developer/answer/10787469?hl=en).

The app's current decline flow is local plus retried server deletion; it does not provide this trigger with an authoritative consent flag. A2 must be resolved before asserting that declined users' events always have a null city. Existing historical rows also need an explicit retention/withdrawal policy; deleting users.ip_city alone does not modify old event cities.

## Both-engine wiring, hooks and app impact

All rendered instructor-card paths found by source search pass the sponsor id:

| Placement | Wiring |
|---|---|
| Engine A home | AdCard adId=sponsorAd.id |
| Engine B home | AdCard adId=sponsorAd.id |
| Engine A topic-quiz result | AdCard adId=sponsorAd.id |
| Engine B topic-quiz result | AdCard adId=sponsorAd.id |
| Exam result | SponsorAdBanner ad -> nested AdCard ad.id |
| Engine A progress | SponsorAdBanner ad -> nested AdCard ad.id |
| Engine B progress | SponsorAdBanner ad -> nested AdCard ad.id |

SponsorAd.id is selected and returned by getSponsorAd. No currently rendered sponsor instructor card was found missing its id. BusinessAdCard has no event wiring but no active sponsor placement using that variant was found; AdMob is intentionally separate. Banner audio attribution is the separate A7 gap.

InstructorAdCard owns its hooks unconditionally, so selecting the outer variant does not violate hook order. Effects clean up the old tracker on adId change/unmount; stopped is checked after measurement so unmount does not emit a late event. Click/call callbacks capture the current adId and use refreshed screen/engine refs. Changing adId starts a new tracker; this counts once per ad/effect lifetime, not strictly once across every ad replacement in the same component lifetime. Confirm that interpretation before rotating ads inside one card.

Re-focus of an already counted mounted card does not count again, matching the brief's explicit once-per-mount interpretation. A true unmount/remount starts a new count even within one navigation visit; that is also implied by that interpretation. Current home footers are React elements, not inline component functions; the installed VirtualizedList renders an element in its stable footer cell. Ordinary parent rerenders do not themselves prove remounting/double counting. Native clipping, rotation, focus and nested touch behavior still require device checks.

The non-collapsable outer Pressable provides a native measurement target. Width and viewport are lost after measurement (A4), rather than the ref being absent. A native measurement callback that never returns also leaves polling waiting forever; a bounded measurement fallback is sensible hardening. Orientation is read from Dimensions on subsequent polls, but the existing streak is not explicitly invalidated by a layout change (A3).

sendSponsorAdEvent is asynchronous, catches insert errors and reports quietly. Its callers do not await it; call logging starts before haptics/dialer, and audio handling is not blocked by the insert. Timers are cleared on unmount; there is no new audio ownership mutation. A slow insert can remain pending, but does not hold the learner's control handler. No queue/retry is implemented: an offline/refused event is lost and a view is already marked seen. This is the brief's accepted best-effort behavior, so reports must not be presented as exhaustive billing-grade delivery.

Nested child press handling is expected to avoid an outer press event, but the new test only searches source strings; it does not exercise React Native responders. Verify one call tap -> one call row and no separate click row on device; likewise one inner audio tap -> one click. Do not claim a successful call solely from that row.

## Tests and independent evidence

- node planning/codex-qa-2026-10-06/tests/run-all.cjs: **22/22 test files passed**.
- npx --no-install tsc --noEmit --incremental false: **exit 0, no diagnostics**. Incremental output disabled to avoid writing build info.
- ad-events-test.cjs contains **13 scenarios** (1–12 plus 10b), despite the brief calling it twelve. They test the service and source patterns, not SQL execution, native visibility, consent-aware event attribution or actual touch dispatch.

| Independent experiment | Actual result |
|---|---|
| First visible at t=499, checked through t=1000 | 1 view after only 501 ms |
| Background t=600..900 between visible samples | 1 view despite interruption |
| Become inactive while second measurement is pending | 1 view while inactive |
| First visibility after 600,000 ms offscreen | 0 views after another 5 seconds |
| Real hook receives width=0 and x outside window | Width/x discarded; visibleShare=1 |
| Card wholly below a shorter list viewport but inside full window | visibleShare=1; parent clipping not represented |
| Normal sender payload | ad_id/event/screen/engine only; no consent gate |

The geometry experiments establish missing inputs/logic, not observed Android pixels. A1/A2/A5 are grounded static schema/control-flow findings; no live SQL, malicious insert, or location mutation was executed. Passing tests do not override these findings.

## Required follow-up validation

After fixing the findings, add targeted unit/hook tests for the timings above and banner clicks. In an isolated database, have the implementer test fresh migration and rerun, anonymous-session insert, unauthenticated/foreign-user rejection, forbidden reads/updates/deletes, service-role summary access, consent/wipe ordering, timestamp spoofing and concurrent quota enforcement. Then test both home footers, progress/result banners, scrolling, rotation, modals, focus/background and nested buttons on a device. These checks are proposed follow-up work; this review did not create or mutate a database.

## סיכום לבעל האפליקציה

המימוש עדיין אינו מאושר; אין להחיל כרגע את המיגרציה על מסד הנתונים החי.
מצאתי שגיאה בשאילתת הסיכום שעלולה למנוע את יצירת דוח המפרסמים.
צפיות עלולות להיספר לפני שנייה רצופה, בזמן הסתרה או מעבר לרקע, ולהחמיץ צפיות מאוחרות.
מסלול האירועים החדש אינו מבטיח שעיר תימחק מהאירוע כשסירוב למיקום עדיין ממתין לטיפול בשרת.
אפשר לזייף את מועד האירוע ולעקוף את מגבלת הקצב; כפתור השמע בבאנר אינו נספר.
כל 22 קובצי הבדיקות ובדיקת TypeScript עברו, אך הם אינם מכסים את הממצאים האלה.
יש לתקן, לעדכן את גילוי איסוף הנתונים ולבצע בדיקה חוזרת לפני הפעלה.
נכתב רק הדוח; לא שונו קוד, הגדרות או נתונים ולא הורצה מיגרציה.

## Review boundaries and fingerprints

Only planning/ad-events/CODEX_AD_EVENTS_REPORT.md is written. No source edits, builds, pushes, database writes or .env reads. No AGENTS.md applies to these files (the discovered dashboard/AGENTS.md is outside this change). All reproduction data was synthetic and in memory. Paths/line references are relative to C:/Users/Yakov/Desktop/driving-theory-app.

Reviewed SHA-256:

- backend/migration_sponsor_ad_events.sql: 4fef410f09c7cdc8c50034a87ef7956e4a731a277bc841a7a28bfe605239b7a9
- services/adEvents.ts: 2b4c78fc03f96c750a3651920fd0cf77e9e5d5c5c33366bdfefc26572d446570
- hooks/useSponsorAdTracking.ts: 8acf75ad8f8567d518e06f309f495a4089e83a1d6a21183bf3e3a7340a80cf76
- components/shared/AdCard.tsx: c11150b9c22c696e00eb152afb6180faf3b7878209c606488ed97e607045cdad
- components/shared/SponsorAdBanner.tsx: 072805c5a5b06180b812fa7a798ba143646e43e5643b5cf88e62e8bc7771b5b2
- backend/api.ts: 0b37f6eb9166ff49dcbb1ab14c270a818b06a4ec4384543adf9c26b693d82b48
- hooks/useLocationPrompt.ts: 2e8f4f880a47d6a7b20e48afa45dfbe6d80f7114bb1bd49891f22f843c0059a8
- hooks/useSponsorAd.ts: cc27ddd28f00845c414f3934f4abd1b6994f1248db4c11b59ae4b0a826096976
- planning/codex-qa-2026-10-06/tests/ad-events-test.cjs: a22035b20cb344804aaeecf3522caa39e5b52a09daa637c9c81bc45c3ce09cf0
- planning/ad-events/CODEX_AD_EVENTS_BRIEF.md: 461ea5c50f76861bccd78238fd2304ba4795081e5d555e5bf1a1c9612a5455e5
