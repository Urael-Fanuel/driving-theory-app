/**
 * utils/quizReview.ts
 *
 * The data for the end-of-quiz review (components/shared/QuizReview.tsx) built from a quiz's
 * questions and the answers given: correct / total per topic, and the questions answered wrong.
 * Same shape the 30-question exam produces (hooks/useExam.ts), so the daily quiz can end with
 * the same review. Only ANSWERED questions count (the › arrow can skip a question).
 */
import type { WrongQuestion } from './examResult';

interface ReviewQuestion {
  id: string;
  sign_id?: string | null;
  topic_id?: string | null;
  question_image_url?: string | null;
}
interface ReviewAnswer {
  questionId: string;
  isCorrect: boolean;
}

export interface QuizReviewData {
  topicBreakdown: Record<string, { correct: number; total: number }>;
  wrongQuestions: WrongQuestion[];
}

export function buildQuizReview(questions: ReviewQuestion[], answers: ReviewAnswer[]): QuizReviewData {
  const byId = new Map(questions.map(q => [q.id, q]));
  const topicBreakdown: QuizReviewData['topicBreakdown'] = {};
  const wrongQuestions: WrongQuestion[] = [];
  for (const a of answers) {
    const q = byId.get(a.questionId);
    const topicId = q?.topic_id ?? '';
    if (!topicId) continue;
    const t = topicBreakdown[topicId] ?? (topicBreakdown[topicId] = { correct: 0, total: 0 });
    t.total++;
    if (a.isCorrect) t.correct++;
    else wrongQuestions.push({
      questionId:       a.questionId,
      signId:           q?.sign_id ?? '',
      topicId,
      questionImageUrl: q?.question_image_url ?? undefined,
    });
  }
  return { topicBreakdown, wrongQuestions };
}
