/**
 * AGENT 3 — components/engineB/TextAnswerCard.tsx
 * Written answer choice for Engine B.
 *
 * States:
 * - default: normal card with Amharic text
 * - selected: highlighted border
 * - correct: green background + ✅ icon
 * - wrong: red background + ❌ icon
 */

import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  StyleSheet,
  Animated,
  ViewStyle,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { Colors } from '../../constants/colors';
import { Typography } from '../../constants/typography';

// ─── Types ────────────────────────────────────────────────────────────────────

type CardState = 'default' | 'selected' | 'correct' | 'wrong';

interface TextAnswerCardProps {
  /** Answer ID: 'A', 'B', or 'C' */
  answerId: string;
  /** Amharic text for this answer */
  text: string;
  /** Optional image URI */
  imageUri?: string;
  /** Audio URI for this answer */
  audioUri?: string;
  /** Current state */
  cardState?: CardState;
  /** Called when tapped */
  onPress?: () => void;
  /** Disabled after answer submitted */
  disabled?: boolean;
  /** Style override */
  style?: ViewStyle;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function TextAnswerCard({
  answerId,
  text,
  imageUri,
  audioUri,
  cardState = 'default',
  onPress,
  disabled = false,
  style,
}: TextAnswerCardProps) {
  const pressScale = useRef(new Animated.Value(1)).current;

  const handlePress = async () => {
    if (disabled) return;
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onPress?.();
  };

  const handlePressIn = () => {
    if (!disabled) {
      Animated.spring(pressScale, { toValue: 0.97, useNativeDriver: true, speed: 30 }).start();
    }
  };

  const handlePressOut = () => {
    Animated.spring(pressScale, { toValue: 1.0, useNativeDriver: true, speed: 30 }).start();
  };

  // State-based styles
  const getCardStyle = (): ViewStyle => {
    switch (cardState) {
      case 'correct':
        return {
          backgroundColor: Colors.correctDark,
          borderColor:     Colors.correct,
          borderWidth:     2,
        };
      case 'wrong':
        return {
          backgroundColor: Colors.wrongDark,
          borderColor:     Colors.wrong,
          borderWidth:     2,
        };
      case 'selected':
        return {
          backgroundColor: Colors.cardActive,
          borderColor:     Colors.secondary,
          borderWidth:     2,
        };
      default:
        return {
          backgroundColor: Colors.card,
          borderColor:     Colors.border,
          borderWidth:     1,
        };
    }
  };

  const getLabelColor = (): string => {
    switch (cardState) {
      case 'correct': return Colors.correct;
      case 'wrong':   return Colors.wrong;
      case 'selected': return Colors.secondary;
      default:        return Colors.textSecondary;
    }
  };

  const resultIcon =
    cardState === 'correct' ? '✅' :
    cardState === 'wrong'   ? '❌' : null;

  return (
    <Animated.View style={[{ transform: [{ scale: pressScale }] }, style]}>
      <TouchableOpacity
        onPress={handlePress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        activeOpacity={disabled ? 1 : 0.9}
        style={[styles.card, getCardStyle()]}
        accessibilityLabel={text}
        accessibilityRole="button"
      >
        {/* Answer ID label (A, B, C) */}
        <View style={[styles.labelContainer, { borderColor: getLabelColor() }]}>
          <Text style={[styles.label, { color: getLabelColor() }]}>
            {answerId}
          </Text>
        </View>

        {/* Optional image */}
        {imageUri && (
          <Image
            source={{ uri: imageUri }}
            style={styles.answerImage}
            resizeMode="contain"
          />
        )}

        {/* Answer text */}
        <Text style={styles.answerText} numberOfLines={3}>
          {text}
        </Text>

        {/* Result icon */}
        {resultIcon && (
          <Text style={styles.resultIcon}>{resultIcon}</Text>
        )}
      </TouchableOpacity>
    </Animated.View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  card: {
    flexDirection:  'row',
    alignItems:     'center',
    borderRadius:   16,
    padding:        16,
    minHeight:      72,
    gap:            12,
  },
  labelContainer: {
    width:          36,
    height:         36,
    borderRadius:   18,
    borderWidth:    2,
    justifyContent: 'center',
    alignItems:     'center',
    flexShrink:     0,
  },
  label: {
    ...Typography.answer,
    fontWeight: '700',
    fontSize:   18,
    lineHeight: 22,
  },
  answerImage: {
    width:       48,
    height:      48,
    borderRadius: 8,
    flexShrink:  0,
  },
  answerText: {
    ...Typography.answer,
    color:    Colors.textPrimary,
    flex:     1,
    flexWrap: 'wrap',
  },
  resultIcon: {
    fontSize:  24,
    flexShrink: 0,
  },
});
