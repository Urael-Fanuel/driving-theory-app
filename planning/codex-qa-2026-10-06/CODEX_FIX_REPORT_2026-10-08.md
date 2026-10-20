# Fix report for CODEX: rounds 2, 3 and 4

Written by Claude Code (the implementer). **Round 4** (a defect the owner found while testing the round-3
candidate in Expo Go, not a CODEX finding) comes first. **Round 3** (answers to
`codex-round3-review-2026-10-08.md`) follows it. Sections 0-4 are the round-2 report (answers to
`codex-fix-review-2026-10-08.md`), kept as written. Sections 5 and 6 are updated to the current state.
Round 1 (Q01-Q11) is summarized in section 4.

## Round 4 (newest): the 🔊 buttons on the answers, Engine A (sign questions screen, then the exam and the topic quiz)

### R4.1 What the owner saw (2026-10-14, Expo Go)

On the sign questions screen only (`app/(engineA)/question/[id].tsx`), not on the other topics:
tapping 🔊 on answer 1 made answer 2 start, tapping 🔊 on answer 2 made answer 3 start, and tapping 🔊 on
answer 3 made the yellow frame, and the voice, go to answer 4. Quick taps on different speakers made it worse.
After the first fix (R4.3) the same harness showed that quick taps on different speakers also go wrong on the
exam and the topic quiz (R4.5); the owner then approved applying the same fix there (R4.5, R4.7).

### R4.2 Cause (found with the real screen, see R4.4)

The screen's `handleAnswerAudioPress` ended with "resume the reading from the next answer" after EVERY tap.
`exam.tsx` and `topic-quiz` resume only if the tap cut off a reading that was still going, and choose where to
continue from depending on how far the interrupted answer had got (`playingAtTime`, `answerAudioStartedRef`,
`answerFullyReadRef`). The commit message of `18f39a8` (21 May) says this "three-way logic" was added to
`question/[id].tsx` as well, but its diff touches only `exam.tsx`: the sign screen never had it. So the store
version (versionCode 8) behaves the same way; this is not a regression of the round-3 work.

A second, smaller cause: a tap whose clip is replaced by a newer tap is let go by the audio engine as "finished"
(`playAndAwaitAudio` returns `true` for a superseded clip, in the store version too). The old tap then cleared
the highlight of the newer one and restarted the reading as if its clip had played out.

### R4.3 First fix: `app/(engineA)/question/[id].tsx` (the exam and the topic quiz follow in R4.5)

| Part | Change |
|---|---|
| Where the reading is | `sequenceIndexRef` (set by the reading itself, never by a replay), `answerAudioStartedRef`, `answerFullyReadRef`, as in `exam.tsx`. `null` once the reading finished or failed (`stopHere()`), and while it is still on the question. |
| Resume rule | Same three-way rule as `exam.tsx`: continue after the replayed answer if the interrupted answer's audio had started; from the next one if it was read to the end; from the same one if only its number had been said. If `sequenceIndexRef` is `null` the tap is just a replay. The answer count is `min(4, answers.length)`. |
| Newest tap wins | `replayPressRef` counts taps; a tap that is no longer the newest after its `await` returns without touching the highlight or the reading. |
| Cut off is not "read" | After the answer clip, `if (isCancelled()) return;` before `answerFullyReadRef = true`. |
| Yield | `await setTimeout 0` between the number and the answer clip, as in `exam.tsx`. |
| Next question during a replay | `questionEpochRef` is bumped first thing in `navigateToQuestion`, before `stopAudio()` lets the tap go; the tap compares it. A ref set at render time would be too late: the tap's continuation runs before the new question is rendered. Without it the new question's reading started from answer 2 (reproduced). |

Engine B is not affected: it has no per-answer 🔊 on the sign questions (only the "why?" button).

### R4.4 Proof

Test `tests/sign-replay-test.cjs` (16 scenarios) with a small harness, `tests/lib/screen-harness.cjs`. It
loads the **real screen file** and the **real** `hooks/useAudio.ts`. React (state, refs, effects, re-render),
the clock and the player are stand-ins: a clip lasts a set time, and the learner "taps" by calling the
buttons' own `onAudioPress` / `onPress` props. Every other import is a stub. It is not an Android test.

- On the **store version** of the screen (`git show main:...`) scenarios 2, 3, 4, 5, 6, 9, 10, 13, 14 and 16
  FAIL. 2-5 are the owner's report; for 4, quick taps 1 → 3 → 2 sounded `a1`, `number_4` (highlight on answer 4,
  the owner's observation), `a2`, and then the reading went on by itself.
- On the fixed screen all 16 pass. One voice at a time throughout (`maxLive == 1`).
- Seven defects put back one at a time in a temp copy of the fixed screen, each caught only by the scenarios
  that should catch it: the missing "finished reading → just replay" rule (2-6, 16), an older tap not let go
  (4, 10, 16), no question check (14), the epoch bumped too late (14), "always from the next answer" (9),
  "read to the end" set for a cut-off answer (7, 8, 10, 16), rule C missing (9).
- Scenarios that must stay as before also pass: the automatic reading itself (1); a tap while the question
  is read (6); taps while an answer is being read, continuing after it (7, 8); answering during a replay (12).

### R4.5 The exam and the topic quiz (owner approved on 2026-10-14)

Run on the real `topic-quiz/[topicId].tsx` and `(tabs)/exam.tsx` before the change, the same harness showed that
single taps are right but quick taps on **different** speakers go wrong: after taps on 🔊 1, 3, 2 about 300 ms
apart it played `a1`, `a3`, then the reading restarted by itself (`number_2 a2 number_3 a3 number_4 a4`), and the
highlight of the second tap was lost. Same cause: a superseded tap resumes the reading, and its
`playingAtTime` was the previous replay's index (`playingAnswerIndexRef` mirrored the highlighted card, which a
replay moves too). The owner had not seen it on his phone.

Fix in both files, the same as R4.3, adapted to what each already had:
- `sequenceIndexRef` + `markSequenceAt(i)` replace `playingAnswerIndexRef` and its sync effect; the reading sets
  it (loop start, failure, end, effect cleanup), a replay never does. The handlers read it AFTER the replay.
- `replayPressRef`: both handlers (pre-recorded clip and spoken behavioral answer) return when a newer tap exists,
  **before each step that touches the audio** (after `stopAudio()`, after `stopTTS()`, after the replay).
- `questionEpochRef`, bumped first in `handleNavPrev` / `handleNavNext`, checked after the replay.
- Unchanged: the three-way resume rule, the phase checks, `reportAudioFailure`, the effect dependencies.

### R4.6 Proof for the exam and the topic quiz

Test `tests/engineA-replay-test.cjs`, with `tests/lib/engineA-world.cjs`: the **real** screen, the **real**
`hooks/useAudio.ts` and the **real** `utils/googleTTS.ts` (so the spoken behavioral answers go through the real
ownership code). The exam / quiz hooks are small stand-ins keeping the question index and the phase. 4
combinations (exam, topic quiz) × (sign question, behavioral question) × 19 scenarios (the shapes of R4.4, plus
two taps at the same moment while an answer or only a number is being read, and a second tap 1 to 6 steps after
the first).
- All 76 pass on the fixed screens (`maxLive == 1`).
- On the store versions (git main) of each screen, scenarios 3, 4, 9, 11, 12, 13 and 14 fail in all four
  combinations. 2, 5, 6, 7, 8 and 10 pass there: single taps and the three-way rule were already right.
- Eleven defects put back one at a time in a temp copy, each caught only on the screen it was put back on: older
  tap not let go (clip, spoken), no check after `stopAudio()` / `stopTTS()`, no question check, epoch not bumped.
- **The first version of the fix had a bug that scenario 13 found:** in the topic quiz's spoken handler the older
  tap's `stopTTS()` ran after the newer tap had already started speaking, and stopped it, so nothing was heard
  (`played: []`). The fix is the check before each step.

### R4.7 Found, NOT changed (the owner has to decide)

Pressing the stop button (⏸) while a tapped answer is playing, when the tap cut the reading off in the middle,
stops the replay and then the reading starts again by itself. The tap is let go by the stop, finds a reading to
resume, and resumes it. Same family, same in the store version, on the exam and the topic quiz. The one-line
remedy would be to invalidate pending taps in the stop branch of `handleAudioButton` (`replayPressRef.current++`).
It is not in `engineA-replay-test.cjs` (a comment marks where). The owner has not been asked yet.

`behavioral-subtopic` restarts the reading from the tapped answer by design, and `practice.tsx` just plays the
tapped clip (newest request wins in the audio engines); neither was changed.

### R4.8 Device acceptance for this item

Engine A, sign question screen, exam and topic quiz, a question with 4 answers: (1) after the reading finished,
tap 🔊 on answer 1, then 2, then 3, then 4, each time waiting for it to end: only that answer is heard each time.
(2) Tap 🔊 on answers 1, 3, 2 quickly: each tapped answer starts, the yellow frame follows the finger, no answer
starts by itself. (3) Tap 🔊 on answer 1 while answer 2 is being read: answer 1 is heard, then the reading goes on
from answer 2. (4) Tap 🔊, then the › question arrow during the replay: the next question is read from its
beginning. Do (1)-(3) also on a behavioral question of the exam and the topic quiz (spoken answers).

## Round 3

### R3.0 State and how to check it

- Same base commit `938cc5b44f73fab61ca02564e817a4e8ea173c9c`, plus **uncommitted working-tree changes**.
  Nothing was committed, pushed or built in this round. Nothing on the server was changed; the only server
  access was read-only (R3.4).
- **Exact candidate:** `CANDIDATE_HASHES_2026-10-08.json` was regenerated for this round. It lists every file
  that differs from the base commit.
- **Gate:** `node planning/codex-qa-2026-10-06/tests/run-all.cjs`: **16 of 16 test files pass** (new:
  `practice-answers-test.cjs`). `npx tsc --noEmit --incremental false`: exit 0.

### R3.1 Your round-3 checks, re-run on the fixed code

`remaining-checks.cjs` asserts the defects, so it was run one block at a time. The only edit was `let w=` →
`w=` for the split. "No longer reproduces" means the defect is gone.

| Block | Now |
|---|---|
| S1 offline decline cleanup has no reconnect or timer trigger | no longer reproduces (`3 == 1`: wiped again on reconnect and by the timer) |
| S2 an IP write in flight restores the city after an acknowledged wipe | no longer reproduces (row `null`) |
| S3 automatic retries end after 60/180/600 s | no longer reproduces (`1 == 0`: a fourth timer is pending) |
| `closure-checks.cjs` R1-R6 | all PASS (see the note on R6 below) |
| round-2 `regressions.cjs` + `location-regressions.cjs` | all 8 blocks no longer reproduce |

**Note on R6:** your R6 checks cut `saveAnswer` out of `api.ts`, from `export async function saveAnswer(` to the
comment that starts "Record that a user watched". Round 3 moved the temporary/refusal rule into a shared helper,
`isTemporaryFailure`, also used by `recordSignView`. While the helper sat above `saveAnswer`, your cut left it
out and R6 stopped with `ReferenceError`. It now sits right after `saveAnswer`, inside your cut, so the check
runs unchanged and passes. Behavior is identical: the same statuses and codes, now in one place.

The first round-2 R7 block now ends with "Cannot read properties of undefined (reading 'id')". This happens
because `updates` is empty: the IP-based ad is never rendered after the decline. That is the fixed behavior,
not a harness problem.

### R3.2 Verdict on S1, S2, S3

All three are real, and all three reproduced with your script before the fix. Where I differ:

1. **S2 lifetime.** "Another lookup does not wipe again" held only for the rest of that app run.
   `declinedWipeConfirmed` was module state, so the first lookup of the next run wiped again; the city did not
   stay indefinitely.
   - **Likelihood:** the IP write happens once per run, at the first ad screen, and only while consent is
     `'unknown'`. The prompt appears after a finished quiz or from the Progress button. So the write must
     still be on its way at that moment, which needs a very slow request.
2. **S1 and S2 severity.** I would rate both Low:
   - after a decline the IP city is never used for an ad (`useIpCity: false`, R7);
   - in both cases the city was cleared at the latest at the next app start.
   - Both are fixed anyway, because the public privacy page says the IP city "is deleted" when the user
     declines.
3. **S3 remedy as worded** ("continue at the last interval") would make the queue give answers up sooner.
   - Each refused flush increments `rejections`, and the fifth refusal drops the answer.
   - A refusal can be cured by the next app start: a new sign-in re-keys the queue to the new account.
   - So the endless timer runs only while the server is **out of reach**, and not while it **refuses**
     (R3.3).
4. **"Deployed `stt` / `tts` / `upsert_user_progress` not verified":** they are verified now, and all match
   (R3.4).

### R3.3 Fixes

| ID | Fix (files) | New tests (each fails when its defect is put back) |
|---|---|---|
| S1 | **Retry:** in `hooks/useSponsorAd.ts`, a wipe that is not confirmed calls `retryWipeLater(userId)`. It retries on reconnect (the shared poll, `onConnectivityChange`) and on a timer of 60 s, 3 min, 10 min, then every 10 min. `stopWipeRetry()` runs once the wipe is confirmed, or when consent is no longer `'declined'`. **Screens with no ad:** `onLocationDeclined` now passes the user id (`hooks/useLocationPrompt.ts`). A module-level listener in `useSponsorAd.ts` runs the same wipe for a "not now" given on a question screen. **Unchanged:** `handleNotNow` still sends its own immediate wipe. At the moment of a decline up to three idempotent `ip_city = null` updates can go out; this is deliberate. | `location-consent-test` 11, 12, 13, 14 |
| S2 | **Pending writes:** `ipWritesPending` counts a write from just **before** the consent check that lets it go until its answer. So a decline between that check and the request is covered too. **Confirmation:** a wipe counts as confirmed only if it was **sent** while nothing was pending, even when its answer arrives later. After a write completes, if consent is now `'declined'`, the confirmation is cleared and the wipe is sent again. That wipe goes out after the write's answer, so the server applies it after the write. **Per user:** confirmation is kept per user id (`wipeConfirmedFor`), so a wipe under a local id does not count for the server account. | `location-consent-test` 15, 16, 17 |
| S3 | `utils/answerQueue.ts`: `_outOfReach` is true when the last flush stopped on `'unreachable'` with no refusal. While it is true, the timer keeps going every 10 minutes after the 3 steps. After refusals, the chain still ends after the third step. | `identity-queue-test` 18, 19 |
| Practice answers (the owner's decision; was open item 4) | `saveAnswerKept(userId, questionId, isCorrect)` in `utils/answerQueue.ts` uses the exam's pattern: enqueue, then `saveAnswer(..., 3, queueId)`, then dequeue only on `'saved'`; otherwise `retryQueueLater()`. If the enqueue itself fails (storage full), the answer is still sent at once, without a queue id. `useProgress.recordAnswer` (one sign's questions, both engines) and `usePracticeWeak.submitAnswer` (weak-question practice, both engines) use it instead of calling `api.saveAnswer` directly. Offline practice answers are now kept, and answers recorded under a local id are re-keyed like exam answers. | `identity-queue-test` 20, 21, 22; `practice-answers-test` 1, 2 |
| Exam answer when the queue file cannot be written (the owner's decision) | `useExam.submitAnswer` now calls the same `saveAnswerKept`, replacing its own enqueue → save → dequeue chain. The only change in behavior: if the enqueue fails (storage full), the answer is still sent now. Before, nothing was sent, because the save ran inside the enqueue's `.then`. The `isSaving` mark still goes on, and off 800 ms after the save settles. | `identity-queue-test` 22; `practice-answers-test` 4 |
| Sign views (the owner's decision) | **Queue entries:** the queue holds two kinds, `PendingAnswer` (`kind` absent or `'answer'`) and `PendingSignView` (`kind: 'signView'`, `signId`, `videoCompleted`). A queue file written by the store version (no `kind`) is read as answers. `flushOnce` sends each entry with its own function, and re-keying, `rejections`, `MAX_REJECTIONS` and the retry timer apply to both kinds. **Sending:** `saveSignViewKept` and `saveAnswerKept` share `keepAndSend`. `useProgress.markSignViewed` (Engine A at the end of a sign's audio, Engine B on opening a sign) uses it. **Server reply:** `api.recordSignView` now returns `'saved' / 'rejected' / 'unreachable'`, classified by the same `isTemporaryFailure` as `saveAnswer`; before it returned nothing. **Ids:** queue ids get a random tail (`..._<ms>_<6 chars>`), so two entries made in the same millisecond can be dequeued separately. An answer's id is still its submission id. **Not covered:** `upsert_sign_view` has no submission id. A replay after a lost reply can add 1 to `view_count`, which the app does not show; "viewed" and `video_completed` (an OR) are unaffected. | `identity-queue-test` 23-27; `practice-answers-test` 3 |

**Mutation check.** Each defect was put back one at a time, in a temp copy of the sources (never in the
project). 17 mutations were tried, and each one made **exactly** the listed scenarios fail and no others
("practice" means `practice-answers-test`; the other numbers are from the test files above):
- no retry after a failed wipe → 11, 12, 13, 14, 16
- no app-wide decline listener → 14
- a wipe sent during a pending write counts → 16
- no wipe after the write lands → 15
- confirmation not per user → 17
- the old 3-step timer → 18
- the timer continuing on refusals → 19
- dequeue even when not saved → 21, 23, 24, 26 (`keepAndSend` is shared by answers and views)
- nothing sent when the file cannot be written → 22
- one sign's questions sent straight to the server → practice 1
- weak-question practice sent straight to the server → practice 2
- a sign view sent straight to the server → practice 3
- the exam bypassing `saveAnswerKept` → practice 4
- `flushOnce` sending every entry as an answer → 23, 24
- ids without the random tail → 26
- `recordSignView` returning nothing (the old behavior) → 27
- 429 taken as a refusal in the shared rule → 13, 14, 27

### R3.4 Deployed server code compared with the repo (read-only)

**Edge Functions.** Read from the Supabase dashboard's code view (the Monaco model text). The fingerprint is
SHA-256 of the text with CRLF→LF, first 12 hex digits, against the same hash of the working tree:

| Deployed file | chars / lines | SHA-256 (12) | Repo |
|---|---|---|---|
| `stt/index.ts` | 5315 / 146 | `6d6b71cfc5bf` | identical to the working tree. `main` differs (`4ac905663ebb`), so the "four" hint fix is live. |
| `tts/index.ts` | 5392 / 140 | `9e2baab6ce82` | identical (includes the 1000-character limit `splitForTts` relies on) |
| `rag-explain/index.ts` | 7230 / 187 | `9b138bb64447` | identical |
| `ip-geolocate/index.ts` | 2872 / 81 | `592d44dd407e` | identical |
| `reverse-geocode/index.ts` | 5592 / 143 | `c0acd737db1b` | identical |
| `_shared/rateLimit.ts` inside `stt`, `tts` and `rag-explain` | 3137 / 84 | `12c1cb9d904f` (all three) | identical |

`agent-record-answer` and `agent-select-questions` are deployed but called from nowhere in the app, so they
were not compared.

**Database.** A read-only `SELECT ... pg_get_functiondef(...)` in the SQL editor shows two overloads of
`public.upsert_user_progress`:
- **`(uuid, text, boolean, text)`:**
  - `SECURITY DEFINER`, `search_path=public`;
  - `IF auth.uid() IS NULL OR auth.uid() <> p_user_id THEN RAISE EXCEPTION 'not authorized'`;
  - the `answer_submissions` idempotency.
  - These checks match `backend/migration_answer_idempotency.sql` (compared feature by feature, not by hash).
- **`(uuid, text, boolean)`:** the older 3-argument version. It has the same `SECURITY DEFINER` and
  `auth.uid()` check, without idempotency. The app always sends `p_submission_id`, so it calls the 4-argument
  version. The old one is not a security gap and was left alone.
- **Table:** `answer_submissions` exists, with about 325 live rows.
- **Not compared:** the rate-limit database side (`check_rate_limit`, `backend/migration_rate_limiting.sql`).

### R3.5 Known, not changed in this round

- **`ip_city` server guard:** there is still no server-side guard after a decline. The same-client ordering
  race is now handled in the client (S2).
- **`upsert_sign_view` on the server:** not re-read in this round. In the repo, `backend/schema.sql` has the
  `auth.uid()` check. The July 2026 security fix added it on the server and verified it in `pg_proc`. With
  that check, a view sent under a local id is refused, kept, and re-keyed like an answer. Without it, the view
  would be saved under the local id, which is what the store version already does.
- **Sign view replays:** there is no idempotency for sign views (see R3.3). `view_count` is not shown anywhere
  in the app.

## 0. State and how to check it (round 2)

- Base commit `938cc5b44f73fab61ca02564e817a4e8ea173c9c` on branch `upgrade/expo-57`, plus **uncommitted
  working-tree changes**. Nothing was committed, pushed or built, and no database or storage was changed in this
  round.
- **Exact candidate:** `planning/codex-qa-2026-10-06/CANDIDATE_HASHES_2026-10-08.json` lists the SHA-256 of every
  file that differs from the base commit.
- **Gate:** `node planning/codex-qa-2026-10-06/tests/run-all.cjs`. **15 of 15 test files pass.** A file counts
  as failed on a non-zero exit, a 120 s timeout, or FAIL / WRONG / TEST ERROR / AssertionError in its output.
  `npx tsc --noEmit`: exit 0.
- Before fixing, all 40 SHA-256 values in your evidence `manifest.json` matched the working tree, so you reviewed
  exactly this code. Both of your scripts reproduced all their assertions on it.

### Your round-2 reproductions, re-run one assertion block at a time on the fixed code

Your assertions assert the DEFECT, so "no longer reproduces" means the defect is gone.

| Block | Now |
|---|---|
| R1 stale TTS completion clears the newer player's speaking state | no longer reproduces |
| R2 playback stalled at 1 s / 120 s returned as success | no longer reproduces (`false`) |
| R3 failed replacement move deletes the cached file | no longer reproduces (copy kept) |
| R4 queued 4th request starts right after a 429 | no longer reproduces (3 started) |
| R5 legacy copy bypassed while storage is unreachable | no longer reproduces (local path) |
| R6 five 429 flushes discard an unsaved answer | no longer reproduces (`'unreachable'`) |
| R7 ad lookup started before the decline renders its result | no longer reproduces * |
| R7 the session flag skips the decline wipe | no longer reproduces (1 wipe) |

\* `location-regressions.cjs` needs a no-op `onLocationDeclined` in its `useLocationPrompt` mock, because the fix
adds that export; without it the effect throws for a reason unrelated to the defect. All other blocks ran
unchanged. Round-1 blocks still give the round-1 results (section 4).

## 1. R1-R8: verdict, fix, proof

All eight are real. Seven were reproduced with your scripts, and R8 was confirmed by reading every `flushQueue`
call site. My severity differs in places; see section 2.

| ID | Fix (files) | New tests (all fail on the reviewed code) |
|---|---|---|
| R1 | `_stopSpeakingIfMine(generation)` replaces all 11 unguarded `_emitSpeaking(false)` calls in `playUrlAndAwait` / `speakAndAwait`. Only the request that owns playback can switch the speaking state off. The remaining `_emitSpeaking` calls are the claim itself and the owner's `true` (`utils/googleTTS.ts`). | `tts-ownership-test` 18 |
| R2 | After the safety clock runs out, a clip counts as heard only if it played **and** (it reached its end within max(3 s, 10%) **or** the last status said it was playing, i.e. the callbacks just stopped). If the last status said it was stuck (`isBuffering`, or not playing while `shouldPlay` and not interrupted), it counts as not heard. The same rule is used in `utils/googleTTS.ts` `awaitSound` and `hooks/useAudio.ts` `_startClip`. The "callbacks stopped while playing" case (the reason the clock exists) still counts as heard. | `tts-ownership-test` 19, 20; `audio-cancel-test` 10, 11; `interrupt-test` 3 unchanged |
| R3 | No delete before the move. The `replaceExisting` parameter is removed. On Android `moveAsync` is `File.renameTo` (verified in `expo-file-system/.../legacy/FileSystemLegacyModule.kt:257-264`), which replaces an existing destination atomically on the same filesystem. If the move fails, the old copy stays and the `.part` file is removed. | `legacy-cache-test` 7 (fake now has Android rename semantics) |
| R4 | The 429 is classified and `startCoolDown` runs **before** `releaseDownloadSlot()`, in both `downloadAtomic` and the HEAD in `verifyCachedCopy`. Every 429 renews the pause, including the second one for the same file (`services/audioCache.ts`). | `download-line-test` 5, 6 |
| R5 | `getLocalAudioUri` never skips an existing copy. An unverified legacy copy is played and checked in the background; a cut-short copy is replaced for the next play. Cost: a truly truncated copy is heard truncated once more, which is never worse than the store version (`services/audioCache.ts`). | `legacy-cache-test` 1, 5 |
| R6 | `saveAnswer` treats these as transient (`'unreachable'`, the answer stays queued): `looksLikeNetworkFailure`, status 0, 401, 408, 425, 429, ≥500, and code `PGRST301`. Only a server refusal such as `P0001 "not authorized"` (400) is `'rejected'` (`backend/api.ts`). | `identity-queue-test` 13 (the real function cut out of `api.ts`, 7 status cases), 14 (the real function + the queue, six 429 flushes, answer kept) |
| R7 | `clearUserIpCity` returns whether the server confirmed. `wipeIfDeclined` runs before the once-per-run IP-lookup shortcut and repeats until confirmed. `useLocationPrompt` exports `onLocationDeclined()` and notifies after saving the "no". `useSponsorAd` then clears the ad at once and looks again without the IP city. A lookup in flight re-checks consent before showing its result; an IP-based result after a "no" is dropped and looked up again. A run counter makes older lookups stale (`backend/api.ts`, `hooks/useLocationPrompt.ts`, `hooks/useSponsorAd.ts`). | `location-consent-test` 5, 7, 8, 9, 10 |
| R8 | `utils/answerQueue.ts`: while answers wait, the queue is sent again on reconnect (shared poll) and on a slow timer (60 s, 3 min, 10 min; reset after progress), and it stops listening once empty. `useExam` calls `retryQueueLater()` after an unsaved answer. **Only under a server account confirmed in this run** (the id last given to `flushQueue(currentUserId)`). Without one, sending would be refused and refusals count toward giving up; identity recovery flushes after adoption. | `identity-queue-test` 15, 16, 17 |

## 2. Where the review is inaccurate (with evidence)

1. **"5 + 4 s before the first screen."** This was measured with the real `@supabase/supabase-js` and in-memory
   storage on the host `qa.invalid`:
   - With nothing saved, `getSession()` returned in **1 ms**. So on a first launch only the 4 s sign-in wait applies.
   - With a saved but expired session and an unreachable server, it was still waiting after 8 s. That is the
     returning-user path, and there `EngineContext` shows the app from the saved id **before**
     `resolveUserId` (lines 113-116).
   - 5 + 4 s needs the identity prefs file lost while the auth session survives. That is a corner case, not the
     normal first launch.
2. **R2 as High.** `playUrlAndAwait` has a single caller, `engineA/behavioral-subtopic`, playing the bundled
   `number_1..4` and `try_again` clips. `speakAndAwait` plays a local file or a data URI, which cannot buffer on the
   network. The realistic exposure is `useAudio` streaming sign audio, so Medium. It is fixed anyway, in both places.
3. **R3 remedy.** No backup/rollback scheme is needed on the target platform. The defect was my own delete before
   the move; `File.renameTo` is the proven atomic replace (see the source lines above). Note for a future iOS build:
   Expo's move there fails if the destination exists, so the replacement would fail and keep the old copy, with no
   loss.
4. **Precision note 4** (explanation components ignore `false`). This is accurate but pre-existing: the store version
   also ignored the result of `speakAndAwait(text.slice(0, 950))`. Showing a failure message there would be a UI
   change, which this release does not make. After a failed part the reading stops, and the button can be pressed
   again.
5. **"Check `reset`."** `EngineContext.reset()` has no callers anywhere in `app/`, `components/` or `hooks/`. It is
   dead code (same in `main`).

## 3. Corrections to my previous report (you were right)

- Q08: "atomic re-download with `replaceExisting`" was wrong; it deleted first. That is fixed by R3, and the
  wording is corrected here.
- Q08 design changed: the original is no longer played instead of the copy (R5).
- Q07: "all downloads paused" applies to **cache downloads through `downloadAtomic`** (and the HEAD checks). Player
  streaming and TTS requests are not in that line, so 429 bursts are reduced, not ruled out.
- "A failed TTS reading shows the error message" holds for the read-aloud **sequences** (exam, practice, quiz,
  behavioral). It does not hold for the "why?" explanation components (point 2.4 above).
- "Decline always wins" was too strong for round 1. With R7 the remaining gap is the lack of a server-side guard
  (section 5).
- "First screen after at most about 4 s" applies to a first launch; returning users see the app at once
  (point 2.1 above).

## 4. Round 1 (Q01-Q11) in brief

- **Q01** TTS ownership: `_claimTTS` / `_releaseTTS` (`googleTTS.ts`). Test: `tts-ownership-test` 1-6.
- **Q02** Waiters settle on every claim through `_waiting` (rule 4, restoring the expo-av-era behavior,
  `useAudio.ts`). Test: `audio-cancel-test` 1-3, 9.
- **Q03** Re-check after `discardCachedCopy`; `_startClip` creates nothing when not current; a failed player is
  released before the fallback. Test: `audio-cancel-test` 4-6.
- **Q04** `awaitSound` returns `'done' | 'stopped' | 'failed'`. The safety budget is the clip's length + 15 s
  (it was a flat 30 s that unloaded every longer reading, in the store version too). Test: `tts-ownership-test` 7-11.
- **Q04+** The "why?" explanation is no longer cut at 950 characters: `splitForTts` + `speakLongAndAwait`
  (`AudioFeedback`, `TextFeedback`). Test: `tts-ownership-test` 12-16.
- **Q05** Voice session ids for start/stop/cancel/unmount; vibration failures ignored. Test: `voice-cancel-test` 1-6.
- **Q06** No invented MP3 names for behavioral (`beh_`) questions. Test: `cache-urls-test` 1-5.
- **Engine A exam offline:** a behavioral question goes on when every answer reading is saved
  (`areTtsTextsCached`). Test: `tts-ownership-test` 17.
- **Q07** One download line, 3 at a time, priorities, 429 pause (now with R4). Test: `download-line-test` 1-6.
- **Q08** `verified` mark; old copies checked by HEAD in the background (now with R3 and R5). Test:
  `legacy-cache-test` 1-7.
- **Q09** `saveAnswer` result (now with R6), queue rewrite, `lateSignIn`, `identityRecovery`, `userIdIsLocal`
  (now with R8). Test: `identity-queue-test` 1-17. Practice answers (`useProgress`, `usePracticeWeak`) were
  still saved best-effort at round 2; since round 3 they go through the queue (R3.3).
- **Q10** First-launch topics after at most 2.5 s, remembered; sign-in wait 4 s. Test: `first-launch-test` 1-6.
- **Q11** Consent re-checked before writing the IP city; tier 3 skipped after a "no" (now with R7). Test:
  `location-consent-test` 1-10.
- **Also:** diagnostics are sent on reconnect (`reporter-test` 13); three Android permissions are blocked in
  `app.json` (verify in the merged manifest); every test exits non-zero on failure; `run-all.cjs` is the gate.
- **Round-1 reproductions now:** Q01-Q07 no longer reproduce. Q08 (`hasUsableCopy` size-only) and Q09
  (`resolveUserId` returns quickly) still hold by design, because the fixes live one layer up.

## 5. Still open (updated in round 3)

1. The **live Play Console Data Safety form** for voice recordings has not been re-read. The June answers file says
   "collected, app functionality".
2. ~~Deployed `stt` / `tts` / `upsert_user_progress` not compared~~ **Done in round 3:** all identical / matching
   (R3.4). Not compared: the rate-limit database side.
3. There is **no server-side guard** for `ip_city` after a decline. It would need a database change and the owner's
   approval. The client-side race (S2) is closed.
4. ~~Practice answers are not queued~~ **Done in round 3** (R3.3), together with sign views and the exam's
   storage-full case.
5. **iOS only:** the expo-location `locationWhenInUsePermission` text is still a TODO, and the move semantics differ
   (point 2.3 above).
6. **Device acceptance** of everything: no build exists with these changes.
7. The **merged manifest** of the new build (the three blocked permissions) can only be checked after a build.

## 6. Device acceptance (needs the new build; both engines)

1. Rapid taps on speakers, answers and ▶️/⏸ during sequences and TTS: never two voices, the speaking icon stays
   correct (R1), and nothing waits after a stop.
2. A long "why?" explanation (more than 950 characters, and one part longer than 30 s) is heard to the end;
   stopping it stops the rest.
3. Streaming sign audio on a weak connection: a long stall ends with the error message, not a silent skip (R2).
4. Upgrade over the store version with an existing cache:
   - Old files play from the phone, offline too, and also with a network but the storage server blocked
     (captive portal, R5).
   - Cut-short ones are repaired after one play.
5. Topic opening on a slow network: at most 3 cache downloads at once; after a 429 nothing starts until the pause
   ends (R4).
6. Exam and practice:
   - Answer offline, reconnect **without** restarting, and the answers reach the server (R8).
   - The same for one sign's questions and for weak-question practice (round 3): answered offline, they reach
     the server after reconnect, and each counts once.
   - Signs opened (Engine B) or heard to the end (Engine A) offline appear in `sign_views` after reconnect,
     and as viewed on the topic screen after a restart (round 3).
   - A 429 / expired session never removes a queued answer (R6).
   - A fresh install in airplane mode reaches a server account after reconnect.
7. Location:
   - Decline while an ad is shown (it disappears) and while a lookup runs.
   - Decline offline, then online: `users.ip_city` is empty after the wipe is confirmed (R7).
   - Decline offline on a **question screen**, stay on it, turn the connection back on: `users.ip_city` is
     empty within seconds, without changing screens (S1).
8. Voice answer: cancel while the microphone starts and while processing; answers 1-4 still work.
9. Diagnostics sent after a reconnect without a restart.
10. The merged manifest of that build no longer has the three blocked permissions; check the actual versionCode.
