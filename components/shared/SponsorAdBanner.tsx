/**
 * components/shared/SponsorAdBanner.tsx
 * A short, upbeat app-owned headline + body sitting above a driving-
 * instructor sponsor card (AdCard), for the two "riding an excitement
 * moment" placements: exam-pass (app/result/[sessionId].tsx) and
 * "you're ready" (progress screens). Renders nothing itself when there is
 * no matched sponsor — callers should already guard on that, but this is
 * a second safety net.
 *
 * Engine A: the wrapper text is not read-accessible, so this renders ONE
 * 🔊 button that plays the recorded wrapper narration, then — chained,
 * not overlapping — the sponsor's own recorded pitch (see
 * hooks/useAudio.ts playAndAwaitAudio, the same anti-overlap primitive
 * used everywhere else in this app). The nested AdCard is NOT given its
 * own audioUri here, so there is only ever one play control on screen.
 * Engine B: plain readable text, AdCard as everywhere else.
 */

import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { AdCard } from './AdCard';
import { playAndAwaitAudio } from '../../hooks/useAudio';
import { SponsorAd } from '../../backend/api';
import { EngineType } from '../../contexts/EngineContext';

interface SponsorAdBannerProps {
  headline:        string;
  body:            string;
  /** Recorded Amharic narration of headline+body — Engine A only. */
  wrapperAudioUrl: string;
  ad:              SponsorAd;
  engineType:      EngineType | null;
}

export function SponsorAdBanner({ headline, body, wrapperAudioUrl, ad, engineType }: SponsorAdBannerProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const cancelledRef = useRef(false);

  useEffect(() => () => { cancelledRef.current = true; }, []);

  const handlePlay = async () => {
    if (isPlaying) { cancelledRef.current = true; setIsPlaying(false); return; }
    cancelledRef.current = false;
    setIsPlaying(true);
    await playAndAwaitAudio(wrapperAudioUrl, () => cancelledRef.current);
    if (!cancelledRef.current && ad.audioUrl) {
      await playAndAwaitAudio(ad.audioUrl, () => cancelledRef.current);
    }
    if (!cancelledRef.current) setIsPlaying(false);
  };

  return (
    <View style={styles.banner}>
      <View style={styles.headerRow}>
        <Text style={styles.headline}>{headline}</Text>
        {engineType === 'A' && (
          <TouchableOpacity
            style={[styles.audioBtn, isPlaying && styles.audioBtnActive]}
            onPress={handlePlay}
            activeOpacity={0.8}
            accessibilityLabel="ማስታወቂያ ድምጽ"
          >
            <Text style={styles.audioBtnIcon}>{isPlaying ? '⏸' : '🔊'}</Text>
          </TouchableOpacity>
        )}
      </View>
      <Text style={styles.body}>{body}</Text>

      <AdCard
        variant="instructor"
        name={ad.name}
        tagline={ad.taglineAmharic}
        phone={ad.phone}
        avatarUri={ad.avatarUrl ?? undefined}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    alignSelf: 'stretch',
    gap:       10,
  },
  headerRow: {
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'space-between',
    gap:            10,
  },
  headline: {
    flex:       1,
    fontSize:   20,
    fontWeight: '800',
    color:      '#191c1e',
  },
  body: {
    fontSize:   15,
    lineHeight: 21,
    color:      '#404943',
  },
  audioBtn: {
    width:           40,
    height:          40,
    borderRadius:    20,
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
});
