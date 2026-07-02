/**
 * AGENT 3 — hooks/useAudio.ts
 * Audio playback hook using expo-av.
 *
 * Uses a module-level singleton so only ONE sound plays at a time
 * across ALL screens. Any screen that calls playAudio() stops whatever
 * is currently playing first.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { Audio, AVPlaybackStatus } from 'expo-av';
import { getStorageUrl, BUCKETS } from '../backend/supabaseClient';
import { getLocalAudioUri } from '../services/audioCache';

// ─── Types ────────────────────────────────────────────────────────────────────

export type AudioState = 'idle' | 'loading' | 'playing' | 'paused' | 'finished' | 'error';

export interface UseAudioReturn {
  /** Play audio from a URL or local path. Stops any currently playing audio. */
  playAudio: (uri: string) => Promise<void>;
  /** Stop current audio */
  stopAudio: () => Promise<void>;
  /** Pause current audio */
  pauseAudio: () => Promise<void>;
  /** Resume paused audio */
  resumeAudio: () => Promise<void>;
  /** Current playback state */
  audioState: AudioState;
  /** True while audio is playing */
  isPlaying: boolean;
  /** Duration in ms (null if not loaded) */
  durationMs: number | null;
  /** Current position in ms */
  positionMs: number;
}

// ─── Module-level singleton ───────────────────────────────────────────────────
// Only one Audio.Sound exists at a time across all useAudio instances.
// All hooks share this state so any screen can detect when audio finishes.

let _sound: Audio.Sound | null = null;
let _currentState: AudioState  = 'idle';
let _soundId                   = 0;   // Incremented on every _stop(); stale callbacks from the previous sound check this
const _listeners = new Set<(state: AudioState) => void>();

function _emit(state: AudioState) {
  _currentState = state;
  _listeners.forEach(fn => fn(state));
}

async function _stop() {
  _soundId++;            // Invalidate any in-flight callbacks from the previous sound
  const s = _sound;
  _sound = null;
  if (s) {
    try { await s.stopAsync();   } catch {}
    try { await s.unloadAsync(); } catch {}
  }
}

/** Read the current global audio state without creating a hook instance */
export const getGlobalAudioState = (): AudioState => _currentState;

/**
 * Returns a Promise that resolves when the current audio finishes (or errors/stops).
 * Use this ONLY to wait for audio that was started externally (e.g. starting_quiz.mp3
 * fired from another screen). For audio you start yourself, use playAndAwaitAudio().
 */
export function waitForAudioEnd(): Promise<void> {
  // Already idle / finished / error — resolve immediately
  if (
    _currentState === 'idle' ||
    _currentState === 'finished' ||
    _currentState === 'error'
  ) {
    return Promise.resolve();
  }
  return new Promise<void>(resolve => {
    const listener = (state: AudioState) => {
      if (
        state === 'finished' ||
        state === 'idle' ||
        state === 'error'
      ) {
        _listeners.delete(listener);
        resolve();
      }
    };
    _listeners.add(listener);
  });
}

/**
 * Plays audio and returns a Promise that resolves ONLY when THIS specific
 * audio finishes, errors, or is cancelled/replaced.
 *
 * This is the correct way to sequence audio:
 *   await playAndAwaitAudio(url, () => cancelled);
 *
 * Unlike playAudio() + waitForAudioEnd(), this Promise is tied to a single
 * sound instance via _soundId — it cannot be resolved prematurely by another
 * audio completing or by global _currentState changes.
 */
export async function playAndAwaitAudio(
  rawUri: string,
  isCancelled: () => boolean,
): Promise<void> {
  if (!rawUri || isCancelled()) return;

  // Convert local asset paths to Supabase CDN URLs (mirrors playAudio hook)
  let uri = rawUri;
  if (rawUri.startsWith('assets/audio/')) {
    const filename = rawUri.slice('assets/audio/'.length);
    const cdnUrl = getStorageUrl(BUCKETS.AUDIO, filename);
    if (cdnUrl) uri = cdnUrl;
  }

  // Use locally cached file if available (offline support)
  uri = await getLocalAudioUri(uri).catch(() => uri);

  _emit('loading');
  await _stop();
  if (isCancelled()) return;

  const thisSoundId = _soundId; // Captured after _stop() — uniquely identifies THIS sound

  return new Promise<void>((resolve) => {
    let resolved = false;
    const safeResolve = () => { if (!resolved) { resolved = true; resolve(); } };

    // Safety: resolve after 150 s even if didJustFinish never fires.
    // Prevents permanent hang (ANR) on Xiaomi / Samsung Android devices
    // where expo-av's didJustFinish callback is occasionally silently dropped.
    // 150 s = 2.5 minutes — safely above the longest known audio file (~2 min explanation).
    const safetyTimer = setTimeout(() => {
      _emit('finished');
      safeResolve();
    }, 150_000);

    Audio.Sound.createAsync(
      { uri },
      { shouldPlay: true, progressUpdateIntervalMillis: 200 },
      (status: AVPlaybackStatus) => {
        // Guard: another audio started or sequence was cancelled
        if (thisSoundId !== _soundId || isCancelled()) {
          clearTimeout(safetyTimer);
          safeResolve();
          return;
        }
        if (!status.isLoaded) {
          if (status.error) { clearTimeout(safetyTimer); _emit('error'); safeResolve(); }
          return;
        }
        if (status.isPlaying)     _emit('playing');
        if (status.didJustFinish) { clearTimeout(safetyTimer); _emit('finished'); safeResolve(); }
      }
    )
    .then(({ sound }) => {
      if (thisSoundId !== _soundId || isCancelled()) {
        clearTimeout(safetyTimer);
        sound.unloadAsync().catch(() => {});
        safeResolve();
        return;
      }
      _sound = sound;
      if (_currentState === 'loading') _emit('playing');
    })
    .catch((error) => {
      clearTimeout(safetyTimer);
      console.warn('[useAudio] playAndAwaitAudio failed:', uri, error);
      _emit('error');
      safeResolve(); // Resolve on error — never hang the sequence
    });
  });
}

/**
 * Preloads an audio file into memory without playing it.
 * Call this while another audio is playing so the next one is ready instantly.
 */
export async function preloadAudio(uri: string): Promise<Audio.Sound | null> {
  if (!uri) return null;
  try {
    let resolvedUri = uri;
    if (uri.startsWith('assets/audio/')) {
      const filename = uri.slice('assets/audio/'.length);
      const cdnUrl = getStorageUrl(BUCKETS.AUDIO, filename);
      if (cdnUrl) resolvedUri = cdnUrl;
    }
    const { sound } = await Audio.Sound.createAsync(
      { uri: resolvedUri },
      { shouldPlay: false },
    );
    return sound;
  } catch {
    return null;
  }
}

/**
 * Plays a pre-loaded Audio.Sound and waits for it to finish.
 * Integrates with the global singleton so stopAudio() still works.
 */
export async function playPreloadedAudio(
  sound: Audio.Sound | null,
  isCancelled: () => boolean,
): Promise<void> {
  if (!sound || isCancelled()) return;

  await _stop();
  if (isCancelled()) { sound.unloadAsync().catch(() => {}); return; }

  const thisSoundId = _soundId;
  _sound = sound;
  _emit('playing');

  return new Promise<void>((resolve) => {
    sound.setOnPlaybackStatusUpdate((status: AVPlaybackStatus) => {
      if (thisSoundId !== _soundId || isCancelled()) { resolve(); return; }
      if (!status.isLoaded) {
        if (status.error) { _emit('error'); resolve(); }
        return;
      }
      if (status.isPlaying)     _emit('playing');
      if (status.didJustFinish) { _emit('finished'); resolve(); }
    });
    sound.playAsync().catch(() => { _emit('error'); resolve(); });
  });
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useAudio(): UseAudioReturn {
  const isMounted   = useRef(true);
  // Initialise from global state so the component is aware of in-flight audio
  const [audioState, setAudioState] = useState<AudioState>(_currentState);
  const [durationMs, setDurationMs] = useState<number | null>(null);
  const [positionMs, setPositionMs] = useState(0);

  useEffect(() => {
    // Configure audio session once
    Audio.setAudioModeAsync({
      allowsRecordingIOS:       false,
      playsInSilentModeIOS:     true,
      staysActiveInBackground:  false,
      shouldDuckAndroid:        true,
      playThroughEarpieceAndroid: false,
    }).catch(() => {});

    // Subscribe to global audio events
    const listener = (state: AudioState) => {
      if (isMounted.current) setAudioState(state);
    };
    _listeners.add(listener);

    return () => {
      isMounted.current = false;
      _listeners.delete(listener);
      // NOTE: Do NOT stop audio on unmount — another screen may have started it
    };
  }, []);

  // ── Play ──────────────────────────────────────────────────────────────────

  const playAudio = useCallback(async (rawUri: string) => {
    if (!rawUri) return;

    // Convert local asset paths to Supabase CDN URLs
    let uri = rawUri;
    if (rawUri.startsWith('assets/audio/')) {
      const filename = rawUri.slice('assets/audio/'.length);
      const cdnUrl = getStorageUrl(BUCKETS.AUDIO, filename);
      if (cdnUrl) uri = cdnUrl;
    }

    // Use locally cached file if available (offline support)
    uri = await getLocalAudioUri(uri).catch(() => uri);

    try {
      _emit('loading');
      await _stop();

      const thisSoundId = _soundId;  // Capture AFTER _stop() — uniquely identifies THIS sound

      const { sound } = await Audio.Sound.createAsync(
        { uri },
        { shouldPlay: true, progressUpdateIntervalMillis: 200 },
        (status: AVPlaybackStatus) => {
          // If another playAudio() call started (and incremented _soundId), ignore this stale callback
          if (thisSoundId !== _soundId) return;
          if (!status.isLoaded) {
            if (status.error) _emit('error');
            return;
          }
          if (isMounted.current) {
            setPositionMs(status.positionMillis);
            if (status.durationMillis) setDurationMs(status.durationMillis);
          }
          if (status.isPlaying)      _emit('playing');
          if (status.didJustFinish)  _emit('finished');
        }
      );

      _sound = sound;
      // In case the status callback fires before we reach here
      if (_currentState === 'loading') _emit('playing');

    } catch (error) {
      console.warn('[useAudio] Failed to play audio:', uri, error);
      _emit('error');
    }
  }, []);

  // ── Stop ──────────────────────────────────────────────────────────────────

  const stopAudio = useCallback(async () => {
    await _stop();
    _emit('idle');
  }, []);

  // ── Pause ─────────────────────────────────────────────────────────────────

  const pauseAudio = useCallback(async () => {
    if (_sound) {
      try {
        await _sound.pauseAsync();
        _emit('paused');
      } catch (error) {
        console.warn('[useAudio] Pause failed:', error);
      }
    }
  }, []);

  // ── Resume ────────────────────────────────────────────────────────────────

  const resumeAudio = useCallback(async () => {
    if (_sound) {
      try {
        await _sound.playAsync();
        _emit('playing');
      } catch (error) {
        console.warn('[useAudio] Resume failed:', error);
        // playAsync threw — sound is in bad state; reset so the UI can restart
        _emit('idle');
      }
    } else {
      // No sound loaded (e.g. was unloaded by a concurrent _stop call).
      // Reset to idle so the caller can detect this and restart the sequence.
      _emit('idle');
    }
  }, []);

  return {
    playAudio,
    stopAudio,
    pauseAudio,
    resumeAudio,
    audioState,
    isPlaying: audioState === 'playing',
    durationMs,
    positionMs,
  };
}
