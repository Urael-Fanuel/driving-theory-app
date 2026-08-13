/**
 * AGENT 3 — constants/colors.ts
 * Color palette for the Ethiopian Driving Theory App.
 * Inspired by Ethiopian flag colors (Green, Yellow, Red).
 */

export const Colors = {
  // ─── Ethiopian flag colors ────────────────────────────────────────────────
  primary:        '#2E7D32',   // Green
  secondary:      '#FDD835',   // Yellow
  accent:         '#C62828',   // Red

  // ─── App UI ───────────────────────────────────────────────────────────────
  background:     '#1a1a2e',   // Dark navy (easy on eyes, low battery)
  surface:        '#16213e',   // Slightly lighter surface
  card:           '#0f3460',   // Card background
  cardActive:     '#1a4a7a',   // Card when pressed/selected
  border:         '#2a3a5c',   // Subtle border

  // ─── Topic colors ─────────────────────────────────────────────────────────
  topicRegulatory:   '#C62828',   // Red
  topicWarning:      '#E65100',   // Orange
  topicInformation:  '#1565C0',   // Blue
  topicRoadMarkings: '#4A148C',   // Purple
  topicRightOfWay:   '#2E7D32',   // Green
  topicSafety:       '#F57F17',   // Amber

  // ─── Feedback ─────────────────────────────────────────────────────────────
  correct:        '#43A047',
  correctLight:   '#C8E6C9',
  correctDark:    '#1B5E20',
  wrong:          '#E53935',
  wrongLight:     '#FFCDD2',
  wrongDark:      '#B71C1C',

  // ─── Text ─────────────────────────────────────────────────────────────────
  textPrimary:    '#FFFFFF',
  textSecondary:  '#B0BEC5',
  textMuted:      '#607D8B',
  textOnPrimary:  '#FFFFFF',
  textOnSecondary:'#1a1a2e',

  // ─── Back button (all screens, deliberately one fixed color everywhere —
  // not per-topic/per-screen — so it's instantly recognizable as "the back
  // button" no matter which screen the user is on) ──────────────────────────
  backButtonAccent: '#29B6F6',   // Light blue / תכלת

  // ─── Microphone button states ─────────────────────────────────────────────
  micIdle:        '#1565C0',   // Blue — ready to listen
  micListening:   '#E53935',   // Red — actively recording
  micProcessing:  '#FDD835',   // Yellow — sending to STT
  micSuccess:     '#43A047',   // Green — answer recognized
  micFailed:      '#607D8B',   // Gray — not recognized

  // ─── Progress ─────────────────────────────────────────────────────────────
  progressTrack:  '#2a3a5c',
  progressFill:   '#2E7D32',
  progressMastered: '#FDD835',

  // ─── Overlays ─────────────────────────────────────────────────────────────
  overlay:        'rgba(0, 0, 0, 0.6)',
  overlayLight:   'rgba(0, 0, 0, 0.3)',
  overlayCorrect: 'rgba(67, 160, 71, 0.85)',
  overlayWrong:   'rgba(229, 57, 53, 0.85)',

  // ─── Transparent ──────────────────────────────────────────────────────────
  transparent:    'transparent',
} as const;

export type ColorKey = keyof typeof Colors;
