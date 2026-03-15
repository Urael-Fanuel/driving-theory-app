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

import React from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  ScrollView,
  ViewStyle,
} from 'react-native';
import { Colors } from '../../constants/colors';
import { AudioButton } from '../shared/AudioButton';
import { DBSign } from '../../backend/supabaseClient';

// ─── Types ────────────────────────────────────────────────────────────────────

interface SignTextDetailProps {
  sign: DBSign;
  style?: ViewStyle;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function SignTextDetail({ sign, style }: SignTextDetailProps) {
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
      </View>

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
        <Text style={styles.explanationText}>{sign.explanation_amharic}</Text>
        {sign.audio_explanation_url && (
          <AudioButton
            audioUri={sign.audio_explanation_url}
            size={40}
            label="ማብራሪያ ድምጽ"
            style={styles.explanationAudioBtn}
          />
        )}
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

  // ── Name block ───────────────────────────────────────────────────────────────
  nameBlock: {
    alignSelf: 'stretch',
    gap:       8,
  },
  signName: {
    fontSize:   20,
    fontWeight: '700',
    lineHeight: 32,
    color:      Colors.textPrimary,
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
