/**
 * AGENT 3 — app/(engineA)/(tabs)/home.tsx
 * Engine A Home Screen — Topic Grid.
 *
 * Engine A = Non-reader. Shows ICONS ONLY (no text labels on cards).
 * Each topic card is large and tappable. Audio plays on tap.
 *
 * Layout:
 * ┌─────────────────────────────────┐
 * │  🔊 (welcome audio replays)     │  ← Top right
 * │                                 │
 * │  [🔴]  [🟡]  [🔵]              │  ← Topic icons grid
 * │  [🟣]  [🟢]  [🟠]              │
 * │                                 │
 * │  [📝 Exam]   [📊 Progress]      │  ← Large bottom buttons
 * └─────────────────────────────────┘
 */

import React, { useEffect, useState } from 'react';

// ─── Audio base URL (Supabase Storage) ────────────────────────────────────────
const _AUDIO_BASE = (process.env.EXPO_PUBLIC_SUPABASE_URL ?? '') + '/storage/v1/object/public/audio';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  SafeAreaView,
  Dimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Colors } from '../../../constants/colors';
import { Typography } from '../../../constants/typography';
import { LoadingScreen } from '../../../components/shared/LoadingScreen';
import { DBTopic } from '../../../backend/supabaseClient';
import * as api from '../../../backend/api';
import { useAudio } from '../../../hooks/useAudio';
import { useProgress } from '../../../hooks/useProgress';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_SIZE = (SCREEN_WIDTH - 48 - 12) / 2; // 2 columns with gap

// ─── Component ────────────────────────────────────────────────────────────────

export default function EngineAHomeScreen() {
  const router   = useRouter();
  const { playAudio } = useAudio();
  const { isSignViewed } = useProgress();

  const [topics,  setTopics]  = useState<DBTopic[]>([]);
  const [loading, setLoading] = useState(true);

  // Load topics
  useEffect(() => {
    async function load() {
      try {
        const data = await api.getTopics();
        setTopics(data);
      } catch (err) {
        console.error('[EngineA/home] Failed to load topics:', err);
      } finally {
        setLoading(false);
      }
    }
    load();

    // Play welcome audio for Engine A
    playAudio(`${_AUDIO_BASE}/home_welcome_a.mp3`).catch(() => {});
  }, []);

  const handleTopicPress = (topic: DBTopic) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    // Play topic name audio so non-readers know which category they entered
    const nameAudioUrl = `${_AUDIO_BASE}/topic_${topic.id}_name.mp3`;
    playAudio(nameAudioUrl).catch(() => {});
    router.push(`/(engineA)/topic/${topic.id}`);
  };

  if (loading) return <LoadingScreen />;

  const renderTopic = ({ item }: { item: DBTopic }) => (
    <TouchableOpacity
      style={[
        styles.topicCard,
        { borderTopColor: item.color ?? Colors.primary, borderTopWidth: 6 },
      ]}
      onPress={() => handleTopicPress(item)}
      activeOpacity={0.8}
      accessibilityLabel={item.name_amharic}
      accessibilityRole="button"
    >
      {/* Large topic icon */}
      <Text style={styles.topicIcon}>{item.icon ?? '📋'}</Text>

      {/* Sign count indicator */}
      <View style={[styles.countBadge, { backgroundColor: item.color ?? Colors.primary }]}>
        <Text style={styles.countText}>{item.sign_count}</Text>
      </View>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        {/* Header with replay button */}
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => playAudio(`${_AUDIO_BASE}/home_welcome_a.mp3`).catch(() => {})}
            style={styles.replayButton}
            accessibilityLabel="ድምጽ ዳግም አዳምጥ"
          >
            <Text style={styles.replayIcon}>🔊</Text>
          </TouchableOpacity>
        </View>

        {/* Topics grid */}
        <FlatList
          data={topics}
          keyExtractor={t => t.id}
          renderItem={renderTopic}
          numColumns={2}
          contentContainerStyle={styles.grid}
          columnWrapperStyle={styles.row}
          showsVerticalScrollIndicator={false}
        />

        {/* Bottom action buttons — Exam and Progress */}
        <View style={styles.bottomActions}>
          <TouchableOpacity
            style={[styles.actionButton, { backgroundColor: Colors.accent }]}
            onPress={() => router.push('/(engineA)/exam')}
            activeOpacity={0.8}
            accessibilityLabel="ፈተና ጀምር"
          >
            <Text style={styles.actionIcon}>📝</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionButton, { backgroundColor: Colors.card }]}
            onPress={() => router.push('/(engineA)/progress')}
            activeOpacity={0.8}
            accessibilityLabel="እድገቴ"
          >
            <Text style={styles.actionIcon}>📊</Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safeArea: {
    flex:            1,
    backgroundColor: Colors.background,
  },
  container: {
    flex: 1,
  },
  header: {
    flexDirection:   'row',
    justifyContent:  'flex-end',
    paddingHorizontal: 16,
    paddingVertical:   12,
  },
  replayButton: {
    width:           48,
    height:          48,
    borderRadius:    24,
    backgroundColor: Colors.card,
    justifyContent:  'center',
    alignItems:      'center',
  },
  replayIcon: {
    fontSize: 22,
  },
  grid: {
    paddingHorizontal: 16,
    paddingBottom:     16,
    gap: 12,
  },
  row: {
    gap: 12,
  },
  topicCard: {
    width:           CARD_SIZE,
    height:          CARD_SIZE,
    backgroundColor: Colors.card,
    borderRadius:    20,
    justifyContent:  'center',
    alignItems:      'center',
    shadowColor:     '#000',
    shadowOffset:    { width: 0, height: 4 },
    shadowOpacity:   0.3,
    shadowRadius:    8,
    elevation:       6,
    position:        'relative',
  },
  topicIcon: {
    fontSize: 64,
  },
  countBadge: {
    position:        'absolute',
    top:             8,
    right:           8,
    width:           28,
    height:          28,
    borderRadius:    14,
    justifyContent:  'center',
    alignItems:      'center',
  },
  countText: {
    ...Typography.caption,
    color:      Colors.textPrimary,
    fontWeight: '700',
    fontSize:   13,
    lineHeight: 16,
  },
  bottomActions: {
    flexDirection:     'row',
    gap:               12,
    paddingHorizontal: 16,
    paddingBottom:     16,
  },
  actionButton: {
    flex:            1,
    height:          72,
    borderRadius:    20,
    justifyContent:  'center',
    alignItems:      'center',
    shadowColor:     '#000',
    shadowOffset:    { width: 0, height: 4 },
    shadowOpacity:   0.3,
    shadowRadius:    8,
    elevation:       6,
  },
  actionIcon: {
    fontSize: 36,
  },
});
