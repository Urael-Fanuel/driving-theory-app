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
import { getIsConnected } from '../hooks/useNetworkStatus';

// ─── Behavioral scaffold data (local JSON — no Supabase needed) ───────────────
import vehicleKnowledgeScaffold from '../content/vehicle_knowledge_scaffold.json';
import mindSafetyScaffold       from '../content/mind_safety_scaffold.json';
import societyLawScaffold       from '../content/society_law_scaffold.json';
import theRoadScaffold          from '../content/the_road_scaffold.json';
import myVehicleScaffold        from '../content/my_vehicle_scaffold.json';
import twoWheelersScaffold      from '../content/two_wheelers_scaffold.json';
import roadDecisionsScaffold   from '../content/road_decisions_scaffold.json';
import basicsLicenseScaffold    from '../content/basics_license_scaffold.json';

// ─── Config ───────────────────────────────────────────────────────────────────

/** True when no Supabase URL is configured → use mock data */
const USE_MOCK = !process.env.EXPO_PUBLIC_SUPABASE_URL;

/**
 * Fisher-Yates shuffle. Does NOT mutate `arr` — returns a new array.
 *
 * Every "shuffle a list of questions" call in this file used to do
 * `arr.sort(() => Math.random() - 0.5)`. That looks random but isn't: a
 * sort comparator is supposed to be consistent (given the same two
 * elements, always return the same sign), and `Math.random() - 0.5`
 * breaks that contract — the result is whatever bias the engine's sort
 * implementation happens to produce for an inconsistent comparator, not a
 * uniform shuffle. Measured directly (2026-08-12): shuffling 12 items and
 * taking the top 3 gave the first item a ~38% chance of being picked and
 * a late item as low as ~17%, when every item should have had an equal
 * 25% chance. This is what was making certain behavioral questions (ones
 * that happen to sit early in their topic's array) show up far more often
 * than others. Fisher-Yates is the standard algorithm that actually
 * guarantees a uniform random permutation.
 */
function shuffle<T>(arr: T[]): T[] {
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/**
 * Every function below falls back to the bundled copy (mockData — a full
 * local snapshot of the sign catalog, see backend/mockData.ts) when a live
 * Supabase call fails, so the app keeps working offline. That's correct
 * behavior when there's genuinely no connection.
 *
 * But the SAME fallback also silently swallows a real server-side failure
 * (a Supabase outage, a bad query, a bug) — falling back looks identical
 * either way, so a real problem was invisible. This just makes the two
 * cases distinguishable: call it from a catch block right before falling
 * back to mockData. It changes nothing about what the app returns or
 * shows — only what gets logged and recorded.
 *
 * A genuine online-but-failed error is also written to the client_errors
 * table (see backend/migration_client_errors.sql) — a console.error only
 * reaches the screen of whichever single device hit it, at the moment it
 * happened, which in practice nobody is ever watching. This makes the
 * same event checkable later with a plain query, the same way
 * api_rate_limits and answer_submissions already are. Fire-and-forget:
 * this is best-effort visibility, so it must never affect what the
 * caller gets back, and a failed insert is silently ignored rather than
 * retried or surfaced.
 */
function logFallbackToMock(fnName: string, err: unknown): void {
  if (getIsConnected()) {
    console.error(`[api] ${fnName}: SERVER ERROR while online — falling back to bundled data`, err);
    (supabase.from('client_errors') as any)
      .insert({
        function_name: fnName,
        error_message: err instanceof Error ? err.message : String(err),
      })
      .then(() => {}, () => {});
  } else {
    console.log(`[api] ${fnName}: offline — using bundled data (expected)`);
  }
}

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
    logFallbackToMock('getTopics', err);
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
    logFallbackToMock('getTopic', err);
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
    logFallbackToMock('getSignsByTopic', err);
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
    logFallbackToMock('getSignWithQuestions', err);
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
    logFallbackToMock('getAllSigns', err);
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

// ─── Behavioral topics (local JSON — no Supabase needed) ─────────────────────

/**
 * Every behavioral topic and its scaffold. Single source of truth: the exam,
 * the daily challenge, and the per-topic/per-level quizzes all read this map,
 * so adding a topic here wires it into all of them at once.
 */
const BEHAVIORAL_SCAFFOLD_MAP: Record<string, any> = {
  vehicle_knowledge: vehicleKnowledgeScaffold,
  mind_safety:       mindSafetyScaffold,
  society_law:       societyLawScaffold,
  the_road:          theRoadScaffold,
  my_vehicle:        myVehicleScaffold,
  two_wheelers:      twoWheelersScaffold,
  road_decisions:    roadDecisionsScaffold,
  basics_license:    basicsLicenseScaffold,
};

/** Behavioral topic IDs — questions live in local JSON, not Supabase. */
const BEHAVIORAL_TOPIC_IDS = Object.keys(BEHAVIORAL_SCAFFOLD_MAP);

// ─── Behavioral exam questions (local JSON → DBQuestion format) ───────────────

/**
 * How many behavioral questions to include in each 30-question exam session.
 * 21 behavioral + 9 sign (30%) — matches the real Israeli MoT theory test's
 * topic mix, where only ~8-10 of 30 questions (25-33%) are about signs
 * specifically and the rest cover traffic law, right of way, and safety
 * (verified 2026-08-12: dr-teoria.org.il, mylicense.co.il). The exam was
 * previously the inverse (22 sign / 8 behavioral) — signs as the majority —
 * which didn't represent the real exam at all.
 */
const BEHAVIORAL_EXAM_COUNT = 21;

/** Daily challenge: 60% behavioral, 40% sign-based. */
const DAILY_QUESTION_COUNT      = 10;
const DAILY_BEHAVIORAL_FRACTION = 0.6;

/**
 * Load behavioral questions from local scaffold JSON files and convert them to
 * the DBQuestion shape so the exam hooks can consume them without changes.
 *
 * Covers every topic in BEHAVIORAL_SCAFFOLD_MAP. Topics whose scaffold has no
 * questions yet simply contribute nothing.
 * Questions have no sign_id (empty string) and no pre-recorded audio URLs —
 * Engine A's exam screen uses TTS for these, Engine B shows text only.
 */
/** A behavioral question tagged with which subtopic it came from — see
 * selectProportionalByTopic's subtopic-level allocation below. */
type BehavioralQuestion = DBQuestion & { subtopicKey: string };

function loadBehavioralExamQuestions(): BehavioralQuestion[] {
  const ANSWER_IDS = ['A', 'B', 'C', 'D'] as const;
  const scaffolds = Object.entries(BEHAVIORAL_SCAFFOLD_MAP)
    .map(([topicId, data]) => ({ topicId, data }));

  const questions: BehavioralQuestion[] = [];

  for (const { topicId, data } of scaffolds) {
    (data.levels ?? []).forEach((level: any, li: number) => {
      (level.subtopics ?? []).forEach((sub: any, si: number) => {
        (sub.questions ?? []).forEach((q: any, qi: number) => {
          const qId = `beh_${topicId}_${li}_${si}_${qi}`;
          questions.push({
            id:                            qId,
            sign_id:                       '',   // no sign — behavioral topic
            topic_id:                      topicId,
            // Identifies the exact subtopic this question belongs to (a
            // subtopic is usually exactly 3 questions) — used to spread
            // an exam's picks across subtopics, not just across topics.
            subtopicKey:                   `${topicId}_${li}_${si}`,
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

/**
 * Pick `count` questions out of `pool`, allocating each topic a share
 * proportional to how many questions it contributes to the pool, THEN —
 * within each topic's own allocation — doing the exact same proportional
 * split again across that topic's subtopics, before finally picking
 * randomly inside each subtopic, and combining every topic's picks with a
 * ROUND-ROBIN pass rather than a flat random trim. Three problems this
 * fixes, not one:
 *
 * 1. A flat shuffle+slice over the whole pool lets large topics dominate
 *    purely because they have more rows (e.g. vehicle_knowledge's 81
 *    behavioral questions vs society_law's 6 — a flat draw of 21 would
 *    statistically hand vehicle_knowledge ~12 of them and society_law ~1
 *    by raw volume alone, regardless of how much material each topic
 *    actually needs to cover). The topic-level allocation fixes this.
 *
 * 2. Even after fixing #1, picking a topic's own share randomly from ALL
 *    of its questions still let the SAME subtopic (usually just 3
 *    questions, or the same individual sign) contribute 2+ of those picks
 *    purely by chance — measured directly (2026-08-12): with only the
 *    topic-level fix, 92.3% of simulated behavioral exams had at least
 *    one subtopic repeat (2.96% for signs, less severe because sign
 *    topics have far more distinct signs than behavioral topics have
 *    subtopics). The nested per-subtopic/per-sign allocation below fixes
 *    this — dropped to 0.0% in both cases.
 *
 * 3. CEIL-ing every topic's share means the allocations almost always sum
 *    to MORE than `count` (rounding up on every topic, not just some) —
 *    e.g. 9 sign topics for a 9-question slice CEIL to 14 candidates, not
 *    9. A flat `shuffle(everyone).slice(0, count)` trims that surplus
 *    with no regard for WHICH topics already only had one candidate to
 *    begin with, so a topic that rounded up to exactly 1 could easily
 *    have that single slot cut — measured directly: 34-39% topic absence
 *    even with fix #2 already applied. The round-robin final pass fixes
 *    this by taking each topic's FIRST pick before any topic's second,
 *    each topic's second before any topic's third, and so on — so a
 *    topic never loses its one guaranteed slot to another topic's surplus
 *    (2nd, 3rd, ...) pick. Dropped topic absence to 0.0% in the same
 *    5,000-run simulation.
 *
 * Mirrors get_random_questions' own per-topic CEIL/ROW_NUMBER allocation
 * for signs (see backend/migration_behavioral_questions.sql and
 * backend/migration_sign_level_balance.sql) — same technique, applied at
 * both levels, since behavioral questions live in local JSON, not a table
 * a SQL function can query.
 *
 * `getSubKey` names the second-level grouping: a behavioral question's
 * subtopic (see BehavioralQuestion.subtopicKey) or a sign question's own
 * `sign_id` — same technique, two different "what's the smaller unit
 * inside a topic" answers.
 */
function selectProportionalByTopic<T extends { topic_id: string }>(
  pool: T[],
  count: number,
  getSubKey: (item: T) => string,
): T[] {
  if (pool.length <= count) return pool;

  const byTopic = new Map<string, T[]>();
  for (const item of pool) {
    if (!byTopic.has(item.topic_id)) byTopic.set(item.topic_id, []);
    byTopic.get(item.topic_id)!.push(item);
  }

  // One shuffled, capped queue per topic — round-robined below instead of
  // flattened and randomly trimmed, so a topic's single guaranteed slot
  // can never be the one that gets cut.
  const topicQueues: T[][] = [];
  for (const topicQs of byTopic.values()) {
    const topicAllocated = Math.ceil(count * (topicQs.length / pool.length));

    // Second pass: spread this topic's own allocation across ITS subtopics
    // (or signs), the same way the outer pass spreads `count` across topics.
    const bySubtopic = new Map<string, T[]>();
    for (const item of topicQs) {
      const key = getSubKey(item);
      if (!bySubtopic.has(key)) bySubtopic.set(key, []);
      bySubtopic.get(key)!.push(item);
    }
    const topicSelected: T[] = [];
    for (const subQs of bySubtopic.values()) {
      const subAllocated = Math.ceil(topicAllocated * (subQs.length / topicQs.length));
      topicSelected.push(...shuffle(subQs).slice(0, subAllocated));
    }

    topicQueues.push(shuffle(topicSelected).slice(0, topicAllocated));
  }

  // Randomize which topic's turn comes first — without this, when there
  // are more topics than `count` (e.g. the daily challenge: 6 slots for 7
  // behavioral topics), the round-robin loop below always exhausts `count`
  // partway through round 0, and whichever topic happened to be LAST in
  // Map iteration order would NEVER get picked — not randomly unlucky,
  // permanently excluded, every single time. Shuffling the turn order
  // first makes that exclusion random (and thus fair on average across
  // many exams) instead of landing on the same topic forever.
  const orderedQueues = shuffle(topicQueues);

  // Round-robin: everyone's round-0 pick before anyone's round-1 pick, etc.
  const selected: T[] = [];
  for (let round = 0; selected.length < count; round++) {
    let tookAny = false;
    for (const queue of orderedQueues) {
      if (selected.length >= count) break;
      if (queue[round] !== undefined) {
        selected.push(queue[round]);
        tookAny = true;
      }
    }
    if (!tookAny) break; // every queue exhausted — pool was smaller than count
  }

  return shuffle(selected);
}

/**
 * Load questions for a behavioral topic (per-topic or per-level quiz).
 * @param topicId  — Any behavioral topic ID from BEHAVIORAL_SCAFFOLD_MAP
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
  return shuffle(questions);
}

/**
 * Fetch a random set of exam questions, proportionally distributed across topics.
 * Uses the get_random_questions stored procedure.
 *
 * Behavioral questions are drawn from every topic in BEHAVIORAL_SCAFFOLD_MAP
 * via local JSON files, so every topic in the app is represented regardless of
 * Supabase content. The full exam takes BEHAVIORAL_EXAM_COUNT of them; the
 * daily challenge passes its own quota so it can hold a 60/40 split.
 *
 * @param behavioralCount — how many behavioral questions to include.
 *                          Defaults to the full exam's fixed quota.
 */
export async function getRandomExamQuestions(
  count: number = 30,
  behavioralCount: number = BEHAVIORAL_EXAM_COUNT,
): Promise<DBQuestion[]> {
  // Only return questions with exactly 4 answers (3-answer questions are outdated)
  const onlyNew = (qs: DBQuestion[]) => qs.filter(q => q.answers.length >= 4);

  // ── Behavioral questions (always from local JSON) ────────────────────────────
  const numBehavioral = Math.min(Math.max(0, behavioralCount), count);
  const behavioralQs  = selectProportionalByTopic(loadBehavioralExamQuestions(), numBehavioral, q => q.subtopicKey);

  const numSign = count - behavioralQs.length; // how many sign-based Qs to fetch

  // ── Sign-based questions (from Supabase / mock) ──────────────────────────────
  let signQs: DBQuestion[] = [];

  if (USE_MOCK) {
    signQs = selectProportionalByTopic(
      onlyNew(mockData.questions.map(normalizeQuestion)),
      numSign,
      q => q.sign_id,
    );
  } else {
    // Try the stored procedure first (fastest, balanced distribution)
    try {
      const { data, error } = await supabase.rpc('get_random_questions', {
        question_count: numSign,
      } as any);
      if (error) throw error;
      signQs = shuffle(onlyNew(((data as DBQuestion[]) ?? []).map(normalizeQuestion)))
        .slice(0, numSign);
    } catch (err) {
      console.warn('[api] getRandomExamQuestions RPC failed, trying direct query:', err);

      // Fallback: direct table query. Must filter sign_id IS NOT NULL exactly
      // like get_random_questions does — the `questions` table also holds
      // "registry" rows for behavioral questions (sign_id = NULL, kept only
      // so foreign keys like user_progress.question_id can resolve; see
      // backend/migration_behavioral_questions.sql). Without this filter
      // those rows leak in as if they were sign questions on top of the
      // ones already added from local JSON above — double-counting
      // behavioral questions in one exam, the exact bug that migration's
      // WHERE clause exists to prevent in the primary RPC path.
      try {
        const { data, error } = await supabase
          .from('questions')
          .select('*')
          .not('sign_id', 'is', null);
        if (error) throw error;
        signQs = selectProportionalByTopic(
          onlyNew(((data as DBQuestion[]) ?? []).map(normalizeQuestion)),
          numSign,
          q => q.sign_id,
        );
      } catch (err2) {
        logFallbackToMock('getRandomExamQuestions (direct query also failed)', err2);
        signQs = selectProportionalByTopic(
          onlyNew(mockData.questions.map(normalizeQuestion)),
          numSign,
          q => q.sign_id,
        );
      }
    }
  }

  // ── Combine sign + behavioral, shuffle, return ───────────────────────────────
  return shuffle([...signQs, ...behavioralQs]);
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
    logFallbackToMock('getQuestionsBySign', err);
    return mockData.questions.filter(q => q.sign_id === signId);
  }
}

/**
 * Fetch specific questions by their IDs.
 * Used for weak-area practice after an exam.
 *
 * Behavioral question IDs (loadBehavioralExamQuestions' "beh_..." prefix)
 * never exist in Supabase's `questions` table or in mockData.questions —
 * they're generated on the fly from local scaffold JSON, not stored
 * anywhere a table lookup could find them. Before this split, a wrong
 * behavioral-topic answer from the exam would vanish from weak-area
 * practice entirely: the .in('id', ids) / mockData filter below simply
 * never matched it, so it was silently dropped instead of showing up to
 * retry. Splitting by ID prefix routes each half to the source that can
 * actually resolve it.
 */
export async function getQuestionsByIds(ids: string[]): Promise<DBQuestion[]> {
  if (!ids.length) return [];

  const behavioralIds = ids.filter(id => id.startsWith('beh_'));
  const signIds        = ids.filter(id => !id.startsWith('beh_'));

  const behavioralQs = behavioralIds.length
    ? loadBehavioralExamQuestions().filter(q => behavioralIds.includes(q.id))
    : [];

  if (!signIds.length) return behavioralQs;

  if (USE_MOCK) {
    return [...mockData.questions.filter(q => signIds.includes(q.id)), ...behavioralQs];
  }

  try {
    const { data, error } = await supabase
      .from('questions')
      .select('*')
      .in('id', signIds);

    if (error) throw error;
    return [...(data ?? []).map(normalizeQuestion), ...behavioralQs];
  } catch (err) {
    logFallbackToMock('getQuestionsByIds', err);
    return [...mockData.questions.filter(q => signIds.includes(q.id)), ...behavioralQs];
  }
}

/**
 * Fetch ALL questions for a specific topic (sign-based only), shuffled.
 * Used for the per-topic quiz — covers every sign in the topic.
 * Questions are filtered to those with 4 answers (the new format).
 */
export async function getQuestionsByTopic(topicId: string, levelId?: string): Promise<DBQuestion[]> {
  // Daily challenge — random questions from all topics, 60% behavioral / 40% signs
  if (topicId === 'daily') {
    return getRandomExamQuestions(
      DAILY_QUESTION_COUNT,
      Math.round(DAILY_QUESTION_COUNT * DAILY_BEHAVIORAL_FRACTION),
    );
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
      shuffle(
        mockData.questions
          .filter(q => signIds.includes(q.sign_id ?? ''))
          .map(normalizeQuestion),
      ),
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
      shuffle(((data ?? []) as DBQuestion[]).map(normalizeQuestion)),
    );
  } catch (err) {
    logFallbackToMock('getQuestionsByTopic', err);
    const signIds = mockData.signs
      .filter(s => s.topic_id === topicId)
      .map(s => s.id);
    return onlyNew(
      shuffle(
        mockData.questions
          .filter(q => signIds.includes(q.sign_id ?? ''))
          .map(normalizeQuestion),
      ),
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
 *
 * submissionId identifies ONE answer event (not one network call). Pass the
 * same id across every retry of the same answer, and again if that answer
 * is later replayed from utils/answerQueue.ts after an app restart — the
 * server (see backend/migration_answer_idempotency.sql) recognizes a
 * repeat submission_id and skips the increment instead of double-counting
 * an answer that was already saved. If omitted, one is generated here so
 * this call's own internal retries are still deduped even by callers that
 * don't have a queue id to pass in.
 */
export async function saveAnswer(
  userId: string,
  questionId: string,
  isCorrect: boolean,
  retries = 3,
  submissionId?: string
): Promise<void> {
  if (USE_MOCK) return;

  const subId = submissionId ?? `${userId}_${questionId}_${Date.now()}_${Math.random().toString(36).slice(2)}`;

  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const { error } = await supabase.rpc('upsert_user_progress', {
        p_user_id:        userId,
        p_question_id:    questionId,
        p_is_correct:     isCorrect,
        p_submission_id:  subId,
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
  } catch (err) {
    logFallbackToMock('getAllQuestionsLocal', err);
    return mockData.questions;
  }
}

// ─── EXAM SESSIONS ────────────────────────────────────────────────────────────

/**
 * The exam pass mark: 26 correct out of 30 (~87%) — the Israeli Ministry of
 * Transport's own theory-test standard, confirmed 2026-08-12 (kolzchut.org.il,
 * easyteo.co.il). This app's exam already mirrors that test's 30-question
 * structure, so this fraction is applied to whatever the actual question
 * count of a session turns out to be, rather than a hardcoded "24" — the
 * single source of truth for BOTH hooks/useExam.ts (live pass/fail during
 * the exam) and saveExamSession below (what gets written to the DB). Before
 * this, "24" was duplicated in both places by hand, with nothing keeping
 * them in sync if one was ever changed without the other.
 */
export const PASS_FRACTION = 26 / 30;

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
  const passThreshold = Math.round(total * PASS_FRACTION);
  const passed = score >= passThreshold;

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
        pass_threshold:   passThreshold,
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
