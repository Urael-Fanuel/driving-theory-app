/**
 * app/(engineA)/behavioral-subtopic/[id].tsx
 * Engine A — Behavioral sub-topic screen (non-reader, voice/image only)
 *
 * Mirrors app/(engineA)/question/[id].tsx exactly:
 *
 * Phase 1 — EXPLANATION:
 *   Large image (or icon).  Narration audio plays automatically.
 *   Control row: [⬅️ prev-subtopic | ▶️/⏸ | ➡️ next-subtopic]
 *   📝 Quiz button
 *
 * Phase 2 — QUESTIONS:
 *   Small subtopic image (200×200)
 *   Progress row:  ⬅️  [● ● ●]  ➡️   (question navigation)
 *   Control row:  [⬅️ | ▶️/⏸ | ➡️]   (subtopic navigation + audio)
 *   4 numbered answer cards  (ImageAnswerCard with no image = numbered placeholder)
 *   🎤 VoiceAnswerButton
 *   AudioFeedback overlay
 *
 *   Audio sequence:
 *     1 s wait → TTS question → 300 ms → for each answer: number_N.mp3 + TTS answer
 *
 * Phase 3 — COMPLETE: ✅ + back button
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  Image,
  BackHandler,
} from 'react-native';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Audio } from 'expo-av';
import { Colors } from '../../../constants/colors';
import { ImageAnswerCard } from '../../../components/engineA/ImageAnswerCard';
import { VoiceAnswerButton } from '../../../components/engineA/VoiceAnswerButton';
import { AudioFeedback } from '../../../components/engineA/AudioFeedback';
import { useVoiceRecognition } from '../../../hooks/useVoiceRecognition';
import {
  speakAndAwait,
  playUrlAndAwait,
  stopTTS,
} from '../../../utils/googleTTS';
import vehicleKnowledgeData from '../../../content/vehicle_knowledge_scaffold.json';

// ─── Number announcement URLs ──────────────────────────────────────────────────
const _AUDIO_BASE = (process.env.EXPO_PUBLIC_SUPABASE_URL ?? '') + '/storage/v1/object/public/audio';
const NUMBER_URLS = [
  `${_AUDIO_BASE}/number_1.mp3`,
  `${_AUDIO_BASE}/number_2.mp3`,
  `${_AUDIO_BASE}/number_3.mp3`,
  `${_AUDIO_BASE}/number_4.mp3`,
];

// ─── Praise phrases for correct answers (exact phrases used in signs) ─────────
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

// ─── Types ────────────────────────────────────────────────────────────────────
interface Answer   { text_amharic: string; is_correct: boolean; }
interface Question { question_amharic: string; answers: Answer[]; }
interface Subtopic {
  id: string; name_hebrew: string; icon: string;
  narration_audio_url?: string; image_url?: string; image_url_2?: string; questions?: Question[];
}
interface Level    { id: string; level: number; name_hebrew: string; color: string; subtopics: Subtopic[]; }
interface Scaffold { topicId: string; levels: Level[]; }

const SCAFFOLD_MAP: Record<string, Scaffold> = {
  vehicle_knowledge: vehicleKnowledgeData as Scaffold,
};

type Phase       = 'explanation' | 'questions' | 'complete';
type NarState    = 'playing' | 'paused' | 'idle';

// ─── Component ────────────────────────────────────────────────────────────────
export default function BehavioralSubtopicScreenA() {
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
  const [phase,              setPhase]              = useState<Phase>('explanation');
  const [narState,           setNarState]           = useState<NarState>('idle');
  const [replayCount,        setReplayCount]        = useState(0);
  const [qIndex,             setQIndex]             = useState(0);
  const [answeredIndex,      setAnsweredIndex]      = useState<number | null>(null);
  const [showFeedback,       setShowFeedback]       = useState(false);
  const [playingAnswerIndex, setPlayingAnswerIndex] = useState<number | null>(null);
  const [audioRestartKey,    setAudioRestartKey]    = useState(0);
  const [audioPlaying,       setAudioPlaying]       = useState(false);
  const [feedbackTTSText,    setFeedbackTTSText]    = useState('');

  // ── Refs ──────────────────────────────────────────────────────────────────────
  const soundRef             = useRef<Audio.Sound | null>(null);   // narration sound
  const answeredIndexRef     = useRef<number | null>(null);
  const voiceFailedRef       = useRef(false);
  const sequenceCancelledRef = useRef(false);  // set true when ⏸ pressed
  const manualRestartRef     = useRef(false);  // set true when ▶️ pressed — skips 1s delay
  const answerCallbackRef    = useRef<(idx: number) => void>(() => {});
  // After a 🔊 replay, holds the answer index to resume from (skips question).
  const replayFromAnswerRef  = useRef<number | null>(null);

  answeredIndexRef.current = answeredIndex;

  const currentQ   = questions[qIndex] ?? null;
  const levelColor = level?.color ?? Colors.primary;

  // ── Voice recognition ─────────────────────────────────────────────────────────
  const { voiceState, startListening, stopListening, cancelListening } =
    useVoiceRecognition(
      useCallback((answerIndex: number | null) => {
        if (answerIndex !== null) answerCallbackRef.current(answerIndex);
      }, [])
    );

  // ── Narration (explanation phase only) ───────────────────────────────────────
  useEffect(() => {
    if (phase !== 'explanation') return;
    if (!subtopic?.narration_audio_url) return;
    let cancelled = false;

    async function play() {
      try {
        await soundRef.current?.unloadAsync();
        soundRef.current = null;
        await Audio.setAudioModeAsync({ playsInSilentModeIOS: true });
        const { sound } = await Audio.Sound.createAsync(
          { uri: subtopic!.narration_audio_url! }
        );
        if (cancelled) { sound.unloadAsync(); return; }
        soundRef.current = sound;
        // Register callback BEFORE playAsync so we never miss a status update.
        // Tracks isPlaying → 'playing' and didJustFinish → 'idle'.
        sound.setOnPlaybackStatusUpdate((s) => {
          if (!s.isLoaded) return;
          if (s.isPlaying)          setNarState('playing');
          else if (s.didJustFinish) setNarState('idle');
        });
        setNarState('playing');  // optimistic — shows ⏸ immediately after load
        await sound.playAsync();
      } catch { setNarState('idle'); }
    }

    setNarState('idle');
    play();
    return () => {
      cancelled = true;
      soundRef.current?.unloadAsync().catch(() => {});
      soundRef.current = null;
    };
  }, [replayCount, phase]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Question audio sequence ───────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== 'questions' || !currentQ) return;

    voiceFailedRef.current = false;
    sequenceCancelledRef.current = false;  // reset on every new question / restart
    cancelListening();           // reset audio mode to playback
    let cancelled = false;
    const isCancelled = () => cancelled || voiceFailedRef.current || sequenceCancelledRef.current;

    async function runSequence() {
      // Check if resuming after a 🔊 replay (skip question, start from answer N)
      const resumeFromAnswer = replayFromAnswerRef.current;
      replayFromAnswerRef.current = null;

      await stopTTS();
      if (isCancelled()) return;

      setAudioPlaying(true);

      if (resumeFromAnswer === null) {
        // Normal flow: optional 1s delay → question TTS → 300ms pause
        const isManualRestart = manualRestartRef.current;
        manualRestartRef.current = false;
        if (!isManualRestart) {
          await new Promise<void>(res => setTimeout(res, 1000));
          if (isCancelled()) return;
        }

        await speakAndAwait(currentQ!.question_amharic);
        if (isCancelled()) return;

        await new Promise<void>(res => setTimeout(res, 300));
        if (isCancelled() || answeredIndexRef.current !== null) return;
      }

      // Speak each answer from resumeFromAnswer (or 0 for normal start)
      for (let i = resumeFromAnswer ?? 0; i < currentQ!.answers.length && i < 4; i++) {
        if (isCancelled() || answeredIndexRef.current !== null) break;

        setPlayingAnswerIndex(i);

        await playUrlAndAwait(NUMBER_URLS[i]);
        if (isCancelled() || answeredIndexRef.current !== null) break;

        await speakAndAwait(currentQ!.answers[i].text_amharic);
        if (isCancelled()) break;
      }

      setPlayingAnswerIndex(null);
      setAudioPlaying(false);
    }

    runSequence().catch(() => { setAudioPlaying(false); });

    return () => {
      cancelled = true;
      setPlayingAnswerIndex(null);
      setAudioPlaying(false);
    };
  }, [phase, currentQ?.question_amharic, audioRestartKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Voice failure → stop sequence, play retry audio ──────────────────────────
  useEffect(() => {
    if (phase !== 'questions') return;
    if (voiceState === 'failed') {
      voiceFailedRef.current = true;
      stopTTS().then(() => {
        setAudioPlaying(false);
        playUrlAndAwait(`${_AUDIO_BASE}/try_again.mp3`).catch(() => {});
      });
    } else {
      voiceFailedRef.current = false;
    }
  }, [voiceState, phase]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── 404 fallback ───────────────────────────────────────────────────────────────
  if (!subtopic || !level) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Text style={styles.backIcon}>←</Text>
        </TouchableOpacity>
        <View style={styles.center}><Text style={{ fontSize: 64 }}>🚧</Text></View>
      </SafeAreaView>
    );
  }

  // ── Handlers ──────────────────────────────────────────────────────────────────

  const handleBack = useCallback(() => {
    stopTTS().catch(() => {});
    soundRef.current?.stopAsync().catch(() => {});
    soundRef.current = null;
    cancelListening();
    router.back();
  }, [cancelListening, router]); // eslint-disable-line react-hooks/exhaustive-deps

  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        handleBack(); return true;
      });
      return () => sub.remove();
    }, [handleBack])
  );

  // Explanation: narration control button
  const handleNarBtn = async () => {
    await Haptics.selectionAsync();
    if (narState === 'playing') {
      await soundRef.current?.pauseAsync();
      setNarState('paused');
    } else if (narState === 'paused') {
      await soundRef.current?.playAsync();
      setNarState('playing');
    } else {
      setReplayCount(c => c + 1);
    }
  };

  // Explanation: start quiz
  const handleStartQuiz = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await soundRef.current?.unloadAsync().catch(() => {});
    soundRef.current = null;
    setPhase('questions');
  };

  // Questions: audio control button (stop/restart sequence)
  const handleAudioBtn = async () => {
    await Haptics.selectionAsync();
    if (audioPlaying) {
      sequenceCancelledRef.current = true;  // stop runSequence before it reaches answers
      await stopTTS();
      setAudioPlaying(false);
    } else {
      manualRestartRef.current = true;  // skip 1s delay on manual restart
      setAudioRestartKey(k => k + 1);
    }
  };

  // Questions: tap 🔊 → stop sequence, move highlight, restart sequence from that answer
  const handleAnswerAudioPress = useCallback(async (index: number) => {
    setPlayingAnswerIndex(index);          // move yellow highlight immediately
    sequenceCancelledRef.current = true;   // stop current sequence
    await stopTTS();                       // stop current audio
    replayFromAnswerRef.current = index;   // runSequence will start from this answer
    setAudioRestartKey(k => k + 1);       // trigger runSequence
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Questions: answer selection (tap or voice)
  const handleAnswerSelect = useCallback((answerIndex: number) => {
    if (answeredIndex !== null) return;
    if (!currentQ) return;
    const selected = currentQ.answers[answerIndex];
    if (!selected) return;

    cancelListening();
    stopTTS().then(() => setAudioPlaying(false)).catch(() => {});
    setPlayingAnswerIndex(null);
    setAnsweredIndex(answerIndex);

    // Build feedback TTS text once (not on every re-render)
    const correctText = currentQ.answers.find(a => a.is_correct)?.text_amharic ?? '';
    setFeedbackTTSText(
      selected.is_correct
        ? `${randomPraise()} ${correctText}`
        : `ስህተት! ትክክለኛው መልስ: ${correctText}`
    );

    Haptics.notificationAsync(
      selected.is_correct
        ? Haptics.NotificationFeedbackType.Success
        : Haptics.NotificationFeedbackType.Error
    ).catch(() => {});

    setTimeout(() => setShowFeedback(true), 300);
  }, [answeredIndex, currentQ, cancelListening]); // eslint-disable-line react-hooks/exhaustive-deps

  answerCallbackRef.current = handleAnswerSelect;

  // Questions: mic button
  const handleVoicePress = useCallback(async () => {
    if (voiceState === 'listening') {
      await stopListening();
    } else if (voiceState === 'idle' || voiceState === 'failed') {
      await startListening();
    }
  }, [voiceState, startListening, stopListening]);

  // Questions: navigate to a different question index
  const navigateToQuestion = useCallback((newIndex: number) => {
    if (newIndex < 0 || newIndex >= questions.length) return;
    stopTTS().catch(() => {});
    cancelListening();
    setAnsweredIndex(null);
    setShowFeedback(false);
    setFeedbackTTSText('');
    setPlayingAnswerIndex(null);
    voiceFailedRef.current = false;
    setQIndex(newIndex);
  }, [questions.length, cancelListening]); // eslint-disable-line react-hooks/exhaustive-deps

  // After feedback: go to next question or complete
  const handleNext = useCallback(() => {
    const next = qIndex + 1;
    if (next < questions.length) navigateToQuestion(next);
    else setPhase('complete');
  }, [qIndex, questions.length, navigateToQuestion]);

  // Subtopic navigation (used in both phases)
  const navToSubtopic = async (sub: typeof prevSubtopic) => {
    if (!sub) return;
    Haptics.selectionAsync();
    await stopTTS();
    await soundRef.current?.stopAsync().catch(() => {});
    soundRef.current = null;
    cancelListening();
    router.replace(
      `/(engineA)/behavioral-subtopic/${sub.id}?topicId=${topicId}&levelId=${levelId}` as any
    );
  };

  // ── Answer card state helper ──────────────────────────────────────────────────
  const answerCardState = (index: number) => {
    if (answeredIndex === null) {
      if (playingAnswerIndex === index) return 'reading' as const;
      return voiceState === 'failed' ? 'highlight' as const : 'default' as const;
    }
    const answer = currentQ?.answers[index];
    if (index === answeredIndex)  return answer?.is_correct ? 'correct' as const : 'wrong' as const;
    if (answer?.is_correct)       return 'correct' as const;
    return 'default' as const;
  };

  const narIcon   = narState === 'playing' ? '⏸' : '▶️';
  const audioIcon = audioPlaying            ? '⏸' : '▶️';

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.safeArea}>

      {/* ════════════════════ PHASE: EXPLANATION ════════════════════ */}
      {phase === 'explanation' && (
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>

          <TouchableOpacity style={styles.backButton} onPress={handleBack}>
            <Text style={styles.backIcon}>←</Text>
          </TouchableOpacity>

          {/* Large image / icon — dual layout when image_url_2 exists */}
          <View style={styles.imageContainer}>
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
              <Image source={{ uri: subtopic.image_url }} style={styles.fullImage} resizeMode="contain" />
            ) : (
              <View style={styles.imagePlaceholder}>
                <Text style={{ fontSize: 80 }}>{subtopic.icon}</Text>
              </View>
            )}
          </View>

          {/* Control row: prev | narration | next */}
          <View style={styles.controlRow}>
            <TouchableOpacity
              style={[styles.navBtn, !prevSubtopic && styles.navBtnDisabled]}
              onPress={() => navToSubtopic(prevSubtopic)}
              disabled={!prevSubtopic}
            >
              <Text style={[styles.navBtnIcon, !prevSubtopic && styles.navBtnIconDisabled]}>⬅️</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.audioBtn} onPress={handleNarBtn}>
              <Text style={styles.audioBtnIcon}>{narIcon}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.navBtn, !nextSubtopic && styles.navBtnDisabled]}
              onPress={() => navToSubtopic(nextSubtopic)}
              disabled={!nextSubtopic}
            >
              <Text style={[styles.navBtnIcon, !nextSubtopic && styles.navBtnIconDisabled]}>➡️</Text>
            </TouchableOpacity>
          </View>

          {/* Quiz button */}
          <TouchableOpacity style={styles.startQuizBtn} onPress={handleStartQuiz} activeOpacity={0.85}>
            <Text style={styles.startQuizIcon}>📝</Text>
          </TouchableOpacity>

        </ScrollView>
      )}

      {/* ════════════════════ PHASE: QUESTIONS ════════════════════ */}
      {phase === 'questions' && currentQ && (
        <ScrollView
          contentContainerStyle={styles.scrollContentQ}
          showsVerticalScrollIndicator={false}
          scrollEnabled={!showFeedback}
        >
          <TouchableOpacity style={styles.backButton} onPress={handleBack}>
            <Text style={styles.backIcon}>←</Text>
          </TouchableOpacity>

          {/* Small subtopic image */}
          <View style={styles.signImageContainer}>
            {subtopic.image_url ? (
              <Image source={{ uri: subtopic.image_url }} style={styles.signImage} resizeMode="contain" />
            ) : (
              <View style={[styles.signImageContainer, styles.signImagePlaceholder]}>
                <Text style={{ fontSize: 72 }}>{subtopic.icon}</Text>
              </View>
            )}
          </View>

          {/* Progress dots with ⬅️ ➡️ question navigation */}
          <View style={styles.progressRowWithNav}>
            <TouchableOpacity
              style={[styles.qNavBtn, qIndex === 0 && styles.navBtnDisabled]}
              onPress={() => navigateToQuestion(qIndex - 1)}
              disabled={qIndex === 0}
            >
              <Text style={[styles.navBtnIcon, qIndex === 0 && styles.navBtnIconDisabled]}>⬅️</Text>
            </TouchableOpacity>

            <View style={styles.progressRow}>
              {questions.map((_, i) => (
                <View
                  key={i}
                  style={[
                    styles.progressDot,
                    i < qIndex   && styles.progressDotDone,
                    i === qIndex && styles.progressDotActive,
                  ]}
                />
              ))}
            </View>

            <TouchableOpacity
              style={[styles.qNavBtn, qIndex === questions.length - 1 && styles.navBtnDisabled]}
              onPress={() => navigateToQuestion(qIndex + 1)}
              disabled={qIndex === questions.length - 1}
            >
              <Text style={[styles.navBtnIcon, qIndex === questions.length - 1 && styles.navBtnIconDisabled]}>➡️</Text>
            </TouchableOpacity>
          </View>

          {/* Control row: prev subtopic | audio | next subtopic */}
          <View style={styles.controlRow}>
            <TouchableOpacity
              style={[styles.navBtn, !prevSubtopic && styles.navBtnDisabled]}
              onPress={() => navToSubtopic(prevSubtopic)}
              disabled={!prevSubtopic}
            >
              <Text style={[styles.navBtnIcon, !prevSubtopic && styles.navBtnIconDisabled]}>⬅️</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.audioBtn} onPress={handleAudioBtn}>
              <Text style={styles.audioBtnIcon}>{audioIcon}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.navBtn, !nextSubtopic && styles.navBtnDisabled]}
              onPress={() => navToSubtopic(nextSubtopic)}
              disabled={!nextSubtopic}
            >
              <Text style={[styles.navBtnIcon, !nextSubtopic && styles.navBtnIconDisabled]}>➡️</Text>
            </TouchableOpacity>
          </View>

          {/* 4 numbered answer cards (no images — placeholder with number badge) */}
          <View style={styles.answersRow}>
            {currentQ.answers.map((_, index) => (
              <ImageAnswerCard
                key={index}
                index={index}
                imageUri={undefined}
                cardState={answerCardState(index)}
                onPress={() => handleAnswerSelect(index)}
                onAudioPress={() => handleAnswerAudioPress(index)}
                disabled={answeredIndex !== null}
              />
            ))}
          </View>

          {/* Microphone button */}
          {answeredIndex === null && (
            <VoiceAnswerButton
              state={voiceState}
              onPress={handleVoicePress}
              size={100}
              showFailedText={false}
            />
          )}
        </ScrollView>
      )}

      {/* ════════════════════ PHASE: COMPLETE ════════════════════ */}
      {phase === 'complete' && (
        <View style={styles.center}>
          <Text style={{ fontSize: 80 }}>✅</Text>
          <TouchableOpacity
            style={[styles.startQuizBtn, { backgroundColor: levelColor }]}
            onPress={handleBack}
          >
            <Text style={{ fontSize: 36, color: '#fff' }}>←</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* AudioFeedback overlay — sibling of ScrollView so it covers the whole screen */}
      {showFeedback && phase === 'questions' && currentQ && (
        <AudioFeedback
          isCorrect={!!(answeredIndex !== null && currentQ.answers[answeredIndex]?.is_correct)}
          explanationAudioUri=""
          ttsText={feedbackTTSText}
          onNext={handleNext}
        />
      )}

    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  safeArea:      { flex: 1, backgroundColor: Colors.background },
  scrollContent:  { padding: 16, alignItems: 'center', gap: 24 },
  // Questions phase needs extra bottom padding so the mic button isn't clipped
  scrollContentQ: { padding: 16, paddingBottom: 140, alignItems: 'center', gap: 24 },
  center:        { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 24 },

  backButton: {
    width: 52, height: 52, borderRadius: 26,
    backgroundColor: Colors.card,
    justifyContent: 'center', alignItems: 'center', alignSelf: 'flex-start',
  },
  backIcon: { fontSize: 24, color: Colors.textPrimary },

  // ── Explanation phase ────────────────────────────────────────────────────────
  imageContainer: {
    width: '100%', aspectRatio: 1,
    borderRadius: 16, overflow: 'hidden',
    backgroundColor: '#FFFFFF',
  },
  fullImage:       { width: '100%', height: '100%' },
  imagePlaceholder: {
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

  startQuizBtn: {
    width: 120, height: 120, borderRadius: 60,
    backgroundColor: '#27AE60',
    justifyContent: 'center', alignItems: 'center',
    shadowColor: '#27AE60', shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.6, shadowRadius: 20, elevation: 12,
  },
  startQuizIcon: { fontSize: 56 },

  // ── Shared control row ───────────────────────────────────────────────────────
  controlRow: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', gap: 20,
  },
  navBtn: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: Colors.card,
    justifyContent: 'center', alignItems: 'center',
  },
  navBtnDisabled:    { opacity: 0.3 },
  navBtnIcon:        { fontSize: 28 },
  navBtnIconDisabled: { opacity: 0.4 },
  audioBtn: {
    width: 88, height: 88, borderRadius: 44,
    backgroundColor: Colors.secondary,
    justifyContent: 'center', alignItems: 'center',
    shadowColor: Colors.secondary, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4, shadowRadius: 10, elevation: 6,
  },
  audioBtnIcon: { fontSize: 36 },

  // ── Questions phase ──────────────────────────────────────────────────────────
  signImageContainer: {
    width: 200, height: 200,
    borderRadius: 20, overflow: 'hidden',
    backgroundColor: '#FFFFFF',
  },
  signImagePlaceholder: {
    justifyContent: 'center', alignItems: 'center',
    backgroundColor: Colors.card,
  },
  signImage: { width: '100%', height: '100%', backgroundColor: '#FFFFFF' },

  progressRowWithNav: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', gap: 16,
  },
  progressRow: {
    flexDirection: 'row', gap: 12, alignItems: 'center',
  },
  qNavBtn: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: Colors.card,
    justifyContent: 'center', alignItems: 'center',
  },
  progressDot: {
    width: 12, height: 12, borderRadius: 6,
    backgroundColor: Colors.progressTrack,
  },
  progressDotDone:   { backgroundColor: Colors.primary },
  progressDotActive: { backgroundColor: Colors.secondary, width: 20 },

  answersRow: {
    flexDirection: 'row', flexWrap: 'wrap',
    gap: 16, justifyContent: 'center',
    paddingHorizontal: 16,
  },
});
