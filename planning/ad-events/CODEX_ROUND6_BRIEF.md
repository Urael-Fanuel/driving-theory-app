# CODEX brief: Round 6 (2026-10-27). Full-screen ads by answered questions, back-button changes, completion-screen arrows

Branch `upgrade/expo-57`, uncommitted. Same ground rules as before: review and test only, write only the report. No build,
nothing applied to Supabase (no SQL in this round). Please re-fingerprint the project files first; this round changes the
files listed below and nothing else (git status shows them).

All of it comes from the owner's own testing of build 10 on a phone (internal test track), 2026-10-27.

## The problems the owner found, and how each was fixed

| # | Problem found | What was wrong | Fix | Where |
|---|---|---|---|---|
| P1 | No full-screen ad in the sign quizzes (3 questions per sign), in either engine | `app/(engineA\|B)/question/[id].tsx` never called the ad service; the ad only existed on the "subtopic finished" and "topic quiz result" screens | The ad is now counted in ANSWERED QUESTIONS, everywhere: one ad per 9 answered questions, whatever the topic. `countAnsweredQuestion()` is called once when an answer is given; `maybeShowInterstitial()` no longer counts, it only shows when 9 are counted and an ad is loaded | `services/interstitial.ts` (rewritten core: `answersSinceShown`, `QUESTIONS_PER_AD = 9`, `countAnswer`, `decide`, `countAnsweredQuestion`) |
| P2 | Owner wants "9 answers in total", even if spread over several topics, not "3 whole quizzes" | The old rule counted end points (finished quizzes) | Same change as P1. Behavioral topics use the same 9 (was every 2nd finished subtopic). Counter name changed (`sinceShown` to `answersSinceShown`): an old preferences file from build 10 is read safely and starts at 0 | `services/interstitial.ts` |
| P3 | A learner could skip an ad by leaving with the phone's back button | The ad ran inside `handleBack` (exit), and the phone back button was wired to it only partly | The ad is no longer tied to leaving at all. It runs at the transition AFTER an answer's feedback: the move to the next question, to the end screen, or (exam) to the result. An ad that is due but not loaded or not shown stays due (counter kept) and appears at the next transition | handleNext of the 6 quiz screens (see below) |
| P4 | Phone back button needed many presses | The phone's back button was wired to the in-app exit (`return true` swallowing the press, then one guarded exit at a time, plus waiting for audio and for the ad decision), so fast presses were ignored | The phone back button is back to normal Android behaviour: the listener only STOPS the audio / microphone and `return false` (the press carries on to the default, one screen back, however fast). The in-app ← button keeps its single-flight guard | `hardwareBackPress` listener of: A+B behavioral-subtopic, A+B topic-quiz, A question |
| P5 | A sign quiz left a duplicate sign page behind | Engine A `question/[id]` `handleBack` did `router.replace(sign/<id>)` while the sign page it came from was still below it in the stack, so the page existed twice and the next back press only removed the copy | `handleBack` now does `router.back()` when the page below is this sign's page. After the ‹ › sign arrows moved the quiz to another sign, the page below is a different sign, so then it opens the CURRENT sign page (`router.replace`). The arrows hand the starting sign along as `?origin=<sign>` (`origin || signId`) | `app/(engineA)/question/[id].tsx` (Engine B already used `router.back()`) |
| P6 | Behavioral completion screen had only a back button (owner wanted ‹ › like the sign quiz) | After the last question the learner had to go back to the list and choose the next subtopic | Both engines: ‹ previous subtopic, round ← back, › next subtopic. Reuses the existing `navToSubtopic` (stops audio, `router.replace`) and `prevSubtopic`/`nextSubtopic` | `app/(engineA\|B)/behavioral-subtopic/[id].tsx` (complete phase, new styles `completeNavRow`, B: `completeBackBtn`) |
| P7 | Engine B completion screen: the wide "back to list" button touched both screen edges | `continueBtn` is `alignSelf: stretch` inside a container with no side padding | The wide button is gone; replaced by the same round row as P6 (title keeps its own side padding) | Engine B behavioral-subtopic |

Where the ad is shown now (one `await maybeShowInterstitial()` at the START of the transition, with an `advancingRef` guard so a second tap
cannot move on twice while the ad is open): Engine A `question/[id]` `handleNext` and the › question arrow (only when the question is
answered); Engine B `question/[id]` `handleNextQuestion` + `handleFeedbackNext` (last question); A and B behavioral `handleNext` (+ B ›
question arrow); A and B topic-quiz `handleNext` (also the daily quiz, same screen). The exam (A and B tabs) counts its answers
(`hooks/useExam.ts`) but shows the ad only once, when it ends, just before `router.replace('/result/...')`.
Counted at: `hooks/useTopicQuiz.ts` `submitAnswer` (topic quiz, daily quiz), `hooks/useExam.ts` `submitAnswer`, A/B `question/[id]`
`handleAnswerSelect`, A/B behavioral `handleAnswerSelect`. NOT counted and no ad: the weak-question practice (`practice.tsx`, both engines).
Unchanged on purpose: first 2 launches show no ad; consent gating; single-flight; 90 s safety timer; sponsor-card covering.

## Tests
- `interstitial-test.cjs` rewritten for the new rules (24 scenarios, includes wiring checks that no `handleBack` shows an ad, that the phone
  back listener returns false and does not call `handleBack`, that every transition has the ad at its start, and that the exam shows it only at its end).
- `handleback-test.cjs`: the "C1 two taps while the ad is open" scenario became "two taps at the same moment: one navigation and NO ad".
- NEW `sign-quiz-back-test.cjs`: extracts the REAL Engine A `handleBack` and runs it for the 4 cases of P5.
- `practice-answers-test.cjs` scenario 4: also asserts the exam answer is counted once.
- Expected: `node planning/codex-qa-2026-10-06/tests/run-all.cjs` = 27 of 27, and `npx tsc --noEmit` clean.

## Please verify (think about what this could have broken elsewhere)
1. **Ad timing / counting**: counting is asynchronous (`serial` queue) and the transition reads it later; can an answer be counted twice
   (double tap on an answer, `answeredIndex`/`selectedAnswer` guards, `submitAnswer` phase guard), or missed? Can the ad appear while a question
   is open, audio is playing, or the feedback overlay is still speaking? Is there a path from an answered question to the next screen that does NOT
   pass through one of the transitions above (skip possible, or an ad forced twice)?
2. **`advancingRef`** guards: any path where it stays `true` (an exception inside the ad call, the location prompt, navigation) and blocks all next
   taps? (They reset in `finally`.) Anything that now double-fires?
3. **P4**: with `return false` is the press really handled by expo-router's default exactly once (no double pop), also on the topic-quiz screens
   which use `stopForBackRef`? Audio really stopped before leaving (A: `stopAudio`, microphone `cancelListening`; B: speaking flag + `stopTTS`)?
   Engine B `question/[id]` and the exam/practice screens have no such listener (they never had one); is anything there inconsistent in a harmful way?
4. **P5**: the sign page below the quiz really is the sign it started from in every way the quiz can be opened (only `sign/[id]` pushes it);
   `router.back()` after `router.replace` with `?origin=`; the case "arrows X to Y and back to X". Known and accepted: after browsing to ANOTHER sign
   the page of the starting sign stays below (one extra page); `router.replace` was kept there on purpose as the least risky.
5. **P6/P7**: layout on a narrow phone (72 + 16 + 120 + 16 + 72 in A; 52 + 20 + 72 + 20 + 52 in B), both completion screens, and that the existing
   `navToSubtopic` is safe from the complete phase (it replaces the route; `leavingRef` is per screen instance).
6. Old preferences file handling (`answersSinceShown` missing: reads as 0) and the "due ad stays due" logic after a failed show.
7. Policy text: `docs/privacy-policy.html` line 173 (`adsFullScreen`) still says the full-screen ad appears "when you finish a subtopic or a topic
   quiz, never during a lesson, a question or an exam". Now it appears after the feedback of an answer, between questions or at the end of a quiz, and
   at the end of an exam. Not changed yet: a new English sentence, the Amharic translation and republishing need the owner's approval (the
   owner decides); please say whether the old sentence is now inaccurate enough to block the release.

Known and accepted, not new: device-only checks; the ad request itself; the rare screens that bypass every transition keep the ad due (it appears at the next one).

## Deliverable
`planning/ad-events/CODEX_ROUND6_REPORT.md`, same format as the earlier reports. Write findings into the report as you go, so a stop does not lose them.
