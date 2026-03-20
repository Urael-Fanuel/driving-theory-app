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
    backgroundColor: Colors.background,
  },
  backButton: {
    width:           52,
    height:          52,
    borderRadius:    26,
    backgroundColor: Colors.card,
    justifyContent:  'center',
    alignItems:      'center',
    margin:          16,
  },
  backIcon: {
    fontSize: 24,
    color:    Colors.textPrimary,
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
    backgroundColor: Colors.card,
    borderRadius:    16,
    overflow:        'hidden',
    position:        'relative',
    borderWidth:     1,
    borderColor:     Colors.border,
  },
  signCardViewed: {
    opacity: 0.7,
    borderColor: Colors.primary,
    borderWidth: 2,
  },
  signImage: {
    width:           '100%',
    height:          '100%',
    backgroundColor: '#FFFFFF',
  },
  signPlaceholder: {
    flex:            1,
    justifyContent:  'center',
    alignItems:      'center',
    backgroundColor: Colors.surface,
  },
  signPlaceholderIcon: {
    fontSize: 32,
  },
  signNumberBadge: {
    position:        'absolute',
    top:             4,
    left:            4,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius:    4,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  signNumberText: {
    color:      '#FFFFFF',
    fontSize:   10,
    fontWeight: 'bold',
  },
  viewedBadge: {
    position:        'absolute',
    top:             4,
    right:           4,
    width:           22,
    height:          22,
    borderRadius:    11,
    backgroundColor: Colors.primary,
    justifyContent:  'center',
    alignItems:      'center',
  },
  viewedIcon: {
    fontSize: 12,
    color:    Colors.textPrimary,
    fontWeight: '700',
  },
});
