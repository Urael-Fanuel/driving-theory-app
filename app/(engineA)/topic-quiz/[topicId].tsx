/**
 * app/(engineA)/topic-quiz/[topicId].tsx
 * Engine A — Per-Topic Mini Quiz (10 questions, voice/image, no text).
 *
 * Appears after the user has studied all signs in a topic.
 * Same UX as exam.tsx (image answer cards, voice recognition, audio sequence)
 * but shorter (10 questions) and shows an inline result with AdCard.
 *
 * Pass threshold: 7/10 (70%)
 */

import React, { useEffect, useCallback, useRef, useState } from 'react';
import {
  View,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  Text,
  ScrollView,
  Image,
  Animated,
  Dimensions,
} from 'react-native';

const SCREEN_WIDTH = Dimensions.get('window').width;
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { Colors } from '../../../constants/colors';
import { LoadingScreen } from '../../../components/shared/LoadingScreen';
import { ImageAnswerCard } from '../../../components/engineA/ImageAnswerCard';
import { VoiceAnswerButton } from '../../../components/engineA/VoiceAnswerButton';
import { AudioFeedback } from '../../../components/engineA/AudioFeedback';
import { ProgressBar } from '../../../components/shared/ProgressBar';
import { AdCard } from '../../../components/shared/AdCard';
import { useTopicQuiz } from '../../../hooks/useTopicQuiz';
import { useAudio, playAndAwaitAudio } from '../../../hooks/useAudio';
import { useVoiceRecognition } from '../../../hooks/useVoiceRecognition';
import { speakAndAwait, stopTTS, onTTSSpeakingChange, getIsTTSSpeaking } from '../../../utils/googleTTS';
import ConfettiCannon from 'react-native-confetti-cannon';
import { isQuestionAudioReady } from '../../../services/audioCache';
import * as api from '../../../backend/api';
import { DBSign } from '../../../backend/supabaseClient';


// ─── Praise phrases (same set as behavioral-subtopic) ─────────────────────────
const CORRECT_PRAISES = [
  'ትክክል!', 'አዎ!', 'አሪፍ!', 'ጎሽ!', 'እሰይ!', 'ዋውው!', 'ጎቨዝ!',
  'በጣም ጥሩ!', 'በጣም አሪፍ!', 'እንድያ ነው!', 'ዋውው በጣም ጥሩ!',
];
const randomPraise = () => CORRECT_PRAISES[Math.floor(Math.random() * CORRECT_PRAISES.length)];

// ─── Audio URLs ───────────────────────────────────────────────────────────────
const _AUDIO_BASE = (process.env.EXPO_PUBLIC_SUPABASE_URL ?? '') + '/storage/v1/object/public/audio';
const NUMBER_URLS = [
  `${_AUDIO_BASE}/number_1.mp3`,
  `${_AUDIO_BASE}/number_2.mp3`,
  `${_AUDIO_BASE}/number_3.mp3`,
  `${_AUDIO_BASE}/number_4.mp3`,
];

// ─── Component ────────────────────────────────────────────────────────────────

export default function EngineATopicQuizScreen() {
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

  const { playAudio, stopAudio, audioState } = useAudio();
  const [isTTSPlaying,       setIsTTSPlaying]       = useState(getIsTTSSpeaking);
  const [showFeedback,       setShowFeedback]       = useState(false);
  const [playingAnswerIndex, setPlayingAnswerIndex] = useState<number | null>(null);
  const [signs,              setSigns]              = useState<DBSign[]>([]);
  const [isTabFocused,       setIsTabFocused]       = useState(false);
  const [audioRestartKey,    setAudioRestartKey]    = useState(0);
  const [feedbackTTSText,    setFeedbackTTSText]    = useState('');

  // Refs for sequence control (same pattern as exam.tsx)
  const phaseRef               = useRef(phase);
  phaseRef.current             = phase;
  const sequenceCancelledRef   = useRef(false);
  const confettiRef            = useRef<any>(null);
  const scrollRef              = useRef<any>(null);
  const replayFromAnswerRef    = useRef<number | null>(null);
  const playingAnswerIndexRef  = useRef<number | null>(null);
  const answerAudioStartedRef  = useRef(false);
  const answerFullyReadRef     = useRef(false);
  const voiceFailedRef         = useRef(false);
  const answerCallbackRef      = useRef<(idx: number) => void>(() => {});

  // Keep playingAnswerIndexRef in sync
  useEffect(() => { playingAnswerIndexRef.current = playingAnswerIndex; }, [playingAnswerIndex]);
  useEffect(() => onTTSSpeakingChange(setIsTTSPlaying), []);

  // Load all signs (for displaying sign image per question)
  useEffect(() => {
    api.getAllSigns().then(setSigns).catch(() => {});
  }, []);

  const currentSign    = signs.find(s => s.id === currentQuestion?.sign_id) ?? null;
  const isBehavioral   = Boolean(currentQuestion && !currentQuestion.sign_id);

  // ── Voice recognition ───────────────────────────────────────────────────────
  const {
    voiceState,
    startListening,
    stopListening,
    cancelListening,
  } = useVoiceRecognition(
    useCallback((answerIndex: number | null) => {
      if (answerIndex !== null) answerCallbackRef.current(answerIndex);
    }, [])
  );

  // ── Tab focus tracking ──────────────────────────────────────────────────────
  useFocusEffect(
    useCallback(() => {
      setIsTabFocused(true);
      return () => {
        setIsTabFocused(false);
        cancelListening();
        stopAudio();
        stopTTS().catch(() => {});
      };
    }, [cancelListening, stopAudio])
  );

  // ── Answer select (tap OR voice) ────────────────────────────────────────────
  const handleAnswerSelect = useCallback((index: number) => {
    if (!currentQuestion) return;
    if (phase !== 'question') return;
    const answer = currentQuestion.answers[index];
    if (!answer) return;
    cancelListening();
    sequenceCancelledRef.current = true;
    stopAudio();
    stopTTS().catch(() => {});
    setPlayingAnswerIndex(null);

    // Behavioral questions: build TTS feedback text (same logic as behavioral-subtopic)
    if (!currentQuestion.sign_id) {
      const correctText = currentQuestion.answers.find(a => a.is_correct)?.text_amharic ?? '';
      setFeedbackTTSText(
        answer.is_correct
          ? `${randomPraise()} ${correctText}`
          : `ስህተት! ትክክለኛው መልስ: ${correctText}`
      );
    }

    submitAnswer(answer.id);
  }, [currentQuestion, phase, submitAnswer, stopAudio, cancelListening]); // eslint-disable-line react-hooks/exhaustive-deps

  answerCallbackRef.current = handleAnswerSelect;

  // ── Voice button press ──────────────────────────────────────────────────────
  const handleVoicePress = useCallback(async () => {
    if (voiceState === 'listening') {
      await stopListening();
    } else if (voiceState === 'idle' || voiceState === 'failed') {
      await startListening();
    }
  }, [voiceState, startListening, stopListening]);

  // ── Audio sequence (same logic as exam.tsx) ─────────────────────────────────
  useEffect(() => {
    if (phase !== 'question' || !currentQuestion || !isTabFocused) return;
    voiceFailedRef.current      = false;
    sequenceCancelledRef.current = false;
    cancelListening();
    setShowFeedback(false);
    let cancelled = false;
    const isCancelled = () =>
      cancelled || voiceFailedRef.current || sequenceCancelledRef.current || phaseRef.current !== 'question';

    async function runSequence() {
      await stopAudio();
      await stopTTS();
      if (isCancelled()) return;

      const isBehavioral   = !currentQuestion!.sign_id;
      const resumeFromAnswer = replayFromAnswerRef.current;
      replayFromAnswerRef.current = null;

      if (resumeFromAnswer === null) {
        if (isBehavioral) {
          const ok = await speakAndAwait(currentQuestion!.question_amharic ?? '');
          if (!ok || isCancelled()) return;
        } else {
          const qId      = currentQuestion!.id;
          const qAudioUrl = currentQuestion!.question_audio_url
            || `${_AUDIO_BASE}/${qId.toLowerCase()}.mp3`;
          await playAndAwaitAudio(qAudioUrl, isCancelled);
          if (isCancelled()) return;
        }

        await new Promise(res => setTimeout(res, 1000));
        if (isCancelled()) return;
      }

      for (let i = resumeFromAnswer ?? 0; i < currentQuestion!.answers.length && i < 4; i++) {
        if (isCancelled()) return;

        setPlayingAnswerIndex(i);
        answerAudioStartedRef.current = false;
        answerFullyReadRef.current    = false;

        await playAndAwaitAudio(NUMBER_URLS[i], isCancelled);
        if (isCancelled()) return;

        await new Promise<void>(r => setTimeout(r, 0));
        if (isCancelled()) return;

        answerAudioStartedRef.current = true;

        const answer = currentQuestion!.answers[i];
        if (isBehavioral) {
          const ok = await speakAndAwait(answer?.text_amharic ?? '');
          if (!ok || isCancelled()) return;
        } else {
          const answerUrl = answer?.audio_url
            || `${_AUDIO_BASE}/answer_${currentQuestion!.id}_${answer?.id}.mp3`;
          await playAndAwaitAudio(answerUrl, isCancelled);
          if (isCancelled()) return;
        }

        answerFullyReadRef.current = true;
        await new Promise<void>(r => setTimeout(r, 0));
      }
      setPlayingAnswerIndex(null);
    }

    runSequence().catch(() => {});
    return () => {
      cancelled = true;
      setPlayingAnswerIndex(null);
    };
  }, [currentQuestion?.id, isTabFocused, audioRestartKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Voice failure ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (voiceState === 'failed') {
      voiceFailedRef.current = true;
      stopAudio();
      playAudio(`${_AUDIO_BASE}/try_again.mp3`).catch(() => {});
    } else {
      voiceFailedRef.current = false;
    }
  }, [voiceState]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Show feedback overlay ────────────────────────────────────────────────────
  useEffect(() => {
    if (phase === 'feedback_correct' || phase === 'feedback_wrong') {
      setTimeout(() => setShowFeedback(true), 300);
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

  // ── Audio button ─────────────────────────────────────────────────────────────
  const handleAudioButton = () => {
    if (audioState === 'playing' || audioState === 'loading' || isTTSPlaying) {
      sequenceCancelledRef.current = true;
      stopAudio();
      stopTTS().catch(() => {});
    } else {
      setAudioRestartKey(k => k + 1);
    }
  };

  // ── 🔊 Answer replay button (sign audio URL) ────────────────────────────────
  const handleAnswerAudioPress = useCallback(async (audioUrl: string, answerIndex: number) => {
    if (phaseRef.current !== 'question') return;
    const playingAtTime = playingAnswerIndexRef.current;
    sequenceCancelledRef.current = true;
    await stopTTS();
    setPlayingAnswerIndex(answerIndex);
    await playAndAwaitAudio(audioUrl, () => phaseRef.current !== 'question');
    setPlayingAnswerIndex(null);
    if (phaseRef.current !== 'question') return;
    if (playingAtTime === null) return;
    const resumeFrom = answerFullyReadRef.current
      ? playingAtTime + 1
      : answerAudioStartedRef.current
        ? answerIndex + 1
        : playingAtTime;
    if (resumeFrom < 4) {
      replayFromAnswerRef.current  = resumeFrom;
      sequenceCancelledRef.current = false;
      setAudioRestartKey(k => k + 1);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── 🔊 Behavioral answer TTS replay ─────────────────────────────────────────
  const handleBehavioralAnswerAudioPress = useCallback(async (text: string, answerIndex: number) => {
    if (phaseRef.current !== 'question') return;
    const playingAtTime = playingAnswerIndexRef.current;
    sequenceCancelledRef.current = true;
    await stopAudio();
    await stopTTS();
    setPlayingAnswerIndex(answerIndex);
    const ok = await speakAndAwait(text);
    setPlayingAnswerIndex(null);
    if (!ok || phaseRef.current !== 'question') return;
    if (playingAtTime === null) return;
    const resumeFrom = answerFullyReadRef.current
      ? playingAtTime + 1
      : answerAudioStartedRef.current
        ? answerIndex + 1
        : playingAtTime;
    if (resumeFrom < 4) {
      replayFromAnswerRef.current  = resumeFrom;
      sequenceCancelledRef.current = false;
      setAudioRestartKey(k => k + 1);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleNext = () => {
    setShowFeedback(false);
    cancelListening();
    scrollRef.current?.scrollTo({ y: 0, animated: false });
    nextQuestion();
  };

  const handleBack = () => {
    cancelListening();
    stopAudio();
    stopTTS().catch(() => {});
    router.back();
  };

  const canGoPrev = currentIndex > 0;
  const canGoNext = currentIndex < questions.length - 1;

  const handleNavPrev = () => {
    if (!canGoPrev) return;
    sequenceCancelledRef.current = true;  // cancel running sequence immediately
    stopAudio();
    stopTTS().catch(() => {});
    cancelListening();
    setShowFeedback(false);
    goToQuestion(currentIndex - 1);
  };

  const handleNavNext = () => {
    if (!canGoNext) return;
    sequenceCancelledRef.current = true;  // cancel running sequence immediately
    stopAudio();
    stopTTS().catch(() => {});
    cancelListening();
    setShowFeedback(false);
    goToQuestion(currentIndex + 1);
  };

  // ── Answer card state ────────────────────────────────────────────────────────
  const answerCardState = (index: number) => {
    if (phase !== 'feedback_correct' && phase !== 'feedback_wrong') {
      if (playingAnswerIndex === index) return 'reading' as const;
      return voiceState === 'failed' ? 'highlight' as const : 'default' as const;
    }
    const answer = currentQuestion?.answers[index];
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

  const audioButtonIcon = (audioState === 'playing' || isTTSPlaying) ? '⏸' : '▶️';

  // ── Result screen (inline) ───────────────────────────────────────────────────
  if (phase === 'result' && result) {
    const passed     = result.passed;
    const scoreEmoji = passed ? '🏆' : '💪';
    const pct        = result.total > 0 ? Math.round((result.score / result.total) * 100) : 0;

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
          <View style={[styles.resultCircle, { borderColor: passed ? Colors.correct : Colors.wrong }]}>
            <Text style={styles.resultEmoji}>{scoreEmoji}</Text>
            <Text style={styles.resultScore}>{result.score}/{result.total}</Text>
            <Text style={[styles.resultPct, { color: passed ? Colors.correct : Colors.wrong }]}>{pct}%</Text>
          </View>

          {/* Progress bar */}
          <ProgressBar
            current={result.score}
            total={result.total}
            fillColor={passed ? Colors.correct : Colors.wrong}
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
                location="ቴል አቪቭ"
                phone="0501234567"
              />
            )}
          </View>

          {/* Buttons */}
          <View style={styles.resultButtons}>
            <TouchableOpacity style={styles.retryBtn} onPress={restart} activeOpacity={0.85}>
              <Text style={styles.retryIcon}>🔄</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.backBtn} onPress={handleBack} activeOpacity={0.85}>
              <Text style={styles.backBtnIcon}>🏠</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.examBtn}
              onPress={() => router.push('/(engineA)/exam' as any)}
              activeOpacity={0.85}
            >
              <Text style={styles.examBtnIcon}>📝</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ── Loading ───────────────────────────────────────────────────────────────────
  if (phase === 'loading' || !currentQuestion) return <LoadingScreen />;

  // ── Question screen ───────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.safeArea}>
      {/* Top bar */}
      <View style={styles.topBar}>
        <TouchableOpacity style={styles.backButton} onPress={handleBack}>
          <Text style={styles.backIcon}>✕</Text>
        </TouchableOpacity>
        <ProgressBar
          current={progress.current}
          total={progress.total}
          fillColor={Colors.secondary}
          trackColor='#e0e0e0'
          height={6}
        />
      </View>

      <ScrollView
        ref={scrollRef}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        scrollEnabled={!showFeedback}
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
              key={audioRestartKey}
              source={{ uri: currentSign.image_url }}
              style={styles.signImage}
              resizeMode="contain"
            />
          </View>
        ) : null}

        {/* Navigation + audio row: ‹ | ⏸/▶️ | 1/93 | › */}
        <View style={styles.navControlRow}>
          <TouchableOpacity
            style={[styles.navBtn, !canGoPrev && styles.navBtnDisabled]}
            onPress={handleNavPrev}
            disabled={!canGoPrev}
          >
            <Text style={styles.navBtnIcon}>‹</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.audioBtn} onPress={handleAudioButton}>
            <Text style={styles.audioBtnIcon}>{audioButtonIcon}</Text>
          </TouchableOpacity>

          <Text style={styles.counterText}>{progress.current}/{progress.total}</Text>

          <TouchableOpacity
            style={[styles.navBtn, !canGoNext && styles.navBtnDisabled]}
            onPress={handleNavNext}
            disabled={!canGoNext}
          >
            <Text style={styles.navBtnIcon}>›</Text>
          </TouchableOpacity>
        </View>

        {/* Answer cards — 2×2 grid (same layout for signs and behavioral) */}
        <View style={styles.answersRow}>
          {currentQuestion.answers.map((answer, index) => (
            <ImageAnswerCard
              key={answer.id}
              index={index}
              imageUri={answer.image_url}
              cardState={answerCardState(index)}
              onPress={() => handleAnswerSelect(index)}
              onAudioPress={isBehavioral
                ? () => handleBehavioralAnswerAudioPress(answer.text_amharic ?? '', index)
                : () => handleAnswerAudioPress(
                    answer.audio_url ?? `${_AUDIO_BASE}/answer_${currentQuestion.id}_${answer.id}.mp3`,
                    index
                  )}
              disabled={phase !== 'question'}
            />
          ))}
        </View>

        {/* Voice button */}
        {phase === 'question' && (
          <VoiceAnswerButton
            state={voiceState}
            onPress={handleVoicePress}
            size={88}
            showFailedText={false}
          />
        )}
      </ScrollView>

      {/* Feedback overlay */}
      {showFeedback && (
        <AudioFeedback
          isCorrect={!!lastAnswerCorrect}
          explanationAudioUri={feedbackAudioUri}
          ttsText={isBehavioral && feedbackTTSText ? feedbackTTSText : undefined}
          onNext={handleNext}
          autoAdvanceMs={!isBehavioral && !feedbackAudioUri ? 1500 : undefined}
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
    width:           40,
    height:          40,
    borderRadius:    20,
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
    fontSize: 18,
    color:    '#404943',
  },
  counterText: {
    fontSize:   15,
    fontWeight: '700',
    color:      '#404943',
    flexShrink: 0,
  },
  content: {
    paddingHorizontal: 16,
    paddingTop:        12,
    paddingBottom:     16,
    alignItems:        'center',
    gap:               16,
  },
  signImageContainer: {
    width:           160,
    height:          160,
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
  navControlRow: {
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'center',
    gap:            12,
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
  audioBtn: {
    width:           56,
    height:          56,
    borderRadius:    28,
    backgroundColor: '#FDD835',
    justifyContent:  'center',
    alignItems:      'center',
    shadowColor:     '#000',
    shadowOffset:    { width: 0, height: 2 },
    shadowOpacity:   0.15,
    shadowRadius:    4,
    elevation:       4,
  },
  audioBtnIcon: {
    fontSize: 26,
  },
  answersRow: {
    flexDirection:     'row',
    flexWrap:          'wrap',
    gap:               14,
    justifyContent:    'center',
    paddingHorizontal: 8,
  },

  // ── Result screen ──────────────────────────────────────────────────────────
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
  resultBar: {
    width: '100%',
  },
  adWrapper: {
    width: '100%',
  },
  resultButtons: {
    flexDirection:  'row',
    gap:            16,
    justifyContent: 'center',
    marginTop:      8,
  },
  retryBtn: {
    width:           72,
    height:          72,
    borderRadius:    36,
    backgroundColor: Colors.secondary,
    justifyContent:  'center',
    alignItems:      'center',
    elevation:       4,
    shadowColor:     '#000',
    shadowOffset:    { width: 0, height: 3 },
    shadowOpacity:   0.15,
    shadowRadius:    6,
  },
  retryIcon: {
    fontSize: 32,
  },
  backBtn: {
    width:           72,
    height:          72,
    borderRadius:    36,
    backgroundColor: '#ffffff',
    justifyContent:  'center',
    alignItems:      'center',
    borderWidth:     1.5,
    borderColor:     '#dde3ea',
    elevation:       3,
    shadowColor:     '#000',
    shadowOffset:    { width: 0, height: 2 },
    shadowOpacity:   0.10,
    shadowRadius:    4,
  },
  backBtnIcon: {
    fontSize: 30,
  },
  examBtn: {
    width:           72,
    height:          72,
    borderRadius:    36,
    backgroundColor: Colors.accent,
    justifyContent:  'center',
    alignItems:      'center',
    elevation:       4,
    shadowColor:     '#000',
    shadowOffset:    { width: 0, height: 3 },
    shadowOpacity:   0.15,
    shadowRadius:    6,
  },
  examBtnIcon: {
    fontSize: 30,
  },
});
