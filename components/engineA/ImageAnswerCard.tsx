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

// ─── Sizing — single source of truth for every 2×2 answer grid in Engine A ────
// (topic-quiz, exam, practice, question, behavioral-subtopic).
//
// First attempt (2026-09-11) computed the largest size that still fit 2
// cards horizontally on the device — up to 187px on a large phone. The app
// owner tested it and it was too big VERTICALLY: the question image above
// and the mic/audio controls below no longer fit on one screen together
// without scrolling. Horizontal fit alone was the wrong constraint — fixed
// to a modest, fixed increase over the original 100px instead (same value
// on every device, not device-width-dependent), which also fixes the
// vertical-space problem since it no longer grows with screen width.
//
// Screens import ANSWER_ROW_MAX_WIDTH for their row container's maxWidth;
// this component defaults to ANSWER_CARD_SIZE itself, so no screen needs to
// pass a size prop unless it wants to override.
/** Gap between the 2 cards in a row — unified across all 5 screens (was 14 in
 *  some, 16 in others; keeping the layout truly identical everywhere means
 *  picking one value, per the app owner's explicit "no exceptions" request,
 *  2026-09-11). */
export const ANSWER_ROW_GAP = 16;
/** +15% over the original 100px — settled here 2026-09-11 after trying
 *  130px and 120px (both too big alongside a readable question image), not
 *  the max that horizontally fits (that broke vertical fit — see above). */
export const ANSWER_CARD_SIZE = 115;
export const ANSWER_ROW_MAX_WIDTH = ANSWER_CARD_SIZE * 2 + ANSWER_ROW_GAP;

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
  /** Card width/height in px. Defaults to the shared ANSWER_CARD_SIZE —
   *  pass this only to deliberately deviate from every other screen. */
  size?: number;
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
  size = ANSWER_CARD_SIZE,
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
      default:          return {};
    }
  };

  const number = index + 1; // 0→1, 1→2, 2→3

  return (
    <Animated.View style={[{ transform: [{ scale: bounceAnim }] }, style]}>
      {/* Outer wrapper — carries the shadow and lets the audio badge overflow */}
      <View style={[styles.cardWrapper, { width: size, height: size }]}>

        {/* Card — overflow:hidden clips the image to border radius */}
        <TouchableOpacity
          onPress={handlePress}
          activeOpacity={disabled ? 1 : 0.8}
          style={[styles.card, { width: size, height: size }, getStateStyle()]}
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
              <View style={styles.imagePlaceholder} />
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
        </TouchableOpacity>

        {/* Number badge — outside overflow:hidden so it is never clipped
            by the card's border-radius clip or the reading-state scale animation.
            Positioned relative to cardWrapper (same visual position as before). */}
        <View style={[
          styles.numberBadge,
          cardState === 'correct' && { backgroundColor: Colors.correct },
          cardState === 'wrong'   && { backgroundColor: Colors.wrong },
        ]}>
          <Text style={[
            styles.numberText,
            (cardState === 'correct' || cardState === 'wrong') && { color: '#ffffff' },
          ]}>
            {number}
          </Text>
        </View>

        {/* 🔊 audio badge — floats from the top-right corner of the card.
            Clearly separate from the card tap area → no confusion. */}
        {onAudioPress && (
          <TouchableOpacity
            style={[
              styles.audioBadge,
              cardState === 'reading' && styles.audioBadgeActive,
            ]}
            onPress={onAudioPress}
            activeOpacity={0.7}
            accessibilityLabel="ድምጽ አዳምጥ"
            hitSlop={{ top: 6, right: 6, bottom: 6, left: 6 }}
          >
            <Text style={styles.audioBadgeIcon}>🔊</Text>
          </TouchableOpacity>
        )}

      </View>
    </Animated.View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  cardWrapper: {
    // width/height come from the `size` prop, applied inline — see JSX above.
    position:      'relative',
    borderRadius:  16,
    shadowColor:   '#000',
    shadowOffset:  { width: 0, height: 3 },
    shadowOpacity: 0.12,
    shadowRadius:  6,
    elevation:     4,
  },
  card: {
    // width/height come from the `size` prop, applied inline — see JSX above.
    borderRadius:    16,
    backgroundColor: '#ffffff',
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
    backgroundColor: '#FFFFFF',
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
    backgroundColor: 'rgba(255,255,255,0.82)',
    justifyContent:  'center',
    alignItems:      'center',
    zIndex:          12,  // above card content (reading state uses zIndex 10), below audio badge (20)
    elevation:       12,  // Android z-order — above card's reading elevation (10)
  },
  numberText: {
    ...Typography.numberSmall,
    color:      '#757575',
    fontSize:   16,
    lineHeight: 20,
    fontWeight: '700',
  },
  audioBadge: {
    position:        'absolute',
    top:             6,
    right:           6,
    width:           40,
    height:          40,
    borderRadius:    20,
    backgroundColor: '#ffffff',
    justifyContent:  'center',
    alignItems:      'center',
    shadowColor:     '#000',
    shadowOffset:    { width: 0, height: 2 },
    shadowOpacity:   0.22,
    shadowRadius:    4,
    elevation:       16,
    zIndex:          20,
  },
  audioBadgeActive: {
    backgroundColor: '#FDD835',
  },
  audioBadgeIcon: {
    fontSize: 20,
  },
});
