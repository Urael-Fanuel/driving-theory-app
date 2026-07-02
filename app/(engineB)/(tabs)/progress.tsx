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
  Share,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Colors } from '../../../constants/colors';
import { Typography } from '../../../constants/typography';
import { ProgressBar } from '../../../components/shared/ProgressBar';
import { useProgress } from '../../../hooks/useProgress';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';

export default function EngineBProgressScreen() {
  const router = useRouter();

  const handleShare = async () => {
    await Share.share({
      message: 'አብረን በደስታ እንማር! 🚗\n\nhttps://play.google.com/store/apps/details?id=com.drivingtheory.ethiopian',
    });
  };
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
            trackColor="#e8eaed"
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
                  trackColor="#e8eaed"
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

        {/* Share button */}
        <TouchableOpacity
          style={styles.shareButton}
          onPress={handleShare}
          activeOpacity={0.85}
        >
          <MaterialCommunityIcons name="share-variant" size={22} color="#ffffff" />
          <Text style={styles.shareButtonText}>שתף את האפליקציה</Text>
        </TouchableOpacity>

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
    backgroundColor: '#f7f9fb',
  },
  content: {
    padding:    20,
    gap:        20,
  },
  title: {
    ...Typography.h1,
    color: '#191c1e',
  },
  statsCard: {
    backgroundColor: '#ffffff',
    borderRadius:    20,
    padding:         20,
    gap:             16,
    borderWidth:     1,
    borderColor:     '#dde3ea',
    shadowColor:     '#000',
    shadowOffset:    { width: 0, height: 2 },
    shadowOpacity:   0.06,
    shadowRadius:    8,
    elevation:       2,
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
    color: '#191c1e',
  },
  statLabel: {
    ...Typography.caption,
    color:     '#666666',
    marginTop: 4,
  },
  statDivider: {
    width:           1,
    height:          40,
    backgroundColor: '#dde3ea',
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
    color: '#191c1e',
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
    color:      '#191c1e',
    fontWeight: '600',
    fontSize:   13,
  },
  topicStat: {
    ...Typography.caption,
    color: '#888888',
  },
  topicBar: {
    flex: 1,
  },
  topicPercent: {
    ...Typography.caption,
    color:      '#666666',
    width:      40,
    textAlign:  'right',
    flexShrink: 0,
  },
  emptyState: {
    alignItems:        'center',
    padding:           24,
    backgroundColor:   '#ffffff',
    borderRadius:      16,
    gap:               12,
    borderWidth:       1,
    borderColor:       '#dde3ea',
  },
  emptyIcon: {
    fontSize: 52,
  },
  emptyText: {
    ...Typography.body,
    color:     '#666666',
    textAlign: 'center',
  },
  shareButton: {
    flexDirection:   'row',
    alignItems:      'center',
    justifyContent:  'center',
    backgroundColor: '#1976D2',
    borderRadius:    16,
    paddingVertical: 16,
    gap:             10,
  },
  shareButtonText: {
    ...Typography.answer,
    color:      '#ffffff',
    fontWeight: '700',
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
