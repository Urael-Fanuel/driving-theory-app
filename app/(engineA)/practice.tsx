/**
 * app/(engineA)/practice.tsx
 * Engine A — Weak-Area Practice Screen.
 *
 * Shows only the questions the user got wrong in the last exam.
 * Uses the same UX as exam.tsx (voice, images, audio sequence).
 * Answered correctly → removed from pool.
 * Answered wrong     → pushed to end of queue.
 * Session ends when all questions answered correctly at least once.
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
} from 'react-native';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { Colors } from '../../constants/colors';
import { LoadingScreen } from '../../components/shared/LoadingScreen';
import { ImageAnswerCard } from '../../components/engineA/ImageAnswerCard';
import { VoiceAnswerButton } from '../../components/engineA/VoiceAnswerButton';
import { AudioFeedback } from '../../components/engineA/AudioFeedback';
import { ProgressBar } from '../../components/shared/ProgressBar';
import { usePracticeWeak } from '../../hooks/usePracticeWeak';
import { useAudio, playAndAwaitAudio } from '../../hooks/useAudio';
import { useVoiceRecognition } from '../../hooks/useVoiceRecognition';
import * as api from '../../backend/api';
import { DBSign } from '../../backend/supabaseClient';
import { OfflineBanner } from '../../components/shared/OfflineBanner';

// ─── Audio URLs ───────────────────────────────────────────────────────────────
const _AUDIO_BASE = (process.env.EXPO_PUBLIC_SUPABASE_URL ?? '') + '/storage/v1/object/public/audio';
const NUMBER_URLS = [
  `${_AUDIO_BASE}/number_1.mp3`,
  `${_AUDIO_BASE}/number_2.mp3`,
  `${_AUDIO_BASE}/number_3.mp3`,
  `${_AUDIO_BASE}/number_4.mp3`,
];

// ─── Component ────────────────────────────────────────────────────────────────

export default function EngineAPracticeScreen() {
  const router = useRouter();
  const { ids: idsParam } = useLocalSearchParams<{ ids: string }>();

  // Parse comma-separated question IDs from URL
  const questionIds = idsParam ? idsParam.split(',').filter(Boolean) : [];

  const {
    phase,
    currentQuestion,
    remaining,
    total,
    submitAnswer,
    nextQuestion,
    lastAnswerCorrect,
    selectedAnswerId,
  } = usePracticeWeak(questionIds);

  const { playAudio, stopAudio, pauseAudio, resumeAudio, audioState } = useAudio();
  const [showFeedback,       setShowFeedback]       = useState(false);
  const [playingAnswerIndex, setPlayingAnswerIndex] = useState<number | null>(null);
  const [signs,              setSigns]              = useState<DBSign[]>([]);
  const [isTabFocused,       setIsTabFocused]       = useState(false);

  // Load all signs for sign images
  useEffect(() => {
    api.getAllSigns().then(setSigns).catch(() => {});
  }, []);

  const currentSign = signs.find(s => s.id === currentQuestion?.sign_id) ?? null;

  const phaseRef       = useRef(phase);
  phaseRef.current     = phase;
  const voiceFailedRef = useRef(false);
  const answerCallbackRef = useRef<(idx: number) => void>(() => {});

  const { voiceState, startListening, stopListening, cancelListening } =
    useVoiceRecognition(
      useCallback((answerIndex: number | null) => {
        if (answerIndex !== null) {
          answerCallbackRef.current(answerIndex);
        }
      }, [])
    );

  // Track tab focus
  useFocusEffect(
    useCallback(() => {
      setIsTabFocused(true);
      return () => {
        setIsTabFocused(false);
        cancelListening();
      };
    }, [cancelListening])
  );

  // Answer select (tap OR voice)
  const handleAnswerSelect = useCallback((index: number) => {
    if (!currentQuestion) return;
    if (phase !== 'question') return;
    const answer = currentQuestion.answers[index];
    if (!answer) return;
    cancelListening();
    stopAudio();
    setPlayingAnswerIndex(null);
    submitAnswer(answer.id);
  }, [currentQuestion, phase, submitAnswer, stopAudio, cancelListening]);

  answerCallbackRef.current = handleAnswerSelect;

  // Voice button press
  const handleVoicePress = useCallback(async () => {
    if (voiceState === 'listening') {
      await stopListening();
    } else if (voiceState === 'idle' || voiceState === 'failed') {
      await startListening();
    }
  }, [voiceState, startListening, stopListening]);

  // Audio sequence: question → 1s pause → number+answer for each card
  useEffect(() => {
    if (phase !== 'question' || !currentQuestion || !isTabFocused) return;
    voiceFailedRef.current = false;
    cancelListening();
    setShowFeedback(false);
    let cancelled = false;
    const isCancelled = () => cancelled || voiceFailedRef.current;

    async function runSequence() {
      await stopAudio();
      if (isCancelled()) return;

      const qId      = currentQuestion!.id;
      const qAudioUrl = currentQuestion!.question_audio_url
        || `${_AUDIO_BASE}/${qId.toLowerCase()}.mp3`;
      if (!await playAndAwaitAudio(qAudioUrl, isCancelled)) { setPlayingAnswerIndex(null); return; }
      if (isCancelled()) return;

      await new Promise(res => setTimeout(res, 1000));
      if (isCancelled() || phaseRef.current !== 'question') return;

      for (let i = 0; i < currentQuestion!.answers.length && i < 4; i++) {
        if (isCancelled() || phaseRef.current !== 'question') return;
        setPlayingAnswerIndex(i);

        // Stop the moment a clip cannot be heard (offline + not cached) —
        // otherwise the highlight walks all four answers in silence.
        if (!await playAndAwaitAudio(NUMBER_URLS[i], isCancelled)) { setPlayingAnswerIndex(null); return; }
        if (isCancelled() || phaseRef.current !== 'question') return;

        const answer    = currentQuestion!.answers[i];
        const answerUrl = answer?.audio_url
          || `${_AUDIO_BASE}/answer_${qId}_${answer?.id}.mp3`;
        if (!await playAndAwaitAudio(answerUrl, isCancelled)) { setPlayingAnswerIndex(null); return; }
      }
      setPlayingAnswerIndex(null);
    }

    runSequence().catch(() => {});
    return () => {
      cancelled = true;
      setPlayingAnswerIndex(null);
    };
  }, [currentQuestion?.id, isTabFocused]); // eslint-disable-line react-hooks/exhaustive-deps

  // Voice failure → play try-again audio
  useEffect(() => {
    if (voiceState === 'failed') {
      voiceFailedRef.current = true;
      stopAudio();
      playAudio(`${_AUDIO_BASE}/try_again.mp3`).catch(() => {});
    } else {
      voiceFailedRef.current = false;
    }
  }, [voiceState]); // eslint-disable-line react-hooks/exhaustive-deps

  // Show feedback overlay when answer submitted
  useEffect(() => {
    if (phase === 'feedback_correct' || phase === 'feedback_wrong') {
      setTimeout(() => setShowFeedback(true), 300);
    }
  }, [phase]);

  const handleNext = () => {
    setShowFeedback(false);
    cancelListening();
    nextQuestion();
  };

  const handleBack = async () => {
    cancelListening();
    await stopAudio();
    router.back();
  };

  // Audio control
  const handleAudioButton = async () => {
    if (audioState === 'playing') {
      await pauseAudio();
    } else if (audioState === 'paused') {
      await resumeAudio();
    }
  };
  const audioButtonIcon = audioState === 'playing' ? '⏸' : '▶️';

  // ── Done screen ─────────────────────────────────────────────────────────────
  if (phase === 'done') {
    return (
      <SafeAreaView style={[styles.safeArea, styles.doneScreen]}>
        <Text style={styles.doneEmoji}>🎉</Text>
        <Text style={styles.doneScore}>{total}/{total}</Text>
        <TouchableOpacity style={styles.doneBtn} onPress={handleBack}>
          <Text style={styles.doneBtnIcon}>🏠</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  // ── Loading ─────────────────────────────────────────────────────────────────
  if (phase === 'loading') return <LoadingScreen />;
  if (!currentQuestion)   return <LoadingScreen />;

  const answered = total - remaining;

  const answerCardState = (index: number) => {
    if (phase !== 'feedback_correct' && phase !== 'feedback_wrong') {
      if (playingAnswerIndex === index) return 'reading' as const;
      return voiceState === 'failed' ? 'highlight' as const : 'default' as const;
    }
    const answer = currentQuestion.answers[index];
    if (answer.id === selectedAnswerId) {
      return answer.is_correct ? 'correct' as const : 'wrong' as const;
    }
    if (answer.is_correct) return 'correct' as const;
    return 'default' as const;
  };

  const feedbackAudioUri = lastAnswerCorrect
    ? (currentQuestion.explanation_correct_audio_url ?? '')
    : (currentQuestion.explanation_wrong_audio_url ?? '');

  return (
    <SafeAreaView style={styles.safeArea}>
      <OfflineBanner />

      {/* Fixed top bar */}
      <View style={styles.topBar}>
        <TouchableOpacity style={styles.backButton} onPress={handleBack}>
          <Text style={styles.backIcon}>✕</Text>
        </TouchableOpacity>
        <ProgressBar
          current={answered}
          total={total}
          fillColor={Colors.secondary}
          height={6}
        />
        {/* Remaining count instead of timer */}
        <Text style={styles.remainingText}>{remaining}</Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        scrollEnabled={!showFeedback}
      >
        {/* Traffic sign image */}
        {currentSign?.image_url && (
          <View style={styles.signImageContainer}>
            <Image
              source={{ uri: currentSign.image_url }}
              style={styles.signImage}
              resizeMode="contain"
            />
          </View>
        )}

        {/* Audio control row */}
        <View style={styles.navControlRow}>
          <TouchableOpacity
            style={styles.audioBtn}
            onPress={handleAudioButton}
            accessibilityLabel="ድምጽ አቁም / ቀጥል"
          >
            <Text style={styles.audioBtnIcon}>{audioButtonIcon}</Text>
          </TouchableOpacity>

          <Text style={styles.questionCounter}>
            {answered + 1} / {total}
          </Text>
        </View>

        {/* Answer images — 2×2 grid */}
        <View style={styles.answersRow}>
          {currentQuestion.answers.map((answer, index) => (
            <ImageAnswerCard
              key={answer.id}
              index={index}
              imageUri={answer.image_url}
              cardState={answerCardState(index)}
              onPress={() => handleAnswerSelect(index)}
              onAudioPress={answer.audio_url
                ? () => playAudio(answer.audio_url!).catch(() => {})
                : undefined}
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
          ragQuery={!lastAnswerCorrect && currentQuestion && selectedAnswerId ? {
            question:      currentQuestion.question_amharic,
            wrongAnswer:   currentQuestion.answers.find(a => a.id === selectedAnswerId)?.text_amharic ?? '',
            correctAnswer: currentQuestion.answers.find(a => a.is_correct)?.text_amharic ?? '',
          } : undefined}
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
    backgroundColor: Colors.background,
  },

  // Done screen
  doneScreen: {
    justifyContent: 'center',
    alignItems:     'center',
    gap:            24,
  },
  doneEmoji: {
    fontSize: 80,
  },
  doneScore: {
    fontSize:   40,
    fontWeight: '900',
    color:      Colors.correct,
  },
  doneBtn: {
    width:           80,
    height:          80,
    borderRadius:    40,
    backgroundColor: Colors.primary,
    justifyContent:  'center',
    alignItems:      'center',
  },
  doneBtnIcon: {
    fontSize: 36,
  },

  // Top bar
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
    backgroundColor: Colors.card,
    justifyContent:  'center',
    alignItems:      'center',
    flexShrink:      0,
  },
  backIcon: {
    fontSize: 18,
    color:    Colors.textSecondary,
  },
  remainingText: {
    fontSize:         18,
    fontWeight:       '800',
    color:            Colors.wrong,
    flexShrink:       0,
    minWidth:         28,
    textAlign:        'center',
  },

  // Content
  content: {
    paddingHorizontal: 16,
    paddingTop:        12,
    paddingBottom:     16,
    alignItems:        'center',
    gap:               14,
  },

  // Sign image
  signImageContainer: {
    width:           160,
    height:          160,
    borderRadius:    20,
    overflow:        'hidden',
    backgroundColor: '#FFFFFF',
  },
  signImage: {
    width:  '100%',
    height: '100%',
  },

  // Nav/audio row
  navControlRow: {
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'center',
    gap:            12,
  },
  audioBtn: {
    width:           56,
    height:          56,
    borderRadius:    28,
    backgroundColor: Colors.secondary,
    justifyContent:  'center',
    alignItems:      'center',
  },
  audioBtnIcon: {
    fontSize: 26,
  },
  questionCounter: {
    fontSize:   17,
    fontWeight: '700',
    color:      Colors.textPrimary,
    minWidth:   52,
    textAlign:  'center',
  },

  // Answer cards
  answersRow: {
    flexDirection:     'row',
    flexWrap:          'wrap',
    gap:               14,
    justifyContent:    'center',
    paddingHorizontal: 8,
    // Force exactly 2 cards per row (2×2) on every device size. Cards are a
    // fixed 100px wide, so capping the row width keeps the layout static
    // instead of reflowing to 3+1 on wide screens or 1-per-row on narrow ones.
    maxWidth:          240,
    alignSelf:         'center',
  },
});
