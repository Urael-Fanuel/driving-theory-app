/**
 * app/(engineB)/(tabs)/_layout.tsx
 * Engine B bottom tab navigator.
 *
 * Engine B users = Amharic readers.
 * Tabs have both icons AND Amharic text labels.
 */

import { Tabs, useRouter } from 'expo-router';
import { Platform, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '../../../constants/colors';
import { Typography } from '../../../constants/typography';

export default function EngineBTabsLayout() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  return (
    <Tabs
      screenOptions={{
        headerShown:         false,
        tabBarShowLabel:     true,        // Engine B: SHOW text labels
        tabBarStyle: {
          backgroundColor:  Colors.surface,
          borderTopColor:   Colors.border,
          borderTopWidth:   1,
          height:           Platform.OS === 'ios' ? 88 : 64 + insets.bottom,
          paddingBottom:    Platform.OS === 'ios' ? 28 : insets.bottom + 10,
          paddingTop:       8,
        },
        tabBarActiveTintColor:   Colors.secondary,
        tabBarInactiveTintColor: Colors.textMuted,
        tabBarLabelStyle:        Typography.tab,
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          title:       'ቤት',
          tabBarLabel: 'ቤት',
          tabBarIcon:  ({ color }) => <Text style={{ fontSize: 22, color }}>🏠</Text>,
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
          title:       'ፈተና',
          tabBarLabel: 'ፈተና',
          tabBarIcon:  ({ color }) => <Text style={{ fontSize: 22, color }}>📝</Text>,
        }}
      />
      <Tabs.Screen
        name="progress"
        options={{
          title:       'እድገት',
          tabBarLabel: 'እድገት',
          tabBarIcon:  ({ color }) => <Text style={{ fontSize: 22, color }}>📊</Text>,
        }}
      />
    </Tabs>
  );
}
