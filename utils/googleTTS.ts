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
import { getCachedTtsUri, storeTtsAudio, releaseAudioFiles } from '../services/audioCache';

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
    let settled = false;
    let safetyTimer: ReturnType<typeof setTimeout> | undefined;

    /**
     * Ends THIS wait, and only this one.
     *
     * ⚠️ DO NOT go back to resolving the module-level `pendingResolve` from
     * inside the status listener. That was a real, months-old latent bug that
     * finally bit on 2026-08-17: a clip's didJustFinish can arrive slightly
     * AFTER the next clip has already started waiting, and the old code read
     * whatever `pendingResolve` held at that moment — by then the NEXT clip's
     * resolve. Consequences, both observed in a device log:
     *   1. The next clip was reported "finished" ~180 ms in (real length
     *      ~3.2 s), so the caller advanced to the following sound immediately.
     *   2. It also set `currentSound = null` while that newer clip was still
     *      playing, leaving an ORPHAN that nothing could stop.
     * Together those play two clips at once. Every guard below exists to make
     * both impossible: a stale clip can only ever end its own wait, and can
     * never touch a newer clip's state.
     */
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(safetyTimer);
      // Detach first: a unloaded/stopped sound can still emit one last status.
      try { sound.setOnPlaybackStatusUpdate(null); } catch {}
      // Only release the shared slot / current sound if they are still OURS.
      if (pendingResolve === finish) pendingResolve = null;
      if (currentSound === sound)    currentSound = null;
      sound.unloadAsync().catch(() => {});
      resolve();
    };

    pendingResolve = finish;

    // Safety: always resolve after maxMs — prevents permanent hang → ANR
    safetyTimer = setTimeout(finish, maxMs);

    sound.setOnPlaybackStatusUpdate((s) => {
      if (!s.isLoaded) return;
      if (s.didJustFinish) {
        finish();
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
    // stopTTS() can land in the gap between the check above and playback
    // actually starting. Without this second check the clip would keep
    // playing with currentSound already nulled — audible, and unstoppable.
    if (_ttsGeneration !== myGeneration) {
      sound.stopAsync().catch(() => {});
      sound.unloadAsync().catch(() => {});
      if (currentSound === sound) currentSound = null;
      _emitSpeaking(false);
      return false;
    }
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
 *  and the sequence should stop rather than continue to the next step.
 *
 *  ⚠️ OFFLINE: behavioral questions and answers have no pre-recorded files and
 *  are spoken only through here. Every rendering is therefore cached to disk
 *  keyed by the exact text, so the FIRST read of a given sentence needs a
 *  connection and every read after it works offline. Do not remove the cache
 *  lookup below — without it the whole behavioral side of the app goes silent
 *  the moment reception drops. */
export async function speakAndAwait(text: string): Promise<boolean> {
  await stopTTS();
  const myGeneration = _ttsGeneration;  // Capture AFTER stopTTS increments it
  try {
    _emitSpeaking(true);
    await Audio.setAudioModeAsync({ playsInSilentModeIOS: true, playThroughEarpieceAndroid: false });

    // ── 1. Offline-first: a previous rendering of this exact text ────────────
    let uri           = await getCachedTtsUri(text);
    const fromCache   = !!uri;
    // Base64 to persist after playback starts (null when served from cache).
    let toStore: string | null = null;

    if (_ttsGeneration !== myGeneration) { _emitSpeaking(false); return false; }

    // ── 2. Not cached — ask the Edge Function proxy (not Google directly), so
    //       the API key stays server-side. Race against a timeout to prevent
    //       ANR if the function ever hangs.
    if (!uri) {
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

      uri     = `data:audio/mp3;base64,${data.audioContent}`;
      toStore = data.audioContent;
    }

    // ── 3. Play ──────────────────────────────────────────────────────────────
    let sound: Audio.Sound;
    try {
      ({ sound } = await Audio.Sound.createAsync({ uri }));
    } catch (err) {
      // Only a cached file can fail here in a recoverable way. Drop it and let
      // the caller retry against the network rather than caching a dud forever.
      if (fromCache) {
        console.warn('[googleTTS] cached TTS unreadable, discarding:', err);
        await releaseAudioFiles([uri]).catch(() => {});
      }
      _emitSpeaking(false);
      return false;
    }

    if (_ttsGeneration !== myGeneration) { sound.unloadAsync().catch(() => {}); _emitSpeaking(false); return false; }
    currentSound = sound;
    await sound.playAsync();
    // stopTTS() can land in the gap between the check above and playback
    // actually starting. Without this second check the clip would keep
    // playing with currentSound already nulled — audible, and unstoppable.
    if (_ttsGeneration !== myGeneration) {
      sound.stopAsync().catch(() => {});
      sound.unloadAsync().catch(() => {});
      if (currentSound === sound) currentSound = null;
      _emitSpeaking(false);
      return false;
    }
    // Persist AFTER playback starts so writing to disk never delays the audio.
    if (toStore) storeTtsAudio(text, toStore).catch(() => {});
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

// ─── Offline pre-rendering ────────────────────────────────────────────────────

/**
 * Spoken-number prefixes Engine B puts in front of each answer.
 * ⚠️ Must stay identical to the AMHARIC_NUMBERS arrays in
 * app/(engineB)/behavioral-subtopic/[id].tsx and
 * app/(engineB)/topic-quiz/[topicId].tsx. The TTS cache is keyed by the exact
 * string spoken, so any drift here silently turns every Engine B answer into a
 * cache miss and it goes back to needing a live connection.
 */
const TTS_NUMBER_PREFIXES = ['አንድ', 'ሁለት', 'ሶስት', 'አራት'];

/**
 * Collect the sentences that can ONLY be voiced by TTS.
 *
 * A question with a `question_audio_url` has pre-recorded files and is handled
 * by the normal audio cache. A question without one is behavioral: its text is
 * the only source, so it must be rendered and stored ahead of time or it will
 * be silent the moment reception drops.
 *
 * The two engines say answers differently: Engine A reads the answer text on
 * its own, Engine B prefixes it with the spoken number. Those are separate
 * cache entries, so pass `engine` to render only the wording that will
 * actually be spoken. When it is unknown, BOTH are collected — caching a
 * little extra is cheap, guessing wrong means silence offline.
 */
export function collectTtsTexts(
  questions: Array<{
    question_amharic?: string;
    question_audio_url?: string;
    answers?: Array<{ text_amharic?: string; audio_url?: string }>;
  }>,
  engine?: 'A' | 'B' | null
): string[] {
  const texts: string[] = [];
  for (const q of questions) {
    if (q.question_audio_url) continue; // has real audio files
    if (q.question_amharic) texts.push(q.question_amharic);
    (q.answers ?? []).forEach((a, i) => {
      if (a.audio_url || !a.text_amharic) return;
      if (engine !== 'B') texts.push(a.text_amharic);                     // Engine A
      if (engine !== 'A') {
        const prefix = TTS_NUMBER_PREFIXES[i];
        if (prefix) texts.push(`${prefix}። ${a.text_amharic}`);            // Engine B
      }
    });
  }
  return texts;
}

/**
 * Render and store TTS for the given texts so they can be spoken offline later.
 *
 * Deliberately isolated from playback: it never touches currentSound,
 * _ttsGeneration or the speaking state, so it cannot interfere with audio the
 * user is listening to right now. Failures are silent — this is an
 * optimisation, and a miss simply means falling back to a live call later.
 */
export async function prefetchTtsForTexts(texts: string[]): Promise<void> {
  const pending: string[] = [];
  const seen = new Set<string>();

  for (const text of texts) {
    if (!text || seen.has(text)) continue;
    seen.add(text);
    const cached = await getCachedTtsUri(text).catch(() => null);
    if (!cached) pending.push(text);
  }

  // Small batches: an exam can need ~40 renderings, and firing them all at
  // once would hammer the Edge Function.
  const BATCH_SIZE = 3;
  for (let i = 0; i < pending.length; i += BATCH_SIZE) {
    await Promise.all(
      pending.slice(i, i + BATCH_SIZE).map(async (text) => {
        try {
          const { data, error } = await supabase.functions.invoke('tts', { body: { text } });
          if (error || !data?.audioContent) return;
          await storeTtsAudio(text, data.audioContent);
        } catch {
          // Offline or rate-limited — nothing to do, the live path still works.
        }
      })
    );
  }
}
