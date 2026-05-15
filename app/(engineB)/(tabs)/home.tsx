/**
 * AGENT 3 — app/(engineB)/(tabs)/home.tsx
 * Engine B Home Screen — Topic list with Amharic text.
 *
 * Engine B users = Amharic readers. Shows full topic cards with:
 * - Icon + color accent
 * - Amharic topic name
 * - Sign count
 * - Optional audio button
 * - Progress indicator
 */

import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  SafeAreaView,
  TouchableOpacity,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Colors } from '../../../constants/colors';
import { Typography } from '../../../constants/typography';
import { TopicCard } from '../../../components/shared/TopicCard';
import { LoadingScreen } from '../../../components/shared/LoadingScreen';
import { DBTopic } from '../../../backend/supabaseClient';
import * as api from '../../../backend/api';
import { useAudio } from '../../../hooks/useAudio';
import { useProgress } from '../../../hooks/useProgress';

// ─── Component ────────────────────────────────────────────────────────────────

export default function EngineBHomeScreen() {
  const router   = useRouter();
  const { playAudio } = useAudio();
  const { topicsProgress } = useProgress();

  const [topics,  setTopics]  = useState<DBTopic[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const data = await api.getTopics();
        setTopics(data);
      } catch (err) {
        console.error('[EngineB/home] Failed to load topics:', err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  // Behavioral topics (no road signs — use scaffolding screen)
  const BEHAVIORAL_TOPICS = [
    'vehicle_knowledge', 'mind_safety', 'society_law',
    'the_road', 'my_vehicle', 'two_wheelers', 'basics_license',
  ];

  const handleTopicPress = async (topic: DBTopic) => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (BEHAVIORAL_TOPICS.includes(topic.id)) {
      router.push(`/(engineB)/behavioral/${topic.id}`);
    } else {
      router.push(`/(engineB)/topic/${topic.id}`);
    }
  };

  if (loading) return <LoadingScreen message="ርዕሰ ጉዳዮችን እየጫነ..." />;

  const getTopicProgress = (topicId: string) =>
    topicsProgress.find(p => p.topicId === topicId)?.masteryPercent ?? 0;

  return (
    <SafeAreaView style={styles.safeArea}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.appTitle}>መንጃ ፍቃድ</Text>
        <Text style={styles.appSubtitle}>ትምህርት ጀምር</Text>
      </View>

      {/* Topics list */}
      <FlatList
        data={topics}
        keyExtractor={t => t.id}
        renderItem={({ item }) => (
          <TopicCard
            topic={item}
            showText
            onPress={handleTopicPress}
            progressPercent={getTopicProgress(item.id)}
            style={styles.topicCard}
          />
        )}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        ListFooterComponent={<View style={{ height: 20 }} />}
      />

      {/* Quick access buttons */}
      <View style={styles.quickAccess}>
        <TouchableOpacity
          style={[styles.quickBtn, { backgroundColor: Colors.accent }]}
          onPress={() => router.push('/(engineB)/exam')}
          activeOpacity={0.85}
          accessibilityLabel="ፈተና ጀምር"
        >
          <Text style={styles.quickBtnIcon}>📝</Text>
          <Text style={styles.quickBtnText}>ፈተና</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.quickBtn, { backgroundColor: Colors.card }]}
          onPress={() => router.push('/(engineB)/progress')}
          activeOpacity={0.85}
          accessibilityLabel="እድገቴ"
        >
          <Text style={styles.quickBtnIcon}>📊</Text>
          <Text style={styles.quickBtnText}>እድገት</Text>
        </TouchableOpacity>
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
  header: {
    paddingHorizontal: 20,
    paddingTop:        20,
    paddingBottom:     12,
  },
  appTitle: {
    ...Typography.h1,
    color: Colors.textPrimary,
  },
  appSubtitle: {
    ...Typography.body,
    color:     Colors.textSecondary,
    marginTop: 4,
  },
  list: {
    paddingHorizontal: 20,
    paddingTop:        8,
  },
  topicCard: {
    marginBottom: 12,
  },
  quickAccess: {
    flexDirection:     'row',
    gap:               12,
    paddingHorizontal: 20,
    paddingVertical:   16,
    borderTopWidth:    1,
    borderTopColor:    Colors.border,
  },
  quickBtn: {
    flex:            1,
    height:          60,
    borderRadius:    16,
    flexDirection:   'row',
    alignItems:      'center',
    justifyContent:  'center',
    gap:             10,
  },
  quickBtnIcon: {
    fontSize: 24,
  },
  quickBtnText: {
    ...Typography.answer,
    color: Colors.textPrimary,
    fontWeight: '700',
  },
});
