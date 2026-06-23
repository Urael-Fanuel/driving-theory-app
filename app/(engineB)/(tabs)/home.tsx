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
  Share,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Colors } from '../../../constants/colors';
import { Typography } from '../../../constants/typography';
import { TopicCard } from '../../../components/shared/TopicCard';
import { FloatingCard } from '../../../components/shared/FloatingCard';
import { LoadingScreen } from '../../../components/shared/LoadingScreen';
import { DBTopic } from '../../../backend/supabaseClient';
import * as api from '../../../backend/api';
import { useAudio } from '../../../hooks/useAudio';
import { useProgress } from '../../../hooks/useProgress';
import { AdCard } from '../../../components/shared/AdCard';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { BannerAd, BannerAdSize, TestIds } from 'react-native-google-mobile-ads';

const BANNER_AD_UNIT_ID = __DEV__
  ? TestIds.ADAPTIVE_BANNER
  : 'ca-app-pub-XXXXXXXXXXXXXXXX/XXXXXXXXXX'; // החלף ב-ID האמיתי שלך מ-AdMob

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

  const handleShare = async () => {
    await Share.share({
      message: 'አብረን በደስታ እንማር 🚗',
    });
  };

  if (loading) return <LoadingScreen message="ርዕሰ ጉዳዮችን እየጫነ..." />;

  const BORDER_COLORS = ['#2e7d32', '#f1c048', '#c62828'];

  const getTopicProgress = (topicId: string) =>
    topicsProgress.find(p => p.topicId === topicId)?.masteryPercent ?? 0;

  return (
    <SafeAreaView style={styles.safeArea}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={styles.appTitle}>መንጃ ፍቃድ</Text>
          <Text style={styles.appSubtitle}>ትምህርት ጀምር</Text>
        </View>
        <TouchableOpacity
          onPress={handleShare}
          style={styles.shareButton}
          accessibilityLabel="שתף"
        >
          <MaterialCommunityIcons name="share-variant" size={20} color="#555555" />
        </TouchableOpacity>
      </View>

      {/* Topics list */}
      <FlatList
        data={topics}
        keyExtractor={t => t.id}
        renderItem={({ item, index }) => (
          <FloatingCard index={index}>
            <TopicCard
              topic={item}
              showText
              onPress={handleTopicPress}
              progressPercent={getTopicProgress(item.id)}
              style={styles.topicCard}
              accentColor={BORDER_COLORS[Math.floor(index / 2) % 3]}
            />
          </FloatingCard>
        )}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        ListFooterComponent={
          <View style={styles.adFooter}>
            <AdCard
              variant="instructor"
              name="יוסי לוי"
              tagline="ታማኝ፣ ታጋሽ እና ባለሙያ"
              location="ቴል አቪቭ"
              phone="0501234567"
            />
            <AdCard
              variant="business"
              businessName="מנורה ביטוח רכב"
              description="በአንድ ደቂቃ ዋጋ ያግኙ — ለአዲስ ፈቃድ ልዩ ዋጋ"
              ctaLabel="ዝርዝሮች"
              ctaUrl="https://www.menora.co.il"
            />
          </View>
        }
      />

      {/* AdMob Banner */}
      <View style={styles.bannerContainer}>
        <BannerAd
          unitId={BANNER_AD_UNIT_ID}
          size={BannerAdSize.ANCHORED_ADAPTIVE_BANNER}
          requestOptions={{ requestNonPersonalizedAdsOnly: false }}
        />
      </View>

      {/* Quick access buttons */}
      <View style={styles.quickAccess}>
        <TouchableOpacity
          style={[styles.quickBtn, { backgroundColor: '#FDD835' }]}
          onPress={() => router.push('/(engineB)/topic-quiz/daily' as any)}
          activeOpacity={0.85}
          accessibilityLabel="ጥያቄዎች ለዛሬ"
        >
          <Text style={styles.quickBtnIcon}>⭐</Text>
          <Text style={[styles.quickBtnText, { color: '#191c1e' }]}>ጥያቄዎች ለዛሬ</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.quickBtn, { backgroundColor: Colors.accent }]}
          onPress={() => router.push('/(engineB)/exam' as any)}
          activeOpacity={0.85}
          accessibilityLabel="ፈተና ጀምር"
        >
          <Text style={styles.quickBtnIcon}>📝</Text>
          <Text style={styles.quickBtnText}>ፈተና</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.quickBtn, { backgroundColor: '#ffffff', borderWidth: 1.5, borderColor: '#dde3ea' }]}
          onPress={() => router.push('/(engineB)/progress' as any)}
          activeOpacity={0.85}
          accessibilityLabel="እድገቴ"
        >
          <Text style={styles.quickBtnIcon}>📊</Text>
          <Text style={[styles.quickBtnText, { color: '#191c1e' }]}>እድገት</Text>
        </TouchableOpacity>
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
  header: {
    flexDirection:     'row',
    alignItems:        'center',
    justifyContent:    'space-between',
    paddingHorizontal: 20,
    paddingTop:        20,
    paddingBottom:     12,
  },
  headerText: {
    flex: 1,
  },
  appTitle: {
    ...Typography.h1,
    color: '#191c1e',
  },
  appSubtitle: {
    ...Typography.body,
    color:     '#404943',
    marginTop: 4,
  },
  shareButton: {
    width:           44,
    height:          44,
    borderRadius:    22,
    backgroundColor: '#eeeeee',
    justifyContent:  'center',
    alignItems:      'center',
    borderWidth:     1,
    borderColor:     '#dde3ea',
  },
  list: {
    paddingHorizontal: 20,
    paddingTop:        8,
  },
  adFooter: {
    gap:           12,
    paddingTop:    12,
    paddingBottom: 12,
  },
  topicCard: {
    marginBottom: 12,
  },
  bannerContainer: {
    alignItems:    'center',
    paddingBottom: 4,
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
