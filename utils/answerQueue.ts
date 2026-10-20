/**
 * utils/answerQueue.ts
 * Local persistent queue for what the learner does while maybe offline:
 * answers (the exam, and since CODEX QA round 3 the practice screens too) and,
 * since round 3, sign views. See saveAnswerKept / saveSignViewKept below.
 *
 * Flow:
 *   1. User answers → enqueue() → saved to local file immediately
 *   2. Try Supabase → only if it was SAVED → dequeue()
 *   3. On app start / when the identity is confirmed → flushQueue() → retry the rest
 *
 * Fixed 2026-10-08 (CODEX QA, Q09):
 *   - api.saveAnswer used to return nothing either way, so an answer was
 *     removed from the queue even when it had not been saved (an exam answered
 *     offline was lost at once). It now says 'saved' / 'rejected' / 'unreachable',
 *     and an entry leaves the queue only when it was saved.
 *   - The server accepts an answer only under the signed-in user's own id. An
 *     answer recorded under a local id (first start with no connection) or under
 *     an account whose session was lost could never be saved, whatever the
 *     retries. flushQueue(currentUserId) moves every entry to the current,
 *     server-backed id first: this phone has one learner.
 *   - Every read-modify-write of the file runs one at a time, so an answer
 *     enqueued while a flush is running is never overwritten.
 */

import * as FileSystem from 'expo-file-system/legacy';
import * as api from '../backend/api';
import { reportError } from '../services/errorReporter';
import { onConnectivityChange } from '../hooks/useNetworkStatus';

const QUEUE_PATH = (FileSystem.documentDirectory ?? '') + 'pending_answers.json';

/** An entry the server refused this many times (on separate flushes) is given up. */
const MAX_REJECTIONS = 5;

export interface PendingAnswer {
  /** Entries written before round 3 have no kind: they are answers. */
  kind?: 'answer';
  id: string;        // unique: userId_questionId_timestamp_random (also the submission id)
  userId: string;
  questionId: string;
  isCorrect: boolean;
  timestamp: number;
  /** How many flushes the server refused this entry on (not counting "no connection"). */
  rejections?: number;
}

/** A sign the learner viewed, kept the same way (CODEX QA round 3, owner's decision). */
export interface PendingSignView {
  kind: 'signView';
  id: string;        // unique: userId_view_signId_timestamp_random (queue identity only)
  userId: string;
  signId: string;
  videoCompleted: boolean;
  timestamp: number;
  rejections?: number;
}

type PendingEntry = PendingAnswer | PendingSignView;
type NewEntry =
  | Omit<PendingAnswer, 'id' | 'timestamp' | 'rejections'>
  | Omit<PendingSignView, 'id' | 'timestamp' | 'rejections'>;

// ─── Read / Write queue ───────────────────────────────────────────────────────

async function readQueue(): Promise<PendingEntry[]> {
  try {
    const info = await FileSystem.getInfoAsync(QUEUE_PATH);
    if (!info.exists) return [];
    const raw = await FileSystem.readAsStringAsync(QUEUE_PATH);
    return JSON.parse(raw) as PendingEntry[];
  } catch {
    return [];
  }
}

async function writeQueue(queue: PendingEntry[]): Promise<void> {
  await FileSystem.writeAsStringAsync(QUEUE_PATH, JSON.stringify(queue));
}

/** Runs read-modify-write steps on the queue file one at a time. */
let _chain: Promise<unknown> = Promise.resolve();
function serialized<T>(step: () => Promise<T>): Promise<T> {
  const run = _chain.then(step, step);
  _chain = run.catch(() => {});
  return run;
}

// ─── Public API ───────────────────────────────────────────────────────────────

function addEntry(entry: NewEntry): Promise<string> {
  return serialized(async () => {
    const what = entry.kind === 'signView' ? 'view_' + entry.signId : entry.questionId;
    // The random tail keeps two entries made in the same millisecond apart:
    // dequeue() removes by id (a sign screen can report a view twice at once).
    const id = `${entry.userId}_${what}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const queue = await readQueue();
    queue.push({ ...entry, id, timestamp: Date.now() } as PendingEntry);
    await writeQueue(queue);
    return id;
  });
}

/**
 * Add an answer to the local queue (called immediately when user answers).
 */
export function enqueue(answer: Omit<PendingAnswer, 'id' | 'timestamp' | 'rejections' | 'kind'>): Promise<string> {
  return addEntry(answer);
}

/**
 * Remove an entry from the local queue (called after Supabase confirms).
 */
export function dequeue(id: string): Promise<void> {
  return serialized(async () => {
    const queue = await readQueue();
    await writeQueue(queue.filter(a => a.id !== id));
  });
}

let _flushing: Promise<void> | null = null;
let _flushAgainFor: string | undefined | null = null;   // a flush requested while one was running

// ─── Keep trying while answers wait (CODEX QA 2026-10-08, R8) ─────────────────
// A flush used to run only at app start and when the identity was confirmed,
// so an answer kept during a disconnection waited for the next app start.
// While answers wait, the queue is now sent again when the connection comes
// back, and on a slow timer (for a server that refuses for a while, e.g. 429).
//
// Only under a server account CONFIRMED in this run (the id the last
// flushQueue(currentUserId) was given). Without one, sending would only be
// refused, and refusals count toward giving an answer up: the identity
// recovery (services/identityRecovery.ts) flushes once it has the account.

const RETRY_DELAYS_MS = [60_000, 180_000, 600_000];
let _confirmedUserId: string | undefined;
let _reconnectWatch: (() => void) | null = null;
let _retryTimer: ReturnType<typeof setTimeout> | null = null;
let _retryStep = 0;
/** The last flush stopped because the server could not be reached, and refused nothing. */
let _outOfReach = false;

function keepTrying(): void {
  if (!_confirmedUserId) return;
  if (!_reconnectWatch) {
    _reconnectWatch = onConnectivityChange(connected => {
      if (connected) void flushQueue(_confirmedUserId);
    });
  }
  // After the last step the timer goes on every 10 minutes while the server
  // is out of reach (CODEX QA round 3, S3): it used to stop after 3 tries, so
  // a server that came back while the phone stayed connected got the answers
  // only at the next app start. Not after refusals: each refused flush counts
  // toward giving an answer up (MAX_REJECTIONS), and what is refused now may be
  // fixed by the next app start (a new sign-in moves the answers to it).
  const last = RETRY_DELAYS_MS.length - 1;
  if (!_retryTimer && (_retryStep <= last || _outOfReach)) {
    _retryTimer = setTimeout(() => {
      _retryTimer = null;
      _retryStep++;
      void flushQueue(_confirmedUserId);
    }, RETRY_DELAYS_MS[Math.min(_retryStep, last)]);
  }
}

function stopTrying(): void {
  try { _reconnectWatch?.(); } catch {}
  _reconnectWatch = null;
  if (_retryTimer) { clearTimeout(_retryTimer); _retryTimer = null; }
  _retryStep = 0;
}

/**
 * An entry could not be saved just now: send it again when the connection
 * returns or on the slow timer, if this run has a confirmed server account.
 * Without one this does nothing (see above).
 */
export function retryQueueLater(): void {
  keepTrying();
}

/**
 * Keeps an entry in the queue file on the phone, sends it, and removes it only
 * once the server has it. Not saved now: sent again on reconnect, on the slow
 * timer or at the next app start. If the file cannot be written (e.g. the
 * phone's storage is full), the entry is still sent now, without a queue id
 * (CODEX QA round 3: the exam used to send nothing in that case).
 */
async function keepAndSend(entry: NewEntry, send: (queueId?: string) => Promise<api.SaveAnswerResult>): Promise<void> {
  let queueId: string | undefined;
  try {
    queueId = await addEntry(entry);
  } catch (err) {
    console.warn('[answerQueue] could not keep the entry on the phone:', err);
  }
  const result = await send(queueId);
  if (!queueId) return;
  if (result === 'saved') return dequeue(queueId);
  retryQueueLater();
}

/**
 * Saves one answer: the exam (hooks/useExam.ts) and, since CODEX QA round 3,
 * the practice screens (one sign's questions, hooks/useProgress.ts;
 * weak-question practice, hooks/usePracticeWeak.ts), which used to send
 * straight to the server, so an answer given offline never reached it.
 * The queue id is the submission id: a replay of the same answer is not
 * counted twice.
 */
export function saveAnswerKept(userId: string, questionId: string, isCorrect: boolean): Promise<void> {
  return keepAndSend({ userId, questionId, isCorrect },
    queueId => api.saveAnswer(userId, questionId, isCorrect, 3, queueId));
}

/**
 * Saves one sign view (hooks/useProgress.ts markSignViewed, both engines). It
 * used to be sent once, best-effort, so a sign viewed offline was never
 * counted on the server (CODEX QA round 3, owner's decision). A view has no
 * submission id on the server: a replay after a lost reply can add one to
 * view_count, which the app does not show; "viewed" and video_completed
 * (an OR) are unaffected.
 */
export function saveSignViewKept(userId: string, signId: string, videoCompleted: boolean): Promise<void> {
  return keepAndSend({ kind: 'signView', userId, signId, videoCompleted },
    () => api.recordSignView(userId, signId, videoCompleted));
}

/**
 * Send all queued answers to Supabase.
 * Called on app startup and when the user's server identity is confirmed.
 *
 * Pass the current, server-backed user id: entries recorded under any other id
 * are moved to it first (see the header). Without an id nothing is moved.
 * Only one flush runs at a time; a request made meanwhile runs right after it.
 */
export function flushQueue(currentUserId?: string): Promise<void> {
  if (currentUserId) _confirmedUserId = currentUserId;   // callers pass only server-backed ids
  if (_flushing) {
    _flushAgainFor = currentUserId ?? _flushAgainFor ?? undefined;
    return _flushing;
  }
  _flushing = (async () => {
    try {
      await flushOnce(currentUserId);
      while (_flushAgainFor !== null) {
        const next = _flushAgainFor;
        _flushAgainFor = null;
        await flushOnce(next);
      }
    } finally {
      _flushing = null;
    }
  })();
  return _flushing;
}

async function flushOnce(currentUserId?: string): Promise<void> {
  // 1. Snapshot (and move entries to the current id) under the file lock.
  const snapshot = await serialized(async () => {
    const queue = await readQueue();
    if (currentUserId && queue.some(a => a.userId !== currentUserId)) {
      for (const a of queue) a.userId = currentUserId;
      await writeQueue(queue);
    }
    return queue;
  });
  if (snapshot.length === 0) { stopTrying(); return; }

  console.log(`[answerQueue] Flushing ${snapshot.length} pending entries`);

  // 2. Send, outside the lock (network time must not hold up a new answer).
  const saved = new Set<string>();
  const rejected = new Set<string>();
  let outOfReach = false;
  for (const entry of snapshot) {
    // An answer reuses the queue entry's own id as the submission id — if the
    // original save already reached the server before this replay (the usual
    // crash-between-success-and-dequeue case this queue exists for), the server
    // sees the same id again and skips re-incrementing.
    const result = entry.kind === 'signView'
      ? await api.recordSignView(entry.userId, entry.signId, entry.videoCompleted)
      : await api.saveAnswer(entry.userId, entry.questionId, entry.isCorrect, 2, entry.id);
    if (result === 'saved') saved.add(entry.id);
    else if (result === 'rejected') rejected.add(entry.id);
    else { outOfReach = true; break; }   // no connection: the rest would fail the same way; try again later
  }
  _outOfReach = outOfReach && rejected.size === 0;

  // 3. Apply the outcome under the lock, to the file as it is NOW (an answer
  //    enqueued meanwhile stays untouched).
  let givenUp = 0;
  let left = 0;
  await serialized(async () => {
    const queue = await readQueue();
    const next: PendingEntry[] = [];
    for (const a of queue) {
      if (saved.has(a.id)) continue;
      if (rejected.has(a.id)) {
        const rejections = (a.rejections ?? 0) + 1;
        if (rejections >= MAX_REJECTIONS) { givenUp++; continue; }
        next.push({ ...a, rejections });
        continue;
      }
      next.push(a);
    }
    await writeQueue(next);
    left = next.length;
  });
  if (givenUp > 0) {
    reportError('api', 'answerQueue.flush', `gave up on ${givenUp} answer(s) / sign view(s) the server kept refusing`, { count: givenUp });
  }
  // Entries still waiting: try again on reconnect / the slow timer (R8).
  if (left === 0) {
    stopTrying();
  } else {
    if (saved.size > 0) _retryStep = 0;   // progress: start the slow timer over
    keepTrying();
  }
}

/**
 * Get current queue size (for debugging).
 */
export async function getQueueSize(): Promise<number> {
  const queue = await readQueue();
  return queue.length;
}
