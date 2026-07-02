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
import { useNetworkStatus } from '../../../hooks/useNetworkStatus';
import { isQuestionAudioReady, prefetchQuestionAudio, preCacheAudioBatch } from '../../../services/audioCache';
import { useAudio, playAndAwaitAudio } from '../../../hooks/useAudio';
import { speakAndAwait, stopTTS, onTTSSpeakingChange, getIsTTSSpeaking } from '../../../utils/googleTTS';
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
    isSaving,
  } = useExam();

  const { playAudio, stopAudio, audioState } = useAudio();
  const [isTTSPlaying,             setIsTTSPlaying]             = useState(getIsTTSSpeaking);
  const [showFeedback,             setShowFeedback]             = useState(false);
  const scrollRef = useRef<any>(null);
  const isConnected = useNetworkStatus();
  const [currentQuestionAudioReady, setCurrentQuestionAudioReady] = useState(true);
  const [audioRestartKey,          setAudioRestartKey]          = useState(0);
  const prevConnectedRef  = useRef(true);
  const isConnectedRef    = useRef(isConnected);
  const [playingAnswerIndex,       setPlayingAnswerIndex]       = useState<number | null>(null);
  const playingAnswerIndexRef  = useRef<number | null>(null); // mirror for async callbacks
  // true once the answer's own audio clip has STARTED playing (after the number announcement).
  // false while only the number is being announced.
  const answerAudioStartedRef  = useRef(false);
  // true after the answer's AUDIO (not just the number announcement) has fully played.
  // Used by handleAnswerAudioPress to decide whether to resume from i or i+1.
  const answerFullyReadRef     = useRef(false);
  const [signs,                    setSigns]                    = useState<DBSign[]>([]);
  const [isTabFocused,             setIsTabFocused]             = useState(false);

  // Keep isConnectedRef in sync — lets runSequence read connectivity synchronously
  useEffect(() => { isConnectedRef.current = isConnected; }, [isConnected]);

  // Keep playingAnswerIndexRef in sync — lets handleAnswerAudioPress capture the
  // answer index the sequence was on at the moment the user tapped 🔊.
  useEffect(() => { playingAnswerIndexRef.current = playingAnswerIndex; }, [playingAnswerIndex]);
  useEffect(() => onTTSSpeakingChange(setIsTTSPlaying), []);

  // Load all signs once on mount (for displaying the sign image per question)
  useEffect(() => {
    api.getAllSigns().then(setSigns).catch(() => {});
  }, []);

  // Check audio cache only when internet disconnects — not proactively.
  // While connected: assume ready. When offline: check if audio is actually cached.
  useEffect(() => {
    if (isConnected) {
      setCurrentQuestionAudioReady(true);
      return;
    }
    if (!currentQuestion) return;
    isQuestionAudioReady(currentQuestion)
      .then(ready => setCurrentQuestionAudioReady(ready))
      .catch(() => setCurrentQuestionAudioReady(false));
  }, [isConnected, currentQuestion?.id]);

  // On reconnect: kill the running sequence immediately, re-download audio for current + next 3,
  // then restart sequence from the beginning of the current question.
  useEffect(() => {
    const wasConnected = prevConnectedRef.current;
    prevConnectedRef.current = isConnected;
    if (!wasConnected && isConnected && questions.length > 0) {
      // Only restart when asking a question. During feedback phase,
      // AudioFeedback manages its own audio — stopAudio() here would set
      // audioState to 'idle', which AudioFeedback never checks for, so the
      // Next button would never appear and the user would be stuck.
      if (phaseRef.current !== 'question') return;

      // Cancel the sequence immediately (synchronous), then fire stopAudio()
      // without await — intentional. _stop() increments _soundId synchronously,
      // which invalidates any in-flight callbacks instantly. We don't need to
      // wait for the native layer to stop before restarting the sequence.
      sequenceCancelledRef.current = true;
      stopAudio();
      stopTTS().catch(() => {}); // Stop TTS if a behavioral question was playing
      // Prefetch audio for current + next 3 questions
      questions.slice(currentIndex, currentIndex + 4).forEach(q => prefetchQuestionAudio(q));
      // Pre-warm image cache for current question's sign + answer images
      // so they're ready immediately when Image remounts via key={audioRestartKey}
      const currentQ = questions[currentIndex];
      if (currentQ) {
        const sign = signs.find((s: any) => s.id === currentQ.sign_id);
        if (sign?.image_url) Image.prefetch(sign.image_url).catch(() => {});
        currentQ.answers?.forEach((a: any) => {
          if (a.image_url) Image.prefetch(a.image_url).catch(() => {});
        });
      }
      setAudioRestartKey(k => k + 1);
    }
  }, [isConnected]); // eslint-disable-line react-hooks/exhaustive-deps

  // Prefetch images for current + next 3 questions (for offline support)
  // Image.prefetch() stores into OS image cache, available when offline
  useEffect(() => {
    if (signs.length === 0 || questions.length === 0) return;
    questions.slice(currentIndex, currentIndex + 4).forEach(q => {
      const sign = signs.find(s => s.id === q.sign_id);
      if (sign?.image_url) Image.prefetch(sign.image_url).catch(() => {});
      q.answers.forEach((a: any) => {
        if (a.image_url) Image.prefetch(a.image_url).catch(() => {});
      });
    });
  }, [currentIndex, signs.length, audioRestartKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const currentSign = signs.find(s => s.id === currentQuestion?.sign_id) ?? null;

  // Ref so async runSequence can check phase without stale closure
  const phaseRef = useRef(phase);
  phaseRef.current = phase;

  // When voice recognition fails, this ref signals the audio sequence to stop
  // so the failure audio can play cleanly without being interrupted.
  const voiceFailedRef = useRef(false);

  // Synchronous cancellation for reconnect: set true BEFORE preCacheAudioBatch resolves
  // so the running sequence stops immediately without waiting for a re-render cycle.
  const sequenceCancelledRef = useRef(false);

  // When the user taps 🔊 on an answer card, holds the answer index to resume from.
  // null = normal start (question first); N = skip question, start from answer N.
  const replayFromAnswerRef = useRef<number | null>(null);

  // TTS failure tracking — counts consecutive TTS failures on the SAME question.
  // Resets automatically when the question changes (tracked by question ID).
  // 1st failure → play "connection problem, press ▶️ to retry"
  // 2nd+ failure → play "still failing, move to next question or topic"
  const ttsFailCountRef      = useRef(0);
  const ttsFailQuestionIdRef = useRef('');

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
        stopAudio();
        stopTTS().catch(() => {});
      };
    }, [cancelListening, stopAudio])
  );

  // ── Answer select (tap OR voice) ───────────────────────────────────────────
  const handleAnswerSelect = useCallback((index: number) => {
    if (!currentQuestion) return;
    if (phase !== 'question') return;
    const answer = currentQuestion.answers[index];
    if (!answer) return;

    cancelListening(); // Stop any ongoing recording
    sequenceCancelledRef.current = true; // Stop runSequence immediately before stopAudio resolves
    stopAudio();
    stopTTS().catch(() => {}); // Also stop TTS if a behavioral question was playing
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
    sequenceCancelledRef.current = false; // Reset reconnect cancellation flag
    cancelListening();
    setShowFeedback(false);
    let cancelled = false;
    const isCancelled = () =>
      cancelled || voiceFailedRef.current || sequenceCancelledRef.current || phaseRef.current !== 'question';

    async function runSequence() {
      await stopAudio();
      await stopTTS();
      if (isCancelled()) return;

      const qId = currentQuestion!.id;
      // Behavioral question = no sign_id. Use TTS for question + answer audio.
      const isBehavioral = !currentQuestion!.sign_id;

      // Check if we're resuming after a 🔊 replay (skip question, start from answer N).
      const resumeFromAnswer = replayFromAnswerRef.current;
      replayFromAnswerRef.current = null;

      if (resumeFromAnswer === null) {
      if (isBehavioral) {
        // Reset TTS fail counter when we reach a new question
        const qIdForFail = currentQuestion!.id;
        if (ttsFailQuestionIdRef.current !== qIdForFail) {
          ttsFailCountRef.current      = 0;
          ttsFailQuestionIdRef.current = qIdForFail;
        }

        // TTS reads the question aloud.
        // If TTS fails (network error / timeout) → stop the sequence here and play
        // an informative error message so the user knows what to do.
        // The ▶️ button remains on screen for retry.
        const questionSpoken = await speakAndAwait(currentQuestion!.question_amharic ?? '');
        if (!questionSpoken) {
          if (!isCancelled()) {
            // Count this failure and choose the right error message:
            // 1st failure → "connection problem, press ▶️ to retry"
            // 2nd+ failure → "still failing, move to next question/topic"
            ttsFailCountRef.current += 1;
            const errorFile = ttsFailCountRef.current > 1
              ? 'tts_error_retry.mp3'
              : 'tts_error_first.mp3';
            playAudio(`${_AUDIO_BASE}/${errorFile}`).catch(() => {});
          }
          return;
        }
        if (isCancelled()) return;
      } else {
        const qAudioUrl = currentQuestion!.question_audio_url
          || `${_AUDIO_BASE}/${qId.toLowerCase()}.mp3`;
        await playAndAwaitAudio(qAudioUrl, isCancelled);
        if (isCancelled()) return;
      }

      await new Promise(res => setTimeout(res, 1000));
      if (isCancelled()) return;

      // If offline at this point:
      //   - Behavioral questions: stop (answers need live TTS — can't be cached).
      //   - Sign questions: stop only if answer audio is NOT cached locally.
      //     If everything was pre-cached, the full sequence can play offline.
      if (!isConnectedRef.current && !isBehavioral) {
        const answersReady = await isQuestionAudioReady(currentQuestion!);
        if (!answersReady) return;
      } else if (!isConnectedRef.current && isBehavioral) {
        return;
      }
      } // end if (resumeFromAnswer === null)

      for (let i = resumeFromAnswer ?? 0; i < currentQuestion!.answers.length && i < 4; i++) {
        if (isCancelled()) return;

        setPlayingAnswerIndex(i);
        // Reset both flags: answer audio not started, not fully read yet.
        answerAudioStartedRef.current = false;
        answerFullyReadRef.current    = false;

        await playAndAwaitAudio(NUMBER_URLS[i], isCancelled);
        if (isCancelled()) return;

        // Yield to the macrotask queue so any pending tap events are processed
        // before we start the next clip — prevents one extra audio clip playing.
        await new Promise<void>(r => setTimeout(r, 0));
        if (isCancelled()) return;

        // Answer audio is about to start — from this point the user "chose to skip"
        // if they tap 🔊 on another answer (they heard the number, decided to jump).
        answerAudioStartedRef.current = true;

        const answer = currentQuestion!.answers[i];
        if (isBehavioral) {
          // TTS reads the answer text.
          // If TTS fails here — play error audio and stop. The user heard the
          // question but not all answers; continuing would leave them confused.
          const answerSpoken = await speakAndAwait(answer?.text_amharic ?? '');
          if (!answerSpoken) {
            if (!isCancelled()) {
              ttsFailCountRef.current += 1;
              const errorFile = ttsFailCountRef.current > 1
                ? 'tts_error_retry.mp3'
                : 'tts_error_first.mp3';
              playAudio(`${_AUDIO_BASE}/${errorFile}`).catch(() => {});
            }
            return;
          }
          if (isCancelled()) return;
        } else {
          const answerUrl = answer?.audio_url
            || `${_AUDIO_BASE}/answer_${qId}_${answer?.id}.mp3`;
          await playAndAwaitAudio(answerUrl, isCancelled);
          if (isCancelled()) return;
        }

        // Answer audio finished completely — mark as fully read.
        answerFullyReadRef.current = true;

        // Yield again before the next number announcement.
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

  // Reset scroll to top on new question
  useEffect(() => {
    if (phase === 'question') {
      scrollRef.current?.scrollTo({ y: 0, animated: false });
    }
  }, [currentQuestion?.id]);

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
        wrongQuestions:  result.wrongQuestions,
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
    stopAudio();
    stopTTS().catch(() => {});
    router.navigate('/(engineA)/home' as any);
  };

  // ── Question navigation (prev / next) ───────────────────────────────────────
  const canGoPrev = currentIndex > 0;
  const canGoNext = currentIndex < (questions.length || 30) - 1;

  const handleNavPrev = () => {
    if (!canGoPrev) return;
    stopAudio();
    stopTTS().catch(() => {});
    cancelListening();
    setShowFeedback(false);
    goToQuestion(currentIndex - 1);
  };

  const handleNavNext = () => {
    if (!canGoNext) return;
    stopAudio();
    stopTTS().catch(() => {});
    cancelListening();
    setShowFeedback(false);
    goToQuestion(currentIndex + 1);
  };

  // ── Stop / Restart audio sequence ──────────────────────────────────────────
  // ⏸ → cancel the running sequence and stop audio immediately.
  // ▶️ → restart the full sequence from scratch (question → answers).
  const handleAudioButton = () => {
    if (audioState === 'playing' || audioState === 'loading' || isTTSPlaying) {
      sequenceCancelledRef.current = true;
      stopAudio();
      stopTTS().catch(() => {}); // Also stop TTS if a behavioral question was playing
    } else {
      // idle / paused / finished / error → restart full sequence
      setAudioRestartKey(k => k + 1);
    }
  };

  // ── 🔊 Answer audio button: cancel sequence, highlight card, replay, then resume ──
  const handleAnswerAudioPress = useCallback(async (audioUrl: string, answerIndex: number) => {
    if (phaseRef.current !== 'question') return;
    // Capture where the sequence was BEFORE cancelling it.
    // Example: sequence is reading answer 3 (index 2), user taps 🔊 on answer 1 (index 0)
    // → after replay we must continue from answer 4 (index 3), not answer 2.
    const playingAtTime = playingAnswerIndexRef.current;
    sequenceCancelledRef.current = true;
    await stopTTS();   // stop TTS if a behavioral question was mid-read
    setPlayingAnswerIndex(answerIndex); // yellow border on the tapped card
    // playAndAwaitAudio stops the current audio, plays this answer, resolves only
    // when it finishes — no race condition with the sequence.
    await playAndAwaitAudio(audioUrl, () => phaseRef.current !== 'question');
    setPlayingAnswerIndex(null);
    if (phaseRef.current !== 'question') return;
    // If the sequence had already finished (playingAtTime === null), just replay —
    // don't restart the cycle (user is reviewing, not in the middle of listening).
    if (playingAtTime === null) return;
    // Three-way resume logic:
    //
    //  A) Answer was FULLY read (number + audio both done)
    //     → resume from playingAtTime + 1  (that answer is complete, move on)
    //
    //  B) Answer audio had STARTED but not finished (user jumped mid-playback)
    //     → the user intentionally skipped it; resume from answerIndex + 1
    //       (continue from the answer they just replayed, then move forward)
    //
    //  C) Only the NUMBER was announced, audio hadn't started yet
    //     → the answer was never heard; resume from playingAtTime so it gets re-read
    const resumeFrom = answerFullyReadRef.current
      ? playingAtTime + 1       // A: fully done
      : answerAudioStartedRef.current
        ? answerIndex + 1       // B: mid-audio skip — continue after the replayed answer
        : playingAtTime;        // C: number-only — re-read the interrupted answer
    if (resumeFrom < 4) {
      replayFromAnswerRef.current = resumeFrom;
      sequenceCancelledRef.current = false;
      setAudioRestartKey(k => k + 1);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const audioButtonIcon = (audioState === 'playing' || isTTSPlaying) ? '⏸' : '▶️';

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
          trackColor='#e0e0e0'
          height={6}
        />
        <Text style={styles.timerIcon}>⏱</Text>
      </View>
      {isSaving && (
        <Text style={{ textAlign: 'center', color: '#888', fontSize: 11, marginTop: 2 }}>ማስቀመጥ...</Text>
      )}
      {!isConnected && !currentQuestionAudioReady && phase === 'question' && (
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'center', alignItems: 'center', zIndex: 999, padding: 32 }}>
          <Text style={{ color: '#fff', fontSize: 48, marginBottom: 16 }}>📵</Text>
          <Text style={{ color: '#fff', fontSize: 18, textAlign: 'center', marginBottom: 8 }}>{'ኢንተርኔት የለም'}</Text>
          <Text style={{ color: '#ccc', fontSize: 14, textAlign: 'center', marginBottom: 32 }}>{'ድምፅ ማጫወት አይቻልም። እባክዎ ኢንተርኔት ሲኖር ይመለሱ።'}</Text>
          <TouchableOpacity onPress={() => { router.navigate('/(engineA)/home' as any); }}
            style={{ backgroundColor: '#e67e22', paddingHorizontal: 32, paddingVertical: 12, borderRadius: 24 }}>
            <Text style={{ color: '#fff', fontSize: 16 }}>{'ወደ ቤት ተመለስ'}</Text>
          </TouchableOpacity>
        </View>
      )}

      <ScrollView
        ref={scrollRef}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        scrollEnabled={!showFeedback}
      >
        {/* Sign or behavioral question image */}
        {(currentSign?.image_url || currentQuestion.question_image_url) && (
          <View style={styles.signImageContainer}>
            <Image
              key={audioRestartKey}
              source={{ uri: currentSign?.image_url ?? currentQuestion.question_image_url! }}
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
            <Text style={styles.navBtnIcon}>‹</Text>
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
            <Text style={styles.navBtnIcon}>›</Text>
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
                ? () => handleAnswerAudioPress(answer.audio_url!, index)
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
    backgroundColor: '#f7f9fb',
  },

  // Fixed top bar — always visible, never scrolls away
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

  // Combined navigation + audio control row: ‹ | ⏸/▶️ | 1/21 | ›
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
    backgroundColor: '#ffffff',
    justifyContent:  'center',
    alignItems:      'center',
    shadowColor:     '#000',
    shadowOffset:    { width: 0, height: 2 },
    shadowOpacity:   0.10,
    shadowRadius:    4,
    elevation:       3,
  },
  qNavBtnDisabled: {
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
  questionCounter: {
    fontSize:   17,
    fontWeight: '700',
    color:      '#191c1e',
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
