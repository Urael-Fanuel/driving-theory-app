/**
 * AGENT 3 — app/(engineB)/topic/[id].tsx
 * Engine B Topic Screen — Sign list with image + Amharic text.
 */

import React, { useEffect, useState } from 'react';
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
import { LoadingScreen } from '../../../components/shared/LoadingScreen';
import { ProgressBar } from '../../../components/shared/ProgressBar';
import { DBSign, DBTopic } from '../../../backend/supabaseClient';
import * as api from '../../../backend/api';
import { useProgress } from '../../../hooks/useProgress';
import { extractSignNumber, shouldShowSignBadge } from '../../../utils/signNumber';

// ─── Component ────────────────────────────────────────────────────────────────

export default function EngineBTopicScreen() {
  const { id }  = useLocalSearchParams<{ id: string }>();
  const router  = useRouter();
  const { isSignViewed } = useProgress();

  const [topic,   setTopic]   = useState<DBTopic | null>(null);
  const [signs,   setSigns]   = useState<DBSign[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [topicData, signsData] = await Promise.all([
          api.getTopic(id),
          api.getSignsByTopic(id),
        ]);
        setTopic(topicData);
        setSigns(signsData);
      } catch (err) {
        console.error('[EngineB/topic] Failed to load:', err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id]);

  const handleSignPress = async (sign: DBSign) => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push(`/(engineB)/sign/${sign.id}`);
  };

  if (loading) return <LoadingScreen message="ምልክቶችን እየጫነ..." />;

  const viewedCount = signs.filter(s => isSignViewed(s.id)).length;

  const renderSign = ({ item }: { item: DBSign }) => {
    const viewed = isSignViewed(item.id);
    return (
      <TouchableOpacity
        style={[styles.signCard, viewed && styles.signCardViewed]}
        onPress={() => handleSignPress(item)}
        activeOpacity={0.85}
        accessibilityLabel={item.name_amharic}
      >
        {/* Sign image */}
        <View style={styles.signImageContainer}>
          {item.image_url ? (
            <Image
              source={{ uri: item.image_url }}
              style={styles.signImage}
              resizeMode="contain"
              onError={(e) => console.warn('[SignB] Image load error:', item.id, e.nativeEvent.error)}
            />
          ) : (
            <Text style={styles.imagePlaceholder}>🚦</Text>
          )}
          {shouldShowSignBadge(item.image_url) && (
            <View style={styles.signNumberBadge}>
              <Text style={styles.signNumberText}>{extractSignNumber(item.image_url)}</Text>
            </View>
          )}
        </View>

        {/* Sign name */}
        <View style={styles.signTextContainer}>
          <Text style={styles.signName} numberOfLines={2}>
            {item.name_amharic}
          </Text>
          {viewed && (
            <Text style={styles.viewedText}>✓ ታይቷል</Text>
          )}
        </View>

        {/* Arrow */}
        <Text style={styles.arrow}>›</Text>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: topic?.color ?? Colors.primary }]}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Text style={styles.backIcon}>←</Text>
        </TouchableOpacity>
        <View style={styles.headerText}>
          <Text style={styles.topicIcon}>{topic?.icon ?? '📋'}</Text>
          <Text style={styles.topicName} numberOfLines={1}>
            {topic?.name_amharic ?? ''}
          </Text>
        </View>
        <View style={{ width: 44 }} />
      </View>

      {/* Progress */}
      <View style={styles.progressContainer}>
        <ProgressBar
          current={viewedCount}
          total={signs.length}
          showLabel
          height={6}
        />
      </View>

      {/* Signs list */}
      <FlatList
        data={signs}
        keyExtractor={s => s.id}
        renderItem={renderSign}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        ListFooterComponent={
          signs.length > 0 ? (
            <TouchableOpacity
              style={styles.quizButton}
              onPress={() => router.push(`/(engineB)/topic-quiz/${id}` as any)}
              activeOpacity={0.85}
            >
              <Text style={styles.quizButtonIcon}>📝</Text>
              <Text style={styles.quizButtonText}>የርዕሰ ጉዳዩ ፈተና</Text>
            </TouchableOpacity>
          ) : (
            <View style={{ height: 20 }} />
          )
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
  backButton: {
    width:           48,
    height:          48,
    borderRadius:    24,
    backgroundColor: '#ffffff',
    justifyContent:  'center',
    alignItems:      'center',
    shadowColor:     '#000',
    shadowOffset:    { width: 0, height: 2 },
    shadowOpacity:   0.10,
    shadowRadius:    6,
    elevation:       3,
  },
  backIcon: {
    fontSize: 22,
    color:    '#191c1e',
  },
  headerText: {
    flex:              1,
    flexDirection:     'row',
    alignItems:        'center',
    gap:               10,
    paddingHorizontal: 12,
  },
  topicIcon: {
    fontSize: 28,
  },
  topicName: {
    ...Typography.h3,
    color: '#191c1e',
    flex:  1,
  },
  progressContainer: {
    paddingHorizontal: 16,
    paddingVertical:   12,
  },
  list: {
    paddingHorizontal: 16,
    paddingTop:        8,
  },
  signCard: {
    flexDirection:   'row',
    alignItems:      'center',
    backgroundColor: '#ffffff',
    borderRadius:    16,
    padding:         12,
    marginBottom:    10,
    gap:             12,
    shadowColor:     '#000',
    shadowOffset:    { width: 0, height: 3 },
    shadowOpacity:   0.10,
    shadowRadius:    8,
    elevation:       4,
  },
  signCardViewed: {
    opacity: 0.80,
  },
  signImageContainer: {
    width:           72,
    height:          72,
    borderRadius:    12,
    backgroundColor: '#ffffff',
    justifyContent:  'center',
    alignItems:      'center',
    overflow:        'hidden',
    flexShrink:      0,
    position:        'relative',
  },
  signNumberBadge: {
    position:          'absolute',
    top:               3,
    left:              3,
    backgroundColor:   'rgba(255,255,255,0.92)',
    borderRadius:      3,
    paddingHorizontal: 4,
    paddingVertical:   1,
    zIndex:            1,
  },
  signNumberText: {
    color:      '#404943',
    fontSize:   9,
    fontWeight: '700',
  },
  signImage: {
    width:           '100%',
    height:          '100%',
    backgroundColor: '#ffffff',
  },
  imagePlaceholder: {
    fontSize: 36,
  },
  signTextContainer: {
    flex: 1,
  },
  signName: {
    ...Typography.answer,
    color: '#191c1e',
  },
  viewedText: {
    ...Typography.caption,
    color:     '#2e7d32',
    marginTop: 4,
  },
  arrow: {
    fontSize: 24,
    color:    '#9e9e9e',
  },
  quizButton: {
    flexDirection:   'row',
    alignItems:      'center',
    justifyContent:  'center',
    gap:             10,
    marginTop:       16,
    marginBottom:    16,
    marginHorizontal: 16,
    paddingVertical: 18,
    borderRadius:    20,
    backgroundColor: Colors.accent,
    shadowColor:     '#000',
    shadowOffset:    { width: 0, height: 4 },
    shadowOpacity:   0.15,
    shadowRadius:    8,
    elevation:       5,
  },
  quizButtonIcon: {
    fontSize: 28,
  },
  quizButtonText: {
    fontSize:   18,
    fontWeight: '700',
    color:      '#ffffff',
  },
});
