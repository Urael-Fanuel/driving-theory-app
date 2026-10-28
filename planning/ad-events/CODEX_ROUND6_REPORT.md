# Round 6 — independent QA review

**Verdict: NOT APPROVED for production yet.** The nine-answer counter and ordinary service sequencing work, but the screen integration still has reproducible counting, audio and navigation defects. Five actionable findings follow. Passing the current suite does not close them.

Reviewed 2026-10-27 against CODEX_ROUND6_BRIEF.md and the previous report. Review/test only: no source edits, build, SQL, live ad/backend call, publication or .env read. Only planning/ad-events/CODEX_ROUND6_REPORT.md was written, including checkpoints.

Paths below are relative to C:/Users/Yakov/Desktop/driving-theory-app. Native dependencies, storage, ads and audio were mocked for the independent executions; actual handlers were extracted with the TypeScript parser, and actual service code was evaluated in memory. The installed StackRouter was also executed for the navigation reproduction.

## Actionable findings

### R6-1 — P2: one behavioral answer can increment the counter twice

Location: app/(engineB)/behavioral-subtopic/[id].tsx:260–278.

handleAnswerSelect checks selectedAnswer, then awaits stopTTS and haptics before setting selectedAnswer and calling countAnsweredQuestion. During those awaits the answer buttons remain enabled. Two taps can therefore enter with selectedAnswer=null; both subsequently count the same question. Serialization inside the ad service faithfully saves both increments; it does not deduplicate answers.

Independent reproduction: invoke the real handler twice before its async stop completes, with valid question/answer data and async stop/haptic mocks. Observed two selections and countAnsweredQuestion called twice. Even already-resolved Promise mocks reproduce the overlap. A slower native stop enlarges the real input window. With seven answers already counted, one actual answer can incorrectly make the ad due at nine.

The async-selection weakness predates this round; wiring a new ad increment into it creates the new frequency error.

Fix: claim a synchronous per-question submission ref before the first await; release/reset it according to the question lifecycle and failure semantics. Validate the selected answer before counting. Add a test with two calls while audio stop is held pending. Audit the other state-only guards too; merely finding one countAnsweredQuestion call in each source file does not prove exactly-once execution.

### R6-2 — P2: the ad can start while feedback speech is still active

Primary locations:
- app/(engineB)/behavioral-subtopic/[id].tsx:286–295
- app/(engineB)/topic-quiz/[topicId].tsx:142–151
- components/engineB/TextFeedback.tsx:122–129,209–218

The feedback Next button remains enabled during automatic TTS. The new handler awaits maybeShowInterstitial BEFORE hiding the feedback or stopping its speech. TextFeedback stops that TTS in its unmount cleanup, but the feedback remains mounted throughout the ad wait. Thus “after the user presses Next” is not equivalent to “after feedback has finished or been explicitly stopped.”

Independent ordering reproduction of the real Engine B behavioral handleNext with a held ad promise:
1. Before ad close: only show-ad has run; feedback is still mounted.
2. After ad close: setShowFeedback(false), then next question.

The same issue extends to the optional spoken “why?” explanation: AudioFeedback keeps Next available after the initial feedback finishes even while its later RAG speech is playing or loading (components/engineA/AudioFeedback.tsx:84–108,177–203). Several Engine A transitions also request the ad before unmounting/stopping feedback. Stopping useAudio alone in Engine B sign navigation does not cancel Google TTS used for the RAG explanation.

Fix: invalidate pending feedback/RAG work and stop the relevant audio before requesting an ad, or make the transition unavailable until speech is genuinely finished. Ensure the feedback component cannot start a late explanation during the ad. Keep this separate from starting the next question, which must still wait for ad close. Test automatic TTS and “why?” speech with a due ad. Do not rely on Android incidentally interrupting audio focus; this review establishes the JS ordering, not a native simultaneous-audio recording.

### R6-3 — P2: the navigation guards do not cover all entry points or the whole transition

Locations:
- app/(engineA)/question/[id].tsx:460–469 — in-app Back
- app/(engineB)/question/[id].tsx:149–159,370–374 — direct question arrow
- app/(engineA)/question/[id].tsx:487–510,614 — feedback transition and direct arrow

Three concrete gaps:

**Engine A in-app Back:** the new router.back path has no leavingRef guard. Two overlapping invocations each await stopAudio and then pop. Previously this handler replaced the current route; changing it to pop makes duplicate invocation materially more harmful. Executing the real handler twice against the installed StackRouter with [list, sign X, quiz X] left [list], skipping the sign page. This concerns the in-app button, not two intentional physical-back presses.

**Engine B question arrow:** advancingRef wraps handleFeedbackNext, but the bottom arrow calls handleNextQuestion directly, which has no guard. Two invocations sharing one held ad promise produced two router.replace calls to X_q1. Service single-flight prevents two ad presentations, but does not prevent two caller continuations. The direct arrow can also overlap the feedback Next path.

**Engine A transition lifetime:** handleNext calls async navigateToQuestion without awaiting it, then finally clears advancingRef. With navigation's stopAudio held pending, the real handler had already returned with advancingRef=false while navigation was unfinished. Its final-question handleBack call is also not awaited. The inline question arrow does not use advancingRef at all.

Fix: route each screen's equivalent Next entry points through one guarded transition; await all async navigation/cleanup inside that guard. Give Engine A sign-quiz in-app Back the same error-recovering single-flight behavior as the other in-app exits. Preserve ordinary physical-back behavior. Add actual-handler overlap tests for the direct arrows, feedback/arrow overlap, delayed stopAudio and double in-app Back.

### R6-4 — P2: an abandoned transition can show an ad on the previous page and navigate back into the quiz

Locations: services/interstitial.ts:156–179 and app/(engineB)/question/[id].tsx:149–158. Related unguarded deferred navigation: app/(engineA)/(tabs)/exam.tsx:518 and app/(engineB)/(tabs)/exam.tsx:95.

The transition awaits asynchronous disk/ad work without a focus/unmount cancellation token. The service also does not recheck the requesting screen's eligibility immediately before show. A physical Back can now leave normally while this work is pending; afterwards the old continuation still runs.

Independent combined reproduction using the REAL interstitial service and REAL Engine B handleNextQuestion:
- Start with a loaded ad and nine counted answers.
- Hold the fake preferences read used by the transition.
- Invoke Next, then simulate ordinary physical Back to sign X.
- Release the read.
- Observed: ad shown on sign X; after CLOSED, the abandoned handler calls replace with /(engineB)/question/X_q1.

This is not the accepted case of keeping a skipped ad due. It actively presents an ad on a different screen and undoes the user's navigation. No rare native ad event is needed; an ordinary asynchronous preferences read is enough.

Fix: associate the transition with the requesting route/focus generation. Cancel eligibility on blur/unmount/back, recheck before native show after queue/disk awaits, and suppress navigation/state/prompt continuation if ownership was lost. If abandoned before presentation, retain the due counter. Apply cancellation to exam-result effects too: their new finally(router.replace(...)) callbacks have no cleanup or focus guard. Test leaving before the read resolves, leaving before native presentation, and stale exam-result completion. Cancelling the continuation must not trap an already-open ad or break shared service single-flight.

### R6-5 — P2: the published-policy candidate describes the old placement rule

Locations: docs/privacy-policy.html:173 and321, adsFullScreen.

Both language versions still describe full-screen ads only when finishing a subtopic/topic quiz and say never during a lesson. The implementation now intentionally permits them between questions, including before the end of a subtopic, and after an exam. This is a meaningful mismatch in what the learner is told, not just a missing numerical frequency.

**Yes: correct this before releasing the new placement behavior.** This is a product-description accuracy gate, not a claim that a particular law or store policy was violated. The brief already reserves translation and publication approval to the owner; this review neither changes nor publishes the text.

Suggested English meaning for owner/language-review approval, after the audio issues are fixed:
“After the first two app launches, the app may show a full-screen Google ad between questions after answer feedback, at the end of a quiz, or after an exam ends. Ads become eligible after nine answered questions and appear at an eligible transition when an ad is ready. They do not appear while an unanswered question, its spoken feedback, or an exam is in progress.”

Adjust the exact prose to the owner's approved policy; translate and verify the same meaning before publication. Do not promise that every ninth answer necessarily produces an ad, since consent/readiness can defer it.

## Verification against each requested area

| Area | Assessment |
|---|---|
| Asynchronous count then transition | Correct service ordering. Nine count calls immediately followed by maybeShowInterstitial, WITHOUT flushing between them, produced one show and counter zero. The serial queue puts the read after the increments. Screen-level duplicate counting remains R6-1. |
| First two launches / consent / legacy preferences | Existing tests pass; no regression found in those rules. Missing answersSinceShown reads as zero; old sinceShown is not carried into the new metric. |
| Due but unloaded / ordinary failed show | Counter stays due for unloaded ads, Promise rejection and ERROR paths covered by the suite. Additional synchronous-exception qualification below. |
| advancingRef recovery | Seven real guarded handlers released the ref in finally after an injected ad rejection. No permanently stuck ref was reproduced in those branches. Coverage/lifetime gaps are R6-3; finally alone does not solve stale ownership. |
| Physical Back | The five changed listeners return false and do not dispatch navigation themselves. Installed expo-router/build/fork/useBackButton.native.js:44–53 then calls navigation.goBack when possible. This supports one default navigation per event; no duplicate explicit pop was found in those listeners. |
| Audio on physical Back | Cleanup is requested immediately; native stop completion is NOT awaited before default navigation. Engine B speaking refs are synchronously cleared; topic screens use the latest stopForBackRef. This restores prompt navigation, not a proof that all native audio has already stopped. Device checks remain accepted. |
| Engine B question / exam / practice listeners | No new listener was added, as stated. Engine B sign-question unmount calls stopAudio and its feedback owns TTS cleanup. The new delayed exam-result callback creates the ownership concern noted in R6-4. Practice remains outside the ad counter/show wiring. |
| Sign origin / P5 ordinary navigation | Normal entry is from sign/[id] via push. The origin parameter survives sign-arrow replacements; X to Y to X chooses back, X to Y chooses replace to sign Y, and no back stack chooses replace. The suite's five sign-back scenarios pass. The accepted extra original-sign page after browsing to another sign is not reopened as a defect. Double Back is R6-3. |
| Completion arrows / P6/P7 | Both engines have previous/back/next, disable absent neighbors and reuse navToSubtopic. A total width is 296 dp; B is 216 dp. With the actual unpadded centered parent these fit a 320 dp usable width, leaving 24/104 dp respectively. A needs at least 296 dp; no native screenshot or font-scale layout check was claimed. B's edge-touching stretch button is gone. |
| Complete-to-next-subtopic route lifecycle | The installed StackRouter REPLACE creates a new route key; this was also executed and confirmed. navToSubtopic stops narration/audio and replaces the route, so the new instance starts in explanation with fresh refs. No completion-phase reuse bug was found in this path. |
| Exam placement | The new ad call is in the result effect, not in per-answer Next. One due opportunity clears the accumulated counter rather than showing several catch-up ads for a completed exam. Focus/lifetime still needs R6-4. |
| Previous R5 policy finding | Closed locally: Amharic adsEurope at line320 now says ads may be shown and distinguishes lack of personalization from IP/delivery processing. The earlier categorical no-personal-data phrase is gone. This does not establish what is currently published online. |

### Remaining bypass paths — distinguish these from cancellation bugs

The brief accepts keeping an ad due when the learner bypasses transitions. That behavior remains. It is broader than “rare screens”:
- Engine A behavioral forward arrow calls navigateToQuestion directly at line672.
- Both topic-quiz handleNavNext paths (A:490–498; B:209–214) call goToQuestion directly, with no ad check.
- Previous-question and sign/subtopic browsing also skip ad presentation.

These are ordinary navigation controls, not counting failures. A transition through them can keep the counter due even after an answered question. I do not classify the explicitly accepted defer-until-another-transition policy as a new blocker. However, do not claim every answered-question forward route is covered. If the owner intends “the next forward step after any answered question,” wire these answered paths through the same guarded transition and add tests; preserve no-ad behavior for browsing unanswered questions.

### Pre-existing failure-retention edge case, not a new Round 6 regression

Injecting a synchronous inst.show() exception into the real service with nine pending answers left answersSinceShown=0. The Promise constructor rejects, finally cleans up, and control skips the later !opened restoration block before the outer catch resolves. The same control-flow weakness existed in Round 5.

The installed ad library documents/contains synchronous errors for programmer/lifecycle misuse such as a destroyed instance. I did not establish a normal reachable destroyed-instance path in this app, so this is not an additional release blocker here. It does mean “every failed show stays due” is stronger than the tested guarantee. Restore the reservation on all pre-open failures if strengthening that contract, and test synchronous throw separately from a rejected Promise.

## Why the green tests missed the findings

- interstitial-test scenario14 checks that each file contains one countAnsweredQuestion call. One source occurrence can execute twice.
- Its transition wiring check verifies the ad call occurs near the start of a named function; it does not test feedback audio, focus loss or each alternate arrow.
- Scenario21 checks in-app guard presence only in the four older guarded screens, omitting Engine A sign-quiz handleBack.
- Service single-flight tests establish one ad show, not one navigation continuation.
- sign-quiz-back-test covers ordinary origin/back choices and parameter propagation, not two overlapping Back calls.
- The actual-handler tests added in this review reproduce the defects without modifying repository tests.

Recommended focused additions: delayed answer double tap; automatic/RAG speech versus Next; direct-arrow and feedback overlap; double sign Back against a stack model; held preferences read plus blur/back; async navigation held beyond the handler's finally; and text review for both policy paragraphs.

## Executed checks and scope

- node planning/codex-qa-2026-10-06/tests/run-all.cjs: **27/27 test files passed**, exit0.
- npx --no-install tsc --noEmit --incremental false: **passed**, exit0, no diagnostics. Incremental output disabled to avoid writing build metadata.
- Independent executions: duplicate answer (2 counts), feedback/ad ordering, double sign Back with installed router (list/sign/quiz -> list), double arrow replacement, delayed navigation outliving advancingRef, seven guard-error recoveries, queued ad after Back, immediate count-to-show sequencing and the pre-existing synchronous-show exception.
- No build, native UI/ad test, migration or production request was performed.
- No applicable AGENTS.md was found in the reviewed project paths; dashboard/AGENTS.md is outside this scope.
- The first-pass 20 file fingerprints were rechecked unchanged before final delivery. Previous Round5 fingerprints also confirm adEvents, tracking hook, consent service, ttsStats and its SQL remain unchanged; the privacy file and consent test changed alongside the local wording correction.
- This is a targeted regression review, not certification that every device will be fast or that the entire application is defect-free.

## Reviewed fingerprints

SHA-256, captured before the review of the Round6 changes and rechecked at completion:

- services/interstitial.ts: 9d68741072c228f1d4065ec499c44fb618e53f0fdd853ddd89b4ff46843d0d9f
- hooks/useTopicQuiz.ts: 1154f61339a36a3dfc3dc839d304d614a9bebd832196dded191dbbdeabfa1895
- hooks/useExam.ts: 4be733b5c424a252c3de88cefe8f0b08b2f89793fc819c2820da371f4e6b36ca
- docs/privacy-policy.html: bcfa182184e0f56655c02ce112d249c2b5f2c2666deadb0fe6ca3b1102ef48e6
- app/(engineA)/question/[id].tsx: e52b41036291d04028243295e46af1d9c463048e48cfc5ea0de62c8df5941944
- app/(engineA)/behavioral-subtopic/[id].tsx: 0390fe411e0d0c1d58fcb4b75ee121d67658d4d39b2cab30924dc9dd88e7b160
- app/(engineA)/topic-quiz/[topicId].tsx: efccd513e6471972997768873a0a27cea61680e18edb8f5f119c2f2e72c36743
- app/(engineA)/(tabs)/exam.tsx: 4622fb4ca729adc1cd77ce36ec9117249693b99d8d51d8c36c6355e2fce6ff61
- app/(engineA)/sign/[id].tsx: 7d2436cbaac625fd30e20acc3d803804b4ec45cf74f988ddc585917e235ef7f9
- app/(engineA)/practice.tsx: afe825ce8ba95cd084de4fe73bea69e69f282eaa134d72c914704801cdd28f08
- app/(engineB)/question/[id].tsx: 23730e7ac5125e9d06bd202cad5875b6cd8896bcf63cb31f31bd2192a6aca2a3
- app/(engineB)/behavioral-subtopic/[id].tsx: bceeb11563a492e2bcc77299e3aa54bbee646d0449fc5e51faf5958100784b2d
- app/(engineB)/topic-quiz/[topicId].tsx: 27e2c298e16a906640e5bfabf9995d5e2c8281371695fcbac68238b037f7f104
- app/(engineB)/(tabs)/exam.tsx: ccace667831b83de2306c4bc9641a29bf9308329052f55f7f14aa7b453cf4f36
- app/(engineB)/sign/[id].tsx: 8dfec57d38142a38efa717c67b9b4716edf6862d5d1ae49c139f5afe2058b405
- app/(engineB)/practice.tsx: 8f1fb758928bdfa7317baa7971e5992a20b2c37bac5ac683387a063bd5318aa5
- planning/codex-qa-2026-10-06/tests/interstitial-test.cjs: da8cd4e5a9ad86f5163f5bcca8c1999bad33769bcdc61cb3da1d826e2644736f
- planning/codex-qa-2026-10-06/tests/handleback-test.cjs: 1e54c93555cb5151da432648399a1237a60407e266c3be204031ce0a9ac6ae36
- planning/codex-qa-2026-10-06/tests/sign-quiz-back-test.cjs: 71f1a99d00a043375bb293ccc33238cf45c73e081494ba3253261b170faa0252
- planning/codex-qa-2026-10-06/tests/practice-answers-test.cjs: 75a8a15d6203d9298dd152dc7e7fd2ae2abcb43bade2ac10b502d88381389b6e

## סיכום לבעל האפליקציה

הגרסה עדיין אינה מאושרת לפרודקשן.
כל 27 קובצי הבדיקות ובדיקת TypeScript עברו, אך בדיקות נוספות חשפו תקלות שהן לא מכסות.
תשובה אחת עלולה להיספר פעמיים, ופרסומת עלולה להתחיל לפני שהמשוב הקולי נעצר.
יש מסלולי ניווט שמאפשרים פעולה כפולה או המשך פעולה אחרי שכבר יצאת מהמסך.
תיקון החזרה הרגילה והחצים החדשים ברובם תקינים; צריך להשלים את ההגנות במסלולים שפורטו.
תיקון האמהרית מהסבב הקודם נסגר, אבל תיאור מיקום הפרסומות עדיין דורש עדכון ואישור שלך.
לא שיניתי קוד ולא פרסמתי דבר; כתבתי רק את הדוח הזה.
