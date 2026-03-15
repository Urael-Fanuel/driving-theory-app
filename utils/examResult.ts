/**
 * utils/examResult.ts
 * Shared in-memory store for exam results.
 *
 * Used to pass result data from useExam → result screen
 * without hitting URL param length limits.
 */

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

const resultStore = new Map<string, ResultData>();

export function storeExamResult(sessionId: string, data: ResultData): void {
  resultStore.set(sessionId, data);
}

export function getExamResult(sessionId: string): ResultData | undefined {
  return resultStore.get(sessionId);
}
