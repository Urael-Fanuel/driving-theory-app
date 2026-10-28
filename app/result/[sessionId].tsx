/**
 * app/result/[sessionId].tsx
 * Shared Exam Result Screen — used by both Engine A and Engine B.
 *
 * Engine A: Shows large icons + numbers only (no text labels)
 * Engine B: Shows full text breakdown
 *
 * Params are passed via router params (stored in global ref).
 */

import React, { useEffect, useRef, useState } from 'react';
import { UiStrings } from '../../constants/strings';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Animated,
  Image,
  Share,
  Dimensions,
} from 'react-native';
import { ScreenSafeArea as SafeAreaView } from '../../components/shared/ScreenSafeArea';   // top inset on Android (edge to edge)
import { QuizReview } from '../../components/shared/QuizReview';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const SCREEN_WIDTH = Dimensions.get('window').width;
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Colors } from '../../constants/colors';
import { Typography } from '../../constants/typography';
import { useEngine } from '../../contexts/EngineContext';
import { useAudio } from '../../hooks/useAudio';
import * as api from '../../backend/api';
import { DBSign } from '../../backend/supabaseClient';

// ─── Global result storage (passed from useExam) ──────────────────────────────
import { ResultData, WrongQuestion, getExamResult, preloadExamResult } from '../../utils/examResult';
import { SponsorAdBanner } from '../../components/shared/SponsorAdBanner';
import { AdClip } from '../../components/shared/AdClip';
import { useSponsorAd } from '../../hooks/useSponsorAd';
import { SafeBannerAd, IS_EXPO_GO } from '../../components/shared/SafeBannerAd';

// react-native-google-mobile-ads has no native module in Expo Go — avoid
// even importing it there (a static import alone can crash on load).
const BANNER_AD_UNIT_ID = IS_EXPO_GO
  ? ''
  : __DEV__
    ? require('react-native-google-mobile-ads').TestIds.ADAPTIVE_BANNER
    : 'ca-app-pub-8758594752714631/2049529867';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { speakAndAwait, stopTTS } from '../../utils/googleTTS';
import ConfettiCannon from 'react-native-confetti-cannon';

// NOTE: this screen used to also show a Google AdMob full-screen interstitial
// ad on mount (react-native-google-mobile-ads). Removed at the app owner's
// explicit request (2026-09-11) — it popped up uncoordinated with the
// confetti/celebration audio below, and is being replaced by the sponsor-ad
// banner (SponsorAdBanner) on PASS, which the app fully controls.

// ─── Audio base URL (Supabase Storage) ────────────────────────────────────────
const _AUDIO_BASE = (process.env.EXPO_PUBLIC_SUPABASE_URL ?? '') + '/storage/v1/object/public/audio';

// ─── Sponsor-ad wrapper — shown only on PASS, riding the moment's excitement.
// Amharic text approved by the app owner directly (see conversation history,
// not machine-translated). Engine A hears sponsor_ad_exam_pass_wrapper.mp3
// (same text, recorded) instead of reading this. ─────────────────────────────
const EXAM_PASS_AD_HEADLINE = 'ፈተናውን አልፈዋል';
const EXAM_PASS_AD_BODY     = 'ወደመኪና አስተማሪ ይደውሉ እና በትክክል መንዳት ይማሩ። መንጃ ፍቃድ አውጡ።';
const EXAM_PASS_AD_AUDIO    = `${_AUDIO_BASE}/sponsor_ad_exam_pass_wrapper.mp3`;

// ─── Topic ID → Amharic name mapping ─────────────────────────────────────────
export type { ResultData };
export { storeExamResult } from '../../utils/examResult';

// ─── Component ────────────────────────────────────────────────────────────────

export default function ResultScreen() {
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();
  const router        = useRouter();
  // The Android navigation bar sits over the bottom of the screen (edge to edge): the last
  // buttons need this much room, or the bar covers them (owner's testing, 2026-10-27).
  const insets = useSafeAreaInsets();
  const adClipRef = useRef<any>(null);   // the scroll area holding the ad card (components/shared/AdClip.tsx)
  const { engineType, userId } = useEngine();
  const sponsorAd = useSponsorAd(userId);
  const { playAudio, stopAudio } = useAudio();

  const { score: sParam, total: tParam, passed: pParam, duration: dParam } =
    useLocalSearchParams<{ sessionId: string; score: string; total: string; passed: string; duration: string }>();

  const [resultData, setResultData] = useState<ResultData | undefined>(() => getExamResult(sessionId));

  // Fallback: if memory store is empty (e.g. after OTA reload), load from file
  useEffect(() => {
    if (!resultData && sessionId) {
      preloadExamResult(sessionId).then(data => {
        if (data) setResultData(data);
      });
    }
  }, [sessionId]); // eslint-disable-line react-hooks/exhaustive-deps

  const result = resultData;

  // URL params are the primary source (reliable across navigation).
  // Map store is a fallback (may be empty after hot-reload).
  const score    = result?.score            ?? (sParam ? parseInt(sParam, 10) : 0);
  const total    = result?.total            ?? (tParam ? parseInt(tParam, 10) : 30);
  const passed   = result?.passed           ?? (pParam === '1');
  const duration = result?.durationSeconds  ?? (dParam ? parseInt(dParam, 10) : 0);

  const wrongQuestions: WrongQuestion[] = result?.wrongQuestions ?? [];

  const percent   = total > 0 ? Math.round((score / total) * 100) : 0;
  const isEngineA = engineType === 'A';


  // ── Animations ─────────────────────────────────────────────────────────────
  const scaleAnim    = useRef(new Animated.Value(0)).current;
  const fadeAnim     = useRef(new Animated.Value(0)).current;
  const slideAnim    = useRef(new Animated.Value(40)).current;
  const confettiRef  = useRef<any>(null);
  const firework1Ref = useRef<any>(null);
  const firework2Ref = useRef<any>(null);
  const firework3Ref = useRef<any>(null);

  useEffect(() => {
    // Haptic + audio feedback
    Haptics.notificationAsync(
      passed
        ? Haptics.NotificationFeedbackType.Success
        : Haptics.NotificationFeedbackType.Error
    );

    // Play result audio + confetti + fireworks on pass
    if (passed) {
      // Main confetti burst
      setTimeout(() => confettiRef.current?.start(), 400);
      // Fireworks: 3 bursts from different positions
      setTimeout(() => firework1Ref.current?.start(), 1800);
      setTimeout(() => firework2Ref.current?.start(), 2800);
      setTimeout(() => firework3Ref.current?.start(), 3800);
      // Play crowd cheer, then TTS bravo
      playAudio(`${_AUDIO_BASE}/crowd_cheer.mp3`)
        .then(() => speakAndAwait('ብራቮ!'))
        .catch(() => {});
    } else {
      playAudio(`${_AUDIO_BASE}/exam_failed.mp3`).catch(() => {});
    }

    // Staggered entrance animations
    Animated.stagger(100, [
      Animated.spring(scaleAnim, { toValue: 1, speed: 10, bounciness: 12, useNativeDriver: true }),
      Animated.timing(fadeAnim,  { toValue: 1, duration: 400, useNativeDriver: true }),
      Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, speed: 12 }),
    ]).start();
  }, []);

  const handleShare = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await Share.share({
      message: 'መንጃ ፍቃድ - በቀላል መንገድ 🚗\nለመንዳት ዝግጁ ነኝ!',
    });
  };

  const handleGoHome = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await stopAudio();
    await stopTTS().catch(() => {});
    if (isEngineA) {
      router.replace('/(engineA)/home' as any);
    } else {
      router.replace('/(engineB)/home' as any);
    }
  };

  const handleRetry = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await stopAudio();
    await stopTTS().catch(() => {});
    if (isEngineA) {
      router.replace('/(engineA)/exam' as any);
    } else {
      router.replace('/(engineB)/exam' as any);
    }
  };



  // Before leaving for a sign or for practice (QuizReview): stop both audio engines.
  const stopAllAudio = async () => {
    await stopAudio();
    await stopTTS().catch(() => {});
  };

  const minutes = Math.floor(duration / 60);
  const seconds = duration % 60;

  const bgColor    = passed ? '#E8F5E9' : '#FFEBEE';
  const accentColor = passed ? '#2E7D32' : '#C62828';

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: '#f7f9fb' }]}>
      {/* Confetti + fireworks — renders over everything, triggered on pass */}
      {passed && (
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, direction: 'ltr' }} pointerEvents="none">
          <ConfettiCannon
            ref={confettiRef}
            count={200}
            origin={{ x: SCREEN_WIDTH / 2, y: 0 }}
            autoStart={false}
            fadeOut
            explosionSpeed={400}
            fallSpeed={3000}
            colors={['#FDD835', '#2E7D32', '#1976D2', '#C62828', '#FF6F00', '#6A1B9A']}
          />
          <ConfettiCannon
            ref={firework1Ref}
            count={80}
            origin={{ x: SCREEN_WIDTH * 0.15, y: SCREEN_WIDTH * 0.3 }}
            autoStart={false}
            fadeOut
            explosionSpeed={500}
            fallSpeed={2500}
            colors={['#FDD835', '#FF6F00', '#C62828']}
          />
          <ConfettiCannon
            ref={firework2Ref}
            count={80}
            origin={{ x: SCREEN_WIDTH * 0.85, y: SCREEN_WIDTH * 0.3 }}
            autoStart={false}
            fadeOut
            explosionSpeed={500}
            fallSpeed={2500}
            colors={['#1976D2', '#6A1B9A', '#2E7D32']}
          />
          <ConfettiCannon
            ref={firework3Ref}
            count={120}
            origin={{ x: SCREEN_WIDTH / 2, y: SCREEN_WIDTH * 0.2 }}
            autoStart={false}
            fadeOut
            explosionSpeed={600}
            fallSpeed={2800}
            colors={['#FDD835', '#2E7D32', '#1976D2', '#C62828', '#FF6F00', '#6A1B9A']}
          />
        </View>
      )}
      <AdClip target={adClipRef}>
      <ScrollView ref={adClipRef} contentContainerStyle={[styles.content, { paddingBottom: 24 + insets.bottom + 12 }]}>

        {/* Result icon + score */}
        <Animated.View
          style={[styles.heroContainer, { transform: [{ scale: scaleAnim }] }]}
        >
          <View style={[styles.scoreCircle, { borderColor: accentColor, backgroundColor: bgColor }]}>
            <Text style={styles.resultEmoji}>
              {passed ? '🏆' : '📚'}
            </Text>
            <Text style={[styles.scoreText, { color: accentColor }]}>
              {score}/{total}
            </Text>
            {!isEngineA && (
              <Text style={styles.percentText}>{percent}%</Text>
            )}
          </View>
        </Animated.View>

        {/* Pass/fail label — Engine B only */}
        {!isEngineA && (
          <Animated.Text
            style={[
              styles.resultLabel,
              { color: accentColor, opacity: fadeAnim },
            ]}
          >
            {passed ? 'ፈተናው ተሳክቷል!' : 'ዳግም ሞክር'}
          </Animated.Text>
        )}

        {/* PASS: sponsor ad riding the exam-pass moment. Sits high, right
            after the score reveal, per the app owner's explicit request to
            use this moment's excitement. FAIL: a small Google AdMob banner
            instead, so this spot is never empty (decided 2026-09-11). */}
        {passed ? (
          sponsorAd && (
            <Animated.View style={{ opacity: fadeAnim, alignSelf: 'stretch' }}>
              <SponsorAdBanner
                headline={EXAM_PASS_AD_HEADLINE}
                body={EXAM_PASS_AD_BODY}
                wrapperAudioUrl={EXAM_PASS_AD_AUDIO}
                ad={sponsorAd}
                engineType={engineType}
              />
            </Animated.View>
          )
        ) : (
          <Animated.View style={{ opacity: fadeAnim, alignSelf: 'stretch', alignItems: 'center' }}>
            <SafeBannerAd unitId={BANNER_AD_UNIT_ID} />
          </Animated.View>
        )}

        {/* Stats — Engine B shows text, Engine A shows icons */}
        <Animated.View
          style={[
            styles.statsContainer,
            {
              opacity:   fadeAnim,
              transform: [{ translateY: slideAnim }],
            },
          ]}
        >
          {/* Score stat */}
          <View style={styles.statCard}>
            <View style={[styles.statIconDot, { backgroundColor: '#E8F5E9' }]}>
              <Text style={[styles.statIconSymbol, { color: '#2E7D32' }]}>✓</Text>
            </View>
            <Text style={styles.statValue}>{score}</Text>
            {!isEngineA && <Text style={styles.statLabel}>ትክክል</Text>}
          </View>

          {/* Wrong stat */}
          <View style={styles.statCard}>
            <View style={[styles.statIconDot, { backgroundColor: '#FFEBEE' }]}>
              <Text style={[styles.statIconSymbol, { color: '#C62828' }]}>✕</Text>
            </View>
            <Text style={styles.statValue}>{total - score}</Text>
            {!isEngineA && <Text style={styles.statLabel}>ስህተት</Text>}
          </View>

          {/* Time stat */}
          <View style={styles.statCard}>
            <View style={[styles.statIconDot, { backgroundColor: '#E3F2FD' }]}>
              <Text style={[styles.statIconSymbol, { color: '#1565C0' }]}>⏱</Text>
            </View>
            <Text style={styles.statValue}>
              {minutes}:{seconds.toString().padStart(2, '0')}
            </Text>
            {!isEngineA && <Text style={styles.statLabel}>ጊዜ</Text>}
          </View>
        </Animated.View>

        {/* Per-topic breakdown, wrong questions and "practise them" (shared with the daily quiz) */}
        <QuizReview
          isEngineA={isEngineA}
          topicBreakdown={result?.topicBreakdown}
          wrongQuestions={wrongQuestions}
          opacity={fadeAnim}
          beforeLeave={stopAllAudio}
        />

        {/* Share button — only on pass */}
        {passed && (
          <Animated.View style={[{ alignSelf: 'stretch' }, { opacity: fadeAnim }]}>
            <TouchableOpacity
              style={styles.shareBtn}
              onPress={handleShare}
              activeOpacity={0.85}
            >
              <MaterialCommunityIcons name="share-variant" size={24} color="#ffffff" />
              {!isEngineA && (
                <Text style={styles.shareBtnText}>{UiStrings.shareSuccess}</Text>
              )}
            </TouchableOpacity>
          </Animated.View>
        )}

        {/* Action buttons */}
        <Animated.View style={[styles.actions, { opacity: fadeAnim }]}>
          <TouchableOpacity
            style={[styles.actionBtn, styles.retryBtn]}
            onPress={handleRetry}
            activeOpacity={0.85}
          >
            <Text style={styles.actionIcon}>🔄</Text>
            {!isEngineA && (
              <Text style={styles.retryActionText}>ዳግም ሞክር</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionBtn, styles.homeBtn]}
            onPress={handleGoHome}
            activeOpacity={0.85}
          >
            <Text style={styles.actionIcon}>🏠</Text>
            {!isEngineA && (
              <Text style={styles.actionText}>ቤት</Text>
            )}
          </TouchableOpacity>
        </Animated.View>

      </ScrollView>
      </AdClip>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  content: {
    padding:    24,
    alignItems: 'center',
    gap:        24,
  },
  heroContainer: {
    marginTop: 20,
  },
  scoreCircle: {
    width:           200,
    height:          200,
    borderRadius:    100,
    borderWidth:     6,
    justifyContent:  'center',
    alignItems:      'center',
    gap:             4,
  },
  resultEmoji: {
    fontSize: 48,
  },
  scoreText: {
    fontSize:   36,
    fontWeight: '900',
  },
  percentText: {
    ...Typography.h3,
    color: '#404943',
  },
  resultLabel: {
    ...Typography.h2,
    textAlign: 'center',
  },
  statsContainer: {
    flexDirection:  'row',
    gap:            12,
    alignSelf:      'stretch',
    justifyContent: 'center',
  },
  statCard: {
    flex:            1,
    backgroundColor: '#ffffff',
    borderRadius:    16,
    padding:         16,
    alignItems:      'center',
    gap:             6,
    maxWidth:        100,
    shadowColor:     '#000',
    shadowOffset:    { width: 0, height: 2 },
    shadowOpacity:   0.08,
    shadowRadius:    6,
    elevation:       3,
  },
  statIconDot: {
    width:          44,
    height:         44,
    borderRadius:   22,
    justifyContent: 'center',
    alignItems:     'center',
  },
  statIconSymbol: {
    fontSize:   22,
    fontWeight: '700',
  },
  statValue: {
    ...Typography.h3,
    color: '#191c1e',
  },
  statLabel: {
    ...Typography.caption,
    color: '#404943',
  },

  // ── Weak signs section ─────────────────────────────────────────────────────

  // ── Share button ───────────────────────────────────────────────────────────
  shareBtn: {
    flexDirection:   'row',
    alignItems:      'center',
    justifyContent:  'center',
    backgroundColor: '#1976D2',
    borderRadius:    16,
    paddingVertical: 16,
    gap:             10,
  },
  shareBtnText: {
    ...Typography.answer,
    color:      '#ffffff',
    fontWeight: '700',
  },

  // ── Action buttons ─────────────────────────────────────────────────────────
  actions: {
    flexDirection: 'row',
    gap:           12,
    alignSelf:     'stretch',
    marginTop:     8,
  },
  actionBtn: {
    flex:            1,
    flexDirection:   'row',
    alignItems:      'center',
    justifyContent:  'center',
    borderRadius:    16,
    paddingVertical: 18,
    gap:             10,
  },
  retryBtn: {
    backgroundColor: '#ffffff',
    borderWidth:     1,
    borderColor:     '#dde3ea',
    shadowColor:     '#000',
    shadowOffset:    { width: 0, height: 2 },
    shadowOpacity:   0.08,
    shadowRadius:    4,
    elevation:       2,
  },
  homeBtn: {
    backgroundColor: Colors.primary,
  },
  actionIcon: {
    fontSize: 26,
  },
  actionText: {
    ...Typography.answer,
    color:      '#ffffff',
    fontWeight: '700',
  },
  retryActionText: {
    ...Typography.answer,
    color:      '#191c1e',
    fontWeight: '700',
  },
});
