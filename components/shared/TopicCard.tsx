/**
 * AGENT 3 — components/shared/TopicCard.tsx
 * Topic selection card — used on the Home screen for both Engine A and B.
 *
 * Engine A: shows icon + audio speaker only (no text label)
 * Engine B: shows icon + Amharic text label
 */

import React from 'react';
import {
  TouchableOpacity,
  View,
  Text,
  StyleSheet,
  ViewStyle,
  Animated,
} from 'react-native';
import { Colors } from '../../constants/colors';
import { Typography } from '../../constants/typography';
import { DBTopic } from '../../backend/supabaseClient';
import { AudioButton } from './AudioButton';
import { TrafficSignIcon, TOPIC_SUBTOPIC_COUNT } from './TrafficSignIcon';

// ─── Types ────────────────────────────────────────────────────────────────────

interface TopicCardProps {
  topic: DBTopic;
  /** Show text labels (Engine B) or icon-only (Engine A) */
  showText?: boolean;
  /** Called when topic is selected */
  onPress: (topic: DBTopic) => void;
  /** Whether this topic has been visited */
  isVisited?: boolean;
  /** Progress 0-100 */
  progressPercent?: number;
  /** Style override */
  style?: ViewStyle;
  /** Override border/accent color */
  accentColor?: string;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function TopicCard({
  topic,
  showText = true,
  onPress,
  isVisited = false,
  progressPercent = 0,
  style,
  accentColor,
}: TopicCardProps) {
  const scaleAnim = React.useRef(new Animated.Value(1)).current;

  const handlePressIn = () => {
    Animated.spring(scaleAnim, { toValue: 0.95, useNativeDriver: true, speed: 20 }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scaleAnim, { toValue: 1.0, useNativeDriver: true, speed: 20 }).start();
  };

  const topicColor = accentColor ?? topic.color ?? Colors.primary;

  return (
    <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
      <TouchableOpacity
        onPress={() => onPress(topic)}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        accessibilityLabel={topic.name_amharic}
        accessibilityRole="button"
        activeOpacity={1}
        style={[
          styles.card,
          isVisited && styles.cardVisited,
          style,
        ]}
      >
        {/* Traffic sign icon */}
        <View style={[styles.iconContainer, { backgroundColor: topicColor + '15' }]}>
          <TrafficSignIcon topicId={topic.id} size={44} />
        </View>

        {/* Text (Engine B only) */}
        {showText && (
          <View style={styles.textContainer}>
            <Text style={styles.title} numberOfLines={2}>
              {topic.name_amharic}
            </Text>
            <Text style={styles.subtitle}>
              {topic.sign_count > 0
                ? `${topic.sign_count} ምልክቶች`
                : `${TOPIC_SUBTOPIC_COUNT[topic.id] ?? 0} ደረጃዎች`}
            </Text>
          </View>
        )}

        {/* Audio button removed — Engine B users can read */}

        {/* Progress bar at bottom */}
        {progressPercent > 0 && (
          <View style={styles.progressContainer}>
            <View
              style={[
                styles.progressFill,
                {
                  width: `${progressPercent}%`,
                  backgroundColor: topicColor,
                },
              ]}
            />
          </View>
        )}

        {/* Visited indicator */}
        {isVisited && (
          <View style={[styles.visitedDot, { backgroundColor: topicColor }]} />
        )}
      </TouchableOpacity>
    </Animated.View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  card: {
    flexDirection:   'row',
    alignItems:      'center',
    borderRadius:    16,
    padding:         16,
    marginBottom:    12,
    minHeight:       80,
    backgroundColor: '#ffffff',
    shadowColor:     '#000',
    shadowOffset:    { width: 0, height: 4 },
    shadowOpacity:   0.12,
    shadowRadius:    10,
    elevation:       5,
  },
  cardVisited: {
    opacity: 0.9,
  },
  iconContainer: {
    width:          84,
    height:         84,
    borderRadius:   42,
    justifyContent: 'center',
    alignItems:     'center',
    marginRight:    12,
  },
  icon: {
    fontSize: 64,
  },
  textContainer: {
    flex: 1,
    marginRight: 8,
  },
  title: {
    ...Typography.topicTitle,
    color: '#191c1e',
    marginBottom: 4,
  },
  subtitle: {
    ...Typography.bodySmall,
    color: '#404943',
  },
  audioBtn: {
    marginLeft: 'auto',
  },
  progressContainer: {
    position:        'absolute',
    bottom:          0,
    left:            0,
    right:           0,
    height:          3,
    backgroundColor: Colors.progressTrack,
  },
  progressFill: {
    height: '100%',
    borderRadius: 2,
  },
  visitedDot: {
    position:     'absolute',
    top:          8,
    right:        8,
    width:        10,
    height:       10,
    borderRadius: 5,
  },
});
