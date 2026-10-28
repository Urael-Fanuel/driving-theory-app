/**
 * AGENT 3 — components/engineB/TextFeedback.tsx
 * Written + audio feedback for Engine B after answering a question.
 *
 * Shows:
 * - ✅ / ❌ icon
 * - Amharic explanation text
 * - Audio button to hear explanation
 * - Next button
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  ScrollView,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '../../constants/colors';
import { Typography } from '../../constants/typography';
import { AudioButton } from '../shared/AudioButton';
import { speakAndAwait, speakLongAndAwait, stopTTS } from '../../utils/googleTTS';
import { useAudioInterrupted, resumeInterruptedAudio } from '../../hooks/useAudioInterrupted';
import { fetchWrongAnswerExplanation, RagQuery } from '../../utils/ragExplain';

// ─── Types ────────────────────────────────────────────────────────────────────

interface TextFeedbackProps {
  isCorrect: boolean;
  explanationText: string;
  explanationAudioUri?: string;
  /** Amharic feedback text that can be HEARD (behavioral subtopics). Engine B is for readers, so it is
   *  never played by itself: a ▶️ button plays it on demand (owner's decision, 2026-10-27). */
  ttsText?: string;
  /** When provided on a wrong answer — shows a "ለምን?" button that fetches a
   *  RAG-grounded explanation of why the chosen answer is wrong. */
  ragQuery?: RagQuery;
  /** Height (px) of a fixed bottom nav bar on the screen behind this overlay,
   *  if any — lifts the panel to sit above it instead of being covered by it.
   *  Default 0 preserves existing behavior on screens without such a bar. */
  bottomOffset?: number;
  onNext: () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function TextFeedback({
  isCorrect,
  explanationText,
  explanationAudioUri,
  ttsText,
  ragQuery,
  bottomOffset = 0,
  onNext,
}: TextFeedbackProps) {
  const fadeAnim  = useRef(new Animated.Value(0)).current;
  const insets    = useSafeAreaInsets();

  // ── "ለምን?" (why?) RAG explanation state ──────────────────────────────────
  const [ragLoading,     setRagLoading]     = useState(false);
  const [ragExplanation, setRagExplanation] = useState<string | null>(null);
  const [ragFailed,      setRagFailed]      = useState(false);
  const [ragSpeaking,    setRagSpeaking]    = useState(false);
  const ragSpeakingRef = useRef(false);
  const mountedRef     = useRef(true);
  const audioInterrupted = useAudioInterrupted();   // Android paused our audio (call, other app)

  // ── The feedback read aloud, on demand only (▶️ / ⏸) ──────────────────────────
  const [ttsSpeaking, setTtsSpeaking] = useState(false);
  const ttsSpeakingRef = useRef(false);

  // One reading at a time (there is one speech engine). Every start, stop, Next and unmount takes a new
  // number here; a reading that finishes late may only clear the flags if its number is still the
  // current one, so an OLD reading finishing can never clear the flags of a NEWER one (CODEX round 7, R7-3).
  const readingOp = useRef(0);

  /** Ends whatever this panel is reading in the flags (its late completion becomes a no-op). */
  const endReading = () => {
    readingOp.current++;
    ttsSpeakingRef.current = false;
    ragSpeakingRef.current = false;
    if (mountedRef.current) { setTtsSpeaking(false); setRagSpeaking(false); }
  };

  useEffect(() => {
    return () => {
      mountedRef.current = false;
      if (ragSpeakingRef.current || ttsSpeakingRef.current) {
        readingOp.current++;
        stopTTS().catch(() => {});
      }
    };
  }, []);

  const handleTtsSpeak = async () => {
    if (!ttsText) return;
    // Android paused it (call, another app): this tap continues it.
    if (ttsSpeakingRef.current && audioInterrupted) { resumeInterruptedAudio(); return; }
    if (ttsSpeakingRef.current) {
      endReading();
      await stopTTS();
      return;
    }
    endReading();                       // a "why?" reading in progress ends: one engine
    const op = readingOp.current;
    ttsSpeakingRef.current = true;
    setTtsSpeaking(true);
    await speakAndAwait(ttsText).catch(() => {});
    if (readingOp.current !== op) return;   // stopped or replaced meanwhile: not mine to clear
    ttsSpeakingRef.current = false;
    if (mountedRef.current) setTtsSpeaking(false);
  };

  // Next answers at once: whatever is being read stops now, not when the next screen cleans up.
  const handleNext = () => {
    if (ttsSpeakingRef.current || ragSpeakingRef.current) {
      endReading();
      stopTTS().catch(() => {});
    }
    onNext();
  };

  const handleExplainWhy = async () => {
    if (!ragQuery || ragLoading) return;
    setRagLoading(true);
    setRagFailed(false);
    const explanation = await fetchWrongAnswerExplanation(ragQuery);
    if (!mountedRef.current) return;
    setRagLoading(false);
    if (explanation) setRagExplanation(explanation);
    else setRagFailed(true);
  };

  const handleRagSpeak = async () => {
    if (!ragExplanation) return;
    // Android paused the explanation (call, another app): this tap continues it.
    if (ragSpeakingRef.current && audioInterrupted) { resumeInterruptedAudio(); return; }
    if (ragSpeakingRef.current) {
      endReading();
      await stopTTS();
      return;
    }
    endReading();                       // the feedback reading in progress ends: one engine
    const op = readingOp.current;
    ragSpeakingRef.current = true;
    setRagSpeaking(true);
    // The whole explanation, however long (it used to stop at 950 characters).
    await speakLongAndAwait(ragExplanation);
    if (readingOp.current !== op) return;   // stopped or replaced meanwhile: not mine to clear
    ragSpeakingRef.current = false;
    if (mountedRef.current) setRagSpeaking(false);
  };

  useEffect(() => {
    // Haptic
    Haptics.notificationAsync(
      isCorrect
        ? Haptics.NotificationFeedbackType.Success
        : Haptics.NotificationFeedbackType.Error
    );

    // Short fade only. The panel used to slide up with a spring (~0.5 s) after a 200 ms delay: its Next
    // button was not where the learner's finger went for a moment, so the first tap(s) were lost
    // (owner's testing of builds 10 and 11). It now sits at its final place from the first frame.
    Animated.timing(fadeAnim, { toValue: 1, duration: 120, useNativeDriver: true }).start();

    // No automatic reading in Engine B: the ▶️ button below plays the feedback when the learner asks.
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const bgColor       = isCorrect ? Colors.correctDark  : Colors.wrongDark;
  const borderColor   = isCorrect ? Colors.correct       : Colors.wrong;
  const resultTitle   = isCorrect ? '✅' : '❌'; // icon only — explanation text below already has its own praise word
  const titleColor    = isCorrect ? Colors.correct        : Colors.wrong;

  return (
    <Animated.View
      style={[
        styles.container,
        {
          backgroundColor: bgColor,
          borderTopColor:  borderColor,
          bottom:          bottomOffset,
          opacity:         fadeAnim,
        },
      ]}
    >
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.content, { paddingBottom: Math.max(24, insets.bottom + 16) }]}
      >
        {/* Result title */}
        <Text style={[styles.resultTitle, { color: titleColor }]}>
          {resultTitle}
        </Text>

        {/* Explanation text */}
        {!!explanationText && (
          <Text style={styles.explanationText}>
            {explanationText}
          </Text>
        )}

        {/* The feedback read aloud, on demand (same look as the sign quiz's ▶️ button) */}
        {!!ttsText && !explanationAudioUri && (
          <View style={styles.audioRow}>
            <TouchableOpacity
              style={[styles.ttsBtn, { backgroundColor: ttsSpeaking && !audioInterrupted ? Colors.primary : Colors.secondary }]}
              onPress={handleTtsSpeak}
              activeOpacity={0.8}
              accessibilityLabel="ማብራሪያ ድምጽ"
              accessibilityRole="button"
            >
              <Text style={styles.ttsIcon}>{ttsSpeaking && !audioInterrupted ? '⏸' : '▶️'}</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Audio button */}
        {explanationAudioUri && (
          <View style={styles.audioRow}>
            <AudioButton
              audioUri={explanationAudioUri}
              size={52}
              label="ማብራሪያ ድምጽ"
            />
          </View>
        )}

        {/* "ለምን?" — RAG explanation for wrong answers */}
        {!isCorrect && ragQuery && !ragExplanation && (
          <TouchableOpacity
            style={[styles.whyButton, ragLoading && styles.whyButtonLoading]}
            onPress={handleExplainWhy}
            disabled={ragLoading}
            activeOpacity={0.8}
            accessibilityLabel="ለምን እንደተሳሳትኩ አስረዳኝ"
            accessibilityRole="button"
          >
            <Text style={styles.whyButtonText}>
              {ragLoading ? '⏳ እያዘጋጀ ነው...' : ragFailed ? '🔄 ደግመው ይሞክሩ' : '🤔 ለምን? አስረዳኝ'}
            </Text>
          </TouchableOpacity>
        )}

        {ragExplanation && (
          <View style={styles.ragCard}>
            <Text style={styles.ragText}>{ragExplanation}</Text>
            <TouchableOpacity
              style={styles.ragSpeakBtn}
              onPress={handleRagSpeak}
              activeOpacity={0.8}
              accessibilityLabel="ማብራሪያ ድምጽ"
              accessibilityRole="button"
            >
              <Text style={styles.ragSpeakIcon}>{ragSpeaking && !audioInterrupted ? '⏸' : '🔊'}</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Next button */}
        <TouchableOpacity
          style={[styles.nextButton, { borderColor }]}
          onPress={handleNext}
          activeOpacity={0.8}
          accessibilityLabel="ቀጣይ ጥያቄ"
          accessibilityRole="button"
        >
          {/* White label: it used to take the border colour, red on dark red / green on dark green (contrast 1.5 to 2.4),
              which the owner could hardly read (testing of build 11). The button keeps its coloured border. */}
          <Text style={styles.nextButtonText}>
            ቀጣይ ›
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </Animated.View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    position:      'absolute',
    bottom:        0,
    left:          0,
    right:         0,
    maxHeight:     '68%', // raised from 60% — gives the audio button near the top more room, was getting clipped
    borderTopWidth: 3,
    borderRadius:  24,
    shadowColor:   '#000',
    shadowOffset:  { width: 0, height: -4 },
    shadowOpacity: 0.3,
    shadowRadius:  12,
    elevation:     16,
  },
  content: {
    padding:   24,
    gap:       16,
    alignItems: 'center',
  },
  resultTitle: {
    ...Typography.h2,
    fontSize:  44, // icon only now — larger than the old text+icon title
    textAlign: 'center',
  },
  explanationText: {
    ...Typography.body,
    color:     Colors.textPrimary,
    textAlign: 'center',
    lineHeight: 32,
  },
  audioRow: {
    alignItems: 'center',
  },
  whyButton: {
    backgroundColor:   '#1565C0',
    borderRadius:      16,
    paddingVertical:   12,
    paddingHorizontal: 28,
    alignItems:        'center',
  },
  whyButtonLoading: {
    opacity: 0.6,
  },
  whyButtonText: {
    ...Typography.answer,
    color:      '#ffffff',
    fontWeight: '700',
  },
  ragCard: {
    backgroundColor: '#E3F2FD',
    borderRadius:    16,
    padding:         16,
    gap:             12,
    alignSelf:       'stretch',
    alignItems:      'center',
  },
  ragText: {
    ...Typography.body,
    // Dark text: the card is light blue (#E3F2FD). Colors.textPrimary is WHITE (made for the dark panel
    // around it), which left the "why?" explanation unreadable (owner's testing of build 11, 2026-10-28).
    color:      '#191c1e',
    textAlign:  'center',
    lineHeight: 30,
  },
  ragSpeakBtn: {
    width:           48,
    height:          48,
    borderRadius:    24,
    backgroundColor: '#1565C0',
    justifyContent:  'center',
    alignItems:      'center',
  },
  ragSpeakIcon: {
    fontSize: 22,
  },
  ttsBtn: {
    width:          52,
    height:         52,
    borderRadius:   26,
    justifyContent: 'center',
    alignItems:     'center',
    shadowColor:    '#000',
    shadowOffset:   { width: 0, height: 4 },
    shadowOpacity:  0.3,
    shadowRadius:   8,
    elevation:      6,
  },
  ttsIcon: {
    fontSize:  23,
    textAlign: 'center',
  },
  nextButton: {
    borderWidth:     2,
    borderRadius:    16,
    paddingVertical: 14,
    paddingHorizontal: 40,
    alignSelf:       'stretch',
    alignItems:      'center',
    marginTop:       8,
  },
  nextButtonText: {
    ...Typography.answer,
    color:      '#FFFFFF',
    fontWeight: '700',
  },
});
