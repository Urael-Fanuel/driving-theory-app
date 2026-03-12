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
];

// ─── Component ────────────────────────────────────────────────────────────────

export default function EngineAExamScreen() {
  const router = useRouter();
  const {
    phase,
    currentQuestion,
    progress,
    submitAnswer,
    nextQuestion,
    result,
    lastAnswerCorrect,
    selectedAnswerId,
  } = useExam();

  const { playAudio, stopAudio } = useAudio();
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

      for (let i = 0; i < currentQuestion!.answers.length && i < 3; i++) {
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
  useEffect(() => {
    if (phase === 'result' && result) {
      router.replace(`/result/${result.sessionId}`);
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
      {/* Exam progress bar */}
      <View style={styles.progressContainer}>
        <ProgressBar
          current={progress.current}
          total={progress.total}
          fillColor={Colors.secondary}
          height={6}
        />
        {/* Timer — icon only for Engine A */}
        <Text style={styles.timerIcon}>⏱</Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        scrollEnabled={!showFeedback}
      >
        {/* Back/exit button */}
        <TouchableOpacity style={styles.backButton} onPress={handleBack}>
          <Text style={styles.backIcon}>✕</Text>
        </TouchableOpacity>

        {/* Traffic sign image — identifies which sign is being tested */}
        {currentSign?.image_url && (
          <View style={styles.signImageContainer}>
            <Image
              source={{ uri: currentSign.image_url }}
              style={styles.signImage}
              resizeMode="contain"
            />
          </View>
        )}

        {/* Question audio button */}
        <TouchableOpacity
          style={styles.questionAudioBtn}
          onPress={() => currentQuestion.question_audio_url && playAudio(currentQuestion.question_audio_url).catch(() => {})}
        >
          <Text style={styles.questionAudioIcon}>🔊</Text>
        </TouchableOpacity>

        {/* Answer images */}
        <View style={styles.answersRow}>
          {currentQuestion.answers.map((answer, index) => (
            <ImageAnswerCard
              key={answer.id}
              index={index}
              imageUri={answer.image_url}
              cardState={answerCardState(index)}
              onPress={() => handleAnswerSelect(index)}
              disabled={phase !== 'question'}
            />
          ))}
        </View>

        {/* Voice button — shown only during active question.
            showFailedText={false}: Engine A users cannot read — audio plays instead. */}
        {phase === 'question' && (
          <VoiceAnswerButton
            state={voiceState}
            onPress={handleVoicePress}
            size={100}
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
  progressContainer: {
    flexDirection:     'row',
    alignItems:        'center',
    paddingHorizontal: 16,
    paddingTop:        12,
    gap:               12,
  },
  timerIcon: {
    fontSize:   20,
    flexShrink: 0,
  },
  content: {
    padding:    16,
    alignItems: 'center',
    gap:        28,
  },
  backButton: {
    width:           44,
    height:          44,
    borderRadius:    22,
    backgroundColor: Colors.card,
    justifyContent:  'center',
    alignItems:      'center',
    alignSelf:       'flex-start',
  },
  backIcon: {
    fontSize: 20,
    color:    Colors.textSecondary,
  },
  questionAudioBtn: {
    width:           80,
    height:          80,
    borderRadius:    40,
    backgroundColor: Colors.secondary,
    justifyContent:  'center',
    alignItems:      'center',
  },
  questionAudioIcon: {
    fontSize: 36,
  },
  answersRow: {
    flexDirection:  'row',
    gap:            20,
    justifyContent: 'center',
  },
  signImageContainer: {
    width:           180,
    height:          180,
    borderRadius:    20,
    overflow:        'hidden',
    backgroundColor: '#FFFFFF',
  },
  signImage: {
    width:  '100%',
    height: '100%',
  },
});
