/**
 * AGENT 3 — components/shared/LoadingScreen.tsx
 * Loading screen with audio feedback ("እየጫነ ነው..." = "Loading...")
 * Used for Engine A and B during data fetch.
 */

import React, { useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  ViewStyle,
} from 'react-native';
import { Colors } from '../../constants/colors';
import { Typography } from '../../constants/typography';
import { useAudio } from '../../hooks/useAudio';
import { useEngine } from '../../contexts/EngineContext';

// ─── Types ────────────────────────────────────────────────────────────────────

interface LoadingScreenProps {
  /** Override the loading message (Engine B only — Engine A shows no text) */
  message?: string;
  /** Style override */
  style?: ViewStyle;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function LoadingScreen({ message = 'እየጫነ ነው...', style }: LoadingScreenProps) {
  const { engineType } = useEngine();
  const { playAudio } = useAudio();

  useEffect(() => {
    // Play loading audio for Engine A
    if (engineType === 'A') {
      playAudio('assets/audio/loading.mp3').catch(() => {});
    }
  }, []);

  return (
    <View style={[styles.container, style]}>
      <ActivityIndicator
        size="large"
        color={Colors.secondary}
      />

      {/* Only show text in Engine B */}
      {engineType !== 'A' && (
        <Text style={styles.message}>{message}</Text>
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex:            1,
    justifyContent:  'center',
    alignItems:      'center',
    backgroundColor: Colors.background,
  },
  message: {
    ...Typography.body,
    color:     Colors.textSecondary,
    marginTop: 16,
  },
});
