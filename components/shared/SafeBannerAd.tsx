/**
 * components/shared/SafeBannerAd.tsx
 * Wraps react-native-google-mobile-ads' BannerAd so the app doesn't crash
 * when running inside Expo Go (which has no native ad module).
 *
 * In a real build (dev client, preview, or production APK) this renders
 * the real BannerAd exactly as before — this wrapper changes nothing
 * outside of Expo Go.
 */

import React from 'react';
import Constants, { ExecutionEnvironment } from 'expo-constants';

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
  if (IS_EXPO_GO || !BannerAd) return null;

  return (
    <BannerAd
      unitId={unitId}
      size={BannerAdSize.ANCHORED_ADAPTIVE_BANNER}
      requestOptions={{ requestNonPersonalizedAdsOnly: false }}
    />
  );
}
