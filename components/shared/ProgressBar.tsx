/**
 * AGENT 3 — components/shared/ProgressBar.tsx
 * Animated progress bar for exam and topic progress.
 */

import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, ViewStyle } from 'react-native';
import { Colors } from '../../constants/colors';
import { Typography } from '../../constants/typography';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ProgressBarProps {
  /** Current value */
  current: number;
  /** Maximum value */
  total: number;
  /** Whether to show numeric label */
  showLabel?: boolean;
  /** Color of the fill bar */
  fillColor?: string;
  /** Height of the bar */
  height?: number;
  /** Style override */
  style?: ViewStyle;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ProgressBar({
  current,
  total,
  showLabel = false,
  fillColor = Colors.progressFill,
  height = 8,
  style,
}: ProgressBarProps) {
  const animatedWidth = useRef(new Animated.Value(0)).current;

  const percentage = total > 0 ? Math.min((current / total) * 100, 100) : 0;

  useEffect(() => {
    Animated.timing(animatedWidth, {
      toValue: percentage,
      duration: 400,
      useNativeDriver: false,
    }).start();
  }, [percentage]);

  const widthInterpolated = animatedWidth.interpolate({
    inputRange:  [0, 100],
    outputRange: ['0%', '100%'],
    extrapolate: 'clamp',
  });

  return (
    <View style={[styles.container, style]}>
      {showLabel && (
        <Text style={styles.label}>
          {current} / {total}
        </Text>
      )}
      <View style={[styles.track, { height }]}>
        <Animated.View
          style={[
            styles.fill,
            {
              width: widthInterpolated,
              backgroundColor: fillColor,
              height,
            },
          ]}
        />
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  label: {
    ...Typography.caption,
    color:        Colors.textSecondary,
    textAlign:    'right',
    marginBottom: 4,
  },
  track: {
    width:        '100%',
    backgroundColor: Colors.progressTrack,
    borderRadius: 8,
    overflow:     'hidden',
  },
  fill: {
    borderRadius: 8,
  },
});
