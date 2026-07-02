/**
 * AGENT 3 — app/_layout.tsx
 * Root layout: wraps the entire app with EngineProvider.
 * Uses expo-router's Stack navigator.
 */

import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StyleSheet, I18nManager } from 'react-native';
import { EngineProvider } from '../contexts/EngineContext';
import { Colors } from '../constants/colors';

// Force LTR layout — Amharic is written left-to-right
if (I18nManager.isRTL) {
  I18nManager.forceRTL(false);
  I18nManager.allowRTL(false);
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={styles.container}>
      <SafeAreaProvider>
        <EngineProvider>
          <StatusBar style="light" backgroundColor={Colors.background} />
          <Stack
            screenOptions={{
              headerShown:       false,
              contentStyle:      { backgroundColor: Colors.background },
              animation:         'slide_from_right',
              gestureEnabled:    true,
            }}
          >
            <Stack.Screen name="index"      options={{ animation: 'fade' }} />
            <Stack.Screen name="(engineA)"  options={{ headerShown: false }} />
            <Stack.Screen name="(engineB)"  options={{ headerShown: false }} />
            <Stack.Screen
              name="result/[sessionId]"
              options={{ animation: 'slide_from_bottom' }}
            />
          </Stack>
        </EngineProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
