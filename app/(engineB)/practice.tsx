/**
 * app/(engineB)/practice.tsx
 * Engine B — Weak-Area Practice Screen.
 *
 * Shows only the questions the user got wrong in the last exam.
 * Same UX as exam.tsx (text answers, Amharic text, audio optional).
 * Answered correctly → removed from pool.
 * Answered wrong     → pushed to end of queue.
 * Session ends when all questions answered correctly at least once.
 */

import React, { useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  Image,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Colors } from '../../constants/colors';
import { Typography } from '../../constants/typography';
import { LoadingScreen } from '../../components/shared/LoadingScreen';
import { TextAnswerCard } from '../../components/engineB/TextAnswerCard';
import { TextFeedback } from '../../components/engineB/TextFeedback';
import { AudioButton } from '../../components/shared/AudioButton';
import { ProgressBar } from '../../components/shared/ProgressBar';
import { usePracticeWeak } from '../../hooks/usePracticeWeak';
import { OfflineBanner } from '../../components/shared/OfflineBanner';
import * as api from '../../backend/api';
import { DBSign } from '../../backend/supabaseClient';
import { extractSignNumber, shouldShowSignBadge } from '../../utils/signNumber';

// ─── Component ────────────────────────────────────────────────────────────────

export default function EngineBPracticeScreen() {
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

  const [showFeedback, setShowFeedback] = React.useState(false);
  const [signs,        setSigns]        = React.useState<DBSign[]>([]);

  // Load all signs once on mount (for displaying sign image per question) —
  // same pattern as exam.tsx. Without this, currentSign is always null, so
  // neither the sign image nor the behavioral question image ever rendered
  // here at all (this screen previously showed no image whatsoever).
  useEffect(() => {
    api.getAllSigns().then(setSigns).catch(() => {});
  }, []);

  const currentSign  = signs.find(s => s.id === currentQuestion?.sign_id) ?? null;
  const isBehavioral = !currentQuestion?.sign_id;

  // Show feedback after answer
  useEffect(() => {
    if (phase === 'feedback_correct' || phase === 'feedback_wrong') {
      setTimeout(() => setShowFeedback(true), 200);
    }
  }, [phase]);

  const handleAnswerSelect = useCallback((answerId: string) => {
    if (phase !== 'question') return;
    submitAnswer(answerId);
  }, [phase, submitAnswer]);

  const handleNext = () => {
    setShowFeedback(false);
    nextQuestion();
  };

  const handleBack = () => {
    router.back();
  };

  // ── Done screen ─────────────────────────────────────────────────────────────
  if (phase === 'done') {
    return (
      <SafeAreaView style={[styles.safeArea, styles.doneScreen]}>
        <Text style={styles.doneEmoji}>🎉</Text>
        <Text style={styles.doneTitle}>ሁሉንም ስህተቶች አስተካከልክ!</Text>
        <Text style={styles.doneScore}>{total}/{total}</Text>
        <TouchableOpacity style={styles.doneBtn} onPress={handleBack}>
          <Text style={styles.doneBtnText}>ወደ ቤት ተመለስ 🏠</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  // ── Loading ─────────────────────────────────────────────────────────────────
  if (phase === 'loading') return <LoadingScreen message="ጥያቄዎችን እየጫነ..." />;
  if (!currentQuestion)   return <LoadingScreen />;

  const answered = total - remaining;

  const getCardState = (answerId: string) => {
    if (phase === 'question') return 'default' as const;
    if (answerId === selectedAnswerId) return lastAnswerCorrect ? 'correct' as const : 'wrong' as const;
    if (currentQuestion.answers.find(a => a.id === answerId)?.is_correct) return 'correct' as const;
    return 'default' as const;
  };

  const feedbackText = lastAnswerCorrect
    ? currentQuestion.explanation_correct_amharic
    : currentQuestion.explanation_wrong_amharic;

  const feedbackAudio = lastAnswerCorrect
    ? currentQuestion.explanation_correct_audio_url
    : currentQuestion.explanation_wrong_audio_url;

  return (
    <SafeAreaView style={styles.safeArea}>
      <OfflineBanner />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.exitButton} onPress={handleBack}>
          <Text style={styles.exitIcon}>✕</Text>
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <ProgressBar
            current={answered}
            total={total}
            height={6}
            fillColor={Colors.secondary}
            style={styles.progressBar}
          />
          <Text style={styles.progressText}>{answered} / {total}</Text>
        </View>
        {/* Remaining count in red — shows how many are still wrong */}
        <Text style={styles.remainingText}>{remaining} 🔁</Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        scrollEnabled={!showFeedback}
      >
        {/* Sign or behavioral question image — same pattern as topic-quiz.tsx.
            This screen previously showed no image at all for either type. */}
        {isBehavioral && currentQuestion.question_image_url ? (
          <View style={styles.signImageContainer}>
            <Image
              source={{ uri: currentQuestion.question_image_url }}
              style={styles.signImage}
              resizeMode="cover"
            />
          </View>
        ) : !isBehavioral && currentSign?.image_url ? (
          <View style={styles.signImageContainer}>
            <Image
              source={{ uri: currentSign.image_url }}
              style={styles.signImage}
              resizeMode="contain"
            />
            {/* Official sign number — same badge as sign/[id].tsx (via
                SignTextDetail). Some questions ask about the sign's number
                directly, so this isn't cosmetic. */}
            {shouldShowSignBadge(currentSign.image_url) && (
              <View style={styles.signNumberBadge}>
                <Text style={styles.signNumberText}>{extractSignNumber(currentSign.image_url)}</Text>
              </View>
            )}
          </View>
        ) : null}

        {/* Question text */}
        <View style={styles.questionCard}>
          {currentQuestion.question_audio_url && (
            <AudioButton
              audioUri={currentQuestion.question_audio_url}
              size={48}
              label="ጥያቄ ድምጽ"
              style={styles.questionAudio}
            />
          )}

          <Text style={styles.questionText}>
            {currentQuestion.question_amharic}
          </Text>
        </View>

        {/* Answer choices */}
        <View style={styles.answersContainer}>
          {currentQuestion.answers.map((answer, index) => (
            <TextAnswerCard
              key={answer.id}
              answerId={answer.id}
              label={String(index + 1)}
              text={answer.text_amharic}
              imageUri={answer.image_url}
              cardState={getCardState(answer.id)}
              onPress={() => handleAnswerSelect(answer.id)}
              disabled={phase !== 'question'}
            />
          ))}
        </View>
      </ScrollView>

      {/* Feedback */}
      {showFeedback && (
        <TextFeedback
          isCorrect={!!lastAnswerCorrect}
          explanationText={feedbackText}
          explanationAudioUri={feedbackAudio}
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
    gap:            20,
    padding:        32,
  },
  doneEmoji: {
    fontSize: 80,
  },
  doneTitle: {
    ...Typography.h2,
    color:     Colors.textPrimary,
    textAlign: 'center',
  },
  doneScore: {
    fontSize:   40,
    fontWeight: '900',
    color:      Colors.correct,
  },
  doneBtn: {
    backgroundColor: Colors.primary,
    borderRadius:    16,
    paddingVertical: 16,
    paddingHorizontal: 32,
    marginTop:       8,
  },
  doneBtnText: {
    ...Typography.body,
    color:      Colors.textPrimary,
    fontWeight: '700',
  },

  // Header
  header: {
    flexDirection:     'row',
    alignItems:        'center',
    paddingHorizontal: 16,
    paddingVertical:   12,
    gap:               12,
  },
  exitButton: {
    width:           40,
    height:          40,
    borderRadius:    20,
    backgroundColor: Colors.card,
    justifyContent:  'center',
    alignItems:      'center',
    flexShrink:      0,
  },
  exitIcon: {
    fontSize: 18,
    color:    Colors.textSecondary,
  },
  headerCenter: {
    flex: 1,
    gap:  4,
  },
  progressBar: {
    flex: 1,
  },
  progressText: {
    ...Typography.caption,
    color:     Colors.textSecondary,
    textAlign: 'center',
  },
  remainingText: {
    ...Typography.body,
    color:      Colors.wrong,
    fontWeight: '700',
    flexShrink: 0,
  },

  // Content
  content: {
    padding: 16,
    gap:     16,
  },
  // Same values as topic-quiz.tsx's (Engine B) sign image block.
  signImageContainer: {
    alignSelf:       'center',
    width:           150,
    height:          150,
    borderRadius:    20,
    backgroundColor: '#ffffff',
    shadowColor:     '#000',
    shadowOffset:    { width: 0, height: 3 },
    shadowOpacity:   0.10,
    shadowRadius:    6,
    elevation:       3,
    position:        'relative', // anchors signNumberBadge below
  },
  signImage: {
    width:  '100%',
    height: '100%',
  },
  // Same values as SignTextDetail's badge (the learning screen's).
  signNumberBadge: {
    position:          'absolute',
    top:               8,
    left:              8,
    backgroundColor:   'rgba(0,0,0,0.55)',
    borderRadius:      5,
    paddingHorizontal: 7,
    paddingVertical:   3,
    zIndex:            1,
  },
  signNumberText: {
    color:      '#FFFFFF',
    fontSize:   12,
    fontWeight: 'bold',
  },
  questionCard: {
    backgroundColor: Colors.card,
    borderRadius:    16,
    padding:         20,
    gap:             12,
  },
  questionText: {
    ...Typography.question,
    color:     Colors.textPrimary,
    textAlign: 'left',
  },
  questionAudio: {
    alignSelf: 'flex-end',
  },
  answersContainer: {
    gap: 10,
  },
});
