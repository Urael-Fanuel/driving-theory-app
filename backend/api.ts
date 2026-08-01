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

// ─── Behavioral scaffold data (local JSON — no Supabase needed) ───────────────
import vehicleKnowledgeScaffold from '../content/vehicle_knowledge_scaffold.json';
import mindSafetyScaffold       from '../content/mind_safety_scaffold.json';
import societyLawScaffold       from '../content/society_law_scaffold.json';

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
    ]) as any[];

    if (signResult.error) throw signResult.error;
    if (!signResult.data) return null;

    return {
      ...(signResult.data as unknown as DBSign),
      questions: ((questionsResult.data as unknown as DBQuestion[]) ?? []).map(normalizeQuestion),
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

// ─── Behavioral exam questions (local JSON → DBQuestion format) ───────────────

/** How many behavioral questions to include in each 30-question exam session */
const BEHAVIORAL_EXAM_COUNT = 8;

/**
 * Load behavioral questions from local scaffold JSON files and convert them to
 * the DBQuestion shape so the exam hooks can consume them without changes.
 *
 * Covered topics: vehicle_knowledge, mind_safety, society_law.
 * Questions have no sign_id (empty string) and no pre-recorded audio URLs —
 * Engine A's exam screen uses TTS for these, Engine B shows text only.
 */
function loadBehavioralExamQuestions(): DBQuestion[] {
  const ANSWER_IDS = ['A', 'B', 'C', 'D'] as const;
  const scaffolds = [
    { topicId: 'vehicle_knowledge', data: vehicleKnowledgeScaffold as any },
    { topicId: 'mind_safety',       data: mindSafetyScaffold       as any },
    { topicId: 'society_law',       data: societyLawScaffold       as any },
  ];

  const questions: DBQuestion[] = [];

  for (const { topicId, data } of scaffolds) {
    (data.levels ?? []).forEach((level: any, li: number) => {
      (level.subtopics ?? []).forEach((sub: any, si: number) => {
        (sub.questions ?? []).forEach((q: any, qi: number) => {
          const qId = `beh_${topicId}_${li}_${si}_${qi}`;
          questions.push({
            id:                            qId,
            sign_id:                       '',   // no sign — behavioral topic
            topic_id:                      topicId,
            question_amharic:              q.question_amharic ?? '',
            question_audio_url:            undefined,
            question_image_url:            sub.image_url ?? undefined,
            explanation_correct_amharic:   '',
            explanation_wrong_amharic:     '',
            explanation_correct_audio_url: undefined,
            explanation_wrong_audio_url:   undefined,
            difficulty:                    1,
            answers: (q.answers ?? []).map((a: any, ai: number) => ({
              id:           ANSWER_IDS[ai] ?? 'A',
              text_amharic: a.text_amharic ?? '',
              is_correct:   a.is_correct   ?? false,
              image_url:    undefined,
              audio_url:    undefined,
            })),
          });
        });
      });
    });
  }

  return questions;
}

/** Behavioral topic IDs — questions live in local JSON, not Supabase. */
const BEHAVIORAL_TOPIC_IDS = ['vehicle_knowledge', 'mind_safety', 'society_law'];

const BEHAVIORAL_SCAFFOLD_MAP: Record<string, any> = {
  vehicle_knowledge: vehicleKnowledgeScaffold,
  mind_safety:       mindSafetyScaffold,
  society_law:       societyLawScaffold,
};

/**
 * Load questions for a behavioral topic (per-topic or per-level quiz).
 * @param topicId  — The behavioral topic ID (vehicle_knowledge, mind_safety, society_law)
 * @param levelId  — Optional: if provided, only returns questions from that level
 */
function loadBehavioralTopicQuestions(topicId: string, levelId?: string): DBQuestion[] {
  const ANSWER_IDS = ['A', 'B', 'C', 'D'] as const;
  const data = BEHAVIORAL_SCAFFOLD_MAP[topicId];
  if (!data) return [];

  const questions: DBQuestion[] = [];

  (data.levels ?? []).forEach((level: any, li: number) => {
    // If a specific level is requested, skip all others
    if (levelId && level.id !== levelId) return;

    (level.subtopics ?? []).forEach((sub: any, si: number) => {
      (sub.questions ?? []).forEach((q: any, qi: number) => {
        const qId = `beh_${topicId}_${li}_${si}_${qi}`;
        questions.push({
          id:                            qId,
          sign_id:                       '',   // empty → isBehavioral in Engine A/B screens
          topic_id:                      topicId,
          question_amharic:              q.question_amharic ?? '',
          question_audio_url:            undefined,
          question_image_url:            sub.image_url ?? undefined,   // real subtopic image
          explanation_correct_amharic:   '',
          explanation_wrong_amharic:     '',
          explanation_correct_audio_url: undefined,
          explanation_wrong_audio_url:   undefined,
          difficulty:                    1,
          answers: (q.answers ?? []).map((a: any, ai: number) => ({
            id:           ANSWER_IDS[ai] ?? 'A',
            text_amharic: a.text_amharic ?? '',
            is_correct:   a.is_correct   ?? false,
            image_url:    undefined,
            audio_url:    undefined,
          })),
        });
      });
    });
  });

  // Shuffle so each quiz session has a different question order
  return questions.sort(() => Math.random() - 0.5);
}

/**
 * Fetch a random set of exam questions, proportionally distributed across topics.
 * Uses the get_random_questions stored procedure.
 *
 * Always includes ~8 behavioral questions (vehicle_knowledge, mind_safety,
 * society_law) drawn from local JSON files, so every topic in the app is
 * represented regardless of Supabase content.
 */
export async function getRandomExamQuestions(count: number = 30): Promise<DBQuestion[]> {
  // Only return questions with exactly 4 answers (3-answer questions are outdated)
  const onlyNew = (qs: DBQuestion[]) => qs.filter(q => q.answers.length >= 4);

  // ── Behavioral questions (always from local JSON) ────────────────────────────
  const numBehavioral = Math.min(BEHAVIORAL_EXAM_COUNT, count);
  const behavioralQs  = loadBehavioralExamQuestions()
    .sort(() => Math.random() - 0.5)
    .slice(0, numBehavioral);

  const numSign = count - behavioralQs.length; // how many sign-based Qs to fetch

  // ── Sign-based questions (from Supabase / mock) ──────────────────────────────
  let signQs: DBQuestion[] = [];

  if (USE_MOCK) {
    signQs = onlyNew(
      [...mockData.questions].map(normalizeQuestion).sort(() => Math.random() - 0.5)
    ).slice(0, numSign);
  } else {
    // Try the stored procedure first (fastest, balanced distribution)
    try {
      const { data, error } = await supabase.rpc('get_random_questions', {
        question_count: numSign,
      } as any);
      if (error) throw error;
      signQs = onlyNew(((data as DBQuestion[]) ?? []).map(normalizeQuestion))
        .sort(() => Math.random() - 0.5)
        .slice(0, numSign);
    } catch (err) {
      console.warn('[api] getRandomExamQuestions RPC failed, trying direct query:', err);

      // Fallback: direct table query
      try {
        const { data, error } = await supabase.from('questions').select('*');
        if (error) throw error;
        signQs = onlyNew(((data as DBQuestion[]) ?? []).map(normalizeQuestion))
          .sort(() => Math.random() - 0.5)
          .slice(0, numSign);
      } catch (err2) {
        console.error('[api] getRandomExamQuestions direct query also failed:', err2);
        signQs = onlyNew([...mockData.questions].map(normalizeQuestion))
          .sort(() => Math.random() - 0.5)
          .slice(0, numSign);
      }
    }
  }

  // ── Combine sign + behavioral, shuffle, return ───────────────────────────────
  return [...signQs, ...behavioralQs].sort(() => Math.random() - 0.5);
}

/**
 * Fetch questions for a specific sign.
 */
const _questionsCache = new Map<string, DBQuestion[]>();
const QUESTIONS_CACHE_LIMIT = 100;

function setCachedQuestions(signId: string, questions: DBQuestion[]): void {
  if (_questionsCache.size >= QUESTIONS_CACHE_LIMIT) {
    const oldestKey = _questionsCache.keys().next().value as string | undefined;
    if (oldestKey !== undefined) _questionsCache.delete(oldestKey);
  }
  _questionsCache.set(signId, questions);
}

export function getQuestionsFromCache(signId: string): DBQuestion[] | null {
  return _questionsCache.get(signId) ?? null;
}

export async function getQuestionsBySign(signId: string): Promise<DBQuestion[]> {
  const cached = _questionsCache.get(signId);
  if (cached) return cached;

  if (USE_MOCK) {
    const qs = mockData.questions.filter(q => q.sign_id === signId);
    setCachedQuestions(signId, qs);
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
    setCachedQuestions(signId, qs);
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

/**
 * Fetch ALL questions for a specific topic (sign-based only), shuffled.
 * Used for the per-topic quiz — covers every sign in the topic.
 * Questions are filtered to those with 4 answers (the new format).
 */
export async function getQuestionsByTopic(topicId: string, levelId?: string): Promise<DBQuestion[]> {
  // Daily challenge — 10 random questions from all topics (sign + behavioral)
  if (topicId === 'daily') {
    return getRandomExamQuestions(10);
  }

  // Behavioral topics live in local JSON — no Supabase needed
  if (BEHAVIORAL_TOPIC_IDS.includes(topicId)) {
    return loadBehavioralTopicQuestions(topicId, levelId);
  }

  const onlyNew = (qs: DBQuestion[]) => qs.filter(q => q.answers.length >= 4);

  // Mock: filter mockData by topic
  if (USE_MOCK) {
    const signIds = mockData.signs
      .filter(s => s.topic_id === topicId)
      .map(s => s.id);
    return onlyNew(
      mockData.questions
        .filter(q => signIds.includes(q.sign_id ?? ''))
        .map(normalizeQuestion)
        .sort(() => Math.random() - 0.5),
    );
  }

  // Production: get all sign IDs for this topic, then all their questions.
  try {
    const { data: signs, error: signErr } = await supabase
      .from('signs')
      .select('id')
      .eq('topic_id', topicId);

    if (signErr) throw signErr;
    const signIds = (signs ?? []).map((s: { id: string }) => s.id);
    if (!signIds.length) return [];

    const { data, error } = await supabase
      .from('questions')
      .select('*')
      .in('sign_id', signIds);

    if (error) throw error;
    // Shuffle so consecutive questions on the same sign aren't always grouped
    return onlyNew(
      ((data ?? []) as DBQuestion[]).map(normalizeQuestion).sort(() => Math.random() - 0.5),
    );
  } catch (err) {
    console.error('[api] getQuestionsByTopic:', err);
    const signIds = mockData.signs
      .filter(s => s.topic_id === topicId)
      .map(s => s.id);
    return onlyNew(
      mockData.questions
        .filter(q => signIds.includes(q.sign_id ?? ''))
        .map(normalizeQuestion)
        .sort(() => Math.random() - 0.5),
    );
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
        id:           userId,
        engine_type:  engineType,
        display_name: displayName,
        last_seen:    new Date().toISOString(),
      } as any,
      { onConflict: 'id' }
    );
    if (error) throw error;
  } catch (err) {
    console.error('[api] upsertUser:', err);
  }
}

/**
 * Records the user's approximate city (from a one-time, foreground-only
 * location check — see hooks/useLocationPrompt.ts), for future location-based
 * business matching. `country`/`region` are left for a later IP-based pass;
 * this only ever sets `city`, computed offline via utils/nearestIsraeliCity.ts.
 */
export async function updateUserLocation(userId: string, city: string): Promise<void> {
  if (USE_MOCK) return;

  try {
    const { error } = await (supabase
      .from('users') as any)
      .update({ city })
      .eq('id', userId);
    if (error) throw error;
  } catch (err) {
    console.error('[api] updateUserLocation:', err);
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
  isCorrect: boolean,
  retries = 3
): Promise<void> {
  if (USE_MOCK) return;

  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const { error } = await supabase.rpc('upsert_user_progress', {
        p_user_id:     userId,
        p_question_id: questionId,
        p_is_correct:  isCorrect,
      } as any);
      if (error) throw error;
      return; // success
    } catch (err) {
      console.warn(`[api] saveAnswer attempt ${attempt + 1}/${retries}:`, err);
      if (attempt < retries - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
      }
    }
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
    } as any);
    if (error) throw error;
  } catch (err) {
    console.warn('[api] recordSignView:', err);
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
    const { data, error } = await (supabase
      .from('exam_sessions')
      .insert({
        user_id:          userId,
        engine_type:      engineType,
        score,
        total_questions:  total,
        passed,
        pass_threshold:   24,
        duration_seconds: durationSeconds,
        topic_breakdown:  topicBreakdown,
      } as any)
      .select('id')
      .single() as any);

    if (error) throw error;

    return {
      sessionId:      (data as any)?.id ?? 'unknown',
      score,
      total,
      passed,
      topicBreakdown,
    };
  } catch (err) {
    console.warn('[api] saveExamSession:', err);
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
