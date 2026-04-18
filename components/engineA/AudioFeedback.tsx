/**
 * AGENT 3 — components/engineA/AudioFeedback.tsx
 * Full-screen feedback overlay for Engine A after answering a question.
 *
 * Layout:
 * ┌─────────────────────┐
 * │  ✅ / ❌            │  ← Large icon (green / red overlay)
 * │  🔊                 │  ← Audio playing indicator
 * │  [▶]               │  ← Next button (appears after audio ends)
 * └─────────────────────┘
 *
 * NO TEXT shown — Engine A users cannot read. Audio only.
 *
 * Two audio modes:
 *   explanationAudioUri  — pre-recorded URL (used by signs)
 *   ttsText              — Amharic text spoken via Google TTS (used by behavioral subtopics)
 * If both are provided, ttsText takes priority.
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { Colors } from '../../constants/colors';
import { useAudio } from '../../hooks/useAudio';
import { speakAndAwait } from '../../utils/googleTTS';

// ─── Types ────────────────────────────────────────────────────────────────────

interface AudioFeedbackProps {
  isCorrect: boolean;
  /** Pre-recorded audio URL (used by signs). Ignored when ttsText is provided. */
  explanationAudioUri: string;
  /** Amharic text to speak via Google TTS (used by behavioral subtopics). */
  ttsText?: string;
  /** Called when user taps Next */
  onNext: () => void;
  /** Auto-show next button after N ms (skips audio wait) */
  autoAdvanceMs?: number;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function AudioFeedback({
  isCorrect,
  explanationAudioUri,
  ttsText,
  onNext,
  autoAdvanceMs,
}: AudioFeedbackProps) {
  const { playAudio, audioState } = useAudio();
  const [showNext,    setShowNext]    = useState(false);
  const [ttsPlaying,  setTtsPlaying]  = useState(false);

  const iconScale = useRef(new Animated.Value(0)).current;
  const fadeIn    = useRef(new Animated.Value(0)).current;

  // ── Mount: haptic + entrance animation + audio ────────────────────────────
  useEffect(() => {
    // Haptic
    Haptics.notificationAsync(
      isCorrect
        ? Haptics.NotificationFeedbackType.Success
        : Haptics.NotificationFeedbackType.Error
    );

    // Entrance animation
    Animated.parallel([
      Animated.spring(iconScale, { toValue: 1, speed: 12, bounciness: 15, useNativeDriver: true }),
      Animated.timing(fadeIn,    { toValue: 1, duration: 300, useNativeDriver: true }),
    ]).start();

    if (autoAdvanceMs) {
      const t = setTimeout(() => setShowNext(true), autoAdvanceMs);
      return () => clearTimeout(t);
    }

    if (ttsText) {
      // TTS mode — speak the text, show next button when done
      setTtsPlaying(true);
      speakAndAwait(ttsText)
        .catch(() => {})
        .finally(() => {
          setTtsPlaying(false);
          setTimeout(() => setShowNext(true), 800);
        });
    } else {
      // URL mode — play pre-recorded audio (sign behaviour)
      playAudio(explanationAudioUri).catch(() => {});
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── URL mode: show next button when audio finishes ────────────────────────
  useEffect(() => {
    if (ttsText) return;  // TTS mode handles its own completion
    if (audioState === 'finished' || audioState === 'error') {
      const t = setTimeout(() => setShowNext(true), 800);
      return () => clearTimeout(t);
    }
  }, [audioState, ttsText]);

  const bgColor    = isCorrect ? Colors.overlayCorrect : Colors.overlayWrong;
  const icon       = isCorrect ? '✅' : '❌';
  const showSpeaker = ttsText
    ? ttsPlaying
    : (audioState === 'playing' || audioState === 'loading');

  return (
    <Animated.View style={[styles.overlay, { backgroundColor: bgColor, opacity: fadeIn }]}>
      <View style={styles.content}>

        {/* Large result icon */}
        <Animated.Text style={[styles.resultIcon, { transform: [{ scale: iconScale }] }]}>
          {icon}
        </Animated.Text>

        {/* Audio playing indicator */}
        {showSpeaker && (
          <Text style={styles.audioIndicator}>🔊</Text>
        )}

        {/* Next button — appears after audio ends */}
        {showNext && (
          <TouchableOpacity
            style={styles.nextButton}
            onPress={onNext}
            activeOpacity={0.8}
            accessibilityLabel="ቀጣይ"
            accessibilityRole="button"
          >
            <Text style={styles.nextIcon}>▶</Text>
          </TouchableOpacity>
        )}

      </View>
    </Animated.View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems:     'center',
    zIndex:         100,
  },
  content: {
    alignItems: 'center',
    gap:        24,
  },
  resultIcon: {
    fontSize: 100,
  },
  audioIndicator: {
    fontSize: 48,
    opacity:  0.8,
  },
  nextButton: {
    width:           80,
    height:          80,
    borderRadius:    40,
    backgroundColor: Colors.background,
    justifyContent:  'center',
    alignItems:      'center',
    shadowColor:     '#000',
    shadowOffset:    { width: 0, height: 4 },
    shadowOpacity:   0.3,
    shadowRadius:    8,
    elevation:       6,
  },
  nextIcon: {
    fontSize: 36,
    color:    Colors.textPrimary,
  },
});
