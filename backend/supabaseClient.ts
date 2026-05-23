/**
 * AGENT 2 — supabaseClient.ts
 * Initializes the Supabase client for the Ethiopian Driving Theory App.
 *
 * Used by both:
 *   - The React Native app (Expo) for live data
 *   - The upload/seed scripts (Node.js) for content management
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';

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
      upsert_user_progress: { Args: { p_user_id: string; p_question_id: string; p_is_correct: boolean }; Returns: void };
      upsert_sign_view:     { Args: { p_user_id: string; p_sign_id: string; p_video_completed: boolean }; Returns: void };
    };
  };
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
        persistSession: true,
        autoRefreshToken: true,
      },
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
