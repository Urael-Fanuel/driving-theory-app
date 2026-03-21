/**
 * components/shared/VideoModal.tsx
 * Full-screen modal video player — uses expo-av (works in Expo Go).
 * Shows when the user taps the ▶️ button on a sign that has a video.
 */

import React, { useState } from 'react';
import {
  Modal,
  View,
  TouchableOpacity,
  Text,
  StyleSheet,
  ActivityIndicator,
  StatusBar,
} from 'react-native';
import { Video, ResizeMode, AVPlaybackStatus } from 'expo-av';

// ─── Types ────────────────────────────────────────────────────────────────────

interface VideoModalProps {
  visible: boolean;
  videoUri: string;
  onClose: () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function VideoModal({ visible, videoUri, onClose }: VideoModalProps) {
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(false);

  const handleLoad = () => setLoading(false);
  const handleError = () => { setLoading(false); setError(true); };

  const handlePlaybackStatus = (status: AVPlaybackStatus) => {
    if (status.isLoaded) {
      if (loading) setLoading(false);
      if (status.didJustFinish) onClose();
    }
  };

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
          <Video
            source={{ uri: videoUri }}
            style={styles.video}
            resizeMode={ResizeMode.CONTAIN}
            useNativeControls
            shouldPlay
            onLoad={handleLoad}
            onError={handleError}
            onPlaybackStatusUpdate={handlePlaybackStatus}
          />
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
    ...StyleSheet.absoluteFillObject,
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
