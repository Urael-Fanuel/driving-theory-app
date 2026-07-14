/**
 * utils/ragExplain.ts
 * Fetches a RAG-grounded Amharic explanation for a wrong quiz answer.
 *
 * Calls the `rag-explain` Edge Function, which:
 *   1. embeds the question (gemini-embedding-001)
 *   2. retrieves the top matching chunks from rag_chunks (pgvector)
 *   3. asks gemini-2.5-flash for a short, simple Amharic explanation
 *
 * Returns null on any failure — callers show nothing rather than an error.
 */

import { supabase } from '../backend/supabaseClient';

export interface RagQuery {
  question: string;
  wrongAnswer: string;
  correctAnswer: string;
}

export async function fetchWrongAnswerExplanation(query: RagQuery): Promise<string | null> {
  try {
    if (!supabase) return null;

    const invokePromise = supabase.functions.invoke('rag-explain', {
      body: {
        question: query.question,
        wrong_answer: query.wrongAnswer,
        correct_answer: query.correctAnswer,
      },
    });
    // Race against a timeout so a hung function never freezes the UI
    const timeoutPromise = new Promise<{ data: null; error: Error }>((resolve) =>
      setTimeout(() => resolve({ data: null, error: new Error('rag-explain timeout') }), 25_000)
    );
    const { data, error } = await Promise.race([invokePromise, timeoutPromise]);

    if (error || !data?.explanation) {
      if (error) console.warn('[ragExplain] function error:', error);
      return null;
    }
    return String(data.explanation);
  } catch (e) {
    console.warn('[ragExplain] error:', e);
    return null;
  }
}
