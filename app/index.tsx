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

import React, { useCallback, useEffect, useRef, useState } from 'react';
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
import { useAudio, playAndAwaitAudio } from '../hooks/useAudio';
import { useEngine } from '../contexts/EngineContext';
import DisclaimerModal from '../components/shared/DisclaimerModal';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// Module-level flag — persists across re-mounts within the same JS session
let welcomeSequencePlayed = false;

// ─── Component ────────────────────────────────────────────────────────────────

export default function EngineSelectionScreen() {
  const router        = useRouter();
  const { setEngineType, hasSeenDisclaimer, acceptDisclaimer, isLoading } = useEngine();
  const { playAudio, stopAudio, pauseAudio, resumeAudio, audioState } = useAudio();
  const [highlightedEngine, setHighlightedEngine] = useState<'A' | 'B' | null>(null);
  const activeTokenRef = useRef<{ cancelled: boolean } | null>(null);

  // Entrance animations
  const titleAnim  = useRef(new Animated.Value(0)).current;
  const cardAAnim  = useRef(new Animated.Value(60)).current;
  const cardBAnim  = useRef(new Animated.Value(60)).current;
  const fadeAnim   = useRef(new Animated.Value(0)).current;

  // Pulse animation for speaker buttons
  const pulseAnim  = useRef(new Animated.Value(1)).current;

  // Cancel sequence and stop audio when leaving screen
  useEffect(() => {
    return () => {
      if (activeTokenRef.current) activeTokenRef.current.cancelled = true;
      stopAudio().catch(() => {});
    };
  }, []);

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.18, duration: 700, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1,    duration: 700, useNativeDriver: true }),
      ])
    ).start();
  }, []);

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

    // Auto-play sequence only on first visit after disclaimer (not on return visits)
    if (!isLoading && hasSeenDisclaimer && !welcomeSequencePlayed) {
      welcomeSequencePlayed = true;
      runWelcomeSequence();
    }
  }, [isLoading, hasSeenDisclaimer]);

  const runWelcomeSequence = useCallback(async () => {
    const token = { cancelled: false };
    activeTokenRef.current = token;
    try {
      await playAndAwaitAudio('assets/audio/welcome_select_mode.mp3', () => token.cancelled);
      if (token.cancelled) return;
      setHighlightedEngine('A');
      await playAndAwaitAudio('assets/audio/explain_mode_a.mp3', () => token.cancelled);
      if (token.cancelled) return;
      setHighlightedEngine('B');
      await playAndAwaitAudio('assets/audio/explain_mode_b.mp3', () => token.cancelled);
    } finally {
      setHighlightedEngine(null);
    }
  }, []);

  const selectEngine = (engine: 'A' | 'B') => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (activeTokenRef.current) activeTokenRef.current.cancelled = true;
    stopAudio().catch(() => {});
    setHighlightedEngine(engine);
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

    // Toggle pause/resume if this engine is already active
    if (highlightedEngine === engine) {
      if (audioState === 'playing') { await pauseAudio().catch(() => {}); return; }
      if (audioState === 'paused')  { await resumeAudio().catch(() => {}); return; }
    }

    // Cancel any running sequence and start fresh
    if (activeTokenRef.current) activeTokenRef.current.cancelled = true;
    await stopAudio();
    setHighlightedEngine(engine);
    const audioFile = engine === 'A'
      ? 'assets/audio/explain_mode_a.mp3'
      : 'assets/audio/explain_mode_b.mp3';
    await playAndAwaitAudio(audioFile, () => false).catch(() => {});
    setHighlightedEngine(null);
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      {/* Disclaimer — shown once on first launch */}
      {!isLoading && (
        <DisclaimerModal
          visible={!hasSeenDisclaimer}
          onAccept={acceptDisclaimer}
        />
      )}

      <Animated.View style={[styles.container, { opacity: fadeAnim }]}>
        {/* App title */}
        <Animated.View style={[styles.titleContainer, { opacity: titleAnim }]}>
          <Text style={styles.flagEmoji}>🇪🇹</Text>
          <Text style={styles.appTitle}>ሹፌርነት ትምህርት</Text>
        </Animated.View>

        {/* Engine A Card — NON-READER */}
        <Animated.View style={{ transform: [{ translateY: cardAAnim }] }}>
          <TouchableOpacity
            style={[styles.engineCard, styles.engineCardA, highlightedEngine === 'A' && styles.cardHighlighted]}
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
              onPress={(e) => { e.stopPropagation(); explainEngine('A'); }}
              accessibilityLabel="ይህ ምርጫ ምን ማለት ነው?"
              style={styles.infoButtonWrapper}
            >
              <Animated.View style={[styles.infoButton, { transform: [{ scale: pulseAnim }] }]}>
                <Text style={styles.infoIcon}>
                  {highlightedEngine === 'A' && audioState === 'playing' ? '⏸' : '▶️'}
                </Text>
              </Animated.View>
              <Text style={styles.infoHint}>ይጫኑ</Text>
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
            style={[styles.engineCard, styles.engineCardB, highlightedEngine === 'B' && styles.cardHighlighted]}
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
              onPress={(e) => { e.stopPropagation(); explainEngine('B'); }}
              accessibilityLabel="ይህ ምርጫ ምን ማለት ነው?"
              style={styles.infoButtonWrapper}
            >
              <Animated.View style={[styles.infoButton, { transform: [{ scale: pulseAnim }] }]}>
                <Text style={styles.infoIcon}>
                  {highlightedEngine === 'B' && audioState === 'playing' ? '⏸' : '▶️'}
                </Text>
              </Animated.View>
              <Text style={styles.infoHintDark}>ይጫኑ</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </Animated.View>

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
  cardHighlighted: {
    borderWidth:   3,
    borderColor:   Colors.secondary,
    shadowColor:   Colors.secondary,
    shadowOpacity: 0.9,
    shadowRadius:  20,
    elevation:     20,
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
  infoButtonWrapper: {
    alignItems: 'center',
    gap:        4,
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
  infoHint: {
    fontSize:   11,
    color:      'rgba(255,255,255,0.85)',
    fontWeight: '600',
  },
  infoHintDark: {
    fontSize:   11,
    color:      Colors.textSecondary,
    fontWeight: '600',
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
