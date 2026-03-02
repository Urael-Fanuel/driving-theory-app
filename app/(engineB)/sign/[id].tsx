/**
 * AGENT 3 — app/(engineB)/sign/[id].tsx
 * Engine B Sign Detail Screen — Image + full Amharic text explanation.
 *
 * Layout:
 * ┌─────────────────────┐
 * │ [← Back]            │
 * │ [Sign Image 200px]  │
 * │ ████ ███ (name)     │
 * │ [🔊]               │
 * │                     │
 * │ ████ ██ █████       │  ← Full explanation text
 * │ [🔊 Listen]         │
 * │                     │
 * │ [▶ Practice Quiz]   │
 * │ [▶ Watch Video]     │
 * └─────────────────────┘
 */

import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ScrollView,
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

  const [sign,    setSign]    = useState<DBSign | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const allSigns = await api.getAllSigns();
        const found    = allSigns.find(s => s.id === id) ?? null;
        setSign(found);
        if (found) markSignViewed(found.id);
      } catch (err) {
        console.error('[EngineB/sign] Failed to load:', err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id]);

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

  return (
    <SafeAreaView style={styles.safeArea}>
      {/* Header with back button */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={handleBack}>
          <Text style={styles.backIcon}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {sign.name_amharic}
        </Text>
        <View style={{ width: 44 }} />
      </View>

      {/* Sign detail (image + text + audio) */}
      <SignTextDetail sign={sign} style={styles.detail} />

      {/* Bottom action buttons */}
      <View style={styles.actionContainer}>
        {/* Practice Quiz */}
        <TouchableOpacity
          style={[styles.actionButton, styles.practiceButton]}
          onPress={handlePractice}
          activeOpacity={0.85}
          accessibilityLabel="ልምምድ ጀምር"
        >
          <Text style={styles.actionIcon}>📝</Text>
          <Text style={styles.actionText}>ልምምድ</Text>
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
  header: {
    flexDirection:     'row',
    alignItems:        'center',
    paddingHorizontal: 16,
    paddingVertical:   14,
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
  headerTitle: {
    ...Typography.h3,
    color:     Colors.textPrimary,
    flex:      1,
    textAlign: 'center',
  },
  detail: {
    flex: 1,
  },
  actionContainer: {
    paddingHorizontal: 20,
    paddingVertical:   16,
    borderTopWidth:    1,
    borderTopColor:    Colors.border,
  },
  actionButton: {
    flexDirection:   'row',
    alignItems:      'center',
    justifyContent:  'center',
    borderRadius:    16,
    paddingVertical: 16,
    gap:             12,
  },
  practiceButton: {
    backgroundColor: Colors.primary,
  },
  actionIcon: {
    fontSize: 26,
  },
  actionText: {
    ...Typography.answer,
    color:      Colors.textPrimary,
    fontWeight: '700',
  },
});
