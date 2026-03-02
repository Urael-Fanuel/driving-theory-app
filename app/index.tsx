/**
 * AGENT 3 — app/index.tsx
 * Engine Selection Screen (Onboarding).
 *
 * This is the FIRST screen the user sees.
 * Engine A users may have NEVER used a smartphone — design for zero digital literacy.
 *
 * Layout:
 * ┌─────────────────────────────────┐
 * │     🇪🇹  ሹፌርነት ትምህርት         │
 * │                                 │
 * │  ┌───────────────────────────┐  │
 * │  │  🎧                       │  │  ← Engine A card (Non-reader)
 * │  │  [🔊] hear what this is   │  │
 * │  └───────────────────────────┘  │
 * │                                 │
 * │  ┌───────────────────────────┐  │
 * │  │  📖  ፅሁፍ                 │  │  ← Engine B card (Amharic reader)
 * │  │  [🔊] hear what this is   │  │
 * │  └───────────────────────────┘  │
 * └─────────────────────────────────┘
 *
 * On mount: auto-play welcome audio
 */

import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Dimensions,
  SafeAreaView,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Colors } from '../constants/colors';
import { Typography } from '../constants/typography';
import { useAudio } from '../hooks/useAudio';
import { useEngine } from '../contexts/EngineContext';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// ─── Component ────────────────────────────────────────────────────────────────

export default function EngineSelectionScreen() {
  const router        = useRouter();
  const { setEngineType } = useEngine();
  const { playAudio } = useAudio();

  // Entrance animations
  const titleAnim  = useRef(new Animated.Value(0)).current;
  const cardAAnim  = useRef(new Animated.Value(60)).current;
  const cardBAnim  = useRef(new Animated.Value(60)).current;
  const fadeAnim   = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Staggered entrance
    Animated.parallel([
      Animated.timing(fadeAnim,  { toValue: 1, duration: 600, useNativeDriver: true }),
      Animated.timing(titleAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
    ]).start();

    Animated.stagger(200, [
      Animated.spring(cardAAnim, { toValue: 0, useNativeDriver: true, speed: 10 }),
      Animated.spring(cardBAnim, { toValue: 0, useNativeDriver: true, speed: 10 }),
    ]).start();

    // Auto-play welcome audio
    // "እንኳን ደህና መጡ! ድምጽ ወይም ፅሁፍ ይምረጡ"
    playAudio('assets/audio/welcome_select_mode.mp3').catch(() => {});
  }, []);

  const selectEngine = (engine: 'A' | 'B') => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setEngineType(engine);

    if (engine === 'A') {
      router.replace('/(engineA)/home');
      playAudio('assets/audio/selected_mode_a.mp3').catch(() => {});
    } else {
      router.replace('/(engineB)/home');
      playAudio('assets/audio/selected_mode_b.mp3').catch(() => {});
    }
  };

  const explainEngine = async (engine: 'A' | 'B') => {
    await Haptics.selectionAsync();
    const audioFile = engine === 'A'
      ? 'assets/audio/explain_mode_a.mp3'
      : 'assets/audio/explain_mode_b.mp3';
    await playAudio(audioFile).catch(() => {});
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <Animated.View style={[styles.container, { opacity: fadeAnim }]}>
        {/* App title */}
        <Animated.View style={[styles.titleContainer, { opacity: titleAnim }]}>
          <Text style={styles.flagEmoji}>🇪🇹</Text>
          <Text style={styles.appTitle}>ሹፌርነት ትምህርት</Text>
        </Animated.View>

        {/* Engine A Card — NON-READER */}
        <Animated.View style={{ transform: [{ translateY: cardAAnim }] }}>
          <TouchableOpacity
            style={[styles.engineCard, styles.engineCardA]}
            onPress={() => selectEngine('A')}
            activeOpacity={0.85}
            accessibilityLabel="ድምጽ ብቻ ማጥናት - Engine A"
            accessibilityRole="button"
          >
            {/* Large icon — immediately understandable */}
            <View style={styles.engineIconWrapper}>
              <Text style={styles.engineIcon}>🎧</Text>
            </View>

            {/* Info button — plays audio explaining this mode */}
            <TouchableOpacity
              style={styles.infoButton}
              onPress={(e) => {
                e.stopPropagation();
                explainEngine('A');
              }}
              accessibilityLabel="ይህ ምርጫ ምን ማለት ነው?"
            >
              <Text style={styles.infoIcon}>🔊</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </Animated.View>

        {/* Divider */}
        <View style={styles.divider}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>ወይም</Text>
          <View style={styles.dividerLine} />
        </View>

        {/* Engine B Card — AMHARIC READER */}
        <Animated.View style={{ transform: [{ translateY: cardBAnim }] }}>
          <TouchableOpacity
            style={[styles.engineCard, styles.engineCardB]}
            onPress={() => selectEngine('B')}
            activeOpacity={0.85}
            accessibilityLabel="ፅሁፍና ድምጽ ማጥናት - Engine B"
            accessibilityRole="button"
          >
            <View style={styles.engineIconWrapper}>
              <Text style={styles.engineIcon}>📖</Text>
              <Text style={styles.engineLabel}>ፅሁፍ</Text>
            </View>

            {/* Info button */}
            <TouchableOpacity
              style={styles.infoButton}
              onPress={(e) => {
                e.stopPropagation();
                explainEngine('B');
              }}
              accessibilityLabel="ይህ ምርጫ ምን ማለት ነው?"
            >
              <Text style={styles.infoIcon}>🔊</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </Animated.View>

        {/* Welcome audio replay */}
        <TouchableOpacity
          style={styles.replayWelcome}
          onPress={() => playAudio('assets/audio/welcome_select_mode.mp3').catch(() => {})}
        >
          <Text style={styles.replayText}>🔊</Text>
        </TouchableOpacity>
      </Animated.View>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safeArea: {
    flex:            1,
    backgroundColor: Colors.background,
  },
  container: {
    flex:            1,
    alignItems:      'center',
    justifyContent:  'center',
    paddingHorizontal: 24,
    gap:             20,
  },
  titleContainer: {
    alignItems:   'center',
    marginBottom: 12,
  },
  flagEmoji: {
    fontSize:     56,
    marginBottom: 8,
  },
  appTitle: {
    ...Typography.h1,
    color:     Colors.textPrimary,
    textAlign: 'center',
  },

  // ── Engine cards ──────────────────────────────────────────────
  engineCard: {
    width:           SCREEN_WIDTH - 48,
    minHeight:       160,
    borderRadius:    24,
    flexDirection:   'row',
    alignItems:      'center',
    justifyContent:  'space-between',
    paddingHorizontal: 28,
    paddingVertical:   24,
    shadowColor:     '#000',
    shadowOffset:    { width: 0, height: 8 },
    shadowOpacity:   0.4,
    shadowRadius:    16,
    elevation:       12,
  },
  engineCardA: {
    backgroundColor: Colors.primary,
  },
  engineCardB: {
    backgroundColor: Colors.card,
    borderWidth:     2,
    borderColor:     Colors.secondary,
  },
  engineIconWrapper: {
    alignItems: 'center',
    gap:        8,
  },
  engineIcon: {
    fontSize: 72,
  },
  engineLabel: {
    ...Typography.h2,
    color: Colors.textPrimary,
  },
  infoButton: {
    width:           56,
    height:          56,
    borderRadius:    28,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent:  'center',
    alignItems:      'center',
  },
  infoIcon: {
    fontSize: 28,
  },

  // ── Divider ───────────────────────────────────────────────────
  divider: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           12,
    alignSelf:     'stretch',
  },
  dividerLine: {
    flex:            1,
    height:          1,
    backgroundColor: Colors.border,
  },
  dividerText: {
    ...Typography.caption,
    color: Colors.textMuted,
  },

  // ── Replay welcome ────────────────────────────────────────────
  replayWelcome: {
    marginTop: 8,
    padding:   12,
  },
  replayText: {
    fontSize: 24,
    color:    Colors.textSecondary,
  },
});
