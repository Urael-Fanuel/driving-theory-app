/**
 * components/shared/LocationPermissionModal.tsx
 * "Priming" screen shown ONCE, before the real OS location-permission dialog.
 *
 * Why a screen of our own first, instead of asking the OS directly: on both
 * Android and iOS, once a user denies the REAL system dialog once or twice,
 * the OS stops showing it again easily (iOS: never again automatically;
 * Android: "don't ask again" after the second refusal). This screen is a
 * free pre-filter — a "no" here costs nothing, since the real OS dialog was
 * never triggered.
 *
 * Must work for Engine A (non-readers) — hence the 🔊 button, matching every
 * other user-facing screen in this app (DisclaimerModal, sign screens, etc).
 *
 * Amharic text translated via Gemini (scripts/translateUiStringWithGemini.mjs)
 * and reviewed/corrected by the app owner before being wired in here.
 */

import React from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet, SafeAreaView } from 'react-native';
import { speakAndAwait, stopTTS } from '../../utils/googleTTS';

const PRIMER_TITLE = 'ለእርስዎ የተመረጡ ጥቆማዎች';
const PRIMER_BODY = 'ታጋሽ ና ታማኝ አስተማሪዎችን፣ የመኪና አገልግሎቶችን እና ጠቃሚ ቦታዎችን በአካባቢዎ ለማግኘት አካባቢዎን ይፍቀዱ።';
// Exported so the Progress-tab manual entry point can reuse the exact same
// approved copy, instead of new Amharic text needing its own translation pass.
export const PRIMER_APPROVE_BUTTON = 'የቅርብ ቅናሾችን አሳየኝ።';
const PRIMER_LATER_BUTTON = 'ትንሽ ቆይቶ';

// Spoken-only, not shown as text — tells Engine A users (who cannot read the
// button) exactly what to press. Appended after the title+body when read aloud.
const PRESS_BUTTON_INSTRUCTION = 'ፍቃደኛ ከሆኑ። አራት ማዕዘን ቅርፅ ያለው አረንጓዴ ይጫኑ።';

interface Props {
  visible: boolean;
  onApprove: () => void;
  onNotNow: () => void;
}

export function LocationPermissionModal({ visible, onApprove, onNotNow }: Props) {
  const [speaking, setSpeaking] = React.useState(false);

  React.useEffect(() => {
    if (!visible) {
      setSpeaking(false);
      stopTTS().catch(() => {});
    }
  }, [visible]);

  const handleSpeakerPress = async () => {
    if (speaking) {
      setSpeaking(false);
      await stopTTS();
      return;
    }
    setSpeaking(true);
    const ok = await speakAndAwait(`${PRIMER_TITLE}. ${PRIMER_BODY} ${PRESS_BUTTON_INSTRUCTION}`);
    if (ok) setSpeaking(false);
  };

  return (
    <Modal visible={visible} animationType="fade" transparent statusBarTranslucent>
      <View style={styles.overlay}>
        <SafeAreaView style={styles.cardWrap}>
          <View style={styles.card}>
            <View style={styles.header}>
              <Text style={styles.icon}>📍</Text>
              <TouchableOpacity style={styles.speakerBtn} onPress={handleSpeakerPress}>
                <Text style={styles.speakerIcon}>{speaking ? '⏸' : '🔊'}</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.title}>{PRIMER_TITLE}</Text>
            <Text style={styles.body}>{PRIMER_BODY}</Text>

            <TouchableOpacity style={styles.approveBtn} onPress={onApprove} activeOpacity={0.85}>
              <Text style={styles.approveText}>{PRIMER_APPROVE_BUTTON}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.laterBtn} onPress={onNotNow} activeOpacity={0.7}>
              <Text style={styles.laterText}>{PRIMER_LATER_BUTTON}</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  cardWrap: {
    width: '100%',
    maxWidth: 420,
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 24,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  icon: {
    fontSize: 34,
  },
  speakerBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#f0f0f0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  speakerIcon: {
    fontSize: 18,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#191c1e',
    marginBottom: 10,
    textAlign: 'center',
  },
  body: {
    fontSize: 16,
    lineHeight: 24,
    color: '#404943',
    textAlign: 'center',
    marginBottom: 20,
  },
  approveBtn: {
    backgroundColor: '#27AE60',
    borderRadius: 6,
    paddingVertical: 18,
    alignItems: 'center',
    marginBottom: 10,
    shadowColor: '#27AE60',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 6,
  },
  approveText: {
    color: '#ffffff',
    fontSize: 17,
    fontWeight: '700',
  },
  laterBtn: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  laterText: {
    color: '#5a6472',
    fontSize: 14,
  },
});
