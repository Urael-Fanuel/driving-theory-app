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
        ListFooterComponent={<View style={{ height: 20 }} />}
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
    flexDirection:    'row',
    alignItems:       'center',
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
  headerText: {
    flex:           1,
    flexDirection:  'row',
    alignItems:     'center',
    gap:            10,
    paddingHorizontal: 12,
  },
  topicIcon: {
    fontSize: 28,
  },
  topicName: {
    ...Typography.h3,
    color: Colors.textPrimary,
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
    backgroundColor: Colors.card,
    borderRadius:    16,
    padding:         12,
    marginBottom:    10,
    gap:             12,
    borderWidth:     1,
    borderColor:     Colors.border,
  },
  signCardViewed: {
    borderColor: Colors.primary,
    opacity:     0.85,
  },
  signImageContainer: {
    width:           72,
    height:          72,
    borderRadius:    12,
    backgroundColor: '#FFFFFF',
    justifyContent:  'center',
    alignItems:      'center',
    overflow:        'hidden',
    flexShrink:      0,
    position:        'relative',
  },
  signNumberBadge: {
    position:        'absolute',
    top:             3,
    left:            3,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius:    3,
    paddingHorizontal: 4,
    paddingVertical: 1,
    zIndex:          1,
  },
  signNumberText: {
    color:      '#FFFFFF',
    fontSize:   9,
    fontWeight: 'bold',
  },
  signImage: {
    width:           '100%',
    height:          '100%',
    backgroundColor: '#FFFFFF',
  },
  imagePlaceholder: {
    fontSize: 36,
  },
  signTextContainer: {
    flex: 1,
  },
  signName: {
    ...Typography.answer,
    color: Colors.textPrimary,
  },
  viewedText: {
    ...Typography.caption,
    color:     Colors.primary,
    marginTop: 4,
  },
  arrow: {
    fontSize: 24,
    color:    Colors.textMuted,
  },
});
