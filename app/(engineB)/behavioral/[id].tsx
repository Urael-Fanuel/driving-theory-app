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

// ─── Scaffold data ────────────────────────────────────────────────────────────
import vehicleKnowledgeData from '../../../content/vehicle_knowledge_scaffold.json';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Subtopic {
  id: string;
  name_hebrew: string;
  name_amharic?: string;
  icon: string;
  image_url?: string;
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
};

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
          <Text style={styles.levelIcon}>{item.icon}</Text>

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
        ListFooterComponent={<View style={{ height: 24 }} />}
      />
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
    flexDirection:     'row',
    alignItems:        'center',
    paddingHorizontal: 16,
    paddingVertical:   14,
    borderBottomWidth: 3,
  },
  backButton: {
    width:           44,
    height:          44,
    borderRadius:    22,
    backgroundColor: Colors.card,
    justifyContent:  'center',
    alignItems:      'center',
  },
  backIcon: {
    fontSize: 22,
    color:    Colors.textPrimary,
  },
  headerContent: {
    flex:          1,
    flexDirection: 'row',
    alignItems:    'center',
    gap:           10,
    paddingHorizontal: 12,
  },
  headerIcon: {
    fontSize: 26,
  },
  headerTitle: {
    ...Typography.h3,
    color: Colors.textPrimary,
    flex:  1,
  },
  progressHint: {
    paddingHorizontal: 16,
    paddingVertical:   10,
    backgroundColor:   Colors.card,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  progressHintText: {
    ...Typography.bodySmall,
    color: Colors.textSecondary,
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
    backgroundColor: Colors.card,
    borderRadius:    14,
    padding:         14,
    borderLeftWidth: 5,
    gap:             12,
    shadowColor:     '#000',
    shadowOffset:    { width: 0, height: 2 },
    shadowOpacity:   0.12,
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
    color:        Colors.textPrimary,
    fontWeight:   '700',
    marginBottom: 3,
  },
  levelSubCount: {
    ...Typography.caption,
    color: Colors.textSecondary,
  },
  arrow: {
    fontSize:   22,
    color:      Colors.textMuted,
    flexShrink: 0,
  },
  arrowExpanded: {
    color: Colors.primary,
  },

  // ── Sub-topics ──────────────────────────────────────────────────────────────
  subtopicsContainer: {
    marginTop:        4,
    marginLeft:       16,
    borderLeftWidth:  3,
    borderRadius:     0,
    paddingLeft:      12,
  },
  subtopicItem: {
    flexDirection:   'row',
    alignItems:      'center',
    backgroundColor: Colors.card,
    borderRadius:    10,
    paddingVertical: 11,
    paddingHorizontal: 14,
    marginBottom:    6,
    gap:             10,
    opacity:         0.92,
  },
  subtopicIcon: {
    fontSize:   22,
    flexShrink: 0,
  },
  subtopicThumb: {
    width:        36,
    height:       36,
    borderRadius: 8,
    flexShrink:   0,
  },
  subtopicName: {
    ...Typography.body,
    color: Colors.textPrimary,
    flex:  1,
  },
  subtopicArrow: {
    fontSize:   18,
    color:      Colors.textMuted,
    flexShrink: 0,
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
    color: Colors.textPrimary,
  },
  comingSoonSub: {
    ...Typography.body,
    color: Colors.textSecondary,
  },
});
