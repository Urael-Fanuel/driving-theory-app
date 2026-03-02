/**
 * app/(engineB)/_layout.tsx
 * Engine B root Stack navigator.
 *
 * Wraps the (tabs) group (home/exam/progress) and all drill-down screens
 * (topic, sign, question) as proper stack screens — enabling correct
 * back navigation with router.back() and the Android hardware back button.
 *
 * Navigation hierarchy:
 *   Stack
 *   ├── (tabs)        ← Tab navigator (home / exam / progress)
 *   ├── topic/[id]    ← pushed on tap from home
 *   ├── sign/[id]     ← pushed on tap from topic
 *   └── question/[id] ← pushed on tap from sign
 */

import { Stack } from 'expo-router';

export default function EngineBLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
