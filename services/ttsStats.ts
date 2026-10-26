/**
 * services/ttsStats.ts
 *
 * Anonymous counters for the recorded-voice system (backend/migration_tts_stats.sql):
 * how often a sentence was read from a recording, how often with the live Google
 * voice, and how often a recording failed to play. Only whole-number counts leave
 * the phone, grouped by app version and platform: no user id, no text, no device id.
 *
 * Counted in memory and sent in small batches: when the app is left, or after
 * FLUSH_AT sentences. A failed send (offline) keeps the counts for the next try.
 * Never throws and never delays anything the learner hears.
 *
 * Sent with the app's PUBLIC key only, NOT through the signed-in Supabase client, so
 * the request carries no user identity at all (CODEX round 3, D: the shared client
 * attaches the user's access token to every request). The day is the day the server
 * RECEIVES the counts, not the day they happened.
 */
import { AppState, Platform } from 'react-native';
import * as Application from 'expo-application';

const SUPABASE_URL  = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const SUPABASE_ANON = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';
const SEND_TIMEOUT_MS = 10_000;   // a request that never answers must not block the next sends forever

/** One anonymous call to the bump_tts_stats function. True only when the server accepted it. */
async function sendBatch(args: Record<string, unknown>): Promise<boolean> {
  if (!SUPABASE_URL || !SUPABASE_ANON) return false;
  const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = setTimeout(() => ctrl?.abort(), SEND_TIMEOUT_MS);
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/bump_tts_stats`, {
      method: 'POST',
      // apikey only: the project uses Supabase's new publishable key, which is not a token
      // and is not meant for the Authorization header (both forms were tried against the
      // live server on 2026-10-26 and accepted; this is the recommended one).
      headers: { 'Content-Type': 'application/json', apikey: SUPABASE_ANON },
      body: JSON.stringify(args),
      signal: ctrl?.signal,
    });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

export type TtsKind = 'recorded' | 'live' | 'recorded_failed';

const FLUSH_AT = 25;
const MAX_PER_CALL = 200;   // the server refuses more than this per call

const counts: Record<TtsKind, number> = { recorded: 0, live: 0, recorded_failed: 0 };
let flushing = false;
let listening = false;

const total = () => counts.recorded + counts.live + counts.recorded_failed;

function appVersion(): string {
  try {
    return `${Application.nativeApplicationVersion ?? '?'} (${Application.nativeBuildVersion ?? '?'})`.slice(0, 40);
  } catch {
    return '?';
  }
}

export function countTts(kind: TtsKind): void {
  try {
    counts[kind]++;
    if (!listening) {
      listening = true;
      AppState.addEventListener('change', s => { if (s !== 'active') flushTtsStats().catch(() => {}); });
    }
    if (total() >= FLUSH_AT) flushTtsStats().catch(() => {});
  } catch { /* a counter must never break the audio */ }
}

export async function flushTtsStats(): Promise<void> {
  if (flushing || total() === 0) return;
  const platform = Platform.OS === 'android' || Platform.OS === 'ios' ? Platform.OS : null;
  if (!platform) return;
  flushing = true;
  try {
    // keep sending until nothing is left, at most MAX_PER_CALL of each kind per call
    for (let guard = 0; guard < 20 && total() > 0; guard++) {
      const batch = {
        recorded:        Math.min(counts.recorded, MAX_PER_CALL),
        live:            Math.min(counts.live, MAX_PER_CALL),
        recorded_failed: Math.min(counts.recorded_failed, MAX_PER_CALL),
      };
      counts.recorded -= batch.recorded; counts.live -= batch.live; counts.recorded_failed -= batch.recorded_failed;
      const ok = await sendBatch({
        p_app_version: appVersion(), p_platform: platform,
        p_recorded: batch.recorded, p_live: batch.live, p_recorded_failed: batch.recorded_failed,
      });
      if (!ok) {   // offline or refused: keep them for the next try
        counts.recorded += batch.recorded; counts.live += batch.live; counts.recorded_failed += batch.recorded_failed;
        return;
      }
    }
  } finally {
    flushing = false;
  }
}
