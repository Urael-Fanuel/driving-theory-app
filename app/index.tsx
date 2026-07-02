/**
 * app/index.tsx
 * Engine Selection Screen — first screen after disclaimer.
 *
 * Engine A = audio-only (non-readers)
 * Engine B = text + audio (Amharic readers)
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
  StatusBar,
} from 'react-native';

import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useAudio, playAndAwaitAudio } from '../hooks/useAudio';
import { useEngine } from '../contexts/EngineContext';
import DisclaimerModal from '../components/shared/DisclaimerModal';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// Design tokens
const C = {
  bg:         '#f7f9fb',
  cardA:      '#ffffff',
  cardABorder:'#2e7d32',
  cardB:      '#ffffff',
  cardBBorder:'#c62828',
  yellow:     '#f1c048',
  white:      '#ffffff',
  textPri:    '#191c1e',
  textSec:    '#404943',
  textMuted:  '#607d8b',
  border:     '#dde3ea',
  highlight:  '#f1c048',
};

// Module-level flag — persists across re-mounts within the same JS session
let welcomeSequencePlayed = false;

// ─── Component ────────────────────────────────────────────────────────────────

export default function EngineSelectionScreen() {
  const router = useRouter();
  const { setEngineType, hasSeenDisclaimer, acceptDisclaimer, isLoading } = useEngine();
  const { playAudio, stopAudio, pauseAudio, resumeAudio, audioState } = useAudio();
  const [highlightedEngine, setHighlightedEngine] = useState<'A' | 'B' | null>(null);
  const activeTokenRef = useRef<{ cancelled: boolean } | null>(null);

  // Entrance animations
  const fadeAnim   = useRef(new Animated.Value(0)).current;
  const cardAAnim  = useRef(new Animated.Value(60)).current;
  const cardBAnim  = useRef(new Animated.Value(60)).current;

  // Pulse animation for play buttons
  const pulseAnim = useRef(new Animated.Value(1)).current;

  // Cancel sequence and stop audio when leaving screen
  useEffect(() => {
    return () => {
      if (activeTokenRef.current) activeTokenRef.current.cancelled = true;
      stopAudio().catch(() => {});
    };
  }, []);

  // Pulse loop
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.2, duration: 750, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1,   duration: 750, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  // Entrance animation + welcome audio
  useEffect(() => {
    Animated.timing(fadeAnim, { toValue: 1, duration: 500, useNativeDriver: true }).start();

    Animated.stagger(180, [
      Animated.spring(cardAAnim, { toValue: 0, useNativeDriver: true, speed: 10, bounciness: 6 }),
      Animated.spring(cardBAnim, { toValue: 0, useNativeDriver: true, speed: 10, bounciness: 6 }),
    ]).start();

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
      router.replace('/(engineA)/home' as any);
      playAudio('assets/audio/selected_mode_a.mp3').catch(() => {});
    } else {
      router.replace('/(engineB)/home' as any);
      playAudio('assets/audio/selected_mode_b.mp3').catch(() => {});
    }
  };

  const explainEngine = async (engine: 'A' | 'B') => {
    await Haptics.selectionAsync();

    if (highlightedEngine === engine) {
      if (audioState === 'playing') { await pauseAudio().catch(() => {}); return; }
      if (audioState === 'paused')  { await resumeAudio().catch(() => {}); return; }
    }

    if (activeTokenRef.current) activeTokenRef.current.cancelled = true;
    await stopAudio();
    setHighlightedEngine(engine);
    const audioFile = engine === 'A'
      ? 'assets/audio/explain_mode_a.mp3'
      : 'assets/audio/explain_mode_b.mp3';
    await playAndAwaitAudio(audioFile, () => false).catch(() => {});
    setHighlightedEngine(null);
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  // While resolving persisted prefs (incl. whether the disclaimer was already
  // accepted), render a blank matching-background screen instead of the
  // engine cards — prevents a flash of the selection screen before the
  // disclaimer modal appears on first launch.
  if (isLoading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <StatusBar barStyle="dark-content" backgroundColor={C.bg} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor={C.bg} />

      {/* Disclaimer — shown once on first launch */}
      <DisclaimerModal
        visible={!hasSeenDisclaimer}
        onAccept={acceptDisclaimer}
      />

      <Animated.View style={[styles.container, { opacity: fadeAnim }]}>

        {/* ── Engine A Card ───────────────────────────────────────────────── */}
        <Animated.View style={[styles.cardWrapper, { transform: [{ translateY: cardAAnim }] }]}>
          <TouchableOpacity
            style={[
              styles.engineCard,
              styles.engineCardA,
              highlightedEngine === 'A' && styles.cardHighlightedA,
            ]}
            onPress={() => selectEngine('A')}
            activeOpacity={0.88}
            accessibilityLabel="ድምጽ ብቻ ማጥናት - Engine A"
            accessibilityRole="button"
          >
            {/* Left: icon + labels */}
            <View style={styles.cardLeft}>
              <Text style={styles.cardEmoji}>🎧</Text>
              <View style={styles.cardTextBlock}>
                <Text style={styles.cardTitleWhite}>ድምጽ ብቻ</Text>
                <Text style={styles.cardSubWhite}>ፅሁፍ አያስፈልግም</Text>
              </View>
            </View>

            {/* Right: animated play button */}
            <TouchableOpacity
              onPress={(e) => { e.stopPropagation(); explainEngine('A'); }}
              accessibilityLabel="ይህ ምርጫ ምን ማለት ነው?"
              style={styles.playWrapper}
            >
              <Animated.View style={[styles.playBtn, styles.playBtnLight, { transform: [{ scale: pulseAnim }] }]}>
                <Text style={styles.playIcon}>
                  {highlightedEngine === 'A' && audioState === 'playing' ? '⏸' : '▶️'}
                </Text>
              </Animated.View>
              <Text style={styles.playHintLight}>ይጫኑ</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </Animated.View>

        {/* ── Divider ─────────────────────────────────────────────────────── */}
        <View style={styles.divider}>
          <View style={styles.dividerLine} />
          <View style={styles.dividerPill}>
            <Text style={styles.dividerText}>ወይም</Text>
          </View>
          <View style={styles.dividerLine} />
        </View>

        {/* ── Engine B Card ───────────────────────────────────────────────── */}
        <Animated.View style={[styles.cardWrapper, { transform: [{ translateY: cardBAnim }] }]}>
          <TouchableOpacity
            style={[
              styles.engineCard,
              styles.engineCardB,
              highlightedEngine === 'B' && styles.cardHighlightedB,
            ]}
            onPress={() => selectEngine('B')}
            activeOpacity={0.88}
            accessibilityLabel="ፅሁፍና ድምጽ ማጥናት - Engine B"
            accessibilityRole="button"
          >
            {/* Left: icon + labels */}
            <View style={styles.cardLeft}>
              <Text style={styles.cardEmoji}>📖</Text>
              <View style={styles.cardTextBlock}>
                <Text style={styles.cardTitleYellow}>ፅሁፍ + ድምጽ</Text>
                <Text style={styles.cardSubLight}>ለሚያነቡ</Text>
              </View>
            </View>

            {/* Right: animated play button */}
            <TouchableOpacity
              onPress={(e) => { e.stopPropagation(); explainEngine('B'); }}
              accessibilityLabel="ይህ ምርጫ ምን ማለት ነው?"
              style={styles.playWrapper}
            >
              <Animated.View style={[styles.playBtn, styles.playBtnYellow, { transform: [{ scale: pulseAnim }] }]}>
                <Text style={styles.playIcon}>
                  {highlightedEngine === 'B' && audioState === 'playing' ? '⏸' : '▶️'}
                </Text>
              </Animated.View>
              <Text style={styles.playHintMuted}>ይጫኑ</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </Animated.View>

        {/* ── Footer hint ─────────────────────────────────────────────────── */}
        <Text style={styles.footerHint}>ለማዳመጥ ▶️ ይጫኑ • ለመምረጥ ካርዱን ይጫኑ</Text>

      </Animated.View>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({

  safeArea: {
    flex:            1,
    backgroundColor: C.bg,
  },

  // ── Main container ───────────────────────────────────────────────────────────
  container: {
    flex:              1,
    alignItems:        'center',
    justifyContent:    'center',
    paddingHorizontal: 20,
    gap:               18,
  },

  // ── Card wrapper ─────────────────────────────────────────────────────────────
  cardWrapper: {
    width: SCREEN_WIDTH - 40,
  },

  // ── Engine cards (shared) ────────────────────────────────────────────────────
  engineCard: {
    width:             '100%',
    borderRadius:      22,
    flexDirection:     'row',
    alignItems:        'center',
    justifyContent:    'space-between',
    paddingHorizontal: 24,
    paddingVertical:   30,
    shadowColor:       '#000',
    shadowOffset:      { width: 0, height: 8 },
    shadowOpacity:     0.45,
    shadowRadius:      18,
    elevation:         14,
  },

  // Engine A — deep ethiopia green
  engineCardA: {
    backgroundColor: C.cardA,
    borderWidth:     2.5,
    borderColor:     C.cardABorder,
  },
  cardHighlightedA: {
    borderWidth:   2.5,
    borderColor:   C.yellow,
    shadowColor:   C.yellow,
    shadowOpacity: 0.6,
    shadowRadius:  22,
    elevation:     20,
  },

  // Engine B — dark navy with yellow border
  engineCardB: {
    backgroundColor: C.cardB,
    borderWidth:     2.5,
    borderColor:     C.cardBBorder,
  },
  cardHighlightedB: {
    borderWidth:   2.5,
    borderColor:   C.yellow,
    shadowColor:   C.yellow,
    shadowOpacity: 0.6,
    shadowRadius:  22,
    elevation:     20,
  },

  // ── Card inner layout ────────────────────────────────────────────────────────
  cardLeft: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           16,
    flex:          1,
  },
  cardEmoji: {
    fontSize:   54,
    lineHeight: 62,
  },
  cardTextBlock: {
    gap: 5,
  },
  cardTitleWhite: {
    fontSize:   22,
    fontWeight: '800',
    color:      '#0f5238',
    letterSpacing: 0.5,
  },
  cardTitleYellow: {
    fontSize:   22,
    fontWeight: '800',
    color:      '#c62828',
    letterSpacing: 0.5,
  },
  cardSubWhite: {
    fontSize:   14,
    color:      '#2d6a4f',
    fontWeight: '500',
  },
  cardSubLight: {
    fontSize:   14,
    color:      '#c62828',
    fontWeight: '500',
  },

  // ── Play button ──────────────────────────────────────────────────────────────
  playWrapper: {
    alignItems:  'center',
    gap:         5,
    marginLeft:  8,
  },
  playBtn: {
    width:          54,
    height:         54,
    borderRadius:   27,
    justifyContent: 'center',
    alignItems:     'center',
  },
  playBtnLight: {
    backgroundColor: 'rgba(15,82,56,0.1)',
    borderWidth:     1.5,
    borderColor:     'rgba(15,82,56,0.3)',
  },
  playBtnYellow: {
    backgroundColor: 'rgba(198,40,40,0.1)',
    borderWidth:     1.5,
    borderColor:     'rgba(198,40,40,0.3)',
  },
  playIcon: {
    fontSize: 26,
  },
  playHintLight: {
    fontSize:   11,
    color:      '#2d6a4f',
    fontWeight: '600',
  },
  playHintMuted: {
    fontSize:   11,
    color:      C.textMuted,
    fontWeight: '600',
  },

  // ── Divider ──────────────────────────────────────────────────────────────────
  divider: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           10,
    alignSelf:     'stretch',
    paddingHorizontal: 4,
  },
  dividerLine: {
    flex:            1,
    height:          1,
    backgroundColor: C.border,
  },
  dividerPill: {
    backgroundColor:   C.white,
    borderRadius:      20,
    paddingHorizontal: 14,
    paddingVertical:   5,
    borderWidth:       1,
    borderColor:       C.border,
  },
  dividerText: {
    fontSize:   13,
    color:      C.textMuted,
    fontWeight: '600',
  },

  // ── Footer hint ──────────────────────────────────────────────────────────────
  footerHint: {
    fontSize:   16,
    color:      C.textMuted,
    textAlign:  'center',
    fontWeight: '500',
    marginTop:  4,
  },
});
