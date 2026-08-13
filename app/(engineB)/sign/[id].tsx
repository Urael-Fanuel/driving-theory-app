/**
 * app/(engineB)/sign/[id].tsx
 * Engine B Sign Detail Screen — Text-first for readers.
 *
 * Layout:
 * ┌─────────────────────┐
 * │ [← Back]            │
 * │                     │
 * │  Image + Name       │  ← SignTextDetail (scrollable)
 * │  Explanation text   │
 * │  [🔊] optional      │
 * │                     │
 * ├─────────────────────┤
 * │    [⬅️]      [➡️]   │  ← Prev / Next sign
 * │  [📝 Practice Quiz] │
 * └─────────────────────┘
 */

import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Colors } from '../../../constants/colors';
import { Typography } from '../../../constants/typography';
import { LoadingScreen } from '../../../components/shared/LoadingScreen';
import { SignTextDetail } from '../../../components/engineB/SignTextDetail';
import { DBSign } from '../../../backend/supabaseClient';
import * as api from '../../../backend/api';
import { useProgress } from '../../../hooks/useProgress';
import { useAudio } from '../../../hooks/useAudio';
import { OfflineBanner } from '../../../components/shared/OfflineBanner';
import { prefetchSignAudio } from '../../../services/audioCache';

// ─── Component ────────────────────────────────────────────────────────────────

export default function EngineBSignScreen() {
  const { id }  = useLocalSearchParams<{ id: string }>();
  const router  = useRouter();
  const { markSignViewed } = useProgress();
  const { stopAudio } = useAudio();

  const [sign,       setSign]       = useState<DBSign | null>(null);

  // Stop audio when leaving this screen
  useEffect(() => {
    return () => { stopAudio(); };
  }, []);
  const [topicSigns, setTopicSigns] = useState<DBSign[]>([]);
  const [loading,    setLoading]    = useState(() => !api.getSignsFromCache());

  useEffect(() => {
    async function load() {
      try {
        const allSigns = await api.getAllSigns();
        const found    = allSigns.find(s => s.id === id) ?? null;
        setSign(found);

        // Get this sign's explanation AND question audio onto disk now, while
        // the user is still reading the explanation. By the time they tap
        // through to the questions it is already local, so losing reception in
        // between changes nothing. getQuestionsBySign is cached, so the question
        // screen reuses this result instead of fetching again.
        api.getQuestionsBySign(id)
          .then(qs => prefetchSignAudio(found, qs))
          .catch(() => {});

        if (found) {
          markSignViewed(found.id);
          const sorted = allSigns
            .filter(s => s.topic_id === found.topic_id)
            .sort((a, b) => a.display_order - b.display_order);
          setTopicSigns(sorted);
        }
      } catch (err) {
        console.error('[EngineB/sign] Failed to load:', err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id]);

  // ── Prev / Next sign navigation ──────────────────────────────────────────────

  const currentIndex = topicSigns.findIndex(s => s.id === id);
  const prevSign     = currentIndex > 0 ? topicSigns[currentIndex - 1] : null;
  const nextSign     = currentIndex < topicSigns.length - 1 ? topicSigns[currentIndex + 1] : null;

  const handlePrev = async () => {
    if (!prevSign) return;
    await Haptics.selectionAsync();
    await stopAudio();
    router.replace({
      pathname: '/(engineB)/sign/[id]',
      params: { id: prevSign.id },
    } as any);
  };

  const handleNext = async () => {
    if (!nextSign) return;
    await Haptics.selectionAsync();
    await stopAudio();
    router.replace({
      pathname: '/(engineB)/sign/[id]',
      params: { id: nextSign.id },
    } as any);
  };

  const navigateToQuiz = () => router.push(`/(engineB)/question/${id}_q0`);

  const handlePractice = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await stopAudio();
    navigateToQuiz();
  };

  const handleBack = async () => {
    await Haptics.selectionAsync();
    await stopAudio();
    router.back();
  };

  if (loading) return <LoadingScreen message="ምልክቱን እየጫነ..." />;
  if (!sign)   return <LoadingScreen message="ምልክቱ አልተገኘም" />;

  // Position indicator: e.g. "3 / 12"
  const positionLabel = currentIndex >= 0
    ? `${currentIndex + 1} / ${topicSigns.length}`
    : '';

  return (
    <SafeAreaView style={styles.safeArea}>
      <OfflineBanner />

      {/* Header — back button + position */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={handleBack}>
          <Text style={styles.backIcon}>←</Text>
        </TouchableOpacity>
        <Text style={styles.positionLabel}>{positionLabel}</Text>
        <View style={{ width: 44 }} />
      </View>

      {/* Sign detail — image + name + explanation + optional 🔊 */}
      <SignTextDetail sign={sign} style={styles.detail} />

      {/* Bottom controls */}
      <View style={styles.bottomContainer}>

        {/* Prev / Next sign navigation */}
        <View style={styles.navRow}>
          <TouchableOpacity
            style={[styles.navBtn, !prevSign && styles.navBtnDisabled]}
            onPress={handlePrev}
            disabled={!prevSign}
            accessibilityLabel="ወደ ቀዳሚ ምልክት"
          >
            <Text style={[styles.navBtnIcon, !prevSign && styles.navBtnIconDisabled]}>‹</Text>
          </TouchableOpacity>

          <View style={styles.navSpacer} />

          <TouchableOpacity
            style={[styles.navBtn, !nextSign && styles.navBtnDisabled]}
            onPress={handleNext}
            disabled={!nextSign}
            accessibilityLabel="ወደ ቀጣይ ምልክት"
          >
            <Text style={[styles.navBtnIcon, !nextSign && styles.navBtnIconDisabled]}>›</Text>
          </TouchableOpacity>
        </View>

        {/* Practice button */}
        <TouchableOpacity
          style={styles.practiceButton}
          onPress={handlePractice}
          activeOpacity={0.85}
          accessibilityLabel="ልምምድ ጀምር"
        >
          <Text style={styles.practiceIcon}>📝</Text>
          <Text style={styles.practiceText}>ልምምድ</Text>
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

  // ── Header ──────────────────────────────────────────────────────────────────
  header: {
    flexDirection:     'row',
    alignItems:        'center',
    paddingHorizontal: 16,
    paddingVertical:   12,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
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
  positionLabel: {
    ...Typography.body,
    color:      '#404943',
    flex:       1,
    textAlign:  'center',
    fontWeight: '600',
  },

  // ── Content ─────────────────────────────────────────────────────────────────
  detail: {
    flex: 1,
  },

  // ── Bottom ──────────────────────────────────────────────────────────────────
  bottomContainer: {
    paddingHorizontal: 20,
    paddingVertical:   14,
    borderTopWidth:    1,
    borderTopColor:    '#eee',
    gap:               12,
  },
  navRow: {
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'space-between',
  },
  navBtn: {
    width:           64,
    height:          64,
    borderRadius:    32,
    backgroundColor: '#ffffff',
    justifyContent:  'center',
    alignItems:      'center',
    shadowColor:     '#000',
    shadowOffset:    { width: 0, height: 2 },
    shadowOpacity:   0.10,
    shadowRadius:    6,
    elevation:       3,
  },
  navBtnDisabled: {
    opacity: 0.25,
  },
  navBtnIcon: {
    fontSize:   34,
    color:      '#1565C0',
    fontWeight: '300',
    lineHeight: 40,
  },
  navBtnIconDisabled: {
    color: '#9e9e9e',
  },
  navSpacer: {
    flex: 1,
  },
  practiceButton: {
    flexDirection:   'row',
    alignItems:      'center',
    justifyContent:  'center',
    borderRadius:    16,
    paddingVertical: 16,
    backgroundColor: '#2E7D32',
    gap:             12,
  },
  practiceIcon: {
    fontSize: 26,
  },
  practiceText: {
    ...Typography.answer,
    color:      '#ffffff',
    fontWeight: '700',
  },
});
