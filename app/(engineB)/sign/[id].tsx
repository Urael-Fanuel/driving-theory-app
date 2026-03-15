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

// ─── Component ────────────────────────────────────────────────────────────────

export default function EngineBSignScreen() {
  const { id }  = useLocalSearchParams<{ id: string }>();
  const router  = useRouter();
  const { markSignViewed } = useProgress();

  const [sign,       setSign]       = useState<DBSign | null>(null);
  const [topicSigns, setTopicSigns] = useState<DBSign[]>([]);
  const [loading,    setLoading]    = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const allSigns = await api.getAllSigns();
        const found    = allSigns.find(s => s.id === id) ?? null;
        setSign(found);
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
    router.replace({
      pathname: '/(engineB)/sign/[id]',
      params: { id: prevSign.id },
    } as any);
  };

  const handleNext = async () => {
    if (!nextSign) return;
    await Haptics.selectionAsync();
    router.replace({
      pathname: '/(engineB)/sign/[id]',
      params: { id: nextSign.id },
    } as any);
  };

  const handlePractice = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.push(`/(engineB)/question/${id}_q0`);
  };

  const handleBack = async () => {
    await Haptics.selectionAsync();
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
            <Text style={styles.navBtnIcon}>⬅️</Text>
          </TouchableOpacity>

          <View style={styles.navSpacer} />

          <TouchableOpacity
            style={[styles.navBtn, !nextSign && styles.navBtnDisabled]}
            onPress={handleNext}
            disabled={!nextSign}
            accessibilityLabel="ወደ ቀጣይ ምልክት"
          >
            <Text style={styles.navBtnIcon}>➡️</Text>
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
    backgroundColor: Colors.background,
  },

  // ── Header ──────────────────────────────────────────────────────────────────
  header: {
    flexDirection:     'row',
    alignItems:        'center',
    paddingHorizontal: 16,
    paddingVertical:   12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
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
  positionLabel: {
    ...Typography.body,
    color:      Colors.textSecondary,
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
    borderTopColor:    Colors.border,
    gap:               12,
  },
  navRow: {
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'space-between',
  },
  navBtn: {
    width:           56,
    height:          56,
    borderRadius:    28,
    backgroundColor: Colors.card,
    justifyContent:  'center',
    alignItems:      'center',
  },
  navBtnDisabled: {
    opacity: 0.3,
  },
  navBtnIcon: {
    fontSize: 24,
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
    backgroundColor: Colors.primary,
    gap:             12,
  },
  practiceIcon: {
    fontSize: 26,
  },
  practiceText: {
    ...Typography.answer,
    color:      Colors.textPrimary,
    fontWeight: '700',
  },
});
