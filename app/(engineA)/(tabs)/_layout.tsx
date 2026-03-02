/**
 * app/(engineA)/(tabs)/_layout.tsx
 * Engine A bottom tab navigator.
 *
 * Engine A users = non-readers.
 * Tab icons ONLY (no text labels). Large tap targets (60px+).
 *
 * Tabs:
 * 🏠 Home (topics)
 * 📝 Exam
 * 📊 Progress
 */

import { Tabs, useRouter } from 'expo-router';
import { Platform, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '../../../constants/colors';

export default function EngineATabsLayout() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  return (
    <Tabs
      screenOptions={{
        headerShown:         false,
        tabBarShowLabel:     false,       // Engine A: NO text labels
        tabBarStyle: {
          backgroundColor:  Colors.surface,
          borderTopColor:   Colors.border,
          borderTopWidth:   1,
          height:           Platform.OS === 'ios' ? 88 : 60 + insets.bottom,
          paddingBottom:    Platform.OS === 'ios' ? 28 : insets.bottom + 8,
          paddingTop:       8,
        },
        tabBarActiveTintColor:   Colors.secondary,
        tabBarInactiveTintColor: Colors.textMuted,
        tabBarIconStyle: {
          width:  50,
          height: 50,
        },
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          tabBarIcon: ({ color }) => <Text style={{ fontSize: 28, color }}>🏠</Text>,
          tabBarLabel: '',
          title: 'ቤት',
        }}
        listeners={{
          tabPress: (e) => {
            e.preventDefault();
            router.replace('/');
          },
        }}
      />
      <Tabs.Screen
        name="exam"
        options={{
          title: 'ፈተና',
          tabBarLabel: '',
          tabBarIcon: ({ color }) => <Text style={{ fontSize: 28, color }}>📝</Text>,
        }}
      />
      <Tabs.Screen
        name="progress"
        options={{
          title: 'እድገት',
          tabBarLabel: '',
          tabBarIcon: ({ color }) => <Text style={{ fontSize: 28, color }}>📊</Text>,
        }}
      />
    </Tabs>
  );
}
