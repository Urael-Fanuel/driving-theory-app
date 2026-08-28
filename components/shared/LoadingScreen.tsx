/**
 * AGENT 3 — components/shared/LoadingScreen.tsx
 * Loading screen. Used for Engine A and B during data fetch.
 *
 * Deliberately silent — it used to play loading.mp3 ("እየጫነ ነው..." = "Loading...")
 * on Engine A, but that file was missing from storage (silently failing) for
 * the app's whole life until 2026-08-17, when restoring it revealed a real
 * conflict: entering a sign topic from the home screen starts a spoken topic
 * name that does not wait for navigation, and this screen's own loading sound
 * raced it on the same audio channel, so the two were audible together.
 * Removed rather than sequenced — this screen appears in ~26 places and the
 * spoken name is the more useful of the two for a non-reading user.
 */

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  ViewStyle,
} from 'react-native';
import { Colors } from '../../constants/colors';
import { Typography } from '../../constants/typography';
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
