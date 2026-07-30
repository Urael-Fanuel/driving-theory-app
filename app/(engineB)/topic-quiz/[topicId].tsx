/**
 * app/(engineB)/topic-quiz/[topicId].tsx
 * Engine B — Per-Topic Mini Quiz (10 questions, text-based, Amharic).
 *
 * Mirrors Engine A topic-quiz but uses TextAnswerCard + TextFeedback.
 * Shows inline result at the end with AdCard.
 *
 * Pass threshold: 7/10 (70%)
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  Dimensions,
} from 'react-native';

const SCREEN_WIDTH = Dimensions.get('window').width;
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Colors } from '../../../constants/colors';
import { Typography } from '../../../constants/typography';
import { LoadingScreen } from '../../../components/shared/LoadingScreen';
import { TextAnswerCard } from '../../../components/engineB/TextAnswerCard';
import { TextFeedback } from '../../../components/engineB/TextFeedback';
import { AudioButton } from '../../../components/shared/AudioButton';
import { ProgressBar } from '../../../components/shared/ProgressBar';
import { AdCard } from '../../../components/shared/AdCard';
import { useTopicQuiz } from '../../../hooks/useTopicQuiz';
import { useAudio, playAndAwaitAudio } from '../../../hooks/useAudio';
import { speakAndAwait, stopTTS } from '../../../utils/googleTTS';
import ConfettiCannon from 'react-native-confetti-cannon';
import * as api from '../../../backend/api';
import { DBSign } from '../../../backend/supabaseClient';
import { OfflineBanner } from '../../../components/shared/OfflineBanner';


// ─── Audio base URL ────────────────────────────────────────────────────────────
const _AUDIO_BASE = (process.env.EXPO_PUBLIC_SUPABASE_URL ?? '') + '/storage/v1/object/public/audio';

// ─── Amharic number prefixes for answer reading (same as behavioral-subtopic) ──
const AMHARIC_NUMBERS = ['አንድ', 'ሁለት', 'ሶስት', 'አራት'];

// ─── Component ────────────────────────────────────────────────────────────────

export default function EngineBTopicQuizScreen() {
  const { topicId, levelId } = useLocalSearchParams<{ topicId: string; levelId?: string }>();
  const router               = useRouter();

  const {
    phase,
    currentQuestion,
    questions,
    currentIndex,
    progress,
    submitAnswer,
    nextQuestion,
    goToQuestion,
    result,
    lastAnswerCorrect,
    selectedAnswerId,
    restart,
  } = useTopicQuiz(topicId ?? '', levelId);

  const [showFeedback, setShowFeedback] = useState(false);
  const [signs,        setSigns]        = useState<DBSign[]>([]);
  const [ttsSpeaking,  setTtsSpeaking]  = useState(false);
  const ttsSpeakingRef = useRef(false);
  const confettiRef    = useRef<any>(null);
  const scrollRef      = useRef<any>(null);
  const { stopAudio } = useAudio();

  // Load all signs once (for displaying the sign image per question)
  useEffect(() => {
    api.getAllSigns().then(setSigns).catch(() => {});
  }, []);

  const currentSign  = signs.find(s => s.id === currentQuestion?.sign_id) ?? null;
  const isBehavioral = Boolean(currentQuestion && !currentQuestion.sign_id);

  // Reset TTS state when question changes (same as behavioral-subtopic)
  useEffect(() => {
    ttsSpeakingRef.current = false;
    stopTTS().catch(() => {});
    setTtsSpeaking(false);
  }, [currentIndex]);

  // Leaving the screen must cancel the read-aloud SEQUENCE, not just silence the
  // current clip. stopTTS() resolves the pending speakAndAwait, which the loop
  // reads as "clip finished" — without clearing this flag it would advance to the
  // next answer and start speaking again after the screen is gone.
  useEffect(() => {
    return () => {
      ttsSpeakingRef.current = false;
      stopTTS().catch(() => {});
    };
  }, []);

  // Show feedback after answer
  useEffect(() => {
    if (phase === 'feedback_correct' || phase === 'feedback_wrong') {
      setTimeout(() => setShowFeedback(true), 200);
    }
  }, [phase]);

  // ── Confetti + crowd cheer when quiz is passed ────────────────────────────
  useEffect(() => {
    if (phase === 'result' && result?.passed) {
      setTimeout(() => confettiRef.current?.start(), 300);
      playAndAwaitAudio(`${_AUDIO_BASE}/crowd_cheer.mp3`, () => false)
        .then(() => speakAndAwait('ብራቮ!'))
        .catch(() => {});
    }
  }, [phase, result?.passed]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleNext = () => {
    setShowFeedback(false);
    scrollRef.current?.scrollTo({ y: 0, animated: false });
    nextQuestion();
  };

  const handleBack = async () => {
    ttsSpeakingRef.current = false;   // cancel the read-aloud sequence, not just the current clip
    setTtsSpeaking(false);
    await stopAudio();
    await stopTTS().catch(() => {});
    router.back();
  };

  const canGoPrev = currentIndex > 0;
  const canGoNext = currentIndex < questions.length - 1;

  const handleNavPrev = async () => {
    if (!canGoPrev) return;
    await stopAudio();
    await stopTTS().catch(() => {});
    setShowFeedback(false);
    goToQuestion(currentIndex - 1);
  };

  const handleNavNext = async () => {
    if (!canGoNext) return;
    await stopAudio();
    await stopTTS().catch(() => {});
    setShowFeedback(false);
    goToQuestion(currentIndex + 1);
  };

  // ── Card state (keyed by answer ID, not index — matches TextAnswerCard API) ──
  const answerCardState = (answerId: string) => {
    if (!currentQuestion) return 'default' as const;
    if (phase !== 'feedback_correct' && phase !== 'feedback_wrong') {
      return 'default' as const;
    }
    const answer = currentQuestion.answers.find(a => a.id === answerId);
    if (!answer) return 'default' as const;
    if (answer.id === selectedAnswerId) {
      return answer.is_correct ? 'correct' as const : 'wrong' as const;
    }
    if (answer.is_correct) return 'correct' as const;
    return 'default' as const;
  };

  const feedbackAudioUri = lastAnswerCorrect
    ? (currentQuestion?.explanation_correct_audio_url ?? '')
    : (currentQuestion?.explanation_wrong_audio_url ?? '');

  // ── Result screen (inline) ─────────────────────────────────────────────────
  if (phase === 'result' && result) {
    const passed     = result.passed;
    const scoreEmoji = passed ? '🏆' : '💪';
    const pct        = result.total > 0 ? Math.round((result.score / result.total) * 100) : 0;
    const statusText = passed ? 'አልፈዋል!' : 'ዳግም ሞክሩ';
    const statusColor = passed ? Colors.correct : Colors.wrong;

    return (
      <SafeAreaView style={styles.safeArea}>
        {passed && (
          <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, direction: 'ltr' }} pointerEvents="none">
            <ConfettiCannon
              ref={confettiRef}
              count={250}
              origin={{ x: SCREEN_WIDTH / 2, y: 0 }}
              autoStart={false}
              fadeOut
              explosionSpeed={400}
              fallSpeed={3000}
              colors={['#FDD835', '#2E7D32', '#1976D2', '#C62828', '#FF6F00', '#6A1B9A']}
            />
          </View>
        )}
        <ScrollView contentContainerStyle={styles.resultContent}>
          {/* Score circle */}
          <View style={[styles.resultCircle, { borderColor: statusColor }]}>
            <Text style={styles.resultEmoji}>{scoreEmoji}</Text>
            <Text style={styles.resultScore}>{result.score}/{result.total}</Text>
            <Text style={[styles.resultPct, { color: statusColor }]}>{pct}%</Text>
          </View>

          {/* Status text */}
          <Text style={[styles.statusText, { color: statusColor }]}>{statusText}</Text>

          {/* Progress bar */}
          <ProgressBar
            current={result.score}
            total={result.total}
            showLabel
            fillColor={statusColor}
            height={10}
            style={styles.resultBar}
          />

          {/* Ad — topic-relevant */}
          <View style={styles.adWrapper}>
            {topicId === 'vehicle_knowledge' ? (
              <AdCard
                variant="business"
                businessName="מוסך ביתא"
                description="🔧 የመኪና ጥገና — ፈጣን እና ታማኝ"
                ctaLabel="ደውሉ"
                ctaUrl="tel:0501234567"
              />
            ) : topicId === 'society_law' ? (
              <AdCard
                variant="business"
                businessName="ביטוח ישיר"
                description="🛡️ ርካሽ የመኪና ኢንሹራንስ ለኢትዮጵያውያን"
                ctaLabel="ዋጋ ይጠይቁ"
                ctaUrl="tel:0501234568"
              />
            ) : (
              <AdCard
                variant="instructor"
                name="יוסי לוי"
                tagline="ታማኝ፣ ታጋሽ እና ባለሙያ"
                location="ቴל אቪቭ"
                phone="0501234567"
              />
            )}
          </View>

          {/* Buttons */}
          <View style={styles.resultButtons}>
            <TouchableOpacity style={styles.retryBtn} onPress={restart} activeOpacity={0.85}>
              <Text style={styles.retryBtnIcon}>🔄</Text>
              <Text style={styles.retryBtnText}>ዳግም ሞክር</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.backBtn} onPress={handleBack} activeOpacity={0.85}>
              <Text style={styles.backBtnIcon}>←</Text>
              <Text style={styles.backBtnText}>ወደ ርዕሰ ጉዳዩ</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={styles.fullExamBtn}
            onPress={async () => {
              ttsSpeakingRef.current = false;   // cancel the read-aloud sequence, not just the current clip
              setTtsSpeaking(false);
              await stopAudio();
              await stopTTS().catch(() => {});
              router.push('/(engineB)/exam' as any);
            }}
            activeOpacity={0.85}
          >
            <Text style={styles.fullExamText}>📝  ወደ ሙሉ ፈተና</Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ── Loading ────────────────────────────────────────────────────────────────
  if (phase === 'loading' || !currentQuestion) return <LoadingScreen message="ጥያቄዎችን እየጫነ..." />;

  // ── Question screen ────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.safeArea}>
      <OfflineBanner />
      {/* Top bar */}
      <View style={styles.topBar}>
        <TouchableOpacity style={styles.backButton} onPress={handleBack}>
          <Text style={styles.backIcon}>←</Text>
        </TouchableOpacity>
        <ProgressBar
          current={progress.current}
          total={progress.total}
          fillColor={Colors.secondary}
          trackColor='#e0e0e0'
          height={6}
        />
      </View>

      {/* Navigation row: ‹ | 1/93 | › */}
      <View style={styles.navRow}>
        <TouchableOpacity
          style={[styles.navBtn, !canGoPrev && styles.navBtnDisabled]}
          onPress={handleNavPrev}
          disabled={!canGoPrev}
        >
          <Text style={styles.navBtnIcon}>‹</Text>
        </TouchableOpacity>

        <Text style={styles.navCounter}>{progress.current} / {progress.total}</Text>

        <TouchableOpacity
          style={[styles.navBtn, !canGoNext && styles.navBtnDisabled]}
          onPress={handleNavNext}
          disabled={!canGoNext}
        >
          <Text style={styles.navBtnIcon}>›</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        ref={scrollRef}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Visual above question: behavioral subtopic image / sign image / nothing */}
        {isBehavioral && currentQuestion?.question_image_url ? (
          <View style={styles.signImageContainer}>
            <Image
              source={{ uri: currentQuestion.question_image_url }}
              style={styles.signImage}
              resizeMode="cover"
            />
          </View>
        ) : !isBehavioral && currentSign?.image_url ? (
          <View style={styles.signImageContainer}>
            <Image
              source={{ uri: currentSign.image_url }}
              style={styles.signImage}
              resizeMode="contain"
            />
          </View>
        ) : null}

        {/* Question play button + text (AudioButton for sign, TTS for behavioral) — button first, reachable without scrolling */}
        <View style={styles.questionCard}>
          {currentQuestion.question_audio_url ? (
            <AudioButton audioUri={currentQuestion.question_audio_url} size={36} />
          ) : (
            /* Behavioral question — TTS button (same as behavioral-subtopic) */
            <TouchableOpacity
              style={styles.ttsPlayBtn}
              onPress={async () => {
                if (ttsSpeakingRef.current) {
                  ttsSpeakingRef.current = false;
                  setTtsSpeaking(false);
                  await stopTTS();
                } else {
                  ttsSpeakingRef.current = true;
                  setTtsSpeaking(true);
                  // `heard` gates the loop: speakAndAwait returns false when
                  // nothing was actually spoken (offline with no cached
                  // rendering). Without this the loop runs through every answer
                  // in milliseconds in total silence.
                  let heard = await speakAndAwait(currentQuestion.question_amharic);
                  for (let i = 0; heard && i < currentQuestion.answers.length; i++) {
                    if (!ttsSpeakingRef.current) break;
                    heard = await speakAndAwait(`${AMHARIC_NUMBERS[i]}። ${currentQuestion.answers[i].text_amharic ?? ''}`);
                  }
                  ttsSpeakingRef.current = false;
                  setTtsSpeaking(false);
                }
              }}
              accessibilityLabel="ጥያቄ ድምጽ"
            >
              <Text style={styles.ttsPlayIcon}>{ttsSpeaking ? '⏸' : '▶️'}</Text>
            </TouchableOpacity>
          )}
          <Text style={styles.questionText}>{currentQuestion.question_amharic}</Text>
        </View>

        {/* Answer cards */}
        <View style={styles.answersContainer}>
          {currentQuestion.answers.map((answer, index) => (
            <TextAnswerCard
              key={answer.id}
              answerId={String(index + 1)}
              text={answer.text_amharic ?? ''}
              imageUri={answer.image_url}
              audioUri={answer.audio_url}
              cardState={answerCardState(answer.id)}
              onPress={() => submitAnswer(answer.id)}
              disabled={phase !== 'question'}
            />
          ))}
        </View>
      </ScrollView>

      {/* Feedback overlay */}
      {showFeedback && (
        <TextFeedback
          isCorrect={!!lastAnswerCorrect}
          explanationAudioUri={feedbackAudioUri}
          ragQuery={!lastAnswerCorrect && currentQuestion && selectedAnswerId ? {
            question:      currentQuestion.question_amharic,
            wrongAnswer:   currentQuestion.answers.find(a => a.id === selectedAnswerId)?.text_amharic ?? '',
            correctAnswer: currentQuestion.answers.find(a => a.is_correct)?.text_amharic ?? '',
          } : undefined}
          explanationText={
            isBehavioral
              ? (lastAnswerCorrect
                  ? `ትክክል! ${currentQuestion.answers.find(a => a.is_correct)?.text_amharic ?? ''}`
                  : `ስህተት! ትክክለኛው መልስ: ${currentQuestion.answers.find(a => a.is_correct)?.text_amharic ?? ''}`)
              : (lastAnswerCorrect
                  ? (currentQuestion.explanation_correct_amharic ?? '')
                  : (currentQuestion.explanation_wrong_amharic ?? ''))
          }
          onNext={handleNext}
        />
      )}
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safeArea: {
    flex:            1,
    backgroundColor: '#f7f9fb',
  },
  topBar: {
    flexDirection:     'row',
    alignItems:        'center',
    paddingHorizontal: 12,
    paddingTop:        16,
    paddingBottom:     8,
    gap:               10,
  },
  backButton: {
    width:           44,
    height:          44,
    borderRadius:    22,
    backgroundColor: '#ffffff',
    justifyContent:  'center',
    alignItems:      'center',
    flexShrink:      0,
    shadowColor:     '#000',
    shadowOffset:    { width: 0, height: 2 },
    shadowOpacity:   0.10,
    shadowRadius:    4,
    elevation:       3,
  },
  backIcon: {
    fontSize: 20,
    color:    '#191c1e',
  },
  navRow: {
    flexDirection:     'row',
    alignItems:        'center',
    justifyContent:    'center',
    paddingHorizontal: 16,
    paddingBottom:     8,
    gap:               16,
  },
  navBtn: {
    width:           48,
    height:          48,
    borderRadius:    24,
    backgroundColor: '#ffffff',
    justifyContent:  'center',
    alignItems:      'center',
    shadowColor:     '#000',
    shadowOffset:    { width: 0, height: 2 },
    shadowOpacity:   0.10,
    shadowRadius:    4,
    elevation:       3,
  },
  navBtnDisabled: {
    opacity: 0.35,
  },
  navBtnIcon: {
    fontSize:   34,
    color:      '#1565C0',
    fontWeight: '300',
    lineHeight: 40,
  },
  navCounter: {
    fontSize:   17,
    fontWeight: '700',
    color:      '#191c1e',
    minWidth:   70,
    textAlign:  'center',
  },
  content: {
    paddingHorizontal: 16,
    paddingTop:        12,
    paddingBottom:     24,
    gap:               16,
  },
  signImageContainer: {
    alignSelf:       'center',
    width:           150,
    height:          150,
    borderRadius:    20,
    backgroundColor: '#ffffff',
    shadowColor:     '#000',
    shadowOffset:    { width: 0, height: 3 },
    shadowOpacity:   0.10,
    shadowRadius:    6,
    elevation:       3,
  },
  signImage: {
    width:  '100%',
    height: '100%',
  },
  questionCard: {
    backgroundColor: '#ffffff',
    borderRadius:    16,
    padding:         16,
    gap:             10,
    shadowColor:     '#000',
    shadowOffset:    { width: 0, height: 3 },
    shadowOpacity:   0.08,
    shadowRadius:    6,
    elevation:       3,
  },
  questionText: {
    ...Typography.question,
    color:      '#191c1e',
    lineHeight: 28,
  },
  answersContainer: {
    gap: 10,
  },
  ttsPlayBtn: {
    width:           44,
    height:          44,
    borderRadius:    22,
    backgroundColor: '#FDD835',
    justifyContent:  'center',
    alignItems:      'center',
    shadowColor:     '#000',
    shadowOffset:    { width: 0, height: 4 },
    shadowOpacity:   0.3,
    shadowRadius:    8,
    elevation:       6,
  },
  ttsPlayIcon: { fontSize: 20, textAlign: 'center' as const },

  // ── Result screen ────────────────────────────────────────────────────────
  resultContent: {
    paddingHorizontal: 24,
    paddingTop:        40,
    paddingBottom:     32,
    alignItems:        'center',
    gap:               20,
  },
  resultCircle: {
    width:           160,
    height:          160,
    borderRadius:    80,
    borderWidth:     6,
    backgroundColor: '#ffffff',
    justifyContent:  'center',
    alignItems:      'center',
    shadowColor:     '#000',
    shadowOffset:    { width: 0, height: 4 },
    shadowOpacity:   0.12,
    shadowRadius:    10,
    elevation:       6,
    gap:             4,
  },
  resultEmoji: {
    fontSize: 36,
  },
  resultScore: {
    fontSize:   28,
    fontWeight: '800',
    color:      '#191c1e',
  },
  resultPct: {
    fontSize:   16,
    fontWeight: '600',
  },
  statusText: {
    fontSize:   22,
    fontWeight: '700',
  },
  resultBar: {
    width: '100%',
  },
  adWrapper: {
    width: '100%',
  },
  resultButtons: {
    flexDirection: 'row',
    gap:           12,
    width:         '100%',
  },
  retryBtn: {
    flex:            1,
    flexDirection:   'row',
    alignItems:      'center',
    justifyContent:  'center',
    gap:             8,
    paddingVertical: 16,
    borderRadius:    18,
    backgroundColor: Colors.secondary,
    elevation:       4,
    shadowColor:     '#000',
    shadowOffset:    { width: 0, height: 3 },
    shadowOpacity:   0.15,
    shadowRadius:    6,
  },
  retryBtnIcon: {
    fontSize: 20,
  },
  retryBtnText: {
    fontSize:   15,
    fontWeight: '700',
    color:      '#ffffff',
  },
  backBtn: {
    flex:            1,
    flexDirection:   'row',
    alignItems:      'center',
    justifyContent:  'center',
    gap:             8,
    paddingVertical: 16,
    borderRadius:    18,
    backgroundColor: '#ffffff',
    borderWidth:     1.5,
    borderColor:     '#dde3ea',
    elevation:       3,
    shadowColor:     '#000',
    shadowOffset:    { width: 0, height: 2 },
    shadowOpacity:   0.10,
    shadowRadius:    4,
  },
  backBtnIcon: {
    fontSize: 20,
    color:    '#404943',
  },
  backBtnText: {
    fontSize:   15,
    fontWeight: '700',
    color:      '#404943',
  },
  fullExamBtn: {
    width:           '100%',
    paddingVertical: 18,
    borderRadius:    18,
    backgroundColor: Colors.accent,
    alignItems:      'center',
    elevation:       4,
    shadowColor:     '#000',
    shadowOffset:    { width: 0, height: 3 },
    shadowOpacity:   0.15,
    shadowRadius:    6,
  },
  fullExamText: {
    fontSize:   17,
    fontWeight: '700',
    color:      '#ffffff',
  },
});
