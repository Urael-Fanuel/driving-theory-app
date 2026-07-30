/**
 * hooks/useTopicQuiz.ts
 * State machine for the per-topic mini-quiz (10 questions from one topic).
 *
 * Simpler than useExam:
 *  - Fixed 10 questions from a single topic
 *  - No timer, no Supabase session saving
 *  - Inline result (no navigation to result screen)
 *  - Pass threshold: 7/10 (70%)
 *
 * Phases:
 *   loading → question → feedback_correct | feedback_wrong → [next or result]
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { DBQuestion } from '../backend/supabaseClient';
import * as api from '../backend/api';
import { prefetchQuestionAudio, releaseQuestionAudio } from '../services/audioCache';
import { collectTtsTexts, prefetchTtsForTexts } from '../utils/googleTTS';
import { useEngine } from '../contexts/EngineContext';

// ─── Types ────────────────────────────────────────────────────────────────────

export type TopicQuizPhase =
  | 'loading'
  | 'question'
  | 'feedback_correct'
  | 'feedback_wrong'
  | 'result';

export interface TopicQuizAnswer {
  questionId:       string;
  selectedAnswerId: string;
  isCorrect:        boolean;
}

export interface TopicQuizResult {
  score:    number;
  total:    number;
  passed:   boolean;
  /** Question IDs the user got wrong — for highlighting */
  wrongIds: string[];
}

export interface UseTopicQuizReturn {
  phase:             TopicQuizPhase;
  questions:         DBQuestion[];
  currentIndex:      number;
  currentQuestion:   DBQuestion | null;
  progress:          { current: number; total: number };
  lastAnswerCorrect: boolean | null;
  selectedAnswerId:  string | null;
  result:            TopicQuizResult | null;
  submitAnswer:      (answerId: string) => void;
  nextQuestion:      () => void;
  /** Jump to any question by index — shows answered state if already answered */
  goToQuestion:      (index: number) => void;
  restart:           () => void;
}

// ─── Constants ────────────────────────────────────────────────────────────────

/** Pass threshold: 70% of all questions in the topic */
const PASS_THRESHOLD_PCT = 0.7;

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useTopicQuiz(topicId: string, levelId?: string): UseTopicQuizReturn {
  const { engineType } = useEngine();
  const [phase,              setPhase]              = useState<TopicQuizPhase>('loading');
  const [questions,          setQuestions]          = useState<DBQuestion[]>([]);
  const [currentIndex,       setCurrentIndex]       = useState(0);
  const [answers,            setAnswers]            = useState<TopicQuizAnswer[]>([]);
  const [lastAnswerCorrect,  setLastAnswerCorrect]  = useState<boolean | null>(null);
  const [selectedAnswerId,   setSelectedAnswerId]   = useState<string | null>(null);
  const [result,             setResult]             = useState<TopicQuizResult | null>(null);

  // Ref for synchronous access inside nextQuestion (avoids stale closure)
  const answersRef = useRef<TopicQuizAnswer[]>([]);

  // ── Load questions ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (topicId) loadQuestions();
  }, [topicId, levelId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function loadQuestions() {
    setPhase('loading');
    setCurrentIndex(0);
    setAnswers([]);
    answersRef.current = [];
    setResult(null);
    setLastAnswerCorrect(null);
    setSelectedAnswerId(null);

    try {
      // Load questions — all for the topic, or only those in the given level
      const qs = await api.getQuestionsByTopic(topicId, levelId);
      setQuestions(qs);
      // Prefetch audio for first 3 questions
      qs.slice(0, 3).forEach(q => prefetchQuestionAudio(q));

      // Behavioral topics have no audio files — only text read by live TTS.
      // Render it to disk while the connection that just loaded the quiz is
      // still there, so a mid-quiz disconnect doesn't silence the whole topic.
      prefetchTtsForTexts(collectTtsTexts(qs, engineType)).catch(() => {});

      setPhase(qs.length > 0 ? 'question' : 'result');
    } catch (err) {
      console.error('[useTopicQuiz] Failed to load questions:', err);
      setPhase('result'); // Show empty result on failure
    }
  }

  // ── Submit answer ──────────────────────────────────────────────────────────
  const submitAnswer = useCallback((answerId: string) => {
    const question = questions[currentIndex];
    if (!question || phase !== 'question') return;

    const correctAnswer = question.answers.find(a => a.is_correct);
    const isCorrect     = correctAnswer?.id === answerId;

    const answer: TopicQuizAnswer = {
      questionId:       question.id,
      selectedAnswerId: answerId,
      isCorrect,
    };

    answersRef.current = [...answersRef.current, answer];
    setAnswers(answersRef.current);
    setLastAnswerCorrect(isCorrect);
    setSelectedAnswerId(answerId);
    setPhase(isCorrect ? 'feedback_correct' : 'feedback_wrong');
  }, [questions, currentIndex, phase]);

  // ── Next question ──────────────────────────────────────────────────────────
  const nextQuestion = useCallback(() => {
    const nextIndex = currentIndex + 1;
    setSelectedAnswerId(null);
    setLastAnswerCorrect(null);

    if (nextIndex >= questions.length) {
      // Quiz complete — compute result
      const finalAnswers = answersRef.current;
      const score  = finalAnswers.filter(a => a.isCorrect).length;
      const passed = finalAnswers.length > 0 && (score / finalAnswers.length) >= PASS_THRESHOLD_PCT;
      const wrongIds = finalAnswers
        .filter(a => !a.isCorrect)
        .map(a => a.questionId);

      setResult({ score, total: finalAnswers.length, passed, wrongIds });
      setPhase('result');

      // Topic finished — free the audio of the questions the user got RIGHT.
      // Wrong ones stay cached so reviewing them still works with no
      // connection. See the CACHE-RETENTION INVARIANT in services/audioCache.ts.
      const wrongSet = new Set(wrongIds);
      releaseQuestionAudio(questions.filter(q => !wrongSet.has(q.id))).catch(() => {});
    } else {
      setCurrentIndex(nextIndex);
      setPhase('question');
      // Prefetch audio for next 3 questions
      questions.slice(nextIndex + 1, nextIndex + 4).forEach(q => prefetchQuestionAudio(q));
    }
  }, [currentIndex, questions]);

  // ── Navigate to any question ───────────────────────────────────────────────
  const goToQuestion = useCallback((index: number) => {
    if (index < 0 || index >= questions.length) return;
    const question        = questions[index];
    const existingAnswer  = answersRef.current.find(a => a.questionId === question.id);
    if (existingAnswer) {
      setSelectedAnswerId(existingAnswer.selectedAnswerId);
      setLastAnswerCorrect(existingAnswer.isCorrect);
      setPhase(existingAnswer.isCorrect ? 'feedback_correct' : 'feedback_wrong');
    } else {
      setSelectedAnswerId(null);
      setLastAnswerCorrect(null);
      setPhase('question');
    }
    setCurrentIndex(index);
  }, [questions]);

  // ── Restart ────────────────────────────────────────────────────────────────
  const restart = useCallback(() => {
    loadQuestions();
  }, [topicId, levelId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Derived ───────────────────────────────────────────────────────────────
  const currentQuestion = questions[currentIndex] ?? null;
  const progress        = { current: currentIndex + 1, total: questions.length };

  return {
    phase,
    questions,
    currentIndex,
    currentQuestion,
    progress,
    lastAnswerCorrect,
    selectedAnswerId,
    result,
    submitAnswer,
    nextQuestion,
    goToQuestion,
    restart,
  };
}
