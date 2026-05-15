/**
 * AGENT 4 — services/speechRecognition.ts
 * Google Cloud STT integration for Engine A voice answers.
 *
 * Recognizes ONLY Amharic number words: አንድ (1), ሁለት (2), ሶስት (3)
 * Phrase hints dramatically improve accuracy for limited vocabulary.
 *
 * Usage:
 *   const result = await recognizeAmharicAnswer(audioUri);
 *   if (result.answer !== null) {
 *     // 0, 1, or 2 → maps to answer A, B, C
 *   }
 */

// expo-file-system v17+ deprecated the top-level API; use /legacy for readAsStringAsync
import * as FileSystem from 'expo-file-system/legacy';

// ─── Config ───────────────────────────────────────────────────────────────────

const GOOGLE_STT_URL = 'https://speech.googleapis.com/v1/speech:recognize';
const API_KEY        = process.env.EXPO_PUBLIC_GOOGLE_STT_KEY ?? '';

// Phrase hints — ONLY words we need to recognize
// Boost = 20 means strong preference for these phrases
const PHRASE_HINTS = [
  'አንድ', 'ሁለት', 'ሶስት',   // Amharic: one, two, three
  'ሀ',   'ለ',   'ሐ',      // Amharic letters A, B, C
  '1',   '2',   '3',       // Digits (in case user speaks in English)
  'one', 'two', 'three',    // English fallback
];

// Confidence threshold — below this, don't trust the result
const MIN_CONFIDENCE = 0.65;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface STTResult {
  /** Answer index: 0, 1, or 2 — null if not recognized */
  answer: number | null;
  /** Confidence score 0-1 */
  confidence: number;
  /** Raw transcript from Google */
  transcript: string;
  /** Whether we got a valid answer (confidence + recognized word) */
  isRecognized: boolean;
}

// ─── Speech to answer mapping ─────────────────────────────────────────────────

function mapSpeechToAnswer(transcript: string): number | null {
  const t = transcript.trim().toLowerCase();

  // Amharic number words
  if (t.includes('አንድ') || t === 'ሀ' || t === '1' || t === 'one') return 0;
  if (t.includes('ሁለት') || t === 'ለ' || t === '2' || t === 'two') return 1;
  if (t.includes('ሶስት') || t === 'ሐ' || t === '3' || t === 'three') return 2;
  if (t.includes('አራት') || t === 'መ' || t === '4' || t === 'four') return 3;

  // Handle variations
  if (t.startsWith('አር') || t.includes('አራ')) return 3;
  if (t.startsWith('አ') || t.includes('አን')) return 0;
  if (t.startsWith('ሁ') || t.includes('ሁለ')) return 1;
  if (t.startsWith('ሶ') || t.includes('ሶስ')) return 2;

  return null;
}

// ─── Main recognition function ────────────────────────────────────────────────

/**
 * Send audio to Google Cloud STT and get answer index.
 * @param audioUri        - Local URI of the recorded audio file
 * @param encoding        - Audio encoding that matches the recording format:
 *                          'LINEAR16' for iOS .wav, 'AMR_WB' for Android .amr
 * @param sampleRateHertz - Sample rate of the recording (default 16000)
 */
export async function recognizeAmharicAnswer(
  audioUri: string,
  encoding: 'LINEAR16' | 'AMR_WB' = 'LINEAR16',
  sampleRateHertz: number = 16000,
): Promise<STTResult> {
  if (!API_KEY) {
    console.warn('[STT] No API key configured — STT disabled');
    return { answer: null, confidence: 0, transcript: '', isRecognized: false };
  }

  try {
    console.log('[STT] audioUri:', audioUri, '| encoding:', encoding, '| rate:', sampleRateHertz);

    // Read audio file as base64
    const base64Audio = await FileSystem.readAsStringAsync(audioUri, {
      encoding: 'base64',  // EncodingType.Base64 = 'base64' — use literal to avoid runtime undefined
    });
    console.log('[STT] base64Audio length:', base64Audio?.length ?? 'null');

    // Call Google STT API
    const response = await fetch(GOOGLE_STT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': API_KEY },
      body: JSON.stringify({
        config: {
          encoding,           // matches recording format: LINEAR16 (iOS) or AMR_WB (Android)
          sampleRateHertz,    // 16000 Hz — optimal for speech recognition
          languageCode:       'am-ET',      // Amharic (Ethiopia)
          speechContexts: [{
            phrases: PHRASE_HINTS,
            boost:   20,                   // Strong preference for our words
          }],
          maxAlternatives:    1,
          enableAutomaticPunctuation: false,
          model:              'default',    // No short-command model for Amharic yet
          useEnhanced:        false,
        },
        audio: {
          content: base64Audio,
        },
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error('[STT] API error:', response.status, err);
      return { answer: null, confidence: 0, transcript: '', isRecognized: false };
    }

    const data = await response.json();

    // No results
    if (!data.results || data.results.length === 0) {
      return { answer: null, confidence: 0, transcript: '', isRecognized: false };
    }

    const alternative = data.results[0]?.alternatives?.[0];
    if (!alternative) {
      return { answer: null, confidence: 0, transcript: '', isRecognized: false };
    }

    const transcript = alternative.transcript?.trim() ?? '';
    const confidence = alternative.confidence ?? 0;

    console.log(`[STT] Got: "${transcript}" (confidence: ${confidence.toFixed(2)})`);

    // Reject low-confidence results
    if (confidence < MIN_CONFIDENCE) {
      return { answer: null, confidence, transcript, isRecognized: false };
    }

    const answer = mapSpeechToAnswer(transcript);

    return {
      answer,
      confidence,
      transcript,
      isRecognized: answer !== null,
    };

  } catch (error: any) {
    // Log full details so we can diagnose the exact failure
    console.error('[STT] Network/parse error:', error);
    console.error('[STT] error.name:', error?.name);
    console.error('[STT] error.message:', error?.message);
    console.error('[STT] error.stack:', error?.stack);
    return { answer: null, confidence: 0, transcript: '', isRecognized: false };
  }
}

// ─── Mock for development (no API key needed) ─────────────────────────────────

/**
 * Mock STT that randomly returns an answer (for testing without API key).
 * Only used in development when EXPO_PUBLIC_GOOGLE_STT_KEY is not set.
 */
export async function mockRecognizeAmharicAnswer(): Promise<STTResult> {
  await new Promise(r => setTimeout(r, 1500)); // Simulate API delay

  const r = Math.random();
  if (r < 0.6) {
    // 60% chance of recognizing an answer
    const answer = Math.floor(Math.random() * 3) as 0 | 1 | 2;
    const words  = ['አንድ', 'ሁለት', 'ሶስት'];
    return {
      answer,
      confidence:   0.85,
      transcript:   words[answer],
      isRecognized: true,
    };
  } else if (r < 0.8) {
    // 20% chance of low confidence
    return { answer: null, confidence: 0.4, transcript: 'ያልተሰማ', isRecognized: false };
  } else {
    // 20% chance of total failure
    return { answer: null, confidence: 0, transcript: '', isRecognized: false };
  }
}
