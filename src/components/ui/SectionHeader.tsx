/**
 * SectionHeader - Uppercase label for content sections
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, spacing, typography } from '../../constants/colors';

interface SectionHeaderProps {
  label: string;
  rightElement?: React.ReactNode;
}

export function SectionHeader({ label, rightElement }: SectionHeaderProps) {
  return (
    <View style={s.container}>
      <Text style={s.label}>{label}</Text>
      {rightElement}
    </View>
  );
}

const s = StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  label: {
    ...typography.labelMd,
    fontWeight: '600',
    color: colors.textSecondary,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
});
