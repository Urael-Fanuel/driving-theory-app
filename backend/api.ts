/**
 * AGENT 2 — api.ts
 * All data-access functions for the Ethiopian Driving Theory App.
 *
 * Design:
 *   - Every function checks USE_MOCK first → returns local mockData if no Supabase URL
 *   - This enables full offline development without any backend setup
 *   - In production, all calls go to Supabase
 *   - Errors are caught and returned as null (app handles gracefully)
 */

import { supabase, DBTopic, DBSign, DBQuestion, DBExamSession, DBUserProgress, DBSignView } from './supabaseClient';
import * as mockData from './mockData';

// ─── Config ───────────────────────────────────────────────────────────────────

/** True when no Supabase URL is configured → use mock data */
const USE_MOCK = !process.env.EXPO_PUBLIC_SUPABASE_URL;

// ─── Types (extended with nested data) ───────────────────────────────────────

export type Topic = DBTopic;
export type Sign  = DBSign;

export interface SignWithQuestions extends DBSign {
  questions: DBQuestion[];
}

export interface ExamResult {
  sessionId: string;
  score: number;
  total: number;
  passed: boolean;
  topicBreakdown: Record<string, { correct: number; total: number }>;
}

export interface UserStats {
  totalAttempted: number;
  totalCorrect: number;
  topicsProgress: Array<{
    topicId: string;
    masteryPercent: number;
    mastered: number;
    total: number;
  }>;
}

// ─── TOPICS ───────────────────────────────────────────────────────────────────

/**
 * Fetch all topics ordered by display_order.
 */
export async function getTopics(): Promise<Topic[]> {
  if (USE_MOCK) return mockData.topics;

  try {
    const { data, error } = await supabase
      .from('topics')
      .select('*')
      .order('display_order');

    if (error) throw error;
    return data ?? [];
  } catch (err) {
    console.error('[api] getTopics:', err);
    return mockData.topics; // Fallback to mock on error
  }
}

/**
 * Fetch a single topic by ID.
 */
export async function getTopic(topicId: string): Promise<Topic | null> {
  if (USE_MOCK) return mockData.topics.find(t => t.id === topicId) ?? null;

  try {
    const { data, error } = await supabase
      .from('topics')
      .select('*')
      .eq('id', topicId)
      .single();

    if (error) throw error;
    return data;
  } catch (err) {
    console.error('[api] getTopic:', err);
    return mockData.topics.find(t => t.id === topicId) ?? null;
  }
}

// ─── SIGNS ────────────────────────────────────────────────────────────────────

/**
 * Fetch all signs for a given topic.
 */
export async function getSignsByTopic(topicId: string): Promise<Sign[]> {
  if (USE_MOCK) return mockData.signs.filter(s => s.topic_id === topicId);

  try {
    const { data, error } = await supabase
      .from('signs')
      .select('*')
      .eq('topic_id', topicId)
      .order('display_order');

    if (error) throw error;
    return data ?? [];
  } catch (err) {
    console.error('[api] getSignsByTopic:', err);
    return mockData.signs.filter(s => s.topic_id === topicId);
  }
}

/**
 * Fetch a single sign including all its questions.
 */
export async function getSignWithQuestions(signId: string): Promise<SignWithQuestions | null> {
  if (USE_MOCK) {
    const sign = mockData.signs.find(s => s.id === signId);
    if (!sign) return null;
    const questions = mockData.questions.filter(q => q.sign_id === signId);
    return { ...sign, questions };
  }

  try {
    const [signResult, questionsResult] = await Promise.all([
      supabase.from('signs').select('*').eq('id', signId).single(),
      supabase.from('questions').select('*').eq('sign_id', signId).order('id'),
    ]);

    if (signResult.error) throw signResult.error;
    if (!signResult.data) return null;

    return {
      ...signResult.data,
      questions: (questionsResult.data ?? []).map(normalizeQuestion),
    };
  } catch (err) {
    console.error('[api] getSignWithQuestions:', err);
    const sign = mockData.signs.find(s => s.id === signId);
    if (!sign) return null;
    return { ...sign, questions: mockData.questions.filter(q => q.sign_id === signId) };
  }
}

/**
 * Fetch all signs (used for exam question pool).
 */
let _signsCache: Sign[] | null = null;

export function getSignsFromCache(): Sign[] | null {
  return _signsCache;
}

export async function getAllSigns(): Promise<Sign[]> {
  if (_signsCache) return _signsCache;
  if (USE_MOCK) { _signsCache = mockData.signs; return _signsCache; }

  try {
    const { data, error } = await supabase.from('signs').select('*');
    if (error) throw error;
    _signsCache = data ?? [];
    return _signsCache;
  } catch (err) {
    console.error('[api] getAllSigns:', err);
    return mockData.signs;
  }
}

// ─── QUESTIONS ────────────────────────────────────────────────────────────────

/**
 * Normalize a question returned from Supabase.
 * Supabase sometimes returns JSONB columns as raw strings — this ensures
 * `answers` is always a parsed DBAnswer[] array before the UI touches it.
 * Also patches any null audio/image URLs from mock data (handles the case
 * where the DB was seeded before media files were locally available).
 */
function normalizeQuestion(q: DBQuestion): DBQuestion {
  const parsed: DBQuestion = {
    ...q,
    answers: typeof q.answers === 'string'
      ? JSON.parse(q.answers as unknown as string)
      : (Array.isArray(q.answers) ? q.answers : []),
  };

  // Fill null media URLs from mock data using the question ID as the key
  const mock = mockData.questionsById.get(parsed.id);
  if (!mock) return parsed;

  return {
    ...parsed,
    question_audio_url:            parsed.question_audio_url            || mock.question_audio_url,
    explanation_correct_audio_url: parsed.explanation_correct_audio_url || mock.explanation_correct_audio_url,
    explanation_wrong_audio_url:   parsed.explanation_wrong_audio_url   || mock.explanation_wrong_audio_url,
    answers: parsed.answers.map(a => {
      const mockAnswer = mock.answers.find(ma => ma.id === a.id);
      if (!mockAnswer) return a;
      return {
        ...a,
        audio_url: a.audio_url || mockAnswer.audio_url,
        image_url: a.image_url || mockAnswer.image_url,
      };
    }),
  };
}

/**
 * Fetch a random set of exam questions, proportionally distributed across topics.
 * Uses the get_random_questions stored procedure.
 */
export async function getRandomExamQuestions(count: number = 30): Promise<DBQuestion[]> {
  // Only return questions with exactly 4 answers (3-answer questions are outdated)
  const onlyNew = (qs: DBQuestion[]) => qs.filter(q => q.answers.length >= 4);

  if (USE_MOCK) {
    // Shuffle all mock questions and take `count`
    return onlyNew(
      [...mockData.questions]
        .map(normalizeQuestion)
        .sort(() => Math.random() - 0.5)
    ).slice(0, count);
  }

  // Try the stored procedure first (fastest, balanced distribution)
  try {
    const { data, error } = await supabase.rpc('get_random_questions', {
      question_count: count,
    });

    if (error) throw error;
    const all = onlyNew(((data as DBQuestion[]) ?? []).map(normalizeQuestion));
    // RPC may return fewer than `count` after filtering — shuffle and top up if needed
    return all.sort(() => Math.random() - 0.5).slice(0, count);
  } catch (err) {
    console.warn('[api] getRandomExamQuestions RPC failed, trying direct query:', err);
  }

  // Fallback: direct table query — works without a stored procedure
  try {
    const { data, error } = await supabase.from('questions').select('*');
    if (error) throw error;
    return onlyNew(
      ((data as DBQuestion[]) ?? []).map(normalizeQuestion)
    )
      .sort(() => Math.random() - 0.5)
      .slice(0, count);
  } catch (err) {
    console.error('[api] getRandomExamQuestions direct query also failed:', err);
    return onlyNew(
      [...mockData.questions].map(normalizeQuestion)
    ).sort(() => Math.random() - 0.5).slice(0, count);
  }
}

/**
 * Fetch questions for a specific sign.
 */
const _questionsCache = new Map<string, DBQuestion[]>();

export function getQuestionsFromCache(signId: string): DBQuestion[] | null {
  return _questionsCache.get(signId) ?? null;
}

export async function getQuestionsBySign(signId: string): Promise<DBQuestion[]> {
  const cached = _questionsCache.get(signId);
  if (cached) return cached;

  if (USE_MOCK) {
    const qs = mockData.questions.filter(q => q.sign_id === signId);
    _questionsCache.set(signId, qs);
    return qs;
  }

  try {
    const { data, error } = await supabase
      .from('questions')
      .select('*')
      .eq('sign_id', signId)
      .order('id');

    if (error) throw error;
    const qs = (data ?? []).map(normalizeQuestion);
    _questionsCache.set(signId, qs);
    return qs;
  } catch (err) {
    console.error('[api] getQuestionsBySign:', err);
    return mockData.questions.filter(q => q.sign_id === signId);
  }
}

/**
 * Fetch specific questions by their IDs.
 * Used for weak-area practice after an exam.
 */
export async function getQuestionsByIds(ids: string[]): Promise<DBQuestion[]> {
  if (!ids.length) return [];
  if (USE_MOCK) return mockData.questions.filter(q => ids.includes(q.id));

  try {
    const { data, error } = await supabase
      .from('questions')
      .select('*')
      .in('id', ids);

    if (error) throw error;
    return (data ?? []).map(normalizeQuestion);
  } catch (err) {
    console.error('[api] getQuestionsByIds:', err);
    return mockData.questions.filter(q => ids.includes(q.id));
  }
}

// ─── USERS ────────────────────────────────────────────────────────────────────

/**
 * Create or fetch a user by their Supabase auth UID.
 * Called on first app open after engine selection.
 */
export async function upsertUser(
  userId: string,
  engineType: 'A' | 'B',
  displayName?: string
): Promise<void> {
  if (USE_MOCK) return;

  try {
    const { error } = await supabase.from('users').upsert(
      {
        id: userId as unknown as never,
        engine_type: engineType,
        display_name: displayName,
        last_seen: new Date().toISOString(),
      },
      { onConflict: 'id' }
    );
    if (error) throw error;
  } catch (err) {
    console.error('[api] upsertUser:', err);
  }
}

// ─── PROGRESS ─────────────────────────────────────────────────────────────────

/**
 * Record a question answer (correct or wrong).
 * Uses upsert_user_progress stored procedure for atomic increment.
 */
export async function saveAnswer(
  userId: string,
  questionId: string,
  isCorrect: boolean
): Promise<void> {
  if (USE_MOCK) return;

  try {
    const { error } = await supabase.rpc('upsert_user_progress', {
      p_user_id:     userId,
      p_question_id: questionId,
      p_is_correct:  isCorrect,
    });
    if (error) throw error;
  } catch (err) {
    console.error('[api] saveAnswer:', err);
  }
}

/**
 * Record that a user watched a sign video (Engine A).
 */
export async function recordSignView(
  userId: string,
  signId: string,
  videoCompleted: boolean
): Promise<void> {
  if (USE_MOCK) return;

  try {
    const { error } = await supabase.rpc('upsert_sign_view', {
      p_user_id:         userId,
      p_sign_id:         signId,
      p_video_completed: videoCompleted,
    });
    if (error) throw error;
  } catch (err) {
    console.error('[api] recordSignView:', err);
  }
}

/**
 * Fetch a user's progress across all questions.
 */
export async function getUserProgress(userId: string): Promise<DBUserProgress[]> {
  if (USE_MOCK) return [];

  try {
    const { data, error } = await supabase
      .from('user_progress')
      .select('*')
      .eq('user_id', userId);

    if (error) throw error;
    return data ?? [];
  } catch (err) {
    console.error('[api] getUserProgress:', err);
    return [];
  }
}

/**
 * Fetch which signs a user has viewed (Engine A).
 */
export async function getUserSignViews(userId: string): Promise<DBSignView[]> {
  if (USE_MOCK) return [];

  try {
    const { data, error } = await supabase
      .from('sign_views')
      .select('*')
      .eq('user_id', userId);

    if (error) throw error;
    return data ?? [];
  } catch (err) {
    console.error('[api] getUserSignViews:', err);
    return [];
  }
}

/**
 * Calculate aggregated user stats for progress screen.
 */
export async function getUserStats(userId: string): Promise<UserStats> {
  const progress = await getUserProgress(userId);

  const totalAttempted = progress.filter(p => p.attempt_count > 0).length;
  const totalCorrect   = progress.filter(p => p.correct_count > 0).length;

  // Build per-topic stats using local question data
  const questions = USE_MOCK ? mockData.questions : await getAllQuestionsLocal();
  const topicMap  = new Map<string, { mastered: number; total: number }>();

  for (const q of questions) {
    if (!topicMap.has(q.topic_id)) topicMap.set(q.topic_id, { mastered: 0, total: 0 });
    const t = topicMap.get(q.topic_id)!;
    t.total++;
    const p = progress.find(p => p.question_id === q.id);
    if (p && p.correct_count > 0) t.mastered++;
  }

  const topicsProgress = Array.from(topicMap.entries()).map(([topicId, { mastered, total }]) => ({
    topicId,
    mastered,
    total,
    masteryPercent: total > 0 ? Math.round((mastered / total) * 100) : 0,
  }));

  return { totalAttempted, totalCorrect, topicsProgress };
}

// Internal: fetch all questions for stats calculation
async function getAllQuestionsLocal(): Promise<DBQuestion[]> {
  try {
    const { data } = await supabase.from('questions').select('id, topic_id, sign_id');
    return (data as DBQuestion[]) ?? mockData.questions;
  } catch {
    return mockData.questions;
  }
}

// ─── EXAM SESSIONS ────────────────────────────────────────────────────────────

/**
 * Save a completed exam session.
 */
export async function saveExamSession(
  userId: string,
  engineType: 'A' | 'B',
  score: number,
  total: number,
  durationSeconds: number,
  topicBreakdown: Record<string, { correct: number; total: number }>
): Promise<ExamResult> {
  const passed = score >= 24; // 80% of 30 questions

  if (USE_MOCK) {
    return { sessionId: 'mock-' + Date.now(), score, total, passed, topicBreakdown };
  }

  try {
    const { data, error } = await supabase
      .from('exam_sessions')
      .insert({
        user_id:          userId as never,
        engine_type:      engineType,
        score,
        total_questions:  total,
        passed,
        pass_threshold:   24,
        duration_seconds: durationSeconds,
        topic_breakdown:  topicBreakdown as never,
      })
      .select('id')
      .single();

    if (error) throw error;

    return {
      sessionId:      data?.id ?? 'unknown',
      score,
      total,
      passed,
      topicBreakdown,
    };
  } catch (err) {
    console.error('[api] saveExamSession:', err);
    return { sessionId: 'error-' + Date.now(), score, total, passed, topicBreakdown };
  }
}

/**
 * Fetch a user's exam history (last 10 sessions).
 */
export async function getExamHistory(userId: string): Promise<DBExamSession[]> {
  if (USE_MOCK) return [];

  try {
    const { data, error } = await supabase
      .from('exam_sessions')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(10);

    if (error) throw error;
    return data ?? [];
  } catch (err) {
    console.error('[api] getExamHistory:', err);
    return [];
  }
}
