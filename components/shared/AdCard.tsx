/**
 * components/shared/AdCard.tsx
 * Sponsored advertisement cards — two variants:
 *  - 'instructor' : Driving instructor — Amharic text + optional audio (Engine A)
 *  - 'business'   : General business banner — Amharic text
 *
 * All user-facing text is in Amharic.
 * Location filtering (20km radius) will be added when backend is ready.
 *
 * NOTE: Currently using hardcoded mock data for preview/demo purposes.
 * Replace with real Supabase data when going live.
 */

import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Linking,
  Image,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { useAudio } from '../../hooks/useAudio';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface InstructorAd {
  variant:    'instructor';
  /** Instructor's name (any language) */
  name:       string;
  /** Short tagline — in Amharic */
  tagline:    string;
  /** City / area — in Amharic */
  location?:  string;
  phone:      string;
  avatarUri?: string;
  /**
   * Optional Amharic audio ad.
   * When provided a 🔊 button is shown — essential for Engine A (non-readers).
   * Example: "መምህር ዮሴፍ — አስተማማኝ እና ባለሙያ — አሁን ይደውሉ"
   */
  audioUri?:  string;
}

export interface BusinessAd {
  variant:      'business';
  businessName: string;
  /** Short description — in Amharic */
  description:  string;
  /** CTA button label — in Amharic */
  ctaLabel:     string;
  ctaUrl:       string;
  logoUri?:     string;
}

type AdCardProps = InstructorAd | BusinessAd;

// ─── Component ────────────────────────────────────────────────────────────────

export function AdCard(props: AdCardProps) {
  if (props.variant === 'instructor') {
    return <InstructorAdCard {...props} />;
  }
  return <BusinessAdCard {...props} />;
}

// ─── Instructor card ──────────────────────────────────────────────────────────

function InstructorAdCard({ name, tagline, location, phone, avatarUri, audioUri }: InstructorAd) {
  const { playAudio, stopAudio, audioState } = useAudio();

  const handleCall = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Linking.openURL(`tel:${phone}`);
  };

  const handleAudio = async () => {
    if (!audioUri) return;
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (audioState === 'playing') {
      stopAudio();
    } else {
      playAudio(audioUri).catch(() => {});
    }
  };

  const isPlaying = audioState === 'playing' || audioState === 'loading';

  return (
    <View style={styles.instructorCard}>
      {/* Header row: badge + optional audio button */}
      <View style={styles.cardHeader}>
        <Text style={styles.sponsoredBadge}>ማስታወቂያ</Text>
        {audioUri && (
          <TouchableOpacity
            style={[styles.audioBtn, isPlaying && styles.audioBtnActive]}
            onPress={handleAudio}
            activeOpacity={0.8}
            accessibilityLabel="ማስታወቂያ ድምጽ"
          >
            <Text style={styles.audioBtnIcon}>{isPlaying ? '⏸' : '🔊'}</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Avatar + info */}
      <View style={styles.instructorRow}>
        <View style={styles.avatar}>
          {avatarUri ? (
            <Image source={{ uri: avatarUri }} style={styles.avatarImage} />
          ) : (
            <Text style={styles.avatarEmoji}>👨‍🏫</Text>
          )}
        </View>

        <View style={styles.instructorInfo}>
          <Text style={styles.instructorName}>{name}</Text>
          <Text style={styles.instructorTagline}>⭐ {tagline}</Text>
          {location && (
            <Text style={styles.instructorLocation}>📍 {location}</Text>
          )}
        </View>
      </View>

      {/* Call button — Amharic */}
      <TouchableOpacity
        style={styles.callBtn}
        onPress={handleCall}
        activeOpacity={0.85}
      >
        <Text style={styles.callBtnIcon}>📞</Text>
        <Text style={styles.callBtnText}>አሁን ይደውሉ</Text>
      </TouchableOpacity>
    </View>
  );
}

// ─── Business banner ──────────────────────────────────────────────────────────

function BusinessAdCard({ businessName, description, ctaLabel, ctaUrl, logoUri }: BusinessAd) {
  const handleCta = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Linking.openURL(ctaUrl);
  };

  return (
    <View style={styles.businessCard}>
      <Text style={styles.sponsoredBadge}>ማስታወቂያ</Text>

      <View style={styles.businessRow}>
        {/* Logo */}
        <View style={styles.businessLogo}>
          {logoUri ? (
            <Image source={{ uri: logoUri }} style={styles.businessLogoImage} />
          ) : (
            <Text style={styles.businessLogoEmoji}>🏢</Text>
          )}
        </View>

        {/* Text */}
        <View style={styles.businessInfo}>
          <Text style={styles.businessName}>{businessName}</Text>
          <Text style={styles.businessDesc}>{description}</Text>
        </View>

        {/* CTA */}
        <TouchableOpacity
          style={styles.ctaBtn}
          onPress={handleCta}
          activeOpacity={0.85}
        >
          <Text style={styles.ctaBtnText}>{ctaLabel}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  // ── Shared ────────────────────────────────────────────────────────────────
  sponsoredBadge: {
    fontSize:      10,
    color:         '#9e9e9e',
    fontWeight:    '500',
    letterSpacing: 0.5,
  },

  // ── Instructor card ───────────────────────────────────────────────────────
  instructorCard: {
    alignSelf:       'stretch',
    backgroundColor: '#ffffff',
    borderRadius:    18,
    padding:         16,
    shadowColor:     '#1565C0',
    shadowOffset:    { width: 0, height: 3 },
    shadowOpacity:   0.12,
    shadowRadius:    8,
    elevation:       4,
    borderWidth:     1,
    borderColor:     '#E3F2FD',
  },
  cardHeader: {
    flexDirection:  'row',
    justifyContent: 'space-between',
    alignItems:     'center',
    marginBottom:   10,
  },
  audioBtn: {
    width:           36,
    height:          36,
    borderRadius:    18,
    backgroundColor: '#f5f5f5',
    justifyContent:  'center',
    alignItems:      'center',
    borderWidth:     1,
    borderColor:     '#e0e0e0',
  },
  audioBtnActive: {
    backgroundColor: '#FDD835',
    borderColor:     '#F9A825',
  },
  audioBtnIcon: {
    fontSize: 18,
  },
  instructorRow: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           14,
    marginBottom:  14,
  },
  avatar: {
    width:           64,
    height:          64,
    borderRadius:    32,
    backgroundColor: '#E3F2FD',
    justifyContent:  'center',
    alignItems:      'center',
    flexShrink:      0,
  },
  avatarImage: {
    width:        64,
    height:       64,
    borderRadius: 32,
  },
  avatarEmoji: {
    fontSize: 32,
  },
  instructorInfo: {
    flex: 1,
    gap:  3,
  },
  instructorName: {
    fontSize:   18,
    fontWeight: '700',
    color:      '#191c1e',
  },
  instructorTagline: {
    fontSize:   14,
    color:      '#404943',
    lineHeight: 20,
  },
  instructorLocation: {
    fontSize: 13,
    color:    '#9e9e9e',
  },
  callBtn: {
    flexDirection:   'row',
    alignItems:      'center',
    justifyContent:  'center',
    backgroundColor: '#2E7D32',
    borderRadius:    14,
    paddingVertical: 14,
    gap:             8,
  },
  callBtnIcon: {
    fontSize: 20,
  },
  callBtnText: {
    fontSize:   17,
    fontWeight: '700',
    color:      '#ffffff',
  },

  // ── Business banner ───────────────────────────────────────────────────────
  businessCard: {
    alignSelf:       'stretch',
    backgroundColor: '#ffffff',
    borderRadius:    16,
    padding:         14,
    shadowColor:     '#000',
    shadowOffset:    { width: 0, height: 2 },
    shadowOpacity:   0.08,
    shadowRadius:    6,
    elevation:       3,
    borderWidth:     1,
    borderColor:     '#f0f0f0',
  },
  businessRow: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           12,
  },
  businessLogo: {
    width:           48,
    height:          48,
    borderRadius:    12,
    backgroundColor: '#f5f5f5',
    justifyContent:  'center',
    alignItems:      'center',
    flexShrink:      0,
  },
  businessLogoImage: {
    width:        48,
    height:       48,
    borderRadius: 12,
  },
  businessLogoEmoji: {
    fontSize: 24,
  },
  businessInfo: {
    flex: 1,
    gap:  2,
  },
  businessName: {
    fontSize:   15,
    fontWeight: '700',
    color:      '#191c1e',
  },
  businessDesc: {
    fontSize:   13,
    color:      '#404943',
    lineHeight: 18,
  },
  ctaBtn: {
    backgroundColor:  '#1565C0',
    borderRadius:     10,
    paddingHorizontal: 14,
    paddingVertical:   10,
    flexShrink:        0,
  },
  ctaBtnText: {
    fontSize:   13,
    fontWeight: '700',
    color:      '#ffffff',
  },
});
