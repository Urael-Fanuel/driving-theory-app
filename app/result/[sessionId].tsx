/**
 * app/result/[sessionId].tsx
 * Shared Exam Result Screen — used by both Engine A and Engine B.
 *
 * Engine A: Shows large icons + numbers only (no text labels)
 * Engine B: Shows full text breakdown
 *
 * Params are passed via router params (stored in global ref).
 */

import React, { useEffect, useRef, useState } from 'react';

// ─── Audio base URL (Supabase Storage) ────────────────────────────────────────
const _AUDIO_BASE = (process.env.EXPO_PUBLIC_SUPABASE_URL ?? '') + '/storage/v1/object/public/audio';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  Animated,
  Image,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Colors } from '../../constants/colors';
import { Typography } from '../../constants/typography';
import { useEngine } from '../../contexts/EngineContext';
import { useAudio } from '../../hooks/useAudio';
import * as api from '../../backend/api';
import { DBSign } from '../../backend/supabaseClient';

// ─── Global result storage (passed from useExam) ──────────────────────────────
import { ResultData, WrongQuestion, getExamResult } from '../../utils/examResult';
export type { ResultData };
export { storeExamResult } from '../../utils/examResult';

// ─── Component ────────────────────────────────────────────────────────────────

export default function ResultScreen() {
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();
  const router        = useRouter();
  const { engineType } = useEngine();
  const { playAudio }  = useAudio();

  const { score: sParam, total: tParam, passed: pParam, duration: dParam } =
    useLocalSearchParams<{ sessionId: string; score: string; total: string; passed: string; duration: string }>();

  const result = getExamResult(sessionId);

  // URL params are the primary source (reliable across navigation).
  // Map store is a fallback (may be empty after hot-reload).
  const score    = result?.score            ?? (sParam ? parseInt(sParam, 10) : 0);
  const total    = result?.total            ?? (tParam ? parseInt(tParam, 10) : 30);
  const passed   = result?.passed           ?? (pParam === '1');
  const duration = result?.durationSeconds  ?? (dParam ? parseInt(dParam, 10) : 0);

  const wrongQuestions: WrongQuestion[] = result?.wrongQuestions ?? [];

  const percent   = total > 0 ? Math.round((score / total) * 100) : 0;
  const isEngineA = engineType === 'A';

  // ── Load sign images for wrong questions ───────────────────────────────────
  const [weakSigns, setWeakSigns] = useState<DBSign[]>([]);

  useEffect(() => {
    if (!wrongQuestions.length) return;
    api.getAllSigns()
      .then(allSigns => {
        // Get unique signs that appear in wrong questions, preserve order
        const signIds = [...new Set(wrongQuestions.map(q => q.signId))];
        const found   = signIds
          .map(id => allSigns.find(s => s.id === id))
          .filter(Boolean) as DBSign[];
        setWeakSigns(found);
      })
      .catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Animations ─────────────────────────────────────────────────────────────
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
      playAudio(`${_AUDIO_BASE}/exam_passed.mp3`).catch(() => {});
    } else {
      playAudio(`${_AUDIO_BASE}/exam_failed.mp3`).catch(() => {});
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

  const handlePracticeWeak = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    // Pass wrong question IDs as a comma-separated URL param
    const ids = wrongQuestions.map(q => q.questionId).join(',');
    if (isEngineA) {
      router.push(`/(engineA)/practice?ids=${ids}` as any);
    } else {
      router.push(`/(engineB)/practice?ids=${ids}` as any);
    }
  };

  const minutes = Math.floor(duration / 60);
  const seconds = duration % 60;

  const bgColor    = passed ? Colors.correctDark : Colors.wrongDark;
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

        {/* ── Weak signs section — shown when user got questions wrong ── */}
        {weakSigns.length > 0 && (
          <Animated.View style={[styles.weakContainer, { opacity: fadeAnim }]}>
            {/* Header */}
            <View style={styles.weakHeader}>
              <Text style={styles.weakIcon}>⚠️</Text>
              {!isEngineA && (
                <Text style={styles.weakTitle}>የተሳሳቱ ምልክቶች</Text>
              )}
            </View>

            {/* Sign thumbnails grid */}
            <View style={styles.weakGrid}>
              {weakSigns.map(sign => (
                <View key={sign.id} style={styles.weakSignCard}>
                  {sign.image_url ? (
                    <Image
                      source={{ uri: sign.image_url }}
                      style={styles.weakSignImage}
                      resizeMode="contain"
                    />
                  ) : (
                    <View style={[styles.weakSignImage, styles.weakSignPlaceholder]}>
                      <Text style={styles.weakSignPlaceholderText}>🚦</Text>
                    </View>
                  )}
                  {!isEngineA && (
                    <Text style={styles.weakSignName} numberOfLines={2}>
                      {sign.name_amharic}
                    </Text>
                  )}
                </View>
              ))}
            </View>

            {/* Practice weak button */}
            <TouchableOpacity
              style={styles.practiceBtn}
              onPress={handlePracticeWeak}
              activeOpacity={0.85}
            >
              <Text style={styles.practiceIcon}>🔁</Text>
              {!isEngineA && (
                <Text style={styles.practiceText}>የተሳሳቱትን ለማሻሻል ይለማመዱ</Text>
              )}
            </TouchableOpacity>
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
    flexDirection:  'row',
    gap:            12,
    alignSelf:      'stretch',
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
    color:        Colors.textPrimary,
    fontWeight:   '700',
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

  // ── Weak signs section ─────────────────────────────────────────────────────
  weakContainer: {
    alignSelf:       'stretch',
    backgroundColor: Colors.card,
    borderRadius:    20,
    padding:         16,
    gap:             14,
    borderWidth:     1,
    borderColor:     Colors.wrong + '55',
  },
  weakHeader: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           8,
  },
  weakIcon: {
    fontSize: 22,
  },
  weakTitle: {
    ...Typography.body,
    color:      Colors.textPrimary,
    fontWeight: '700',
  },
  weakGrid: {
    flexDirection:  'row',
    flexWrap:       'wrap',
    gap:            10,
    justifyContent: 'flex-start',
  },
  weakSignCard: {
    alignItems: 'center',
    gap:        6,
    width:      72,
  },
  weakSignImage: {
    width:           72,
    height:          72,
    borderRadius:    12,
    backgroundColor: '#FFFFFF',
  },
  weakSignPlaceholder: {
    justifyContent: 'center',
    alignItems:     'center',
  },
  weakSignPlaceholderText: {
    fontSize: 32,
  },
  weakSignName: {
    ...Typography.caption,
    color:     Colors.textSecondary,
    textAlign: 'center',
  },
  practiceBtn: {
    flexDirection:   'row',
    alignItems:      'center',
    justifyContent:  'center',
    backgroundColor: Colors.wrong,
    borderRadius:    14,
    paddingVertical: 14,
    gap:             10,
  },
  practiceIcon: {
    fontSize: 22,
  },
  practiceText: {
    ...Typography.body,
    color:      '#FFFFFF',
    fontWeight: '700',
  },

  // ── Action buttons ─────────────────────────────────────────────────────────
  actions: {
    flexDirection: 'row',
    gap:           12,
    alignSelf:     'stretch',
    marginTop:     8,
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
