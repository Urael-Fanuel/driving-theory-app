# CODEX brief: Round 7 (2026-10-27). Part 1: fixes for CODEX_ROUND6_REPORT.md. Part 2: the owner's phone testing

Branch `upgrade/expo-57`, uncommitted. Same ground rules (review/test only; write only the report). No build, no SQL, nothing
published. I checked every Round 6 finding against the code before fixing it: all five were real. Please re-fingerprint first.

| Finding | What I confirmed | Fix | Where | Test |
|---|---|---|---|---|
| R6-1 one answer counted twice | The B behavioral handler awaited stopTTS/haptics before it set any state, so two taps both passed the `selectedAnswer !== null` check. The same state-only guard exists in the other answer handlers (state is not updated before the re-render). | A synchronous `answerLockedRef` per question, taken right after validating the answer and BEFORE any await or state update, released where the question changes (A/B sign quiz, A/B behavioral). In the two hooks the guard is on the answers ref (`answersRef.current.some(questionId)`), not on the phase state. | `app/(engineA\|B)/question/[id].tsx`, `app/(engineA\|B)/behavioral-subtopic/[id].tsx`, `hooks/useTopicQuiz.ts`, `hooks/useExam.ts` | NEW `round6-handlers-test.cjs` (real handlers, held audio stop, two taps: 4 screens), `practice-answers-test.cjs` scenario 4 (second exam answer) |
| R6-2 ad starts while feedback speech is active | `maybeShowInterstitial` ran before the feedback was hidden; TextFeedback/AudioFeedback only stop their TTS and the "why?" explanation in their unmount cleanup (they also guard a late fetch with `mountedRef`). | One `passAdGate()` per screen: `setShowFeedback(false)` (unmounts the feedback), stop the audio/TTS/microphone of that screen, THEN ask for the ad. | all 6 quiz screens | `round6-handlers-test.cjs` (order: feedback closed before the ad is asked for), `interstitial-test.cjs` 14 (static order) |
| R6-3 guards do not cover every entry point | Engine A sign-quiz in-app Back had no guard (two calls popped two pages); the B question arrow bypassed `advancingRef`; the A transition cleared `advancingRef` before its async navigation finished. | A: `handleBack` has `leavingRef` + try/catch release (same as the other exits). One `advancingRef` per screen now covers feedback Next AND the › arrows (A/B question, A/B behavioral, A/B topic-quiz); every async navigation inside it is awaited (`await navigateToQuestion`, `await handleBack`). B question: arrow and feedback Next share the guard (core step runs inside it, no deadlock). | A question, B question, behavioral x2, topic-quiz x2 | `sign-quiz-back-test.cjs` (double Back, failed exit), `round6-handlers-test.cjs` (two Next taps: 5 screens) |
| R6-4 abandoned transition shows an ad / navigates back | Confirmed by reading: nothing cancelled the continuation after Back. | NEW `hooks/useScreenActive.ts` (ref true while focused). `maybeShowInterstitial(canShow)`: after the last disk access and before `show()` it asks the screen; if the learner left, nothing is shown, the counter is restored (stays due). After the await each transition checks `activeRef.current` and does NOT continue (no next question, no location prompt, no `handleBack`). Exam: the ad gets the check; the result page is still opened (the exam is over). | `services/interstitial.ts`, all 6 quiz screens, A/B exam | `interstitial-test.cjs` 25 (left during the disk read: nothing shown, stays due, shown at the next transition), `round6-handlers-test.cjs` (left during the ad wait: no continuation, guard released) |
| R6-5 policy describes the old placement | Yes: `docs/privacy-policy.html` lines 173 and 321. | NOT changed. Waiting for the owner's approval of the wording (your suggested sentence), then Gemini translation with the back-translation check, then publishing. | docs | please check my proposed sentence below |
| Bypass paths (accepted-defer, but you said not to claim full coverage) | The A behavioral › arrow and both topic-quiz › arrows called the move directly. | Superseded by the owner decision below: the ad is only at the END of a quiz, and the arrows never show one (they keep the shared guard). | all | see below |
| Synchronous `show()` throw (pre-existing) | Real: the throw skipped the "stay due" restore. | `catch` around the show promise, so the not-opened branch runs. | `services/interstitial.ts` | `interstitial-test.cjs` 26 |

Mutation checks I did (to prove the new tests are not decoration): with the answer lock deleted the R6-1 test fails (2 counts); with the
`!(await passAdGate())` check turned into a plain `await passAdGate()` the R6-4 test fails (moved on after the screen was left). Both files restored.

## Owner decision after Round 6 (2026-10-27): the ad only at the END of a quiz
The owner asked whether an ad could fall between two questions of a quiz (for example after answering 7 questions elsewhere, then 2 in a new
quiz). It could, by the 9-answer rule, and the owner chose the friendlier option: the ad is shown ONLY at the end of a quiz, after the feedback of
its last answer, never between two questions. Same rule in both engines and every topic (signs, behavioral, topic quiz, daily quiz); the exam
already showed it only at its end. Counting is unchanged (every answered question counts; an ad that falls due mid-quiz waits for the end of that
quiz). Implementation: each `handleNext` computes `isLast` and calls `passAdGate()` only when it is true; between questions the move is the old
one. The › arrows never show an ad any more (they only keep the shared `advancingRef` guard). Tests: `round6-handlers-test.cjs` now has a
"between two questions: no ad is asked for" scenario per screen (5 screens) next to the end-of-quiz ones.

Proposed policy sentence (English, not yet in the file, replaces the earlier proposal): "After the first two app launches, the app may show a
full-screen Google ad at the end of a quiz or after an exam, once you have answered several questions since the last one. It does not appear
while a question, its spoken feedback or an exam is in progress."  (The exact number nine is deliberately not promised in the policy.)

## Please verify
1. R6-1 to R6-4: the new `passAdGate`/`advancingRef` structure on all 6 screens; anything that can leave `advancingRef` or `leavingRef` stuck (the A sign quiz
   `handleBack` keeps its guard on after a successful exit on purpose; the screen is leaving).
2. `useScreenActive` (focus ref) semantics under expo-router: false on blur and unmount; the ad (a native activity over our app) must NOT make it false.
3. In `showOnce`, the `canShow` check happens after the preferences write and restores the counter when false; no await between the check and `inst.show()`.
4. That hiding the feedback BEFORE the ad cannot leave the learner able to answer again or skip (answered state stays; locks hold).
5. Tests: see Part 2, item 6 (all files together).

Known and accepted: device-only checks (layout width on a 320 dp phone, native audio focus, the ad itself).

## Part 2: findings from the owner's testing of the APK (2026-10-27), and how each was fixed

The owner installed a preview APK of Part 1 and tested it on a Samsung phone (Android, 3-button navigation bar). Everything in
Part 1 behaved as intended; these are the additional findings. Each was traced in the code before fixing. Same rules: please
look for what each fix could break, and for anything slow or over-complicated.

| # | Finding (owner) | Root cause found | Fix | Where |
|---|---|---|---|---|
| U1 | Engine B, results of the 30-question exam: the "try again" and "home" buttons are a third covered by the navigation bar; the bottom row of the B sign quiz (‹, sign thumbnail and its label, ›) is cut; the ← at the top sits on the status bar | Expo SDK 57 draws edge to edge on Android. 21 screens used React Native's `SafeAreaView`, which does nothing on Android, so nothing kept content out of the status bar, and 6 places had no bottom room for the navigation bar | NEW `components/shared/ScreenSafeArea.tsx` (react-native-safe-area-context, edges top/left/right) replaces RN `SafeAreaView` in all 21 screens by an aliased import only (the JSX is unchanged). The bottom edge is NOT added there on purpose: screens that already add `insets.bottom` would get a double gap. The 6 places without bottom room now add `insets.bottom` to their last scroll content or bottom bar: exam result, A and B topic-quiz result, B topic-quiz questions, B practice, B sign quiz bottom bar, B behavioral bottom bar. Root status bar `style="dark"` (white icons were unreadable on the light screens once they no longer draw under the bar); the two dark practice screens set `light` themselves. Absolute-positioned children were checked: only sign-number badges inside images (unaffected) | 21 screens, `app/_layout.tsx`, 6 bottom places |
| U2 | Engine B: the feedback is read aloud by itself; it should only play when the learner asks (Engine B is for readers) | `TextFeedback` called `speakAndAwait(ttsText)` on mount | No automatic reading. A ▶️ / ⏸ button (same look as the sign quiz's audio button) reads `ttsText` on demand; it shares the existing interruption handling and stops the "why?" reading if that was speaking (one TTS engine). Only Engine B behavioral passes `ttsText` | `components/engineB/TextFeedback.tsx` |
| U3 | Engine B: "ቀጣይ" (Next) on the feedback often does not react to the first tap | Most likely the automatic reading started on the same frame: the JS thread is busy fetching and preparing speech, so the tap is handled late; on the last question the ad decision added a wait | U2 removes the automatic reading. Next now stops any reading synchronously (fire and forget) before calling `onNext`, and the Part 1 transitions close the feedback first | `TextFeedback.tsx` (+ Part 1) |
| U4 | Engine A sign quiz: sometimes (3 times in a short period) the audio after an answer took a long time to start; fear of a learner stuck with a weak connection | The answer's feedback clip is downloaded in the background when the quiz opens (priority "now"); answering quickly (for example right after moving to another sign with the arrows) finds it not cached yet, so it streams from the network. The real risk: `AudioFeedback` shows Next only when the clip ENDS, so a clip that never starts leaves a non-reader with no way forward | Next is offered when a recorded clip has not STARTED within 6 s (`CLIP_START_TIMEOUT_MS`; once it plays, the end is awaited as before) and when spoken (TTS) feedback has not finished within 15 s (`SPEECH_TIMEOUT_MS`). The cache code is NOT changed (download priority already exists) | `components/engineA/AudioFeedback.tsx` |
| U5 | Engine B progress screen: the per-topic list shows `regulatory`, `warning`... in English, while the exam result shows Amharic | The progress screen printed the raw topic id | The topic-name list is moved unchanged (byte-compared before removal) from the exam result screen to `constants/topicNames.ts`; both screens use it. Engine A's progress screen has no per-topic list (symbols only) | `constants/topicNames.ts`, `app/(engineB)/(tabs)/progress.tsx`, `app/result/[sessionId].tsx` |
| U6 | The daily quiz should end like the 30-question exam: score per topic, the questions answered wrong, practise them, try again. Engine B with text, Engine A symbols only | The topic-quiz result (also used by the daily quiz) had only the score and buttons | The exam result's review (topic breakdown, wrong signs/questions, "practise the wrong ones") is moved unchanged into NEW `components/shared/QuizReview.tsx`, used by the exam result and by the daily quiz result in both engines (only for `topicId === 'daily'`). NEW `utils/quizReview.ts` builds the same data the exam builds, from the ANSWERED questions only (the › arrow can skip one). `useTopicQuiz` additionally returns `answers` (read only). "Try again" keeps the existing `restart` (new random questions) | `QuizReview.tsx`, `utils/quizReview.ts`, `hooks/useTopicQuiz.ts`, A/B topic-quiz |
| U7 | Behavioral topics: from a quiz (or its end screen) the ‹ › arrows open the next subtopic's LESSON; the owner wants the next QUIZ, like the sign quiz arrows | `navToSubtopic` always opened the subtopic in its explanation phase | The arrows keep the step: from the explanation they open the next explanation, from the questions or the end screen they open the next subtopic with `?start=quiz`, which starts it in the questions phase (only when it has questions). Both engines, all 7 behavioral topics | A/B `behavioral-subtopic/[id].tsx` |
| U8 | (owner idea) a full-screen ad when opening the progress tab | not a bug | NOT done, by the owner's decision after my advice: a full-screen ad on a tab tap, before the content, is the "unexpected" placement Google warns about, and the screen already has a banner | none |
| U9 | Text scan (my own, asked by the owner): any English or Hebrew shown to the learner | | No Hebrew found in shown text. English: `Coming soon` (B behavioral fallback for a topic not built; all are built, so it is unreachable) and the `DISCLAIMER` chip (part of the approved disclaimer). Both left as they are | none |

Tests added: NEW `round7-ui-test.cjs` (9 scenarios: the safe-area wiring of all 21 screens and the 6 bottom places, status bar,
Engine B feedback never reads by itself and Next stops reading, behavioral arrows keep the step, the shared review on the exam and
both daily quizzes, a run of the REAL `buildQuizReview` with a skipped question, Amharic topic names, Engine A Next fallback).

## Please verify (Part 2)
1. U1: that no screen now has a double bottom gap or lost bottom room (the 15 screens that already handled `insets.bottom` keep it;
   the 6 new places), that the tab screens rely on the tab bar for the bottom, and anything that measured its own layout
   (`useFitImageSize`, `bottomNavHeight` → `TextFeedback.bottomOffset`) still works with the extra top padding.
2. U2/U3: the ▶️ button and `handleNext` in `TextFeedback` (ownership of the single TTS engine between the feedback reading and the
   "why?" reading; unmount while reading).
3. U4: the two timeouts can only ADD a Next button; they must never hide one or cut a clip that plays.
4. U6: `QuizReview` is a verbatim move (compare with the result screen at HEAD), `buildQuizReview` matches `useExam`'s breakdown
   and wrong-question shape, the review only appears for the daily quiz, and leaving for a sign or for practice stops both audio
   engines first.
5. U7: `start=quiz` with a subtopic that has no questions; the A narration effect must not start in that case.
6. `node planning/codex-qa-2026-10-06/tests/run-all.cjs` (expected 29 of 29) and `npx tsc --noEmit`.

## Deliverable
`planning/ad-events/CODEX_ROUND7_REPORT.md`, same format. Write findings as you go.
