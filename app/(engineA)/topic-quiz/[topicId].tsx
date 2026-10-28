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

import React, { useEffect, useCallback, useRef, useState, useMemo } from 'react';
import {
  View,
  TouchableOpacity,
  StyleSheet,
  Text,
  ScrollView,
  Image,
  Animated,
  Dimensions,
  BackHandler,
} from 'react-native';
import { ScreenSafeArea as SafeAreaView } from '../../../components/shared/ScreenSafeArea';   // top inset on Android (edge to edge)
import { QuizReview } from '../../../components/shared/QuizReview';
import { buildQuizReview } from '../../../utils/quizReview';

const SCREEN_WIDTH = Dimensions.get('window').width;
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFitImageSize } from '../../../hooks/useFitImageSize';
import { Colors } from '../../../constants/colors';
import { LoadingScreen } from '../../../components/shared/LoadingScreen';
import { ImageAnswerCard, ANSWER_ROW_MAX_WIDTH, ANSWER_ROW_GAP } from '../../../components/engineA/ImageAnswerCard';
import { VoiceAnswerButton } from '../../../components/engineA/VoiceAnswerButton';
import { AudioFeedback } from '../../../components/engineA/AudioFeedback';
import { ProgressBar } from '../../../components/shared/ProgressBar';
import { AdCard } from '../../../components/shared/AdCard';
import { AdClip } from '../../../components/shared/AdClip';
import { useTopicQuiz } from '../../../hooks/useTopicQuiz';
import { useAudio, playAndAwaitAudio } from '../../../hooks/useAudio';
import { useSponsorAd } from '../../../hooks/useSponsorAd';
import { useEngine } from '../../../contexts/EngineContext';
import { SafeBannerAd, IS_EXPO_GO } from '../../../components/shared/SafeBannerAd';

// react-native-google-mobile-ads has no native module in Expo Go — avoid
// even importing it there (a static import alone can crash on load).
const BANNER_AD_UNIT_ID = IS_EXPO_GO
  ? ''
  : __DEV__
    ? require('react-native-google-mobile-ads').TestIds.ADAPTIVE_BANNER
    : 'ca-app-pub-8758594752714631/2049529867';
import { useVoiceRecognition } from '../../../hooks/useVoiceRecognition';
import { speakAndAwait, stopTTS, onTTSSpeakingChange, getIsTTSSpeaking } from '../../../utils/googleTTS';
import { useAudioInterrupted, resumeInterruptedAudio } from '../../../hooks/useAudioInterrupted';
import ConfettiCannon from 'react-native-confetti-cannon';
import { isQuestionAudioReady } from '../../../services/audioCache';
import { maybeShowInterstitial } from '../../../services/interstitial';
import { useScreenActive } from '../../../hooks/useScreenActive';
import * as api from '../../../backend/api';
import { DBSign } from '../../../backend/supabaseClient';
import { OfflineBanner } from '../../../components/shared/OfflineBanner';
import { extractSignNumber, shouldShowSignBadge } from '../../../utils/signNumber';


// ─── Praise phrases (same set as behavioral-subtopic) ─────────────────────────
// Commit e0b352e (2026-07-27) fixed two pronunciation bugs in this same word
// set for signs (scripts/addPrefixesAndShuffle.mjs + content/signs.json) —
// doubled-letter 'ዋውው' → 'ዋው', wrong-letter 'ጎቨዝ' → 'ጎበዝ' — but never
// applied the fix here. Corrected spellings below are copied from that
// already-fixed script, not newly composed.
const CORRECT_PRAISES = [
  'ትክክል!', 'አዎ!', 'አሪፍ!', 'ጎሽ!', 'እሰይ!', 'ዋው!', 'ጎበዝ!',
  'በጣም ጥሩ!', 'በጣም አሪፍ!', 'እንድያ ነው!', 'ዋው በጣም ጥሩ!',
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
  const activeRef = useScreenActive();   // false once the learner has left this screen (ads, R6-4)
  const adClipRef = useRef<any>(null);   // the scroll area holding the ad card (components/shared/AdClip.tsx)
  // The Android system bar (3-button or gesture) sits over the bottom of the screen
  // (edge-to-edge): the last item of a scrolling screen needs this much room, or the
  // bar covers it (the 🎤 button was half hidden, 2026-10-25).
  const insets = useSafeAreaInsets();
  // Image sized so the whole question screen (incl. the 🎤 button) fits when the phone can.
  const fit = useFitImageSize(220);



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
    answers,
    lastAnswerCorrect,
    selectedAnswerId,
    restart,
  } = useTopicQuiz(topicId ?? '', levelId);

  const { userId } = useEngine();
  const sponsorAd  = useSponsorAd(userId);
  const { playAudio, stopAudio, audioState } = useAudio();
  const [isTTSPlaying,       setIsTTSPlaying]       = useState(getIsTTSSpeaking);
  const audioInterrupted = useAudioInterrupted();   // Android paused our audio (call, other app)
  const [showFeedback,       setShowFeedback]       = useState(false);
  const [playingAnswerIndex, setPlayingAnswerIndex] = useState<number | null>(null);
  const [signs,              setSigns]              = useState<DBSign[]>([]);
  const [isTabFocused,       setIsTabFocused]       = useState(false);
  const [audioRestartKey,    setAudioRestartKey]    = useState(0);
  const [feedbackTTSText,    setFeedbackTTSText]    = useState('');

  // Refs for sequence control (same pattern as exam.tsx)
  const phaseRef               = useRef(phase);
  const leavingRef             = useRef(false);   // handleBack runs once (CODEX round 3, C1)
  phaseRef.current             = phase;
  const sequenceCancelledRef   = useRef(false);
  const confettiRef            = useRef<any>(null);
  const scrollRef              = useRef<any>(null);
  const replayFromAnswerRef    = useRef<number | null>(null);
  // Index of the answer the AUTO-READING itself is at (null: still on the question,
  // or finished / failed). Set by the reading only, never by a 🔊 replay, so it says
  // where the reading was when a tap cut in, also after several quick taps. It used
  // to be a mirror of the highlighted card, which a replay moves too.
  const sequenceIndexRef       = useRef<number | null>(null);
  const markSequenceAt = (i: number | null) => { sequenceIndexRef.current = i; setPlayingAnswerIndex(i); };
  const answerAudioStartedRef  = useRef(false);
  const answerFullyReadRef     = useRef(false);
  // Counts 🔊 taps. Only the newest tap may touch the highlight or restart the
  // reading: a tap whose clip was replaced by a newer tap is let go by the audio
  // engine as "finished" and used to resume the reading as if it had played out
  // (it also cleared the newer tap's highlight).
  const replayPressRef         = useRef(0);
  // Bumped the moment the learner moves to another question, before anything else
  // happens: a tap still playing then must not restart the reading of the NEW
  // question from the middle (its continuation runs before the screen shows it).
  const questionEpochRef       = useRef(0);
  const voiceFailedRef         = useRef(false);
  const answerCallbackRef      = useRef<(idx: number) => void>(() => {});

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
    sequenceIndexRef.current    = null;   // a new reading starts on the question, not at an answer
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
          // Same contract the behavioral branch above already follows: if
          // nothing was heard, stop rather than advance in silence.
          if (!await playAndAwaitAudio(qAudioUrl, isCancelled)) { markSequenceAt(null); return; }
          if (isCancelled()) return;
        }

        await new Promise(res => setTimeout(res, 1000));
        if (isCancelled()) return;
      }

      for (let i = resumeFromAnswer ?? 0; i < currentQuestion!.answers.length && i < 4; i++) {
        if (isCancelled()) return;

        markSequenceAt(i);
        answerAudioStartedRef.current = false;
        answerFullyReadRef.current    = false;

        if (!await playAndAwaitAudio(NUMBER_URLS[i], isCancelled)) { markSequenceAt(null); return; }
        if (isCancelled()) return;

        await new Promise<void>(r => setTimeout(r, 0));
        if (isCancelled()) return;

        answerAudioStartedRef.current = true;

        const answer = currentQuestion!.answers[i];
        if (isBehavioral) {
          // Unload the number sound (useAudio engine) before the TTS answer
          // (googleTTS engine) plays. The two engines are independent and do not
          // stop each other, so a lingering number would bleed into the answer.
          await stopAudio();
          const ok = await speakAndAwait(answer?.text_amharic ?? '');
          if (!ok || isCancelled()) return;
        } else {
          const answerUrl = answer?.audio_url
            || `${_AUDIO_BASE}/answer_${currentQuestion!.id}_${answer?.id}.mp3`;
          if (!await playAndAwaitAudio(answerUrl, isCancelled)) { markSequenceAt(null); return; }
          if (isCancelled()) return;
        }

        answerFullyReadRef.current = true;
        await new Promise<void>(r => setTimeout(r, 0));
      }
      markSequenceAt(null);
    }

    runSequence().catch(() => {});
    return () => {
      cancelled = true;
      markSequenceAt(null);
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
      // The spoken feedback of a behavioral question is built HERE from the question on screen and its result,
      // not only when an answer is given: opening an already answered question (arrows, Next) used to speak the
      // text of the last answer given somewhere else (QA round 8, R8-D).
      if (currentQuestion && !currentQuestion.sign_id) {
        const correctText = currentQuestion.answers.find(a => a.is_correct)?.text_amharic ?? '';
        // the answer given on THIS question (the form the speech guard of scripts/recordTts.mjs accepts)
        const selected = currentQuestion.answers.find(a => a.id === selectedAnswerId);
        setFeedbackTTSText(
          selected?.is_correct ? `${randomPraise()} ${correctText}` : `ስህተት! ትክክለኛው መልስ: ${correctText}`
        );
      }
      const t = setTimeout(() => setShowFeedback(true), 300);
      return () => clearTimeout(t);   // a move before the 300 ms must not show the panel later (QA round 8, N4)
    }
  // Keyed on the question too: moving between two answered questions keeps the same phase, and the panel
  // (hidden by the move) never came back, so there was no Next (QA round 8, R8-B).
  }, [phase, currentIndex]); // eslint-disable-line react-hooks/exhaustive-deps

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
    // Android paused the reading (call, another app): ▶️ continues it from
    // where it stopped, instead of starting the question over.
    if (audioInterrupted) { resumeInterruptedAudio(); return; }
    if (audioState === 'playing' || audioState === 'loading' || isTTSPlaying) {
      sequenceCancelledRef.current = true;
      stopAudio();
      stopTTS().catch(() => {});
    } else {
      setAudioRestartKey(k => k + 1);
    }
  };

  // ── 🔊 Answer replay button (sign audio URL) ────────────────────────────────
  //
  // Quick taps on different speakers (same rules as question/[id].tsx): the newest
  // tap wins. An older tap whose clip a newer tap replaced is let go by the audio
  // engine as "finished"; it must neither clear the newer tap's highlight nor
  // resume the reading (it used to do both: the wrong answer started by itself).
  const handleAnswerAudioPress = useCallback(async (audioUrl: string, answerIndex: number) => {
    if (phaseRef.current !== 'question') return;
    const myPress = ++replayPressRef.current;
    const epochAtPress = questionEpochRef.current;
    sequenceCancelledRef.current = true;
    await stopTTS();
    if (myPress !== replayPressRef.current) return;   // a newer tap arrived while stopping
    setPlayingAnswerIndex(answerIndex);
    const replayed = await playAndAwaitAudio(audioUrl, () => phaseRef.current !== 'question');
    if (myPress !== replayPressRef.current) return;   // a newer tap replaced this clip
    setPlayingAnswerIndex(null);
    if (phaseRef.current !== 'question') return;
    // The learner moved to another question meanwhile: nothing to resume here.
    if (questionEpochRef.current !== epochAtPress) return;
    // Nothing was heard (offline, not cached) — don't resume the sequence, which
    // would just fail again on its first clip.
    if (!replayed) return;
    // Where the reading was when the tap cut it off (a replay never changes it).
    // null: it had finished, or was still on the question: just the replay.
    const playingAtTime = sequenceIndexRef.current;
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
    const myPress = ++replayPressRef.current;
    const epochAtPress = questionEpochRef.current;
    sequenceCancelledRef.current = true;
    await stopAudio();
    // Check before EACH step that touches the audio: an older tap that is slower to
    // get going must not stop what the newest tap has already started.
    if (myPress !== replayPressRef.current) return;   // a newer tap arrived while stopping
    await stopTTS();
    if (myPress !== replayPressRef.current) return;   // a newer tap arrived while stopping
    setPlayingAnswerIndex(answerIndex);
    const ok = await speakAndAwait(text);
    if (myPress !== replayPressRef.current) return;   // a newer tap replaced this reading
    setPlayingAnswerIndex(null);
    if (!ok || phaseRef.current !== 'question') return;
    if (questionEpochRef.current !== epochAtPress) return;
    const playingAtTime = sequenceIndexRef.current;   // see handleAnswerAudioPress
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

  // The step between "answer given" and "next question": the feedback is closed and its speech stopped FIRST
  // (nothing may speak during an ad), then the due full-screen ad runs (services/interstitial.ts), and only if
  // the learner is still on this screen does the move go on. Returns false when the screen was left meanwhile.
  const advancingRef = useRef(false);   // the whole move, ad included, runs once: every entry point shares it
  const passAdGate = async (): Promise<boolean> => {
    setShowFeedback(false);
    sequenceCancelledRef.current = true;   // cancel a running read-aloud
    cancelListening();
    await stopAudio();
    await stopTTS().catch(() => {});
    await maybeShowInterstitial(() => activeRef.current);
    return activeRef.current;
  };

  const handleNext = async () => {
    if (advancingRef.current) return;
    advancingRef.current = true;
    try {
      // Between questions nothing is shown; the end of the quiz is the only place for the full-screen ad.
      const isLast = currentIndex >= questions.length - 1;
      if (isLast && !(await passAdGate())) return;
      setShowFeedback(false);
      cancelListening();
      scrollRef.current?.scrollTo({ y: 0, animated: false });
      nextQuestion();
    } finally {
      advancingRef.current = false;
    }
  };

  // Daily quiz review (see the result screen below)
  const isDaily = topicId === 'daily';
  const dailyReview = useMemo(
    () => (isDaily && phase === 'result' ? buildQuizReview(questions, answers) : null),
    [isDaily, phase, questions, answers],
  );
  // Before leaving for a sign or for practice from the review: stop both audio engines.
  const stopAllAudio = async () => {
    sequenceCancelledRef.current = true;
    cancelListening();
    await stopAudio();
    await stopTTS().catch(() => {});
  };

  const handleBack = async () => {
    if (leavingRef.current) return;   // one exit only: a double tap must not count twice or go back twice
    leavingRef.current = true;
    try {
      cancelListening();
      await stopAudio();
      await stopTTS().catch(() => {});
      // Success keeps the guard on: the screen is leaving. Only when there is nowhere
      // to go back to (the screen stays) is it released (CODEX round 4, R4-1).
      const canLeave = typeof router.canGoBack !== 'function' || router.canGoBack();
      router.back();
      if (!canLeave) leavingRef.current = false;
    } catch (err) {
      // The exit failed (an audio stop or the navigation threw): release the guard so
      // the next tap can try again, instead of leaving the back button dead.
      leavingRef.current = false;
      console.warn('[handleBack] leaving failed:', err);
    }
  };

  // The phone's own back button keeps its normal Android behaviour (one screen back,
  // however fast it is pressed); this only stops the audio and the microphone first and
  // lets the press carry on (returns false = not handled here). Mirrors the behavioral screens.
  const stopForBackRef = useRef(() => {});
  stopForBackRef.current = () => {
    cancelListening();
    stopAudio().catch(() => {});
    stopTTS().catch(() => {});
  };
  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        stopForBackRef.current();
        return false;
      });
      return () => sub.remove();
    }, [])
  );

  const canGoPrev = currentIndex > 0;
  const canGoNext = currentIndex < questions.length - 1;

  const handleNavPrev = async () => {
    if (!canGoPrev) return;
    questionEpochRef.current++;           // first: see questionEpochRef
    sequenceCancelledRef.current = true;  // cancel running sequence immediately
    await stopAudio();
    await stopTTS().catch(() => {});
    cancelListening();
    setShowFeedback(false);
    goToQuestion(currentIndex - 1);
  };

  const handleNavNext = async () => {
    if (!canGoNext || advancingRef.current) return;
    advancingRef.current = true;
    try {
      questionEpochRef.current++;           // first: see questionEpochRef
      sequenceCancelledRef.current = true;  // cancel running sequence immediately
      await stopAudio();
      await stopTTS().catch(() => {});
      cancelListening();
      setShowFeedback(false);
      goToQuestion(currentIndex + 1);
    } finally {
      advancingRef.current = false;
    }
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
        <AdClip target={adClipRef}>
        <ScrollView ref={adClipRef} contentContainerStyle={[styles.resultContent, { paddingBottom: 32 + insets.bottom + 12 }]}>
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

          {/* PASS: our own sponsor ad (driving instructor), matched to the
              user's city — renders nothing when there is no match. FAIL:
              a small Google AdMob banner instead, so this spot is never
              empty. Decided 2026-09-11 — mirrors app/result/[sessionId].tsx. */}
          {passed ? (
            sponsorAd && (
              <View style={styles.adWrapper}>
                <AdCard
                  variant="instructor"
                  adId={sponsorAd.id}
                  name={sponsorAd.name}
                  tagline={sponsorAd.taglineAmharic}
                  phone={sponsorAd.phone}
                  avatarUri={sponsorAd.avatarUrl ?? undefined}
                  audioUri={sponsorAd.audioUrl ?? undefined}
                />
              </View>
            )
          ) : (
            <View style={styles.adWrapper}>
              <SafeBannerAd unitId={BANNER_AD_UNIT_ID} />
            </View>
          )}

          {/* Daily quiz: the same review as at the end of the 30-question exam (owner's request 2026-10-27):
              score per topic, the questions answered wrong, and "practise them". */}
          {isDaily && dailyReview && (
            <QuizReview
              isEngineA={true}
              topicBreakdown={dailyReview.topicBreakdown}
              wrongQuestions={dailyReview.wrongQuestions}
              beforeLeave={stopAllAudio}
            />
          )}

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
        </AdClip>
      </SafeAreaView>
    );
  }

  // ── Loading ───────────────────────────────────────────────────────────────────
  if (phase === 'loading' || !currentQuestion) return <LoadingScreen />;

  // ── Question screen ───────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.safeArea}>
      <OfflineBanner />
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
        onLayout={e => fit.onLayout(e, !!((isBehavioral && currentQuestion?.question_image_url) || (!isBehavioral && currentSign?.image_url)))}
        onContentSizeChange={(_w, h) => fit.onContent(h, !!((isBehavioral && currentQuestion?.question_image_url) || (!isBehavioral && currentSign?.image_url)))}
        style={styles.scrollArea}
        contentContainerStyle={[styles.content, { paddingBottom: 16 + insets.bottom + 12 }]}
        showsVerticalScrollIndicator={false}
        scrollEnabled={!showFeedback}
      >
        {/* Visual above question: behavioral subtopic image / sign image / nothing */}
        {isBehavioral && currentQuestion?.question_image_url ? (
          <View style={[styles.signImageContainer, fit.style]}>
            <Image
              source={{ uri: currentQuestion.question_image_url }}
              style={styles.signImage}
              resizeMode="cover"
            />
          </View>
        ) : !isBehavioral && currentSign?.image_url ? (
          <View style={[styles.signImageContainer, fit.style]}>
            <Image
              key={audioRestartKey}
              source={{ uri: currentSign.image_url }}
              style={styles.signImage}
              resizeMode="contain"
            />
            {/* Official sign number — same badge as sign/[id].tsx. Some
                questions ask about the sign's number directly, so this
                isn't cosmetic. */}
            {shouldShowSignBadge(currentSign.image_url) && (
              <View style={styles.signNumberBadge}>
                <Text style={styles.signNumberText}>{extractSignNumber(currentSign.image_url)}</Text>
              </View>
            )}
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
          ragQuery={!lastAnswerCorrect && currentQuestion && selectedAnswerId ? {
            question:      currentQuestion.question_amharic,
            wrongAnswer:   currentQuestion.answers.find(a => a.id === selectedAnswerId)?.text_amharic ?? '',
            correctAnswer: currentQuestion.answers.find(a => a.is_correct)?.text_amharic ?? '',
          } : undefined}
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
  // Prominent, fixed color everywhere in the app — see Colors.backButtonAccent.
  backButton: {
    width:           54,
    height:          54,
    borderRadius:    27,
    backgroundColor: '#ffffff',
    justifyContent:  'center',
    alignItems:      'center',
    flexShrink:      0,
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
  counterText: {
    fontSize:   15,
    fontWeight: '700',
    color:      '#404943',
    flexShrink: 0,
  },
  scrollArea: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 16,
    paddingTop:        12,
    paddingBottom:     16,
    alignItems:        'center',
    gap:               16,
  },
  signImageContainer: {
    width:           220,
    height:          220,
    borderRadius:    20,
    backgroundColor: '#ffffff',
    shadowColor:     '#000',
    shadowOffset:    { width: 0, height: 3 },
    shadowOpacity:   0.10,
    shadowRadius:    6,
    elevation:       3,
    position:        'relative', // anchors signNumberBadge below
  },
  // Same values as sign/[id].tsx's badge.
  signNumberBadge: {
    position:          'absolute',
    top:               10,
    left:              10,
    backgroundColor:   'rgba(255,255,255,0.92)',
    borderRadius:      5,
    paddingHorizontal: 8,
    paddingVertical:   4,
    zIndex:            1,
  },
  signNumberText: {
    color:      '#404943',
    fontSize:   14,
    fontWeight: '700',
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
    flexDirection:  'row',
    flexWrap:       'wrap',
    gap:            ANSWER_ROW_GAP,
    justifyContent: 'center',
    // Force exactly 2 cards per row (2×2) on every device size. Capping the
    // row to exactly 2 cards + gap keeps the layout static instead of
    // reflowing to 3+1 on wide screens or 1-per-row on narrow ones (the
    // 2026-07-21 fix). Card size and this cap now come from one shared
    // source — see ImageAnswerCard's ANSWER_CARD_SIZE.
    maxWidth:       ANSWER_ROW_MAX_WIDTH,
    alignSelf:      'center',
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
