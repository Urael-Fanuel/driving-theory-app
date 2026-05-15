/**
 * utils/examResult.ts
 * Shared store for exam results — memory + file persistence.
 *
 * Memory store: instant access during normal navigation.
 * File store:   survives OTA reloads / JS bundle restarts.
 *
 * Usage:
 *   storeExamResult(sessionId, data)   — call from exam screen
 *   getExamResult(sessionId)           — call from result screen (sync, memory)
 *   preloadExamResult(sessionId)       — call on result screen mount (async, file fallback)
 */

import * as FileSystem from 'expo-file-system/legacy';

/** One question the user answered incorrectly during the exam */
export interface WrongQuestion {
  questionId: string;
  signId:     string;
  topicId:    string;
}

export interface ResultData {
  score:           number;
  total:           number;
  passed:          boolean;
  durationSeconds: number;
  topicBreakdown?: Record<string, { correct: number; total: number }>;
  /** Questions the user got wrong — used for weak-area practice */
  wrongQuestions?: WrongQuestion[];
}

// ─── In-memory store ──────────────────────────────────────────────────────────

const resultStore = new Map<string, ResultData>();

// ─── File helpers ─────────────────────────────────────────────────────────────

const RESULTS_DIR = (FileSystem.documentDirectory ?? '') + 'exam_results/';

function resultFilePath(sessionId: string): string {
  return RESULTS_DIR + sessionId + '.json';
}

async function ensureDir(): Promise<void> {
  const info = await FileSystem.getInfoAsync(RESULTS_DIR);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(RESULTS_DIR, { intermediates: true });
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/** Store result in memory and persist to file (fire-and-forget). */
export function storeExamResult(sessionId: string, data: ResultData): void {
  resultStore.set(sessionId, data);

  // Persist to file asynchronously — does not block the UI
  ensureDir()
    .then(() => FileSystem.writeAsStringAsync(resultFilePath(sessionId), JSON.stringify(data)))
    .catch(() => {}); // non-critical — memory store is the primary source
}

/** Get result from memory (sync). Returns undefined if not in memory yet. */
export function getExamResult(sessionId: string): ResultData | undefined {
  return resultStore.get(sessionId);
}

/**
 * Load result from file into memory store (async).
 * Call this on result screen mount when getExamResult returns undefined.
 * Returns the loaded data, or undefined if file doesn't exist.
 */
export async function preloadExamResult(sessionId: string): Promise<ResultData | undefined> {
  // Already in memory — no need to read file
  if (resultStore.has(sessionId)) return resultStore.get(sessionId);

  try {
    const path = resultFilePath(sessionId);
    const info = await FileSystem.getInfoAsync(path);
    if (!info.exists) return undefined;

    const json = await FileSystem.readAsStringAsync(path);
    const data: ResultData = JSON.parse(json);
    resultStore.set(sessionId, data);
    return data;
  } catch {
    return undefined;
  }
}
