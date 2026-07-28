/**
 * components/engineB/SignTextDetail.tsx
 * Sign detail view for Engine B — text-first for readers.
 *
 * Layout:
 * ┌─────────────────────┐
 * │     [Sign Image]    │  ← 180px, centered
 * │                     │
 * │   ████ ████ ██      │  ← Sign name (20pt, max 2 lines)
 * │               [▶️]  │  ← Audio button right-aligned below name
 * │                     │
 * │ ┌─────────────────┐ │
 * │ │ ████ ██ █████   │ │  ← Explanation text (18pt)
 * │ │ ████ ███ ████   │ │
 * │ │           [▶️]  │ │  ← Audio button right-aligned
 * │ └─────────────────┘ │
 * └─────────────────────┘
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  ScrollView,
  ViewStyle,
  TouchableOpacity,
} from 'react-native';
import { Colors } from '../../constants/colors';
import { AudioButton } from '../shared/AudioButton';
import { VideoModal } from '../shared/VideoModal';
import { DBSign } from '../../backend/supabaseClient';
import { extractSignNumber, shouldShowSignBadge } from '../../utils/signNumber';

// ─── Types ────────────────────────────────────────────────────────────────────

interface SignTextDetailProps {
  sign: DBSign;
  style?: ViewStyle;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function SignTextDetail({ sign, style }: SignTextDetailProps) {
  const [videoVisible, setVideoVisible] = useState(false);

  return (
    <ScrollView
      style={[styles.container, style]}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      {/* Sign image */}
      <View style={styles.imageContainer}>
        {sign.image_url ? (
          <Image
            source={{ uri: sign.image_url }}
            style={styles.image}
            resizeMode="contain"
          />
        ) : (
          <View style={styles.imagePlaceholder}>
            <Text style={styles.placeholderIcon}>🚦</Text>
          </View>
        )}
        {shouldShowSignBadge(sign.image_url) && (
          <View style={styles.signNumberBadge}>
            <Text style={styles.signNumberText}>{extractSignNumber(sign.image_url)}</Text>
          </View>
        )}
      </View>

      {/* Video button — only shown when sign has a video */}
      {sign.video_url && (
        <TouchableOpacity
          style={styles.videoBtn}
          onPress={() => setVideoVisible(true)}
          accessibilityLabel="ቪዲዮ ተመልከት"
        >
          <Text style={styles.videoBtnIcon}>▶</Text>
          <Text style={styles.videoBtnText}>ቪዲዮ ተመልከት</Text>
        </TouchableOpacity>
      )}

      {/* Video modal */}
      {sign.video_url && (
        <VideoModal
          visible={videoVisible}
          videoUri={sign.video_url}
          onClose={() => setVideoVisible(false)}
        />
      )}

      {/* Sign name block */}
      <View style={styles.nameBlock}>
        <Text style={styles.signName}>{sign.name_amharic}</Text>
        {sign.audio_name_url && (
          <AudioButton
            audioUri={sign.audio_name_url}
            size={40}
            label={`${sign.name_amharic} ድምጽ`}
            style={styles.nameAudioBtn}
          />
        )}
      </View>

      {/* Explanation card */}
      <View style={styles.explanationContainer}>
        {sign.audio_explanation_url && (
          <AudioButton
            audioUri={sign.audio_explanation_url}
            size={40}
            label="ማብራሪያ ድምጽ"
            style={styles.explanationAudioBtn}
          />
        )}
        <Text style={styles.explanationText}>{sign.explanation_amharic}</Text>
      </View>
    </ScrollView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding:    20,
    alignItems: 'center',
    gap:        16,
  },

  // ── Image ────────────────────────────────────────────────────────────────────
  imageContainer: {
    width:           180,
    height:          180,
    borderRadius:    20,
    overflow:        'hidden',
    backgroundColor: '#FFFFFF',
    shadowColor:     '#000',
    shadowOffset:    { width: 0, height: 6 },
    shadowOpacity:   0.3,
    shadowRadius:    10,
    elevation:       8,
    position:        'relative',
  },
  signNumberBadge: {
    position:        'absolute',
    top:             8,
    left:            8,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius:    5,
    paddingHorizontal: 7,
    paddingVertical: 3,
    zIndex:          1,
  },
  signNumberText: {
    color:      '#FFFFFF',
    fontSize:   12,
    fontWeight: 'bold',
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
  placeholderIcon: {
    fontSize: 80,
  },

  // ── Video button ─────────────────────────────────────────────────────────────
  videoBtn: {
    flexDirection:   'row',
    alignItems:      'center',
    justifyContent:  'center',
    backgroundColor: '#1A1A2E',
    borderRadius:    14,
    paddingVertical: 12,
    paddingHorizontal: 24,
    gap:             10,
    borderWidth:     1,
    borderColor:     '#3A3A5E',
  },
  videoBtnIcon: {
    color:    '#FFFFFF',
    fontSize: 18,
  },
  videoBtnText: {
    color:      '#FFFFFF',
    fontSize:   16,
    fontWeight: '600',
  },

  // ── Name block ───────────────────────────────────────────────────────────────
  nameBlock: {
    alignSelf: 'stretch',
    gap:       8,
  },
  signName: {
    fontSize:   20,
    fontWeight: '700',
    lineHeight: 32,
    color:      '#191c1e',
    textAlign:  'center',
  },
  nameAudioBtn: {
    alignSelf: 'flex-end',
  },

  // ── Explanation card ─────────────────────────────────────────────────────────
  explanationContainer: {
    alignSelf:       'stretch',
    backgroundColor: Colors.cardActive,       // slightly lighter than card
    borderRadius:    16,
    borderWidth:     1,
    borderColor:     Colors.border,
    padding:         18,
    gap:             14,
  },
  explanationText: {
    fontSize:   18,
    fontWeight: '400',
    lineHeight: 32,
    color:      Colors.textPrimary,
    textAlign:  'left',
  },
  explanationAudioBtn: {
    alignSelf: 'flex-end',
  },
});
