/**
 * utils/answerQueue.ts
 * Local persistent queue for exam answers.
 *
 * Flow:
 *   1. User answers → enqueue() → saved to local file immediately
 *   2. Try Supabase → on success → dequeue()
 *   3. On app start → flushQueue() → retry any leftover answers
 */

import * as FileSystem from 'expo-file-system/legacy';
import * as api from '../backend/api';

const QUEUE_PATH = (FileSystem.documentDirectory ?? '') + 'pending_answers.json';

export interface PendingAnswer {
  id: string;        // unique: userId_questionId_timestamp
  userId: string;
  questionId: string;
  isCorrect: boolean;
  timestamp: number;
}

// ─── Read / Write queue ───────────────────────────────────────────────────────

async function readQueue(): Promise<PendingAnswer[]> {
  try {
    const info = await FileSystem.getInfoAsync(QUEUE_PATH);
    if (!info.exists) return [];
    const raw = await FileSystem.readAsStringAsync(QUEUE_PATH);
    return JSON.parse(raw) as PendingAnswer[];
  } catch {
    return [];
  }
}

async function writeQueue(queue: PendingAnswer[]): Promise<void> {
  await FileSystem.writeAsStringAsync(QUEUE_PATH, JSON.stringify(queue));
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Add an answer to the local queue (called immediately when user answers).
 */
export async function enqueue(answer: Omit<PendingAnswer, 'id' | 'timestamp'>): Promise<string> {
  const id = `${answer.userId}_${answer.questionId}_${Date.now()}`;
  const entry: PendingAnswer = { ...answer, id, timestamp: Date.now() };
  const queue = await readQueue();
  queue.push(entry);
  await writeQueue(queue);
  return id;
}

/**
 * Remove an answer from the local queue (called after Supabase confirms).
 */
export async function dequeue(id: string): Promise<void> {
  const queue = await readQueue();
  await writeQueue(queue.filter(a => a.id !== id));
}

/**
 * Send all queued answers to Supabase.
 * Called on app startup to recover from crashes/disconnects.
 */
export async function flushQueue(): Promise<void> {
  const queue = await readQueue();
  if (queue.length === 0) return;

  console.log(`[answerQueue] Flushing ${queue.length} pending answers`);

  for (const answer of queue) {
    try {
      // Reuse the queue entry's own id as the submission id — if the
      // original save already reached the server before this replay (the
      // usual crash-between-success-and-dequeue case this queue exists
      // for), the server sees the same id again and skips re-incrementing.
      await api.saveAnswer(answer.userId, answer.questionId, answer.isCorrect, 2, answer.id);
      await dequeue(answer.id);
    } catch {
      // Will retry next time app opens
    }
  }
}

/**
 * Get current queue size (for debugging).
 */
export async function getQueueSize(): Promise<number> {
  const queue = await readQueue();
  return queue.length;
}
