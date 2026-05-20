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
import { useExam } from '../../../hooks/useExam';
import { useAudio } from '../../../hooks/useAudio';
import { useNetworkStatus } from '../../../hooks/useNetworkStatus';
import * as api from '../../../backend/api';
import { DBSign } from '../../../backend/supabaseClient';

// ─── Component ────────────────────────────────────────────────────────────────

export default function EngineBExamScreen() {
  const router = useRouter();
  const {
    phase,
    currentQuestion,
    progress,
    submitAnswer,
    nextQuestion,
    result,
    lastAnswerCorrect,
    selectedAnswerId,
    elapsedSeconds,
    isSaving,
  } = useExam();

  const [showFeedback, setShowFeedback] = React.useState(false);
  const [signs, setSigns] = useState<DBSign[]>([]);
  const { stopAudio } = useAudio();
  const isConnected = useNetworkStatus();

  // Load all signs once on mount (for displaying sign image per question)
  useEffect(() => {
    api.getAllSigns().then(setSigns).catch(() => {});
  }, []);

  const currentSign = signs.find(s => s.id === currentQuestion?.sign_id) ?? null;

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

  const handleNext = () => {
    stopAudio();          // stop explanation audio before moving to next question
    setShowFeedback(false);
    nextQuestion();
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
        <TouchableOpacity style={styles.exitButton} onPress={() => { stopAudio(); router.navigate('/(engineB)/home'); }}>
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
      {!isConnected && (
        <Text style={{ textAlign: 'center', color: '#fff', backgroundColor: '#e67e22', fontSize: 12, padding: 4 }}>
          {'ኢንተርኔት የለም — ድምፁ አይሰራም። ጽሑፉን ማንበብ ይቻላል።'}
        </Text>
      )}

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        scrollEnabled={!showFeedback}
      >
        {/* Traffic sign image */}
        {currentSign?.image_url && (
          <View style={styles.signImageContainer}>
            <Image
              source={{ uri: currentSign.image_url }}
              style={styles.signImage}
              resizeMode="contain"
            />
          </View>
        )}

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
  exitButton: {
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
  exitIcon: {
    fontSize: 18,
    color:    '#404943',
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
  },
  signImage: {
    width:  160,
    height: 160,
  },
});
