/**
 * Tabs Layout - OnSite Timekeeper
 *
 * v1.2: Added floating mic button + voice command sheet (IA Voz)
 */

import React, { useState } from 'react';
import { Platform } from 'react-native';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../../src/constants/colors';
import { FloatingMicButton } from '../../src/components/FloatingMicButton';
import { VoiceCommandSheet } from '../../src/components/VoiceCommandSheet';

const isWeb = Platform.OS === 'web';

export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  const bottomPadding = Platform.OS === 'android' ? Math.max(insets.bottom, 8) : 8;
  const tabBarHeight = 60 + insets.bottom;

  const [showVoiceSheet, setShowVoiceSheet] = useState(false);

  return (
    <GestureHandlerRootView style={[
      { flex: 1 },
      isWeb && {
        maxWidth: 800,
        width: '100%' as unknown as number,
        marginHorizontal: 'auto' as unknown as number,
        paddingHorizontal: 16,
      },
    ]}>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarStyle: {
            backgroundColor: colors.card,
            borderTopColor: colors.border,
            borderTopWidth: 1,
            height: tabBarHeight,
            paddingBottom: bottomPadding,
            paddingTop: 8,
          },
          tabBarActiveTintColor: colors.tabActive,      // Amber (#C58B1B)
          tabBarInactiveTintColor: colors.tabInactive,  // iconMuted (#98A2B3)
          tabBarLabelStyle: {
            fontSize: 12,
            fontWeight: '500',
          },
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            href: null,
          }}
        />
        <Tabs.Screen
          name="reports"
          options={{
            title: 'Home',
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="home" size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="map"
          options={{
            title: 'Jobsites',
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="map" size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="team"
          options={{
            title: 'Crew',
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="people" size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="settings"
          options={{
            title: 'Settings',
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="settings" size={size} color={color} />
            ),
          }}
        />
      </Tabs>

      <FloatingMicButton
        onPress={() => setShowVoiceSheet(true)}
        tabBarHeight={tabBarHeight}
      />

      {showVoiceSheet && (
        <VoiceCommandSheet
          visible={showVoiceSheet}
          onClose={() => setShowVoiceSheet(false)}
        />
      )}
    </GestureHandlerRootView>
  );
}
