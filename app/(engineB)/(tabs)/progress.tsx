/**
 * AGENT 3 — app/(engineB)/(tabs)/progress.tsx
 * Engine B Progress Screen — Detailed text progress with per-topic stats.
 */

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Colors } from '../../../constants/colors';
import { Typography } from '../../../constants/typography';
import { ProgressBar } from '../../../components/shared/ProgressBar';
import { useProgress } from '../../../hooks/useProgress';

export default function EngineBProgressScreen() {
  const router = useRouter();
  const { totalAttempted, totalCorrect, topicsProgress } = useProgress();

  const overallPercent = totalAttempted > 0
    ? Math.round((totalCorrect / totalAttempted) * 100)
    : 0;

  const passed = overallPercent >= 80;

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        {/* Header */}
        <Text style={styles.title}>እድገቴ</Text>

        {/* Overall stats card */}
        <View style={styles.statsCard}>
          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <Text style={styles.statNumber}>{totalCorrect}</Text>
              <Text style={styles.statLabel}>ትክክል</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statNumber}>{totalAttempted}</Text>
              <Text style={styles.statLabel}>ሞክሯል</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={[
                styles.statNumber,
                { color: passed ? Colors.correct : Colors.secondary }
              ]}>
                {overallPercent}%
              </Text>
              <Text style={styles.statLabel}>
                {passed ? 'ሞልቷል ✅' : 'እድገት'}
              </Text>
            </View>
          </View>

          <ProgressBar
            current={totalCorrect}
            total={Math.max(totalAttempted, 1)}
            fillColor={passed ? Colors.correct : Colors.primary}
            height={10}
            style={styles.overallBar}
          />

          <Text style={[styles.passNote, { color: passed ? Colors.correct : Colors.textMuted }]}>
            {passed
              ? '🏆 ለፈተና ዝግጁ ነዎት!'
              : `ለፈተና ማለፍ 80% ያስፈልጋል (${Math.max(0, 80 - overallPercent)}% ቀሪ)`}
          </Text>
        </View>

        {/* Per-topic progress */}
        {topicsProgress.length > 0 && (
          <View style={styles.topicsSection}>
            <Text style={styles.sectionTitle}>በርዕስ ጉዳይ</Text>
            {topicsProgress.map(t => (
              <View key={t.topicId} style={styles.topicRow}>
                <View style={styles.topicInfo}>
                  <Text style={styles.topicId}>{t.topicId}</Text>
                  <Text style={styles.topicStat}>
                    {t.questionsCorrect}/{t.totalQuestions}
                  </Text>
                </View>
                <ProgressBar
                  current={t.questionsCorrect}
                  total={t.totalQuestions}
                  height={8}
                  fillColor={t.masteryPercent >= 80 ? Colors.correct : Colors.primary}
                  style={styles.topicBar}
                />
                <Text style={styles.topicPercent}>{t.masteryPercent}%</Text>
              </View>
            ))}
          </View>
        )}

        {/* Empty state */}
        {totalAttempted === 0 && (
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>📚</Text>
            <Text style={styles.emptyText}>
              ገና አልተጀመረም። ምልክቶቹን ቁጥቁጥ ሲሉ ወይም ፈተና ሲወስዱ እድገትዎ እዚህ ይታያል።
            </Text>
          </View>
        )}

        {/* Start exam CTA */}
        <TouchableOpacity
          style={styles.examButton}
          onPress={() => router.push('/(engineB)/exam' as any)}
          activeOpacity={0.85}
        >
          <Text style={styles.examButtonIcon}>📝</Text>
          <Text style={styles.examButtonText}>ፈተና ጀምር</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex:            1,
    backgroundColor: Colors.background,
  },
  content: {
    padding:    20,
    gap:        20,
  },
  title: {
    ...Typography.h1,
    color: Colors.textPrimary,
  },
  statsCard: {
    backgroundColor: Colors.card,
    borderRadius:    20,
    padding:         20,
    gap:             16,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems:    'center',
  },
  statItem: {
    flex:       1,
    alignItems: 'center',
  },
  statNumber: {
    ...Typography.h1,
    color: Colors.textPrimary,
  },
  statLabel: {
    ...Typography.caption,
    color:     Colors.textSecondary,
    marginTop: 4,
  },
  statDivider: {
    width:           1,
    height:          40,
    backgroundColor: Colors.border,
  },
  overallBar: {
    alignSelf: 'stretch',
  },
  passNote: {
    ...Typography.bodySmall,
    textAlign: 'center',
  },
  topicsSection: {
    gap: 12,
  },
  sectionTitle: {
    ...Typography.h3,
    color: Colors.textPrimary,
  },
  topicRow: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           10,
  },
  topicInfo: {
    width:       80,
    flexShrink:  0,
  },
  topicId: {
    ...Typography.caption,
    color:      Colors.textPrimary,
    fontWeight: '600',
    fontSize:   13,
  },
  topicStat: {
    ...Typography.caption,
    color: Colors.textMuted,
  },
  topicBar: {
    flex: 1,
  },
  topicPercent: {
    ...Typography.caption,
    color:      Colors.textSecondary,
    width:      40,
    textAlign:  'right',
    flexShrink: 0,
  },
  emptyState: {
    alignItems:        'center',
    padding:           24,
    backgroundColor:   Colors.card,
    borderRadius:      16,
    gap:               12,
  },
  emptyIcon: {
    fontSize: 52,
  },
  emptyText: {
    ...Typography.body,
    color:     Colors.textSecondary,
    textAlign: 'center',
  },
  examButton: {
    flexDirection:   'row',
    alignItems:      'center',
    justifyContent:  'center',
    backgroundColor: Colors.primary,
    borderRadius:    16,
    paddingVertical: 18,
    gap:             12,
  },
  examButtonIcon: {
    fontSize: 26,
  },
  examButtonText: {
    ...Typography.answer,
    color:      Colors.textPrimary,
    fontWeight: '700',
  },
});
