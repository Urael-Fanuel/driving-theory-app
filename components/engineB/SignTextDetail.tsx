/**
 * AGENT 3 — components/engineB/SignTextDetail.tsx
 * Sign detail view for Engine B — shows image + full Amharic text explanation.
 *
 * Layout:
 * ┌─────────────────────┐
 * │  [Sign Image]       │  ← 200px square, centered
 * │                     │
 * │  ████ ████ ██       │  ← Amharic name (large)
 * │                     │
 * │  ████ ██ █████      │  ← Full explanation text
 * │  ████ ███ ██ ████   │  ← (readable, 18pt min)
 * │  ████ ████          │
 * │                     │
 * │  [🔊 Listen]        │  ← Optional audio button
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
import { Typography } from '../../constants/typography';
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

      {/* Sign name */}
      <View style={styles.nameRow}>
        <Text style={styles.signName}>{sign.name_amharic}</Text>
        {sign.audio_name_url && (
          <AudioButton
            audioUri={sign.audio_name_url}
            size={48}
            label={`${sign.name_amharic} ድምጽ`}
            style={styles.nameAudioBtn}
          />
        )}
      </View>

      {/* Explanation text */}
      <View style={styles.explanationContainer}>
        <Text style={styles.explanationText}>{sign.explanation_amharic}</Text>

        {/* Audio for full explanation */}
        {sign.audio_explanation_url && (
          <View style={styles.explanationAudioRow}>
            <AudioButton
              audioUri={sign.audio_explanation_url}
              size={52}
              label="ማብራሪያ ድምጽ"
            />
          </View>
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
  },
  imageContainer: {
    width:           200,
    height:          200,
    borderRadius:    20,
    overflow:        'hidden',
    backgroundColor: '#FFFFFF',
    marginBottom:    24,
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
  nameRow: {
    flexDirection:  'row',
    alignItems:     'center',
    gap:            12,
    marginBottom:   20,
    alignSelf:      'stretch',
    justifyContent: 'center',
  },
  signName: {
    ...Typography.signName,
    color:     Colors.textPrimary,
    textAlign: 'center',
    flex:      1,
  },
  nameAudioBtn: {
    flexShrink: 0,
  },
  explanationContainer: {
    alignSelf:       'stretch',
    backgroundColor: Colors.card,
    borderRadius:    16,
    padding:         20,
    gap:             16,
  },
  explanationText: {
    ...Typography.body,
    color:      Colors.textPrimary,
    textAlign:  'left',
    lineHeight: 32, // Extra line height for Ethiopic script readability
  },
  explanationAudioRow: {
    alignItems: 'center',
    paddingTop: 8,
  },
});
