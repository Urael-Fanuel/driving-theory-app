/**
 * AGENT 3 — hooks/useExam.ts
 * Exam state machine for both Engine A and Engine B.
 *
 * State machine:
 *   LOADING → QUESTION → ANSWERING → FEEDBACK → NEXT_QUESTION | RESULT
 *
 * Handles:
 * - Random question selection (30 questions, balanced per topic)
 * - Answer submission and scoring
 * - Per-topic breakdown
 * - Time tracking
 * - Final result calculation (pass = 24/30 = 80%)
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { DBQuestion } from '../backend/supabaseClient';
import * as api from '../backend/api';
import { useEngine } from '../contexts/EngineContext';
import { enqueue, dequeue } from '../utils/answerQueue';
import { prefetchQuestionAudio, clearAudioCache } from '../services/audioCache';

// ─── Types ────────────────────────────────────────────────────────────────────

export type ExamPhase =
  | 'loading'
  | 'question'
  | 'feedback_correct'
  | 'feedback_wrong'
  | 'result';

export interface ExamAnswer {
  questionId: string;
  selectedAnswerId: string;
  isCorrect: boolean;
  topicId: string;
}

export interface ExamResult {
  sessionId: string;
  score: number;
  total: number;
  passed: boolean;
  durationSeconds: number;
  topicBreakdown: Record<string, { correct: number; total: number }>;
  answers: ExamAnswer[];
  /** Questions the user got wrong — used for weak-area practice */
  wrongQuestions: WrongQuestion[];
}

export interface WrongQuestion {
  questionId: string;
  signId:     string;
  topicId:    string;
}

export interface UseExamReturn {
  /** Current phase of the exam */
  phase: ExamPhase;
  /** All questions for this exam session */
  questions: DBQuestion[];
  /** Current question index (0-based) */
  currentIndex: number;
  /** Current question */
  currentQuestion: DBQuestion | null;
  /** Progress: e.g. "5 / 30" */
  progress: { current: number; total: number };
  /** Submit an answer (by answer ID: 'A', 'B', or 'C') */
  submitAnswer: (answerId: string) => void;
  /** Advance to next question */
  nextQuestion: () => void;
  /** Final result (available when phase === 'result') */
  result: ExamResult | null;
  /** Was the last answer correct? */
  lastAnswerCorrect: boolean | null;
  /** Which answer ID was selected */
  selectedAnswerId: string | null;
  /** Start a new exam session */
  restart: () => void;
  /** Elapsed time in seconds */
  elapsedSeconds: number;
  /** All submitted answers so far */
  answers: ExamAnswer[];
  /** Jump to any question by index (restores answered state if already answered) */
  goToQuestion: (index: number) => void;
  /** True while an answer is being saved to the server */
  isSaving: boolean;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const EXAM_QUESTION_COUNT = 30;
const PASS_THRESHOLD      = 24; // 24/30 = 80%

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useExam(): UseExamReturn {
  const { userId, engineType } = useEngine();

  const [phase, setPhase]                     = useState<ExamPhase>('loading');
  const [questions, setQuestions]             = useState<DBQuestion[]>([]);
  const [currentIndex, setCurrentIndex]       = useState(0);
  const [answers, setAnswers]                 = useState<ExamAnswer[]>([]);
  const [result, setResult]                   = useState<ExamResult | null>(null);
  const [lastAnswerCorrect, setLastAnswerCorrect] = useState<boolean | null>(null);
  const [selectedAnswerId, setSelectedAnswerId]   = useState<string | null>(null);
  const [elapsedSeconds, setElapsedSeconds]   = useState(0);
  const [isSaving, setIsSaving]               = useState(false);

  const startTimeRef = useRef<number>(Date.now());
  const timerRef     = useRef<ReturnType<typeof setInterval> | null>(null);
  // Ref for synchronous access in nextQuestion — avoids stale closure over answers state
  const answersRef   = useRef<ExamAnswer[]>([]);

  // ── Load questions on mount ──────────────────────────────────────────────────
  useEffect(() => {
    loadQuestions();
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  async function loadQuestions() {
    setPhase('loading');
    try {
      const qs = await api.getRandomExamQuestions(EXAM_QUESTION_COUNT);
      setQuestions(qs);
      setCurrentIndex(0);
      setAnswers([]);
      setResult(null);
      setLastAnswerCorrect(null);
      setSelectedAnswerId(null);
      setElapsedSeconds(0);

      // Start timer
      startTimeRef.current = Date.now();
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = setInterval(() => {
        setElapsedSeconds(Math.floor((Date.now() - startTimeRef.current) / 1000));
      }, 1000);

      setPhase('question');

      // Prefetch audio for first 3 questions in background
      qs.slice(0, 3).forEach(q => prefetchQuestionAudio(q));
    } catch (error) {
      console.error('[useExam] Failed to load questions:', error);
      // Keep in loading state — UI should show error
    }
  }

  // ── Submit answer ────────────────────────────────────────────────────────────
  const submitAnswer = useCallback((answerId: string) => {
    const question = questions[currentIndex];
    if (!question || phase !== 'question') return;

    const correctAnswer = question.answers.find(a => a.is_correct);
    const isCorrect = correctAnswer?.id === answerId;

    const answer: ExamAnswer = {
      questionId:     question.id,
      selectedAnswerId: answerId,
      isCorrect,
      topicId:        question.topic_id,
    };

    answersRef.current = [...answersRef.current, answer];
    setAnswers(answersRef.current);
    setLastAnswerCorrect(isCorrect);
    setSelectedAnswerId(answerId);
    setPhase(isCorrect ? 'feedback_correct' : 'feedback_wrong');

    // Save locally first, then sync to Supabase
    if (__DEV__) console.log('[useExam] userId:', userId);
    if (userId) {
      setIsSaving(true);
      enqueue({ userId, questionId: question.id, isCorrect })
        .then(queueId =>
          api.saveAnswer(userId, question.id, isCorrect)
            .then(() => dequeue(queueId))
        )
        .catch(err => console.warn('[useExam] save failed:', err))
        .finally(() => setTimeout(() => setIsSaving(false), 800));
    }
  }, [questions, currentIndex, phase, userId]);

  // ── Next question ────────────────────────────────────────────────────────────
  const nextQuestion = useCallback(async () => {
    const nextIndex = currentIndex + 1;
    setSelectedAnswerId(null);
    setLastAnswerCorrect(null);

    if (nextIndex >= questions.length) {
      // Exam complete — compute results
      await finishExam([...answersRef.current]);
    } else {
      setCurrentIndex(nextIndex);
      setPhase('question');

      // Prefetch audio for next 3 questions in background
      questions.slice(nextIndex + 1, nextIndex + 4).forEach(q => prefetchQuestionAudio(q));
    }
  }, [currentIndex, questions.length]);

  // ── Finish and save exam ─────────────────────────────────────────────────────
  async function finishExam(finalAnswers: ExamAnswer[]) {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    const duration = Math.floor((Date.now() - startTimeRef.current) / 1000);
    const score    = finalAnswers.filter(a => a.isCorrect).length;
    const passed   = score >= PASS_THRESHOLD;

    // Build topic breakdown
    const breakdown: Record<string, { correct: number; total: number }> = {};
    for (const answer of finalAnswers) {
      if (!breakdown[answer.topicId]) {
        breakdown[answer.topicId] = { correct: 0, total: 0 };
      }
      breakdown[answer.topicId].total++;
      if (answer.isCorrect) breakdown[answer.topicId].correct++;
    }

    // Build list of wrong questions for weak-area practice
    const wrongQuestions: WrongQuestion[] = finalAnswers
      .filter(a => !a.isCorrect)
      .map(a => {
        const q = questions.find(q => q.id === a.questionId);
        return { questionId: a.questionId, signId: q?.sign_id ?? '', topicId: a.topicId };
      });

    // Save to Supabase
    let sessionId = 'local-' + Date.now();
    try {
      if (userId && engineType) {
        const saved = await api.saveExamSession(
          userId,
          engineType,
          score,
          finalAnswers.length,
          duration,
          breakdown
        );
        sessionId = saved.sessionId;
      }
    } catch (error) {
      console.warn('[useExam] Failed to save exam session:', error);
    }

    const examResult: ExamResult = {
      sessionId,
      score,
      total:           finalAnswers.length,
      passed,
      durationSeconds: duration,
      topicBreakdown:  breakdown,
      answers:         finalAnswers,
      wrongQuestions,
    };

    setResult(examResult);
    setElapsedSeconds(duration);
    setPhase('result');

    // Clear cached audio — exam is done
    clearAudioCache().catch(() => {});
  }

  // ── Navigate to any question (view answered, or advance to unanswered) ────────
  const goToQuestion = useCallback((index: number) => {
    if (index < 0 || index >= questions.length) return;
    const question = questions[index];
    const existingAnswer = answers.find(a => a.questionId === question.id);
    if (existingAnswer) {
      // Show previously answered question in its result state
      setSelectedAnswerId(existingAnswer.selectedAnswerId);
      setLastAnswerCorrect(existingAnswer.isCorrect);
      setPhase(existingAnswer.isCorrect ? 'feedback_correct' : 'feedback_wrong');
    } else {
      // Unanswered question — show normally
      setSelectedAnswerId(null);
      setLastAnswerCorrect(null);
      setPhase('question');
    }
    setCurrentIndex(index);
  }, [questions, answers]);

  // ── Restart ───────────────────────────────────────────────────────────────────
  const restart = useCallback(() => {
    loadQuestions();
  }, []);

  // ── Derived values ────────────────────────────────────────────────────────────
  const currentQuestion = questions[currentIndex] ?? null;
  const progress = {
    current: currentIndex + 1,
    total:   questions.length,
  };

  return {
    phase,
    questions,
    currentIndex,
    currentQuestion,
    progress,
    submitAnswer,
    nextQuestion,
    result,
    lastAnswerCorrect,
    selectedAnswerId,
    restart,
    elapsedSeconds,
    answers,
    goToQuestion,
    isSaving,
  };
}
