/**
 * app/(engineA)/(tabs)/exam.tsx
 * Engine A Exam Screen — Voice answers, 30 questions, balanced across topics.
 *
 * Same UX as question/[id].tsx but uses the exam hook for 30 random questions.
 * Tracks time, records results, shows summary at end.
 *
 * FIX: replaced setTimeout placeholder with real useVoiceRecognition hook.
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
import { useRouter, useFocusEffect } from 'expo-router';
import { storeExamResult } from '../../../utils/examResult';
import { Colors } from '../../../constants/colors';
import { LoadingScreen } from '../../../components/shared/LoadingScreen';
import { ImageAnswerCard } from '../../../components/engineA/ImageAnswerCard';
import { VoiceAnswerButton } from '../../../components/engineA/VoiceAnswerButton';
import { AudioFeedback } from '../../../components/engineA/AudioFeedback';
import { ProgressBar } from '../../../components/shared/ProgressBar';
import { useExam } from '../../../hooks/useExam';
import { useAudio, playAndAwaitAudio } from '../../../hooks/useAudio';
import { useVoiceRecognition } from '../../../hooks/useVoiceRecognition';
import * as api from '../../../backend/api';
import { DBSign } from '../../../backend/supabaseClient';

// ─── Number announcement URLs (same as question/[id].tsx) ────────────────────
const _AUDIO_BASE = (process.env.EXPO_PUBLIC_SUPABASE_URL ?? '') + '/storage/v1/object/public/audio';
const NUMBER_URLS = [
  `${_AUDIO_BASE}/number_1.mp3`,
  `${_AUDIO_BASE}/number_2.mp3`,
  `${_AUDIO_BASE}/number_3.mp3`,
  `${_AUDIO_BASE}/number_4.mp3`,
];

// ─── Component ────────────────────────────────────────────────────────────────

export default function EngineAExamScreen() {
  const router = useRouter();
  const {
    phase,
    currentQuestion,
    questions,
    currentIndex,
    progress,
    submitAnswer,
    nextQuestion,
    result,
    lastAnswerCorrect,
    selectedAnswerId,
    answers,
    goToQuestion,
  } = useExam();

  const { playAudio, stopAudio, pauseAudio, resumeAudio, audioState } = useAudio();
  const [showFeedback,       setShowFeedback]       = useState(false);
  const [playingAnswerIndex, setPlayingAnswerIndex] = useState<number | null>(null);
  const [signs,              setSigns]              = useState<DBSign[]>([]);
  const [isTabFocused,       setIsTabFocused]       = useState(false);

  // Load all signs once on mount (for displaying the sign image per question)
  useEffect(() => {
    api.getAllSigns().then(setSigns).catch(() => {});
  }, []);

  const currentSign = signs.find(s => s.id === currentQuestion?.sign_id) ?? null;

  // Ref so async runSequence can check phase without stale closure
  const phaseRef = useRef(phase);
  phaseRef.current = phase;

  // When voice recognition fails, this ref signals the audio sequence to stop
  // so the failure audio can play cleanly without being interrupted.
  const voiceFailedRef = useRef(false);

  // Stable callback ref so useVoiceRecognition doesn't re-init on re-renders
  const answerCallbackRef = useRef<(idx: number) => void>(() => {});

  const {
    voiceState,
    startListening,
    stopListening,
    cancelListening,
  } = useVoiceRecognition(
    useCallback((answerIndex: number | null) => {
      // null = STT failed → voiceState becomes 'failed', tap targets highlight
      if (answerIndex !== null) {
        answerCallbackRef.current(answerIndex);
      }
    }, [])
  );

  // ── Track tab focus — audio sequence must NOT run in the background ─────────
  useFocusEffect(
    useCallback(() => {
      setIsTabFocused(true);
      return () => {
        setIsTabFocused(false);
        cancelListening();
      };
    }, [cancelListening])
  );

  // ── Answer select (tap OR voice) ───────────────────────────────────────────
  const handleAnswerSelect = useCallback((index: number) => {
    if (!currentQuestion) return;
    if (phase !== 'question') return;
    const answer = currentQuestion.answers[index];
    if (!answer) return;

    cancelListening(); // Stop any ongoing recording
    stopAudio();
    setPlayingAnswerIndex(null);
    submitAnswer(answer.id);
  }, [currentQuestion, phase, submitAnswer, stopAudio, cancelListening]);

  // Keep ref in sync so voice callback always calls latest version
  answerCallbackRef.current = handleAnswerSelect;

  // ── Voice button press ─────────────────────────────────────────────────────
  const handleVoicePress = useCallback(async () => {
    if (voiceState === 'listening') {
      await stopListening();
    } else if (voiceState === 'idle' || voiceState === 'failed') {
      await startListening();
    }
  }, [voiceState, startListening, stopListening]);

  // ── Audio sequence: question → 1s pause → number+answer for each card ───────
  // voiceFailedRef stops the sequence so voice-failure audio can play cleanly.
  useEffect(() => {
    if (phase !== 'question' || !currentQuestion || !isTabFocused) return;
    voiceFailedRef.current = false; // Reset for new question
    cancelListening();
    setShowFeedback(false);
    let cancelled = false;
    const isCancelled = () => cancelled || voiceFailedRef.current;

    async function runSequence() {
      await stopAudio();
      if (isCancelled()) return;

      const qId = currentQuestion!.id;
      const qAudioUrl = currentQuestion!.question_audio_url
        || `${_AUDIO_BASE}/${qId.toLowerCase()}.mp3`;
      await playAndAwaitAudio(qAudioUrl, isCancelled);
      if (isCancelled()) return;

      await new Promise(res => setTimeout(res, 1000));
      if (isCancelled() || phaseRef.current !== 'question') return;

      for (let i = 0; i < currentQuestion!.answers.length && i < 4; i++) {
        if (isCancelled() || phaseRef.current !== 'question') return;

        setPlayingAnswerIndex(i);

        await playAndAwaitAudio(NUMBER_URLS[i], isCancelled);
        if (isCancelled() || phaseRef.current !== 'question') return;

        const answer = currentQuestion!.answers[i];
        const answerUrl = answer?.audio_url
          || `${_AUDIO_BASE}/answer_${qId}_${answer?.id}.mp3`;
        await playAndAwaitAudio(answerUrl, isCancelled);
      }
      setPlayingAnswerIndex(null);
    }

    runSequence().catch(() => {});
    return () => {
      cancelled = true;
      setPlayingAnswerIndex(null);
    };
  }, [currentQuestion?.id, isTabFocused]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Voice failure → stop sequence, play audio instead of showing text ────────
  useEffect(() => {
    if (voiceState === 'failed') {
      voiceFailedRef.current = true;
      stopAudio();
      // Play Amharic "try again, say the number" message
      // File: try_again.mp3 = "ዳግም ሞክር། ቁጥሩን ይናገሩ። አንድ፣ ሁለት፣ ወይም ሶስት།"
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

  // Navigate to results when done
  // Score/total/passed/duration are passed as URL params (reliable across navigation)
  // The Map store is kept as a backup for topicBreakdown
  useEffect(() => {
    if (phase === 'result' && result) {
      storeExamResult(result.sessionId, {
        score:           result.score,
        total:           result.total,
        passed:          result.passed,
        durationSeconds: result.durationSeconds,
        topicBreakdown:  result.topicBreakdown,
      });
      const params = `score=${result.score}&total=${result.total}&passed=${result.passed ? '1' : '0'}&duration=${result.durationSeconds}`;
      router.replace(`/result/${result.sessionId}?${params}` as any);
    }
  }, [phase, result]);

  const handleNext = () => {
    setShowFeedback(false);
    cancelListening(); // Ensure clean state before next question
    nextQuestion();
  };

  const handleBack = () => {
    cancelListening();
    router.navigate('/(engineA)/home');
  };

  // ── Question navigation (prev / next) ───────────────────────────────────────
  const canGoPrev = currentIndex > 0;
  const canGoNext = currentIndex < (questions.length || 30) - 1;

  const handleNavPrev = () => {
    if (!canGoPrev) return;
    stopAudio();
    cancelListening();
    setShowFeedback(false);
    goToQuestion(currentIndex - 1);
  };

  const handleNavNext = () => {
    if (!canGoNext) return;
    stopAudio();
    cancelListening();
    setShowFeedback(false);
    goToQuestion(currentIndex + 1);
  };

  // ── Pause / Resume audio ────────────────────────────────────────────────────
  const handleAudioButton = async () => {
    if (audioState === 'playing') {
      await pauseAudio();
    } else if (audioState === 'paused') {
      await resumeAudio();
    }
  };

  const audioButtonIcon = audioState === 'playing' ? '⏸' : '▶️';

  // ── States ─────────────────────────────────────────────────────────────────
  if (phase === 'loading') return <LoadingScreen />;
  if (!currentQuestion)    return <LoadingScreen />;

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

      {/* ── Fixed top bar: [✕ exit] [progress bar] [⏱ timer] ── */}
      {/* Fixed outside ScrollView so it never disappears on scroll  */}
      <View style={styles.topBar}>
        <TouchableOpacity style={styles.backButton} onPress={handleBack}>
          <Text style={styles.backIcon}>✕</Text>
        </TouchableOpacity>
        <ProgressBar
          current={progress.current}
          total={progress.total}
          fillColor={Colors.secondary}
          height={6}
        />
        <Text style={styles.timerIcon}>⏱</Text>
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

        {/* Combined row: ⬅️ | ⏸/▶️ | 1/21 | ➡️
            All in one row — saves vertical space + matches learning screen layout */}
        <View style={styles.navControlRow}>
          <TouchableOpacity
            style={[styles.qNavBtn, !canGoPrev && styles.qNavBtnDisabled]}
            onPress={handleNavPrev}
            disabled={!canGoPrev}
            accessibilityLabel="ወደ ቀዳሚ ጥያቄ"
          >
            <Text style={styles.navBtnIcon}>⬅️</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.audioBtn}
            onPress={handleAudioButton}
            accessibilityLabel="ድምጽ አቁም / ቀጥል"
          >
            <Text style={styles.audioBtnIcon}>{audioButtonIcon}</Text>
          </TouchableOpacity>

          <Text style={styles.questionCounter}>
            {currentIndex + 1} / {questions.length || 30}
          </Text>

          <TouchableOpacity
            style={[styles.qNavBtn, !canGoNext && styles.qNavBtnDisabled]}
            onPress={handleNavNext}
            disabled={!canGoNext}
            accessibilityLabel="ወደ ቀጣይ ጥያቄ"
          >
            <Text style={styles.navBtnIcon}>➡️</Text>
          </TouchableOpacity>
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

        {/* Voice button — shown only during active question */}
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

  // Fixed top bar — always visible, never scrolls away
  topBar: {
    flexDirection:     'row',
    alignItems:        'center',
    paddingHorizontal: 12,
    paddingTop:        16,   // extra space so ✕ isn't at the very edge
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
  timerIcon: {
    fontSize:   20,
    flexShrink: 0,
  },

  // Scrollable content — compact gaps so everything fits without scrolling
  content: {
    paddingHorizontal: 16,
    paddingTop:        12,
    paddingBottom:     16,
    alignItems:        'center',
    gap:               14,
  },

  // Sign image — slightly smaller than learning screen to save space
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

  // Combined navigation + audio control row: ⬅️ | ⏸/▶️ | 1/21 | ➡️
  navControlRow: {
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'center',
    gap:            12,
  },
  qNavBtn: {
    width:           48,
    height:          48,
    borderRadius:    24,
    backgroundColor: Colors.card,
    justifyContent:  'center',
    alignItems:      'center',
  },
  qNavBtnDisabled: {
    opacity: 0.35,
  },
  navBtnIcon: {
    fontSize: 22,
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

  // Answer cards — 2×2 grid
  answersRow: {
    flexDirection:     'row',
    flexWrap:          'wrap',
    gap:               14,
    justifyContent:    'center',
    paddingHorizontal: 8,
  },
});
