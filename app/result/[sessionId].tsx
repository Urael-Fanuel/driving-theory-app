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
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  Animated,
  Image,
  Share,
  Dimensions,
} from 'react-native';

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
import { AdCard } from '../../components/shared/AdCard';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { speakAndAwait } from '../../utils/googleTTS';
import ConfettiCannon from 'react-native-confetti-cannon';
import { IS_EXPO_GO } from '../../components/shared/SafeBannerAd';

// react-native-google-mobile-ads has no native module in Expo Go — avoid even
// importing it there (InterstitialAd.createForAdRequest crashes on module load).
let AdEventType: any = null;
let interstitial: any = null;
if (!IS_EXPO_GO) {
  const ads = require('react-native-google-mobile-ads');
  AdEventType = ads.AdEventType;
  const INTERSTITIAL_AD_UNIT_ID = __DEV__
    ? ads.TestIds.INTERSTITIAL
    : 'ca-app-pub-XXXXXXXXXXXXXXXX/XXXXXXXXXX'; // החלף ב-ID האמיתי שלך מ-AdMob
  interstitial = ads.InterstitialAd.createForAdRequest(INTERSTITIAL_AD_UNIT_ID, {
    requestNonPersonalizedAdsOnly: false,
  });
}

// ─── Audio base URL (Supabase Storage) ────────────────────────────────────────
const _AUDIO_BASE = (process.env.EXPO_PUBLIC_SUPABASE_URL ?? '') + '/storage/v1/object/public/audio';

// ─── Topic ID → Amharic name mapping ─────────────────────────────────────────
const TOPIC_NAMES: Record<string, string> = {
  regulatory:           'አስገዳጅ ምልክቶች',
  warning:              'የማስጠንቀቂያ ምልክቶች',
  right_of_way:         'የቅድሚያ መብት',
  prohibitions:         'የክልከላ ምልክቶች',
  information_guidance: 'የመረጃ ምልክቶች',
  public_transport:     'የህዝብ ማመላለሻ',
  traffic_lights:       'የትራፊክ መብራቶች',
  road_markings:        'የመንገድ ምልክቶች',
  work_site:            'የሥራ ቦታ ምልክቶች',
  vehicle_knowledge:    'መኪናን ማወቅ',
  mind_safety:          'አዕምሮ እና ደህንነት',
  society_law:          'ማህበረሰብ እና ህግ',
  the_road:             'የመንገድ ሁኔታዎች',
  my_vehicle:           'ትክክለኛ አነዳድ',
  two_wheelers:         'ሁለት ጎማ ተሽከርካሪ',
  basics_license:       'መሠረቶች እና ፍቃድ',
};
export type { ResultData };
export { storeExamResult } from '../../utils/examResult';

// ─── Component ────────────────────────────────────────────────────────────────

export default function ResultScreen() {
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();
  const router        = useRouter();
  const { engineType } = useEngine();
  const { playAudio }  = useAudio();

  const { score: sParam, total: tParam, passed: pParam, duration: dParam } =
    useLocalSearchParams<{ sessionId: string; score: string; total: string; passed: string; duration: string }>();

  const [resultData, setResultData] = useState<ResultData | undefined>(() => getExamResult(sessionId));
  const [adLoaded, setAdLoaded] = useState(false);

  // Load and show interstitial ad when screen mounts
  useEffect(() => {
    if (IS_EXPO_GO || !interstitial) return;
    const unsubLoaded = interstitial.addAdEventListener(AdEventType.LOADED, () => {
      setAdLoaded(true);
      interstitial.show();
    });
    const unsubClosed = interstitial.addAdEventListener(AdEventType.CLOSED, () => {
      setAdLoaded(false);
    });
    interstitial.load();
    return () => {
      unsubLoaded();
      unsubClosed();
    };
  }, []);

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

  // ── Load sign images for wrong questions ───────────────────────────────────
  const [weakSigns, setWeakSigns] = useState<DBSign[]>([]);

  // Wrong questions split by type
  const signWrongQuestions       = wrongQuestions.filter(q => q.signId);
  const behavioralWrongQuestions = wrongQuestions.filter(q => !q.signId);

  useEffect(() => {
    if (!signWrongQuestions.length) return;
    api.getAllSigns()
      .then(allSigns => {
        const signIds = [...new Set(signWrongQuestions.map(q => q.signId))];
        const found   = signIds
          .map(id => allSigns.find(s => s.id === id))
          .filter(Boolean) as DBSign[];
        setWeakSigns(found);
      })
      .catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
    if (isEngineA) {
      router.replace('/(engineA)/home' as any);
    } else {
      router.replace('/(engineB)/home' as any);
    }
  };

  const handleRetry = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (isEngineA) {
      router.replace('/(engineA)/exam' as any);
    } else {
      router.replace('/(engineB)/exam' as any);
    }
  };

  const handleSignPress = async (signId: string) => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (isEngineA) {
      router.push(`/(engineA)/sign/${signId}` as any);
    } else {
      router.push(`/(engineB)/sign/${signId}` as any);
    }
  };

  const handlePracticeWeak = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    // Pass wrong question IDs as a comma-separated URL param
    const ids = wrongQuestions.map(q => q.questionId).join(',');
    if (isEngineA) {
      router.push(`/(engineA)/practice?ids=${ids}` as any);
    } else {
      router.push(`/(engineB)/practice?ids=${ids}` as any);
    }
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
      <ScrollView contentContainerStyle={styles.content}>

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

        {/* Topic breakdown — Engine B only */}
        {!isEngineA && result?.topicBreakdown && (
          <Animated.View style={[styles.breakdownContainer, { opacity: fadeAnim }]}>
            <Text style={styles.breakdownTitle}>በርዕስ ጉዳይ</Text>
            {Object.entries(result.topicBreakdown).map(([topicId, stats]) => (
              <View key={topicId} style={styles.breakdownRow}>
                <Text style={styles.breakdownTopic}>{TOPIC_NAMES[topicId] ?? topicId}</Text>
                <View style={styles.breakdownScoreRow}>
                  <Text style={[styles.breakdownScore, { color: '#2E7D32' }]}>
                    {stats.correct}
                  </Text>
                  <Text style={[styles.breakdownScore, {
                    color: stats.correct < stats.total ? '#C62828' : '#2E7D32',
                  }]}>
                    /{stats.total}
                  </Text>
                </View>
              </View>
            ))}
          </Animated.View>
        )}

        {/* ── Weak signs section — shown when user got questions wrong ── */}
        {(weakSigns.length > 0 || behavioralWrongQuestions.length > 0) && (
          <Animated.View style={[styles.weakContainer, { opacity: fadeAnim }]}>
            {/* Header */}
            <View style={styles.weakHeader}>
              <Text style={styles.weakIcon}>⚠️</Text>
              <View style={{ flex: 1 }}>
                {!isEngineA && (
                  <Text style={styles.weakTitle}>የተሳሳቱ ምልክቶች</Text>
                )}
                {!isEngineA && (
                  <Text style={styles.weakHint}>ምልክቱን ይጫኑ ለመማር</Text>
                )}
              </View>
            </View>

            {/* Sign thumbnails grid — each card is tappable → navigates to sign detail */}
            <View style={styles.weakGrid}>
              {weakSigns.map(sign => (
                <TouchableOpacity
                  key={sign.id}
                  style={styles.weakSignCard}
                  onPress={() => handleSignPress(sign.id)}
                  activeOpacity={0.75}
                >
                  {sign.image_url ? (
                    <Image
                      source={{ uri: sign.image_url }}
                      style={styles.weakSignImage}
                      resizeMode="contain"
                    />
                  ) : (
                    <View style={[styles.weakSignImage, styles.weakSignPlaceholder]}>
                      <Text style={styles.weakSignPlaceholderText}>🚦</Text>
                    </View>
                  )}
                  {!isEngineA && (
                    <Text style={styles.weakSignName} numberOfLines={2}>
                      {sign.name_amharic}
                    </Text>
                  )}
                </TouchableOpacity>
              ))}
              {/* Behavioral wrong questions — shown with question image or topic name */}
              {behavioralWrongQuestions.map(q => (
                <View key={q.questionId} style={styles.weakSignCard}>
                  {q.questionImageUrl ? (
                    <Image
                      source={{ uri: q.questionImageUrl }}
                      style={styles.weakSignImage}
                      resizeMode="contain"
                    />
                  ) : (
                    <View style={[styles.weakSignImage, styles.weakSignPlaceholder]}>
                      <Text style={styles.weakSignPlaceholderText}>📖</Text>
                    </View>
                  )}
                  {!isEngineA && (
                    <Text style={styles.weakSignName} numberOfLines={2}>
                      {TOPIC_NAMES[q.topicId] ?? q.topicId}
                    </Text>
                  )}
                </View>
              ))}
            </View>

            {/* Practice weak button */}
            <TouchableOpacity
              style={styles.practiceBtn}
              onPress={handlePracticeWeak}
              activeOpacity={0.85}
            >
              <Text style={styles.practiceIcon}>🔁</Text>
              {!isEngineA && (
                <Text style={styles.practiceText}>የተሳሳቱትን ለማሻሻል ይለማመዱ</Text>
              )}
            </TouchableOpacity>
          </Animated.View>
        )}

        {/* ── Ad mockups — DEMO ONLY, replace with real data ── */}
        <Animated.View style={[styles.adsContainer, { opacity: fadeAnim }]}>
          <AdCard
            variant="instructor"
            name="יוסי לוי"
            tagline="ታማኝ፣ ታጋሽ እና ባለሙያ"
            location="ቴል አቪቭ"
            phone="0501234567"
          />
          <AdCard
            variant="business"
            businessName="מנורה ביטוח רכב"
            description="በአንድ ደቂቃ ዋጋ ያግኙ — ለአዲስ ፈቃድ ልዩ ዋጋ"
            ctaLabel="ዝርዝሮች"
            ctaUrl="https://www.menora.co.il"
          />
        </Animated.View>

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
                <Text style={styles.shareBtnText}>שתף את ההצלחה שלך!</Text>
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
  breakdownContainer: {
    alignSelf:       'stretch',
    backgroundColor: '#ffffff',
    borderRadius:    16,
    padding:         16,
    gap:             10,
    shadowColor:     '#000',
    shadowOffset:    { width: 0, height: 2 },
    shadowOpacity:   0.08,
    shadowRadius:    6,
    elevation:       3,
  },
  breakdownTitle: {
    ...Typography.body,
    color:        '#191c1e',
    fontWeight:   '700',
    marginBottom: 4,
  },
  breakdownRow: {
    flexDirection:  'row',
    justifyContent: 'space-between',
    alignItems:     'center',
  },
  breakdownTopic: {
    ...Typography.bodySmall,
    color: '#404943',
    flex:  1,
  },
  breakdownScoreRow: {
    flexDirection: 'row',
    alignItems:    'center',
    flexShrink:    0,
  },
  breakdownScore: {
    ...Typography.body,
    fontWeight: '700',
  },

  // ── Weak signs section ─────────────────────────────────────────────────────
  weakContainer: {
    alignSelf:       'stretch',
    backgroundColor: '#ffffff',
    borderRadius:    20,
    padding:         16,
    gap:             14,
    borderWidth:     1,
    borderColor:     '#FFCDD2',
    shadowColor:     '#000',
    shadowOffset:    { width: 0, height: 2 },
    shadowOpacity:   0.08,
    shadowRadius:    6,
    elevation:       3,
  },
  weakHeader: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           8,
  },
  weakIcon: {
    fontSize: 22,
  },
  weakTitle: {
    ...Typography.body,
    color:      '#191c1e',
    fontWeight: '700',
  },
  weakGrid: {
    flexDirection:  'row',
    flexWrap:       'wrap',
    gap:            10,
    justifyContent: 'flex-start',
  },
  weakSignCard: {
    alignItems:      'center',
    gap:             4,
    padding:         6,
    backgroundColor: '#ffffff',
    borderRadius:    14,
    shadowColor:     '#000',
    shadowOffset:    { width: 0, height: 4 },
    shadowOpacity:   0.14,
    shadowRadius:    8,
    elevation:       5,
  },
  weakHint: {
    fontSize:  11,
    color:     '#9e9e9e',
    marginTop: 2,
  },
  weakSignImage: {
    width:        90,
    height:       90,
    borderRadius: 12,
  },
  weakSignPlaceholder: {
    justifyContent: 'center',
    alignItems:     'center',
  },
  weakSignPlaceholderText: {
    fontSize: 32,
  },
  weakSignName: {
    fontSize:   15,
    lineHeight: 22,
    color:      '#404943',
    textAlign:  'center',
    maxWidth:   102,
  },
  practiceBtn: {
    flexDirection:   'row',
    alignItems:      'center',
    justifyContent:  'center',
    backgroundColor: Colors.wrong,
    borderRadius:    14,
    paddingVertical: 14,
    gap:             10,
  },
  practiceIcon: {
    fontSize: 22,
  },
  practiceText: {
    ...Typography.body,
    color:      '#FFFFFF',
    fontWeight: '700',
  },

  // ── Ads ────────────────────────────────────────────────────────────────────
  adsContainer: {
    alignSelf: 'stretch',
    gap:       12,
  },

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
