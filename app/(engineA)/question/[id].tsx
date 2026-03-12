/**
 * app/(engineA)/question/[id].tsx
 * Engine A Question Screen — Voice answer + image choices.
 *
 * Layout:
 * ┌─────────────────────┐
 * │ [Sign Image 200px]  │
 * │                     │
 * │ [🔊 Question Audio] │  ← Auto-plays on load
 * ├─────────────────────┤
 * │  [IMG] [IMG] [IMG]  │  ← 3 answer images
 * │   1     2     3     │  ← Number below each
 * ├─────────────────────┤
 * │   🎤 SPEAK          │  ← Large mic button
 * └─────────────────────┘
 *
 * Voice flow: IDLE → LISTENING → PROCESSING → answer selected
 * Fallback: if STT fails, user taps image
 *
 * FIX: replaced setTimeout placeholder with real useVoiceRecognition hook.
 *      Hook uses Google Cloud STT (or mockRecognizeAmharicAnswer in dev).
 *
 * The [id] param is: signId OR signId_q{n} (question index)
 */

import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View,
  Image,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  Text,
  ScrollView,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Colors } from '../../../constants/colors';
import { LoadingScreen } from '../../../components/shared/LoadingScreen';
import { ImageAnswerCard } from '../../../components/engineA/ImageAnswerCard';
import { VoiceAnswerButton } from '../../../components/engineA/VoiceAnswerButton';
import { AudioFeedback } from '../../../components/engineA/AudioFeedback';
import { DBSign, DBQuestion } from '../../../backend/supabaseClient';
import * as api from '../../../backend/api';
import { useAudio, waitForAudioEnd, playAndAwaitAudio } from '../../../hooks/useAudio';
import { useProgress } from '../../../hooks/useProgress';
import { useVoiceRecognition } from '../../../hooks/useVoiceRecognition';

// ─── Number announcement URLs (played before each answer) ─────────────────────
const _AUDIO_BASE = (process.env.EXPO_PUBLIC_SUPABASE_URL ?? '') + '/storage/v1/object/public/audio';
const NUMBER_URLS = [
  `${_AUDIO_BASE}/number_1.mp3`,  // "አንድ" — said before answer 1
  `${_AUDIO_BASE}/number_2.mp3`,  // "ሁለት" — said before answer 2
  `${_AUDIO_BASE}/number_3.mp3`,  // "ሦስት" — said before answer 3
  `${_AUDIO_BASE}/number_4.mp3`,  // "አራት" — said before answer 4
];

// ─── Component ────────────────────────────────────────────────────────────────

export default function EngineAQuestionScreen() {
  const { id }     = useLocalSearchParams<{ id: string }>();
  const router     = useRouter();
  const { playAudio, stopAudio } = useAudio();
  const { recordAnswer } = useProgress();

  const [signId, questionIndex] = parseQuestionId(id);

  const [sign,          setSign]          = useState<DBSign | null>(null);
  const [questions,     setQuestions]     = useState<DBQuestion[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [answeredIndex,     setAnsweredIndex]     = useState<number | null>(null);
  const [showFeedback,      setShowFeedback]      = useState(false);
  const [playingAnswerIndex, setPlayingAnswerIndex] = useState<number | null>(null);

  const currentQuestion = questions[questionIndex] ?? null;

  // Ref so the async audio chain can check — without needing it in dep arrays.
  const answeredIndexRef  = useRef<number | null>(null);
  answeredIndexRef.current = answeredIndex;

  // When voice recognition fails, this ref signals the audio sequence to stop
  // so the failure audio can play cleanly without being interrupted.
  const voiceFailedRef = useRef(false);

  // ── Stable callback ref so useVoiceRecognition doesn't re-init on every render
  // handleAnswerSelect is defined below; we wire it up after definition.
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

  // Load sign + questions
  useEffect(() => {
    async function load() {
      try {
        const [allSigns, qs] = await Promise.all([
          api.getAllSigns(),
          api.getQuestionsBySign(signId),
        ]);
        const found = allSigns.find(s => s.id === signId) ?? null;
        setSign(found);
        setQuestions(qs);
      } catch (err) {
        console.error('[EngineA/question] Failed to load:', err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [signId]);

  // ── Audio sequence: question → "አንድ" answer1 → "ሁለት" answer2 → "ሦስት" answer3
  // Each audio explicitly awaits the previous one finishing via playAndAwaitAudio().
  // voiceFailedRef stops the sequence so voice-failure audio can play cleanly.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!currentQuestion) return;
    voiceFailedRef.current = false; // Reset for new question
    cancelListening(); // Reset audio mode to playback before starting sequence
    let cancelled = false;
    const isCancelled = () => cancelled || voiceFailedRef.current;

    async function runSequence() {
      // Wait for any transitional audio already playing (e.g. starting_quiz.mp3).
      await waitForAudioEnd();
      if (isCancelled()) return;

      const qId = currentQuestion!.id;
      const qAudioUrl = currentQuestion!.question_audio_url
        || `${_AUDIO_BASE}/${qId.toLowerCase()}.mp3`;
      await playAndAwaitAudio(qAudioUrl, isCancelled);
      if (isCancelled()) return;

      await new Promise(res => setTimeout(res, 1000));
      if (isCancelled() || answeredIndexRef.current !== null) return;

      for (let i = 0; i < currentQuestion!.answers.length && i < 4; i++) {
        if (isCancelled() || answeredIndexRef.current !== null) return;

        setPlayingAnswerIndex(i);

        await playAndAwaitAudio(NUMBER_URLS[i], isCancelled);
        if (isCancelled() || answeredIndexRef.current !== null) return;

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
  }, [currentQuestion?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Voice failure → stop sequence, play audio instead of showing text ────────
  useEffect(() => {
    if (voiceState === 'failed') {
      voiceFailedRef.current = true;         // Signal sequence to stop
      stopAudio();                            // Stop current audio immediately
      // Play Amharic "try again, say the number" message
      // File: try_again.mp3 = "ዳግም ሞክር። ቁጥሩን ይናገሩ። አንድ፣ ሁለት፣ ወይም ሶስት።"
      playAudio(`${_AUDIO_BASE}/try_again.mp3`).catch(() => {});
    } else {
      voiceFailedRef.current = false;        // Reset when leaving failed state
    }
  }, [voiceState]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Answer selection (via tap OR voice) ────────────────────────────────────
  const handleAnswerSelect = useCallback((answerIndex: number) => {
    if (answeredIndex !== null) return; // Already answered
    if (!currentQuestion) return;

    const selectedAnswer = currentQuestion.answers[answerIndex];
    if (!selectedAnswer) return;

    // Stop any ongoing recording when answer is selected
    cancelListening();
    stopAudio();
    setPlayingAnswerIndex(null);

    setAnsweredIndex(answerIndex);

    const isCorrect = selectedAnswer.is_correct;
    recordAnswer(
      currentQuestion.id,
      signId,
      sign?.topic_id ?? '',
      isCorrect
    );

    Haptics.notificationAsync(
      isCorrect
        ? Haptics.NotificationFeedbackType.Success
        : Haptics.NotificationFeedbackType.Error
    ).catch(() => {});

    // Show feedback overlay after short delay
    setTimeout(() => setShowFeedback(true), 300);
  }, [answeredIndex, currentQuestion, signId, sign?.topic_id, recordAnswer, stopAudio, cancelListening]);

  // Keep the ref in sync so the voice callback always calls the latest version
  answerCallbackRef.current = handleAnswerSelect;

  // ── Voice button press handler ─────────────────────────────────────────────
  const handleVoicePress = useCallback(async () => {
    if (voiceState === 'listening') {
      // User tapped mic again while listening → stop early and process
      await stopListening();
    } else if (voiceState === 'idle' || voiceState === 'failed') {
      // Start a new recording session
      await startListening();
    }
    // 'processing' and 'done' states: button is disabled, no-op
  }, [voiceState, startListening, stopListening]);

  // ── Navigate to next question ───────────────────────────────────────────────
  const handleNext = useCallback(() => {
    setShowFeedback(false);
    setAnsweredIndex(null);
    stopAudio();       // Stop any playing audio before loading next question
    cancelListening(); // Reset voice state to 'idle' for next question

    const nextIndex = questionIndex + 1;
    if (nextIndex < questions.length) {
      router.replace(`/(engineA)/question/${signId}_q${nextIndex}`);
    } else {
      router.back();
    }
  }, [questionIndex, questions.length, signId, router, stopAudio, cancelListening]);

  // ── Render ─────────────────────────────────────────────────────────────────
  if (loading) return <LoadingScreen />;
  if (!currentQuestion) return <LoadingScreen />;

  const answerCardState = (index: number) => {
    if (answeredIndex === null) {
      if (playingAnswerIndex === index) return 'reading' as const;
      // Highlight tap targets when voice failed so user knows to tap
      return voiceState === 'failed' ? 'highlight' as const : 'default' as const;
    }
    const answer = currentQuestion.answers[index];
    if (index === answeredIndex) {
      return answer.is_correct ? 'correct' as const : 'wrong' as const;
    }
    if (answer.is_correct) return 'correct' as const;
    return 'default' as const;
  };

  const isCorrect = answeredIndex !== null && currentQuestion.answers[answeredIndex]?.is_correct;
  const feedbackAudioUri = isCorrect
    ? (currentQuestion.explanation_correct_audio_url ?? '')
    : (currentQuestion.explanation_wrong_audio_url ?? '');

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        scrollEnabled={!showFeedback}
      >
        {/* Sign image */}
        {sign?.image_url && (
          <View style={styles.signImageContainer}>
            <Image
              source={{ uri: sign.image_url }}
              style={styles.signImage}
              resizeMode="contain"
            />
          </View>
        )}

        {/* Question progress dots (1/3, 2/3, 3/3) */}
        <View style={styles.progressRow}>
          {questions.map((_, i) => (
            <View
              key={i}
              style={[
                styles.progressDot,
                i < questionIndex  && styles.progressDotDone,
                i === questionIndex && styles.progressDotActive,
              ]}
            />
          ))}
        </View>

        {/* Question audio replay button */}
        <TouchableOpacity
          style={styles.questionAudioBtn}
          onPress={() => {
            if (currentQuestion.question_audio_url) {
              playAudio(currentQuestion.question_audio_url).catch(() => {});
            }
          }}
          accessibilityLabel="ጥያቄ ዳግም አዳምጥ"
        >
          <Text style={styles.questionAudioIcon}>🔊</Text>
        </TouchableOpacity>

        {/* Answer images grid (3 choices) */}
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
              disabled={answeredIndex !== null}
            />
          ))}
        </View>

        {/* Voice answer button — hidden once answered.
            showFailedText={false}: Engine A users cannot read — audio plays instead. */}
        {answeredIndex === null && (
          <VoiceAnswerButton
            state={voiceState}
            onPress={handleVoicePress}
            size={100}
            showFailedText={false}
          />
        )}
      </ScrollView>

      {/* Feedback overlay */}
      {showFeedback && currentQuestion && (
        <AudioFeedback
          isCorrect={!!isCorrect}
          explanationAudioUri={feedbackAudioUri}
          onNext={handleNext}
        />
      )}
    </SafeAreaView>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Parse the question route param.
 * "SIGN_STOP"     → ["SIGN_STOP", 0]
 * "SIGN_STOP_q2"  → ["SIGN_STOP", 2]
 */
function parseQuestionId(id: string): [string, number] {
  const match = id.match(/^(.+)_q(\d+)$/);
  if (match) {
    return [match[1], parseInt(match[2], 10)];
  }
  return [id, 0];
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safeArea: {
    flex:            1,
    backgroundColor: Colors.background,
  },
  content: {
    padding:    16,
    alignItems: 'center',
    gap:        24,
  },
  signImageContainer: {
    width:           200,
    height:          200,
    borderRadius:    20,
    overflow:        'hidden',
    backgroundColor: '#FFFFFF',
  },
  signImage: {
    width:           '100%',
    height:          '100%',
    backgroundColor: '#FFFFFF',
  },
  progressRow: {
    flexDirection: 'row',
    gap:           12,
  },
  progressDot: {
    width:           12,
    height:          12,
    borderRadius:    6,
    backgroundColor: Colors.progressTrack,
  },
  progressDotDone: {
    backgroundColor: Colors.primary,
  },
  progressDotActive: {
    backgroundColor: Colors.secondary,
    width:           20,
  },
  questionAudioBtn: {
    width:           72,
    height:          72,
    borderRadius:    36,
    backgroundColor: Colors.secondary,
    justifyContent:  'center',
    alignItems:      'center',
  },
  questionAudioIcon: {
    fontSize: 32,
  },
  answersRow: {
    flexDirection:  'row',
    flexWrap:       'wrap',
    gap:            16,
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
});
