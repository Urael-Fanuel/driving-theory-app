/**
 * components/shared/SafeBannerAd.tsx
 * Wraps react-native-google-mobile-ads' BannerAd so the app doesn't crash
 * when running inside Expo Go (which has no native ad module).
 *
 * In a real build (dev client, preview, or production APK) this renders
 * the real BannerAd exactly as before — this wrapper changes nothing
 * outside of Expo Go.
 */

import React, { useEffect, useState } from 'react';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { ensureAdsReady, onAdsReadyChange } from '../../services/adsConsent';

export const IS_EXPO_GO = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

// Only import the native ad module outside Expo Go — importing it at all
// inside Expo Go is what throws the TurboModuleRegistry invariant violation.
let BannerAd: any = null;
let BannerAdSize: any = null;
if (!IS_EXPO_GO) {
  const ads = require('react-native-google-mobile-ads');
  BannerAd = ads.BannerAd;
  BannerAdSize = ads.BannerAdSize;
}

interface SafeBannerAdProps {
  unitId: string;
}

export function SafeBannerAd({ unitId }: SafeBannerAdProps) {
  // No ad is requested before Google's consent step has answered (services/adsConsent.ts).
  const [ready, setReady] = useState(false);
  // Bumped when the user changes the ad choice: the banner is recreated, so its next
  // request already carries the new choice.
  const [generation, setGeneration] = useState(0);
  useEffect(() => {
    let alive = true;
    ensureAdsReady().then(ok => { if (alive) setReady(ok); }).catch(() => {});
    const off = onAdsReadyChange(ok => {
      if (!alive) return;
      setReady(ok);
      setGeneration(g => g + 1);
    });
    return () => { alive = false; off(); };
  }, []);

  if (IS_EXPO_GO || !BannerAd || !ready) return null;

  return (
    <BannerAd
      key={generation}
      unitId={unitId}
      size={BannerAdSize.ANCHORED_ADAPTIVE_BANNER}
      requestOptions={{ requestNonPersonalizedAdsOnly: false }}
    />
  );
}
