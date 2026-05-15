/**
 * hooks/usePracticeWeak.ts
 * Practice state machine for weak-area review after an exam.
 *
 * Receives a list of wrong question IDs, fetches them, and cycles through
 * them until the user answers every one correctly at least once.
 *
 * State machine:
 *   LOADING → QUESTION → FEEDBACK_CORRECT | FEEDBACK_WRONG → QUESTION | DONE
 *
 * Rules:
 *   - Answered correctly → removed from the pool
 *   - Answered wrong     → pushed to the back of the queue
 *   - Session ends when the pool is empty (all answered correctly)
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { DBQuestion } from '../backend/supabaseClient';
import * as api from '../backend/api';
import { useEngine } from '../contexts/EngineContext';

// ─── Types ────────────────────────────────────────────────────────────────────

export type PracticePhase =
  | 'loading'
  | 'question'
  | 'feedback_correct'
  | 'feedback_wrong'
  | 'done';

export interface UsePracticeWeakReturn {
  phase:             PracticePhase;
  currentQuestion:   DBQuestion | null;
  /** Questions remaining in the pool (not yet answered correctly) */
  remaining:         number;
  /** How many questions were in the original pool */
  total:             number;
  submitAnswer:      (answerId: string) => void;
  nextQuestion:      () => void;
  lastAnswerCorrect: boolean | null;
  selectedAnswerId:  string | null;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function usePracticeWeak(questionIds: string[]): UsePracticeWeakReturn {
  const { userId } = useEngine();

  const [phase,             setPhase]             = useState<PracticePhase>('loading');
  const [queue,             setQueue]             = useState<DBQuestion[]>([]);
  const [currentIndex,      setCurrentIndex]      = useState(0);
  const [lastAnswerCorrect, setLastAnswerCorrect] = useState<boolean | null>(null);
  const [selectedAnswerId,  setSelectedAnswerId]  = useState<string | null>(null);
  const [total,             setTotal]             = useState(0);

  // Ref for synchronous access inside setQueue updater — avoids stale closure
  const lastAnswerCorrectRef = useRef<boolean | null>(null);

  // ── Load questions on mount ────────────────────────────────────────────────
  useEffect(() => {
    if (!questionIds.length) {
      setPhase('done');
      return;
    }
    loadQuestions();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function loadQuestions() {
    setPhase('loading');
    try {
      const qs = await api.getQuestionsByIds(questionIds);
      if (!qs.length) {
        setPhase('done');
        return;
      }
      setQueue(qs);
      setTotal(qs.length);
      setCurrentIndex(0);
      setLastAnswerCorrect(null);
      setSelectedAnswerId(null);
      setPhase('question');
    } catch (err) {
      console.error('[usePracticeWeak] Failed to load questions:', err);
      setPhase('done');
    }
  }

  // ── Current question ───────────────────────────────────────────────────────
  const currentQuestion = queue[currentIndex] ?? null;

  // ── Submit answer ──────────────────────────────────────────────────────────
  const submitAnswer = useCallback((answerId: string) => {
    if (!currentQuestion || phase !== 'question') return;

    const correctAnswer = currentQuestion.answers.find(a => a.is_correct);
    const isCorrect     = correctAnswer?.id === answerId;

    lastAnswerCorrectRef.current = isCorrect;
    setLastAnswerCorrect(isCorrect);
    setSelectedAnswerId(answerId);
    setPhase(isCorrect ? 'feedback_correct' : 'feedback_wrong');

    // Save to backend
    if (userId) {
      api.saveAnswer(userId, currentQuestion.id, isCorrect).catch(() => {});
    }
  }, [currentQuestion, phase, userId]);

  // ── Next question ──────────────────────────────────────────────────────────
  const nextQuestion = useCallback(() => {
    setSelectedAnswerId(null);
    setLastAnswerCorrect(null);

    setQueue(prevQueue => {
      if (lastAnswerCorrectRef.current) {
        // Answered correctly → remove from queue
        const newQueue = prevQueue.filter((_, i) => i !== currentIndex);
        if (newQueue.length === 0) {
          setPhase('done');
          setCurrentIndex(0);
          return newQueue;
        }
        // Stay at same index (next item slides in) or clamp to last
        const nextIdx = Math.min(currentIndex, newQueue.length - 1);
        setCurrentIndex(nextIdx);
        setPhase('question');
        return newQueue;
      } else {
        // Answered wrong → move to end of queue
        const current = prevQueue[currentIndex];
        const newQueue = [
          ...prevQueue.slice(0, currentIndex),
          ...prevQueue.slice(currentIndex + 1),
          current,
        ];
        // Stay at same index (next item slides in) or clamp
        const nextIdx = Math.min(currentIndex, newQueue.length - 1);
        setCurrentIndex(nextIdx);
        setPhase('question');
        return newQueue;
      }
    });
  }, [currentIndex]);

  return {
    phase,
    currentQuestion,
    remaining: queue.length,
    total,
    submitAnswer,
    nextQuestion,
    lastAnswerCorrect,
    selectedAnswerId,
  };
}
