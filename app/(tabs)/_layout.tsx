/**
 * Tabs Layout - OnSite Timekeeper
 * Bottom tab navigation
 */

import React from 'react';
import { Tabs } from 'expo-router';
import { Text, StyleSheet } from 'react-native';
import { colors } from '../../src/constants/colors';

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: true,
        headerStyle: {
          backgroundColor: colors.primary,
        },
        headerTintColor: colors.white,
        headerTitleStyle: {
          fontWeight: '600',
        },
        tabBarStyle: styles.tabBar,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textSecondary,
        tabBarLabelStyle: styles.tabLabel,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          headerTitle: 'OnSite Timekeeper',
          tabBarIcon: ({ color }) => (
            <Text style={[styles.tabIcon, { color }]}>🏠</Text>
          ),
        }}
      />
      <Tabs.Screen
        name="map"
        options={{
          title: 'Locais',
          headerTitle: 'Meus Locais',
          tabBarIcon: ({ color }) => (
            <Text style={[styles.tabIcon, { color }]}>📍</Text>
          ),
        }}
      />
      <Tabs.Screen
        name="history"
        options={{
          title: 'Histórico',
          headerTitle: 'Histórico',
          tabBarIcon: ({ color }) => (
            <Text style={[styles.tabIcon, { color }]}>📋</Text>
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Ajustes',
          headerTitle: 'Configurações',
          tabBarIcon: ({ color }) => (
            <Text style={[styles.tabIcon, { color }]}>⚙️</Text>
          ),
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: colors.white,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 4,
    paddingBottom: 4,
    height: 60,
  },
  tabIcon: {
    fontSize: 22,
  },
  tabLabel: {
    fontSize: 12,
    marginTop: -2,
  },
});
