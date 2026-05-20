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

// ─── Scaffold data ────────────────────────────────────────────────────────────
import vehicleKnowledgeData from '../../../content/vehicle_knowledge_scaffold.json';
import mindSafetyData       from '../../../content/mind_safety_scaffold.json';
import societyLawData       from '../../../content/society_law_scaffold.json';

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

const SCAFFOLD_MAP: Record<string, ScaffoldData> = {
  vehicle_knowledge: vehicleKnowledgeData as ScaffoldData,
  mind_safety:       mindSafetyData       as ScaffoldData,
  society_law:       societyLawData       as ScaffoldData,
};

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const SUBTOPIC_CARD = (SCREEN_WIDTH - 48 - 24) / 3;

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
          <Text style={styles.levelIcon}>{item.icon}</Text>

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
    justifyContent:    'space-between',
    paddingHorizontal: 16,
    paddingVertical:   14,
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
    backgroundColor: Colors.card,
    borderRadius:    18,
    padding:         16,
    gap:             16,
    shadowColor:     '#000',
    shadowOffset:    { width: 0, height: 3 },
    shadowOpacity:   0.18,
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
    backgroundColor: Colors.card,
    borderRadius:    14,
    justifyContent:  'center',
    alignItems:      'center',
    shadowColor:     '#000',
    shadowOffset:    { width: 0, height: 2 },
    shadowOpacity:   0.12,
    shadowRadius:    4,
    elevation:       2,
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
