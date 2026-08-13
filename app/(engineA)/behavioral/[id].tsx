/**
 * app/(engineA)/behavioral/[id].tsx
 * Engine A — Behavioral Topic Screen (Scaffolding)
 *
 * Icon-focused layout for non-readers.
 * Each level is a large tappable card — icon + level number.
 * Expanded sub-topics show as icon cards in a grid.
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  SafeAreaView,
  Dimensions,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Colors } from '../../../constants/colors';
import { Typography } from '../../../constants/typography';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { BEHAVIORAL_LEVEL_ICON_MAP } from '../../../components/shared/TrafficSignIcon';

// ─── Scaffold data ────────────────────────────────────────────────────────────
import vehicleKnowledgeData from '../../../content/vehicle_knowledge_scaffold.json';
import mindSafetyData       from '../../../content/mind_safety_scaffold.json';
import societyLawData       from '../../../content/society_law_scaffold.json';
import theRoadData          from '../../../content/the_road_scaffold.json';
import myVehicleData        from '../../../content/my_vehicle_scaffold.json';
import twoWheelersData      from '../../../content/two_wheelers_scaffold.json';
import basicsLicenseData    from '../../../content/basics_license_scaffold.json';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Subtopic {
  id: string;
  name_hebrew: string;
  name_amharic?: string;
  icon: string;
  image_url?: string;
  questions?: unknown[];
}

interface Level {
  id: string;
  level: number;
  name_hebrew: string;
  name_amharic: string;
  icon: string;
  color: string;
  subtopics: Subtopic[];
}

interface ScaffoldData {
  topicId: string;
  name_amharic: string;
  name_hebrew: string;
  icon: string;
  color: string;
  levels: Level[];
}

const SCAFFOLD_MAP: Record<string, ScaffoldData> = {
  vehicle_knowledge: vehicleKnowledgeData as ScaffoldData,
  mind_safety:       mindSafetyData       as ScaffoldData,
  society_law:       societyLawData       as ScaffoldData,
  the_road:          theRoadData          as ScaffoldData,
  my_vehicle:        myVehicleData        as ScaffoldData,
  two_wheelers:      twoWheelersData      as ScaffoldData,
  basics_license:    basicsLicenseData    as ScaffoldData,
};

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const SUBTOPIC_CARD = (SCREEN_WIDTH - 48 - 24) / 3;

/**
 * Subtopics that still have no content contribute no questions, and a quiz with
 * zero questions leaves the quiz screen stuck on its loading state. Gate every
 * quiz button on there actually being something to ask.
 */
const levelHasQuestions = (level: Level): boolean =>
  (level.subtopics ?? []).some(s => (s.questions?.length ?? 0) > 0);

// ─── Component ────────────────────────────────────────────────────────────────

export default function BehavioralTopicScreenA() {
  const { id }  = useLocalSearchParams<{ id: string }>();
  const router  = useRouter();
  const [expandedLevel, setExpandedLevel] = useState<string | null>(null);

  const data = SCAFFOLD_MAP[id ?? ''];

  // ── Fallback ──────────────────────────────────────────────────────────────────
  if (!data) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Text style={styles.backIcon}>←</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.comingSoon}>
          <Text style={styles.comingSoonIcon}>🚧</Text>
        </View>
      </SafeAreaView>
    );
  }

  // ── Handlers ─────────────────────────────────────────────────────────────────

  const handleLevelPress = async (level: Level) => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setExpandedLevel(expandedLevel === level.id ? null : level.id);
  };

  const handleSubtopicPress = async (sub: Subtopic, level: Level) => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push({
      pathname: '/(engineA)/behavioral-subtopic/[id]',
      params: { id: sub.id, topicId: data.topicId, levelId: level.id },
    } as any);
  };

  // ── Render ───────────────────────────────────────────────────────────────────

  const renderLevel = ({ item }: { item: Level }) => {
    const isExpanded = expandedLevel === item.id;

    return (
      <View style={styles.levelWrapper}>
        {/* Level card — icon focused */}
        <TouchableOpacity
          style={[
            styles.levelCard,
            { borderTopColor: item.color, borderTopWidth: 5 },
            isExpanded && { backgroundColor: item.color + '18' },
          ]}
          onPress={() => handleLevelPress(item)}
          activeOpacity={0.8}
          accessibilityLabel={`שלב ${item.level}`}
        >
          {/* Level number */}
          <View style={[styles.levelBadge, { backgroundColor: item.color }]}>
            <Text style={styles.levelBadgeText}>{item.level}</Text>
          </View>

          {/* Big icon */}
          <MaterialCommunityIcons
            name={(BEHAVIORAL_LEVEL_ICON_MAP[item.id] ?? 'circle-outline') as any}
            size={46}
            color={item.color}
            style={{ flex: 1, textAlign: 'center' }}
          />

          {/* Sub-count badge */}
          <View style={[styles.subCountBadge, { backgroundColor: item.color + '33' }]}>
            <Text style={[styles.subCountText, { color: item.color }]}>
              {item.subtopics.length}
            </Text>
          </View>
        </TouchableOpacity>

        {/* Sub-topics grid (expanded) */}
        {isExpanded && (
          <View style={styles.subtopicsGrid}>
            {item.subtopics.map((sub) => (
              <TouchableOpacity
                key={sub.id}
                style={[styles.subtopicCard, { width: SUBTOPIC_CARD, height: SUBTOPIC_CARD }]}
                onPress={() => handleSubtopicPress(sub, item)}
                activeOpacity={0.75}
              >
                {sub.image_url ? (
                  <Image source={{ uri: sub.image_url }} style={styles.subtopicImage} resizeMode="cover" />
                ) : (
                  <Text style={styles.subtopicIcon}>{sub.icon}</Text>
                )}
                <View style={[styles.subtopicDot, { backgroundColor: item.color }]} />
              </TouchableOpacity>
            ))}

            {/* Level quiz button — needs 2+ subtopics AND real questions behind them */}
            {item.subtopics.length >= 2 && levelHasQuestions(item) && (
              <TouchableOpacity
                style={[styles.levelQuizBtn, { backgroundColor: item.color }]}
                onPress={() => router.push({
                  pathname: '/(engineA)/topic-quiz/[topicId]',
                  params: { topicId: data.topicId, levelId: item.id },
                } as any)}
                activeOpacity={0.85}
              >
                <Text style={styles.levelQuizIcon}>📝</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      {/* Header — icon only, no text */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Text style={styles.backIcon}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTopicIcon}>{data.icon}</Text>
        <View style={{ width: 44 }} />
      </View>

      {/* Levels list */}
      <FlatList
        data={data.levels}
        keyExtractor={(l) => l.id}
        renderItem={renderLevel}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        ListFooterComponent={
          <View style={styles.footerWrapper}>
            {data.levels.some(levelHasQuestions) && (
              <TouchableOpacity
                style={styles.quizButton}
                onPress={() => router.push(`/(engineA)/topic-quiz/${data.topicId}` as any)}
                activeOpacity={0.85}
                accessibilityLabel="מבחן נושא"
              >
                <Text style={styles.quizButtonIcon}>📝</Text>
              </TouchableOpacity>
            )}
            <View style={{ height: 16 }} />
          </View>
        }
      />
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safeArea: {
    flex:            1,
    backgroundColor: '#f7f9fb',
  },
  header: {
    flexDirection:     'row',
    alignItems:        'center',
    justifyContent:    'space-between',
    paddingHorizontal: 16,
    paddingVertical:   14,
  },
  // Prominent, fixed color everywhere in the app — see Colors.backButtonAccent.
  backButton: {
    width:           54,
    height:          54,
    borderRadius:    27,
    backgroundColor: '#ffffff',
    justifyContent:  'center',
    alignItems:      'center',
    borderWidth:     2,
    borderColor:     Colors.backButtonAccent,
    shadowColor:     '#000',
    shadowOffset:    { width: 0, height: 3 },
    shadowOpacity:   0.20,
    shadowRadius:    8,
    elevation:       6,
  },
  backIcon: {
    fontSize:   28,
    fontWeight: '700',
    color:      Colors.backButtonAccent,
  },
  headerTopicIcon: {
    fontSize: 40,
  },
  list: {
    paddingHorizontal: 16,
    paddingTop:        8,
    gap:               10,
  },

  // ── Level card ──────────────────────────────────────────────────────────────
  levelWrapper: {
    marginBottom: 10,
  },
  levelCard: {
    flexDirection:   'row',
    alignItems:      'center',
    backgroundColor: '#ffffff',
    borderRadius:    18,
    padding:         16,
    gap:             16,
    shadowColor:     '#000',
    shadowOffset:    { width: 0, height: 3 },
    shadowOpacity:   0.10,
    shadowRadius:    8,
    elevation:       4,
  },
  levelBadge: {
    width:           38,
    height:          38,
    borderRadius:    19,
    justifyContent:  'center',
    alignItems:      'center',
    flexShrink:      0,
  },
  levelBadgeText: {
    color:      '#FFFFFF',
    fontSize:   16,
    fontWeight: '800',
    lineHeight: 20,
  },
  levelIcon: {
    fontSize:   48,
    flex:       1,
    textAlign:  'center',
  },
  subCountBadge: {
    width:           36,
    height:          36,
    borderRadius:    18,
    justifyContent:  'center',
    alignItems:      'center',
    flexShrink:      0,
  },
  subCountText: {
    fontSize:   16,
    fontWeight: '700',
    lineHeight: 20,
  },

  // ── Sub-topics grid ─────────────────────────────────────────────────────────
  subtopicsGrid: {
    flexDirection:  'row',
    flexWrap:       'wrap',
    gap:            8,
    paddingTop:     8,
    paddingLeft:    8,
  },
  subtopicCard: {
    backgroundColor: '#ffffff',
    borderRadius:    14,
    justifyContent:  'center',
    alignItems:      'center',
    shadowColor:     '#000',
    shadowOffset:    { width: 0, height: 2 },
    shadowOpacity:   0.10,
    shadowRadius:    6,
    elevation:       3,
  },
  subtopicIcon: {
    fontSize: 30,
  },
  subtopicImage: {
    width:        '100%',
    height:       '100%',
    borderRadius: 14,
  } as any,
  subtopicDot: {
    position:     'absolute',
    bottom:       6,
    right:        6,
    width:        8,
    height:       8,
    borderRadius: 4,
  },
  levelQuizBtn: {
    width:           SUBTOPIC_CARD,
    height:          SUBTOPIC_CARD,
    borderRadius:    14,
    justifyContent:  'center',
    alignItems:      'center',
    shadowColor:     '#000',
    shadowOffset:    { width: 0, height: 2 },
    shadowOpacity:   0.15,
    shadowRadius:    6,
    elevation:       4,
  },
  levelQuizIcon: {
    fontSize: 30,
  },

  // ── Quiz button ─────────────────────────────────────────────────────────────
  footerWrapper: {
    alignItems: 'center',
    paddingTop: 20,
  },
  quizButton: {
    width:           80,
    height:          80,
    borderRadius:    40,
    backgroundColor: Colors.accent,
    justifyContent:  'center',
    alignItems:      'center',
    shadowColor:     '#000',
    shadowOffset:    { width: 0, height: 4 },
    shadowOpacity:   0.18,
    shadowRadius:    8,
    elevation:       6,
  },
  quizButtonIcon: {
    fontSize: 36,
  },

  // ── Coming soon ─────────────────────────────────────────────────────────────
  comingSoon: {
    flex:           1,
    justifyContent: 'center',
    alignItems:     'center',
  },
  comingSoonIcon: {
    fontSize: 80,
  },
});
