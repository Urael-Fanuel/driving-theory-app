/**
 * utils/googleTTS.ts
 * Calls Google Cloud TTS API and plays the result using expo-av.
 *
 * Exports:
 *   speakAmharic(text)      – fire-and-forget TTS (backward compat)
 *   speakAndAwait(text)     – TTS, resolves when audio finishes
 *   playUrlAndAwait(url)    – plays a pre-recorded URL, resolves when done
 *   stopTTS()               – stops current audio; resolves any pending await
 *   pauseTTS()              – pauses current sound
 *   resumeTTS()             – resumes current sound
 */

import { Audio } from 'expo-av';
import { supabase } from '../backend/supabaseClient';

// TTS requests go through a Supabase Edge Function (supabase/functions/tts) —
// the Google API key lives server-side only and is never shipped in the app.

let currentSound:   Audio.Sound | null = null;
let pendingResolve: (() => void) | null = null;
let _ttsGeneration = 0;   // Incremented by stopTTS — lets speakAndAwait/playUrlAndAwait detect mid-fetch cancellation

// ─── TTS speaking state ───────────────────────────────────────────────────────
let _isTTSSpeaking = false;
const _speakingListeners = new Set<(speaking: boolean) => void>();

function _emitSpeaking(speaking: boolean) {
  _isTTSSpeaking = speaking;
  _speakingListeners.forEach(fn => fn(speaking));
}

/** Subscribe to TTS speaking state changes. Returns an unsubscribe function. */
export function onTTSSpeakingChange(fn: (speaking: boolean) => void): () => void {
  _speakingListeners.add(fn);
  return () => _speakingListeners.delete(fn);
}

/** Get the current TTS speaking state without subscribing. */
export function getIsTTSSpeaking(): boolean {
  return _isTTSSpeaking;
}

// ─── Core controls ────────────────────────────────────────────────────────────

export async function stopTTS(): Promise<void> {
  _ttsGeneration++;   // Invalidate any in-flight speakAndAwait / playUrlAndAwait
  _emitSpeaking(false);
  // Resolve any pending speakAndAwait / playUrlAndAwait so the sequence exits
  const res = pendingResolve;
  pendingResolve = null;
  res?.();

  try { await currentSound?.stopAsync(); } catch {}
  try { await currentSound?.unloadAsync(); } catch {}
  currentSound = null;
}

export async function pauseTTS(): Promise<void> {
  try { await currentSound?.pauseAsync(); } catch {}
}

export async function resumeTTS(): Promise<void> {
  try { await currentSound?.playAsync(); } catch {}
}

// ─── Internal helper ──────────────────────────────────────────────────────────

/**
 * Attach a playback-finish listener and return a promise that resolves when:
 *   (a) the sound finishes naturally (didJustFinish), OR
 *   (b) stopTTS() is called externally (pendingResolve is resolved from outside),
 *   (c) safety timeout fires (maxMs) — prevents ANR if didJustFinish never fires
 *       on certain Android devices (known expo-av edge case).
 */
function awaitSound(sound: Audio.Sound, maxMs = 30_000): Promise<void> {
  return new Promise<void>((resolve) => {
    pendingResolve = resolve;

    // Safety: always resolve after maxMs — prevents permanent hang → ANR
    const safetyTimer = setTimeout(() => {
      const r = pendingResolve;
      pendingResolve = null;
      sound.unloadAsync().catch(() => {});
      currentSound = null;
      r?.();
    }, maxMs);

    sound.setOnPlaybackStatusUpdate((s) => {
      if (!s.isLoaded) return;
      if (s.didJustFinish) {
        clearTimeout(safetyTimer);
        const r = pendingResolve;
        pendingResolve = null;
        sound.unloadAsync().catch(() => {});
        currentSound = null;
        r?.();
      }
    });
  });
}

// ─── Public playback functions ────────────────────────────────────────────────

/** Play a pre-recorded audio URL and await completion.
 *  Returns true if audio played successfully, false if it failed. */
export async function playUrlAndAwait(url: string): Promise<boolean> {
  await stopTTS();
  const myGeneration = _ttsGeneration;  // Capture AFTER stopTTS increments it
  try {
    _emitSpeaking(true);
    await Audio.setAudioModeAsync({ playsInSilentModeIOS: true, playThroughEarpieceAndroid: false });
    const { sound } = await Audio.Sound.createAsync({ uri: url });
    if (_ttsGeneration !== myGeneration) { sound.unloadAsync().catch(() => {}); _emitSpeaking(false); return false; }
    currentSound = sound;
    await sound.playAsync();
    await awaitSound(sound);
    _emitSpeaking(false);
    return true;
  } catch (e) {
    console.warn('[googleTTS] playUrlAndAwait error:', e);
    _emitSpeaking(false);
    return false;
  }
}

/** Call Google TTS API and await completion.
 *  Returns true if the text was spoken successfully, false if it failed
 *  (network timeout, API error, no audio content).
 *  Callers MUST check the return value — if false, the user heard nothing
 *  and the sequence should stop rather than continue to the next step. */
export async function speakAndAwait(text: string): Promise<boolean> {
  await stopTTS();
  const myGeneration = _ttsGeneration;  // Capture AFTER stopTTS increments it
  try {
    _emitSpeaking(true);
    await Audio.setAudioModeAsync({ playsInSilentModeIOS: true, playThroughEarpieceAndroid: false });

    // Call the Edge Function proxy (not Google directly) — the API key
    // stays server-side. Race against a timeout to prevent ANR if the
    // function ever hangs (mirrors the old 7s Google fetch timeout).
    const invokePromise = supabase.functions.invoke('tts', { body: { text } });
    const timeoutPromise = new Promise<{ data: null; error: Error }>((resolve) =>
      setTimeout(() => resolve({ data: null, error: new Error('tts timeout') }), 8_000)
    );
    const { data, error } = await Promise.race([invokePromise, timeoutPromise]);

    if (error || !data?.audioContent) {
      if (error) console.warn('[googleTTS] tts function error:', error);
      _emitSpeaking(false);
      return false;
    }
    // Cancelled during fetch — another stopTTS() was called while we were waiting
    if (_ttsGeneration !== myGeneration) { _emitSpeaking(false); return false; }

    const uri = `data:audio/mp3;base64,${data.audioContent}`;
    const { sound } = await Audio.Sound.createAsync({ uri });
    if (_ttsGeneration !== myGeneration) { sound.unloadAsync().catch(() => {}); _emitSpeaking(false); return false; }
    currentSound = sound;
    await sound.playAsync();
    await awaitSound(sound);
    _emitSpeaking(false);
    return true;
  } catch (e) {
    console.warn('[googleTTS] speakAndAwait error:', e);
    _emitSpeaking(false);
    return false;
  }
}

/** Fire-and-forget TTS — kept for backward compatibility. */
export function speakAmharic(text: string): void {
  speakAndAwait(text).catch(() => {});
}
