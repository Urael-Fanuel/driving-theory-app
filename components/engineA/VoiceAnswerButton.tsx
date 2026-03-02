/**
 * AGENT 3/4 — components/engineA/VoiceAnswerButton.tsx
 * Large animated microphone button for Engine A voice answers.
 *
 * States:
 * - IDLE: Blue circle, mic icon, subtle idle pulse
 * - LISTENING: Red circle, large pulse animation, "ይናገሩ..." text
 * - PROCESSING: Yellow circle, spinner
 * - FAILED: Gray, retry icon, plays "ዳግም ሞክር" audio
 *
 * Minimum size: 100x100 (large tap target for non-digital-native users)
 */

import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  ActivityIndicator,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { Colors } from '../../constants/colors';
import { Typography } from '../../constants/typography';

// ─── Types ────────────────────────────────────────────────────────────────────

export type VoiceButtonState = 'idle' | 'listening' | 'processing' | 'done' | 'failed';

interface VoiceAnswerButtonProps {
  state: VoiceButtonState;
  onPress: () => void;
  /** Size of the button (default: 100) */
  size?: number;
  /** Show "ያልተሰማ" error text on failed */
  showFailedText?: boolean;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function VoiceAnswerButton({
  state,
  onPress,
  size = 100,
  showFailedText = true,
}: VoiceAnswerButtonProps) {
  const pulseAnim  = useRef(new Animated.Value(1)).current;
  const pulseLoop  = useRef<Animated.CompositeAnimation | null>(null);
  const ringAnim   = useRef(new Animated.Value(0)).current;
  const ringLoop   = useRef<Animated.CompositeAnimation | null>(null);

  // Start/stop animations based on state
  useEffect(() => {
    // Clean up previous animations
    pulseLoop.current?.stop();
    ringLoop.current?.stop();
    pulseAnim.stopAnimation();
    ringAnim.stopAnimation();

    if (state === 'idle') {
      // Subtle breathing animation
      pulseLoop.current = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.05, duration: 1200, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1.0,  duration: 1200, useNativeDriver: true }),
        ])
      );
      pulseLoop.current.start();

    } else if (state === 'listening') {
      // Large pulse for listening state
      pulseLoop.current = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.2, duration: 400, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1.0, duration: 400, useNativeDriver: true }),
        ])
      );
      pulseLoop.current.start();

      // Expanding ring animation
      ringLoop.current = Animated.loop(
        Animated.sequence([
          Animated.timing(ringAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
          Animated.timing(ringAnim, { toValue: 0, duration: 0,   useNativeDriver: true }),
        ])
      );
      ringLoop.current.start();

    } else {
      // Reset to normal size for other states
      Animated.timing(pulseAnim, { toValue: 1.0, duration: 200, useNativeDriver: true }).start();
      Animated.timing(ringAnim,  { toValue: 0,   duration: 200, useNativeDriver: true }).start();
    }

    return () => {
      pulseLoop.current?.stop();
      ringLoop.current?.stop();
    };
  }, [state]);

  // Colors by state
  const bgColor = {
    idle:       Colors.micIdle,
    listening:  Colors.micListening,
    processing: Colors.micProcessing,
    done:       Colors.micSuccess,
    failed:     Colors.micFailed,
  }[state];

  // Icon by state
  const icon = {
    idle:       '🎤',
    listening:  '🎤',
    processing: '⏳',
    done:       '✅',
    failed:     '🔄',
  }[state];

  // Ring scale interpolation
  const ringScale = ringAnim.interpolate({
    inputRange:  [0, 1],
    outputRange: [1, 2.5],
  });
  const ringOpacity = ringAnim.interpolate({
    inputRange:  [0, 1],
    outputRange: [0.6, 0],
  });

  const handlePress = async () => {
    if (state === 'processing') return; // Can't interrupt processing
    await Haptics.impactAsync(
      state === 'idle' ? Haptics.ImpactFeedbackStyle.Heavy : Haptics.ImpactFeedbackStyle.Light
    );
    onPress();
  };

  return (
    <View style={styles.wrapper}>
      {/* Expanding ring (listening state) */}
      {state === 'listening' && (
        <Animated.View
          style={[
            styles.ring,
            {
              width:       size,
              height:      size,
              borderRadius: size / 2,
              borderColor: Colors.micListening,
              transform:   [{ scale: ringScale }],
              opacity:     ringOpacity,
            },
          ]}
        />
      )}

      {/* Main button */}
      <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
        <TouchableOpacity
          onPress={handlePress}
          activeOpacity={state === 'processing' ? 1 : 0.8}
          style={[
            styles.button,
            {
              width:           size,
              height:          size,
              borderRadius:    size / 2,
              backgroundColor: bgColor,
            },
          ]}
          accessibilityLabel="ድምጽ ለመናገር ጫን"
          accessibilityRole="button"
        >
          {state === 'processing' ? (
            <ActivityIndicator size="large" color={Colors.background} />
          ) : (
            <Text style={[styles.icon, { fontSize: size * 0.4 }]}>
              {icon}
            </Text>
          )}
        </TouchableOpacity>
      </Animated.View>

      {/* State label */}
      {state === 'listening' && (
        <Text style={styles.listeningText}>ይናገሩ...</Text>
      )}
      {state === 'processing' && (
        <Text style={styles.processingText}>እየሰማ ነው...</Text>
      )}
      {state === 'failed' && showFailedText && (
        <Text style={styles.failedText}>ቁጥሩን ይጫኑ</Text>
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  wrapper: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  ring: {
    position:    'absolute',
    borderWidth: 3,
  },
  button: {
    justifyContent: 'center',
    alignItems:     'center',
    shadowColor:    '#000',
    shadowOffset:   { width: 0, height: 8 },
    shadowOpacity:  0.4,
    shadowRadius:   12,
    elevation:      10,
  },
  icon: {
    textAlign: 'center',
  },
  listeningText: {
    ...Typography.body,
    color:     Colors.micListening,
    marginTop: 12,
    fontWeight: '700',
  },
  processingText: {
    ...Typography.body,
    color:     Colors.micProcessing,
    marginTop: 12,
  },
  failedText: {
    ...Typography.body,
    color:     Colors.textSecondary,
    marginTop: 12,
  },
});
