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
  BackHandler,
} from 'react-native';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
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
import { extractSignNumber, shouldShowSignBadge } from '../../../utils/signNumber';
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
  const { playAudio, stopAudio, pauseAudio, resumeAudio, audioState } = useAudio();
  const { recordAnswer } = useProgress();

  const [signId, initialIndex] = parseQuestionId(id);

  const [sign,          setSign]          = useState<DBSign | null>(null);
  const [questions,     setQuestions]     = useState<DBQuestion[]>([]);
  const [topicSigns,    setTopicSigns]    = useState<DBSign[]>([]);
  const [loading,       setLoading]       = useState(() => !api.getSignsFromCache() || !api.getQuestionsFromCache(signId));
  const [answeredIndex,     setAnsweredIndex]     = useState<number | null>(null);
  const [showFeedback,      setShowFeedback]      = useState(false);
  const [playingAnswerIndex, setPlayingAnswerIndex] = useState<number | null>(null);
  const [qIndex,        setQIndex]        = useState(initialIndex);
  // Incremented to restart the audio sequence (e.g. user taps ▶️ when stuck)
  const [audioRestartKey,   setAudioRestartKey]   = useState(0);

  const currentQuestion = questions[qIndex] ?? null;

  // When navigating questions manually, skip the transitional audio wait
  const skipInitialWaitRef = useRef(false);

  // Ref so the async audio chain can check — without needing it in dep arrays.
  const answeredIndexRef  = useRef<number | null>(null);
  answeredIndexRef.current = answeredIndex;

  // When voice recognition fails, this ref signals the audio sequence to stop
  // so the failure audio can play cleanly without being interrupted.
  const voiceFailedRef = useRef(false);

  // Set to true when the user taps 🔊 on an answer card, so the sequence stops
  // instead of continuing to the next answer in parallel.
  const audioSequenceCancelledRef = useRef(false);

  // After a 🔊 replay finishes, holds the answer index to resume from.
  // null = normal start (question first); N = skip question, start from answer N.
  const replayFromAnswerRef = useRef<number | null>(null);

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
        if (found) {
          const sorted = allSigns
            .filter(s => s.topic_id === found.topic_id)
            .sort((a, b) => a.display_order - b.display_order);
          setTopicSigns(sorted);
        }
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
    voiceFailedRef.current = false;           // Reset for new question
    audioSequenceCancelledRef.current = false; // Reset when sequence (re)starts
    cancelListening(); // Reset audio mode to playback before starting sequence
    let cancelled = false;
    const isCancelled = () => cancelled || voiceFailedRef.current || audioSequenceCancelledRef.current;

    async function runSequence() {
      // Check if we're resuming after a 🔊 replay (skip question, start from answer N)
      const resumeFromAnswer = replayFromAnswerRef.current;
      replayFromAnswerRef.current = null;

      // Stop any audio that was playing before this screen (e.g. sign explanation).
      await stopAudio();
      if (isCancelled()) return;

      const qId = currentQuestion!.id;

      if (resumeFromAnswer === null) {
        // Normal flow: 1s wait → question audio → 300ms pause
        await new Promise(res => setTimeout(res, 1000));
        skipInitialWaitRef.current = false;
        if (isCancelled()) return;

        const qAudioUrl = currentQuestion!.question_audio_url
          || `${_AUDIO_BASE}/${qId.toLowerCase()}.mp3`;
        await playAndAwaitAudio(qAudioUrl, isCancelled);
        if (isCancelled()) return;

        await new Promise(res => setTimeout(res, 300));
        if (isCancelled() || answeredIndexRef.current !== null) return;
      }

      for (let i = resumeFromAnswer ?? 0; i < currentQuestion!.answers.length && i < 4; i++) {
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
  }, [currentQuestion?.id, audioRestartKey]); // eslint-disable-line react-hooks/exhaustive-deps

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

  // ── Answer audio button: stop sequence, replay answer, then resume from next ──
  const handleAnswerAudioPress = useCallback(async (audioUrl: string, answerIndex: number) => {
    audioSequenceCancelledRef.current = true;  // stop the ongoing sequence
    playAudio(audioUrl).catch(() => {});       // start playing the selected answer
    await waitForAudioEnd();                   // wait for it to finish
    if (answeredIndexRef.current !== null) return; // user selected answer while replaying
    // Resume sequence from the next answer (skip what was already heard)
    const nextIndex = answerIndex + 1;
    const answerCount = currentQuestion?.answers.length ?? 0;
    if (nextIndex < answerCount) {
      replayFromAnswerRef.current = nextIndex;
      audioSequenceCancelledRef.current = false;
      setAudioRestartKey(k => k + 1);
    }
    // else: replayed the last answer — sequence is done, stay stopped
  }, [playAudio, currentQuestion?.answers.length]); // eslint-disable-line react-hooks/exhaustive-deps

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

  // ── Prev / Next sign navigation ─────────────────────────────────────────────
  const currentSignIndex = topicSigns.findIndex(s => s.id === signId);
  const prevSign = currentSignIndex > 0 ? topicSigns[currentSignIndex - 1] : null;
  const nextSign = currentSignIndex < topicSigns.length - 1 ? topicSigns[currentSignIndex + 1] : null;

  const handlePrevSign = async () => {
    if (!prevSign) return;
    Haptics.selectionAsync();
    await stopAudio();
    cancelListening();
    router.replace(`/(engineA)/question/${prevSign.id}` as any);
  };

  const handleNextSign = async () => {
    if (!nextSign) return;
    Haptics.selectionAsync();
    await stopAudio();
    cancelListening();
    router.replace(`/(engineA)/question/${nextSign.id}` as any);
  };

  // ── Audio Pause/Resume button ────────────────────────────────────────────────
  const handleAudioButton = async () => {
    await Haptics.selectionAsync();
    if (audioState === 'playing') {
      await pauseAudio();
    } else if (audioState === 'paused') {
      await resumeAudio();
    } else {
      // idle / finished / error / loading → restart the sequence from the beginning.
      // This covers the case where the button appears "stuck" because audio stopped
      // unexpectedly (e.g. after entering from sign explanation screen).
      stopAudio();
      setAudioRestartKey(k => k + 1);
    }
  };

  const audioButtonIcon = audioState === 'playing' ? '⏸' : '▶️';

  // ── Navigate between questions within the same sign ────────────────────────
  const navigateToQuestion = useCallback((newIndex: number) => {
    if (newIndex < 0 || newIndex >= questions.length) return;
    stopAudio();
    cancelListening();
    setAnsweredIndex(null);
    setShowFeedback(false);
    setPlayingAnswerIndex(null);
    voiceFailedRef.current = false;
    skipInitialWaitRef.current = true; // Skip transitional audio wait
    setQIndex(newIndex);
  }, [questions.length, stopAudio, cancelListening]);

  // ── Back — always go to the CURRENT sign's explanation screen ───────────────
  // Using router.back() is wrong: if user navigated prev/next sign, back would
  // return to the original sign (the one they entered from), not the current one.
  const handleBack = useCallback(() => {
    stopAudio();
    cancelListening();
    router.replace(`/(engineA)/sign/${signId}` as any);
  }, [signId, router, stopAudio, cancelListening]);

  // Intercept Android hardware back button so it also goes to current sign
  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        handleBack();
        return true; // prevent default (which would call router.back())
      });
      return () => sub.remove();
    }, [handleBack])
  );

  // ── Navigate to next question (after feedback) ──────────────────────────────
  const handleNext = useCallback(() => {
    const nextIndex = qIndex + 1;
    if (nextIndex < questions.length) {
      navigateToQuestion(nextIndex);
    } else {
      // Go to the current sign's explanation screen (not router.back() which
      // would return to the original entry sign, not the last-viewed sign).
      handleBack();
    }
  }, [qIndex, questions.length, navigateToQuestion, handleBack]);

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
        {/* Back button — returns to current sign's explanation screen */}
        <TouchableOpacity
          style={styles.backButton}
          onPress={handleBack}
          accessibilityLabel="ወደ ኋላ ተመለስ"
        >
          <Text style={styles.backIcon}>←</Text>
        </TouchableOpacity>

        {/* Sign image */}
        {sign?.image_url && (
          <View style={styles.signImageContainer}>
            <Image
              source={{ uri: sign.image_url }}
              style={styles.signImage}
              resizeMode="contain"
            />
            {shouldShowSignBadge(sign.image_url) && (
              <View style={styles.signNumberBadge}>
                <Text style={styles.signNumberText}>{extractSignNumber(sign.image_url)}</Text>
              </View>
            )}
          </View>
        )}

        {/* Question progress dots with prev/next question navigation */}
        <View style={styles.progressRowWithNav}>
          <TouchableOpacity
            style={[styles.qNavBtn, qIndex === 0 && styles.navBtnDisabled]}
            onPress={() => navigateToQuestion(qIndex - 1)}
            disabled={qIndex === 0}
            accessibilityLabel="ወደ ቀዳሚ ጥያቄ"
          >
            <Text style={[styles.navBtnIcon, qIndex === 0 && styles.navBtnIconDisabled]}>⬅️</Text>
          </TouchableOpacity>

          <View style={styles.progressRow}>
            {questions.map((_, i) => (
              <View
                key={i}
                style={[
                  styles.progressDot,
                  i < qIndex  && styles.progressDotDone,
                  i === qIndex && styles.progressDotActive,
                ]}
              />
            ))}
          </View>

          <TouchableOpacity
            style={[styles.qNavBtn, qIndex === questions.length - 1 && styles.navBtnDisabled]}
            onPress={() => navigateToQuestion(qIndex + 1)}
            disabled={qIndex === questions.length - 1}
            accessibilityLabel="ወደ ቀጣይ ጥያቄ"
          >
            <Text style={[styles.navBtnIcon, qIndex === questions.length - 1 && styles.navBtnIconDisabled]}>➡️</Text>
          </TouchableOpacity>
        </View>

        {/* Control row: Prev sign | Pause/Resume | Next sign */}
        <View style={styles.controlRow}>
          <TouchableOpacity
            style={[styles.navBtn, !prevSign && styles.navBtnDisabled]}
            onPress={handlePrevSign}
            disabled={!prevSign}
            accessibilityLabel="ወደ ቀዳሚ ምልክት"
          >
            <Text style={[styles.navBtnIcon, !prevSign && styles.navBtnIconDisabled]}>⬅️</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.audioBtn}
            onPress={handleAudioButton}
            accessibilityLabel="ድምጽ አቁም / ቀጥል"
          >
            <Text style={styles.audioBtnIcon}>{audioButtonIcon}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.navBtn, !nextSign && styles.navBtnDisabled]}
            onPress={handleNextSign}
            disabled={!nextSign}
            accessibilityLabel="ወደ ቀጣይ ምልክት"
          >
            <Text style={[styles.navBtnIcon, !nextSign && styles.navBtnIconDisabled]}>➡️</Text>
          </TouchableOpacity>
        </View>

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
                ? () => handleAnswerAudioPress(answer.audio_url!, index)
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
  signImageContainer: {
    width:           200,
    height:          200,
    borderRadius:    20,
    overflow:        'hidden',
    backgroundColor: '#FFFFFF',
    position:        'relative',
  },
  signNumberBadge: {
    position:        'absolute',
    top:             8,
    left:            8,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius:    5,
    paddingHorizontal: 7,
    paddingVertical: 3,
    zIndex:          1,
  },
  signNumberText: {
    color:      '#FFFFFF',
    fontSize:   12,
    fontWeight: 'bold',
  },
  signImage: {
    width:           '100%',
    height:          '100%',
    backgroundColor: '#FFFFFF',
  },
  progressRowWithNav: {
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'center',
    gap:            16,
  },
  progressRow: {
    flexDirection: 'row',
    gap:           12,
    alignItems:    'center',
  },
  qNavBtn: {
    width:           48,
    height:          48,
    borderRadius:    24,
    backgroundColor: Colors.card,
    justifyContent:  'center',
    alignItems:      'center',
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
    backgroundColor: Colors.card,
    justifyContent:  'center',
    alignItems:      'center',
  },
  navBtnDisabled: {
    opacity: 0.3,
  },
  navBtnIcon: {
    fontSize: 28,
  },
  navBtnIconDisabled: {
    opacity: 0.4,
  },
  audioBtn: {
    width:           88,
    height:          88,
    borderRadius:    44,
    backgroundColor: Colors.secondary,
    justifyContent:  'center',
    alignItems:      'center',
    shadowColor:     Colors.secondary,
    shadowOffset:    { width: 0, height: 4 },
    shadowOpacity:   0.4,
    shadowRadius:    10,
    elevation:       6,
  },
  audioBtnIcon: {
    fontSize: 36,
  },
  answersRow: {
    flexDirection:  'row',
    flexWrap:       'wrap',
    gap:            16,
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
});
