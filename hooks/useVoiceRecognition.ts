/**
 * AGENT 4 — hooks/useVoiceRecognition.ts
 * Voice recognition hook for Engine A.
 *
 * State machine:
 *   idle → listening → processing → done (answer) | failed (no answer)
 *
 * Auto-stop recording after 5 seconds.
 * Falls back to tap if STT not available or fails.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { Audio } from 'expo-av';
import * as Haptics from 'expo-haptics';
import {
  recognizeAmharicAnswer,
  mockRecognizeAmharicAnswer,
  STTResult,
} from '../services/speechRecognition';
import { VoiceButtonState } from '../components/engineA/VoiceAnswerButton';

// ─── Config ───────────────────────────────────────────────────────────────────

const MAX_RECORDING_SECONDS = 5;
const USE_MOCK_STT = !process.env.EXPO_PUBLIC_GOOGLE_STT_KEY;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface UseVoiceRecognitionReturn {
  /** Current state */
  voiceState: VoiceButtonState;
  /** Start recording */
  startListening: () => Promise<void>;
  /** Stop recording and process */
  stopListening: () => Promise<void>;
  /** Cancel recording without processing */
  cancelListening: () => Promise<void>;
  /** Whether mic permission is granted */
  hasPermission: boolean;
  /** Last STT result */
  lastResult: STTResult | null;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useVoiceRecognition(
  onAnswer: (answerIndex: number | null) => void
): UseVoiceRecognitionReturn {
  const [voiceState,    setVoiceState]    = useState<VoiceButtonState>('idle');
  const [hasPermission, setHasPermission] = useState(false);
  const [lastResult,    setLastResult]    = useState<STTResult | null>(null);

  const recordingRef = useRef<Audio.Recording | null>(null);
  const timeoutRef   = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  // ── Start listening ──────────────────────────────────────────────────────────
  const startListening = useCallback(async () => {
    if (voiceState !== 'idle' && voiceState !== 'failed') return;

    try {
      // Request permission if needed
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

      // Configure audio session for recording
      await Audio.setAudioModeAsync({
        allowsRecordingIOS:  true,
        playsInSilentModeIOS: true,
      });

      // Start recording
      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );
      recordingRef.current = recording;

      // Auto-stop after MAX_RECORDING_SECONDS
      timeoutRef.current = setTimeout(() => {
        stopListening();
      }, MAX_RECORDING_SECONDS * 1000);

    } catch (error) {
      console.error('[Voice] Failed to start recording:', error);
      setVoiceState('failed');
      onAnswer(null);
    }
  }, [voiceState, hasPermission, onAnswer]);

  // ── Stop listening and process ───────────────────────────────────────────────
  const stopListening = useCallback(async () => {
    timeoutRef.current && clearTimeout(timeoutRef.current);
    timeoutRef.current = null;

    if (!recordingRef.current || voiceState !== 'listening') return;

    setVoiceState('processing');
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    try {
      await recordingRef.current.stopAndUnloadAsync();

      // Restore audio mode for playback
      await Audio.setAudioModeAsync({
        allowsRecordingIOS:  false,
        playsInSilentModeIOS: true,
      });

      const uri = recordingRef.current.getURI();
      if (!uri) throw new Error('No recording URI');

      // Send to STT
      const result = USE_MOCK_STT
        ? await mockRecognizeAmharicAnswer()
        : await recognizeAmharicAnswer(uri);

      setLastResult(result);
      recordingRef.current = null;

      if (result.isRecognized && result.answer !== null) {
        setVoiceState('done');
        onAnswer(result.answer);
      } else {
        setVoiceState('failed');
        onAnswer(null); // User must tap
      }

    } catch (error) {
      console.error('[Voice] STT error:', error);
      recordingRef.current = null;
      setVoiceState('failed');
      onAnswer(null);
    }
  }, [voiceState, onAnswer]);

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
