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
const TTS_URL = `https://texttospeech.googleapis.com/v1/text:synthesize?key=${TTS_KEY}`;

let currentSound:   Audio.Sound | null = null;
let pendingResolve: (() => void) | null = null;

// ─── Core controls ────────────────────────────────────────────────────────────

export async function stopTTS(): Promise<void> {
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
 *   (b) stopTTS() is called externally (pendingResolve is resolved from outside)
 */
function awaitSound(sound: Audio.Sound): Promise<void> {
  return new Promise<void>((resolve) => {
    pendingResolve = resolve;
    sound.setOnPlaybackStatusUpdate((s) => {
      if (!s.isLoaded) return;
      if (s.didJustFinish) {
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

/** Play a pre-recorded audio URL and await completion. */
export async function playUrlAndAwait(url: string): Promise<void> {
  await stopTTS();
  try {
    await Audio.setAudioModeAsync({ playsInSilentModeIOS: true });
    const { sound } = await Audio.Sound.createAsync({ uri: url });
    currentSound = sound;
    await sound.playAsync();
    await awaitSound(sound);
  } catch (e) {
    console.warn('[googleTTS] playUrlAndAwait error:', e);
  }
}

/** Call Google TTS API and await completion. */
export async function speakAndAwait(text: string): Promise<void> {
  await stopTTS();
  try {
    await Audio.setAudioModeAsync({ playsInSilentModeIOS: true });

    const res = await fetch(TTS_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        input:       { text },
        voice:       { languageCode: 'am-ET', name: 'am-ET-Standard-A', ssmlGender: 'FEMALE' },
        audioConfig: { audioEncoding: 'MP3', speakingRate: 0.85 },
      }),
    });

    const json = await res.json();
    if (!json.audioContent) return;

    const uri = `data:audio/mp3;base64,${json.audioContent}`;
    const { sound } = await Audio.Sound.createAsync({ uri });
    currentSound = sound;
    await sound.playAsync();
    await awaitSound(sound);
  } catch (e) {
    console.warn('[googleTTS] speakAndAwait error:', e);
  }
}

/** Fire-and-forget TTS — kept for backward compatibility. */
export function speakAmharic(text: string): void {
  speakAndAwait(text).catch(() => {});
}
