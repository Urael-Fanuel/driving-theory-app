# CODEX brief: Round 8 (2026-10-28). Short and targeted: the four findings of CODEX_ROUND7_REPORT.md

Branch `upgrade/expo-57`, uncommitted. Same ground rules: review/test only, write only the report. No build, no SQL, nothing
published. **Please keep this round SHORT** (the owner's CODEX plan runs out of tokens on long reviews): check only the four
fixes below and what they could break, write the report as you go, and do not repeat what Round 7 already approved.

I checked each Round 7 finding against the code before fixing it: all four were real, and I confirmed that the new tests fail
when the fix is removed (mutation checks, listed at the end).

| Finding | Fix | Where | Test (NEW `round7-fixes-test.cjs`, 14 scenarios, real extracted functions) |
|---|---|---|---|
| R7-1 two Engine A floating Back buttons inside the status bar | The two buttons are `position: 'absolute'` and ignore the frame's top padding. Both now get `top: 12 + insets.top` inline (both screens already had `insets`). A scan with a brace-aware parser found no other absolute element that sits at the top of a screen (the rest are badges inside cards; `VideoModal` has its own absolute close button inside its own Modal) | `app/(engineA)/question/[id].tsx`, `app/(engineA)/behavioral-subtopic/[id].tsx` | wiring check of both styles |
| R7-2 the 15 s escape can reach the exam's ad while the feedback speech is active | (a) `AudioFeedback` tracks `ttsActiveRef` (true from the start of `speakAndAwait(ttsText)` until it settles) and its unmount cleanup now cancels the speech when that flag OR the "why?" flag is set, so hiding the overlay (Next) stops a speech that is still loading or playing; a late fetch cannot start after `stopTTS` (generation check in `utils/googleTTS.ts`). (b) Both exams stop their audio first (A: `stopAudio` + `stopTTS`; B: `stopAudio`; B's panel stops its own readings on unmount) and only then ask for the ad and open the result | `components/engineA/AudioFeedback.tsx`, `app/(engineA\|B)/(tabs)/exam.tsx` | static order checks (ad request after the audio stop; flag set before the speech starts; cleanup condition) |
| R7-3 an old manual reading clears the flags of a newer one (Engine B feedback) | One owner token `readingOp`: every start, stop, Next and unmount takes a new number (`endReading()`), a completion may only clear its flags when its number is still current. Starting a feedback reading ends a "why?" reading and the other way round (one speech engine). Next/unmount stop whatever is current | `components/engineB/TextFeedback.tsx` | your A → B → C sequence and the reverse, a stopped reading finishing late, normal completion, Next with nothing playing |
| R7-4 later location-preferences wait can still navigate after the learner left | `useLocationPrompt.maybeShow(canShow?)`: after the preferences read, and again after the re-ask write, it returns `false` (no primer, nothing marked) when the screen says it was left. All four last-question transitions pass `() => activeRef.current` and, after the await, return without Back / `setPhase('complete')` when the screen was left (B sign also re-checks after its `stopAudio`) | `hooks/useLocationPrompt.ts`, A/B sign quiz, A/B behavioral | real `maybeShow` with held read and held write; the four real transitions with a held location read |

Mutation checks I ran (then restored): without the token check in `handleTtsSpeak` the A → B → C and the stopped-reading scenarios
fail; without the post-location `activeRef` check the A sign, A behavioral and B behavioral scenarios fail (B sign has two checks, so
removing one still passes, by design).

## Addition after the owner's test of build 11 (R8-5): Engine B "Next" ignored on the first tap(s)
Reported on build 10-era APK and again on build 11 (internal test): in Engine B, after choosing an answer and tapping "ቀጣይ" at once,
the button does not react until the 2nd or 3rd tap. I could not reproduce it without a device, so this is the most likely cause, not a
proven one: the feedback panel appeared only after a `setTimeout(..., 200)` and then slid up with a spring (~0.5 s), so for roughly
0.7 s the Next button was not where the finger went (the tap landed on the already-answered cards and was ignored).
Fix: the panel is shown at once (the `setTimeout` is gone in the 5 Engine B screens that used it: sign quiz, topic quiz, behavioral,
exam, practice) and `TextFeedback` only fades in (120 ms), with no slide, so the button is at its final place from the first frame.
Files: `components/engineB/TextFeedback.tsx` (removed `slideAnim`/spring), the 5 screens above. Test: `round7-ui-test.cjs` (new scenario, static).
Please check: nothing relied on the 200 ms (for example the answer-card colour is still seen: the panel is partly transparent for 120 ms and sits
below the cards), and no stale timer is left behind (the old timers could show the panel after a quick arrow tap).

**R8-5 extended to ALL Engine B question types and exams (owner's request):** besides the panel timing above, the Next handlers were checked
one by one. Found and fixed: (a) **B exam** `handleNext` awaited `stopAudio()` BEFORE closing the panel and had no guard: a slow stop made the
button look dead and a second tap ran `nextQuestion` twice (a question skipped); now the panel closes on the tap, the stop is not awaited
and a guard (`advancedRef`, reopened when the phase returns to `question`/`result`) allows one Next per question. (b) **B practice** had the same
double-tap problem (`nextQuestion` filters the queue by the current index, so a second call took a second question out); same guard.
(c) **B sign quiz** `handleNextQuestion` awaited `stopAudio()` before opening the next question; the stop is now fire-and-forget (`stopAudio`
claims the audio ticket synchronously, so a later start is unaffected). Checked and unchanged: B topic quiz / daily quiz and B behavioral
(already hide first and do not wait before the move in the middle of a quiz). New tests in `round7-fixes-test.cjs` (4 scenarios, real
handlers; the guard test fails when the guard is removed).

## Not changed, deliberately (your own qualifications)
- Empty subtopic with `start=quiz` (A narration would start): no current content route (69 of 69 subtopics have questions). Left as a
  future-content guard.
- "No await between the ad check and `show()`" is not literally true (a microtask boundary). No ordinary-device failure is
  established. Left.
- Exam result navigation after leaving an already-finished exam: accepted exception, as before.
- Policy text (R6-5): the owner approved the English sentence; the Amharic translation could not run today (Gemini credit depleted),
  so the page still has the old sentence. It will be translated, checked by back-translation and published with the release.

## Please verify (briefly)
1. The four fixes above and that they did not break the normal paths: ordinary last-question flow with the primer shown, feedback Next
   in the middle of a quiz, exam finish with no audio playing.
2. `useScreenActive` + `canShow` callers: nothing keeps `advancingRef` / `leavingRef` stuck.
3. `node planning/codex-qa-2026-10-06/tests/run-all.cjs` (expected 30 of 30) and `npx tsc --noEmit`.

## Deliverable
`planning/ad-events/CODEX_ROUND8_REPORT.md`, same format, short. If you cannot write into the project folder, put the report in your
final message instead.


## After the independent QA of this round (`QA_ROUND8_REPORT.md`, 2026-10-28)
Both P2 findings were verified in the code and fixed; tests run the real functions and fail when each fix is removed.
- R8-A (Engine A "why?" reading, stale completion): `AudioFeedback.handleExplainWhy` has an owner token `ragOp` like `TextFeedback`.
- R8-B (moving between answered questions): `nextQuestion` in `useTopicQuiz` and `useExam` shows an already answered next question in its
  answered state (as the arrows do) instead of an open question that refuses an answer; the feedback-panel effect of the A and B topic quiz
  and exam is keyed on `[phase, currentIndex]`; the B exam Next guard opens again on every move.
- Notes fixed: N5 (B behavioral no longer awaits the speech stop / haptic before showing the answer), N6 (B practice Next stops the
  explanation clip). Not changed: N2 (device decides), N3, N4 (Engine A timers, Engine A works as the owner tested), N7, N8 (owner judges on the
  phone), N9. New test file `round8-fixes-test.cjs` (6 scenarios). Suite: 31 of 31; `tsc` clean.

## Follow-up QA (2026-10-28, after the owner's colour finding): `QA_ROUND8_REPORT.md` section "Follow-up"
- Owner finding: the "why?" explanation text in Engine B's `TextFeedback` was white on a light-blue card: `ragText` now uses `#191c1e` (only change; contrast 1.14 to 14.99).
- R8-C (exam saved twice with a slow last save): `finishingRef` in `useExam.nextQuestion`, reopened by `loadQuestions`. R8-D (Engine A spoke the feedback of another question): the
  topic-quiz and exam A show-effects build the spoken text from the question on screen and the stored answer (form accepted by the speech guard of `scripts/recordTts.mjs`, which is unchanged) and
  cancel their 300 ms timer. Not fixed, reported: N10 (the `ቀጣይ ›` label contrast in the panel is low but the button is outlined and recognisable). Tests: `round8-fixes-test.cjs` (10 scenarios, each fails
  when its fix is removed). Suite 31 of 31, `tsc` clean.
