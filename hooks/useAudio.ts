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
 * Use this to await the end of an audio clip before starting the next one.
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
      allowsRecordingIOS:    false,
      playsInSilentModeIOS:  true,
      staysActiveInBackground: false,
      shouldDuckAndroid:     true,
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
      }
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
