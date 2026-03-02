/**
 * AGENT 3 — constants/typography.ts
 * Typography scale for the Ethiopian Driving Theory App.
 *
 * IMPORTANT: Amharic (Ethiopic) script requires larger font sizes than Latin
 * for the same readability. Minimum body text: 18pt.
 * The script renders correctly on Android 5+ and iOS 9+ without extra fonts.
 * If NotoSansEthiopic is available, use it for best rendering.
 */

import { TextStyle } from 'react-native';

// Font family: use NotoSansEthiopic if loaded, else let system handle Ethiopic
const AMHARIC_FONT = undefined; // Will be set to 'NotoSansEthiopic' if loaded

export const Typography = {
  // ─── Headings ──────────────────────────────────────────────────────────────
  h1: {
    fontSize: 32,
    fontWeight: '700' as TextStyle['fontWeight'],
    lineHeight: 48,
    fontFamily: AMHARIC_FONT,
  },
  h2: {
    fontSize: 28,
    fontWeight: '700' as TextStyle['fontWeight'],
    lineHeight: 40,
    fontFamily: AMHARIC_FONT,
  },
  h3: {
    fontSize: 24,
    fontWeight: '600' as TextStyle['fontWeight'],
    lineHeight: 36,
    fontFamily: AMHARIC_FONT,
  },

  // ─── Sign display ──────────────────────────────────────────────────────────
  signName: {
    fontSize: 28,
    fontWeight: '700' as TextStyle['fontWeight'],
    lineHeight: 40,
    fontFamily: AMHARIC_FONT,
  },

  // ─── Questions ─────────────────────────────────────────────────────────────
  question: {
    fontSize: 22,
    fontWeight: '600' as TextStyle['fontWeight'],
    lineHeight: 36,
    fontFamily: AMHARIC_FONT,
  },

  // ─── Answer choices ────────────────────────────────────────────────────────
  answer: {
    fontSize: 20,
    fontWeight: '500' as TextStyle['fontWeight'],
    lineHeight: 32,
    fontFamily: AMHARIC_FONT,
  },

  // ─── Body text ────────────────────────────────────────────────────────────
  body: {
    fontSize: 18,
    fontWeight: '400' as TextStyle['fontWeight'],
    lineHeight: 30,
    fontFamily: AMHARIC_FONT,
  },
  bodySmall: {
    fontSize: 16,
    fontWeight: '400' as TextStyle['fontWeight'],
    lineHeight: 26,
    fontFamily: AMHARIC_FONT,
  },

  // ─── Caption / labels ─────────────────────────────────────────────────────
  caption: {
    fontSize: 14,
    fontWeight: '400' as TextStyle['fontWeight'],
    lineHeight: 20,
    fontFamily: AMHARIC_FONT,
  },

  // ─── Large numbers (answer 1/2/3) ─────────────────────────────────────────
  // These are displayed as digit characters, not Amharic text
  number: {
    fontSize: 36,
    fontWeight: '900' as TextStyle['fontWeight'],
    lineHeight: 44,
  },
  numberSmall: {
    fontSize: 24,
    fontWeight: '700' as TextStyle['fontWeight'],
    lineHeight: 32,
  },

  // ─── Feedback text ────────────────────────────────────────────────────────
  feedback: {
    fontSize: 20,
    fontWeight: '600' as TextStyle['fontWeight'],
    lineHeight: 32,
    fontFamily: AMHARIC_FONT,
  },

  // ─── Topic card ───────────────────────────────────────────────────────────
  topicTitle: {
    fontSize: 20,
    fontWeight: '700' as TextStyle['fontWeight'],
    lineHeight: 30,
    fontFamily: AMHARIC_FONT,
  },
  topicSubtitle: {
    fontSize: 16,
    fontWeight: '400' as TextStyle['fontWeight'],
    lineHeight: 24,
    fontFamily: AMHARIC_FONT,
  },

  // ─── Tab bar ──────────────────────────────────────────────────────────────
  tab: {
    fontSize: 12,
    fontWeight: '500' as TextStyle['fontWeight'],
    fontFamily: AMHARIC_FONT,
  },
} as const;
