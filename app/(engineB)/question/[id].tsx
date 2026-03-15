/**
 * app/(engineB)/question/[id].tsx
 * Engine B Question Screen — Text-first for readers.
 *
 * Layout:
 * ┌─────────────────────┐
 * │ [←]  ‹ ● ● ● ›  1/3│  ← Back | prev/next question dots | counter
 * ├─────────────────────┤
 * │ [Sign image small]  │
 * │                     │
 * │ ████ ██ ████ ███    │  ← Question text
 * │ [🔊] optional       │
 * │                     │
 * │ [A] ████ ██ ████    │  ← Answer A
 * │ [B] ████ █ ███ ██   │  ← Answer B
 * │ [C] ██ █████ ████   │  ← Answer C
 * ├─────────────────────┤
 * │  [⬅️]  [🖼 tmlkot] [➡️]│  ← Prev sign | current sign thumb | Next sign
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
import { DBSign, DBQuestion } from '../../../backend/supabaseClient';
import * as api from '../../../backend/api';
import { useProgress } from '../../../hooks/useProgress';

// ─── Component ────────────────────────────────────────────────────────────────

export default function EngineBQuestionScreen() {
  const { id }   = useLocalSearchParams<{ id: string }>();
  const router   = useRouter();
  const { recordAnswer } = useProgress();

  const [signId, questionIndex] = parseQuestionId(id);

  const [sign,         setSign]         = useState<DBSign | null>(null);
  const [questions,    setQuestions]    = useState<DBQuestion[]>([]);
  const [topicSigns,   setTopicSigns]   = useState<DBSign[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [selectedId,   setSelectedId]   = useState<string | null>(null);
  const [showFeedback, setShowFeedback] = useState(false);

  const currentQuestion = questions[questionIndex] ?? null;

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
        if (found) {
          const sorted = allSigns
            .filter(s => s.topic_id === found.topic_id)
            .sort((a, b) => a.display_order - b.display_order);
          setTopicSigns(sorted);
        }
      } catch (err) {
        console.error('[EngineB/question] Failed to load:', err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [signId]);

  // Reset state when question index changes
  useEffect(() => {
    setSelectedId(null);
    setShowFeedback(false);
  }, [questionIndex]);

  // ── Answer selection ─────────────────────────────────────────────────────────

  const handleAnswerSelect = useCallback((answerId: string) => {
    if (selectedId !== null) return;
    if (!currentQuestion) return;

    setSelectedId(answerId);
    const answer    = currentQuestion.answers.find(a => a.id === answerId);
    const isCorrect = answer?.is_correct ?? false;
    recordAnswer(currentQuestion.id, signId, sign?.topic_id ?? '', isCorrect);
    setTimeout(() => setShowFeedback(true), 200);
  }, [selectedId, currentQuestion, signId, sign?.topic_id, recordAnswer]);

  // ── Question navigation ──────────────────────────────────────────────────────

  const handleNextQuestion = useCallback(() => {
    setShowFeedback(false);
    setSelectedId(null);
    const nextIndex = questionIndex + 1;
    if (nextIndex < questions.length) {
      router.replace(`/(engineB)/question/${signId}_q${nextIndex}`);
    } else {
      router.back();
    }
  }, [questionIndex, questions.length, signId, router]);

  const handlePrevQuestion = useCallback(() => {
    if (questionIndex <= 0) return;
    Haptics.selectionAsync();
    setShowFeedback(false);
    setSelectedId(null);
    router.replace(`/(engineB)/question/${signId}_q${questionIndex - 1}`);
  }, [questionIndex, signId, router]);

  // ── Sign navigation ──────────────────────────────────────────────────────────

  const currentSignIndex = topicSigns.findIndex(s => s.id === signId);
  const prevSign = currentSignIndex > 0 ? topicSigns[currentSignIndex - 1] : null;
  const nextSign = currentSignIndex < topicSigns.length - 1 ? topicSigns[currentSignIndex + 1] : null;

  const handlePrevSign = async () => {
    if (!prevSign) return;
    await Haptics.selectionAsync();
    router.replace(`/(engineB)/question/${prevSign.id}_q0`);
  };

  const handleNextSign = async () => {
    if (!nextSign) return;
    await Haptics.selectionAsync();
    router.replace(`/(engineB)/question/${nextSign.id}_q0`);
  };

  // ─────────────────────────────────────────────────────────────────────────────

  if (loading)          return <LoadingScreen message="ጥያቄዎችን እየጫነ..." />;
  if (!currentQuestion) return <LoadingScreen message="ጥያቄው አልተገኘም" />;

  const isCorrect = selectedId !== null
    && currentQuestion.answers.find(a => a.id === selectedId)?.is_correct;

  const getCardState = (answerId: string) => {
    if (selectedId === null) return 'default' as const;
    if (answerId === selectedId) return isCorrect ? 'correct' as const : 'wrong' as const;
    if (currentQuestion.answers.find(a => a.id === answerId)?.is_correct) return 'correct' as const;
    return 'default' as const;
  };

  const feedbackText  = isCorrect
    ? currentQuestion.explanation_correct_amharic
    : currentQuestion.explanation_wrong_amharic;
  const feedbackAudio = isCorrect
    ? currentQuestion.explanation_correct_audio_url
    : currentQuestion.explanation_wrong_audio_url;

  const canGoNext = selectedId !== null && questionIndex < questions.length - 1;

  return (
    <SafeAreaView style={styles.safeArea}>

      {/* Header: ← | ‹ ● ● ● › | 1/3 */}
      <View style={styles.header}>

        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
          accessibilityLabel="ወደ ምልክቱ ተመለስ"
        >
          <Text style={styles.backIcon}>←</Text>
        </TouchableOpacity>

        {/* Question prev/next + dots */}
        <View style={styles.dotsContainer}>
          <TouchableOpacity
            style={[styles.qNavBtn, questionIndex <= 0 && styles.qNavBtnDisabled]}
            onPress={handlePrevQuestion}
            disabled={questionIndex <= 0}
          >
            <Text style={[styles.qNavIcon, questionIndex <= 0 && styles.qNavIconDisabled]}>‹</Text>
          </TouchableOpacity>

          <View style={styles.dotsRow}>
            {questions.map((_, i) => (
              <View
                key={i}
                style={[styles.dot, i === questionIndex && styles.dotActive]}
              />
            ))}
          </View>

          <TouchableOpacity
            style={[styles.qNavBtn, !canGoNext && styles.qNavBtnDisabled]}
            onPress={handleNextQuestion}
            disabled={!canGoNext}
          >
            <Text style={[styles.qNavIcon, !canGoNext && styles.qNavIconDisabled]}>›</Text>
          </TouchableOpacity>
        </View>

        {/* Counter */}
        <Text style={styles.counter}>
          {questionIndex + 1}/{questions.length}
        </Text>

      </View>

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

        {/* Question text + optional audio */}
        <View style={styles.questionContainer}>
          <Text style={styles.questionText}>
            {currentQuestion.question_amharic}
          </Text>
          {currentQuestion.question_audio_url && (
            <AudioButton
              audioUri={currentQuestion.question_audio_url}
              size={44}
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

      {/* Feedback overlay */}
      {showFeedback && (
        <TextFeedback
          isCorrect={!!isCorrect}
          explanationText={feedbackText}
          explanationAudioUri={feedbackAudio}
          onNext={handleNextQuestion}
        />
      )}

      {/* Sign navigation bar */}
      <View style={styles.signNavBar}>

        <TouchableOpacity
          style={[styles.signNavBtn, !prevSign && styles.signNavBtnDisabled]}
          onPress={handlePrevSign}
          disabled={!prevSign}
          accessibilityLabel="ወደ ቀዳሚ ምልክት"
        >
          <Text style={[styles.signNavIcon, !prevSign && styles.signNavIconDisabled]}>⬅️</Text>
        </TouchableOpacity>

        {/* Current sign thumbnail — tap to go back to sign screen */}
        <TouchableOpacity
          style={styles.signThumbBtn}
          onPress={() => router.back()}
          accessibilityLabel="ወደ ምልክቱ ተመለስ"
        >
          {sign?.image_url && (
            <Image
              source={{ uri: sign.image_url }}
              style={styles.signThumb}
              resizeMode="contain"
            />
          )}
          <Text style={styles.signThumbLabel}>ምልክቱ</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.signNavBtn, !nextSign && styles.signNavBtnDisabled]}
          onPress={handleNextSign}
          disabled={!nextSign}
          accessibilityLabel="ወደ ቀጣይ ምልክት"
        >
          <Text style={[styles.signNavIcon, !nextSign && styles.signNavIconDisabled]}>➡️</Text>
        </TouchableOpacity>

      </View>

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

  // ── Header ──────────────────────────────────────────────────────────────────
  header: {
    flexDirection:     'row',
    alignItems:        'center',
    paddingHorizontal: 12,
    paddingVertical:   10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    gap:               8,
  },
  backButton: {
    width:           40,
    height:          40,
    borderRadius:    20,
    backgroundColor: Colors.card,
    justifyContent:  'center',
    alignItems:      'center',
  },
  backIcon: {
    fontSize: 20,
    color:    Colors.textPrimary,
  },
  dotsContainer: {
    flex:           1,
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'center',
    gap:            6,
  },
  qNavBtn: {
    width:           32,
    height:          32,
    borderRadius:    16,
    justifyContent:  'center',
    alignItems:      'center',
    backgroundColor: Colors.card,
  },
  qNavBtnDisabled: {
    opacity: 0.3,
  },
  qNavIcon: {
    fontSize:   22,
    color:      Colors.textPrimary,
    fontWeight: '700',
    lineHeight: 26,
  },
  qNavIconDisabled: {
    color: Colors.textSecondary,
  },
  dotsRow: {
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'center',
    gap:            8,
  },
  dot: {
    width:           9,
    height:          9,
    borderRadius:    5,
    backgroundColor: Colors.border,
  },
  dotActive: {
    backgroundColor: Colors.primary,
    width:           13,
    height:          13,
    borderRadius:    7,
  },
  counter: {
    ...Typography.caption,
    color:      Colors.textSecondary,
    fontWeight: '600',
    minWidth:   32,
    textAlign:  'right',
  },

  // ── Content ──────────────────────────────────────────────────────────────────
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
    gap:             10,
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

  // ── Sign navigation bar ────────────────────────────────────────────────────
  signNavBar: {
    flexDirection:     'row',
    alignItems:        'center',
    justifyContent:    'space-between',
    paddingHorizontal: 20,
    paddingVertical:   10,
    borderTopWidth:    1,
    borderTopColor:    Colors.border,
    backgroundColor:   Colors.background,
  },
  signNavBtn: {
    width:           52,
    height:          52,
    borderRadius:    26,
    backgroundColor: Colors.card,
    justifyContent:  'center',
    alignItems:      'center',
  },
  signNavBtnDisabled: {
    opacity: 0.3,
  },
  signNavIcon: {
    fontSize: 22,
  },
  signNavIconDisabled: {
    opacity: 0.4,
  },
  signThumbBtn: {
    alignItems:  'center',
    gap:         4,
  },
  signThumb: {
    width:           48,
    height:          48,
    borderRadius:    10,
    backgroundColor: '#FFFFFF',
  },
  signThumbLabel: {
    ...Typography.caption,
    color:    Colors.textSecondary,
    fontSize: 11,
  },
});
