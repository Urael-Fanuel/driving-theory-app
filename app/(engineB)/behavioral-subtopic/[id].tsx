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
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  Platform,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Colors } from '../../../constants/colors';
import { Typography } from '../../../constants/typography';
import { TextAnswerCard } from '../../../components/engineB/TextAnswerCard';
import { TextFeedback } from '../../../components/engineB/TextFeedback';
import { AudioButton } from '../../../components/shared/AudioButton';
import { speakAmharic, speakAndAwait, stopTTS } from '../../../utils/googleTTS';
import { useAudio } from '../../../hooks/useAudio';
import vehicleKnowledgeData from '../../../content/vehicle_knowledge_scaffold.json';
import mindSafetyData       from '../../../content/mind_safety_scaffold.json';

// ─── Types ────────────────────────────────────────────────────────────────────
interface Answer   { text_amharic: string; is_correct: boolean; }
interface Question { question_amharic: string; answers: Answer[]; }
interface Subtopic {
  id: string; name_hebrew: string; icon: string;
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
};

type Phase = 'explanation' | 'questions' | 'complete';

// ─── Amharic number prefixes for answer reading ───────────────────────────────
const AMHARIC_NUMBERS = ['አንድ', 'ሁለት', 'ሶስት', 'አራት'];

// ─── Praise phrases for correct answers (same set as Engine A) ─────────────
const CORRECT_PRAISES = [
  'ትክክል!',
  'አዎ!',
  'አሪፍ!',
  'ጎሽ!',
  'እሰይ!',
  'ዋውው!',
  'ጎቨዝ!',
  'በጣም ጥሩ!',
  'በጣም አሪፍ!',
  'እንድያ ነው!',
  'እንዲያ ነው!',
  'ዋውው በጣም ጥሩ!',
  'እሰይ የኔ ጎቨዝ!',
  'ትክክል፥ አቬት እውቀት!',
  'አቬት ችሎታ ትክክል!',
];
const randomPraise = () => CORRECT_PRAISES[Math.floor(Math.random() * CORRECT_PRAISES.length)];

// ─── Component ────────────────────────────────────────────────────────────────
export default function BehavioralSubtopicScreenB() {
  const { id, topicId, levelId } = useLocalSearchParams<{
    id: string; topicId: string; levelId: string;
  }>();
  const router = useRouter();

  // ── Data ──────────────────────────────────────────────────────────────────────
  const scaffold      = SCAFFOLD_MAP[topicId ?? ''];
  const level         = scaffold?.levels.find(l => l.id === levelId);
  const subtopic      = level?.subtopics.find(s => s.id === id);
  const questions     = subtopic?.questions ?? [];
  const allSubtopics  = level?.subtopics ?? [];
  const subtopicIndex = allSubtopics.findIndex(s => s.id === id);
  const prevSubtopic  = subtopicIndex > 0 ? allSubtopics[subtopicIndex - 1] : null;
  const nextSubtopic  = subtopicIndex < allSubtopics.length - 1 ? allSubtopics[subtopicIndex + 1] : null;

  // ── State ─────────────────────────────────────────────────────────────────────
  const [phase,          setPhase]          = useState<Phase>('explanation');
  const [qIndex,         setQIndex]         = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
  const [showFeedback,   setShowFeedback]   = useState(false);
  const [feedbackText,   setFeedbackText]   = useState('');
  const [ttsSpeaking,    setTtsSpeaking]    = useState(false);
  const ttsSpeakingRef = useRef(false); // sync ref for use inside async handlers

  const currentQ   = questions[qIndex] ?? null;
  const levelColor = level?.color ?? Colors.primary;
  const { stopAudio } = useAudio();

  // Reset answer + TTS state when question index changes
  useEffect(() => {
    setSelectedAnswer(null);
    setShowFeedback(false);
    setFeedbackText('');
    ttsSpeakingRef.current = false;
    stopTTS().catch(() => {});
    setTtsSpeaking(false);
  }, [qIndex]);

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

  // ── Handlers ──────────────────────────────────────────────────────────────────

  const handleStartQuiz = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    stopAudio();  // stop narration audio before entering questions
    if (questions.length > 0) setPhase('questions');
    else setPhase('complete');
  };

  const handleAnswerSelect = async (answerIndex: number) => {
    if (selectedAnswer !== null) return;
    if (!currentQ) return;

    // Stop TTS immediately — user already read the question
    ttsSpeakingRef.current = false;
    setTtsSpeaking(false);
    await stopTTS();

    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedAnswer(answerIndex);

    // Build feedback text once (same pattern as Engine A + signs)
    const selected    = currentQ.answers[answerIndex];
    const correctText = currentQ.answers.find(a => a.is_correct)?.text_amharic ?? '';
    setFeedbackText(
      selected?.is_correct
        ? `${randomPraise()} ${correctText}`
        : `ስህተት! ትክክለኛው መልስ: ${correctText}`
    );

    setTimeout(() => setShowFeedback(true), 200);
  };

  const handleNext = () => {
    setShowFeedback(false);
    setSelectedAnswer(null);
    setFeedbackText('');
    if (qIndex < questions.length - 1) setQIndex(q => q + 1);
    else setPhase('complete');
  };

  // Question navigation (prev/next within same subtopic)
  const canGoPrevQ = qIndex > 0;
  const canGoNextQ = selectedAnswer !== null && qIndex < questions.length - 1;

  const handlePrevQuestion = useCallback(() => {
    if (!canGoPrevQ) return;
    Haptics.selectionAsync();
    setQIndex(q => q - 1);
  }, [canGoPrevQ]);

  const handleNextQuestion = useCallback(() => {
    if (!canGoNextQ) return;
    Haptics.selectionAsync();
    setQIndex(q => q + 1);
  }, [canGoNextQ]);

  // Subtopic navigation
  const navToSubtopic = (sub: typeof prevSubtopic) => {
    if (!sub) return;
    Haptics.selectionAsync();
    router.replace(
      `/(engineB)/behavioral-subtopic/${sub.id}?topicId=${topicId}&levelId=${levelId}` as any
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

      {/* ════════════════════ PHASE: EXPLANATION ════════════════════ */}
      {phase === 'explanation' && (
        <ScrollView
          contentContainerStyle={styles.explainContent}
          showsVerticalScrollIndicator={false}
        >
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
            <Text style={styles.backIcon}>←</Text>
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

          {/* Explanation text */}
          {subtopic.explanation_amharic ? (
            <View style={[styles.explainBox, { borderLeftColor: levelColor }]}>
              <Text style={styles.explainText}>{subtopic.explanation_amharic}</Text>
            </View>
          ) : null}

          {/* Narration audio button */}
          {subtopic.narration_audio_url ? (
            <View style={styles.explainAudioRow}>
              <AudioButton
                audioUri={subtopic.narration_audio_url}
                size={64}
                label="ማብራሪያ ድምጽ"
              />
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
            <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
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

            {/* Question text + TTS button */}
            <View style={styles.questionBox}>
              <Text style={styles.questionText}>{currentQ.question_amharic}</Text>
              <TouchableOpacity
                style={styles.ttsPlayBtn}
                onPress={async () => {
                  if (ttsSpeakingRef.current) {
                    // ⏸ pressed — stop immediately
                    ttsSpeakingRef.current = false;
                    setTtsSpeaking(false);
                    await stopTTS();
                  } else {
                    // ▶️ pressed — read question then all answers in sequence
                    ttsSpeakingRef.current = true;
                    setTtsSpeaking(true);

                    await speakAndAwait(currentQ.question_amharic);

                    for (let i = 0; i < currentQ.answers.length; i++) {
                      if (!ttsSpeakingRef.current) break;
                      await speakAndAwait(`${AMHARIC_NUMBERS[i]}። ${currentQ.answers[i].text_amharic}`);
                    }

                    ttsSpeakingRef.current = false;
                    setTtsSpeaking(false);
                  }
                }}
                accessibilityLabel="ጥያቄ ድምጽ"
              >
                <Text style={styles.ttsPlayIcon}>{ttsSpeaking ? '⏸' : '▶️'}</Text>
              </TouchableOpacity>
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
              onNext={handleNext}
            />
          )}

          {/* ── Bottom navigation ── */}
          <View style={styles.bottomNav}>

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

              <TouchableOpacity style={styles.signThumbBtn} onPress={() => router.back()}>
                {subtopic.image_url ? (
                  <Image source={{ uri: subtopic.image_url }} style={styles.signThumb} resizeMode="contain" />
                ) : (
                  <Text style={{ fontSize: 36 }}>{subtopic.icon}</Text>
                )}
                <Text style={styles.signThumbLabel}>נושא</Text>
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
          <Text style={[styles.completeTitle, { color: levelColor }]}>
            {subtopic.name_hebrew}
          </Text>
          <TouchableOpacity
            style={[styles.continueBtn, { backgroundColor: levelColor, paddingHorizontal: 32 }]}
            onPress={() => router.back()}
            activeOpacity={0.85}
          >
            <Text style={styles.continueBtnText}>← חזור לרשימה</Text>
          </TouchableOpacity>
        </View>
      )}

    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: Colors.background },
  center:   { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 24 },

  backBtn: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: Colors.card,
    justifyContent: 'center', alignItems: 'center',
  },
  backIcon: { fontSize: 22, color: Colors.textPrimary },

  // ── Explanation phase ────────────────────────────────────────────────────────
  explainContent: {
    padding: 16, gap: 20, alignItems: 'center',
  },
  explainImageWrap: {
    width: '100%', aspectRatio: 1,
    borderRadius: 16, overflow: 'hidden',
    backgroundColor: '#FFFFFF',
  },
  explainImage:       { width: '100%', height: '100%' },
  explainImagePlaceholder: {
    flex: 1, justifyContent: 'center', alignItems: 'center',
    backgroundColor: Colors.surface,
  },
  // ── Dual image layout (when image_url_2 exists) ─────────────────────────────
  dualImageRow: {
    flex: 1, flexDirection: 'row',
  },
  dualImageCell: {
    flex: 1, flexDirection: 'column', alignItems: 'center',
  },
  dualImage: {
    flex: 1, width: '100%',
  },
  dualImageLabel: {
    fontSize: 12, color: Colors.textSecondary,
    textAlign: 'center', paddingBottom: 6, fontWeight: '600',
  },

  explainBox: {
    alignSelf: 'stretch',
    backgroundColor: Colors.card,
    borderRadius: 14,
    padding: 16,
    borderLeftWidth: 4,
  },
  explainText: {
    ...Typography.body,
    color: Colors.textPrimary,
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
    borderBottomWidth: 1, borderBottomColor: Colors.border,
    gap: 8,
  },
  dotsRow: {
    flex: 1, flexDirection: 'row',
    alignItems: 'center', justifyContent: 'center', gap: 10,
  },
  dot: {
    width: 10, height: 10, borderRadius: 5,
    backgroundColor: Colors.border,
  },
  dotActive: {
    backgroundColor: Colors.primary,
    width: 14, height: 14, borderRadius: 7,
  },
  counter: {
    ...Typography.body,
    color: Colors.textSecondary,
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
    width: 110, height: 110,
    borderRadius: 16, overflow: 'hidden',
    backgroundColor: '#FFFFFF',
  },
  thumbPlaceholder: {
    justifyContent: 'center', alignItems: 'center',
    backgroundColor: Colors.card,
  },
  thumbImage: { width: 110, height: 110, backgroundColor: '#FFFFFF' },

  questionBox: {
    alignSelf: 'stretch',
    backgroundColor: Colors.card,
    borderRadius: 16, padding: 16,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  questionText: {
    ...Typography.question,
    color: Colors.textPrimary,
    flex: 1,
  },
  ttsBtn: {
    width: 44, height: 44, borderRadius: 22,
    justifyContent: 'center', alignItems: 'center',
  },
  ttsPlayBtn: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: Colors.secondary,
    justifyContent: 'center', alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  ttsPlayIcon: {
    fontSize: 20,
    textAlign: 'center',
  },
  answersContainer: { alignSelf: 'stretch', gap: 10 },

  // ── Bottom navigation ────────────────────────────────────────────────────────
  bottomNav: {
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    backgroundColor: Colors.background,
    paddingBottom: Platform.OS === 'android' ? 16 : 8,
  },
  navDivider: {
    height: 1,
    backgroundColor: Colors.border,
    marginHorizontal: 20,
  },

  // Row 1 — Question nav
  questionNavRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 12, paddingVertical: 10, gap: 8,
  },
  qNavBtn: {
    width: 52, height: 52, borderRadius: 26,
    backgroundColor: Colors.primary,
    justifyContent: 'center', alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4, shadowRadius: 4, elevation: 4,
  },
  qNavArrow: {
    fontSize: 28, color: Colors.textPrimary,
    fontWeight: '700', lineHeight: 34,
  },
  qNavLabels: {
    flex: 1, flexDirection: 'row',
    justifyContent: 'space-between', paddingHorizontal: 4,
  },
  qNavLabel: {
    ...Typography.bodySmall,
    color: Colors.textPrimary, fontWeight: '700',
  },
  qNavLabelRight: { textAlign: 'right' },
  qNavLabelDisabled: { opacity: 0.3 },

  // Row 2 — Subtopic nav
  signNavRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 12, paddingVertical: 8, gap: 8,
  },
  signNavBtn: {
    width: 52, height: 52, borderRadius: 26,
    backgroundColor: Colors.cardActive,
    borderWidth: 1, borderColor: Colors.border,
    justifyContent: 'center', alignItems: 'center',
  },
  signNavArrow: {
    fontSize: 30, color: Colors.textPrimary,
    fontWeight: '300', lineHeight: 36,
  },
  signThumbBtn: {
    flex: 1, alignItems: 'center', gap: 4,
  },
  signThumb: {
    width: 52, height: 52, borderRadius: 12,
    backgroundColor: '#FFFFFF',
  },
  signThumbLabel: {
    ...Typography.caption,
    color: Colors.textSecondary, fontSize: 11,
  },

  // Shared disabled
  navBtnDisabled:    { opacity: 0.25 },
  navArrowDisabled:  { color: Colors.textSecondary },
});
