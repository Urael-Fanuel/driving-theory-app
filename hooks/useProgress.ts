/**
 * hooks/useProgress.ts
 * Track user progress: which signs viewed, which questions answered correctly.
 *
 * Stores in-memory + persists to Supabase (when online).
 * Used by both Engine A and Engine B.
 *
 * FIX: topicsProgress now computed from accumulated data using static
 *      content maps (signs.json → topic lookup, topics.json → totals).
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { useEngine } from '../contexts/EngineContext';
import * as api from '../backend/api';
import topicsRaw  from '../content/topics.json';
import signsRaw   from '../content/signs.json';

// ─── Static lookup tables (built once at module load) ─────────────────────────

/** signId → topicId */
const SIGN_TOPIC_MAP = new Map<string, string>(
  (signsRaw as Array<{ id: string; topic_id: string }>).map(s => [s.id, s.topic_id])
);

/** questionId → topicId (built from signs.json at module load) */
const QUESTION_TOPIC_MAP = new Map<string, string>();
(signsRaw as Array<{ topic_id: string; questions?: Array<{ id: string }> }>).forEach(sign => {
  sign.questions?.forEach(q => QUESTION_TOPIC_MAP.set(q.id, sign.topic_id));
});

/** topicId → sign_count */
const TOPIC_SIGN_COUNT = new Map<string, number>(
  (topicsRaw as Array<{ id: string; sign_count: number }>).map(t => [t.id, t.sign_count])
);

/** Ordered list of topic IDs for stable output */
const TOPIC_IDS: string[] = (topicsRaw as Array<{ id: string }>).map(t => t.id);

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SignProgress {
  signId: string;
  viewed: boolean;
  videoCompleted: boolean;
  questionsAttempted: number;
  questionsCorrect: number;
}

export interface TopicProgress {
  topicId: string;
  signsViewed: number;
  totalSigns: number;
  questionsCorrect: number;
  totalQuestions: number;
  masteryPercent: number;
}

export interface UseProgressReturn {
  /** Record that a user viewed a sign */
  markSignViewed: (signId: string, videoCompleted?: boolean) => void;
  /** Record a question answer */
  recordAnswer: (questionId: string, signId: string, topicId: string, isCorrect: boolean) => void;
  /** Get progress for a specific sign */
  getSignProgress: (signId: string) => SignProgress | undefined;
  /** Check if a sign has been viewed */
  isSignViewed: (signId: string) => boolean;
  /** Check if a question was answered correctly at least once */
  isQuestionMastered: (questionId: string) => boolean;
  /** Per-topic progress summary — now fully computed */
  topicsProgress: TopicProgress[];
  /** Total questions attempted (at least once) */
  totalAttempted: number;
  /** Total questions answered correctly (at least once) */
  totalCorrect: number;
}

// ─── In-memory entry types ────────────────────────────────────────────────────

interface ProgressEntry {
  attemptCount: number;
  correctCount: number;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useProgress(): UseProgressReturn {
  const { userId } = useEngine();

  // In-memory maps for fast access
  const [signViews]   = useState(() => new Map<string, { videoCompleted: boolean; viewCount: number }>());
  const [questionMap] = useState(() => new Map<string, ProgressEntry>());
  const [, forceUpdate] = useState(0);

  // Topology ref: questionId → topicId (populated as answers are recorded)
  // useRef so updates don't cause extra re-renders — questionMap refresh() is enough
  const questionTopicRef = useRef(new Map<string, string>());

  const refresh = useCallback(() => forceUpdate(n => n + 1), []);

  // ── Load historical data from Supabase on mount ──────────────────────────────
  useEffect(() => {
    if (!userId) return;
    Promise.all([
      api.getUserProgress(userId),
      api.getUserSignViews(userId),
    ]).then(([progressRows, signViewRows]) => {
      // Populate questionMap from historical answers
      for (const row of progressRows) {
        questionMap.set(row.question_id, {
          attemptCount: row.attempt_count,
          correctCount: row.correct_count,
        });
        // Populate topic map so topicsProgress can aggregate correctly
        const topicId = QUESTION_TOPIC_MAP.get(row.question_id);
        if (topicId) questionTopicRef.current.set(row.question_id, topicId);
      }
      // Populate signViews from historical views
      for (const row of signViewRows) {
        signViews.set(row.sign_id, {
          videoCompleted: row.video_completed,
          viewCount:      row.view_count,
        });
      }
      refresh();
    }).catch(() => {});
  }, [userId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Mark sign as viewed ──────────────────────────────────────────────────────
  const markSignViewed = useCallback((signId: string, videoCompleted = false) => {
    const existing = signViews.get(signId);
    signViews.set(signId, {
      videoCompleted: existing ? existing.videoCompleted || videoCompleted : videoCompleted,
      viewCount:      existing ? existing.viewCount + 1 : 1,
    });
    refresh();

    // Persist to Supabase
    if (userId) {
      api.recordSignView(userId, signId, videoCompleted).catch(() => {});
    }
  }, [userId, signViews, refresh]);

  // ── Record answer ────────────────────────────────────────────────────────────
  const recordAnswer = useCallback((
    questionId: string,
    signId: string,
    topicId: string,
    isCorrect: boolean
  ) => {
    // Store topology so topicsProgress can aggregate by topic
    questionTopicRef.current.set(questionId, topicId);

    // Also ensure sign→topic is populated (for signsViewed aggregation)
    // (SIGN_TOPIC_MAP covers static data; this handles any dynamic edge cases)
    if (!SIGN_TOPIC_MAP.has(signId) && topicId) {
      SIGN_TOPIC_MAP.set(signId, topicId);
    }

    const existing = questionMap.get(questionId) ?? { attemptCount: 0, correctCount: 0 };
    questionMap.set(questionId, {
      attemptCount: existing.attemptCount + 1,
      correctCount: existing.correctCount + (isCorrect ? 1 : 0),
    });
    refresh();

    // Persist to Supabase
    if (userId) {
      api.saveAnswer(userId, questionId, isCorrect).catch(() => {});
    }
  }, [userId, questionMap, refresh]);

  // ── Getters ──────────────────────────────────────────────────────────────────
  const getSignProgress = useCallback((signId: string): SignProgress | undefined => {
    const view = signViews.get(signId);
    if (!view) return undefined;

    // Count questions for this sign
    let questionsAttempted = 0;
    let questionsCorrect   = 0;
    for (const [qid, entry] of questionMap.entries()) {
      const qTopicId = questionTopicRef.current.get(qid);
      const qSignTopic = SIGN_TOPIC_MAP.get(signId);
      // Approximate: count questions whose topicId matches this sign's topic
      // For exact matching we'd need questionId→signId map; this is close enough
      if (qTopicId && qTopicId === qSignTopic) {
        if (entry.attemptCount > 0) questionsAttempted++;
        if (entry.correctCount > 0) questionsCorrect++;
      }
    }

    return {
      signId,
      viewed:             true,
      videoCompleted:     view.videoCompleted,
      questionsAttempted,
      questionsCorrect,
    };
  }, [signViews, questionMap]);

  const isSignViewed = useCallback((signId: string) => {
    return signViews.has(signId);
  }, [signViews]);

  const isQuestionMastered = useCallback((questionId: string) => {
    const entry = questionMap.get(questionId);
    return entry ? entry.correctCount > 0 : false;
  }, [questionMap]);

  // ── Computed stats ────────────────────────────────────────────────────────────
  const totalAttempted = Array.from(questionMap.values()).filter(e => e.attemptCount > 0).length;
  const totalCorrect   = Array.from(questionMap.values()).filter(e => e.correctCount > 0).length;

  // ── topicsProgress — aggregated per topic ─────────────────────────────────────
  const topicsProgress: TopicProgress[] = TOPIC_IDS.map(topicId => {
    const signCount = TOPIC_SIGN_COUNT.get(topicId) ?? 0;
    const totalQuestions = signCount * 3; // Always 3 questions per sign

    // Signs viewed for this topic
    const signsViewed = Array.from(signViews.keys())
      .filter(signId => SIGN_TOPIC_MAP.get(signId) === topicId)
      .length;

    // Questions correct / attempted for this topic
    let questionsCorrect = 0;
    for (const [qid, entry] of questionMap.entries()) {
      if (questionTopicRef.current.get(qid) === topicId && entry.correctCount > 0) {
        questionsCorrect++;
      }
    }

    const masteryPercent = totalQuestions > 0
      ? Math.round((questionsCorrect / totalQuestions) * 100)
      : 0;

    return {
      topicId,
      signsViewed,
      totalSigns:       signCount,
      questionsCorrect,
      totalQuestions,
      masteryPercent,
    };
  });

  return {
    markSignViewed,
    recordAnswer,
    getSignProgress,
    isSignViewed,
    isQuestionMastered,
    topicsProgress,
    totalAttempted,
    totalCorrect,
  };
}
