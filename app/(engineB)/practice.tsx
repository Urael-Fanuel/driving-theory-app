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
        {/* Question text */}
        <View style={styles.questionCard}>
          <Text style={styles.questionText}>
            {currentQuestion.question_amharic}
          </Text>

          {currentQuestion.question_audio_url && (
            <AudioButton
              audioUri={currentQuestion.question_audio_url}
              size={48}
              label="ጥያቄ ድምጽ"
              style={styles.questionAudio}
            />
          )}
        </View>

        {/* Answer choices */}
        <View style={styles.answersContainer}>
          {currentQuestion.answers.map(answer => (
            <TextAnswerCard
              key={answer.id}
              answerId={answer.id}
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
