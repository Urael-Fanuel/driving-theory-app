/**
 * AGENT 3/5 — components/engineA/SignVideoPlayer.tsx
 * Full-screen video player for Engine A.
 *
 * Layout:
 * ┌─────────────────────┐
 * │   [← Back]          │
 * │                     │
 * │   VIDEO PLAYER      │  ← Full width, 280px height
 * │   (tap to pause)    │
 * │                     │
 * ├─────────────────────┤
 * │  [🔊 Play Again]   │  ← Large audio replay button
 * ├─────────────────────┤
 * │  [Start Quiz →]     │  ← Large green button, audio label
 * └─────────────────────┘
 *
 * Behavior:
 * - Video auto-plays on mount
 * - Tap to pause/resume
 * - After video ends: "Start Quiz" button pulses
 * - Uses react-native-video
 */

import React, { useRef, useState } from 'react';
import {
  View,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Text,
  ViewStyle,
} from 'react-native';
import { Video, ResizeMode, AVPlaybackStatus } from 'expo-av';
import * as Haptics from 'expo-haptics';
import { Colors } from '../../constants/colors';
import { Typography } from '../../constants/typography';

// ─── Types ────────────────────────────────────────────────────────────────────

interface SignVideoPlayerProps {
  videoUrl: string;
  thumbnailUrl?: string;
  onVideoEnd?: () => void;
  onReplayPress?: () => void;
  style?: ViewStyle;
  /** Freeze the video (pause it externally, e.g. when audio narration ends) */
  paused?: boolean;
  /** Video volume: 0 = muted, 1 = full (default 1) */
  volume?: number;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function SignVideoPlayer({
  videoUrl,
  thumbnailUrl,
  onVideoEnd,
  onReplayPress,
  style,
  paused = false,
  volume = 1,
}: SignVideoPlayerProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [isPaused,  setIsPaused]  = useState(false);
  const [hasError,  setHasError]  = useState(false);
  const videoRef = useRef<Video>(null);

  const handleEnd = async () => {
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onVideoEnd?.();
  };

  const handlePress = async () => {
    await Haptics.selectionAsync();
    setIsPaused(p => !p);
  };

  // ── Render ──────────────────────────────────────────────────────────────────
  if (hasError) {
    return (
      <View style={[styles.container, styles.errorContainer, style]}>
        <Text style={styles.errorIcon}>⚠️</Text>
        <Text style={styles.errorText}>ቪዲዮ አልተጫነም</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, style]}>
      <Video
        ref={videoRef}
        source={{ uri: videoUrl }}
        style={styles.video}
        resizeMode={ResizeMode.CONTAIN}
        shouldPlay={!isPaused && !paused}
        volume={volume}
        isLooping={false}
        useNativeControls={false}
        onLoad={() => setIsLoading(false)}
        onPlaybackStatusUpdate={(status: AVPlaybackStatus) => {
          if (!status.isLoaded) return;
          if (status.didJustFinish) handleEnd();
        }}
        onError={() => setHasError(true)}
      />

      {/* Loading indicator */}
      {isLoading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color={Colors.secondary} />
        </View>
      )}

      {/* Pause overlay */}
      {isPaused && !isLoading && (
        <View style={styles.pauseOverlay}>
          <Text style={styles.pauseIcon}>⏸</Text>
        </View>
      )}

      {/* Tap to pause/play */}
      <TouchableOpacity
        style={StyleSheet.absoluteFill}
        onPress={handlePress}
        activeOpacity={1}
      />

    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    width:           '100%',
    height:          280,
    backgroundColor: '#000',
    borderRadius:    16,
    overflow:        'hidden',
  },
  video: {
    width:  '100%',
    height: '100%',
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent:  'center',
    alignItems:      'center',
    backgroundColor: Colors.overlay,
  },
  pauseOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent:  'center',
    alignItems:      'center',
    backgroundColor: Colors.overlayLight,
  },
  pauseIcon: {
    fontSize: 64,
    color:    Colors.textPrimary,
    opacity:  0.8,
  },
  errorContainer: {
    justifyContent:  'center',
    alignItems:      'center',
    backgroundColor: Colors.surface,
  },
  errorIcon: {
    fontSize: 40,
  },
  errorText: {
    ...Typography.body,
    color:     Colors.textSecondary,
    marginTop: 8,
  },
});
