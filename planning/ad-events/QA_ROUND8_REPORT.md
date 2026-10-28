# Round 8: independent QA review (in place of CODEX for this round)

**Verdict: APPROVED for an internal-test build. Not yet approved for production: two new P2 findings (R8-A, R8-B) should be fixed first.** The four Round 7 fixes (R7-1 to R7-4) and the R8-5 "Next" changes do what the brief says, and I found no regression caused by them. R8-A is the R7-3 bug class, still present in the Engine A feedback panel. R8-B is a navigation problem between already-answered questions: one part is old, the other was made worse by Round 6. Both fixes are small. If the build has not been made yet, they can go into it.

Reviewed against CODEX_ROUND8_BRIEF.md and CODEX_ROUND7_REPORT.md on 2026-10-28. HEAD `4b9500d`, all reviewed changes uncommitted on `upgrade/expo-57` (fingerprints at the end).

Review and tests only. The only file I wrote inside the project is this report. Scratch reproductions are outside the project. No build, no SQL, no network call to app services, no `.env` read, no git command that changes anything. Reproductions execute the REAL functions extracted from the source with the TypeScript parser (and, where stated, the REAL `utils/googleTTS.ts` with a fake player and a held network), not a mounted React tree and not a device.

## Findings

### R8-A: P2. The Engine A "why?" reading has the same stale-completion bug that R7-3 fixed in Engine B, and the R7-2 unmount stop depends on it

Locations: [AudioFeedback handleExplainWhy](<C:/Users/Yakov/Desktop/driving-theory-app/components/engineA/AudioFeedback.tsx:95>) (stop branch at line 100, completion at lines 119-121), [its unmount cleanup](<C:/Users/Yakov/Desktop/driving-theory-app/components/engineA/AudioFeedback.tsx:86>). Most exposed caller: the Engine A sign quiz [question/[id].tsx](<C:/Users/Yakov/Desktop/driving-theory-app/app/(engineA)/question/[id].tsx:720>), which never calls `stopTTS` itself. Its `navigateToQuestion` (line 448), `passAdGate` (end-of-quiz ad) and `handleBack` stop only `useAudio`, so to stop the spoken "why?" explanation they rely entirely on this cleanup.

R7-3 was fixed with an owner token in `TextFeedback` (Engine B) only. `AudioFeedback.handleExplainWhy` (Engine A, unchanged this round) still clears `ragSpeakingRef` unconditionally when its `speakLongAndAwait` returns. The new R7-2 cleanup (`if (ragSpeakingRef.current || ttsActiveRef.current) stopTTS()`) trusts that flag.

**Reproduction (real `handleExplainWhy` + real unmount effect, run against the REAL `utils/googleTTS.ts` with a fake player and a held live-TTS request):**
1. Tap "why?" (reading 1). Its live speech request is pending (slow connection: the learner hears nothing, the icon shows ⏸).
2. Tap again (⏸ stop), then tap again (reading 2 starts, text already fetched).
3. Release reading 1's request. The service sees it was replaced and returns, and the handler then clears `ragSpeakingRef`.
4. Release reading 2's request: it plays. Run the unmount cleanup (what Next or leaving does).

Observed:
```text
flag after late completion = false | ragSpeaking state = false | audible before unmount = 1
stopTTS by unmount = 0 | audible after unmount = ["file:///tts/RAG-EXPLANATION.mp3"]
```
Control runs pass: a single "why?" reading is stopped by unmount, and the R7-2 feedback-speech cases pass (closure table below).

**Why it matters to a learner:** on the Engine A sign quiz (276 signs, the most used Engine A quiz) the "why?" explanation, which can last a minute or more, keeps talking over the next sign question's own audio, through the end-of-quiz full-screen ad, or after Back. The learner cannot read and cannot stop it. The button shows 🤔 again, and tapping it restarts the explanation from the beginning. The trigger is natural on the weak connections this round is about: tap, hear nothing, tap twice more. Other Engine A screens with this panel (topic/daily quiz, exam, practice, behavioral) also call `stopTTS` themselves when they move on, so there the screen cuts the leak. The sign quiz has no such backup.

**Small fix (validated):** the same owner token as `TextFeedback`: a `ragOp` ref, incremented in the stop branch and at each start, and `if (ragOp.current !== op) return;` after `await speakLongAndAwait(text)`. I applied it to a scratch copy of the file and reran the same reproduction. The original fails ("still audible after unmount") and the copy with the token passes. Optionally, also make the sign quiz's `passAdGate` call `stopTTS()` like the topic and behavioral gates do, so the ad never depends on the panel's flags alone.

**Closure test:** the four steps above with the real speech service. After unmount nothing is audible, and reading 2's flag survives the late completion of reading 1. Also: a single reading is still stopped by unmount, and a normal completion clears the flag.

### R8-B: P2. Moving between ALREADY-ANSWERED questions can leave the learner with no working control (topic/daily quiz and exam)

This round's diff did not cause it. It is the same "I tap and nothing happens" family that the owner reported (R8-5), and the brief says every Engine B Next path was checked. There are two mechanisms. I reproduced both with the REAL hook callbacks (`submitAnswer`, `nextQuestion`, `goToQuestion`, re-created on every simulated render) and the REAL screen handlers (`handleNavPrev`, `handleNavNext`, `handleNext`, `passAdGate`).

**(1) Next opens an already-answered question as if it were open, and taps on it are now ignored.** [useTopicQuiz.nextQuestion](<C:/Users/Yakov/Desktop/driving-theory-app/hooks/useTopicQuiz.ts:143>) and [useExam.nextQuestion](<C:/Users/Yakov/Desktop/driving-theory-app/hooks/useExam.ts:207>) always set `phase = 'question'` for the next index without checking whether it was already answered. Only `goToQuestion` checks. Since Round 6 (R6-1, same uncommitted candidate), `submitAnswer` refuses a second answer to the same question ([useTopicQuiz.ts:123](<C:/Users/Yakov/Desktop/driving-theory-app/hooks/useTopicQuiz.ts:123>), [useExam.ts:170](<C:/Users/Yakov/Desktop/driving-theory-app/hooks/useExam.ts:170>)). Sequence: on question 1, tap › (skip), answer question 2, tap ‹ back to question 1, answer it, then press the panel's Next.
```text
topic quiz: index=1 phase=question; the tap on an apparently open question did nothing (answers=2)
exam:       index=1 phase=question; the tap on an apparently open question did nothing (answers=2)
```
If the skipped-ahead question was the LAST one, Next from the question before it lands on it the same way (`index=9`/`index=29`, `phase=question`), and there › is disabled. The only escape is ‹ and then › (which uses `goToQuestion`). At HEAD the same tap was accepted and question 2 was recorded twice (`answers recorded = 3`, so the score and total were wrong). R6-1 turned that scoring error into a dead screen. It applies to both engines: the Engine A topic/daily quiz and exam use the same hooks, and Engine A's voice answer is refused the same way.

**(2) Engine B: looking back from the last question removes the only Next.** The panel is opened by an effect keyed on `phase` only ([B topic quiz](<C:/Users/Yakov/Desktop/driving-theory-app/app/(engineB)/topic-quiz/[topicId].tsx:134>), [B exam](<C:/Users/Yakov/Desktop/driving-theory-app/app/(engineB)/(tabs)/exam.tsx:76>)). The ‹ › arrows hide the panel and call `goToQuestion`. When the question they land on has the same result as the current one, `phase` keeps the same value, the effect does not run, and the panel stays hidden. Sequence: answer every question correctly, then on the last question tap ‹ (to look at the previous answer) and then ›.
```text
B topic/daily quiz: after ‹ -> Q9/10 phase=feedback_correct panel=hidden | after › -> Q10/10 phase=feedback_correct panel=hidden canGoNext=false
B exam:             after ‹ -> Q29/30 phase=feedback_correct panel=hidden | after › -> Q30/30 phase=feedback_correct panel=hidden canGoNext=false
```
With no panel there is no Next, and › is disabled on the last question. The quiz or the 30-question exam can no longer be finished, and the only way out is ✕/Back, which loses the exam. Control: when the previous answer was wrong and the last one right (a different `phase`), the panel comes back and Next reaches the result. The HEAD files give the same result for this sequence, so this part is old, not a regression. In Engine A the full-screen overlay covers the arrows while it is shown, so (2) cannot be reached there in normal use.

**Why it matters:** a learner who reviews an answer, or comes back to a skipped question, meets a quiz that looks open but does not respond, or cannot be finished at all. A 30-question exam is the worst place to lose the session.

**Small fix:** (1) In both `nextQuestion`s, move to the next question that has NO answer yet, or finish when none is left after the current one. This keeps R6-1's "one answer per question". (2) Key the panel's show-effect on the question too, for example `[phase, currentIndex]` in the B topic quiz and B exam (and the same in the Engine A topic quiz and exam effects, for consistency). Then landing on any answered question shows its panel and its Next.

**Closure test:** the two sequences above with the real hook and screen functions. After Next, the learner is on an unanswered question (a tap records exactly one answer) or on the result. After ‹ then › on the last answered question, the panel is shown and Next reaches the result. No question is recorded twice.

## Brief items: closure

| Item | Result | Evidence |
|---|---|---|
| R7-1 floating Back buttons | **Closed** | Both use `top: 12 + insets.top` inside a frame that also shifts the content by `insets.top`, so the reserved `paddingTop` still lines up. Every other `position: 'absolute'` in `app/` and `components/` is a badge inside a relative card, a bottom-anchored panel, a full-screen overlay with centred content, or a pointer-less confetti layer. The A behavioral 404 fallback's Back is in normal flow. `VideoModal`'s close sits at `top: 48` inside its own translucent Modal (not changed). No device pass done. |
| R7-2 (a) feedback speech cancelled on leaving | **Closed for the reported path** | Real mount and unmount effects with the REAL speech service: speech still fetching at 15 s, Next offered, unmount stops it, and the late fetch never plays. Speech playing at 15 s: offering Next does not cut it, and unmount stops it. After a normal completion the flag is clear and unmount stops nothing (no stray stop of the next screen). The "why?" reading in the same component is not covered: see **R8-A**. |
| R7-2 (b) exams stop audio before the result ad | **Closed** | Real result effects with held stops: A runs `store > stopAudio > stopTTS > ad > replace`, B runs `store > stopAudio > ad > replace`. The ad is not requested until the stops settle, and a failing stop does not block the result. |
| R7-3 TextFeedback reading owner | **Closed** | With the REAL speech service: feedback A (slow), why B, feedback C, A answering late: C keeps its flag and Next silences C. Why, stop, why again, first one answering late: the flag survives and unmount silences it. Next while C is still loading: the late fetch never plays. Leaving with the arrows or Back while ▶️ plays: unmount silences it. The interruption/resume branch only resumes the reading this panel owns. |
| R7-4 location wait after leaving | **Closed** | REAL `maybeShow` wired into the REAL last-question transitions of all four screens, 36 cases. Leaving during the read (first ask, already approved) or during the write (re-ask due, re-ask not due): no primer, no Back/complete, guard released. Staying on the screen (first ask, approved, re-ask due/not due, exhausted): always a primer OR Back/complete, never neither. `readPrefs`/`writePrefs` catch their errors, so the wait cannot throw. See note N3. |
| R8-5 panel shown at once, fade only | **Closed in code; device cause still unproven** | No `setTimeout(... setShowFeedback(true) ...)` is left in `app/(engineB)`, and `TextFeedback` has no transform. The panel's size and place are unchanged (it only loses the 100 px slide and the 200 ms delay). See notes N2 and N8. |
| R8-5 B exam guard | **Closed** | Real `handleNext` with `useExam.nextQuestion` semantics and the reset run as an effect after render: 30 answers with a double tap on every Next visit all 30 questions, none skipped, one result. Next responds while the stop is still held. A slow save on the last question plus a second Next (panel re-opened with ‹) cannot finish twice. |
| R8-5 B practice guard | **Closed** | Real `usePracticeWeak.nextQuestion` queue logic: a double tap removes one question. The last question answered wrong is re-queued as itself, `phase` passes through `question`, the guard re-opens, and the session ends at `done`. |
| R8-5 B sign stop not awaited | **Closed** | Real `_claim`/`_release`/`stopAudio` from `hooks/useAudio.ts`: the old screen's un-awaited stop silences the old explanation, does not silence a clip the next screen starts, and does not emit `idle` over it. Engine B starts no audio on its own when a question opens. |
| R8-5 B topic/daily quiz, B behavioral | **Partly** | Their Next is immediate in the middle of a quiz, with nothing awaited before the move. However the topic/daily quiz can lose its Next entirely after reviewing back: **R8-B (2)**. B behavioral keeps a few-millisecond stale window when an answer is given: note N5. |
| "Please verify" 1: normal paths | **OK** | Ordinary last question with the primer shown (36-case table), Next in the middle of a quiz (project tests plus the Next scenarios above), exam finish with no audio playing (result-effect order test). |
| "Please verify" 2: nothing keeps `advancingRef`/`leavingRef` stuck | **OK** | Guard released in every leave case and every stay case above. |
| "Please verify" 3: suite and type check | **OK** | 30 of 30, tsc clean. |

## Minor notes (non-blocking)

- **N1. Test gaps (mutation checks on a scratch copy).** Killed, as the brief says: re-awaiting the B sign stop, removing the B exam guard, removing both B sign `activeRef` checks. **Survived** (the new tests still pass): removing the guard's re-open effect in the B exam or in B practice (Next would then work once per session); reverting the `TextFeedback` unmount condition to the "why?" flag only (leaving with the arrows or Back while ▶️ plays would then not stop it); making the 15 s timer clear `ttsActiveRef` (the R7-2 tests are static text checks). The code is right today. The tests just do not prove these parts. Behavioural versions of my scratch scenarios would close this.
- **N2. Not awaiting `stopAudio` cannot by itself make Next faster.** The `Sound` wrapper's `stopAsync`/`unloadAsync` call expo-audio's synchronous `pause`/`release`, which wait for the Android main thread on the JS thread (`runOnMain` = `runBlocking(mainQueue)`, [AudioModule.kt:939](<C:/Users/Yakov/Desktop/driving-theory-app/node_modules/expo-audio/android/src/main/java/expo/modules/audio/AudioModule.kt:939>); `Function("pause")` at line 483). That time is spent in the same JS task whether or not the promise is awaited. The change is harmless, and the new guards are the real protection against double runs. The panel-position change remains the main (unproven) explanation of the owner's symptom, so the device check is decisive.
- **N3. Location re-ask postponed when leaving during its write.** In the "re-ask due" branch `quizzesSincePrompt: 0` is written before the new `canShow` check, so a learner who leaves exactly then loses that re-ask until 3 more quizzes are done. The brief's "nothing marked" is not quite literal. Nobody gets stuck. Fix if wanted: check `canShow` before that write too.
- **N4. Engine A still opens its overlay through uncancelled 300 ms timers**, the stale-timer class removed from Engine B: [A sign quiz :390](<C:/Users/Yakov/Desktop/driving-theory-app/app/(engineA)/question/[id].tsx:390>), [A behavioral :471](<C:/Users/Yakov/Desktop/driving-theory-app/app/(engineA)/behavioral-subtopic/[id].tsx:471>), [A topic quiz :326](<C:/Users/Yakov/Desktop/driving-theory-app/app/(engineA)/topic-quiz/[topicId].tsx:326>), [A exam :499](<C:/Users/Yakov/Desktop/driving-theory-app/app/(engineA)/(tabs)/exam.tsx:499>), [A practice :275](<C:/Users/Yakov/Desktop/driving-theory-app/app/(engineA)/practice.tsx:275>). A › tap within 300 ms of answering can open the overlay on the next, unanswered question, and its Next then skips that question. This is old and the window is narrow. Clear the timer on question change, or show at once as in Engine B.
- **N5. B behavioral answer handler** ([behavioral-subtopic/[id].tsx:269](<C:/Users/Yakov/Desktop/driving-theory-app/app/(engineB)/behavioral-subtopic/[id].tsx:269>)) still awaits `stopTTS()` and the haptic before it shows the card colour and the panel. Real handler with a held haptic and a ‹ tap meanwhile: `selected=0`, `counted`, the previous question's feedback text, `panel=true` on the new question. This is old and the window (the haptic's native round trip) is smaller than the old 200 ms. Fix: do not await the haptic, or re-check the question after the awaits.
- **N6. B practice Next does not stop the explanation clip** (`AudioButton` does not stop on unmount), so a sign explanation started in the panel keeps playing over the next question. The B exam does stop it. Old.
- **N7. B exam edge:** if `finishExam` ever threw, the guard would stay closed and a later Next would do nothing. `finishExam` catches its only fallible await, so this cannot happen today. No action.
- **N8. Answer-card colour.** The panel covers the same area as before. Only the 200 ms in which the cards were fully visible is gone, so where the panel overlaps the cards the green/red shows only through the 120 ms fade. The panel shows ✅/❌, and in behavioral questions it names the correct answer. This is an owner/device judgement, not a defect.
- **N9. The R7-3 pattern also sits in the Engine B behavioral and topic-quiz question read-aloud loops** (⏸ then ▶️ while the first fetch is slow: the old loop clears the new loop's flag, the answers are then not read, and the icon shows ▶️). Answering, changing question and leaving all stop TTS unconditionally there, so nothing leaks. Old and cosmetic.

## What I executed

- `node planning/codex-qa-2026-10-06/tests/run-all.cjs`: **30 of 30 test files passed**.
- `npx --no-install tsc --noEmit --incremental false`: **passed**, exit 0, no diagnostics.
- Read: the brief, the Round 7 report, the full diffs of the 11 listed files, and the shared code they rely on (`utils/googleTTS.ts`, `hooks/useAudio.ts`, `services/sound.ts`, `hooks/useExam.ts`, `hooks/usePracticeWeak.ts`, `hooks/useTopicQuiz.ts`, `hooks/useScreenActive.ts`, `components/shared/AudioButton.tsx`, `components/shared/ScreenSafeArea.tsx`, `components/shared/VideoModal.tsx`, the installed `expo-audio` Android module).
- Scratch reproductions (outside the project, in `C:\Users\Yakov\AppData\Local\Temp\claude\C--Users-Yakov-Desktop-driving-theory-app\fa269b47-5281-4481-b4ab-3edc3d086800\scratchpad\qa8\`):
  - `repro-feedback.cjs`: Engine A and B feedback panels against the real speech service. 7 of 8 pass, and the failure is R8-A.
  - `fixcheck-arag.cjs`: the suggested R8-A token on a scratch copy. Original FAIL, with the token OK.
  - `repro-transitions.cjs`: R7-4, real hook with the four real transitions, 36 of 36.
  - `repro-exam-next.cjs`: R7-2b result order and the R8-5 B exam, practice and sign handlers, 11 of 11.
  - `repro-skip-ahead.cjs`: R8-B (1), 0 of 4 (the defect), plus the same sequence on the HEAD hooks (accepted, counted twice).
  - `repro-review-back.cjs` and `repro-review-back.HEAD.cjs`: R8-B (2), same failure on the candidate and on HEAD, controls pass.
  - `mutate.cjs`: 8 mutations of the new project tests on a copy of `app/`, `components/`, `hooks/`, `utils/`, `constants/`. 3 killed, 5 survived (N1 lists the meaningful ones).
- `git status` after the review: the same 49 entries as at the start, plus this report.

## Candidate fingerprints (SHA-256)

```text
0820d6fc3097fbc47336eeb761ef61455fe84d691234c3d69b46c617227cd06c  components/engineB/TextFeedback.tsx
2847093fccbf3eaec6513563b859aa98c8fdfc52d38571adaa7e123123f05f17  components/engineA/AudioFeedback.tsx
68a7bae867263b239467023a3cc9e4b5fa01d77cddcdb90f4fc63aa2eeeed5d9  hooks/useLocationPrompt.ts
57c98808dbca5c45fba5ac93f213a1bf42e408bb10030e4c50acb5a14c34a901  app/(engineA)/question/[id].tsx
c1c4b838b6eaa3c70eec6a37458e935dfcf4f9be8c8c67ae8d227bfd8e377056  app/(engineA)/behavioral-subtopic/[id].tsx
2d12abb9239051061a6f72f0476aa6c7ccc8629bb50cd9049fa1721c301c0092  app/(engineB)/question/[id].tsx
e3bef8b21ecbabd02e3d1a7aac23e22f5f0f822de21148289422e69fb193345c  app/(engineB)/behavioral-subtopic/[id].tsx
038d7c51bdd837164aa34bb7c84bce03b9dc02d305a943a8cfbd618d94e3f41a  app/(engineB)/topic-quiz/[topicId].tsx
23c598e68f5e3d6ae37edee38fadcfb491b9e07cf3794afd3740a43f0a229ab9  app/(engineA)/(tabs)/exam.tsx
29dd0f706c683fe64b5697506d828154fde87676de6387cbf64212a1af2f643f  app/(engineB)/(tabs)/exam.tsx
ba76cc61d1551112e5dfc4942cb67499acaeda03ce8aad0048e2d7da168dbc58  app/(engineB)/practice.tsx
fc5faaea0dd9724df4d4b615571b1ad8a8c904e0555dbd8e03dfb2f9420bf82c  hooks/useExam.ts
13633a574446a928ec780bc2e86d0b51cb96e6f3a888fff08f3327a7d6528a34  hooks/useTopicQuiz.ts
eebad1deb44e880ab831096376efbda902c8205baed22d04aa0a61a4f404201d  hooks/usePracticeWeak.ts
96cfabfc3ac801b5c1ab600a2200310a3401157b630434f64a56c5c8243463f7  hooks/useScreenActive.ts
d3c27942ed9028d90cdd7851cbb47cb3e0721e6cc736cc865cff7c58bf73b00a  hooks/useAudio.ts
7435ec86eedc52c9d7a20c6f956bafb387275dc389b46c643fd7bf4393b93ed7  utils/googleTTS.ts
5aaae1d60fee07fdb8c9003494e79ae3386515594ff6a1f5dfd05644ca72b76b  services/sound.ts
ae9c21997f4c418b94f34652ecd6488b36c11924144eeac3fa74e2e936bf03ba  planning/codex-qa-2026-10-06/tests/round7-fixes-test.cjs
b124cdfe3f4b642969a0ce25b15c9c8e4c242df72eb790d5029d3d4098d28ace  planning/codex-qa-2026-10-06/tests/round7-ui-test.cjs
d39b71bc1c8bc07a4f84c57f8c387d66c1dae242d0ddfb8300caff89c3fe5e3a  planning/codex-qa-2026-10-06/tests/round6-handlers-test.cjs
```

## סיכום לבעל האפליקציה

ארבעת התיקונים מהסבב הקודם עובדים, וגם התיקון החדש לכפתור "הבא" במנוע B עובד. כל 30 קובצי הבדיקות עברו, וגם בדיקת TypeScript. בדקתי כל תיקון גם בהרצות משלי על הקוד האמיתי, כולל שירות ההקראה האמיתי, ולא מצאתי שהתיקונים של היום שברו משהו. אפשר לבנות גרסה לבדיקה פנימית.

לפני העלאה לחנות כדאי לתקן שתי תקלות חדשות שמצאתי:

1. מנוע A, שאלות תמרורים, כפתור "למה?". נניח שהאינטרנט איטי: הלומד לוחץ "למה?", לא שומע כלום, ולוחץ עוד פעמיים. ההסבר עלול להמשיך לדבר גם אחרי שעבר לשאלה הבאה, גם בזמן הפרסומת בסוף וגם אחרי שיצא מהמסך, ואין לו דרך לעצור אותו. זו אותה תקלה שתוקנה בסבב הקודם במנוע B, והתיקון פשוט לא הועתק למנוע A. התיקון קטן, ובדקתי שהוא עובד.

2. מבחן ושאלון נושא, בשני המנועים. כשלומד מדלג קדימה עם החץ וחוזר אחורה, הכפתור "הבא" יכול להביא אותו לשאלה שכבר ענה עליה. השאלה נראית פתוחה, אבל לא מגיבה ללחיצה. במנוע B יש גם מצב כזה: הלומד ענה על השאלה האחרונה, הציץ אחורה על השאלה הקודמת וחזר. מאותו רגע אין כפתור "הבא", ואי אפשר לסיים את המבחן, אלא רק לצאת ולאבד אותו. החלק הזה קיים כבר בגרסה הקודמת ולא נגרם מהתיקונים של היום. שני התיקונים קטנים.

יש גם כמה הערות קטנות שלא עוצרות כלום. הן מפורטות בדוח.

מה כדאי לבדוק בטלפון בבדיקה הפנימית:
- במנוע B, בכל סוגי השאלות: לענות ומיד ללחוץ "הבא". האם הכפתור מגיב כבר בלחיצה הראשונה?
- האם עדיין רואים איזו תשובה נצבעה בירוק, עכשיו כשחלון ההסבר מופיע מיד.
- שני כפתורי החזרה במנוע A: לוודא שהם לא יושבים על השעון והסוללה.
- סוף מבחן במנוע A, אחרי המתנה ארוכה להסבר הקולי: לוודא ששום דבר לא מדבר בזמן הפרסומת.

לא שיניתי שום קובץ של האפליקציה. כתבתי רק את הדוח הזה.

## Follow-up (2026-10-28)

Same rules as above: review and tests only, this report is the only project file written. Baseline for the diffs: the files I reviewed this morning (their SHA-256 match the fingerprints above), kept in my scratch folder.

**Executed:** `node planning/codex-qa-2026-10-06/tests/run-all.cjs`: **31 of 31 passed**. `npx --no-install tsc --noEmit --incremental false`: **clean**, exit 0.

### 1. Owner finding: the "why?" explanation was white on light blue (Engine B)

- **Fix verified.** The only change to `components/engineB/TextFeedback.tsx` since my review is `ragText.color`: `Colors.textPrimary` (#FFFFFF) became `'#191c1e'`, plus a comment. Nothing else in the panel changed. Static contrast on the `#E3F2FD` card: before **1.14 : 1** (unreadable), now **14.99 : 1**. This covers all five Engine B question types, because they all use this one component. Contrast is a static calculation from the style values (WCAG formula), not a check on a phone screen.
- **Other text in the Engine B panel (static check, not fixed):**
  - The explanation text is white on dark green/red: 7.87 and 6.57. OK.
  - The "why?" button is white on #1565C0: 5.75. OK. While loading (whole button at opacity 0.6) it drops to 3.84 on red and 3.42 on green. Readable, below the 4.5 guideline. Minor.
  - **N10 (P3, old, not the same white-on-light defect but the same "hard to read" family):** the Next button label `ቀጣይ ›` uses the border colour on the panel colour ([TextFeedback.tsx:272](<C:/Users/Yakov/Desktop/driving-theory-app/components/engineB/TextFeedback.tsx:272>)). After a correct answer it is #43A047 on #1B5E20 (**2.38 : 1**). After a wrong answer it is #E53935 on #B71C1C (**1.55 : 1**), so the word is barely visible. The button stays recognisable by its outline and place. A white label (or white fill with the coloured text) would fix it. Reported only, as asked.
- **Engine A overlay:** it shows no text by design (icons only). The ▶ on the Next button is white on #1a1a2e (17.06). The 🤔/⏸/⏳ and ✅/❌ are emoji. No white-on-light case.

### 2. Fixes for R8-A, R8-B, N5, N6

| Item | Result | Evidence |
|---|---|---|
| R8-A `ragOp` token in `AudioFeedback.handleExplainWhy` | **Closed** | The diff is exactly the suggested token. My real-service reproduction now passes (8 of 8 in `repro-feedback.cjs`). Mutation "drop the token check" is caught by the new test. |
| R8-B (1) `nextQuestion` lands on an answered question | **Closed** | Both hooks now show it answered (same as the arrows). My `repro-skip-ahead.cjs` passes 4 of 4. B exam end to end: skip, back, answer, Next shows question 2 answered with its panel; the next Next opens question 3; 2 answers recorded. |
| R8-B (2) panel effect on `[phase, currentIndex]` | **Closed** | `repro-review-back.cjs` (model updated to the new effect deps) passes 4 of 4. After ‹ then › on the last question the panel is shown and Next reaches the result, with one finish. |
| N5 B behavioral answer | **Closed** | Real handler with a held `stopTTS` and a held haptic: `selected`, `counted`, the text and `panel=true` all happen before anything settles. The stale window is gone. |
| N6 B practice Next | **Closed** | `stopAudio()` is called (not awaited) before `nextQuestion`. It claims the ticket synchronously, so it cannot stop a clip started later (checked in my review). |
| Counting | **OK** | `countAnsweredQuestion` is still only in `submitAnswer`, behind the one-answer-per-question check, so it runs once per question. The topic-quiz result is still built from `answersRef` (answered questions only); the finish branch is unchanged. |
| New test `round8-fixes-test.cjs` | **OK** | 6 of 6. On a scratch copy it catches all four mutations I tried: R8-A token, both hooks' answered-state branch, and the B exam guard reset. |

### R8-C: P2. An exam can now be finished (saved) twice while the last answer's save is slow

[B exam guard reset](<C:/Users/Yakov/Desktop/driving-theory-app/app/(engineB)/(tabs)/exam.tsx:116>), [useExam.nextQuestion](<C:/Users/Yakov/Desktop/driving-theory-app/hooks/useExam.ts:207>), [Engine A exam handleNext](<C:/Users/Yakov/Desktop/driving-theory-app/app/(engineA)/(tabs)/exam.tsx:530>) (no guard).

The B exam guard now re-opens on every index change. While `finishExam` waits for `saveExamSession` (slow connection), the last question stays on screen with its panel hidden. The arrows still work, and with the R8-B changes they lead back to a panel with a working Next. Reproduction (real `useExam` callbacks, real B exam `handleNext`/`handleNavPrev`, effects run with the source's deps, save held):
```text
save pending: finishExam calls after first Next=1; after ‹ (Q29 panel=true), Next, Next=2
```
The exam session is then saved twice: two entries in the learner's history, and the result effect runs twice (a second result screen opened, a second ad check). Before these fixes the B guard stayed closed until the result, which blocked this. The Engine A exam never had a guard. Before R8-B the same path was blocked there only when the two answers had different results; now it is open in every case. The trigger is natural: nothing seems to happen after the last Next on a weak connection, so the learner taps around.

**Small fix:** guard the finish inside `useExam` itself (covers both engines). For example, a `finishingRef` set when the finish branch starts, and `nextQuestion` returns at once while it is set (or once `phase === 'result'`). **Closure test:** the sequence above gives `finishExam` exactly once. The normal finish still saves once and opens the result.

### R8-D: P2. Engine A speaks ANOTHER question's feedback when it lands on an answered behavioral question

[A exam handleAnswerSelect](<C:/Users/Yakov/Desktop/driving-theory-app/app/(engineA)/(tabs)/exam.tsx:293>) and [A topic quiz handleAnswerSelect](<C:/Users/Yakov/Desktop/driving-theory-app/app/(engineA)/topic-quiz/[topicId].tsx:207>) build `feedbackTTSText` only when an answer is GIVEN. When the overlay opens for an already-answered behavioral question, it speaks whatever text was built last. That happens through the ‹ › arrows (already true before) and now also through Next (R8-B). Reproduction (real hook callbacks and the real Engine A answer handlers; the `ttsText` prop computed exactly as the screen does): skip question 1, answer question 2 correctly, go back, answer question 1 wrongly, press Next.
```text
A exam:       now on Q2, phase=feedback_correct, overlay speaks: "ስህተት! ትክክለኛው መልስ: RIGHT-1"
A topic quiz: on Q2 phase=feedback_correct (answered right), overlay speaks: ስህተት! ትክክለኛው መልስ: RIGHT-1
```
The screen shows ✅ for question 2, while the voice says "wrong" and gives question 1's correct answer. For a learner who cannot read, the voice is the whole content, and it is wrong and contradicts the icon. Sign questions are not affected: they play their own recording, picked from the shown question.

**Small fix:** build the text from the question on screen and its stored answer whenever the overlay opens. For example, set it in the `[phase, currentIndex]` effect from `currentQuestion` and `lastAnswerCorrect`, using the same two sentence patterns. **Closure test:** the sequence above speaks question 2's own correct-answer sentence. Also arriving with ‹ and with ›.

### Other notes from the follow-up

- **Engine A replays the explanation when Next lands on an answered question.** This is intended and is what the arrows already did. Sign questions replay their own recording. Next appears when the clip ends (or after the 6 s / 15 s escapes). It is not a defect, but the owner may want to hear it once on the phone.
- **N4 is slightly wider now.** The Engine A topic quiz and exam effects re-run on every move, and each run starts an uncancelled 300 ms timer. Two quick › taps through an answered question to an unanswered one can open the overlay on the unanswered question. Since the effect now runs on every change, the fix is one line in each of the two effects: keep the timer id and return `() => clearTimeout(t)`.
- **Panel on the wrong question (Engine B):** not possible, because the show-effect is synchronous with no timer, and it runs only for a feedback phase of the question on screen.

### Follow-up verdict

**APPROVED for an internal-test build. Not for production until R8-C and R8-D are fixed** (both small; if the build is not made yet, include them). The owner's colour fix is correct and touches nothing else. R8-A, R8-B, N5 and N6 are closed. Suite 31 of 31, tsc clean. Static checks and in-memory runs only, no device.

### סיכום קצר לבעל האפליקציה (המשך)

- **ההסבר של כפתור "למה?" במנוע B:** הטקסט היה לבן על רקע תכלת, ולכן לא ראו אותו. עכשיו הוא כהה וקריא, וזה השינוי היחיד בחלון הזה. בדקתי את הצבעים מתוך הקוד, לא על מסך של טלפון, אז כדאי להציץ פעם אחת בבדיקה.
- **עוד דבר שקשה לקרוא באותו חלון (לא תיקנתי, כמו שביקשת):** המילה של כפתור "הבא" אחרי תשובה שגויה כתובה באדום על רקע אדום כהה, וכמעט לא רואים אותה. את הכפתור עצמו עדיין מזהים לפי המסגרת.
- **התיקונים לממצאים שלי מהבוקר עובדים.** כל הבדיקות עוברות.
- **שתי תקלות חדשות, בעקבות התיקונים, שכדאי לתקן לפני החנות:**
  1. אם האינטרנט איטי ממש בסוף מבחן, והלומד לוחץ אחורה ואז שוב "הבא", המבחן יכול להישמר פעמיים.
  2. במנוע A, כשחוזרים לשאלה התנהגותית שכבר נענתה, הקול עלול להקריא את ההסבר של שאלה אחרת (למשל "שגוי" כשהתשובה הייתה נכונה). זה קרה כבר קודם עם החצים, ועכשיו קורה גם עם "הבא".
- **שתיהן קטנות לתיקון.** לבדיקה פנימית אפשר לבנות כבר עכשיו.

לא שיניתי שום קובץ של האפליקציה, רק הוספתי לדוח הזה.

## Follow-up 2 (2026-10-28)

Same rules: review and tests only, this report is the only project file written. Baseline for the diffs: the files as I reviewed them in "Follow-up" above (kept in my scratch folder). Between that baseline and now exactly **four** files changed: `hooks/useExam.ts`, `app/(engineA)/topic-quiz/[topicId].tsx`, `app/(engineA)/(tabs)/exam.tsx`, `components/engineB/TextFeedback.tsx`. Nothing else, so the other four Engine B screens that use the panel are untouched.

**Executed:** `node planning/codex-qa-2026-10-06/tests/run-all.cjs`: **31 of 31 passed** (`round8-fixes-test.cjs`: 11 of 11). `npx --no-install tsc --noEmit --incremental false`: **clean**, exit 0. `speechGuard().problems`: **`[]`**. I also checked that the guard is really strict: I fed it, from scratch (project untouched), a copy of the topic quiz in which the praise template got a comma, and it reported `builds feedback differently`. So the `[]` means the new text construction matches the recorded form. Static checks and in-memory runs of the real functions with a small React-effect simulator (deps compare, cleanup, fake timers), no device.

### 1. R8-C (`finishingRef` in `useExam.nextQuestion`): **closed**

The diff is exactly the guard at the last question plus the reset at the top of `loadQuestions`. With the REAL `useExam` callbacks and the REAL Engine A exam handlers: 30 answers, last Next with the save held, then ‹, Next, Next gives `finishExam` calls: 1, 1, and the result opens once when the save ends. A normal 30-answer finish still saves once and reaches the result with 30 answers. `finishExam` catches its only fallible await (`saveExamSession`), so the flag cannot stay set after an exception on the way to the result. While the save is pending, the extra Next on the last question hides the panel and does nothing, which is what the first Next already did. Note N11 (low, latent): `useExam.loadQuestions` does not reset `answersRef`, so `useExam.restart` would leave the old answers. No screen calls `restart`, so nothing is reachable today.

### 2. R8-D (Engine A topic quiz and exam show-effect): **closed**

- **(a) The 300 ms delay is unchanged and still applies on the normal path.** Both diffs keep `setTimeout(() => setShowFeedback(true), 300)`; only `const t =` and `return () => clearTimeout(t)` were added. Real answer, real effect: exactly one live timer with `ms = 300`, nothing shown before it fires, the overlay shows when it fires. Both screens.
- **(b) The cancel cannot swallow a legitimate overlay.**
  - The effect depends only on `[phase, currentIndex]`. Five idle re-renders (taps on the disabled ‹) keep the single timer alive and the overlay shows.
  - StrictMode: the project has no StrictMode setting. Simulated anyway (effect, cleanup, effect): one live timer, overlay shows.
  - Voice answer: it calls the same `handleAnswerSelect`, so it is the same path.
  - A move within 300 ms to an ANSWERED question: the old timer is cancelled, exactly one new timer, exactly one overlay, for the new question, speaking that question's own text. A move to an OPEN question: no live timer left, no overlay on the open question. ‹ then › within 300 ms: one overlay for the right question, with its own text ("ስህተት! ... RIGHT-2" for the wrong one).
  - Next from the overlay lands on an answered question: the overlay comes with the new question's text (the R8-D reproduction from the last follow-up now speaks question 2's own sentence).
- **(c) Sign questions are unaffected.** The text is built only when `!currentQuestion.sign_id`. A sign question leaves the text state as it was, `ttsText` stays `undefined`, and the same single 300 ms timer applies.
- **(d) `feedbackTTSText` is set before the overlay mounts.** Order for the very first answer after loading: the commit with the new phase, the effect (sets the text, starts the 300 ms timer), the re-render with the text, and only then, 300 ms later, `showFeedback` and the `AudioFeedback` mount (whose speech effect reads `ttsText` once, at mount). I ran it with the handler's own older `setFeedbackTTSText` switched off, so the effect ALONE supplies the text: the overlay mounts with "PRAISE RIGHT-1" (first answer, right). The older pre-set in `handleAnswerSelect` is still there and is now redundant but harmless: the effect runs later and its text wins.

Small note, not a defect: `randomPraise()` is now drawn on every effect run, so going back and forth between answered questions can give a different praise each time. All praises are in the recorded list, and the guard accepts the construction.

Remaining, already reported and not touched (N4 in the earlier follow-up): the Engine A sign quiz, the Engine A behavioral subtopic and Engine A practice still open their overlay with an uncancelled 300 ms timer inside the answer handler (a › tap within 300 ms of an answer can open the overlay on the next, open question). Narrow and old.

### 3. The `ቀጣይ ›` label colour (Engine B panel): **closed, nothing else changed**

Diff of `components/engineB/TextFeedback.tsx` against what I reviewed before: three changed lines and nothing more. The JSX label no longer passes `{ color: borderColor }` and gets a short comment, and `nextButtonText` gets `color: '#FFFFFF'`. The button's `{ borderColor }`, `borderWidth: 2`, radius 16, padding, `alignSelf: 'stretch'`, the `activeOpacity` and the accessibility props are identical, and no other style or handler in the panel changed. Contrast of the label (static calculation): 7.87 : 1 on the green panel and 6.57 : 1 on the red one (before 2.38 and 1.55). N10 is closed.

**Is the button still recognisable? Static assessment, not seen on a phone.** Yes, mostly: it is full width, about 64 dp high (14 + 32 + 14 padding plus the 2 px border; 20 px text with 32 line height), it carries the arrow `›`, and it sits last in the panel. The touch area is unchanged and large. One caveat: the border is the weak part. Its contrast with the panel is 2.38 : 1 on green and only 1.55 : 1 on red (below the usual 3 : 1 for a control's outline), so on the wrong-answer panel the outline is faint and the button is recognisable mainly by its label and place. **I would still recommend a visible fill** (for example a translucent white fill, or a white button with dark text), as a P3 improvement that the owner can decide on. I did not apply anything, as the owner asked for only the label colour.

### 4. Mutation checks on a scratch copy (project untouched)

24 mutations on a copy of `app`, `components`, `hooks`, `utils`, `constants`, `services`, each run against the project's `round8-fixes-test.cjs` and against my own scenarios (`followup2.cjs`, 15 scenarios).

| Area | Killed by `round8-fixes-test.cjs` | Survivors of the project test |
|---|---|---|
| R8-C (4) | guard removed; flag never set; reset in `loadQuestions` removed; guard moved before the last-question test | none |
| R8-D, both screens (7 each) | cancel removed; text block removed; text built from the wrong answer; effect deps back to `[phase]` | **delay 300 to 0, delay 300 to 100, and "sign questions also rewrite the text"**, on both screens (6). The test never looks at the delay or at a sign question. My scenarios kill all six. |
| Label (6) | JSX takes the border colour again; label colour set to the old green; button border colour removed | **border width 2 to 0, touch padding 14 to 2, and an unrelated panel style changed (explanation text colour).** The test checks the label and the border colour only, not the rest of the button or the panel. My scenarios do not cover the label, so these three survive both. |

The code is right today; the gaps are in the tests. Cheap closures: assert `ms === 300` and a single live timer in the R8-D test, add one sign-question case there, and assert `borderWidth: 2` and the padding values of `nextButton` in the label test.

### Follow-up 2 verdict

**APPROVED for an internal-test build.** R8-C and R8-D are closed and I found no regression from them: the 300 ms delay is unchanged and the cancel only fires on a move; sign questions are unaffected; the text is ready before the overlay mounts; the label is the only change in the panel. No new P1 or P2 finding. The open items are P3: the faint button outline on the wrong-answer panel (a fill is suggested), the test gaps above, and the old Engine A timers in the sign quiz, behavioral subtopic and practice. Production still needs the owner's phone pass.

### סיכום קצר לבעל האפליקציה

- **שתי התקלות מהסבב הקודם תוקנו ועובדות.** מבחן לא יישמר פעמיים גם אם האינטרנט איטי בסוף, ובמנוע A הקול מקריא עכשיו את ההסבר של השאלה שעל המסך ולא של שאלה אחרת.
- **ההשהיה של 300 מילישניות לפני שחלון ההסבר מופיע לא השתנתה.** נוסף רק ביטול: אם הלומד עובר לשאלה אחרת באותם 300 מילישניות, החלון הישן לא קופץ אחר כך על השאלה הלא נכונה. בדקתי שהביטול לא בולע חלון שצריך להופיע: לא בתשובה רגילה, לא בתשובה בקול, לא בשאלות התנהגותיות, ושאלות התמרורים לא הושפעו.
- **המילה "הבא" בחלון ההסבר של מנוע B עכשיו לבנה וקריאה**, וזה השינוי היחיד בחלון. הכפתור נשאר גדול ומוכר לפי המקום והחץ שבו. אבל המסגרת שלו חלשה, במיוחד אחרי תשובה שגויה, לכן הייתי ממליץ בהמשך על רקע נראה לעין לכפתור (למשל לבן שקוף). לא שיניתי, כי ביקשת רק את צבע המילה. זו הערכה מתוך הקוד, כדאי להציץ בטלפון.
- **כל הבדיקות עוברות** (31 מתוך 31), בדיקת TypeScript נקייה, ובדיקת ההקראה המוקלטת נקייה.
- **בדיקות הניסוי:** כמה שינויים קטנים בהשהיה ובכפתור לא נתפסים עדיין על ידי קובצי הבדיקה הקיימים. הקוד תקין, ומדובר רק בהקשחת הבדיקות, והצעתי איך.
- **אפשר לבנות גרסה לבדיקה פנימית.** מה שנשאר פתוח הוא דברים קטנים בלבד.

לא שיניתי שום קובץ של האפליקציה, רק הוספתי לדוח הזה.
