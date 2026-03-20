/**
 * app/(engineB)/question/[id].tsx
 * Engine B Question Screen — Text-first for readers.
 *
 * Layout:
 * ┌─────────────────────────┐
 * │ [←]      ● ● ●    1/3  │  ← Header: back + dots + counter
 * ├─────────────────────────┤
 * │  [Sign image]           │
 * │  ████ ██ ████ ███       │  ← Question text  [▶️]
 * │  [A] ████ ██ ████       │
 * │  [B] ████ █ ███ ██      │
 * │  [C] ██ █████ ████      │
 * ├─────────────────────────┤
 * │  [‹]  שאלה קודמת  שאלה הבאה  [›]  │  ← Question nav row
 * ├─────────────────────────┤
 * │  [‹]    🖼  ምልክቱ    [›]  │  ← Sign nav row
 * └─────────────────────────┘
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
  Platform,
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
import { extractSignNumber, shouldShowSignBadge } from '../../../utils/signNumber';

// ─── Component ────────────────────────────────────────────────────────────────

export default function EngineBQuestionScreen() {
  const { id }   = useLocalSearchParams<{ id: string }>();
  const router   = useRouter();
  const { recordAnswer } = useProgress();

  const [signId, questionIndex] = parseQuestionId(id);

  const [sign,         setSign]         = useState<DBSign | null>(null);
  const [questions,    setQuestions]    = useState<DBQuestion[]>([]);
  const [topicSigns,   setTopicSigns]   = useState<DBSign[]>([]);
  const [loading,      setLoading]      = useState(() => !api.getSignsFromCache() || !api.getQuestionsFromCache(signId));
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

  const canGoPrevQ = questionIndex > 0;
  const canGoNextQ = selectedId !== null && questionIndex < questions.length - 1;

  const handlePrevQuestion = useCallback(() => {
    if (!canGoPrevQ) return;
    Haptics.selectionAsync();
    setShowFeedback(false);
    setSelectedId(null);
    router.replace(`/(engineB)/question/${signId}_q${questionIndex - 1}`);
  }, [canGoPrevQ, questionIndex, signId, router]);

  const handleNextQuestion = useCallback(() => {
    if (!canGoNextQ) return;
    Haptics.selectionAsync();
    setShowFeedback(false);
    setSelectedId(null);
    router.replace(`/(engineB)/question/${signId}_q${questionIndex + 1}`);
  }, [canGoNextQ, questionIndex, questions.length, signId, router]);

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

  return (
    <SafeAreaView style={styles.safeArea}>

      {/* ── Header: ← | ● ● ● | 1/3 ── */}
      <View style={styles.header}>

        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
          accessibilityLabel="ወደ ምልክቱ ተመለስ"
        >
          <Text style={styles.backIcon}>←</Text>
        </TouchableOpacity>

        {/* Dots only — no nav arrows in header */}
        <View style={styles.dotsRow}>
          {questions.map((_, i) => (
            <View
              key={i}
              style={[styles.dot, i === questionIndex && styles.dotActive]}
            />
          ))}
        </View>

        <Text style={styles.counter}>
          {questionIndex + 1}/{questions.length}
        </Text>

      </View>

      {/* ── Scrollable content ── */}
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        scrollEnabled={!showFeedback}
      >
        {/* Sign image */}
        {sign?.image_url && (
          <View style={styles.signImageWrapper}>
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

      {/* ── Feedback overlay ── */}
      {showFeedback && (
        <TextFeedback
          isCorrect={!!isCorrect}
          explanationText={feedbackText}
          explanationAudioUri={feedbackAudio}
          onNext={handleNextQuestion}
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
            accessibilityLabel="ወደ ቀዳሚ ጥያቄ"
          >
            <Text style={[styles.qNavArrow, !canGoPrevQ && styles.navArrowDisabled]}>‹</Text>
          </TouchableOpacity>

          <View style={styles.qNavLabels}>
            <Text style={[styles.qNavLabel, !canGoPrevQ && styles.qNavLabelDisabled]}>
              ቀዳሚ ጥያቄ
            </Text>
            <Text style={[styles.qNavLabel, !canGoNextQ && styles.qNavLabelDisabled, styles.qNavLabelRight]}>
              ቀጣይ ጥያቄ
            </Text>
          </View>

          <TouchableOpacity
            style={[styles.qNavBtn, !canGoNextQ && styles.navBtnDisabled]}
            onPress={handleNextQuestion}
            disabled={!canGoNextQ}
            accessibilityLabel="ወደ ቀጣይ ጥያቄ"
          >
            <Text style={[styles.qNavArrow, !canGoNextQ && styles.navArrowDisabled]}>›</Text>
          </TouchableOpacity>
        </View>

        {/* Divider */}
        <View style={styles.navDivider} />

        {/* Row 2 — Sign navigation */}
        <View style={styles.signNavRow}>
          <TouchableOpacity
            style={[styles.signNavBtn, !prevSign && styles.navBtnDisabled]}
            onPress={handlePrevSign}
            disabled={!prevSign}
            accessibilityLabel="ወደ ቀዳሚ ምልክት"
          >
            <Text style={[styles.signNavArrow, !prevSign && styles.navArrowDisabled]}>‹</Text>
          </TouchableOpacity>

          {/* Current sign thumbnail */}
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
            style={[styles.signNavBtn, !nextSign && styles.navBtnDisabled]}
            onPress={handleNextSign}
            disabled={!nextSign}
            accessibilityLabel="ወደ ቀጣይ ምልክት"
          >
            <Text style={[styles.signNavArrow, !nextSign && styles.navArrowDisabled]}>›</Text>
          </TouchableOpacity>
        </View>

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
    paddingHorizontal: 16,
    paddingVertical:   12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    gap:               8,
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
  dotsRow: {
    flex:           1,
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'center',
    gap:            10,
  },
  dot: {
    width:           10,
    height:          10,
    borderRadius:    5,
    backgroundColor: Colors.border,
  },
  dotActive: {
    backgroundColor: Colors.primary,
    width:           14,
    height:          14,
    borderRadius:    7,
  },
  counter: {
    ...Typography.body,
    color:      Colors.textSecondary,
    fontWeight: '600',
    minWidth:   36,
    textAlign:  'right',
  },

  // ── Content ──────────────────────────────────────────────────────────────────
  content: {
    padding:    16,
    gap:        16,
    alignItems: 'center',
    // Extra bottom padding so last answer isn't hidden behind nav
    paddingBottom: 24,
  },
  signImageWrapper: {
    position:        'relative',
    width:           110,
    height:          110,
  },
  signImage: {
    width:           110,
    height:          110,
    borderRadius:    16,
    backgroundColor: '#FFFFFF',
  },
  signNumberBadge: {
    position:        'absolute',
    top:             6,
    left:            6,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius:    4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    zIndex:          1,
  },
  signNumberText: {
    color:      '#FFFFFF',
    fontSize:   11,
    fontWeight: 'bold',
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

  // ── Bottom navigation container ──────────────────────────────────────────────
  bottomNav: {
    borderTopWidth:    1,
    borderTopColor:    Colors.border,
    backgroundColor:   Colors.background,
    // Extra bottom padding to clear Android system nav bar
    paddingBottom:     Platform.OS === 'android' ? 16 : 8,
  },

  navDivider: {
    height:          1,
    backgroundColor: Colors.border,
    marginHorizontal: 20,
  },

  // ── Row 1: Question navigation ───────────────────────────────────────────────
  questionNavRow: {
    flexDirection:     'row',
    alignItems:        'center',
    paddingHorizontal: 12,
    paddingVertical:   10,
    gap:               8,
  },
  qNavBtn: {
    width:           52,
    height:          52,
    borderRadius:    26,
    backgroundColor: Colors.primary,   // green — stands out from dark bg
    justifyContent:  'center',
    alignItems:      'center',
    shadowColor:     '#000',
    shadowOffset:    { width: 0, height: 2 },
    shadowOpacity:   0.4,
    shadowRadius:    4,
    elevation:       4,
  },
  qNavArrow: {
    fontSize:   28,
    color:      Colors.textPrimary,
    fontWeight: '700',                 // bold — clearly visible
    lineHeight: 34,
  },
  qNavLabels: {
    flex:              1,
    flexDirection:     'row',
    justifyContent:    'space-between',
    paddingHorizontal: 4,
  },
  qNavLabel: {
    ...Typography.bodySmall,
    color:      Colors.textPrimary,    // white — full contrast
    fontWeight: '700',
  },
  qNavLabelRight: {
    textAlign: 'right',
  },
  qNavLabelDisabled: {
    opacity: 0.3,
  },

  // ── Row 2: Sign navigation ───────────────────────────────────────────────────
  signNavRow: {
    flexDirection:     'row',
    alignItems:        'center',
    paddingHorizontal: 12,
    paddingVertical:   8,
    gap:               8,
  },
  signNavBtn: {
    width:           52,
    height:          52,
    borderRadius:    26,
    backgroundColor: Colors.cardActive,
    borderWidth:     1,
    borderColor:     Colors.border,
    justifyContent:  'center',
    alignItems:      'center',
  },
  signNavArrow: {
    fontSize:   30,
    color:      Colors.textPrimary,
    fontWeight: '300',
    lineHeight: 36,
  },
  signThumbBtn: {
    flex:        1,
    alignItems:  'center',
    gap:         4,
  },
  signThumb: {
    width:           52,
    height:          52,
    borderRadius:    12,
    backgroundColor: '#FFFFFF',
  },
  signThumbLabel: {
    ...Typography.caption,
    color:    Colors.textSecondary,
    fontSize: 11,
  },

  // ── Shared disabled styles ───────────────────────────────────────────────────
  navBtnDisabled: {
    opacity: 0.25,
  },
  navArrowDisabled: {
    color: Colors.textSecondary,
  },
});
