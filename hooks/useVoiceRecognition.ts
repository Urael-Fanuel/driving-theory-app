/**
 * hooks/useVoiceRecognition.ts
 * Voice recognition hook for Engine A.
 *
 * State machine:
 *   idle → listening → processing → done (answer) | failed (no answer)
 *
 * Auto-stop strategy:
 *   1. Silence detection: stops ~600 ms after speech ends (fast response)
 *   2. Hard timeout: 5-second fallback if speech never stops
 *
 * Falls back to tap if STT not available or fails.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { getRecordingPermissionsAsync, requestRecordingPermissionsAsync } from 'expo-audio';
import { ActiveRecording, RecordingTick } from '../services/recorder';
import { applyAudioMode } from '../services/sound';
import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';
import * as Haptics from 'expo-haptics';
import {
  recognizeAmharicAnswer,
  mockRecognizeAmharicAnswer,
  STTResult,
} from '../services/speechRecognition';
import { VoiceButtonState } from '../components/engineA/VoiceAnswerButton';
import { reportError } from '../services/errorReporter';

// ─── Config ───────────────────────────────────────────────────────────────────

const MAX_RECORDING_SECONDS   = 5;    // Hard fallback timeout
const SILENCE_THRESHOLD_DB    = -45;  // dBFS — below this = silence
const SILENCE_DURATION_MS     = 600;  // ms of silence after speech → auto-stop
const MIN_RECORDING_MS        = 400;  // minimum recording before silence detection fires
const STATUS_INTERVAL_MS      = 80;   // metering poll interval (ms)

const USE_MOCK_STT = !process.env.EXPO_PUBLIC_SUPABASE_URL;

// Platform-appropriate encoding for Google STT
const STT_ENCODING:    'LINEAR16' | 'AMR_WB' = Platform.OS === 'android' ? 'AMR_WB' : 'LINEAR16';
const STT_SAMPLE_RATE: number                 = 16000;

// Recording format / metering: see services/recorder.ts (AMR-WB 16 kHz mono on Android,
// 16 kHz 16-bit PCM wav on iOS; the level scale there is converted so the
// SILENCE_THRESHOLD_DB above keeps its original meaning).

// ─── Types ────────────────────────────────────────────────────────────────────

export interface UseVoiceRecognitionReturn {
  voiceState:     VoiceButtonState;
  startListening: () => Promise<void>;
  stopListening:  () => Promise<void>;
  cancelListening: () => Promise<void>;
  hasPermission:  boolean;
  lastResult:     STTResult | null;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useVoiceRecognition(
  onAnswer: (answerIndex: number | null) => void
): UseVoiceRecognitionReturn {
  const [voiceState,    setVoiceState]    = useState<VoiceButtonState>('idle');
  const [hasPermission, setHasPermission] = useState(false);
  const [lastResult,    setLastResult]    = useState<STTResult | null>(null);

  const recordingRef   = useRef<ActiveRecording | null>(null);
  const timeoutRef     = useRef<ReturnType<typeof setTimeout> | null>(null);
  // True from the moment a stop begins until it has fully finished. The silence
  // detector re-fires stopListening on every 80 ms reading once the silence
  // limit is reached, so without this guard several stops overlap; the later
  // ones fail ("already unloaded") and report a false "not understood".
  const stoppingRef    = useRef(false);
  // Listening session number. Every start takes a new one; a cancel, or leaving
  // the screen, moves it on as well, so anything a start or a stop is still
  // waiting for (the microphone starting, the speech service answering) can tell
  // that it belongs to a session that is over. Before, a cancel during either
  // wait did nothing: the microphone came on anyway, or a stale answer was
  // delivered to a screen that had moved on (CODEX QA 2026-10-08, Q05).
  const sessionRef     = useRef(0);

  // Ref always pointing to the latest stopListening — used by the silence-detection
  // callback which is created inside startListening (can't close over fresh state).
  const stopListeningRef = useRef<() => Promise<void>>(async () => {});

  // ── Check mic permission status on mount (without requesting) ───────────────
  // Google Play policy: permissions must only be requested in response to a user
  // action (tapping the mic button), not eagerly on screen mount.
  // getPermissionsAsync() checks status silently — the actual Dialog prompt happens
  // only in startListening() when the user explicitly taps the mic.
  useEffect(() => {
    getRecordingPermissionsAsync()
      .then(({ granted }) => setHasPermission(granted))
      .catch(() => setHasPermission(false));

    return () => {
      sessionRef.current++;   // leaving the screen ends any start / stop still in progress
      timeoutRef.current && clearTimeout(timeoutRef.current);
      recordingRef.current?.cancel().catch(() => {});
    };
  }, []);

  // ── Stop listening and process ───────────────────────────────────────────────
  //
  // NOTE: voiceState is intentionally NOT checked here (stale-closure bug avoidance).
  // recordingRef.current is a ref — always fresh — safe to use as the guard.
  const stopListening = useCallback(async () => {
    timeoutRef.current && clearTimeout(timeoutRef.current);
    timeoutRef.current = null;

    if (!recordingRef.current || stoppingRef.current) return;
    stoppingRef.current = true;
    const session   = sessionRef.current;
    const live      = () => session === sessionRef.current;
    const recording = recordingRef.current;

    setVoiceState('processing');

    let recordedUri: string | null = null;
    try {
      // Inside the try: a vibration that fails must not leave stoppingRef stuck.
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});

      const uri = await recording.stopAndUnload();
      recordedUri = uri;

      await applyAudioMode({ allowsRecording: false });
      if (!live()) return;   // cancelled while stopping: no recognition, no answer

      const result = USE_MOCK_STT
        ? await mockRecognizeAmharicAnswer()
        : await recognizeAmharicAnswer(uri, STT_ENCODING, STT_SAMPLE_RATE);
      if (!live()) return;   // cancelled while recognizing: this answer is stale

      setLastResult(result);
      recordingRef.current = null;

      if (result.isRecognized && result.answer !== null) {
        setVoiceState('done');
        onAnswer(result.answer);
      } else {
        setVoiceState('failed');
        onAnswer(null);
      }

    } catch (error) {
      if (!live()) return;   // the session is over: nobody is waiting for this
      console.error('[Voice] STT error:', error);
      reportError('recording', 'stopListening', error);
      recordingRef.current = null;
      setVoiceState('failed');
      onAnswer(null);
    } finally {
      if (live()) stoppingRef.current = false;   // a cancel already reset it for the new session
      // The recording was only needed for the recognition request above; don't
      // leave one small file behind per spoken answer.
      if (recordedUri) FileSystem.deleteAsync(recordedUri, { idempotent: true }).catch(() => {});
    }
  }, [onAnswer]);

  // Keep the ref in sync so silence-detection always calls the latest version
  useEffect(() => {
    stopListeningRef.current = stopListening;
  }, [stopListening]);

  // ── Start listening ──────────────────────────────────────────────────────────
  const startListening = useCallback(async () => {
    if (voiceState !== 'idle' && voiceState !== 'failed') return;
    const session = ++sessionRef.current;
    const live    = () => session === sessionRef.current;

    try {
      if (!hasPermission) {
        const { granted } = await requestRecordingPermissionsAsync();
        setHasPermission(granted);
        if (!live()) return;   // cancelled while the permission dialog was open
        if (!granted) {
          console.warn('[Voice] Microphone permission denied');
          setVoiceState('failed');
          onAnswer(null);
          return;
        }
      }

      setVoiceState('listening');
      // A vibration that fails is no reason not to listen.
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});

      await applyAudioMode({ allowsRecording: true });
      if (!live()) {
        await applyAudioMode({ allowsRecording: false }).catch(() => {});
        return;
      }

      // ── Silence detection state (local to this recording session) ─────────
      const recordingStartTime = Date.now();
      let hasSpeechStarted     = false;
      let silenceStartTime: number | null = null;

      const onStatus = (status: RecordingTick) => {
        if (!live() || !status.isRecording) return;

        // Wait minimum time before firing (avoids stopping on initial silence)
        const elapsed = Date.now() - recordingStartTime;
        if (elapsed < MIN_RECORDING_MS) return;

        const level = status.metering;

        if (level > SILENCE_THRESHOLD_DB) {
          // User is speaking
          hasSpeechStarted = true;
          silenceStartTime = null;
        } else if (hasSpeechStarted) {
          // Speech was detected, now silence
          if (silenceStartTime === null) {
            silenceStartTime = Date.now();
          } else if (Date.now() - silenceStartTime >= SILENCE_DURATION_MS) {
            // Enough silence — auto-stop immediately
            console.log('[Voice] Silence detected → auto-stop');
            stopListeningRef.current();
          }
        }
      };

      // Start recording with status callback and fast poll interval
      const recording = await ActiveRecording.start(onStatus, STATUS_INTERVAL_MS);
      if (!live()) {
        // Cancelled while the microphone was starting: switch it straight off.
        await recording.cancel().catch(() => {});
        await applyAudioMode({ allowsRecording: false }).catch(() => {});
        return;
      }
      recordingRef.current = recording;

      // Hard fallback timeout — fires even if silence detection never triggers
      timeoutRef.current = setTimeout(() => {
        stopListeningRef.current();
      }, MAX_RECORDING_SECONDS * 1000);

    } catch (error) {
      if (!live()) return;   // the session is over: nobody is waiting for this
      console.error('[Voice] Failed to start recording:', error);
      reportError('recording', 'startListening', error);
      setVoiceState('failed');
      onAnswer(null);
    }
  }, [voiceState, hasPermission, onAnswer]);

  // ── Cancel ───────────────────────────────────────────────────────────────────
  const cancelListening = useCallback(async () => {
    // Ends this session: a start or a stop still waiting will see it and stop.
    sessionRef.current++;
    stoppingRef.current = false;
    timeoutRef.current && clearTimeout(timeoutRef.current);

    if (recordingRef.current) {
      try {
        await recordingRef.current.cancel();
        await applyAudioMode({ allowsRecording: false });
      } catch {
        // Ignore cleanup errors
      }
      recordingRef.current = null;
    }

    setVoiceState('idle');
  }, []);

  return {
    voiceState,
    startListening,
    stopListening,
    cancelListening,
    hasPermission,
    lastResult,
  };
}
