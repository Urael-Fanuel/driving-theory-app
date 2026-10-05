/**
 * AGENT 3 — hooks/useAudio.ts
 * Audio playback hook (playback primitive: services/sound.ts, built on expo-audio).
 *
 * Uses a module-level singleton so only ONE sound plays at a time
 * across ALL screens. Any screen that calls playAudio() stops whatever
 * is currently playing first.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { Sound, PlaybackStatus, applyAudioMode } from '../services/sound';
import { getStorageUrl, BUCKETS } from '../backend/supabaseClient';
import { getLocalAudioUri, discardCachedCopy } from '../services/audioCache';
import { reportError, watchPlaybackStart, describeUri } from '../services/errorReporter';

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
// Only one Sound exists at a time across all useAudio instances.
// All hooks share this state so any screen can detect when audio finishes.
//
// ⚠️ OWNERSHIP RULE — every playback path in this file MUST:
//   1. Call _claim() as its FIRST statement, before any `await`. It takes a
//      new ticket number (_soundId) and the sound that is playing right now,
//      synchronously. Tickets only go up, so of any set of overlapping requests
//      exactly one — the newest — can ever still hold the current ticket.
//   2. Re-check `ticket === _soundId` after EVERY `await`, and stop if it does
//      not match. A superseded request must never create, assign or start
//      anything.
//   3. Assign `_sound = sound` in the same synchronous step as the ticket check
//      that precedes it (see _startClip), so there is no gap in which a newer
//      request can slip in and leave this sound untracked.
// Why: the old code took its ticket AFTER `await _stop()`. Two overlapping
// requests could then both read the SAME ticket, both create a sound, and
// one of them was lost: still playing, with nothing able to stop it
// (reproduced independently by a code review on 2026-10-05). With one ticket per
// request that cannot happen, and call sites do NOT need to await stopAudio()
// for overlap-correctness. If you add a new playback path it must follow all
// three rules.

let _sound: Sound | null = null;
let _currentState: AudioState  = 'idle';
let _soundId                   = 0;   // Ticket counter; a request owns playback only while its ticket is the latest
const _listeners = new Set<(state: AudioState) => void>();

function _emit(state: AudioState) {
  _currentState = state;
  _listeners.forEach(fn => fn(state));
}

/**
 * Take ownership of playback. Synchronous on purpose (see OWNERSHIP RULE):
 * invalidates every earlier request and takes over the sound playing now,
 * which the caller must then stop with _release().
 */
function _claim(): { ticket: number; previous: Sound | null } {
  const ticket   = ++_soundId;
  const previous = _sound;
  _sound = null;
  return { ticket, previous };
}

async function _release(previous: Sound | null): Promise<void> {
  if (!previous) return;
  try { await previous.stopAsync();   } catch {}
  try { await previous.unloadAsync(); } catch {}
}

/** Asset paths ("assets/audio/x.mp3") live on the Supabase CDN. */
function _toRemoteUri(rawUri: string): string {
  if (rawUri.startsWith('assets/audio/')) {
    const filename = rawUri.slice('assets/audio/'.length);
    const cdnUrl = getStorageUrl(BUCKETS.AUDIO, filename);
    if (cdnUrl) return cdnUrl;
  }
  return rawUri;
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

// ─── One clip, start to finish ────────────────────────────────────────────────

type LoadedStatus = Extract<PlaybackStatus, { isLoaded: true }>;

interface ClipOptions {
  /** Called with every progress update of this clip (position / duration). */
  onProgress?: (status: LoadedStatus) => void;
  /**
   * Do not announce a failure as the 'error' state. Used for the first try of
   * a saved copy, because a second try (the original file) follows.
   */
  quietFailure?: boolean;
}

interface Clip {
  /** Settles once the sound exists and is playing under this ticket (or why not). */
  started:  Promise<'ok' | 'cancelled' | 'failed'>;
  /**
   * Settles when this clip is over. true = the listener heard it, or it was
   * deliberately cancelled/replaced (the caller's own check handles that);
   * false = it failed to load or play, or never made any sound.
   */
  finished: Promise<boolean>;
}

/**
 * Safety: a clip whose "finished" callback never arrives (seen on some
 * Xiaomi / Samsung phones) must not hang its caller forever. Above the longest
 * known file (~2 min).
 */
const CLIP_SAFETY_MS = 150_000;

/**
 * Create and start ONE sound for `src` under `ticket`. The only place a Sound
 * is created for playback — it implements rules 2 and 3 of the OWNERSHIP RULE.
 */
function _startClip(
  src: string,
  ticket: number,
  isCancelled: () => boolean,
  opts: ClipOptions = {},
): Clip {
  let resolveStarted!:  (v: 'ok' | 'cancelled' | 'failed') => void;
  let resolveFinished!: (v: boolean) => void;
  const started  = new Promise<'ok' | 'cancelled' | 'failed'>(r => { resolveStarted = r; });
  const finished = new Promise<boolean>(r => { resolveFinished = r; });

  let done        = false;
  let everPlayed  = false;   // did a status ever say it is actually playing?
  const current   = () => ticket === _soundId && !isCancelled();

  const finish = (played: boolean, startResult: 'ok' | 'cancelled' | 'failed') => {
    if (done) return;
    done = true;
    clearTimeout(safetyTimer);
    resolveStarted(startResult);   // no-op if it already settled
    resolveFinished(played);
  };

  const safetyTimer = setTimeout(() => {
    // No finish callback in 2.5 minutes. If the clip was audibly playing the
    // callback was simply dropped, so count it as heard. If it never played at
    // all, the user heard nothing: that is a failure, not a success.
    if (ticket === _soundId) _emit(everPlayed ? 'finished' : 'error');
    finish(everPlayed, everPlayed ? 'ok' : 'failed');
  }, CLIP_SAFETY_MS);

  Sound.createAsync(
    { uri: src },
    { shouldPlay: true, progressUpdateIntervalMillis: 200 },
    (status: PlaybackStatus) => {
      // Superseded or cancelled: not a failure (the finish handler of the
      // newer request owns the state now).
      if (!current()) { finish(true, 'cancelled'); return; }
      if (!status.isLoaded) {
        if (status.error) {
          reportError('audio', 'clip:status', status.error, describeUri(src), { localUri: src });
          if (!opts.quietFailure) _emit('error');
          finish(false, 'failed');
        }
        return;
      }
      if (status.isPlaying || status.positionMillis > 0) everPlayed = true;
      opts.onProgress?.(status);
      if (status.isPlaying)     _emit('playing');
      if (status.didJustFinish) { _emit('finished'); finish(true, 'ok'); }
    },
  )
    .then(({ sound }) => {
      // Rule 3: the ticket check and the assignment happen in ONE synchronous
      // step. A request that lost its place unloads what it created.
      if (!current()) {
        sound.unloadAsync().catch(() => {});
        finish(true, 'cancelled');
        return;
      }
      _sound = sound;
      resolveStarted('ok');
      // Diagnostic only: reports a clip that "loaded" but never makes a sound.
      watchPlaybackStart(sound, current, 'clip', src);
    })
    .catch((error) => {
      console.warn('[useAudio] clip failed:', src, error);
      if (!current()) { finish(true, 'cancelled'); return; }   // superseded: not a failure
      reportError('audio', 'clip:load', error, describeUri(src), { localUri: src });
      if (!opts.quietFailure) _emit('error');
      finish(false, 'failed');
    });

  return { started, finished };
}

/** True for a path inside the app's own offline cache (as opposed to a URL). */
function _isSavedCopy(src: string, remote: string): boolean {
  return src !== remote && src.startsWith('file:');
}

/**
 * Plays audio and returns a Promise that resolves ONLY when THIS specific
 * audio finishes, errors, or is cancelled/replaced.
 *
 * This is the correct way to sequence audio:
 *   const ok = await playAndAwaitAudio(url, () => cancelled);
 *   if (!ok) return;   // nothing was heard — do not advance the sequence
 *
 * Unlike playAudio() + waitForAudioEnd(), this Promise is tied to a single
 * request via its ticket — it cannot be resolved prematurely by another
 * audio completing or by global _currentState changes.
 *
 * ⚠️ RETURN VALUE IS NOT OPTIONAL TO CHECK.
 *   false = the clip genuinely failed to load or play, i.e. the user heard
 *           NOTHING. This is the normal case offline for a file that was never
 *           cached. A caller that ignores it will march through the rest of its
 *           sequence in milliseconds, moving highlights with no sound — which
 *           to a non-reading user looks like the app answering by itself.
 *   true  = finished normally, OR was deliberately cancelled/superseded (the
 *           caller's own isCancelled() check handles that case, and a
 *           cancellation must not be reported as a connection failure).
 *
 * If the SAVED copy of a clip cannot be played it is thrown away and the
 * original file is tried once, so one broken offline copy no longer means
 * silence for that clip on every later play.
 */
export async function playAndAwaitAudio(
  rawUri: string,
  isCancelled: () => boolean,
): Promise<boolean> {
  if (!rawUri || isCancelled()) return true;

  const { ticket, previous } = _claim();   // FIRST, before any await
  _emit('loading');
  const remote = _toRemoteUri(rawUri);

  await _release(previous);
  if (ticket !== _soundId) return true;
  if (isCancelled()) { _emit('idle'); return true; }

  // Use the locally saved copy if there is one (offline support)
  const src = await getLocalAudioUri(remote).catch(() => remote);
  if (ticket !== _soundId) return true;
  if (isCancelled()) { _emit('idle'); return true; }

  const saved = _isSavedCopy(src, remote);
  let played = await _startClip(src, ticket, isCancelled, { quietFailure: saved }).finished;

  if (!played && saved && ticket === _soundId && !isCancelled()) {
    await discardCachedCopy(remote).catch(() => {});
    played = await _startClip(remote, ticket, isCancelled).finished;
  }
  return played;
}

/**
 * Preloads an audio file into memory without playing it.
 * Call this while another audio is playing so the next one is ready instantly.
 */
export async function preloadAudio(uri: string): Promise<Sound | null> {
  if (!uri) return null;
  try {
    const resolvedUri = _toRemoteUri(uri);
    const { sound } = await Sound.createAsync(
      { uri: resolvedUri },
      { shouldPlay: false },
    );
    return sound;
  } catch (error) {
    reportError('audio', 'preloadAudio', error, describeUri(uri));
    return null;
  }
}

/**
 * Plays a pre-loaded Sound and waits for it to finish.
 * Integrates with the global singleton so stopAudio() still works.
 */
export async function playPreloadedAudio(
  sound: Sound | null,
  isCancelled: () => boolean,
): Promise<void> {
  if (!sound || isCancelled()) return;

  const { ticket, previous } = _claim();   // FIRST, before any await
  await _release(previous);
  if (ticket !== _soundId || isCancelled()) { sound.unloadAsync().catch(() => {}); return; }

  _sound = sound;
  _emit('playing');

  return new Promise<void>((resolve) => {
    sound.setOnPlaybackStatusUpdate((status: PlaybackStatus) => {
      if (ticket !== _soundId || isCancelled()) { resolve(); return; }
      if (!status.isLoaded) {
        if (status.error) {
          reportError('audio', 'playPreloadedAudio:status', status.error);
          _emit('error'); resolve();
        }
        return;
      }
      if (status.isPlaying)     _emit('playing');
      if (status.didJustFinish) { _emit('finished'); resolve(); }
    });
    sound.playAsync().catch((error) => {
      // Emit only if still current — if a newer sound already replaced this
      // one (unloading it mid-play), its state must not be stomped to 'error'.
      if (ticket === _soundId) {
        reportError('audio', 'playPreloadedAudio:play', error);
        _emit('error');
      }
      resolve();
    });
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
    // Configure the audio session (applied once; see services/sound.ts)
    applyAudioMode().catch(() => {});

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
  // Resolves once the clip is playing (not when it ends — see playAndAwaitAudio
  // for that). Errors are reported through the audio state, never thrown.

  const playAudio = useCallback(async (rawUri: string) => {
    if (!rawUri) return;

    const { ticket, previous } = _claim();   // FIRST, before any await
    _emit('loading');
    const remote = _toRemoteUri(rawUri);

    await _release(previous);
    if (ticket !== _soundId) return;

    // Use locally cached file if available (offline support)
    const src = await getLocalAudioUri(remote).catch(() => remote);
    if (ticket !== _soundId) return;

    const onProgress = (status: LoadedStatus) => {
      if (isMounted.current) {
        setPositionMs(status.positionMillis);
        if (status.durationMillis) setDurationMs(status.durationMillis);
      }
    };
    const never = () => false;   // this entry point has no cancel flag; the ticket is the cancel

    const saved = _isSavedCopy(src, remote);
    let result = await _startClip(src, ticket, never, { onProgress, quietFailure: saved }).started;

    if (result === 'failed' && saved && ticket === _soundId) {
      // The saved copy could not be played: drop it, use the original once.
      await discardCachedCopy(remote).catch(() => {});
      result = await _startClip(remote, ticket, never, { onProgress }).started;
    }
  }, []);

  // ── Stop ──────────────────────────────────────────────────────────────────

  const stopAudio = useCallback(async () => {
    const { ticket, previous } = _claim();
    await _release(previous);
    // A newer request may have started while we were stopping: its state wins.
    if (ticket === _soundId) _emit('idle');
  }, []);

  // ── Pause ─────────────────────────────────────────────────────────────────

  const pauseAudio = useCallback(async () => {
    if (_sound) {
      try {
        await _sound.pauseAsync();
        _emit('paused');
      } catch (error) {
        console.warn('[useAudio] Pause failed:', error);
        reportError('audio', 'pauseAudio', error);
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
        reportError('audio', 'resumeAudio', error);
        // playAsync threw — sound is in bad state; reset so the UI can restart
        _emit('idle');
      }
    } else {
      // No sound loaded (e.g. it was replaced or stopped meanwhile).
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
