/**
 * components/shared/ScreenSafeArea.tsx
 *
 * The outer frame of every screen. Keeps the content out from under the phone's status bar
 * (top) and screen cut-outs (left/right).
 *
 * Why it exists: since Expo SDK 57 Android always draws the app edge to edge, under the status
 * bar and under the navigation bar. React Native's own SafeAreaView does nothing on Android, so
 * the ← buttons sat on the clock and the battery icon (owner's testing, 2026-10-27).
 *
 * The BOTTOM edge is left out on purpose: each screen already keeps its last button above the
 * navigation bar itself (`insets.bottom` on its scroll content or bottom bar), and the tab
 * screens sit above the tab bar, which handles it. Adding it here too would leave a double gap.
 * A screen that needs it can still pass `edges` explicitly.
 */
import React from 'react';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';
import type { ViewProps } from 'react-native';

const SCREEN_EDGES: Edge[] = ['top', 'left', 'right'];

export function ScreenSafeArea({ edges = SCREEN_EDGES, ...props }: ViewProps & { edges?: Edge[] }) {
  return <SafeAreaView edges={edges} {...props} />;
}
