/**
 * app/(engineB)/behavioral-subtopic/[id].tsx
 * Engine B — Behavioral sub-topic screen (reader, text-based)
 *
 * Mirrors app/(engineB)/question/[id].tsx exactly:
 *
 * Phase 1 — EXPLANATION:
 *   Image (or icon placeholder)
 *   Explanation text (explanation_amharic)
 *   AudioButton for narration
 *   "Go to quiz" button
 *
 * Phase 2 — QUESTIONS (mirrors Engine B question screen):
 *   Header: [←]  ● ● ●  N/total
 *   ScrollView:
 *     - Small subtopic image (or icon) 110×110
 *     - Question text + AudioButton (plays TTS)
 *     - TextAnswerCard × 4
 *   TextFeedback overlay
 *   Bottom nav:
 *     Row 1: ‹ prev-question  next-question ›
 *     Divider
 *     Row 2: ‹ prev-subtopic  [icon] next-subtopic ›
 *
 * Phase 3 — COMPLETE: ✅ + back button
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { UiStrings } from '../../../constants/strings';
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Platform,
  BackHandler,
} from 'react-native';
import { ScreenSafeArea as SafeAreaView } from '../../../components/shared/ScreenSafeArea';   // top inset on Android (edge to edge)
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '../../../constants/colors';
import { Typography } from '../../../constants/typography';
import { TextAnswerCard } from '../../../components/engineB/TextAnswerCard';
import { TextFeedback } from '../../../components/engineB/TextFeedback';
import { AudioButton } from '../../../components/shared/AudioButton';
import { speakAmharic, speakAndAwait, stopTTS } from '../../../utils/googleTTS';
import { useAudio } from '../../../hooks/useAudio';
import { useAudioInterrupted, resumeInterruptedAudio } from '../../../hooks/useAudioInterrupted';
import vehicleKnowledgeData from '../../../content/vehicle_knowledge_scaffold.json';
import mindSafetyData       from '../../../content/mind_safety_scaffold.json';
import societyLawData       from '../../../content/society_law_scaffold.json';
import theRoadData          from '../../../content/the_road_scaffold.json';
import myVehicleData        from '../../../content/my_vehicle_scaffold.json';
import twoWheelersData      from '../../../content/two_wheelers_scaffold.json';
import roadDecisionsData   from '../../../content/road_decisions_scaffold.json';
import basicsLicenseData    from '../../../content/basics_license_scaffold.json';
import { OfflineBanner } from '../../../components/shared/OfflineBanner';
import { LocationPermissionModal } from '../../../components/shared/LocationPermissionModal';
import { useLocationPrompt } from '../../../hooks/useLocationPrompt';
import { useEngine } from '../../../contexts/EngineContext';
import { countAnsweredQuestion, maybeShowInterstitial } from '../../../services/interstitial';
import { useScreenActive } from '../../../hooks/useScreenActive';

// ─── Types ────────────────────────────────────────────────────────────────────
interface Answer   { text_amharic: string; is_correct: boolean; }
interface Question { question_amharic: string; answers: Answer[]; }
interface Subtopic {
  id: string; name_hebrew: string; name_amharic?: string; icon: string;
  explanation_amharic?: string;
  narration_audio_url?: string;
  image_url?: string;
  image_url_2?: string;
  questions?: Question[];
}
interface Level    { id: string; level: number; name_hebrew: string; color: string; subtopics: Subtopic[]; }
interface Scaffold { topicId: string; levels: Level[]; }

const SCAFFOLD_MAP: Record<string, Scaffold> = {
  vehicle_knowledge: vehicleKnowledgeData as Scaffold,
  mind_safety:       mindSafetyData       as Scaffold,
  society_law:       societyLawData       as Scaffold,
  the_road:          theRoadData          as Scaffold,
  my_vehicle:        myVehicleData        as Scaffold,
  two_wheelers:      twoWheelersData      as Scaffold,
  road_decisions:    roadDecisionsData    as Scaffold,
  basics_license:    basicsLicenseData    as Scaffold,
};

type Phase = 'explanation' | 'questions' | 'complete';

// ─── Amharic number prefixes for answer reading ───────────────────────────────
const AMHARIC_NUMBERS = ['አንድ', 'ሁለት', 'ሶስት', 'አራት'];

// ─── Praise phrases for correct answers (same set as Engine A) ─────────────
// Commit e0b352e (2026-07-27) fixed two pronunciation bugs in this same word
// set for signs (scripts/addPrefixesAndShuffle.mjs + content/signs.json) —
// doubled-letter 'ዋውው' → 'ዋው', wrong-letter 'ጎቨዝ' → 'ጎበዝ' — but never
// applied the fix here. Corrected spellings below are copied from that
// already-fixed script, not newly composed.
const CORRECT_PRAISES = [
  'ትክክል!',
  'አዎ!',
  'አሪፍ!',
  'ጎሽ!',
  'እሰይ!',
  'ዋው!',
  'ጎበዝ!',
  'በጣም ጥሩ!',
  'በጣም አሪፍ!',
  'እንድያ ነው!',
  'እንዲያ ነው!',
  'ዋው በጣም ጥሩ!',
  'እሰይ የኔ ጎበዝ!',
  'ትክክል፥ አቬት እውቀት!',
  'አቬት ችሎታ ትክክል!',
];
const randomPraise = () => CORRECT_PRAISES[Math.floor(Math.random() * CORRECT_PRAISES.length)];

// ─── Component ────────────────────────────────────────────────────────────────
export default function BehavioralSubtopicScreenB() {
  // start=quiz: opened from the ‹ › arrows of a quiz or of the end screen, so it opens on the quiz
  // (the arrows keep the learner in the step they are in; owner's decision 2026-10-27).
  const { id, topicId, levelId, start } = useLocalSearchParams<{
    id: string; topicId: string; levelId: string; start?: string;
  }>();
  const router = useRouter();
  const activeRef = useScreenActive();   // false once the learner has left this screen (ads, R6-4)
  const { userId } = useEngine();
  const {
    visible: locationModalVisible,
    maybeShow: maybeShowLocationPrompt,
    handleApprove: handleLocationApproveBase,
    handleNotNow: handleLocationNotNowBase,
  } = useLocationPrompt(userId);

  // ── Data ──────────────────────────────────────────────────────────────────────
  const scaffold      = SCAFFOLD_MAP[topicId ?? ''];
  const level         = scaffold?.levels.find(l => l.id === levelId);
  const subtopic      = level?.subtopics.find(s => s.id === id);
  const questions     = subtopic?.questions ?? [];
  const allSubtopics  = level?.subtopics ?? [];
  const subtopicIndex = allSubtopics.findIndex(s => s.id === id);
  const prevSubtopic  = subtopicIndex > 0 ? allSubtopics[subtopicIndex - 1] : null;
  const nextSubtopic  = subtopicIndex < allSubtopics.length - 1 ? allSubtopics[subtopicIndex + 1] : null;

  // The Android system bar (3-button or gesture) sits over the bottom of the screen
  // (edge-to-edge): content that ends at the very bottom needs this much room.
  const insets = useSafeAreaInsets();

  // ── State ─────────────────────────────────────────────────────────────────────
  const [phase,          setPhase]          = useState<Phase>(() => (start === 'quiz' && questions.length > 0 ? 'questions' : 'explanation'));
  const [qIndex,         setQIndex]         = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
  const [showFeedback,   setShowFeedback]   = useState(false);
  const [bottomNavHeight, setBottomNavHeight] = useState(0);
  const [feedbackText,   setFeedbackText]   = useState('');
  const [ttsSpeaking,    setTtsSpeaking]    = useState(false);
  const ttsSpeakingRef = useRef(false); // sync ref for use inside async handlers
  const leavingRef = useRef(false);   // handleBack runs once (CODEX round 3, C1)
  // One answer per question: set at the very first tap, BEFORE any state update or await, so two taps (or a tap
  // and the voice answer) before the re-render cannot both count toward the ad (CODEX round 6, R6-1).
  const answerLockedRef = useRef(false);
  const advancingRef = useRef(false);   // the ad can take a while: a second tap must not move on twice
  const audioInterrupted = useAudioInterrupted();   // Android paused our audio (call, other app)

  const currentQ   = questions[qIndex] ?? null;
  const levelColor = level?.color ?? Colors.primary;
  const { stopAudio } = useAudio();

  // Reset answer + TTS state when question index changes
  useEffect(() => {
    answerLockedRef.current = false;
    setSelectedAnswer(null);
    setShowFeedback(false);
    setFeedbackText('');
    ttsSpeakingRef.current = false;
    stopTTS().catch(() => {});
    setTtsSpeaking(false);
  }, [qIndex]);

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

  // ── Handlers ──────────────────────────────────────────────────────────────────
  // Declared BEFORE the 404 early-return so the hooks below always run in the
  // same order on every render (React rules-of-hooks).

  const handleBack = useCallback(async () => {
    if (leavingRef.current) return;   // one exit only: a double tap must not count twice or go back twice
    leavingRef.current = true;
    try {
      ttsSpeakingRef.current = false;   // cancel the read-aloud sequence, not just the current clip
      setTtsSpeaking(false);
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
  }, [stopAudio, router, phase]);

  // Android hardware back button must stop the audio too. Without this the screen simply
  // unmounts while the narration keeps playing: the useAudio sound lives in a module-level
  // singleton that deliberately survives unmount (another screen may own it), and the
  // unmount cleanup above only stops TTS. The press itself keeps its normal Android
  // behaviour (one screen back, however fast it is pressed): this only stops the audio
  // first and lets it carry on (returns false = not handled here). Mirrors Engine A.
  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        ttsSpeakingRef.current = false;
        setTtsSpeaking(false);
        stopAudio().catch(() => {});
        stopTTS().catch(() => {});
        return false;
      });
      return () => sub.remove();
    }, [stopAudio])
  );

  // ── 404 fallback ──────────────────────────────────────────────────────────────
  if (!subtopic || !level) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.center}>
          <Text style={{ fontSize: 64 }}>🚧</Text>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
            <Text style={styles.backIcon}>←</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const handleStartQuiz = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await stopAudio();  // stop narration audio before entering questions
    setPhase(questions.length === 0 ? 'complete' : 'questions');
  };

  const handleLocationApprove = () => {
    handleLocationApproveBase();
    setPhase('complete');
  };

  const handleLocationNotNow = () => {
    handleLocationNotNowBase();
    setPhase('complete');
  };

  const handleAnswerSelect = async (answerIndex: number) => {
    if (selectedAnswer !== null) return;
    if (!currentQ) return;
    if (!currentQ.answers[answerIndex]) return;
    if (answerLockedRef.current) return;
    answerLockedRef.current = true;

    // Stop TTS immediately — user already read the question. Nothing is awaited before the answer is shown:
    // an await here left a moment in which a ‹ tap showed this feedback on the previous question (QA round 8, N5).
    ttsSpeakingRef.current = false;
    setTtsSpeaking(false);
    stopTTS().catch(() => {});

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setSelectedAnswer(answerIndex);
    countAnsweredQuestion();   // counts toward the next full-screen ad (services/interstitial.ts)

    // Build feedback text once (same pattern as Engine A + signs)
    const selected    = currentQ.answers[answerIndex];
    const correctText = currentQ.answers.find(a => a.is_correct)?.text_amharic ?? '';
    setFeedbackText(
      selected?.is_correct
        ? `${randomPraise()} ${correctText}`
        : `ስህተት! ትክክለኛው መልስ: ${correctText}`
    );

    setShowFeedback(true);   // at once: the Next button must already be there when the learner reaches for it
  };

  // The step between "answer given" and "next question": the feedback is closed and its speech stopped FIRST
  // (nothing may speak during an ad), then the due full-screen ad runs (services/interstitial.ts), and only if
  // the learner is still on this screen does the move go on. Returns false when the screen was left meanwhile.
  const passAdGate = async (): Promise<boolean> => {
    setShowFeedback(false);
    ttsSpeakingRef.current = false;
    setTtsSpeaking(false);
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
      const isLast = qIndex >= questions.length - 1;
      if (isLast && !(await passAdGate())) return;
      setShowFeedback(false);
      setSelectedAnswer(null);
      setFeedbackText('');
      if (!isLast) { setQIndex(q => q + 1); return; }
      // Just finished the last question — the "delighted moment" for the
      // location-permission primer, then complete.
      const shown = await maybeShowLocationPrompt(() => activeRef.current);
      if (!activeRef.current) return;   // left the screen during the preferences read: no old move on
      if (!shown) setPhase('complete');
    } finally {
      advancingRef.current = false;
    }
  };

  // Question navigation (prev/next within same subtopic)
  const canGoPrevQ = qIndex > 0;
  const canGoNextQ = selectedAnswer !== null && qIndex < questions.length - 1;

  const handlePrevQuestion = useCallback(() => {
    if (!canGoPrevQ) return;
    Haptics.selectionAsync();
    setQIndex(q => q - 1);
  }, [canGoPrevQ]);

  // The › arrow after an answer (never shows an ad: only the end of a quiz does).
  const handleNextQuestion = async () => {
    if (!canGoNextQ || advancingRef.current) return;
    advancingRef.current = true;
    try {
      Haptics.selectionAsync();
      setShowFeedback(false);
      setQIndex(q => q + 1);
    } finally {
      advancingRef.current = false;
    }
  };

  // Subtopic navigation
  const navToSubtopic = async (sub: typeof prevSubtopic) => {
    if (!sub) return;
    Haptics.selectionAsync();
    ttsSpeakingRef.current = false;   // cancel the read-aloud sequence, not just the current clip
    setTtsSpeaking(false);
    await stopAudio();
    await stopTTS().catch(() => {});
    // From the lesson the arrows open the next lesson; from the quiz or the end screen, the next quiz.
    const toQuiz = phase !== 'explanation' ? '&start=quiz' : '';
    router.replace(
      `/(engineB)/behavioral-subtopic/${sub.id}?topicId=${topicId}&levelId=${levelId}${toQuiz}` as any
    );
  };

  // Answer card state
  const getCardState = (idx: number) => {
    if (selectedAnswer === null) return 'default' as const;
    const isThisCorrect = currentQ?.answers[idx]?.is_correct ?? false;
    if (idx === selectedAnswer) return isThisCorrect ? 'correct' as const : 'wrong' as const;
    if (isThisCorrect) return 'correct' as const;
    return 'default' as const;
  };

  const isCorrect = selectedAnswer !== null && (currentQ?.answers[selectedAnswer]?.is_correct ?? false);

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.safeArea}>
      <OfflineBanner />
      <LocationPermissionModal
        visible={locationModalVisible}
        onApprove={handleLocationApprove}
        onNotNow={handleLocationNotNow}
      />

      {/* ════════════════════ PHASE: EXPLANATION ════════════════════ */}
      {phase === 'explanation' && (
        <ScrollView
          contentContainerStyle={[styles.explainContent, { paddingBottom: 16 + insets.bottom + 12 }]}
          showsVerticalScrollIndicator={false}
        >
          {/* Back — left-aligned like every other topic screen, and given a
              stronger outline/shadow so it reads clearly against the page. */}
          <TouchableOpacity
            style={styles.backBtnProminent}
            onPress={handleBack}
            accessibilityLabel={UiStrings.a11yBack}
            activeOpacity={0.8}
          >
            <Text style={styles.backIconProminent}>←</Text>
          </TouchableOpacity>

          {/* Image / icon — dual layout when image_url_2 exists */}
          <View style={styles.explainImageWrap}>
            {subtopic.image_url && subtopic.image_url_2 ? (
              <View style={styles.dualImageRow}>
                <View style={styles.dualImageCell}>
                  <Image source={{ uri: subtopic.image_url }} style={styles.dualImage} resizeMode="contain" />
                  <Text style={styles.dualImageLabel}>አውቶማቲክ</Text>
                </View>
                <View style={styles.dualImageCell}>
                  <Image source={{ uri: subtopic.image_url_2 }} style={styles.dualImage} resizeMode="contain" />
                  <Text style={styles.dualImageLabel}>ማኑዋል</Text>
                </View>
              </View>
            ) : subtopic.image_url ? (
              <Image source={{ uri: subtopic.image_url }} style={styles.explainImage} resizeMode="contain" />
            ) : (
              <View style={styles.explainImagePlaceholder}>
                <Text style={{ fontSize: 80 }}>{subtopic.icon}</Text>
              </View>
            )}
          </View>

          {/* Narration audio button — above the text so it's reachable without scrolling */}
          {subtopic.narration_audio_url ? (
            <View style={styles.explainAudioRow}>
              <AudioButton
                audioUri={subtopic.narration_audio_url}
                size={64}
                label="ማብራሪያ ድምጽ"
              />
            </View>
          ) : null}

          {/* Explanation text */}
          {subtopic.explanation_amharic ? (
            <View style={[styles.explainBox, { borderLeftColor: levelColor }]}>
              <Text style={styles.explainText}>{subtopic.explanation_amharic}</Text>
            </View>
          ) : null}


          {/* Go to quiz */}
          <TouchableOpacity
            style={[styles.continueBtn, { backgroundColor: levelColor }]}
            onPress={handleStartQuiz}
            activeOpacity={0.85}
          >
            <Text style={styles.continueBtnText}>ወደ ጥያቄዎች ›</Text>
          </TouchableOpacity>
        </ScrollView>
      )}

      {/* ════════════════════ PHASE: QUESTIONS ════════════════════ */}
      {phase === 'questions' && currentQ && (
        <>
          {/* ── Header: ← | ● ● ● | N/total ── */}
          <View style={styles.header}>
            <TouchableOpacity style={styles.backBtn} onPress={handleBack}>
              <Text style={styles.backIcon}>←</Text>
            </TouchableOpacity>

            <View style={styles.dotsRow}>
              {questions.map((_, i) => (
                <View
                  key={i}
                  style={[styles.dot, i === qIndex && styles.dotActive]}
                />
              ))}
            </View>

            <Text style={styles.counter}>
              {qIndex + 1}/{questions.length}
            </Text>
          </View>

          {/* ── Scrollable content ── */}
          <ScrollView
            contentContainerStyle={styles.questionContent}
            showsVerticalScrollIndicator={false}
            scrollEnabled={!showFeedback}
          >
            {/* Small subtopic image / icon */}
            <View style={styles.thumbWrap}>
              {subtopic.image_url ? (
                <Image source={{ uri: subtopic.image_url }} style={styles.thumbImage} resizeMode="contain" />
              ) : (
                <View style={[styles.thumbWrap, styles.thumbPlaceholder]}>
                  <Text style={{ fontSize: 52 }}>{subtopic.icon}</Text>
                </View>
              )}
            </View>

            {/* Question text + TTS button — button first, reachable without scrolling */}
            <View style={styles.questionBox}>
              <TouchableOpacity
                style={styles.ttsPlayBtn}
                onPress={async () => {
                  // Android paused the sentence (call, another app): ▶️ continues it.
                  if (ttsSpeakingRef.current && audioInterrupted) { resumeInterruptedAudio(); return; }
                  if (ttsSpeakingRef.current) {
                    // ⏸ pressed — stop immediately
                    ttsSpeakingRef.current = false;
                    setTtsSpeaking(false);
                    await stopTTS();
                  } else {
                    // ▶️ pressed — read question then all answers in sequence
                    ttsSpeakingRef.current = true;
                    setTtsSpeaking(true);

                    // `heard` gates the loop: speakAndAwait returns false when
                    // nothing was actually spoken (offline with no cached
                    // rendering). Without this the loop runs through every
                    // answer in milliseconds in total silence.
                    let heard = await speakAndAwait(currentQ.question_amharic);

                    for (let i = 0; heard && i < currentQ.answers.length; i++) {
                      if (!ttsSpeakingRef.current) break;
                      heard = await speakAndAwait(`${AMHARIC_NUMBERS[i]}። ${currentQ.answers[i].text_amharic}`);
                    }

                    ttsSpeakingRef.current = false;
                    setTtsSpeaking(false);
                  }
                }}
                accessibilityLabel="ጥያቄ ድምጽ"
              >
                <Text style={styles.ttsPlayIcon}>{ttsSpeaking && !audioInterrupted ? '⏸' : '▶️'}</Text>
              </TouchableOpacity>
              <Text style={styles.questionText}>{currentQ.question_amharic}</Text>
            </View>

            {/* Answer cards */}
            <View style={styles.answersContainer}>
              {currentQ.answers.map((answer, idx) => (
                <TextAnswerCard
                  key={idx}
                  answerId={String(idx + 1)}
                  text={answer.text_amharic}
                  cardState={getCardState(idx)}
                  onPress={() => handleAnswerSelect(idx)}
                  disabled={selectedAnswer !== null}
                />
              ))}
            </View>
          </ScrollView>

          {/* Feedback overlay */}
          {showFeedback && (
            <TextFeedback
              isCorrect={isCorrect}
              explanationText={feedbackText}
              ttsText={feedbackText}
              ragQuery={!isCorrect && currentQ && selectedAnswer !== null ? {
                question:      currentQ.question_amharic,
                wrongAnswer:   currentQ.answers[selectedAnswer]?.text_amharic ?? '',
                correctAnswer: currentQ.answers.find((a: any) => a.is_correct)?.text_amharic ?? '',
              } : undefined}
              bottomOffset={bottomNavHeight}
              onNext={handleNext}
            />
          )}

          {/* ── Bottom navigation ── */}
          <View
            style={[styles.bottomNav, { paddingBottom: 16 + insets.bottom }]}
            onLayout={(e) => setBottomNavHeight(e.nativeEvent.layout.height)}
          >

            {/* Row 1 — Question navigation */}
            <View style={styles.questionNavRow}>
              <TouchableOpacity
                style={[styles.qNavBtn, !canGoPrevQ && styles.navBtnDisabled]}
                onPress={handlePrevQuestion}
                disabled={!canGoPrevQ}
              >
                <Text style={[styles.qNavArrow, !canGoPrevQ && styles.navArrowDisabled]}>‹</Text>
              </TouchableOpacity>

              <View style={styles.qNavLabels}>
                <Text style={[styles.qNavLabel, !canGoPrevQ && styles.qNavLabelDisabled]}>
                  ቀዳሚ ጥያቄ
                </Text>
                <Text style={[styles.qNavLabel, styles.qNavLabelRight, !canGoNextQ && styles.qNavLabelDisabled]}>
                  ቀጣይ ጥያቄ
                </Text>
              </View>

              <TouchableOpacity
                style={[styles.qNavBtn, !canGoNextQ && styles.navBtnDisabled]}
                onPress={handleNextQuestion}
                disabled={!canGoNextQ}
              >
                <Text style={[styles.qNavArrow, !canGoNextQ && styles.navArrowDisabled]}>›</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.navDivider} />

            {/* Row 2 — Subtopic navigation */}
            <View style={styles.signNavRow}>
              <TouchableOpacity
                style={[styles.signNavBtn, !prevSubtopic && styles.navBtnDisabled]}
                onPress={() => navToSubtopic(prevSubtopic)}
                disabled={!prevSubtopic}
              >
                <Text style={[styles.signNavArrow, !prevSubtopic && styles.navArrowDisabled]}>‹</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.signThumbBtn} onPress={handleBack}>
                {subtopic.image_url ? (
                  <Image source={{ uri: subtopic.image_url }} style={styles.signThumb} resizeMode="contain" />
                ) : (
                  <Text style={{ fontSize: 36 }}>{subtopic.icon}</Text>
                )}
                <Text style={styles.signThumbLabel}>{UiStrings.topicLabel}</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.signNavBtn, !nextSubtopic && styles.navBtnDisabled]}
                onPress={() => navToSubtopic(nextSubtopic)}
                disabled={!nextSubtopic}
              >
                <Text style={[styles.signNavArrow, !nextSubtopic && styles.navArrowDisabled]}>›</Text>
              </TouchableOpacity>
            </View>

          </View>
        </>
      )}

      {/* ════════════════════ PHASE: COMPLETE ════════════════════ */}
      {phase === 'complete' && (
        <View style={styles.center}>
          <Text style={{ fontSize: 80 }}>✅</Text>
          <Text style={[styles.completeTitle, { color: levelColor, paddingHorizontal: 24 }]}>
            {subtopic.name_amharic || subtopic.name_hebrew}
          </Text>
          {/* ‹ previous subtopic | ← back to the list | › next subtopic (same arrows as the lesson screen) */}
          <View style={styles.completeNavRow}>
            <TouchableOpacity
              style={[styles.signNavBtn, !prevSubtopic && styles.navBtnDisabled]}
              onPress={() => navToSubtopic(prevSubtopic)}
              disabled={!prevSubtopic}
            >
              <Text style={[styles.signNavArrow, !prevSubtopic && styles.navArrowDisabled]}>‹</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.completeBackBtn, { backgroundColor: levelColor }]}
              onPress={handleBack}
              activeOpacity={0.85}
              accessibilityLabel={UiStrings.backToList}
            >
              <Text style={styles.completeBackIcon}>←</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.signNavBtn, !nextSubtopic && styles.navBtnDisabled]}
              onPress={() => navToSubtopic(nextSubtopic)}
              disabled={!nextSubtopic}
            >
              <Text style={[styles.signNavArrow, !nextSubtopic && styles.navArrowDisabled]}>›</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#f7f9fb' },
  center:   { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 24 },

  backBtn: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: '#ffffff',
    justifyContent: 'center', alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.10, shadowRadius: 6, elevation: 3,
  },
  backIcon: { fontSize: 22, color: '#191c1e' },

  // Explanation-phase back button — same left position as every other topic
  // screen (alignSelf overrides the parent's alignItems:'center'), plus a
  // larger tap target, coloured outline and deeper shadow so it stands out.
  backBtnProminent: {
    width: 54, height: 54, borderRadius: 27,
    backgroundColor: '#ffffff',
    justifyContent: 'center', alignItems: 'center',
    alignSelf: 'flex-start',
    borderWidth: 2,
    // Fixed color everywhere in the app (not per-topic) — same reasoning as
    // every other screen's back button.
    borderColor: Colors.backButtonAccent,
    shadowColor: '#000', shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.20, shadowRadius: 8, elevation: 6,
  },
  backIconProminent: { fontSize: 28, fontWeight: '700', lineHeight: 32, color: Colors.backButtonAccent },

  // ── Explanation phase ────────────────────────────────────────────────────────
  explainContent: {
    padding: 16, gap: 20, alignItems: 'center',
  },
  explainImageWrap: {
    width: '100%', aspectRatio: 1,
    borderRadius: 20, overflow: 'hidden',
    backgroundColor: '#ffffff',
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.10, shadowRadius: 12, elevation: 5,
  },
  explainImage:            { width: '100%', height: '100%' },
  explainImagePlaceholder: {
    flex: 1, justifyContent: 'center', alignItems: 'center',
    backgroundColor: '#f0f4f8',
  },
  // ── Dual image layout (when image_url_2 exists) ─────────────────────────────
  dualImageRow:  { flex: 1, flexDirection: 'row' },
  dualImageCell: { flex: 1, flexDirection: 'column', alignItems: 'center' },
  dualImage:     { flex: 1, width: '100%' },
  dualImageLabel: {
    fontSize: 12, color: '#404943',
    textAlign: 'center', paddingBottom: 6, fontWeight: '600',
  },

  explainBox: {
    alignSelf: 'stretch',
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 16,
    borderLeftWidth: 4,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08, shadowRadius: 6, elevation: 3,
  },
  explainText: {
    ...Typography.body,
    color: '#191c1e',
    lineHeight: 30,
  },
  explainAudioRow: { alignItems: 'center' },
  continueBtn: {
    alignSelf: 'stretch',
    borderRadius: 16,
    paddingVertical: 18,
    alignItems: 'center',
  },
  continueBtnText: {
    ...Typography.answer,
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 17,
  },
  completeTitle: {
    ...Typography.h2,
    textAlign: 'center',
  },

  // ── Questions phase — header ─────────────────────────────────────────────────
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: '#eee',
    gap: 8,
  },
  dotsRow: {
    flex: 1, flexDirection: 'row',
    alignItems: 'center', justifyContent: 'center', gap: 10,
  },
  dot:      { width: 10, height: 10, borderRadius: 5, backgroundColor: '#e0e0e0' },
  dotActive: { backgroundColor: '#2E7D32', width: 14, height: 14, borderRadius: 7 },
  counter: {
    ...Typography.body,
    color: '#404943',
    fontWeight: '600',
    minWidth: 36,
    textAlign: 'right',
  },

  // ── Questions phase — content ────────────────────────────────────────────────
  questionContent: {
    padding: 16, gap: 14, alignItems: 'center',
    paddingBottom: 24,
  },
  thumbWrap: {
    width: 220, height: 220,
    borderRadius: 16, overflow: 'hidden',
    backgroundColor: '#ffffff',
  },
  thumbPlaceholder: {
    justifyContent: 'center', alignItems: 'center',
    backgroundColor: '#f0f4f8',
  },
  thumbImage: { width: 220, height: 220, backgroundColor: '#ffffff' },

  questionBox: {
    alignSelf: 'stretch',
    backgroundColor: '#ffffff',
    borderRadius: 16, padding: 16,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08, shadowRadius: 6, elevation: 3,
  },
  questionText: {
    ...Typography.question,
    color: '#191c1e',
    flex: 1,
  },
  ttsBtn: {
    width: 44, height: 44, borderRadius: 22,
    justifyContent: 'center', alignItems: 'center',
  },
  ttsPlayBtn: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: '#FDD835',
    justifyContent: 'center', alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  ttsPlayIcon: { fontSize: 20, textAlign: 'center' },
  answersContainer: { alignSelf: 'stretch', gap: 10 },

  // ── Bottom navigation ────────────────────────────────────────────────────────
  bottomNav: {
    borderTopWidth: 1,
    borderTopColor: '#eee',
    backgroundColor: '#f7f9fb',
    paddingBottom: Platform.OS === 'android' ? 16 : 8,
  },
  navDivider: { height: 1, backgroundColor: '#eee', marginHorizontal: 20 },

  // Row 1 — Question nav
  questionNavRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 12, paddingVertical: 10, gap: 8,
  },
  qNavBtn: {
    width: 52, height: 52, borderRadius: 26,
    backgroundColor: '#2E7D32',
    justifyContent: 'center', alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3, shadowRadius: 4, elevation: 4,
  },
  qNavArrow: {
    fontSize: 28, color: '#ffffff',
    fontWeight: '700', lineHeight: 34,
  },
  qNavLabels: {
    flex: 1, flexDirection: 'row',
    justifyContent: 'space-between', paddingHorizontal: 4,
  },
  qNavLabel:        { ...Typography.bodySmall, color: '#191c1e', fontWeight: '700' },
  qNavLabelRight:   { textAlign: 'right' },
  qNavLabelDisabled: { opacity: 0.3 },

  // Row 2 — Subtopic nav
  signNavRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 12, paddingVertical: 8, gap: 8,
  },
  signNavBtn: {
    width: 52, height: 52, borderRadius: 26,
    backgroundColor: '#ffffff',
    borderWidth: 1, borderColor: '#dde3ea',
    justifyContent: 'center', alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08, shadowRadius: 4, elevation: 2,
  },
  signNavArrow: {
    fontSize: 30, color: '#1565C0',
    fontWeight: '300', lineHeight: 36,
  },
  signThumbBtn:  { flex: 1, alignItems: 'center', gap: 4 },
  signThumb: {
    width: 52, height: 52, borderRadius: 12,
    backgroundColor: '#ffffff',
  },
  signThumbLabel: { ...Typography.caption, color: '#404943', fontSize: 11 },

  // Shared disabled
  navBtnDisabled:   { opacity: 0.25 },
  completeNavRow:   { flexDirection: 'row', alignItems: 'center', gap: 20 },
  completeBackBtn:  { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center' },
  completeBackIcon: { fontSize: 36, color: '#FFFFFF', lineHeight: 42 },
  navArrowDisabled: { color: '#9e9e9e' },
});
