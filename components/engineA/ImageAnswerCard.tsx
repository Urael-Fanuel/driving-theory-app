/**
 * AGENT 3 — components/engineA/ImageAnswerCard.tsx
 * Answer choice card for Engine A — shows image + number (1, 2, or 3).
 * No Amharic text is shown (non-reader users).
 *
 * States:
 * - default: normal card
 * - selected: highlighted border
 * - correct: green background overlay
 * - wrong: red background overlay
 * - highlight: bounce animation (when voice fails, shows tap targets)
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

type CardState = 'default' | 'selected' | 'correct' | 'wrong' | 'highlight' | 'reading';

interface ImageAnswerCardProps {
  /** Answer index: 0, 1, 2 → displayed as 1, 2, 3 */
  index: number;
  /** Image URI for the answer */
  imageUri?: string;
  /** Current visual state */
  cardState?: CardState;
  /** Called when user taps this answer */
  onPress?: () => void;
  /** Called when user taps the 🔊 audio button (plays answer audio without selecting) */
  onAudioPress?: () => void;
  /** Whether interaction is disabled (after answering) */
  disabled?: boolean;
  /** Style override */
  style?: ViewStyle;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ImageAnswerCard({
  index,
  imageUri,
  cardState = 'default',
  onPress,
  onAudioPress,
  disabled = false,
  style,
}: ImageAnswerCardProps) {
  const bounceAnim = useRef(new Animated.Value(1)).current;
  const bounceLoop = useRef<Animated.CompositeAnimation | null>(null);

  // Bounce when highlighted (voice fallback) or reading (answer audio playing)
  useEffect(() => {
    if (cardState === 'highlight' || cardState === 'reading') {
      const toValue = cardState === 'reading' ? 1.12 : 1.08;
      bounceLoop.current = Animated.loop(
        Animated.sequence([
          Animated.timing(bounceAnim, { toValue, duration: 300, useNativeDriver: true }),
          Animated.timing(bounceAnim, { toValue: 1.0, duration: 300, useNativeDriver: true }),
        ])
      );
      bounceLoop.current.start();
    } else {
      bounceLoop.current?.stop();
      Animated.timing(bounceAnim, { toValue: 1.0, duration: 200, useNativeDriver: true }).start();
    }

    return () => bounceLoop.current?.stop();
  }, [cardState]);

  const handlePress = async () => {
    if (disabled) return;
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onPress?.();
  };

  // Border/background based on state
  const getStateStyle = (): ViewStyle => {
    switch (cardState) {
      case 'correct':  return { borderColor: Colors.correct, borderWidth: 3, backgroundColor: Colors.correctDark };
      case 'wrong':    return { borderColor: Colors.wrong,   borderWidth: 3, backgroundColor: Colors.wrongDark };
      case 'selected': return { borderColor: Colors.secondary, borderWidth: 3 };
      case 'highlight': return { borderColor: Colors.secondary, borderWidth: 2 };
      case 'reading':  return {
        borderColor:   Colors.secondary,
        borderWidth:   4,
        shadowColor:   Colors.secondary,
        shadowOffset:  { width: 0, height: 0 },
        shadowOpacity: 0.9,
        shadowRadius:  10,
        elevation:     10,
      };
      default:          return { borderColor: Colors.border, borderWidth: 1 };
    }
  };

  const number = index + 1; // 0→1, 1→2, 2→3

  return (
    <Animated.View style={[{ transform: [{ scale: bounceAnim }] }, style]}>
      <TouchableOpacity
        onPress={handlePress}
        activeOpacity={disabled ? 1 : 0.8}
        style={[styles.card, getStateStyle()]}
        accessibilityLabel={`${number}`}
        accessibilityRole="button"
      >
        {/* Answer image */}
        <View style={styles.imageContainer}>
          {imageUri ? (
            <Image
              source={{ uri: imageUri }}
              style={styles.image}
              resizeMode="contain"
            />
          ) : (
            // Placeholder if no image
            <View style={styles.imagePlaceholder}>
              <Text style={styles.imagePlaceholderText}>—</Text>
            </View>
          )}
        </View>

        {/* Result overlay */}
        {(cardState === 'correct' || cardState === 'wrong') && (
          <View style={styles.overlay}>
            <Text style={styles.overlayIcon}>
              {cardState === 'correct' ? '✅' : '❌'}
            </Text>
          </View>
        )}

        {/* Number badge */}
        <View style={[
          styles.numberBadge,
          cardState === 'correct' && { backgroundColor: Colors.correct },
          cardState === 'wrong' && { backgroundColor: Colors.wrong },
        ]}>
          <Text style={styles.numberText}>{number}</Text>
        </View>

        {/* Audio button — top-right corner; plays answer audio without selecting */}
        {onAudioPress && (
          <TouchableOpacity
            style={styles.audioButton}
            onPress={onAudioPress}
            accessibilityLabel="ድምጽ አዳምጥ"
            hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
          >
            <Text style={styles.audioIcon}>🔊</Text>
          </TouchableOpacity>
        )}
      </TouchableOpacity>
    </Animated.View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  card: {
    width:           100,
    height:          100,
    borderRadius:    16,
    backgroundColor: Colors.card,
    overflow:        'hidden',
    position:        'relative',
  },
  imageContainer: {
    flex: 1,
  },
  image: {
    width:           '100%',
    height:          '100%',
    backgroundColor: '#FFFFFF',
  },
  imagePlaceholder: {
    flex:            1,
    justifyContent:  'center',
    alignItems:      'center',
    backgroundColor: Colors.surface,
  },
  imagePlaceholderText: {
    fontSize: 24,
    color:    Colors.textMuted,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent:  'center',
    alignItems:      'center',
    backgroundColor: Colors.overlay,
  },
  overlayIcon: {
    fontSize: 40,
  },
  numberBadge: {
    position:        'absolute',
    bottom:          6,
    left:            6,
    width:           28,
    height:          28,
    borderRadius:    14,
    backgroundColor: Colors.background,
    justifyContent:  'center',
    alignItems:      'center',
  },
  numberText: {
    ...Typography.numberSmall,
    color:    Colors.textPrimary,
    fontSize: 16,
    lineHeight: 20,
  },
  audioButton: {
    position:        'absolute',
    top:             4,
    right:           4,
    width:           26,
    height:          26,
    borderRadius:    13,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent:  'center',
    alignItems:      'center',
  },
  audioIcon: {
    fontSize: 12,
  },
});
