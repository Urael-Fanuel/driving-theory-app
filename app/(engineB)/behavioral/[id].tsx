/**
 * app/(engineB)/behavioral/[id].tsx
 * Engine B — Behavioral Topic Screen (Scaffolding)
 *
 * Shows hierarchical learning levels for behavioral topics
 * (vehicle_knowledge, mind_safety, etc.)
 * Each level expands to show sub-topics.
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
import roadDecisionsData   from '../../../content/road_decisions_scaffold.json';
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

// ─── Scaffold registry ────────────────────────────────────────────────────────

const SCAFFOLD_MAP: Record<string, ScaffoldData> = {
  vehicle_knowledge: vehicleKnowledgeData as ScaffoldData,
  mind_safety:       mindSafetyData       as ScaffoldData,
  society_law:       societyLawData       as ScaffoldData,
  the_road:          theRoadData          as ScaffoldData,
  my_vehicle:        myVehicleData        as ScaffoldData,
  two_wheelers:      twoWheelersData      as ScaffoldData,
  road_decisions:    roadDecisionsData    as ScaffoldData,
  basics_license:    basicsLicenseData    as ScaffoldData,
};

/**
 * Subtopics that still have no content contribute no questions, and a quiz with
 * zero questions leaves the quiz screen stuck on its loading state. Gate every
 * quiz button on there actually being something to ask.
 */
const levelHasQuestions = (level: Level): boolean =>
  (level.subtopics ?? []).some(s => (s.questions?.length ?? 0) > 0);

// ─── Component ────────────────────────────────────────────────────────────────

export default function BehavioralTopicScreenB() {
  const { id }   = useLocalSearchParams<{ id: string }>();
  const router   = useRouter();
  const [expandedLevel, setExpandedLevel] = useState<string | null>(null);

  const data = SCAFFOLD_MAP[id ?? ''];

  // ── Fallback for topics not yet built ────────────────────────────────────────
  if (!data) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Text style={styles.backIcon}>←</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>בפיתוח</Text>
          <View style={{ width: 44 }} />
        </View>
        <View style={styles.comingSoon}>
          <Text style={styles.comingSoonIcon}>🚧</Text>
          <Text style={styles.comingSoonText}>תוכן זה בפיתוח</Text>
          <Text style={styles.comingSoonSub}>Coming soon</Text>
        </View>
      </SafeAreaView>
    );
  }

  // ── Handlers ─────────────────────────────────────────────────────────────────

  const handleLevelPress = async (level: Level) => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setExpandedLevel(expandedLevel === level.id ? null : level.id);
  };

  const handleSubtopicPress = async (sub: Subtopic, level: Level) => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    // Navigate to sub-topic detail screen
    router.push({
      pathname: '/(engineB)/behavioral-subtopic/[id]',
      params: { id: sub.id, topicId: data.topicId, levelId: level.id },
    } as any);
  };

  // ── Render ───────────────────────────────────────────────────────────────────

  const renderLevel = ({ item }: { item: Level }) => {
    const isExpanded = expandedLevel === item.id;
    const displayName = item.name_amharic || item.name_hebrew;

    return (
      <View style={styles.levelWrapper}>
        {/* Level card */}
        <TouchableOpacity
          style={[styles.levelCard, { borderLeftColor: item.color }]}
          onPress={() => handleLevelPress(item)}
          activeOpacity={0.85}
          accessibilityLabel={displayName}
        >
          {/* Level number badge */}
          <View style={[styles.levelBadge, { backgroundColor: item.color }]}>
            <Text style={styles.levelBadgeText}>{item.level}</Text>
          </View>

          {/* Icon */}
          <MaterialCommunityIcons
            name={(BEHAVIORAL_LEVEL_ICON_MAP[item.id] ?? 'circle-outline') as any}
            size={30}
            color={item.color}
            style={{ flexShrink: 0 }}
          />

          {/* Text */}
          <View style={styles.levelTextContainer}>
            <Text style={styles.levelName} numberOfLines={2}>
              {displayName}
            </Text>
            <Text style={styles.levelSubCount}>
              {item.subtopics.length} נושאים
            </Text>
          </View>

          {/* Expand arrow */}
          <Text style={[styles.arrow, isExpanded && styles.arrowExpanded]}>
            {isExpanded ? '▾' : '›'}
          </Text>
        </TouchableOpacity>

        {/* Sub-topics (expanded) */}
        {isExpanded && (
          <View style={[styles.subtopicsContainer, { borderLeftColor: item.color }]}>
            {item.subtopics.map((sub) => (
              <TouchableOpacity
                key={sub.id}
                style={styles.subtopicItem}
                onPress={() => handleSubtopicPress(sub, item)}
                activeOpacity={0.75}
              >
                {sub.image_url ? (
                  <Image source={{ uri: sub.image_url }} style={styles.subtopicThumb} resizeMode="cover" />
                ) : (
                  <Text style={styles.subtopicIcon}>{sub.icon}</Text>
                )}
                <Text style={styles.subtopicName} numberOfLines={1}>
                  {sub.name_amharic || sub.name_hebrew}
                </Text>
                <Text style={styles.subtopicArrow}>›</Text>
              </TouchableOpacity>
            ))}

            {/* Level quiz button — needs 2+ subtopics AND real questions behind them */}
            {item.subtopics.length >= 2 && levelHasQuestions(item) && (
              <TouchableOpacity
                style={[styles.levelQuizBtn, { borderLeftColor: item.color }]}
                onPress={() => router.push({
                  pathname: '/(engineB)/topic-quiz/[topicId]',
                  params: { topicId: data.topicId, levelId: item.id },
                } as any)}
                activeOpacity={0.85}
              >
                <Text style={styles.levelQuizIcon}>📝</Text>
                <Text style={[styles.levelQuizText, { color: item.color }]}>
                  የማጠቃለያ ፈተና — {item.name_amharic || item.name_hebrew}
                </Text>
                <Text style={styles.levelQuizArrow}>›</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: data.color }]}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Text style={styles.backIcon}>←</Text>
        </TouchableOpacity>
        <View style={styles.headerContent}>
          <Text style={styles.headerIcon}>{data.icon}</Text>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {data.name_amharic}
          </Text>
        </View>
        <View style={{ width: 44 }} />
      </View>

      {/* Progress hint */}
      <View style={styles.progressHint}>
        <Text style={styles.progressHintText}>
          {data.levels.length} שלבי למידה • מתחילים מהבסיס
        </Text>
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
                onPress={() => router.push(`/(engineB)/topic-quiz/${data.topicId}` as any)}
                activeOpacity={0.85}
              >
                <Text style={styles.quizButtonIcon}>📝</Text>
                <Text style={styles.quizButtonText}>የርዕሰ ጉዳዩ ፈተና</Text>
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
    paddingHorizontal: 16,
    paddingVertical:   14,
    borderBottomWidth: 3,
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
  headerContent: {
    flex:              1,
    flexDirection:     'row',
    alignItems:        'center',
    gap:               10,
    paddingHorizontal: 12,
  },
  headerIcon: {
    fontSize: 26,
  },
  headerTitle: {
    ...Typography.h3,
    color: '#191c1e',
    flex:  1,
  },
  progressHint: {
    paddingHorizontal: 16,
    paddingVertical:   10,
    backgroundColor:   '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  progressHintText: {
    ...Typography.bodySmall,
    color:     '#404943',
    textAlign: 'center',
  },
  list: {
    paddingHorizontal: 16,
    paddingTop:        12,
  },

  // ── Level card ──────────────────────────────────────────────────────────────
  levelWrapper: {
    marginBottom: 10,
  },
  levelCard: {
    flexDirection:   'row',
    alignItems:      'center',
    backgroundColor: '#ffffff',
    borderRadius:    14,
    padding:         14,
    borderLeftWidth: 5,
    gap:             12,
    shadowColor:     '#000',
    shadowOffset:    { width: 0, height: 2 },
    shadowOpacity:   0.10,
    shadowRadius:    6,
    elevation:       3,
  },
  levelBadge: {
    width:           32,
    height:          32,
    borderRadius:    16,
    justifyContent:  'center',
    alignItems:      'center',
    flexShrink:      0,
  },
  levelBadgeText: {
    color:      '#FFFFFF',
    fontSize:   14,
    fontWeight: '800',
    lineHeight: 18,
  },
  levelIcon: {
    fontSize:   30,
    flexShrink: 0,
  },
  levelTextContainer: {
    flex: 1,
  },
  levelName: {
    ...Typography.answer,
    color:        '#191c1e',
    fontWeight:   '700',
    marginBottom: 3,
  },
  levelSubCount: {
    ...Typography.caption,
    color: '#404943',
  },
  arrow: {
    fontSize:   22,
    color:      '#9e9e9e',
    flexShrink: 0,
  },
  arrowExpanded: {
    color: '#191c1e',
  },

  // ── Sub-topics ──────────────────────────────────────────────────────────────
  subtopicsContainer: {
    marginTop:       4,
    marginLeft:      16,
    borderLeftWidth: 3,
    borderRadius:    0,
    paddingLeft:     12,
  },
  subtopicItem: {
    flexDirection:     'row',
    alignItems:        'center',
    backgroundColor:   '#ffffff',
    borderRadius:      10,
    paddingVertical:   11,
    paddingHorizontal: 14,
    marginBottom:      6,
    gap:               10,
    shadowColor:       '#000',
    shadowOffset:      { width: 0, height: 1 },
    shadowOpacity:     0.07,
    shadowRadius:      4,
    elevation:         2,
  },
  subtopicIcon: {
    fontSize:   22,
    flexShrink: 0,
  },
  subtopicThumb: {
    width:        220,
    height:       220,
    borderRadius: 16,
    flexShrink:   0,
  },
  subtopicName: {
    ...Typography.body,
    color: '#191c1e',
    flex:  1,
  },
  subtopicArrow: {
    fontSize:   18,
    color:      '#9e9e9e',
    flexShrink: 0,
  },
  levelQuizBtn: {
    flexDirection:     'row',
    alignItems:        'center',
    backgroundColor:   '#ffffff',
    borderRadius:      10,
    paddingVertical:   12,
    paddingHorizontal: 14,
    marginTop:         4,
    marginBottom:      6,
    gap:               10,
    borderLeftWidth:   4,
    shadowColor:       '#000',
    shadowOffset:      { width: 0, height: 1 },
    shadowOpacity:     0.10,
    shadowRadius:      4,
    elevation:         3,
  },
  levelQuizIcon: {
    fontSize:   20,
    flexShrink: 0,
  },
  levelQuizText: {
    ...Typography.body,
    fontWeight: '700',
    flex:       1,
  },
  levelQuizArrow: {
    fontSize:   18,
    color:      '#9e9e9e',
    flexShrink: 0,
  },

  // ── Quiz button ─────────────────────────────────────────────────────────────
  footerWrapper: {
    alignItems: 'center',
    paddingTop: 24,
  },
  quizButton: {
    flexDirection:   'row',
    alignItems:      'center',
    gap:             10,
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius:    18,
    backgroundColor: Colors.accent,
    shadowColor:     '#000',
    shadowOffset:    { width: 0, height: 4 },
    shadowOpacity:   0.18,
    shadowRadius:    8,
    elevation:       6,
  },
  quizButtonIcon: {
    fontSize: 24,
  },
  quizButtonText: {
    fontSize:   16,
    fontWeight: '700',
    color:      '#ffffff',
  },

  // ── Coming soon ─────────────────────────────────────────────────────────────
  comingSoon: {
    flex:           1,
    justifyContent: 'center',
    alignItems:     'center',
    gap:            12,
  },
  comingSoonIcon: {
    fontSize: 64,
  },
  comingSoonText: {
    ...Typography.h3,
    color: '#191c1e',
  },
  comingSoonSub: {
    ...Typography.body,
    color: '#404943',
  },
});
