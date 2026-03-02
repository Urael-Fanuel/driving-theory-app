/**
 * AGENT 3 — components/shared/AudioButton.tsx
 * Large speaker button for playing audio.
 *
 * Used throughout the app for:
 * - Topic intro audio
 * - Sign name/explanation audio
 * - Question audio
 * - Feedback audio
 *
 * Design: Yellow circle with speaker icon, accessible, minimum 60x60
 */

import React, { useEffect } from 'react';
import {
  TouchableOpacity,
  StyleSheet,
  ViewStyle,
  Animated,
  View,
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
  const { playAudio, isPlaying, audioState } = useAudio();
  const pulseAnim = React.useRef(new Animated.Value(1)).current;

  // Auto-play on mount
  useEffect(() => {
    if (autoPlay && audioUri) {
      playAudio(audioUri).then(() => {
        if (audioState === 'finished' && onFinish) onFinish();
      });
    }
  }, [audioUri, autoPlay]);

  // Pulsing animation while playing
  useEffect(() => {
    if (isPlaying) {
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
  }, [isPlaying]);

  const handlePress = async () => {
    await playAudio(audioUri);
  };

  // Get colors based on variant
  const bgColor = variant === 'primary'
    ? (isPlaying ? Colors.primary : Colors.secondary)
    : variant === 'secondary'
    ? Colors.textPrimary
    : Colors.transparent;

  const iconColor = variant === 'primary'
    ? (isPlaying ? Colors.textPrimary : Colors.background)
    : Colors.background;

  return (
    <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
      <TouchableOpacity
        onPress={handlePress}
        style={[
          styles.button,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: bgColor,
          },
          style,
        ]}
        accessibilityLabel={label}
        accessibilityRole="button"
        activeOpacity={0.8}
      >
        {/* Speaker icon using unicode character */}
        <Animated.Text
          style={[
            styles.icon,
            {
              fontSize: size * 0.45,
              color: iconColor,
            },
          ]}
        >
          {isPlaying ? '🔊' : '🔈'}
        </Animated.Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  button: {
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  icon: {
    textAlign: 'center',
  },
});
