/**
 * Tabs Layout - OnSite Timekeeper
 *
 * v2.0: Redesigned tab bar — Log / History / Locations / More
 *       Amber dot active indicator, warm color palette
 */

import React, { useState } from 'react';
import { Platform, View, Text } from 'react-native';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../../src/constants/colors';
import { FloatingMicButton } from '../../src/components/FloatingMicButton';
import { VoiceCommandSheet } from '../../src/components/VoiceCommandSheet';

const isWeb = Platform.OS === 'web';

/** Custom tab label with amber dot below active tab */
function TabLabel({ title, focused }: { title: string; focused: boolean }) {
  return (
    <View style={{ alignItems: 'center' }}>
      <Text style={{
        fontSize: 11,
        fontWeight: focused ? '600' : '500',
        color: focused ? colors.tabActive : colors.tabInactive,
      }}>
        {title}
      </Text>
      {focused && (
        <View style={{
          width: 4,
          height: 4,
          borderRadius: 2,
          backgroundColor: colors.tabActiveDot,
          marginTop: 2,
        }} />
      )}
    </View>
  );
}

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
            borderTopColor: colors.borderLight,
            borderTopWidth: 0.5,
            height: tabBarHeight,
            paddingBottom: bottomPadding,
            paddingTop: 8,
          },
          tabBarActiveTintColor: colors.tabActive,
          tabBarInactiveTintColor: colors.tabInactive,
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
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="time-outline" size={size} color={color} />
            ),
            tabBarLabel: ({ focused }) => <TabLabel title="Log" focused={focused} />,
          }}
        />
        <Tabs.Screen
          name="history"
          options={{
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="calendar-outline" size={size} color={color} />
            ),
            tabBarLabel: ({ focused }) => <TabLabel title="History" focused={focused} />,
          }}
        />
        <Tabs.Screen
          name="map"
          options={{
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="location-outline" size={size} color={color} />
            ),
            tabBarLabel: ({ focused }) => <TabLabel title="Locations" focused={focused} />,
          }}
        />
        <Tabs.Screen
          name="invoice"
          options={{
            href: null,
          }}
        />
        <Tabs.Screen
          name="team"
          options={{
            href: null,
          }}
        />
        <Tabs.Screen
          name="settings"
          options={{
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="ellipsis-horizontal" size={size} color={color} />
            ),
            tabBarLabel: ({ focused }) => <TabLabel title="More" focused={focused} />,
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
