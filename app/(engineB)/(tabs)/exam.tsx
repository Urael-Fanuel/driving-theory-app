/**
 * AGENT 3 — app/(engineB)/(tabs)/exam.tsx
 * Engine B Exam Screen — 30 questions, text answers, time tracking.
 */

import React, { useEffect, useCallback, useState } from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { useRouter } from 'expo-router';
import { storeExamResult } from '../../../utils/examResult';
import { Typography } from '../../../constants/typography';
import { LoadingScreen } from '../../../components/shared/LoadingScreen';
import { TextAnswerCard } from '../../../components/engineB/TextAnswerCard';
import { TextFeedback } from '../../../components/engineB/TextFeedback';
import { AudioButton } from '../../../components/shared/AudioButton';
import { ProgressBar } from '../../../components/shared/ProgressBar';
import { OfflineBanner } from '../../../components/shared/OfflineBanner';
import { useExam } from '../../../hooks/useExam';
import { useAudio } from '../../../hooks/useAudio';
import { useNetworkStatus } from '../../../hooks/useNetworkStatus';
import * as api from '../../../backend/api';
import { DBSign } from '../../../backend/supabaseClient';
import { extractSignNumber, shouldShowSignBadge } from '../../../utils/signNumber';

// ─── Component ────────────────────────────────────────────────────────────────

export default function EngineBExamScreen() {
  const router = useRouter();
  const {
    phase,
    currentQuestion,
    currentIndex,
    questions,
    progress,
    submitAnswer,
    nextQuestion,
    goToQuestion,
    result,
    lastAnswerCorrect,
    selectedAnswerId,
    elapsedSeconds,
    isSaving,
  } = useExam();

  const [showFeedback, setShowFeedback] = React.useState(false);
  const [signs, setSigns] = useState<DBSign[]>([]);
  const scrollRef = React.useRef<any>(null);
  const { stopAudio } = useAudio();
  const isConnected = useNetworkStatus();

  // Load all signs once on mount (for displaying sign image per question)
  useEffect(() => {
    api.getAllSigns().then(setSigns).catch(() => {});
  }, []);

  const currentSign = signs.find(s => s.id === currentQuestion?.sign_id) ?? null;

  // Reset scroll to top on new question
  useEffect(() => {
    if (phase === 'question') {
      scrollRef.current?.scrollTo({ y: 0, animated: false });
    }
  }, [currentQuestion?.id]);

  // Show feedback after answer
  useEffect(() => {
    if (phase === 'feedback_correct' || phase === 'feedback_wrong') {
      setTimeout(() => setShowFeedback(true), 200);
    }
  }, [phase]);

  // Navigate to results
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

  const handleAnswerSelect = useCallback((answerId: string) => {
    if (phase !== 'question') return;
    submitAnswer(answerId);
  }, [phase, submitAnswer]);

  const handleNext = async () => {
    await stopAudio();          // stop explanation audio before moving to next question
    setShowFeedback(false);
    nextQuestion();
  };

  // ── Question navigation (prev / next) — same pattern as topic-quiz.tsx (Engine B) ──
  const canGoPrev = currentIndex > 0;
  const canGoNext = currentIndex < (questions.length || 30) - 1;

  const handleNavPrev = async () => {
    if (!canGoPrev) return;
    await stopAudio();
    setShowFeedback(false);
    goToQuestion(currentIndex - 1);
  };

  const handleNavNext = async () => {
    if (!canGoNext) return;
    await stopAudio();
    setShowFeedback(false);
    goToQuestion(currentIndex + 1);
  };

  if (phase === 'loading') return <LoadingScreen message="ጥያቄዎችን እየጫነ..." />;
  if (!currentQuestion)    return <LoadingScreen />;

  const getCardState = (answerId: string) => {
    if (phase === 'question') return 'default' as const;
    if (answerId === selectedAnswerId) return lastAnswerCorrect ? 'correct' as const : 'wrong' as const;
    if (currentQuestion.answers.find(a => a.id === answerId)?.is_correct) return 'correct' as const;
    return 'default' as const;
  };

  const feedbackText = (lastAnswerCorrect
    ? currentQuestion.explanation_correct_amharic
    : currentQuestion.explanation_wrong_amharic) ?? '';

  const feedbackAudio = lastAnswerCorrect
    ? currentQuestion.explanation_correct_audio_url
    : currentQuestion.explanation_wrong_audio_url;

  const minutes = Math.floor(elapsedSeconds / 60);
  const seconds = elapsedSeconds % 60;
  const timerText = `${minutes}:${seconds.toString().padStart(2, '0')}`;

  return (
    <SafeAreaView style={styles.safeArea}>
      {/* Header with timer */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.exitButton} onPress={() => { stopAudio(); router.navigate('/(engineB)/home' as any); }}>
          <Text style={styles.exitIcon}>✕</Text>
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <ProgressBar
            current={progress.current}
            total={progress.total}
            height={6}
            trackColor='#e0e0e0'
            style={styles.progressBar}
          />
          <Text style={styles.progressText}>{progress.current} / {progress.total}</Text>
        </View>
        <Text style={styles.timer}>{timerText}</Text>
      </View>
      {isSaving && (
        <Text style={{ textAlign: 'center', color: '#888', fontSize: 11, marginTop: 2 }}>ማስቀመጥ...</Text>
      )}

      {/* Navigation row: ‹ | 1/30 | › — same pattern as topic-quiz.tsx (Engine B).
          Was missing here entirely; Engine A's exam already has it. */}
      <View style={styles.navRow}>
        <TouchableOpacity
          style={[styles.navBtn, !canGoPrev && styles.navBtnDisabled]}
          onPress={handleNavPrev}
          disabled={!canGoPrev}
          accessibilityLabel="ወደ ቀዳሚ ጥያቄ"
        >
          <Text style={styles.navBtnIcon}>‹</Text>
        </TouchableOpacity>

        <Text style={styles.navCounter}>{currentIndex + 1} / {questions.length || 30}</Text>

        <TouchableOpacity
          style={[styles.navBtn, !canGoNext && styles.navBtnDisabled]}
          onPress={handleNavNext}
          disabled={!canGoNext}
          accessibilityLabel="ወደ ቀጣይ ጥያቄ"
        >
          <Text style={styles.navBtnIcon}>›</Text>
        </TouchableOpacity>
      </View>

      <OfflineBanner isConnected={isConnected} />

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
              source={{ uri: currentSign?.image_url ?? currentQuestion.question_image_url! }}
              style={styles.signImage}
              resizeMode="contain"
            />
            {/* Official sign number — same badge as sign/[id].tsx (via
                SignTextDetail). Tied to currentSign specifically, never to
                a behavioral question's image. Some questions ask about the
                sign's number directly, so this isn't cosmetic. */}
            {shouldShowSignBadge(currentSign?.image_url) && (
              <View style={styles.signNumberBadge}>
                <Text style={styles.signNumberText}>{extractSignNumber(currentSign?.image_url)}</Text>
              </View>
            )}
          </View>
        )}

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
    backgroundColor: '#f7f9fb',
  },
  header: {
    flexDirection:     'row',
    alignItems:        'center',
    paddingHorizontal: 16,
    paddingVertical:   12,
    gap:               12,
  },
  // Prominent, fixed color everywhere in the app — see Colors.backButtonAccent
  // (constants/colors.ts). This file uses raw hex elsewhere, so matching that
  // instead of adding a new import just for this one value.
  exitButton: {
    width:           54,
    height:          54,
    borderRadius:    27,
    backgroundColor: '#ffffff',
    justifyContent:  'center',
    alignItems:      'center',
    flexShrink:      0,
    borderWidth:     2,
    borderColor:     '#29B6F6',
    shadowColor:     '#000',
    shadowOffset:    { width: 0, height: 3 },
    shadowOpacity:   0.20,
    shadowRadius:    8,
    elevation:       6,
  },
  exitIcon: {
    fontSize:   28,
    fontWeight: '700',
    color:      '#29B6F6',
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
    color:     '#404943',
    textAlign: 'center',
  },
  timer: {
    ...Typography.body,
    color:      '#1565C0',
    fontWeight: '700',
    flexShrink: 0,
  },
  // Same values as topic-quiz.tsx's (Engine B) nav row.
  navRow: {
    flexDirection:     'row',
    alignItems:        'center',
    justifyContent:    'center',
    paddingHorizontal: 16,
    paddingBottom:     8,
    gap:               16,
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
  navCounter: {
    fontSize:   17,
    fontWeight: '700',
    color:      '#191c1e',
    minWidth:   70,
    textAlign:  'center',
  },
  content: {
    padding: 16,
    gap:     16,
  },
  questionCard: {
    backgroundColor: '#ffffff',
    borderRadius:    16,
    padding:         20,
    gap:             12,
    shadowColor:     '#000',
    shadowOffset:    { width: 0, height: 2 },
    shadowOpacity:   0.08,
    shadowRadius:    6,
    elevation:       3,
  },
  questionText: {
    ...Typography.question,
    color:     '#191c1e',
    textAlign: 'left',
  },
  questionAudio: {
    alignSelf: 'flex-end',
  },
  answersContainer: {
    gap: 10,
  },
  signImageContainer: {
    alignItems:      'center',
    backgroundColor: '#ffffff',
    borderRadius:    16,
    padding:         12,
    shadowColor:     '#000',
    shadowOffset:    { width: 0, height: 2 },
    shadowOpacity:   0.08,
    shadowRadius:    6,
    elevation:       3,
    position:        'relative', // anchors signNumberBadge below
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
  signImage: {
    width:  220,
    height: 220,
  },
});
