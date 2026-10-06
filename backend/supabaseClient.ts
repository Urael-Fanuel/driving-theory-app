/**
 * AGENT 2 — supabaseClient.ts
 * Initializes the Supabase client for the Ethiopian Driving Theory App.
 *
 * Used by both:
 *   - The React Native app (Expo) for live data
 *   - The upload/seed scripts (Node.js) for content management
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ─── Environment Variables ────────────────────────────────────────────────────
// In Expo: set in .env file as EXPO_PUBLIC_* (auto-exposed to client)
// In Node scripts: set in .env or shell environment

const SUPABASE_URL  = process.env.EXPO_PUBLIC_SUPABASE_URL  ?? '';
const SUPABASE_ANON = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

// ─── Type Definitions (mirrors schema.sql) ────────────────────────────────────

export interface DBTopic {
  id: string;
  name_amharic: string;
  name_hebrew?: string;
  icon?: string;
  color?: string;
  description_amharic?: string;
  audio_intro_url?: string;
  sign_count: number;
  subtopic_count?: number;
  display_order: number;
}

export interface DBSign {
  id: string;
  topic_id: string;
  display_order: number;
  name_amharic: string;
  name_hebrew?: string;
  explanation_amharic: string;
  image_url?: string;
  video_url?: string;
  audio_name_url?: string;
  audio_explanation_url?: string;
  difficulty: number;
}

export interface DBAnswer {
  id: 'A' | 'B' | 'C';
  text_amharic: string;
  image_url?: string;
  audio_url?: string;
  is_correct: boolean;
}

export interface DBQuestion {
  id: string;
  sign_id: string;
  topic_id: string;
  question_amharic: string;
  question_audio_url?: string;
  /** Image to show above the question (behavioral subtopic image, or undefined for sign questions). */
  question_image_url?: string;
  answers: DBAnswer[];
  explanation_correct_amharic: string;
  explanation_wrong_amharic: string;
  explanation_correct_audio_url?: string;
  explanation_wrong_audio_url?: string;
  difficulty: number;
}

export interface DBUser {
  id: string;
  phone?: string;
  display_name?: string;
  engine_type: 'A' | 'B';
  created_at: string;
  last_seen: string;
  // Added by backend/migration_agent_platform.sql — country/region are
  // reserved for a future IP-based pass; city is set today by
  // hooks/useLocationPrompt.ts from a one-time foreground GPS check.
  country?: string;
  region?: string;
  city?: string;
  platform?: string;
  os_version?: string;
  app_version?: string;
  locale?: string;
}

export interface DBUserProgress {
  id: string;
  user_id: string;
  question_id: string;
  correct_count: number;
  attempt_count: number;
  last_attempted: string;
}

export interface DBSignView {
  id: string;
  user_id: string;
  sign_id: string;
  view_count: number;
  video_completed: boolean;
  last_viewed: string;
}

export interface DBExamSession {
  id: string;
  user_id: string;
  engine_type: 'A' | 'B';
  score: number;
  total_questions: number;
  passed: boolean;
  pass_threshold: number;
  duration_seconds?: number;
  topic_breakdown?: Record<string, { correct: number; total: number }>;
  created_at: string;
}

// Database schema type for Supabase client typing
export interface Database {
  public: {
    Tables: {
      topics:        { Row: DBTopic;        Insert: Omit<DBTopic, 'sign_count' | 'display_order'>; Update: Partial<DBTopic> };
      signs:         { Row: DBSign;         Insert: Omit<DBSign, 'display_order' | 'difficulty'>; Update: Partial<DBSign> };
      questions:     { Row: DBQuestion;     Insert: Omit<DBQuestion, 'difficulty'>; Update: Partial<DBQuestion> };
      users:         { Row: DBUser;         Insert: Omit<DBUser, 'id' | 'created_at' | 'last_seen'>; Update: Partial<DBUser> };
      user_progress: { Row: DBUserProgress; Insert: Omit<DBUserProgress, 'id'>; Update: Partial<DBUserProgress> };
      sign_views:    { Row: DBSignView;     Insert: Omit<DBSignView, 'id'>; Update: Partial<DBSignView> };
      exam_sessions: { Row: DBExamSession;  Insert: Omit<DBExamSession, 'id' | 'created_at'>; Update: Partial<DBExamSession> };
    };
    Functions: {
      get_random_questions: { Args: { question_count: number }; Returns: DBQuestion[] };
      upsert_user_progress: { Args: { p_user_id: string; p_question_id: string; p_is_correct: boolean; p_submission_id?: string }; Returns: void };
      upsert_sign_view:     { Args: { p_user_id: string; p_sign_id: string; p_video_completed: boolean }; Returns: void };
    };
  };
}

// ─── Network deadlines ────────────────────────────────────────────────────────
//
// React Native's fetch has NO timeout: on a poor or blocked connection a
// request simply waits, and every screen waiting for it spins with it. Every
// request the Supabase client makes goes through fetchWithDeadline instead, so
// it either answers or fails in bounded time (the callers already fall back to
// the data bundled in the app). The same wrapper applies to sign-in/token
// refresh, which is what used to hold up the very first screen.
//
// After two data requests in a row time out, further data requests fail at
// once for a short while instead of each making the user wait again; the
// bundled data is used meanwhile. One success ends the pause.

const DEADLINE_DATA_MS      = 15_000;   // table queries / RPC
const DEADLINE_AUTH_MS      = 10_000;   // sign-in, token refresh
const DEADLINE_FUNCTIONS_MS = 30_000;   // edge functions (speech, explanations)
const BREAKER_TIMEOUTS      = 2;
const BREAKER_PAUSE_MS      = 20_000;

let _dataTimeouts = 0;
let _dataPausedUntil = 0;

export function fetchWithDeadline(input: any, init?: any): Promise<Response> {
  const url: string = typeof input === 'string' ? input : (input?.url ?? String(input));
  const isData = url.includes('/rest/v1/');
  const ms = url.includes('/functions/v1/') ? DEADLINE_FUNCTIONS_MS
           : url.includes('/auth/v1/')      ? DEADLINE_AUTH_MS
           : DEADLINE_DATA_MS;

  if (isData && Date.now() < _dataPausedUntil) {
    return Promise.reject(new TypeError('Network request skipped: the server did not answer recently'));
  }

  const controller = new AbortController();
  const outer: AbortSignal | undefined = init?.signal;
  if (outer) {
    if (outer.aborted) controller.abort();
    else outer.addEventListener('abort', () => controller.abort(), { once: true });
  }
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, ms);

  return fetch(input, { ...init, signal: controller.signal }).then(
    res => {
      clearTimeout(timer);
      if (isData) _dataTimeouts = 0;
      return res;
    },
    err => {
      clearTimeout(timer);
      if (!timedOut) throw err;          // a real failure or the caller's own cancel
      if (isData && ++_dataTimeouts >= BREAKER_TIMEOUTS) {
        _dataPausedUntil = Date.now() + BREAKER_PAUSE_MS;
        _dataTimeouts = 0;
      }
      throw new TypeError(`Network request timed out after ${ms / 1000}s`);
    },
  );
}

// ─── Client Singleton ─────────────────────────────────────────────────────────

let _client: SupabaseClient<Database> | null = null;

export function getSupabaseClient(): SupabaseClient<Database> {
  if (!_client) {
    if (!SUPABASE_URL || !SUPABASE_ANON) {
      throw new Error(
        'Missing Supabase credentials.\n' +
        'Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY in your .env file.'
      );
    }
    _client = createClient<Database>(SUPABASE_URL, SUPABASE_ANON, {
      auth: {
        // `storage` is required for persistSession to actually persist on
        // React Native — supabase-js defaults to `localStorage`, which does
        // not exist there. Without this, every app launch found no saved
        // session, called signInAnonymously() again, and got a brand new
        // user_id — so 26 real testers turned into 800+ rows in `users`,
        // each one losing all progress on every relaunch.
        storage:           AsyncStorage,
        persistSession:    true,
        autoRefreshToken:  true,
        detectSessionInUrl: false,
      },
      global: { fetch: fetchWithDeadline as any },
    });
  }
  return _client;
}

// Named export for convenience
export const supabase = (() => {
  try {
    return getSupabaseClient();
  } catch {
    // During build without env vars — return null, will be initialised at runtime
    return null as unknown as SupabaseClient<Database>;
  }
})();

// ─── Storage helpers ──────────────────────────────────────────────────────────

export const BUCKETS = {
  IMAGES: 'images',
  AUDIO:  'audio',
  VIDEOS: 'videos',
} as const;

/**
 * Returns the public URL for a file in a Supabase Storage bucket.
 */
export function getStorageUrl(bucket: string, filename: string): string {
  if (!SUPABASE_URL) return '';
  return `${SUPABASE_URL}/storage/v1/object/public/${bucket}/${filename}`;
}
