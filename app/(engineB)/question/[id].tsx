/**
 * AGENT 3 — app/(engineB)/question/[id].tsx
 * Engine B Question Screen — Text answer choices, tap to select.
 *
 * Layout:
 * ┌─────────────────────┐
 * │ [← Back]  Q 1/3    │
 * │                     │
 * │ [Sign image small]  │
 * │                     │
 * │ ████ ██ ████ ███    │  ← Question text (Amharic)
 * │ [🔊 Listen]         │
 * │                     │
 * │ [A] ████ ██ ████    │  ← Answer A
 * │ [B] ████ █ ███ ██   │  ← Answer B
 * │ [C] ██ █████ ████   │  ← Answer C
 * └─────────────────────┘
 */

import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Colors } from '../../../constants/colors';
import { Typography } from '../../../constants/typography';
import { LoadingScreen } from '../../../components/shared/LoadingScreen';
import { TextAnswerCard } from '../../../components/engineB/TextAnswerCard';
import { TextFeedback } from '../../../components/engineB/TextFeedback';
import { AudioButton } from '../../../components/shared/AudioButton';
import { ProgressBar } from '../../../components/shared/ProgressBar';
import { DBSign, DBQuestion } from '../../../backend/supabaseClient';
import * as api from '../../../backend/api';
import { useProgress } from '../../../hooks/useProgress';

// ─── Component ────────────────────────────────────────────────────────────────

export default function EngineBQuestionScreen() {
  const { id }   = useLocalSearchParams<{ id: string }>();
  const router   = useRouter();
  const { recordAnswer } = useProgress();

  const [signId, questionIndex] = parseQuestionId(id);

  const [sign,        setSign]        = useState<DBSign | null>(null);
  const [questions,   setQuestions]   = useState<DBQuestion[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [selectedId,  setSelectedId]  = useState<string | null>(null);
  const [showFeedback, setShowFeedback] = useState(false);

  const currentQuestion = questions[questionIndex] ?? null;

  useEffect(() => {
    async function load() {
      try {
        const [allSigns, qs] = await Promise.all([
          api.getAllSigns(),
          api.getQuestionsBySign(signId),
        ]);
        setSign(allSigns.find(s => s.id === signId) ?? null);
        setQuestions(qs);
      } catch (err) {
        console.error('[EngineB/question] Failed to load:', err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [signId]);

  // Reset state when question changes
  useEffect(() => {
    setSelectedId(null);
    setShowFeedback(false);
  }, [questionIndex]);

  const handleAnswerSelect = useCallback((answerId: string) => {
    if (selectedId !== null) return;
    if (!currentQuestion) return;

    setSelectedId(answerId);

    const answer = currentQuestion.answers.find(a => a.id === answerId);
    const isCorrect = answer?.is_correct ?? false;

    recordAnswer(currentQuestion.id, signId, sign?.topic_id ?? '', isCorrect);

    setTimeout(() => setShowFeedback(true), 200);
  }, [selectedId, currentQuestion, signId, sign?.topic_id, recordAnswer]);

  const handleNext = useCallback(() => {
    setShowFeedback(false);
    setSelectedId(null);

    const nextIndex = questionIndex + 1;
    if (nextIndex < questions.length) {
      router.replace(`/(engineB)/question/${signId}_q${nextIndex}`);
    } else {
      router.back();
    }
  }, [questionIndex, questions.length, signId, router]);

  if (loading)           return <LoadingScreen message="ጥያቄዎችን እየጫነ..." />;
  if (!currentQuestion)  return <LoadingScreen message="ጥያቄው አልተገኘም" />;

  const isCorrect = selectedId !== null
    && currentQuestion.answers.find(a => a.id === selectedId)?.is_correct;

  const getCardState = (answerId: string) => {
    if (selectedId === null) return 'default' as const;
    if (answerId === selectedId) return isCorrect ? 'correct' as const : 'wrong' as const;
    if (currentQuestion.answers.find(a => a.id === answerId)?.is_correct) return 'correct' as const;
    return 'default' as const;
  };

  const feedbackText = isCorrect
    ? currentQuestion.explanation_correct_amharic
    : currentQuestion.explanation_wrong_amharic;

  const feedbackAudio = isCorrect
    ? currentQuestion.explanation_correct_audio_url
    : currentQuestion.explanation_wrong_audio_url;

  return (
    <SafeAreaView style={styles.safeArea}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <Text style={styles.backIcon}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>
          {questionIndex + 1} / {questions.length}
        </Text>
        <View style={{ width: 44 }} />
      </View>

      {/* Progress bar */}
      <ProgressBar
        current={questionIndex + 1}
        total={questions.length}
        height={4}
        style={styles.progressBar}
      />

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        scrollEnabled={!showFeedback}
      >
        {/* Sign image */}
        {sign?.image_url && (
          <Image
            source={{ uri: sign.image_url }}
            style={styles.signImage}
            resizeMode="contain"
          />
        )}

        {/* Question text */}
        <View style={styles.questionContainer}>
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
              disabled={selectedId !== null}
            />
          ))}
        </View>
      </ScrollView>

      {/* Feedback bottom sheet */}
      {showFeedback && (
        <TextFeedback
          isCorrect={!!isCorrect}
          explanationText={feedbackText}
          explanationAudioUri={feedbackAudio}
          onNext={handleNext}
        />
      )}
    </SafeAreaView>
  );
}

// ─── Helper ───────────────────────────────────────────────────────────────────

function parseQuestionId(id: string): [string, number] {
  const match = id.match(/^(.+)_q(\d+)$/);
  if (match) return [match[1], parseInt(match[2], 10)];
  return [id, 0];
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safeArea: {
    flex:            1,
    backgroundColor: Colors.background,
  },
  header: {
    flexDirection:     'row',
    alignItems:        'center',
    paddingHorizontal: 16,
    paddingVertical:   12,
  },
  backButton: {
    width:           44,
    height:          44,
    borderRadius:    22,
    backgroundColor: Colors.card,
    justifyContent:  'center',
    alignItems:      'center',
  },
  backIcon: {
    fontSize: 22,
    color:    Colors.textPrimary,
  },
  headerTitle: {
    ...Typography.body,
    color:     Colors.textSecondary,
    flex:      1,
    textAlign: 'center',
    fontWeight: '600',
  },
  progressBar: {
    marginHorizontal: 16,
    marginBottom:     8,
  },
  content: {
    padding:    16,
    gap:        20,
    alignItems: 'center',
  },
  signImage: {
    width:           120,
    height:          120,
    borderRadius:    16,
    backgroundColor: '#FFFFFF',
  },
  questionContainer: {
    alignSelf:       'stretch',
    backgroundColor: Colors.card,
    borderRadius:    16,
    padding:         16,
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
    alignSelf: 'stretch',
    gap:       10,
  },
});
