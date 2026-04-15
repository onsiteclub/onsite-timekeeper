/**
 * HeaderRow - Shared header with logo + title + avatar
 * Used by Log, Invoice, and Locations screens
 */

import React, { useMemo } from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { colors, spacing, borderRadius } from '../../constants/colors';
import { getUserInitials } from '../../lib/format';
import { PressableOpacity } from './PressableOpacity';
import { useAuthStore } from '../../stores/authStore';

interface HeaderRowProps {
  title?: string;
  showLogo?: boolean;
  showAvatar?: boolean;
}

export function HeaderRow({
  title,
  showLogo = true,
  showAvatar = true,
}: HeaderRowProps) {
  const router = useRouter();
  const getUserName = useAuthStore(s => s.getUserName);
  const initials = useMemo(() => getUserInitials(getUserName()), [getUserName]);

  return (
    <View style={s.row}>
      {showLogo && (
        <Image
          source={require('../../../logo.png')}
          style={s.logo}
          resizeMode="contain"
        />
      )}
      {title ? (
        <Text style={s.title}>{title}</Text>
      ) : (
        <View style={s.spacer} />
      )}
      {showAvatar && (
        <PressableOpacity
          onPress={() => router.push('/(tabs)/settings')}
          style={s.avatarBtn}
        >
          <Text style={s.avatarText}>{initials}</Text>
        </PressableOpacity>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.background,
  },
  logo: {
    width: 80,
    height: 28,
  },
  title: {
    flex: 1,
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    textAlign: 'center',
  },
  spacer: {
    flex: 1,
  },
  avatarBtn: {
    width: 36,
    height: 36,
    borderRadius: borderRadius.full,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.white,
  },
});
