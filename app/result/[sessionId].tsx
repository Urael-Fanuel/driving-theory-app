/**
 * AGENT 3 — app/result/[sessionId].tsx
 * Shared Exam Result Screen — used by both Engine A and Engine B.
 *
 * Engine A: Shows large icons + numbers only (no text labels)
 * Engine B: Shows full text breakdown
 *
 * Params are passed via router params (stored in global ref).
 */

import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  Animated,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Colors } from '../../constants/colors';
import { Typography } from '../../constants/typography';
import { useEngine } from '../../contexts/EngineContext';
import { useAudio } from '../../hooks/useAudio';

// ─── Global result storage (passed from useExam) ──────────────────────────────
// In production, pass via expo-router params or AsyncStorage
export interface ResultData {
  score: number;
  total: number;
  passed: boolean;
  durationSeconds: number;
  topicBreakdown?: Record<string, { correct: number; total: number }>;
}

// Simple global store for exam result (avoids URL param length limits)
const resultStore = new Map<string, ResultData>();

export function storeExamResult(sessionId: string, data: ResultData) {
  resultStore.set(sessionId, data);
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ResultScreen() {
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();
  const router        = useRouter();
  const { engineType } = useEngine();
  const { playAudio }  = useAudio();

  const result = resultStore.get(sessionId);

  // Fallback sample data if result not found (e.g. after hot reload)
  const score    = result?.score   ?? 0;
  const total    = result?.total   ?? 30;
  const passed   = result?.passed  ?? false;
  const duration = result?.durationSeconds ?? 0;

  const percent     = total > 0 ? Math.round((score / total) * 100) : 0;
  const isEngineA   = engineType === 'A';

  // Animations
  const scaleAnim  = useRef(new Animated.Value(0)).current;
  const fadeAnim   = useRef(new Animated.Value(0)).current;
  const slideAnim  = useRef(new Animated.Value(40)).current;

  useEffect(() => {
    // Haptic + audio feedback
    Haptics.notificationAsync(
      passed
        ? Haptics.NotificationFeedbackType.Success
        : Haptics.NotificationFeedbackType.Error
    );

    // Play result audio
    if (passed) {
      playAudio('assets/audio/exam_passed.mp3').catch(() => {});
    } else {
      playAudio('assets/audio/exam_failed.mp3').catch(() => {});
    }

    // Staggered entrance animations
    Animated.stagger(100, [
      Animated.spring(scaleAnim, { toValue: 1, speed: 10, bounciness: 12, useNativeDriver: true }),
      Animated.timing(fadeAnim,  { toValue: 1, duration: 400, useNativeDriver: true }),
      Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, speed: 12 }),
    ]).start();
  }, []);

  const handleGoHome = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (isEngineA) {
      router.replace('/(engineA)/home');
    } else {
      router.replace('/(engineB)/home');
    }
  };

  const handleRetry = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (isEngineA) {
      router.replace('/(engineA)/exam');
    } else {
      router.replace('/(engineB)/exam');
    }
  };

  const minutes = Math.floor(duration / 60);
  const seconds = duration % 60;

  const bgColor = passed ? Colors.correctDark : Colors.wrongDark;
  const accentColor = passed ? Colors.correct : Colors.wrong;

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: Colors.background }]}>
      <ScrollView contentContainerStyle={styles.content}>
        {/* Result icon + score */}
        <Animated.View
          style={[styles.heroContainer, { transform: [{ scale: scaleAnim }] }]}
        >
          <View style={[styles.scoreCircle, { borderColor: accentColor, backgroundColor: bgColor }]}>
            <Text style={styles.resultEmoji}>
              {passed ? '🏆' : '📚'}
            </Text>
            <Text style={[styles.scoreText, { color: accentColor }]}>
              {score}/{total}
            </Text>
            {!isEngineA && (
              <Text style={styles.percentText}>{percent}%</Text>
            )}
          </View>
        </Animated.View>

        {/* Pass/fail label — Engine B only */}
        {!isEngineA && (
          <Animated.Text
            style={[
              styles.resultLabel,
              { color: accentColor, opacity: fadeAnim },
            ]}
          >
            {passed ? 'ፈተናው ተሳክቷል! ✅' : 'ዳግም ሞክር 📖'}
          </Animated.Text>
        )}

        {/* Stats — Engine B shows text, Engine A shows icons */}
        <Animated.View
          style={[
            styles.statsContainer,
            {
              opacity:   fadeAnim,
              transform: [{ translateY: slideAnim }],
            },
          ]}
        >
          {/* Score stat */}
          <View style={styles.statCard}>
            <Text style={styles.statIcon}>✅</Text>
            <Text style={styles.statValue}>{score}</Text>
            {!isEngineA && <Text style={styles.statLabel}>ትክክል</Text>}
          </View>

          {/* Wrong stat */}
          <View style={styles.statCard}>
            <Text style={styles.statIcon}>❌</Text>
            <Text style={styles.statValue}>{total - score}</Text>
            {!isEngineA && <Text style={styles.statLabel}>ስህተት</Text>}
          </View>

          {/* Time stat */}
          <View style={styles.statCard}>
            <Text style={styles.statIcon}>⏱</Text>
            <Text style={styles.statValue}>
              {minutes}:{seconds.toString().padStart(2, '0')}
            </Text>
            {!isEngineA && <Text style={styles.statLabel}>ጊዜ</Text>}
          </View>
        </Animated.View>

        {/* Topic breakdown — Engine B only */}
        {!isEngineA && result?.topicBreakdown && (
          <Animated.View style={[styles.breakdownContainer, { opacity: fadeAnim }]}>
            <Text style={styles.breakdownTitle}>በርዕስ ጉዳይ</Text>
            {Object.entries(result.topicBreakdown).map(([topicId, stats]) => (
              <View key={topicId} style={styles.breakdownRow}>
                <Text style={styles.breakdownTopic}>{topicId}</Text>
                <Text style={[
                  styles.breakdownScore,
                  { color: (stats.correct / stats.total) >= 0.8 ? Colors.correct : Colors.wrong }
                ]}>
                  {stats.correct}/{stats.total}
                </Text>
              </View>
            ))}
          </Animated.View>
        )}

        {/* Action buttons */}
        <Animated.View style={[styles.actions, { opacity: fadeAnim }]}>
          <TouchableOpacity
            style={[styles.actionBtn, styles.retryBtn]}
            onPress={handleRetry}
            activeOpacity={0.85}
          >
            <Text style={styles.actionIcon}>🔄</Text>
            {!isEngineA && (
              <Text style={styles.actionText}>ዳግም ሞክር</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionBtn, styles.homeBtn]}
            onPress={handleGoHome}
            activeOpacity={0.85}
          >
            <Text style={styles.actionIcon}>🏠</Text>
            {!isEngineA && (
              <Text style={styles.actionText}>ቤት</Text>
            )}
          </TouchableOpacity>
        </Animated.View>
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  content: {
    padding:    24,
    alignItems: 'center',
    gap:        24,
  },
  heroContainer: {
    marginTop: 20,
  },
  scoreCircle: {
    width:           200,
    height:          200,
    borderRadius:    100,
    borderWidth:     6,
    justifyContent:  'center',
    alignItems:      'center',
    gap:             4,
  },
  resultEmoji: {
    fontSize: 48,
  },
  scoreText: {
    fontSize:   36,
    fontWeight: '900',
  },
  percentText: {
    ...Typography.h3,
    color: Colors.textSecondary,
  },
  resultLabel: {
    ...Typography.h2,
    textAlign: 'center',
  },
  statsContainer: {
    flexDirection: 'row',
    gap:           12,
    alignSelf:     'stretch',
    justifyContent: 'center',
  },
  statCard: {
    flex:            1,
    backgroundColor: Colors.card,
    borderRadius:    16,
    padding:         16,
    alignItems:      'center',
    gap:             6,
    maxWidth:        100,
  },
  statIcon: {
    fontSize: 28,
  },
  statValue: {
    ...Typography.h3,
    color: Colors.textPrimary,
  },
  statLabel: {
    ...Typography.caption,
    color: Colors.textSecondary,
  },
  breakdownContainer: {
    alignSelf:       'stretch',
    backgroundColor: Colors.card,
    borderRadius:    16,
    padding:         16,
    gap:             10,
  },
  breakdownTitle: {
    ...Typography.body,
    color:      Colors.textPrimary,
    fontWeight: '700',
    marginBottom: 4,
  },
  breakdownRow: {
    flexDirection:  'row',
    justifyContent: 'space-between',
    alignItems:     'center',
  },
  breakdownTopic: {
    ...Typography.bodySmall,
    color: Colors.textSecondary,
    flex:  1,
  },
  breakdownScore: {
    ...Typography.body,
    fontWeight: '700',
  },
  actions: {
    flexDirection:  'row',
    gap:            12,
    alignSelf:      'stretch',
    marginTop:      8,
  },
  actionBtn: {
    flex:            1,
    flexDirection:   'row',
    alignItems:      'center',
    justifyContent:  'center',
    borderRadius:    16,
    paddingVertical: 18,
    gap:             10,
  },
  retryBtn: {
    backgroundColor: Colors.card,
    borderWidth:     1,
    borderColor:     Colors.border,
  },
  homeBtn: {
    backgroundColor: Colors.primary,
  },
  actionIcon: {
    fontSize: 26,
  },
  actionText: {
    ...Typography.answer,
    color:      Colors.textPrimary,
    fontWeight: '700',
  },
});
