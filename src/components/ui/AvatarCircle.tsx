/**
 * AvatarCircle - Circular avatar with initials
 */

import React, { useMemo } from 'react';
import { Text, StyleSheet } from 'react-native';
import { colors, borderRadius } from '../../constants/colors';
import { getUserInitials } from '../../lib/format';
import { PressableOpacity } from './PressableOpacity';

interface AvatarCircleProps {
  name: string | null | undefined;
  email?: string | null;
  size?: number;
  backgroundColor?: string;
  textColor?: string;
  onPress?: () => void;
}

export function AvatarCircle({
  name,
  email,
  size = 36,
  backgroundColor = colors.primary,
  textColor = colors.white,
  onPress,
}: AvatarCircleProps) {
  const initials = useMemo(() => getUserInitials(name, email), [name, email]);
  const fontSize = Math.round(size * 0.38);

  return (
    <PressableOpacity
      onPress={onPress}
      disabled={!onPress}
      style={[
        s.avatar,
        {
          width: size,
          height: size,
          borderRadius: borderRadius.full,
          backgroundColor,
        },
      ]}
    >
      <Text style={[s.text, { fontSize, color: textColor }]}>{initials}</Text>
    </PressableOpacity>
  );
}

const s = StyleSheet.create({
  avatar: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  text: {
    fontWeight: '700',
  },
});
