/**
 * components/shared/QuizReview.tsx
 *
 * The end-of-quiz review: score per topic (Engine B, text), the signs / questions answered wrong
 * (tap a sign to study it), and "practise the ones you got wrong". Engine A gets the same parts
 * with symbols only, no text.
 *
 * Moved out of app/result/[sessionId].tsx unchanged (2026-10-27) so the daily quiz can end with
 * exactly the same review as the 30-question exam (owner's request) without a second copy.
 */
import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, Image, StyleSheet, Animated } from 'react-native';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import * as api from '../../backend/api';
import { DBSign } from '../../backend/supabaseClient';
import type { WrongQuestion } from '../../utils/examResult';
import { TOPIC_NAMES } from '../../constants/topicNames';
import { Colors } from '../../constants/colors';
import { Typography } from '../../constants/typography';

interface QuizReviewProps {
  isEngineA: boolean;
  /** topic id -> correct / total. Shown in Engine B only. */
  topicBreakdown?: Record<string, { correct: number; total: number }>;
  wrongQuestions: WrongQuestion[];
  /** Fade-in of the screen that shows it (1 = no animation). */
  opacity?: Animated.Value | number;
  /** Stops the screen's audio before leaving for a sign or for practice. */
  beforeLeave: () => Promise<void>;
}

export function QuizReview({ isEngineA, topicBreakdown, wrongQuestions, opacity = 1, beforeLeave }: QuizReviewProps) {
  const router = useRouter();

  // Sign images for the wrong sign questions
  const [weakSigns, setWeakSigns] = useState<DBSign[]>([]);

  // Wrong questions split by type
  const signWrongQuestions       = wrongQuestions.filter(q => q.signId);
  const behavioralWrongQuestions = wrongQuestions.filter(q => !q.signId);

  useEffect(() => {
    if (!signWrongQuestions.length) return;
    api.getAllSigns()
      .then(allSigns => {
        const signIds = [...new Set(signWrongQuestions.map(q => q.signId))];
        const found   = signIds
          .map(id => allSigns.find(s => s.id === id))
          .filter(Boolean) as DBSign[];
        setWeakSigns(found);
      })
      .catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSignPress = async (signId: string) => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await beforeLeave();
    if (isEngineA) {
      router.push(`/(engineA)/sign/${signId}` as any);
    } else {
      router.push(`/(engineB)/sign/${signId}` as any);
    }
  };

  const handlePracticeWeak = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await beforeLeave();
    // Pass wrong question IDs as a comma-separated URL param
    const ids = wrongQuestions.map(q => q.questionId).join(',');
    if (isEngineA) {
      router.push(`/(engineA)/practice?ids=${ids}` as any);
    } else {
      router.push(`/(engineB)/practice?ids=${ids}` as any);
    }
  };

  return (
    <>
      {/* Topic breakdown — Engine B only */}
      {!isEngineA && topicBreakdown && (
        <Animated.View style={[styles.breakdownContainer, { opacity }]}>
          <Text style={styles.breakdownTitle}>በርዕስ ጉዳይ</Text>
          {Object.entries(topicBreakdown).map(([topicId, stats]) => (
            <View key={topicId} style={styles.breakdownRow}>
              <Text style={styles.breakdownTopic}>{TOPIC_NAMES[topicId] ?? topicId}</Text>
              <View style={styles.breakdownScoreRow}>
                <Text style={[styles.breakdownScore, { color: '#2E7D32' }]}>
                  {stats.correct}
                </Text>
                <Text style={[styles.breakdownScore, {
                  color: stats.correct < stats.total ? '#C62828' : '#2E7D32',
                }]}>
                  /{stats.total}
                </Text>
              </View>
            </View>
          ))}
        </Animated.View>
      )}

      {/* ── Weak signs section — shown when user got questions wrong ── */}
      {(weakSigns.length > 0 || behavioralWrongQuestions.length > 0) && (
        <Animated.View style={[styles.weakContainer, { opacity }]}>
          {/* Header */}
          <View style={styles.weakHeader}>
            <Text style={styles.weakIcon}>⚠️</Text>
            <View style={{ flex: 1 }}>
              {!isEngineA && (
                <Text style={styles.weakTitle}>የተሳሳቱ ምልክቶች</Text>
              )}
              {!isEngineA && (
                <Text style={styles.weakHint}>ምልክቱን ይጫኑ ለመማር</Text>
              )}
            </View>
          </View>

          {/* Sign thumbnails grid — each card is tappable → navigates to sign detail */}
          <View style={styles.weakGrid}>
            {weakSigns.map(sign => (
              <TouchableOpacity
                key={sign.id}
                style={styles.weakSignCard}
                onPress={() => handleSignPress(sign.id)}
                activeOpacity={0.75}
              >
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
              </TouchableOpacity>
            ))}
            {/* Behavioral wrong questions — shown with question image or topic name */}
            {behavioralWrongQuestions.map(q => (
              <View key={q.questionId} style={styles.weakSignCard}>
                {q.questionImageUrl ? (
                  <Image
                    source={{ uri: q.questionImageUrl }}
                    style={styles.weakSignImage}
                    resizeMode="contain"
                  />
                ) : (
                  <View style={[styles.weakSignImage, styles.weakSignPlaceholder]}>
                    <Text style={styles.weakSignPlaceholderText}>📖</Text>
                  </View>
                )}
                {!isEngineA && (
                  <Text style={styles.weakSignName} numberOfLines={2}>
                    {TOPIC_NAMES[q.topicId] ?? q.topicId}
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
    </>
  );
}

const styles = StyleSheet.create({
  breakdownContainer: {
    alignSelf:       'stretch',
    backgroundColor: '#ffffff',
    borderRadius:    16,
    padding:         16,
    gap:             10,
    shadowColor:     '#000',
    shadowOffset:    { width: 0, height: 2 },
    shadowOpacity:   0.08,
    shadowRadius:    6,
    elevation:       3,
  },
  breakdownTitle: {
    ...Typography.body,
    color:        '#191c1e',
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
    color: '#404943',
    flex:  1,
  },
  breakdownScoreRow: {
    flexDirection: 'row',
    alignItems:    'center',
    flexShrink:    0,
  },
  breakdownScore: {
    ...Typography.body,
    fontWeight: '700',
  },
  weakContainer: {
    alignSelf:       'stretch',
    backgroundColor: '#ffffff',
    borderRadius:    20,
    padding:         16,
    gap:             14,
    borderWidth:     1,
    borderColor:     '#FFCDD2',
    shadowColor:     '#000',
    shadowOffset:    { width: 0, height: 2 },
    shadowOpacity:   0.08,
    shadowRadius:    6,
    elevation:       3,
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
    color:      '#191c1e',
    fontWeight: '700',
  },
  weakGrid: {
    flexDirection:  'row',
    flexWrap:       'wrap',
    gap:            10,
    justifyContent: 'flex-start',
  },
  weakSignCard: {
    alignItems:      'center',
    gap:             4,
    padding:         6,
    backgroundColor: '#ffffff',
    borderRadius:    14,
    shadowColor:     '#000',
    shadowOffset:    { width: 0, height: 4 },
    shadowOpacity:   0.14,
    shadowRadius:    8,
    elevation:       5,
  },
  weakHint: {
    fontSize:  11,
    color:     '#9e9e9e',
    marginTop: 2,
  },
  weakSignImage: {
    width:        90,
    height:       90,
    borderRadius: 12,
  },
  weakSignPlaceholder: {
    justifyContent: 'center',
    alignItems:     'center',
  },
  weakSignPlaceholderText: {
    fontSize: 32,
  },
  weakSignName: {
    fontSize:   15,
    lineHeight: 22,
    color:      '#404943',
    textAlign:  'center',
    maxWidth:   102,
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
});
