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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFitImageSize } from '../../../hooks/useFitImageSize';
import * as Haptics from 'expo-haptics';
import { Colors } from '../../../constants/colors';
import { LoadingScreen } from '../../../components/shared/LoadingScreen';
import { ImageAnswerCard, ANSWER_ROW_MAX_WIDTH, ANSWER_ROW_GAP } from '../../../components/engineA/ImageAnswerCard';
import { VoiceAnswerButton } from '../../../components/engineA/VoiceAnswerButton';
import { AudioFeedback } from '../../../components/engineA/AudioFeedback';
import { DBSign, DBQuestion } from '../../../backend/supabaseClient';
import * as api from '../../../backend/api';
import { useAudio, playAndAwaitAudio } from '../../../hooks/useAudio';
import { useProgress } from '../../../hooks/useProgress';
import { extractSignNumber, shouldShowSignBadge } from '../../../utils/signNumber';
import { useVoiceRecognition } from '../../../hooks/useVoiceRecognition';
import { OfflineBanner } from '../../../components/shared/OfflineBanner';
import { prefetchSignAudio } from '../../../services/audioCache';
import { LocationPermissionModal } from '../../../components/shared/LocationPermissionModal';
import { useLocationPrompt } from '../../../hooks/useLocationPrompt';
import { useEngine } from '../../../contexts/EngineContext';

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
  // The Android system bar (3-button or gesture) sits over the bottom of the screen
  // (edge-to-edge): the last item of a scrolling screen needs this much room, or the
  // bar covers it (the 🎤 button was half hidden, 2026-10-25).
  const insets = useSafeAreaInsets();
  // Image sized so the whole question screen (incl. the 🎤 button) fits when the phone can.
  const fit = useFitImageSize(200);


  const { playAudio, stopAudio, pauseAudio, resumeAudio, audioState } = useAudio();
  const { recordAnswer } = useProgress();
  const { userId } = useEngine();
  const {
    visible: locationModalVisible,
    maybeShow: maybeShowLocationPrompt,
    handleApprove: handleLocationApproveBase,
    handleNotNow: handleLocationNotNowBase,
  } = useLocationPrompt(userId);

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

  // ── Bookkeeping for the 🔊 taps (same contract as exam.tsx / topic-quiz) ───────
  // Index of the answer the AUTO-READING itself is at; null while it is still on
  // the question, or once it has finished or failed. Set by the sequence only
  // (never by a 🔊 replay), so it says where the reading was when a tap cut in.
  const sequenceIndexRef      = useRef<number | null>(null);
  // For the answer the sequence is at: its number has been said / it was read to the end.
  const answerAudioStartedRef = useRef(false);
  const answerFullyReadRef    = useRef(false);
  // Counts 🔊 taps. Only the newest tap may touch the highlight or restart the
  // reading: a tap whose clip was replaced by a newer tap is let go by the audio
  // engine as "finished", and used to resume the reading as if it had played out.
  const replayPressRef        = useRef(0);
  // Bumped the moment the learner moves to another question, before anything else
  // happens. A tap still playing then is let go by that move, and must not restart
  // the reading of the NEW question from the middle (a ref set at render time is too
  // late: the tap's continuation runs before the screen shows the new question).
  const questionEpochRef      = useRef(0);

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

        // Pull this sign's audio down immediately (~22 files / ~1.2 MB, a few
        // seconds). This screen previously had NO prefetch at all, so its audio
        // was streamed live and a disconnection broke it instantly. The
        // topic-wide prefetch takes minutes; this covers the first seconds.
        prefetchSignAudio(found, qs).catch(() => {});

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
    sequenceIndexRef.current = null;           // not at any answer yet
    cancelListening(); // Reset audio mode to playback before starting sequence
    let cancelled = false;
    const isCancelled = () => cancelled || voiceFailedRef.current || audioSequenceCancelledRef.current;
    // The reading ended without finishing (a clip could not be heard): a later 🔊
    // tap must not restart it.
    const stopHere = () => { sequenceIndexRef.current = null; setPlayingAnswerIndex(null); };

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
        if (!await playAndAwaitAudio(qAudioUrl, isCancelled)) { stopHere(); return; }
        if (isCancelled()) return;

        await new Promise(res => setTimeout(res, 300));
        if (isCancelled() || answeredIndexRef.current !== null) return;
      }

      for (let i = resumeFromAnswer ?? 0; i < currentQuestion!.answers.length && i < 4; i++) {
        if (isCancelled() || answeredIndexRef.current !== null) return;

        setPlayingAnswerIndex(i);
        // Where the reading is, for a 🔊 tap that cuts in: this answer's number
        // is not said yet, and it is not read to the end yet.
        sequenceIndexRef.current      = i;
        answerAudioStartedRef.current = false;
        answerFullyReadRef.current    = false;

        // Stop the moment a clip cannot be heard (offline + not cached).
        // Continuing would walk the yellow highlight through every answer in
        // silence, which reads as the app answering by itself.
        if (!await playAndAwaitAudio(NUMBER_URLS[i], isCancelled)) { stopHere(); return; }
        if (isCancelled() || answeredIndexRef.current !== null) return;

        // Yield, so a tap that is already waiting is handled before the next
        // clip starts (same as exam.tsx): it prevents one extra clip playing.
        await new Promise<void>(r => setTimeout(r, 0));
        if (isCancelled() || answeredIndexRef.current !== null) return;

        // The answer itself is about to start: from here a 🔊 tap on another
        // answer is the learner choosing to skip the rest of this one.
        answerAudioStartedRef.current = true;

        const answer = currentQuestion!.answers[i];
        const answerUrl = answer?.audio_url
          || `${_AUDIO_BASE}/answer_${qId}_${answer?.id}.mp3`;
        if (!await playAndAwaitAudio(answerUrl, isCancelled)) { stopHere(); return; }
        // Cut by a 🔊 tap: it is not "read to the end".
        if (isCancelled()) return;

        answerFullyReadRef.current = true;
      }
      stopHere();
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
      // File: try_again.mp3 = "try again, say the number: one, two, three or four"
      // (exact Amharic text: SYSTEM_AUDIO in scripts/generateAllAudio.ts)
      playAudio(`${_AUDIO_BASE}/try_again.mp3`).catch(() => {});
    } else {
      voiceFailedRef.current = false;        // Reset when leaving failed state
    }
  }, [voiceState]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Answer audio button: stop sequence, replay answer, then maybe resume ─────
  //
  // Same contract as exam.tsx / topic-quiz (this screen used to resume from the
  // next answer after EVERY tap, so tapping 🔊 on answer 1 made answer 2 start,
  // tapping answer 2 made 3 start, and so on, and quick taps on different
  // speakers started the wrong answers):
  //   - the reading continues after a replay ONLY if the tap cut it off while it
  //     was reading answers; if it had finished, the tap just replays that answer;
  //   - where it continues from depends on how far the answer it was at had got.
  const handleAnswerAudioPress = useCallback(async (audioUrl: string, answerIndex: number) => {
    const myPress = ++replayPressRef.current;
    const epochAtPress = questionEpochRef.current;
    audioSequenceCancelledRef.current = true;  // stop the ongoing sequence
    setPlayingAnswerIndex(answerIndex);        // move yellow highlight to the tapped answer
    // playAndAwaitAudio stops the current audio, plays the requested answer,
    // and resolves ONLY when THIS specific audio finishes — eliminates the race
    // condition where fire-and-forget playAudio() + waitForAudioEnd() could
    // resolve prematurely (before playAudio changed the audio state) and restart
    // the sequence while the replay was still playing.
    const replayed = await playAndAwaitAudio(audioUrl, () => answeredIndexRef.current !== null);
    // A newer tap replaced this clip (the engine reports that as "finished"):
    // the newer tap owns the highlight and the continuation.
    if (myPress !== replayPressRef.current) return;
    setPlayingAnswerIndex(null);               // clear highlight before resuming
    if (answeredIndexRef.current !== null) return; // user selected answer while replaying
    // The learner moved to another question meanwhile: nothing to resume here.
    if (questionEpochRef.current !== epochAtPress) return;
    // Nothing was heard (offline, not cached) — don't resume the sequence, which
    // would just fail again on its first clip.
    if (!replayed) return;
    // Where the reading was when the tap cut it off. A replay never changes it
    // (only the reading does), so it is the same after one tap or after several
    // quick ones. null: the reading had already finished, or was still on the
    // question: the learner is reviewing, not in the middle of listening, so
    // just the replay.
    const playingAtTime = sequenceIndexRef.current;
    if (playingAtTime === null) return;
    // Where to continue:
    //  A) the answer it was at was read to the end  -> the next one;
    //  B) its audio had started (the learner skipped the rest of it) -> after the
    //     answer just replayed;
    //  C) only its number was said -> that answer again.
    const resumeFrom = answerFullyReadRef.current
      ? playingAtTime + 1
      : answerAudioStartedRef.current
        ? answerIndex + 1
        : playingAtTime;
    const answerCount = Math.min(4, currentQuestion?.answers.length ?? 0);
    if (resumeFrom < answerCount) {
      replayFromAnswerRef.current = resumeFrom;
      audioSequenceCancelledRef.current = false;
      setAudioRestartKey(k => k + 1);
    }
    // else: nothing left to read — stay stopped
  }, [currentQuestion?.answers.length]); // eslint-disable-line react-hooks/exhaustive-deps

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
  const navigateToQuestion = useCallback(async (newIndex: number) => {
    if (newIndex < 0 || newIndex >= questions.length) return;
    questionEpochRef.current++;   // first, before stopAudio lets a playing 🔊 tap go (see its comment)
    await stopAudio();
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
  const handleBack = useCallback(async () => {
    await stopAudio();
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
  const handleNext = useCallback(async () => {
    const nextIndex = qIndex + 1;
    if (nextIndex < questions.length) {
      navigateToQuestion(nextIndex);
      return;
    }
    // Just finished the last question of this sign's quiz — the "delighted
    // moment" the app owner chose for the location-permission primer, right
    // before returning to the sign's explanation screen.
    const shown = await maybeShowLocationPrompt();
    if (!shown) handleBack();
    // else: wait for the modal's approve/not-now, which itself calls handleBack.
  }, [qIndex, questions.length, navigateToQuestion, handleBack, maybeShowLocationPrompt]);

  const handleLocationApprove = () => {
    handleLocationApproveBase();
    handleBack();
  };

  const handleLocationNotNow = () => {
    handleLocationNotNowBase();
    handleBack();
  };

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
      <OfflineBanner />
      <LocationPermissionModal
        visible={locationModalVisible}
        onApprove={handleLocationApprove}
        onNotNow={handleLocationNotNow}
      />
      {/* Back button — floats outside the ScrollView so it never scrolls out
          of view (2026-09-11). It used to be the first item INSIDE the
          ScrollView, which is exactly what made it disappear once the user
          scrolled down to reach answers 3-4. content's paddingTop reserves
          the space it would otherwise cover. */}
      <TouchableOpacity
        style={styles.backButton}
        onPress={handleBack}
        accessibilityLabel="ወደ ኋላ ተመለስ"
      >
        <Text style={styles.backIcon}>←</Text>
      </TouchableOpacity>

      <ScrollView
        onLayout={e => fit.onLayout(e, !!sign?.image_url)}
        onContentSizeChange={(_w, h) => fit.onContent(h, !!sign?.image_url)}
        style={styles.scrollArea}
        contentContainerStyle={[styles.content, { paddingBottom: 16 + insets.bottom + 12 }]}
        showsVerticalScrollIndicator={false}
        scrollEnabled={!showFeedback}
      >
        {/* Sign image */}
        {sign?.image_url && (
          <View style={[styles.signImageContainer, fit.style]}>
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
            <Text style={[styles.navBtnIcon, qIndex === 0 && styles.navBtnIconDisabled]}>‹</Text>
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
            <Text style={[styles.navBtnIcon, qIndex === questions.length - 1 && styles.navBtnIconDisabled]}>›</Text>
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
            <Text style={[styles.navBtnIcon, !prevSign && styles.navBtnIconDisabled]}>‹</Text>
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
            <Text style={[styles.navBtnIcon, !nextSign && styles.navBtnIconDisabled]}>›</Text>
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
          ragQuery={!isCorrect && answeredIndex !== null ? {
            question:      currentQuestion.question_amharic,
            wrongAnswer:   currentQuestion.answers[answeredIndex]?.text_amharic ?? '',
            correctAnswer: currentQuestion.answers.find(a => a.is_correct)?.text_amharic ?? '',
          } : undefined}
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
    backgroundColor: '#f7f9fb',
  },
  scrollArea: {
    flex: 1,
  },
  content: {
    padding:    16,
    // Extra top clearance so the image starts BELOW the floating back
    // button (top:12 + height:54 = bottom edge at 66) instead of behind
    // it — the 2026-09-11 overlap bug was exactly this button hiding the
    // top of the image.
    paddingTop: 74,
    paddingBottom: 16,
    alignItems: 'center',
    gap:        16,
  },
  // Prominent, fixed color everywhere in the app — see Colors.backButtonAccent.
  backButton: {
    width:           54,
    height:          54,
    borderRadius:    27,
    backgroundColor: '#ffffff',
    justifyContent:  'center',
    alignItems:      'center',
    // Floats over the top-left corner instead of taking its own row, so it
    // costs zero vertical space and never scrolls away — it's positioned
    // against safeArea, not against the ScrollView's content (2026-09-11).
    position:        'absolute',
    top:             12,
    left:            16,
    zIndex:          10,
    borderWidth:     2,
    borderColor:     Colors.backButtonAccent,
    shadowColor:     '#000',
    shadowOffset:    { width: 0, height: 3 },
    shadowOpacity:   0.20,
    shadowRadius:    8,
    elevation:       6,
  },
  backIcon: {
    fontSize:   28,
    fontWeight: '700',
    color:      Colors.backButtonAccent,
  },
  signImageContainer: {
    // 200 → 150 → 180 → 200 (2026-09-11): 150 and 180 were both still too
    // small to make out sign details — users need to see the image clearly
    // to know what it's asking, back to (about) its original size. Some
    // scrolling to reach answers 3-4 is an accepted tradeoff (the back
    // button/mic staying visible during that scroll was the actual hard
    // requirement, not avoiding scroll entirely).
    width:           200,
    height:          200,
    borderRadius:    20,
    overflow:        'hidden',
    backgroundColor: '#ffffff',
    position:        'relative',
    shadowColor:     '#000',
    shadowOffset:    { width: 0, height: 3 },
    shadowOpacity:   0.10,
    shadowRadius:    8,
    elevation:       4,
  },
  signNumberBadge: {
    position:          'absolute',
    top:               8,
    left:              8,
    backgroundColor:   'rgba(255,255,255,0.92)',
    borderRadius:      5,
    paddingHorizontal: 7,
    paddingVertical:   3,
    zIndex:            1,
  },
  signNumberText: {
    color:      '#404943',
    fontSize:   12,
    fontWeight: 'bold',
  },
  signImage: {
    width:           '100%',
    height:          '100%',
    backgroundColor: '#ffffff',
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
    backgroundColor: '#ffffff',
    justifyContent:  'center',
    alignItems:      'center',
    shadowColor:     '#000',
    shadowOffset:    { width: 0, height: 2 },
    shadowOpacity:   0.10,
    shadowRadius:    6,
    elevation:       3,
  },
  progressDot: {
    width:           12,
    height:          12,
    borderRadius:    6,
    backgroundColor: '#e0e0e0',
  },
  progressDotDone: {
    backgroundColor: '#2E7D32',
  },
  progressDotActive: {
    backgroundColor: '#FDD835',
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
    backgroundColor: '#ffffff',
    justifyContent:  'center',
    alignItems:      'center',
    shadowColor:     '#000',
    shadowOffset:    { width: 0, height: 2 },
    shadowOpacity:   0.10,
    shadowRadius:    6,
    elevation:       3,
  },
  navBtnDisabled: {
    opacity: 0.3,
  },
  navBtnIcon: {
    fontSize:   34,
    color:      '#1565C0',
    fontWeight: '300',
    lineHeight: 40,
  },
  navBtnIconDisabled: {
    opacity: 0.4,
  },
  audioBtn: {
    width:           88,
    height:          88,
    borderRadius:    44,
    backgroundColor: '#FDD835',
    justifyContent:  'center',
    alignItems:      'center',
    shadowColor:     '#FDD835',
    shadowOffset:    { width: 0, height: 4 },
    shadowOpacity:   0.5,
    shadowRadius:    10,
    elevation:       6,
  },
  audioBtnIcon: {
    fontSize: 36,
  },
  answersRow: {
    flexDirection:  'row',
    flexWrap:       'wrap',
    gap:            ANSWER_ROW_GAP,
    justifyContent: 'center',
    // Force exactly 2 cards per row (2×2) on every device size — see
    // ImageAnswerCard's ANSWER_CARD_SIZE/ANSWER_ROW_MAX_WIDTH doc comment.
    // Enlarged 2026-09-11 at the app owner's request.
    maxWidth:       ANSWER_ROW_MAX_WIDTH,
    alignSelf:      'center',
  },
});
