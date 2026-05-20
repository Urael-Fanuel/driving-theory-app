/**
 * AGENT 3 — app/(engineA)/topic/[id].tsx
 * Engine A Topic Screen — Sign Grid.
 *
 * Shows all signs for a topic as a grid of IMAGES ONLY.
 * No text. User taps image → goes to sign video screen.
 */

import React, { useEffect, useState } from 'react';
import { extractSignNumber, shouldShowSignBadge } from '../../../utils/signNumber';
import {
  View,
  Image,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  SafeAreaView,
  Text,
  Dimensions,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Colors } from '../../../constants/colors';
import { LoadingScreen } from '../../../components/shared/LoadingScreen';
import { DBSign } from '../../../backend/supabaseClient';
import * as api from '../../../backend/api';
import { useProgress } from '../../../hooks/useProgress';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_SIZE = (SCREEN_WIDTH - 48 - 16) / 3; // 3 columns

// ─── Component ────────────────────────────────────────────────────────────────

export default function EngineATopicScreen() {
  const { id }          = useLocalSearchParams<{ id: string }>();
  const router          = useRouter();
  const { isSignViewed } = useProgress();

  const [signs,   setSigns]   = useState<DBSign[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const data = await api.getSignsByTopic(id);
        setSigns(data);
      } catch (err) {
        console.error('[EngineA/topic] Failed to load signs:', err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id]);

  const handleSignPress = (sign: DBSign) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.push(`/(engineA)/sign/${sign.id}`);
  };

  const handleBack = async () => {
    await Haptics.selectionAsync();
    router.back();
  };

  if (loading) return <LoadingScreen />;

  const renderSign = ({ item }: { item: DBSign }) => {
    const viewed = isSignViewed(item.id);
    return (
      <TouchableOpacity
        style={[styles.signCard, viewed && styles.signCardViewed]}
        onPress={() => handleSignPress(item)}
        activeOpacity={0.8}
        accessibilityLabel={item.name_amharic}
      >
        {item.image_url ? (
          <Image
            source={{ uri: item.image_url }}
            style={styles.signImage}
            resizeMode="contain"
            onError={(e) => console.warn('[SignA] Image load error:', item.id, e.nativeEvent.error)}
          />
        ) : (
          <View style={styles.signPlaceholder}>
            <Text style={styles.signPlaceholderIcon}>🚦</Text>
          </View>
        )}

        {/* Sign number badge */}
        {shouldShowSignBadge(item.image_url) && (
          <View style={styles.signNumberBadge}>
            <Text style={styles.signNumberText}>{extractSignNumber(item.image_url)}</Text>
          </View>
        )}

        {/* Viewed indicator */}
        {viewed && (
          <View style={styles.viewedBadge}>
            <Text style={styles.viewedIcon}>✓</Text>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      {/* Back button */}
      <TouchableOpacity style={styles.backButton} onPress={handleBack}>
        <Text style={styles.backIcon}>←</Text>
      </TouchableOpacity>

      <FlatList
        data={signs}
        keyExtractor={s => s.id}
        renderItem={renderSign}
        numColumns={3}
        contentContainerStyle={styles.grid}
        columnWrapperStyle={styles.row}
        showsVerticalScrollIndicator={false}
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
  backButton: {
    width:           48,
    height:          48,
    borderRadius:    24,
    backgroundColor: '#ffffff',
    justifyContent:  'center',
    alignItems:      'center',
    margin:          16,
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
  grid: {
    paddingHorizontal: 16,
    paddingBottom:     24,
    gap: 12,
  },
  row: {
    gap: 12,
  },
  signCard: {
    width:           CARD_SIZE,
    height:          CARD_SIZE,
    backgroundColor: '#ffffff',
    borderRadius:    16,
    overflow:        'hidden',
    position:        'relative',
    shadowColor:     '#000',
    shadowOffset:    { width: 0, height: 3 },
    shadowOpacity:   0.10,
    shadowRadius:    8,
    elevation:       4,
  },
  signCardViewed: {
    opacity: 0.75,
  },
  signImage: {
    width:           '100%',
    height:          '100%',
    backgroundColor: '#ffffff',
  },
  signPlaceholder: {
    flex:            1,
    justifyContent:  'center',
    alignItems:      'center',
    backgroundColor: '#f0f4f8',
  },
  signPlaceholderIcon: {
    fontSize: 32,
  },
  signNumberBadge: {
    position:          'absolute',
    top:               5,
    left:              5,
    backgroundColor:   'rgba(255,255,255,0.92)',
    borderRadius:      5,
    paddingHorizontal: 5,
    paddingVertical:   2,
  },
  signNumberText: {
    color:      '#404943',
    fontSize:   10,
    fontWeight: '700',
  },
  viewedBadge: {
    position:        'absolute',
    top:             5,
    right:           5,
    width:           22,
    height:          22,
    borderRadius:    11,
    backgroundColor: '#2e7d32',
    justifyContent:  'center',
    alignItems:      'center',
  },
  viewedIcon: {
    fontSize:   11,
    color:      '#ffffff',
    fontWeight: '700',
  },
});
