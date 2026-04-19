/**
 * components/shared/AudioButton.tsx
 * Speaker button with play / pause / resume support.
 *
 * Behaviour:
 *   • Tap when idle/finished  → starts playing  (🔊)
 *   • Tap while playing       → pauses          (⏸)
 *   • Tap while paused        → resumes         (▶️)
 *   • If another audio starts → resets to idle  (🔊)
 */

import React, { useEffect, useState } from 'react';
import {
  TouchableOpacity,
  StyleSheet,
  ViewStyle,
  Animated,
} from 'react-native';
import { Colors } from '../../constants/colors';
import { useAudio } from '../../hooks/useAudio';

// ─── Types ────────────────────────────────────────────────────────────────────

interface AudioButtonProps {
  /** URI of the audio to play */
  audioUri: string;
  /** Size of the button (default: 64) */
  size?: number;
  /** Whether to auto-play on mount */
  autoPlay?: boolean;
  /** Called when audio finishes */
  onFinish?: () => void;
  /** Accessibility label */
  label?: string;
  /** Override container style */
  style?: ViewStyle;
  /** Variant: 'primary' (yellow) | 'secondary' (white) | 'ghost' */
  variant?: 'primary' | 'secondary' | 'ghost';
}

// ─── Component ────────────────────────────────────────────────────────────────

export function AudioButton({
  audioUri,
  size = 64,
  autoPlay = false,
  onFinish,
  label = 'ድምጽ ያዳምጡ',
  style,
  variant = 'primary',
}: AudioButtonProps) {
  const { playAudio, pauseAudio, resumeAudio, audioState } = useAudio();

  // Track whether THIS button is the one that owns the current audio session
  const [isThisActive, setIsThisActive] = useState(false);

  const pulseAnim = React.useRef(new Animated.Value(1)).current;

  // Auto-play on mount
  useEffect(() => {
    if (autoPlay && audioUri) {
      setIsThisActive(true);
      playAudio(audioUri).catch(() => {});
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audioUri, autoPlay]);

  // When audio finishes / errors / goes idle — this button is no longer active
  useEffect(() => {
    if (audioState === 'finished' || audioState === 'idle' || audioState === 'error') {
      if (isThisActive) {
        setIsThisActive(false);
        if (audioState === 'finished' && onFinish) onFinish();
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audioState]);

  // Pulsing animation while this button is playing
  const isThisPlaying = isThisActive && audioState === 'playing';

  useEffect(() => {
    if (isThisPlaying) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.15, duration: 400, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1.0,  duration: 400, useNativeDriver: true }),
        ])
      ).start();
    } else {
      pulseAnim.stopAnimation();
      Animated.timing(pulseAnim, { toValue: 1.0, duration: 200, useNativeDriver: true }).start();
    }
  }, [isThisPlaying]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Press handler ────────────────────────────────────────────────────────────

  const handlePress = async () => {
    if (isThisActive && audioState === 'playing') {
      // Pause
      await pauseAudio();
    } else if (isThisActive && audioState === 'paused') {
      // Resume from where it stopped
      await resumeAudio();
    } else {
      // Start playing (stops whatever else was playing)
      setIsThisActive(true);
      await playAudio(audioUri);
    }
  };

  // ── Icon & colours based on state ────────────────────────────────────────────

  // Show ⏸ while this button owns the audio — both during loading and playing.
  // This prevents the ▶️ flash that would otherwise appear during the 'loading' phase.
  const icon = isThisActive && (audioState === 'playing' || audioState === 'loading') ? '⏸'
             : '▶️';

  const bgColor = variant === 'primary'
    ? (isThisPlaying ? Colors.primary : Colors.secondary)
    : variant === 'secondary'
    ? Colors.textPrimary
    : Colors.transparent;

  const iconColor = variant === 'primary'
    ? (isThisPlaying ? Colors.textPrimary : Colors.background)
    : Colors.background;

  return (
    <Animated.View style={[{ transform: [{ scale: pulseAnim }] }, style]}>
      <TouchableOpacity
        onPress={handlePress}
        style={[
          styles.button,
          {
            width:           size,
            height:          size,
            borderRadius:    size / 2,
            backgroundColor: bgColor,
          },
        ]}
        accessibilityLabel={label}
        accessibilityRole="button"
        activeOpacity={0.8}
      >
        <Animated.Text
          style={[
            styles.icon,
            { fontSize: size * 0.45, color: iconColor },
          ]}
        >
          {icon}
        </Animated.Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  button: {
    justifyContent: 'center',
    alignItems:     'center',
    shadowColor:    '#000',
    shadowOffset:   { width: 0, height: 4 },
    shadowOpacity:  0.3,
    shadowRadius:   8,
    elevation:      6,
  },
  icon: {
    textAlign: 'center',
  },
});
