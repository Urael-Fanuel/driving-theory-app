/**
 * AGENT 3 — app/(engineA)/sign/[id].tsx
 * Engine A Sign Screen — Large static sign image + audio narration + Start Quiz.
 *
 * Layout:
 * ┌─────────────────────┐
 * │  [← Back]           │
 * │                     │
 * │  ┌───────────────┐  │
 * │  │               │  │
 * │  │  SIGN IMAGE   │  │  ← Full-width static image
 * │  │               │  │
 * │  └───────────────┘  │
 * │                     │
 * │  [🔊 Play Again]   │  ← Audio replay button
 * │                     │
 * │  [✅ Start Quiz]    │  ← Pulses after audio ends
 * └─────────────────────┘
 *
 * Zero text shown to Engine A users.
 */

import React, { useEffect, useState, useRef } from 'react';

// ─── Audio base URL (Supabase Storage) ────────────────────────────────────────
const _AUDIO_BASE = (process.env.EXPO_PUBLIC_SUPABASE_URL ?? '') + '/storage/v1/object/public/audio';

import {
  View,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  Text,
  Animated,
  Image,
  ScrollView,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Colors } from '../../../constants/colors';
import { LoadingScreen } from '../../../components/shared/LoadingScreen';
import { DBSign } from '../../../backend/supabaseClient';
import * as api from '../../../backend/api';
import { useAudio, waitForAudioEnd } from '../../../hooks/useAudio';
import { useProgress } from '../../../hooks/useProgress';

// ─── Component ────────────────────────────────────────────────────────────────

export default function EngineASignScreen() {
  const { id }         = useLocalSearchParams<{ id: string }>();
  const router         = useRouter();
  const { playAudio }  = useAudio();
  const { markSignViewed } = useProgress();

  const [sign,        setSign]        = useState<DBSign | null>(null);
  const [loading,     setLoading]     = useState(true);
  const [audioEnded,  setAudioEnded]  = useState(false);
  const [replayCount, setReplayCount] = useState(0); // Triggers audio re-play on replay

  const quizButtonAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim      = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    async function load() {
      try {
        const signs = await api.getAllSigns();
        const found = signs.find(s => s.id === id) ?? null;
        setSign(found);
      } catch (err) {
        console.error('[EngineA/sign] Failed to load sign:', err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id]);

  // Auto-play audio explanation; show quiz button when audio ends
  useEffect(() => {
    if (!sign?.audio_explanation_url) {
      // No audio — show quiz button immediately
      setAudioEnded(true);
      return;
    }
    let cancelled = false;

    async function playAndWait() {
      playAudio(sign!.audio_explanation_url!).catch(() => {});
      await waitForAudioEnd();
      if (cancelled) return;
      setAudioEnded(true);
    }

    playAndWait().catch(() => {});
    return () => { cancelled = true; };
  }, [sign?.id, replayCount]); // eslint-disable-line react-hooks/exhaustive-deps

  // Animate quiz button in when audio ends
  useEffect(() => {
    if (audioEnded) {
      Animated.parallel([
        Animated.timing(quizButtonAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
        Animated.loop(
          Animated.sequence([
            Animated.timing(pulseAnim, { toValue: 1.06, duration: 700, useNativeDriver: true }),
            Animated.timing(pulseAnim, { toValue: 1.0,  duration: 700, useNativeDriver: true }),
          ])
        ),
      ]).start();

      markSignViewed(id, true);
    }
  }, [audioEnded]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleAudioReplay = () => {
    setAudioEnded(false);
    pulseAnim.stopAnimation();
    quizButtonAnim.setValue(0);
    setReplayCount(c => c + 1);
  };

  const handleStartQuiz = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.push(`/(engineA)/question/${id}_q0`);
    playAudio(`${_AUDIO_BASE}/starting_quiz.mp3`).catch(() => {});
  };

  const handleBack = () => {
    Haptics.selectionAsync();
    router.back();
  };

  if (loading) return <LoadingScreen />;
  if (!sign)   return <LoadingScreen message="ምልክቱ አልተገኘም" />;

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Back button */}
        <TouchableOpacity style={styles.backButton} onPress={handleBack}>
          <Text style={styles.backIcon}>←</Text>
        </TouchableOpacity>

        {/* Large sign image */}
        <View style={styles.imageContainer}>
          {sign.image_url ? (
            <Image
              source={{ uri: sign.image_url }}
              style={styles.signImage}
              resizeMode="contain"
            />
          ) : (
            <View style={styles.imagePlaceholder}>
              <Text style={styles.placeholderIcon}>🚧</Text>
            </View>
          )}
        </View>

        {/* Audio replay button */}
        <TouchableOpacity
          style={styles.audioReplayBtn}
          onPress={handleAudioReplay}
          accessibilityLabel="ድምጽ ዳግም አዳምጥ"
        >
          <Text style={styles.audioReplayIcon}>🔊</Text>
        </TouchableOpacity>

        {/* Start Quiz button — appears (pulsing) after audio ends */}
        <Animated.View
          style={[
            styles.quizButtonContainer,
            {
              opacity:   quizButtonAnim,
              transform: [{ scale: pulseAnim }],
            },
          ]}
        >
          <TouchableOpacity
            style={styles.startQuizBtn}
            onPress={handleStartQuiz}
            activeOpacity={0.85}
            accessibilityLabel="ጥያቄ ጀምር"
            accessibilityRole="button"
          >
            <Text style={styles.startQuizIcon}>✅</Text>
          </TouchableOpacity>
        </Animated.View>

      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safeArea: {
    flex:            1,
    backgroundColor: Colors.background,
  },
  scrollContent: {
    padding:    16,
    alignItems: 'center',
    gap:        24,
  },
  backButton: {
    width:           52,
    height:          52,
    borderRadius:    26,
    backgroundColor: Colors.card,
    justifyContent:  'center',
    alignItems:      'center',
    alignSelf:       'flex-start',
  },
  backIcon: {
    fontSize: 24,
    color:    Colors.textPrimary,
  },
  imageContainer: {
    width:           '100%',
    aspectRatio:     1,
    borderRadius:    16,
    overflow:        'hidden',
    backgroundColor: '#FFFFFF',
  },
  signImage: {
    width:  '100%',
    height: '100%',
  },
  imagePlaceholder: {
    flex:            1,
    justifyContent:  'center',
    alignItems:      'center',
    backgroundColor: Colors.surface,
  },
  placeholderIcon: {
    fontSize: 64,
  },
  audioReplayBtn: {
    width:           80,
    height:          80,
    borderRadius:    40,
    backgroundColor: Colors.secondary,
    justifyContent:  'center',
    alignItems:      'center',
  },
  audioReplayIcon: {
    fontSize: 36,
  },
  quizButtonContainer: {
    marginTop: 8,
  },
  startQuizBtn: {
    width:           120,
    height:          120,
    borderRadius:    60,
    backgroundColor: '#27AE60',
    justifyContent:  'center',
    alignItems:      'center',
    shadowColor:     '#27AE60',
    shadowOffset:    { width: 0, height: 8 },
    shadowOpacity:   0.6,
    shadowRadius:    20,
    elevation:       12,
  },
  startQuizIcon: {
    fontSize: 56,
  },
});
