/**
 * components/shared/OfflineBanner.tsx
 * Non-blocking 'no internet' notice, pinned to the top of the screen.
 *
 * Why it exists: when reception drops, audio stops working but the LEARNING
 * CONTENT DOES NOT — all sign and behavioral text ships inside the app, and any
 * audio already cached still plays. Without a notice, a user experiences that
 * as the app being broken and may uninstall it. This tells them it is a
 * connectivity problem and that reconnecting will restore the audio.
 *
 * Two deliberate design rules:
 *   1. It NEVER blocks the screen and never covers anything. It is a normal
 *      flow element rendered as the FIRST child of the screen's SafeAreaView,
 *      so it sits above the screen's own top bar and pushes content down
 *      instead of overlapping it. An absolutely-positioned version was tried
 *      first and rejected: at top:0 it hid the ✕ / back button, which is
 *      exactly what a confused user reaches for. The user keeps studying
 *      whatever is already available offline. (Engine A's exam screen
 *      previously showed a full-screen overlay whose only option was 'go back
 *      home' — the opposite of letting them continue.)
 *   2. The wording says only that the connection is down and things will
 *      continue when it returns. It deliberately does NOT ask the user to press
 *      anything or to come back later — that would contradict rule 1. It is
 *      also mirrored as SYSTEM_AUDIO['offline_notice.mp3'] in
 *      scripts/generateAllAudio.ts, so a non-reading user can hear the same
 *      sentence. Change both together or they will drift apart.
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useNetworkStatus } from '../../hooks/useNetworkStatus';

/** Written and approved by the app owner (native speaker), deliberately in
 *  plain spoken Amharic — two Gemini attempts were rejected as too literary to
 *  be understood by users with basic literacy.
 *  Kept in sync with SYSTEM_AUDIO['offline_notice.mp3'] in
 *  scripts/generateAllAudio.ts so a non-reading user hears the same sentence. */
const OFFLINE_MESSAGE = 'ኢንተርኔት አይሰራም። ሲመለስ ይቀጥላል።';

interface OfflineBannerProps {
  /** Pass this when the screen already calls useNetworkStatus(), to avoid a
   *  second subscription. Omit and the banner tracks connectivity itself. */
  isConnected?: boolean;
}

export function OfflineBanner({ isConnected }: OfflineBannerProps) {
  const ownStatus = useNetworkStatus();
  const connected = isConnected ?? ownStatus;

  if (connected) return null;

  return (
    <View style={styles.banner}>
      <Text style={styles.icon}>📵</Text>
      <Text style={styles.text}>{OFFLINE_MESSAGE}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection:   'row',
    alignItems:      'center',
    justifyContent:  'center',
    gap:             8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#e67e22',
  },
  icon: {
    fontSize: 16,
  },
  text: {
    flex:       1,
    color:      '#ffffff',
    fontSize:   13,
    lineHeight: 20,
    textAlign:  'center',
  },
});
