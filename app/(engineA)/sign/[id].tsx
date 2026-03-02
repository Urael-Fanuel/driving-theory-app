/**
 * AGENT 3 — app/(engineA)/sign/[id].tsx
 * Engine A Sign Screen — Video player + Start Quiz.
 *
 * Layout:
 * ┌─────────────────────┐
 * │  [← Back]           │
 * │                     │
 * │  ┌───────────────┐  │
 * │  │               │  │
 * │  │  VIDEO PLAYER │  │  ← Auto-plays on mount
 * │  │               │  │
 * │  └───────────────┘  │
 * │                     │
 * │  [🔊 Play Again]   │  ← Replay button
 * │                     │
 * │  [▶ Start Quiz]     │  ← Pulses after video ends
 * └─────────────────────┘
 *
 * Zero text shown to Engine A users.
 */

import React, { useEffect, useState, useRef } from 'react';
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
import { Typography } from '../../../constants/typography';
import { LoadingScreen } from '../../../components/shared/LoadingScreen';
import { SignVideoPlayer } from '../../../components/engineA/SignVideoPlayer';
import { DBSign } from '../../../backend/supabaseClient';
import * as api from '../../../backend/api';
import { useAudio, waitForAudioEnd } from '../../../hooks/useAudio';
import { useProgress } from '../../../hooks/useProgress';

// ─── Component ────────────────────────────────────────────────────────────────

export default function EngineASignScreen() {
  const { id }       = useLocalSearchParams<{ id: string }>();
  const router       = useRouter();
  const { playAudio } = useAudio();
  const { markSignViewed } = useProgress();

  const [sign,         setSign]         = useState<DBSign | null>(null);
  const [loading,      setLoading]      = useState(true);
  const [videoEnded,   setVideoEnded]   = useState(false);
  const [videoPaused,  setVideoPaused]  = useState(false);
  const [videoKey,     setVideoKey]     = useState(0); // Force re-mount for replay
  const [replayCount,  setReplayCount]  = useState(0); // Triggers audio re-play on replay

  const quizButtonAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim      = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    async function load() {
      try {
        // We only need the sign, not questions (those are on the question screen)
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

  // Auto-play audio explanation + pause video when audio ends
  // The video is muted (volume=0) so there's no double audio.
  // Falls back to waiting for videoEnded if audio_explanation_url is missing.
  useEffect(() => {
    if (!sign?.audio_explanation_url) return;
    let cancelled = false;

    async function playAndWait() {
      playAudio(sign!.audio_explanation_url!).catch(() => {});
      await waitForAudioEnd();
      if (cancelled) return;
      setVideoPaused(true);
      setVideoEnded(true);
    }

    playAndWait().catch(() => {});
    return () => { cancelled = true; };
  }, [sign?.id, replayCount]); // eslint-disable-line react-hooks/exhaustive-deps

  // Animate quiz button in when video ends
  useEffect(() => {
    if (videoEnded) {
      Animated.parallel([
        Animated.timing(quizButtonAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
        Animated.loop(
          Animated.sequence([
            Animated.timing(pulseAnim, { toValue: 1.06, duration: 700, useNativeDriver: true }),
            Animated.timing(pulseAnim, { toValue: 1.0,  duration: 700, useNativeDriver: true }),
          ])
        ),
      ]).start();

      // Mark sign as viewed
      markSignViewed(id, true);
    }
  }, [videoEnded]);

  const handleVideoEnd = () => {
    setVideoEnded(true);
  };

  const handleReplay = () => {
    setVideoKey(k => k + 1);
    setVideoEnded(false);
    setVideoPaused(false);
    pulseAnim.stopAnimation();
    quizButtonAnim.setValue(0);
    setReplayCount(c => c + 1); // Re-triggers the audio+pause effect
  };

  const handleStartQuiz = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.push(`/(engineA)/question/${id}_q0`);
    playAudio('assets/audio/starting_quiz.mp3').catch(() => {});
  };

  const handleBack = () => {
    Haptics.selectionAsync();
    router.back();
  };

  if (loading) return <LoadingScreen />;
  if (!sign) return <LoadingScreen message="ምልክቱ አልተገኘም" />;

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

        {/* Video player */}
        <View style={styles.videoContainer}>
          <SignVideoPlayer
            key={videoKey}
            videoUrl={sign.video_url ?? ''}
            thumbnailUrl={sign.image_url}
            onVideoEnd={handleVideoEnd}
            onReplayPress={handleReplay}
            paused={videoPaused}
            volume={sign.audio_explanation_url ? 0 : 1}
          />
        </View>

        {/* Sign image + replay button row */}
        <View style={styles.controlRow}>
          {/* Sign image thumbnail */}
          {sign.image_url && (
            <View style={styles.thumbnail}>
              <Image
                source={{ uri: sign.image_url }}
                style={styles.thumbnailImage}
                resizeMode="contain"
              />
            </View>
          )}

          {/* Audio replay button */}
          <TouchableOpacity
            style={styles.audioReplayBtn}
            onPress={() => sign.audio_explanation_url && playAudio(sign.audio_explanation_url).catch(() => {})}
            accessibilityLabel="ድምጽ ዳግም አዳምጥ"
          >
            <Text style={styles.audioReplayIcon}>🔊</Text>
          </TouchableOpacity>

          {/* Video replay button */}
          <TouchableOpacity
            style={styles.videoReplayBtn}
            onPress={handleReplay}
            accessibilityLabel="ቪዲዮ ዳግም ተጫወት"
          >
            <Text style={styles.videoReplayIcon}>🔄</Text>
          </TouchableOpacity>
        </View>

        {/* Start Quiz button — appears (pulsing) after video ends */}
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

        {/* Show start-quiz button immediately if video unavailable */}
        {!sign.video_url && !videoEnded && (
          <TouchableOpacity
            style={[styles.startQuizBtn, styles.quizButtonImmediate]}
            onPress={handleStartQuiz}
          >
            <Text style={styles.startQuizIcon}>✅</Text>
          </TouchableOpacity>
        )}
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
    padding:     16,
    alignItems:  'center',
    gap:         20,
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
  videoContainer: {
    width:     '100%',
    alignSelf: 'stretch',
  },
  controlRow: {
    flexDirection:  'row',
    alignItems:     'center',
    gap:            16,
    alignSelf:      'stretch',
    justifyContent: 'center',
  },
  thumbnail: {
    width:           80,
    height:          80,
    borderRadius:    12,
    backgroundColor: '#FFFFFF',
    overflow:        'hidden',
  },
  thumbnailImage: {
    width:           '100%',
    height:          '100%',
    backgroundColor: '#FFFFFF',
  },
  audioReplayBtn: {
    width:           64,
    height:          64,
    borderRadius:    32,
    backgroundColor: Colors.secondary,
    justifyContent:  'center',
    alignItems:      'center',
  },
  audioReplayIcon: {
    fontSize: 28,
  },
  videoReplayBtn: {
    width:           64,
    height:          64,
    borderRadius:    32,
    backgroundColor: Colors.card,
    justifyContent:  'center',
    alignItems:      'center',
  },
  videoReplayIcon: {
    fontSize: 28,
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
  quizButtonImmediate: {
    marginTop: 0,
  },
  startQuizIcon: {
    fontSize: 56,
  },
});
