/**
 * AGENT 3 — components/engineA/AudioFeedback.tsx
 * Full-screen feedback overlay for Engine A after answering a question.
 *
 * Layout (correct):
 * ┌─────────────────────┐
 * │  ✅ (large icon)    │  ← Green overlay
 * │                     │
 * │  Audio plays        │  ← Auto-plays explanation
 * │  explanation        │
 * │                     │
 * │  [Next →]           │  ← Button appears after audio
 * └─────────────────────┘
 *
 * NO TEXT shown to Engine A users — audio only.
 */

import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { Colors } from '../../constants/colors';
import { Typography } from '../../constants/typography';
import { useAudio } from '../../hooks/useAudio';

// ─── Types ────────────────────────────────────────────────────────────────────

interface AudioFeedbackProps {
  isCorrect: boolean;
  /** Audio file URI for the explanation */
  explanationAudioUri: string;
  /** Called when user taps Next */
  onNext: () => void;
  /** Auto-show next button after N ms (default: after audio) */
  autoAdvanceMs?: number;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function AudioFeedback({
  isCorrect,
  explanationAudioUri,
  onNext,
  autoAdvanceMs,
}: AudioFeedbackProps) {
  const { playAudio, audioState } = useAudio();
  const [showNext, setShowNext] = React.useState(false);
  const iconScale = useRef(new Animated.Value(0)).current;
  const fadeIn    = useRef(new Animated.Value(0)).current;

  // Play feedback audio and animate on mount
  useEffect(() => {
    // Haptic feedback
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

    // Play explanation audio
    const audioFile = explanationAudioUri;
    playAudio(audioFile).catch(() => {});

    // Show next button after auto-advance delay or after audio finishes
    if (autoAdvanceMs) {
      const t = setTimeout(() => setShowNext(true), autoAdvanceMs);
      return () => clearTimeout(t);
    }
  }, []);

  // Show next button when audio finishes
  useEffect(() => {
    if (audioState === 'finished' || audioState === 'error') {
      // Small delay so user sees the result before next appears
      const t = setTimeout(() => setShowNext(true), 800);
      return () => clearTimeout(t);
    }
  }, [audioState]);

  const bgColor = isCorrect ? Colors.overlayCorrect : Colors.overlayWrong;
  const icon    = isCorrect ? '✅' : '❌';

  return (
    <Animated.View style={[styles.overlay, { backgroundColor: bgColor, opacity: fadeIn }]}>
      <View style={styles.content}>
        {/* Large result icon */}
        <Animated.Text
          style={[styles.resultIcon, { transform: [{ scale: iconScale }] }]}
        >
          {icon}
        </Animated.Text>

        {/* Audio playing indicator */}
        {(audioState === 'playing' || audioState === 'loading') && (
          <Text style={styles.audioIndicator}>🔊</Text>
        )}

        {/* Next button */}
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
