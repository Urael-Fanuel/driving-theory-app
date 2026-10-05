/**
 * services/sound.ts
 * The ONLY file in the app that talks to expo-audio for playback.
 *
 * Why this exists (2026-10-05, Expo SDK 55 upgrade): expo-av was removed from
 * Expo in SDK 55 and replaced by expo-audio, whose API is different. The app
 * has dozens of call sites written against expo-av's `Audio.Sound`
 * (createAsync / playAsync / pauseAsync / stopAsync / unloadAsync / status
 * callbacks). Rather than rewrite every call site, this file keeps the same
 * small surface and implements it on expo-audio, so the playback logic in
 * hooks/useAudio.ts and utils/googleTTS.ts stays what it was and only the
 * primitive underneath changed. Any further redesign of playback (single
 * owner, tokens, retries) can now be done here and in those two files.
 *
 * Differences from expo-av that this file absorbs — read before changing it:
 *
 *  1. expo-audio NEVER reports a load failure. A missing file, a 404 or an
 *     undecodable file just leaves the player in the "idle" state forever. We
 *     detect it from the state sequence (it was "buffering", then fell back
 *     to "idle") and, as a backstop, with a timeout. Callers get what they got
 *     from expo-av: createAsync rejects, or a status with isLoaded:false + error.
 *
 *  2. On Android, setAudioModeAsync REPLACES the whole mode — it does not merge
 *     like expo-av did. A call that omits `interruptionMode` silently resets it.
 *     applyAudioMode() below therefore always sends the complete mode, and
 *     skips the native call when nothing relevant changed (the native setter
 *     also re-forces speakerphone routing every time it is called).
 *
 *  3. expo-audio's `remove()` only stops its module-level tracking; the native
 *     ExoPlayer is freed by `release()`. dispose() does pause -> remove ->
 *     release, in that order (pause first so audio focus is given back).
 *
 *  4. Statuses use seconds; this file converts to the milliseconds the app uses.
 */

import { Platform } from 'react-native';
import { createAudioPlayer, setAudioModeAsync } from 'expo-audio';
import type { AudioPlayer, AudioStatus } from 'expo-audio';

// ─── Status shape (mirrors the subset of expo-av's AVPlaybackStatus we used) ──

export type PlaybackStatus =
  | { isLoaded: false; error?: string }
  | {
      isLoaded:        true;
      shouldPlay:      boolean;
      isPlaying:       boolean;
      isBuffering:     boolean;
      didJustFinish:   boolean;
      positionMillis:  number;
      durationMillis:  number | undefined;
    };

export type StatusCallback = (status: PlaybackStatus) => void;

/**
 * A clip that has not become ready within this long is treated as failed.
 * expo-av had no limit at all (a stalled load waited forever); expo-audio
 * additionally never reports errors, so a bound is required.
 */
const LOAD_TIMEOUT_MS = 30_000;

// ─── Audio mode ───────────────────────────────────────────────────────────────

interface AudioModeState {
  playsInSilentMode:          boolean;
  interruptionMode:           'mixWithOthers' | 'doNotMix' | 'duckOthers';
  shouldPlayInBackground:     boolean;
  allowsRecording:            boolean;
  shouldRouteThroughEarpiece: boolean;
}

// Same behaviour the app had under expo-av: duck other apps' audio while a clip
// plays, play even in silent mode (iOS), stop when the app goes to background,
// route to the loudspeaker.
let _mode: AudioModeState = {
  playsInSilentMode:          true,
  interruptionMode:           'duckOthers',
  shouldPlayInBackground:     false,
  allowsRecording:            false,
  shouldRouteThroughEarpiece: false,
};
let _appliedKey: string | null = null;

function modeKey(m: AudioModeState): string {
  // Android ignores recording / silent-mode flags, so changing only those must
  // not trigger another native call (see difference 2 in the header).
  return Platform.OS === 'ios'
    ? JSON.stringify(m)
    : JSON.stringify([m.interruptionMode, m.shouldPlayInBackground, m.shouldRouteThroughEarpiece]);
}

/** Merge `partial` into the app's audio mode and apply it if anything relevant changed. */
export function applyAudioMode(partial: Partial<AudioModeState> = {}): Promise<void> {
  const next = { ..._mode, ...partial };
  const key  = modeKey(next);
  _mode = next;
  if (key === _appliedKey) return Promise.resolve();
  _appliedKey = key;
  return setAudioModeAsync(next).catch(err => {
    _appliedKey = null;   // try again next time
    throw err;
  });
}

// ─── Sound ────────────────────────────────────────────────────────────────────

export class Sound {
  private player:        AudioPlayer | null;
  private subscription:  { remove(): void } | null = null;
  private onStatus:      StatusCallback | null = null;
  private wantsPlay      = false;
  private loaded         = false;
  private sawBuffering   = false;
  private loadSettle:    ((error: string | null) => void) | null = null;
  private loadTimer:     ReturnType<typeof setTimeout> | null = null;

  private constructor(player: AudioPlayer) {
    this.player = player;
  }

  /**
   * Create a player for `uri`, optionally start it, and resolve once it is
   * ready (like expo-av). Rejects if it cannot be loaded.
   */
  static createAsync(
    source: { uri: string },
    initial: { shouldPlay?: boolean; progressUpdateIntervalMillis?: number } = {},
    onStatus?: StatusCallback,
  ): Promise<{ sound: Sound }> {
    return new Promise((resolve, reject) => {
      let player: AudioPlayer;
      try {
        // A plain string is passed on untouched by expo-audio (an object would
        // go through expo-asset). data: and file: URIs both work.
        player = createAudioPlayer(source.uri, {
          updateInterval: initial.progressUpdateIntervalMillis ?? 500,
        });
      } catch (err) {
        reject(err);
        return;
      }

      const sound = new Sound(player);
      sound.onStatus  = onStatus ?? null;
      sound.wantsPlay = !!initial.shouldPlay;

      sound.loadSettle = (error) => {
        sound.loadSettle = null;
        if (sound.loadTimer) { clearTimeout(sound.loadTimer); sound.loadTimer = null; }
        if (error === null) {
          resolve({ sound });
        } else {
          sound.dispose();
          reject(new Error(error));
        }
      };
      sound.loadTimer = setTimeout(
        () => sound.loadSettle?.(`audio did not load within ${LOAD_TIMEOUT_MS / 1000}s`),
        LOAD_TIMEOUT_MS,
      );

      sound.subscription = player.addListener('playbackStatusUpdate', (ev: AudioStatus) => sound.handle(ev));

      // Start right away: ExoPlayer begins as soon as it is ready, which is
      // what expo-av's shouldPlay:true did.
      if (sound.wantsPlay) {
        try { player.play(); } catch (err) { sound.loadSettle?.(String((err as Error)?.message ?? err)); }
      }

      // The first status event can already be queued; if the player was
      // already ready by now, don't wait for another one.
      try {
        const now = player.currentStatus;
        if (now) sound.handle(now);
      } catch {}
    });
  }

  private toStatus(ev: AudioStatus): PlaybackStatus {
    return {
      isLoaded:       true,
      shouldPlay:     this.wantsPlay,
      isPlaying:      !!ev.playing && ev.playbackState === 'ready',
      isBuffering:    !!ev.isBuffering,
      didJustFinish:  !!ev.didJustFinish,
      positionMillis: Math.round((ev.currentTime || 0) * 1000),
      durationMillis: ev.duration ? Math.round(ev.duration * 1000) : undefined,
    };
  }

  private handle(ev: AudioStatus): void {
    if (!this.player) return;
    const state = ev.playbackState;

    if (state === 'buffering') this.sawBuffering = true;

    if (!this.loaded) {
      // Load failure: it started buffering, then fell back to idle.
      if (this.sawBuffering && state === 'idle') {
        const message = 'audio failed to load';
        if (this.loadSettle) { this.loadSettle(message); }
        return;
      }
      if (ev.isLoaded && (state === 'ready' || state === 'ended')) {
        this.loaded = true;
        this.loadSettle?.(null);
      } else {
        return;   // still loading — expo-av did not report these either
      }
    } else if (state === 'idle') {
      // Was loaded, now stopped by an error (we never stop the player ourselves
      // without disposing it first).
      this.onStatus?.({ isLoaded: false, error: 'playback stopped unexpectedly' });
      return;
    }

    this.onStatus?.(this.toStatus(ev));
  }

  setOnPlaybackStatusUpdate(cb: StatusCallback | null): void {
    this.onStatus = cb;
  }

  async playAsync(): Promise<void> {
    if (!this.player) throw new Error('Sound is unloaded');
    this.wantsPlay = true;
    this.player.play();
  }

  async pauseAsync(): Promise<void> {
    if (!this.player) throw new Error('Sound is unloaded');
    this.wantsPlay = false;
    this.player.pause();
  }

  /** Pause (callers always unload right after, as with expo-av). */
  async stopAsync(): Promise<void> {
    if (!this.player) throw new Error('Sound is unloaded');
    this.wantsPlay = false;
    this.player.pause();
  }

  async unloadAsync(): Promise<void> {
    this.dispose();
  }

  async getStatusAsync(): Promise<PlaybackStatus> {
    if (!this.player || !this.loaded) return { isLoaded: false };
    return this.toStatus(this.player.currentStatus);
  }

  private dispose(): void {
    const p = this.player;
    if (!p) return;
    this.player = null;
    if (this.loadTimer) { clearTimeout(this.loadTimer); this.loadTimer = null; }
    try { this.subscription?.remove(); } catch {}
    this.subscription = null;
    this.onStatus     = null;
    try { p.pause();   } catch {}   // first: gives audio focus back
    try { p.remove();  } catch {}   // stop module-level tracking
    try { p.release(); } catch {}   // free the native ExoPlayer
    const settle = this.loadSettle;
    this.loadSettle = null;
    settle?.('unloaded before it finished loading');
  }
}
