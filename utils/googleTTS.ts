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

const TTS_KEY = process.env.EXPO_PUBLIC_GOOGLE_TTS_KEY ?? '';
const TTS_URL = `https://texttospeech.googleapis.com/v1/text:synthesize`;

let currentSound:   Audio.Sound | null = null;
let pendingResolve: (() => void) | null = null;
let _ttsGeneration = 0;   // Incremented by stopTTS — lets speakAndAwait/playUrlAndAwait detect mid-fetch cancellation

// ─── Core controls ────────────────────────────────────────────────────────────

export async function stopTTS(): Promise<void> {
  _ttsGeneration++;   // Invalidate any in-flight speakAndAwait / playUrlAndAwait
  // Resolve any pending speakAndAwait / playUrlAndAwait so the sequence exits
  const res = pendingResolve;
  pendingResolve = null;
  res?.();

  try {
    await currentSound?.stopAsync();
    await currentSound?.unloadAsync();
  } catch {}
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
    await Audio.setAudioModeAsync({ playsInSilentModeIOS: true });
    const { sound } = await Audio.Sound.createAsync({ uri: url });
    if (_ttsGeneration !== myGeneration) { sound.unloadAsync().catch(() => {}); return false; }
    currentSound = sound;
    await sound.playAsync();
    await awaitSound(sound);
    return true;
  } catch (e) {
    console.warn('[googleTTS] playUrlAndAwait error:', e);
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
    await Audio.setAudioModeAsync({ playsInSilentModeIOS: true });

    // Abort the TTS request after 8 seconds — prevents ANR if Google API hangs
    const controller = new AbortController();
    const fetchTimeout = setTimeout(() => controller.abort(), 7_000);

    let res: Response;
    try {
      res = await fetch(TTS_URL, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': TTS_KEY },
        body: JSON.stringify({
          input:       { text },
          voice:       { languageCode: 'am-ET', name: 'am-ET-Standard-A', ssmlGender: 'FEMALE' },
          audioConfig: { audioEncoding: 'MP3', speakingRate: 0.85 },
        }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(fetchTimeout);
    }

    const json = await res.json();
    // No audio content = API returned error or empty response
    if (!json.audioContent) return false;
    // Cancelled during fetch — another stopTTS() was called while we were waiting
    if (_ttsGeneration !== myGeneration) return false;

    const uri = `data:audio/mp3;base64,${json.audioContent}`;
    const { sound } = await Audio.Sound.createAsync({ uri });
    if (_ttsGeneration !== myGeneration) { sound.unloadAsync().catch(() => {}); return false; }
    currentSound = sound;
    await sound.playAsync();
    await awaitSound(sound);
    return true;
  } catch (e) {
    console.warn('[googleTTS] speakAndAwait error:', e);
    return false;
  }
}

/** Fire-and-forget TTS — kept for backward compatibility. */
export function speakAmharic(text: string): void {
  speakAndAwait(text).catch(() => {});
}
