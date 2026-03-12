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
import { Audio, RecordingStatus } from 'expo-av';
import { Platform } from 'react-native';
import * as Haptics from 'expo-haptics';
import {
  recognizeAmharicAnswer,
  mockRecognizeAmharicAnswer,
  STTResult,
} from '../services/speechRecognition';
import { VoiceButtonState } from '../components/engineA/VoiceAnswerButton';

// ─── Config ───────────────────────────────────────────────────────────────────

const MAX_RECORDING_SECONDS   = 5;    // Hard fallback timeout
const SILENCE_THRESHOLD_DB    = -45;  // dBFS — below this = silence
const SILENCE_DURATION_MS     = 600;  // ms of silence after speech → auto-stop
const MIN_RECORDING_MS        = 400;  // minimum recording before silence detection fires
const STATUS_INTERVAL_MS      = 80;   // metering poll interval (ms)

const USE_MOCK_STT = !process.env.EXPO_PUBLIC_GOOGLE_STT_KEY;

// Platform-appropriate encoding for Google STT
const STT_ENCODING:    'LINEAR16' | 'AMR_WB' = Platform.OS === 'android' ? 'AMR_WB' : 'LINEAR16';
const STT_SAMPLE_RATE: number                 = 16000;

// Custom recording options — produces audio Google STT can actually decode:
//   iOS     → .wav  LinearPCM 16 kHz mono  → LINEAR16
//   Android → .amr  AMR-WB   16 kHz mono   → AMR_WB
const RECORDING_OPTIONS: Audio.RecordingOptions = {
  isMeteringEnabled: true,   // ← MUST be true for silence detection
  android: {
    extension:        '.amr',
    outputFormat:     Audio.AndroidOutputFormat.AMR_WB,
    audioEncoder:     Audio.AndroidAudioEncoder.AMR_WB,
    sampleRate:       16000,
    numberOfChannels: 1,
    // bitRate intentionally omitted — AMR-WB has fixed internal bitrates
  },
  ios: {
    extension:            '.wav',
    outputFormat:         Audio.IOSOutputFormat.LINEARPCM,
    audioQuality:         Audio.IOSAudioQuality.HIGH,
    sampleRate:           16000,
    numberOfChannels:     1,
    bitRate:              128000,
    linearPCMBitDepth:    16,
    linearPCMIsBigEndian: false,
    linearPCMIsFloat:     false,
  },
  web: { mimeType: 'audio/webm', bitsPerSecond: 64000 },
};

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

  const recordingRef   = useRef<Audio.Recording | null>(null);
  const timeoutRef     = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Ref always pointing to the latest stopListening — used by the silence-detection
  // callback which is created inside startListening (can't close over fresh state).
  const stopListeningRef = useRef<() => Promise<void>>(async () => {});

  // ── Request mic permission on mount ─────────────────────────────────────────
  useEffect(() => {
    Audio.requestPermissionsAsync()
      .then(({ granted }) => setHasPermission(granted))
      .catch(() => setHasPermission(false));

    return () => {
      timeoutRef.current && clearTimeout(timeoutRef.current);
      recordingRef.current?.stopAndUnloadAsync().catch(() => {});
    };
  }, []);

  // ── Stop listening and process ───────────────────────────────────────────────
  //
  // NOTE: voiceState is intentionally NOT checked here (stale-closure bug avoidance).
  // recordingRef.current is a ref — always fresh — safe to use as the guard.
  const stopListening = useCallback(async () => {
    timeoutRef.current && clearTimeout(timeoutRef.current);
    timeoutRef.current = null;

    if (!recordingRef.current) return;

    setVoiceState('processing');
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    try {
      await recordingRef.current.stopAndUnloadAsync();

      await Audio.setAudioModeAsync({
        allowsRecordingIOS:   false,
        playsInSilentModeIOS: true,
      });

      const uri = recordingRef.current.getURI();
      if (!uri) throw new Error('No recording URI');

      const result = USE_MOCK_STT
        ? await mockRecognizeAmharicAnswer()
        : await recognizeAmharicAnswer(uri, STT_ENCODING, STT_SAMPLE_RATE);

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
      console.error('[Voice] STT error:', error);
      recordingRef.current = null;
      setVoiceState('failed');
      onAnswer(null);
    }
  }, [onAnswer]);

  // Keep the ref in sync so silence-detection always calls the latest version
  useEffect(() => {
    stopListeningRef.current = stopListening;
  }, [stopListening]);

  // ── Start listening ──────────────────────────────────────────────────────────
  const startListening = useCallback(async () => {
    if (voiceState !== 'idle' && voiceState !== 'failed') return;

    try {
      if (!hasPermission) {
        const { granted } = await Audio.requestPermissionsAsync();
        setHasPermission(granted);
        if (!granted) {
          console.warn('[Voice] Microphone permission denied');
          setVoiceState('failed');
          onAnswer(null);
          return;
        }
      }

      setVoiceState('listening');
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);

      await Audio.setAudioModeAsync({
        allowsRecordingIOS:   true,
        playsInSilentModeIOS: true,
      });

      // ── Silence detection state (local to this recording session) ─────────
      const recordingStartTime = Date.now();
      let hasSpeechStarted     = false;
      let silenceStartTime: number | null = null;

      const onStatus = (status: RecordingStatus) => {
        if (!status.isRecording) return;

        // Wait minimum time before firing (avoids stopping on initial silence)
        const elapsed = Date.now() - recordingStartTime;
        if (elapsed < MIN_RECORDING_MS) return;

        const level = status.metering ?? -160;

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
      const { recording } = await Audio.Recording.createAsync(
        RECORDING_OPTIONS,
        onStatus,
        STATUS_INTERVAL_MS,
      );
      recordingRef.current = recording;

      // Hard fallback timeout — fires even if silence detection never triggers
      timeoutRef.current = setTimeout(() => {
        stopListeningRef.current();
      }, MAX_RECORDING_SECONDS * 1000);

    } catch (error) {
      console.error('[Voice] Failed to start recording:', error);
      setVoiceState('failed');
      onAnswer(null);
    }
  }, [voiceState, hasPermission, onAnswer]);

  // ── Cancel ───────────────────────────────────────────────────────────────────
  const cancelListening = useCallback(async () => {
    timeoutRef.current && clearTimeout(timeoutRef.current);

    if (recordingRef.current) {
      try {
        await recordingRef.current.stopAndUnloadAsync();
        await Audio.setAudioModeAsync({ allowsRecordingIOS: false });
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
