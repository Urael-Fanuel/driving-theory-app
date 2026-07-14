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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '../../constants/colors';
import { Typography } from '../../constants/typography';
import { AudioButton } from '../shared/AudioButton';
import { speakAndAwait, stopTTS } from '../../utils/googleTTS';
import { fetchWrongAnswerExplanation, RagQuery } from '../../utils/ragExplain';

// ─── Types ────────────────────────────────────────────────────────────────────

interface TextFeedbackProps {
  isCorrect: boolean;
  explanationText: string;
  explanationAudioUri?: string;
  /** Amharic text to auto-play via TTS on mount (used by behavioral subtopics) */
  ttsText?: string;
  /** When provided on a wrong answer — shows a "ለምን?" button that fetches a
   *  RAG-grounded explanation of why the chosen answer is wrong. */
  ragQuery?: RagQuery;
  onNext: () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function TextFeedback({
  isCorrect,
  explanationText,
  explanationAudioUri,
  ttsText,
  ragQuery,
  onNext,
}: TextFeedbackProps) {
  const slideAnim = useRef(new Animated.Value(100)).current;
  const fadeAnim  = useRef(new Animated.Value(0)).current;
  const insets    = useSafeAreaInsets();

  // ── "ለምን?" (why?) RAG explanation state ──────────────────────────────────
  const [ragLoading,     setRagLoading]     = useState(false);
  const [ragExplanation, setRagExplanation] = useState<string | null>(null);
  const [ragFailed,      setRagFailed]      = useState(false);
  const [ragSpeaking,    setRagSpeaking]    = useState(false);
  const ragSpeakingRef = useRef(false);
  const mountedRef     = useRef(true);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
      if (ragSpeakingRef.current) stopTTS().catch(() => {});
    };
  }, []);

  const handleExplainWhy = async () => {
    if (!ragQuery || ragLoading) return;
    setRagLoading(true);
    setRagFailed(false);
    const explanation = await fetchWrongAnswerExplanation(ragQuery);
    if (!mountedRef.current) return;
    setRagLoading(false);
    if (explanation) setRagExplanation(explanation);
    else setRagFailed(true);
  };

  const handleRagSpeak = async () => {
    if (!ragExplanation) return;
    if (ragSpeakingRef.current) {
      ragSpeakingRef.current = false;
      setRagSpeaking(false);
      await stopTTS();
      return;
    }
    ragSpeakingRef.current = true;
    setRagSpeaking(true);
    await speakAndAwait(ragExplanation.slice(0, 950));
    ragSpeakingRef.current = false;
    if (mountedRef.current) setRagSpeaking(false);
  };

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
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.content, { paddingBottom: Math.max(24, insets.bottom + 16) }]}
      >
        {/* Result title */}
        <Text style={[styles.resultTitle, { color: titleColor }]}>
          {resultTitle}
        </Text>

        {/* Explanation text */}
        {!!explanationText && (
          <Text style={styles.explanationText}>
            {explanationText}
          </Text>
        )}

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

        {/* "ለምን?" — RAG explanation for wrong answers */}
        {!isCorrect && ragQuery && !ragExplanation && (
          <TouchableOpacity
            style={[styles.whyButton, ragLoading && styles.whyButtonLoading]}
            onPress={handleExplainWhy}
            disabled={ragLoading}
            activeOpacity={0.8}
            accessibilityLabel="ለምን እንደተሳሳትኩ አስረዳኝ"
            accessibilityRole="button"
          >
            <Text style={styles.whyButtonText}>
              {ragLoading ? '⏳ እያዘጋጀ ነው...' : ragFailed ? '🔄 ደግመው ይሞክሩ' : '🤔 ለምን? አስረዳኝ'}
            </Text>
          </TouchableOpacity>
        )}

        {ragExplanation && (
          <View style={styles.ragCard}>
            <Text style={styles.ragText}>{ragExplanation}</Text>
            <TouchableOpacity
              style={styles.ragSpeakBtn}
              onPress={handleRagSpeak}
              activeOpacity={0.8}
              accessibilityLabel="ማብራሪያ ድምጽ"
              accessibilityRole="button"
            >
              <Text style={styles.ragSpeakIcon}>{ragSpeaking ? '⏸' : '🔊'}</Text>
            </TouchableOpacity>
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
  whyButton: {
    backgroundColor:   '#1565C0',
    borderRadius:      16,
    paddingVertical:   12,
    paddingHorizontal: 28,
    alignItems:        'center',
  },
  whyButtonLoading: {
    opacity: 0.6,
  },
  whyButtonText: {
    ...Typography.answer,
    color:      '#ffffff',
    fontWeight: '700',
  },
  ragCard: {
    backgroundColor: '#E3F2FD',
    borderRadius:    16,
    padding:         16,
    gap:             12,
    alignSelf:       'stretch',
    alignItems:      'center',
  },
  ragText: {
    ...Typography.body,
    color:      Colors.textPrimary,
    textAlign:  'center',
    lineHeight: 30,
  },
  ragSpeakBtn: {
    width:           48,
    height:          48,
    borderRadius:    24,
    backgroundColor: '#1565C0',
    justifyContent:  'center',
    alignItems:      'center',
  },
  ragSpeakIcon: {
    fontSize: 22,
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
