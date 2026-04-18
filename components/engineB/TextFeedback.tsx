/**
 * AGENT 3 — components/engineB/TextFeedback.tsx
 * Written + audio feedback for Engine B after answering a question.
 *
 * Shows:
 * - ✅ / ❌ icon
 * - Amharic explanation text
 * - Audio button to hear explanation
 * - Next button
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  ScrollView,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { Colors } from '../../constants/colors';
import { Typography } from '../../constants/typography';
import { AudioButton } from '../shared/AudioButton';
import { speakAndAwait, stopTTS } from '../../utils/googleTTS';

// ─── Types ────────────────────────────────────────────────────────────────────

interface TextFeedbackProps {
  isCorrect: boolean;
  explanationText: string;
  explanationAudioUri?: string;
  /** Amharic text to auto-play via TTS on mount (used by behavioral subtopics) */
  ttsText?: string;
  onNext: () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function TextFeedback({
  isCorrect,
  explanationText,
  explanationAudioUri,
  ttsText,
  onNext,
}: TextFeedbackProps) {
  const slideAnim = useRef(new Animated.Value(100)).current;
  const fadeAnim  = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Haptic
    Haptics.notificationAsync(
      isCorrect
        ? Haptics.NotificationFeedbackType.Success
        : Haptics.NotificationFeedbackType.Error
    );

    // Slide up animation
    Animated.parallel([
      Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, speed: 15 }),
      Animated.timing(fadeAnim,  { toValue: 1, duration: 250, useNativeDriver: true }),
    ]).start();

    // Auto-play TTS feedback (behavioral subtopics)
    if (ttsText) {
      speakAndAwait(ttsText).catch(() => {});
    }

    return () => {
      if (ttsText) stopTTS().catch(() => {});
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const bgColor       = isCorrect ? Colors.correctDark  : Colors.wrongDark;
  const borderColor   = isCorrect ? Colors.correct       : Colors.wrong;
  const resultTitle   = isCorrect ? 'ትክክል ነው! ✅'      : 'ትክክል አይደለም ❌';
  const titleColor    = isCorrect ? Colors.correct        : Colors.wrong;

  return (
    <Animated.View
      style={[
        styles.container,
        {
          backgroundColor: bgColor,
          borderTopColor:  borderColor,
          transform:       [{ translateY: slideAnim }],
          opacity:         fadeAnim,
        },
      ]}
    >
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        {/* Result title */}
        <Text style={[styles.resultTitle, { color: titleColor }]}>
          {resultTitle}
        </Text>

        {/* Explanation text */}
        <Text style={styles.explanationText}>
          {explanationText}
        </Text>

        {/* Audio button */}
        {explanationAudioUri && (
          <View style={styles.audioRow}>
            <AudioButton
              audioUri={explanationAudioUri}
              size={52}
              label="ማብራሪያ ድምጽ"
            />
          </View>
        )}

        {/* Next button */}
        <TouchableOpacity
          style={[styles.nextButton, { borderColor }]}
          onPress={onNext}
          activeOpacity={0.8}
          accessibilityLabel="ቀጣይ ጥያቄ"
          accessibilityRole="button"
        >
          <Text style={[styles.nextButtonText, { color: borderColor }]}>
            ቀጣይ ›
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </Animated.View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    position:      'absolute',
    bottom:        0,
    left:          0,
    right:         0,
    maxHeight:     '60%',
    borderTopWidth: 3,
    borderRadius:  24,
    shadowColor:   '#000',
    shadowOffset:  { width: 0, height: -4 },
    shadowOpacity: 0.3,
    shadowRadius:  12,
    elevation:     16,
  },
  content: {
    padding:   24,
    gap:       16,
    alignItems: 'center',
  },
  resultTitle: {
    ...Typography.h2,
    textAlign: 'center',
  },
  explanationText: {
    ...Typography.body,
    color:     Colors.textPrimary,
    textAlign: 'center',
    lineHeight: 32,
  },
  audioRow: {
    alignItems: 'center',
  },
  nextButton: {
    borderWidth:     2,
    borderRadius:    16,
    paddingVertical: 14,
    paddingHorizontal: 40,
    alignSelf:       'stretch',
    alignItems:      'center',
    marginTop:       8,
  },
  nextButtonText: {
    ...Typography.answer,
    fontWeight: '700',
  },
});
