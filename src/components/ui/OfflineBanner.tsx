/**
 * OfflineBanner - OnSite Timekeeper
 *
 * Displays a subtle banner when the device is offline.
 * Consumes syncStore.isOnline.
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSyncStore } from '../../stores/syncStore';
import { colors } from '../../constants/colors';

export function OfflineBanner() {
  const isOnline = useSyncStore(s => s.isOnline);

  if (isOnline) return null;

  return (
    <View style={styles.banner}>
      <Ionicons name="cloud-offline" size={16} color={colors.textSecondary} />
      <Text style={styles.text}>You're offline. Changes are saved locally.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.surface2,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.border,
  },
  text: {
    fontSize: 13,
    color: colors.textSecondary,
  },
});
