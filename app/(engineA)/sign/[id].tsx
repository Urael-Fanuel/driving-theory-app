/**
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
 * │  [⬅️]  [⏸/▶️]  [➡️] │  ← Prev / Pause-Resume / Next
 * │                     │
 * │  [📝 Start Quiz]    │  ← Pulses after audio ends
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
import { VideoModal } from '../../../components/shared/VideoModal';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Colors } from '../../../constants/colors';
import { LoadingScreen } from '../../../components/shared/LoadingScreen';
import { DBSign } from '../../../backend/supabaseClient';
import * as api from '../../../backend/api';
import { useAudio, playAndAwaitAudio } from '../../../hooks/useAudio';
import { useProgress } from '../../../hooks/useProgress';
import { extractSignNumber, shouldShowSignBadge } from '../../../utils/signNumber';
import { OfflineBanner } from '../../../components/shared/OfflineBanner';
import { prefetchSignAudio } from '../../../services/audioCache';

// ─── Component ────────────────────────────────────────────────────────────────

export default function EngineASignScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();

  const router = useRouter();
  const { stopAudio, pauseAudio, resumeAudio, audioState } = useAudio();
  const { markSignViewed } = useProgress();

  const [sign,         setSign]         = useState<DBSign | null>(null);
  const [loading,      setLoading]      = useState(() => !api.getSignsFromCache());
  const [audioEnded,   setAudioEnded]   = useState(false);
  const [replayCount,  setReplayCount]  = useState(0);
  const [topicSigns,   setTopicSigns]   = useState<DBSign[]>([]);
  const [videoVisible, setVideoVisible] = useState(false);

  const quizButtonAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim      = useRef(new Animated.Value(1)).current;

  // ── Load sign + all signs in same topic (for prev/next navigation) ───────────

  useEffect(() => {
    async function load() {
      try {
        const signs = await api.getAllSigns();
        const found = signs.find(s => s.id === id) ?? null;
        setSign(found);

        // Get this sign's explanation AND question audio onto disk now, while
        // the user is still listening to the explanation. By the time they tap
        // through to the questions it is already local, so losing reception in
        // between changes nothing. getQuestionsBySign is cached, so the question
        // screen reuses this result instead of fetching again.
        api.getQuestionsBySign(id)
          .then(qs => prefetchSignAudio(found, qs))
          .catch(() => {});

        if (found) {
          const sorted = signs
            .filter(s => s.topic_id === found.topic_id)
            .sort((a, b) => a.display_order - b.display_order);
          setTopicSigns(sorted);
        }
      } catch (err) {
        console.error('[EngineA/sign] Failed to load sign:', err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id]);

  // ── Reset all state when navigating to a different sign ──────────────────────

  useEffect(() => {
    setAudioEnded(false);
    setReplayCount(0);
    quizButtonAnim.setValue(0);
    pulseAnim.stopAnimation();
    pulseAnim.setValue(1);
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Auto-play audio; re-runs on replayCount to support replay ────────────────

  useEffect(() => {
    if (!sign?.audio_explanation_url) {
      setAudioEnded(true);
      return;
    }

    let cancelled = false;

    async function playAndWait() {
      // ✅ Correct pattern — Promise is tied to THIS specific sound via _soundId.
      // Cannot be resolved prematurely by another audio completing or erroring.
      await playAndAwaitAudio(sign!.audio_explanation_url!, () => cancelled);
      if (cancelled) return;
      setAudioEnded(true);
    }

    playAndWait().catch(() => {});
    return () => {
      cancelled = true;
      stopAudio();
    };
  }, [sign?.id, replayCount]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Animate quiz button in when audio ends ───────────────────────────────────

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

  // ── Prev / Next navigation ───────────────────────────────────────────────────

  const currentIndex = topicSigns.findIndex(s => s.id === id);
  const prevSign     = currentIndex > 0 ? topicSigns[currentIndex - 1] : null;
  const nextSign     = currentIndex < topicSigns.length - 1 ? topicSigns[currentIndex + 1] : null;

  const handlePrev = async () => {
    if (!prevSign) return;
    Haptics.selectionAsync();
    await stopAudio();
    router.replace({
      pathname: '/(engineA)/sign/[id]',
      params: { id: prevSign.id },
    } as any);
  };

  const handleNext = async () => {
    if (!nextSign) return;
    Haptics.selectionAsync();
    await stopAudio();
    router.replace({
      pathname: '/(engineA)/sign/[id]',
      params: { id: nextSign.id },
    } as any);
  };

  // ── Audio button: play / pause / resume ──────────────────────────────────────

  const handleAudioButton = async () => {
    await Haptics.selectionAsync();
    if (audioState === 'playing') {
      await pauseAudio();
    } else if (audioState === 'paused') {
      await resumeAudio();
    } else {
      // idle / finished / error → restart from beginning
      setAudioEnded(false);
      pulseAnim.stopAnimation();
      pulseAnim.setValue(1);
      quizButtonAnim.setValue(0);
      setReplayCount(c => c + 1);
    }
  };

  const audioButtonIcon = audioState === 'playing' ? '⏸' : '▶️';

  // ── Other handlers ───────────────────────────────────────────────────────────

  const navigateToQuiz = () => router.push(`/(engineA)/question/${id}_q0`);

  const handleStartQuiz = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    navigateToQuiz();
  };

  const handleBack = async () => {
    Haptics.selectionAsync();
    await stopAudio();
    router.back();
  };

  if (loading) return <LoadingScreen />;
  if (!sign)   return <LoadingScreen message="ምልክቱ አልተገኘም" />;

  return (
    <SafeAreaView style={styles.safeArea}>
      <OfflineBanner />
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
          {shouldShowSignBadge(sign.image_url) && (
            <View style={styles.signNumberBadge}>
              <Text style={styles.signNumberText}>{extractSignNumber(sign.image_url)}</Text>
            </View>
          )}
        </View>

        {/* Video button — only shown when sign has a video */}
        {sign.video_url && (
          <TouchableOpacity
            style={styles.videoBtn}
            onPress={() => setVideoVisible(true)}
            accessibilityLabel="ቪዲዮ ተመልከት"
          >
            <Text style={styles.videoBtnIcon}>▶</Text>
          </TouchableOpacity>
        )}

        {/* Video modal */}
        {sign.video_url && (
          <VideoModal
            visible={videoVisible}
            videoUri={sign.video_url}
            onClose={() => setVideoVisible(false)}
          />
        )}

        {/* Control row: Prev | Play/Pause | Next */}
        <View style={styles.controlRow}>

          {/* ⬅️ Previous sign */}
          <TouchableOpacity
            style={[styles.navBtn, !prevSign && styles.navBtnDisabled]}
            onPress={handlePrev}
            disabled={!prevSign}
            accessibilityLabel="ወደ ቀዳሚ ምልክት"
          >
            <Text style={[styles.navBtnIcon, !prevSign && styles.navBtnIconDisabled]}>‹</Text>
          </TouchableOpacity>

          {/* ⏸/▶️ Play / Pause / Resume */}
          <TouchableOpacity
            style={styles.audioBtn}
            onPress={handleAudioButton}
            accessibilityLabel="ድምጽ አጫውት / አቁም"
          >
            <Text style={styles.audioBtnIcon}>{audioButtonIcon}</Text>
          </TouchableOpacity>

          {/* ➡️ Next sign */}
          <TouchableOpacity
            style={[styles.navBtn, !nextSign && styles.navBtnDisabled]}
            onPress={handleNext}
            disabled={!nextSign}
            accessibilityLabel="ወደ ቀጣይ ምልክት"
          >
            <Text style={[styles.navBtnIcon, !nextSign && styles.navBtnIconDisabled]}>›</Text>
          </TouchableOpacity>

        </View>

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
            <Text style={styles.startQuizIcon}>📝</Text>
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
    backgroundColor: '#f7f9fb',
  },
  scrollContent: {
    padding:    16,
    alignItems: 'center',
    gap:        24,
  },
  backButton: {
    width:           48,
    height:          48,
    borderRadius:    24,
    backgroundColor: '#ffffff',
    justifyContent:  'center',
    alignItems:      'center',
    alignSelf:       'flex-start',
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
  imageContainer: {
    width:           '100%',
    aspectRatio:     1,
    borderRadius:    20,
    overflow:        'hidden',
    backgroundColor: '#ffffff',
    position:        'relative',
    shadowColor:     '#000',
    shadowOffset:    { width: 0, height: 4 },
    shadowOpacity:   0.10,
    shadowRadius:    12,
    elevation:       5,
  },
  signNumberBadge: {
    position:          'absolute',
    top:               10,
    left:              10,
    backgroundColor:   'rgba(255,255,255,0.92)',
    borderRadius:      5,
    paddingHorizontal: 8,
    paddingVertical:   4,
    zIndex:            1,
  },
  signNumberText: {
    color:      '#404943',
    fontSize:   14,
    fontWeight: '700',
  },
  signImage: {
    width:  '100%',
    height: '100%',
  },
  imagePlaceholder: {
    flex:            1,
    justifyContent:  'center',
    alignItems:      'center',
    backgroundColor: '#f0f4f8',
  },
  placeholderIcon: {
    fontSize: 64,
  },
  videoBtn: {
    width:           72,
    height:          72,
    borderRadius:    36,
    backgroundColor: '#ffffff',
    justifyContent:  'center',
    alignItems:      'center',
    borderWidth:     1,
    borderColor:     '#dde3ea',
    shadowColor:     '#000',
    shadowOffset:    { width: 0, height: 2 },
    shadowOpacity:   0.10,
    shadowRadius:    6,
    elevation:       3,
  },
  videoBtnIcon: {
    color:    '#191c1e',
    fontSize: 28,
  },
  controlRow: {
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'center',
    gap:            20,
  },
  navBtn: {
    width:           72,
    height:          72,
    borderRadius:    36,
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
    opacity: 0.3,
  },
  navBtnIcon: {
    fontSize:   34,
    color:      '#1565C0',
    fontWeight: '300',
    lineHeight: 40,
  },
  navBtnIconDisabled: {
    opacity: 0.4,
  },
  audioBtn: {
    width:           88,
    height:          88,
    borderRadius:    44,
    backgroundColor: '#FDD835',
    justifyContent:  'center',
    alignItems:      'center',
    shadowColor:     '#FDD835',
    shadowOffset:    { width: 0, height: 4 },
    shadowOpacity:   0.5,
    shadowRadius:    10,
    elevation:       6,
  },
  audioBtnIcon: {
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
    shadowOpacity:   0.5,
    shadowRadius:    20,
    elevation:       12,
  },
  startQuizIcon: {
    fontSize: 56,
  },
});
