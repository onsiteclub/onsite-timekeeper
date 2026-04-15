/**
 * ToggleRow - Switch + label + optional subtitle
 * Used by Map, Settings, and Legal screens
 */

import React from 'react';
import { View, Text, Switch, StyleSheet } from 'react-native';
import { colors, spacing, typography } from '../../constants/colors';

interface ToggleRowProps {
  label: string;
  subtitle?: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
  subtitleColor?: string;
  disabled?: boolean;
}

export function ToggleRow({
  label,
  subtitle,
  value,
  onValueChange,
  subtitleColor,
  disabled,
}: ToggleRowProps) {
  return (
    <View style={s.row}>
      <View style={s.content}>
        <Text style={s.label}>{label}</Text>
        {subtitle && (
          <Text style={[s.subtitle, subtitleColor ? { color: subtitleColor } : null]}>
            {subtitle}
          </Text>
        )}
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        disabled={disabled}
        trackColor={{ false: colors.border, true: colors.primarySoft }}
        thumbColor={value ? colors.primary : colors.white}
      />
    </View>
  );
}

const s = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
  },
  content: {
    flex: 1,
    marginRight: spacing.md,
  },
  label: {
    ...typography.bodyLg,
    fontWeight: '500',
    color: colors.text,
  },
  subtitle: {
    ...typography.bodySm,
    color: colors.textSecondary,
    marginTop: spacing.xxs,
  },
});
