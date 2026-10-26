/**
 * components/shared/VideoModal.tsx
 * Full-screen modal video player — uses expo-video.
 * Shows when the user taps the ▶️ button on a sign that has a video.
 */

import React, { useEffect, useState } from 'react';
import {
  Modal,
  View,
  TouchableOpacity,
  Text,
  StyleSheet,
  ActivityIndicator,
  StatusBar,
} from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useCoversAds } from '../../hooks/useSponsorAdTracking';

// ─── Types ────────────────────────────────────────────────────────────────────

interface VideoModalProps {
  visible: boolean;
  videoUri: string;
  onClose: () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

/**
 * The player only exists while the modal is open (it is created here, inside
 * the modal, not in VideoModal): the sign screens mount VideoModal for every
 * sign that has a video, and that must not start loading a video nobody asked for.
 */
function ModalPlayer({
  uri, onClose, onReady, onError,
}: { uri: string; onClose: () => void; onReady: () => void; onError: () => void }) {
  const player = useVideoPlayer(uri, p => {
    p.loop = false;
    // Play ALONGSIDE the sign explanation, as the app always did. By default
    // expo-video asks Android for exclusive sound focus when it starts; Android
    // then tells expo-audio it lost focus, and expo-audio stops the explanation
    // that is still being read on the screen behind this modal (found
    // 2026-10-05 on sign 302, whose video has its own sound track). Must be set
    // before play().
    p.audioMixingMode = 'mixWithOthers';
    p.play();
  });

  useEffect(() => {
    const onStatus = player.addListener('statusChange', ({ status }) => {
      if (status === 'readyToPlay') onReady();
      else if (status === 'error')  onError();
    });
    const onEnd = player.addListener('playToEnd', onClose);
    return () => { onStatus.remove(); onEnd.remove(); };
  }, [player]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <VideoView
      player={player}
      style={styles.video}
      contentFit="contain"
      nativeControls
    />
  );
}

export function VideoModal({ visible, videoUri, onClose }: VideoModalProps) {
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(false);
  useCoversAds(visible);   // an ad card under this video is not "seen"

  // Start fresh each time the modal opens.
  useEffect(() => {
    if (visible) { setLoading(true); setError(false); }
  }, [visible]);

  const handleLoad  = () => setLoading(false);
  const handleError = () => { setLoading(false); setError(true); };

  return (
    <Modal
      visible={visible}
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <StatusBar hidden />
      <View style={styles.container}>

        {/* Close button */}
        <TouchableOpacity
          style={styles.closeBtn}
          onPress={onClose}
          accessibilityLabel="ዝጋ"
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Text style={styles.closeIcon}>✕</Text>
        </TouchableOpacity>

        {/* Video */}
        {error ? (
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>❌ ቪዲዮውን መጫን አልተቻለም</Text>
          </View>
        ) : (
          visible && (
            <ModalPlayer
              uri={videoUri}
              onClose={onClose}
              onReady={handleLoad}
              onError={handleError}
            />
          )
        )}

        {/* Loading spinner */}
        {loading && !error && (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator size="large" color="#FFFFFF" />
          </View>
        )}

      </View>
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex:            1,
    backgroundColor: '#000000',
    justifyContent:  'center',
    alignItems:      'center',
  },
  closeBtn: {
    position:        'absolute',
    top:             48,
    right:           20,
    zIndex:          10,
    width:           44,
    height:          44,
    borderRadius:    22,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent:  'center',
    alignItems:      'center',
  },
  closeIcon: {
    color:      '#FFFFFF',
    fontSize:   18,
    fontWeight: '700',
  },
  video: {
    width:  '100%',
    height: '100%',
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFill,
    justifyContent: 'center',
    alignItems:     'center',
  },
  errorContainer: {
    justifyContent: 'center',
    alignItems:     'center',
    padding:        32,
  },
  errorText: {
    color:    '#FFFFFF',
    fontSize: 18,
  },
});
