/**
 * utils/examResult.ts
 * Shared in-memory store for exam results.
 *
 * Used to pass result data from useExam → result screen
 * without hitting URL param length limits.
 */

export interface ResultData {
  score:           number;
  total:           number;
  passed:          boolean;
  durationSeconds: number;
  topicBreakdown?: Record<string, { correct: number; total: number }>;
}

const resultStore = new Map<string, ResultData>();

export function storeExamResult(sessionId: string, data: ResultData): void {
  resultStore.set(sessionId, data);
}

export function getExamResult(sessionId: string): ResultData | undefined {
  return resultStore.get(sessionId);
}
