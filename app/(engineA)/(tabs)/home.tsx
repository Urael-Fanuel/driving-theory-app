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

import React, { useEffect, useState, useRef } from 'react';

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
  Animated,
  Easing,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { TrafficSignIcon } from '../../../components/shared/TrafficSignIcon';
import { Colors } from '../../../constants/colors';
import { Typography } from '../../../constants/typography';
import { LoadingScreen } from '../../../components/shared/LoadingScreen';
import { DBTopic } from '../../../backend/supabaseClient';
import * as api from '../../../backend/api';
import { useAudio } from '../../../hooks/useAudio';
import { useProgress } from '../../../hooks/useProgress';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_SIZE = (SCREEN_WIDTH - 48 - 12) / 2; // 2 columns with gap

// ─── FloatingCard ─────────────────────────────────────────────────────────────

function FloatingCard({
  index,
  style,
  onPress,
  accessibilityLabel,
  children,
}: {
  index: number;
  style?: object;
  onPress: () => void;
  accessibilityLabel?: string;
  children: React.ReactNode;
}) {
  const floatAnim = useRef(new Animated.Value(0)).current;
  const animRef   = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      animRef.current = Animated.loop(
        Animated.sequence([
          Animated.timing(floatAnim, {
            toValue:         -5,
            duration:         950,
            easing:           Easing.inOut(Easing.sin),
            useNativeDriver:  true,
          }),
          Animated.timing(floatAnim, {
            toValue:         0,
            duration:         950,
            easing:           Easing.inOut(Easing.sin),
            useNativeDriver:  true,
          }),
        ])
      );
      animRef.current.start();
    }, (index % 4) * 270); // stagger per card

    return () => {
      clearTimeout(timer);
      animRef.current?.stop();
    };
  }, []);

  return (
    <Animated.View style={{ transform: [{ translateY: floatAnim }] }}>
      <TouchableOpacity
        style={style}
        onPress={onPress}
        activeOpacity={0.8}
        accessibilityLabel={accessibilityLabel}
        accessibilityRole="button"
      >
        {children}
      </TouchableOpacity>
    </Animated.View>
  );
}

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

  // Behavioral topics (no road signs — use scaffolding screen)
  const BEHAVIORAL_TOPICS = [
    'vehicle_knowledge', 'mind_safety', 'society_law',
    'the_road', 'my_vehicle', 'two_wheelers', 'basics_license',
  ];

  const handleTopicPress = (topic: DBTopic) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    // Play topic name audio so non-readers know which category they entered
    const nameAudioUrl = `${_AUDIO_BASE}/topic_${topic.id}_name.mp3`;
    playAudio(nameAudioUrl).catch(() => {});
    if (BEHAVIORAL_TOPICS.includes(topic.id)) {
      router.push(`/(engineA)/behavioral/${topic.id}`);
    } else {
      router.push(`/(engineA)/topic/${topic.id}`);
    }
  };

  if (loading) return <LoadingScreen />;

  const renderTopic = ({ item, index }: { item: DBTopic; index: number }) => (
    <FloatingCard
      index={index}
      style={styles.topicCard}
      onPress={() => handleTopicPress(item)}
      accessibilityLabel={item.name_amharic}
    >
      <TrafficSignIcon topicId={item.id} size={62} />

      {/* Sign count badge */}
      {item.sign_count > 0 && (
        <View style={styles.countBadge}>
          <Text style={[styles.countText, { color: item.color ?? '#555' }]}>{item.sign_count}</Text>
        </View>
      )}
    </FloatingCard>
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
            style={[styles.actionButton, { backgroundColor: '#ffffff', borderWidth: 1.5, borderColor: '#dde3ea' }]}
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
    backgroundColor: '#f7f9fb',
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
    backgroundColor: '#eeeeee',
    justifyContent:  'center',
    alignItems:      'center',
    borderWidth:     1,
    borderColor:     '#dde3ea',
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
    backgroundColor: '#ffffff',
    borderRadius:    20,
    justifyContent:  'center',
    alignItems:      'center',
    shadowColor:     '#000',
    shadowOffset:    { width: 0, height: 4 },
    shadowOpacity:   0.14,
    shadowRadius:    10,
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
    minWidth:        26,
    height:          26,
    borderRadius:    13,
    justifyContent:  'center',
    alignItems:      'center',
    backgroundColor: '#ffffff',
    shadowColor:     '#000',
    shadowOffset:    { width: 0, height: 1 },
    shadowOpacity:   0.12,
    shadowRadius:    3,
    elevation:       2,
    paddingHorizontal: 4,
  },
  countText: {
    fontWeight: '800',
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
