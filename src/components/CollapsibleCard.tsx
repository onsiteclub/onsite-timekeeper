/**
 * CollapsibleCard - Reusable animated accordion card
 *
 * Usage:
 *   <CollapsibleCard title="Personal Info" subtitle="John Doe" icon="person-outline" defaultExpanded>
 *     <FormField ... />
 *   </CollapsibleCard>
 */

import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, LayoutChangeEvent } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withTiming } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { colors, borderRadius } from '../constants/colors';

interface CollapsibleCardProps {
  title: string;
  subtitle?: string;
  icon?: string;
  defaultExpanded?: boolean;
  children: React.ReactNode;
}

export function CollapsibleCard({
  title,
  subtitle,
  icon,
  defaultExpanded = false,
  children,
}: CollapsibleCardProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [contentHeight, setContentHeight] = useState(0);
  const [measured, setMeasured] = useState(false);

  const animHeight = useSharedValue(defaultExpanded ? 1 : 0);
  const animRotate = useSharedValue(defaultExpanded ? 1 : 0);

  const toggle = useCallback(() => {
    const next = !expanded;
    setExpanded(next);
    animHeight.value = withTiming(next ? 1 : 0, { duration: 300 });
    animRotate.value = withTiming(next ? 1 : 0, { duration: 300 });
  }, [expanded, animHeight, animRotate]);

  const onContentLayout = useCallback((e: LayoutChangeEvent) => {
    const h = e.nativeEvent.layout.height;
    if (h > 0 && !measured) {
      setContentHeight(h);
      setMeasured(true);
    }
  }, [measured]);

  const contentStyle = useAnimatedStyle(() => ({
    height: measured ? animHeight.value * contentHeight : undefined,
    opacity: animHeight.value,
    overflow: 'hidden' as const,
  }));

  const chevronStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${animRotate.value * 180}deg` }],
  }));

  return (
    <View style={s.card}>
      <TouchableOpacity style={s.header} onPress={toggle} activeOpacity={0.7}>
        <View style={s.headerLeft}>
          {icon && (
            <Ionicons name={icon as any} size={20} color={colors.primary} style={s.icon} />
          )}
          <View style={{ flex: 1 }}>
            <Text style={s.title}>{title}</Text>
            {!expanded && subtitle ? (
              <Text style={s.subtitle} numberOfLines={1}>{subtitle}</Text>
            ) : null}
          </View>
        </View>
        <Animated.View style={chevronStyle}>
          <Ionicons name="chevron-up" size={18} color={colors.textSecondary} />
        </Animated.View>
      </TouchableOpacity>

      {/* Measure wrapper (invisible on first render if not defaultExpanded) */}
      {!measured && !defaultExpanded ? (
        <View style={s.measureWrapper} onLayout={onContentLayout}>
          {children}
        </View>
      ) : null}

      <Animated.View style={measured ? contentStyle : undefined}>
        <View onLayout={!measured ? onContentLayout : undefined}>
          {children}
        </View>
      </Animated.View>
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 12,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 10,
  },
  icon: {
    marginRight: 2,
  },
  title: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
  },
  subtitle: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
  },
  measureWrapper: {
    position: 'absolute',
    opacity: 0,
    pointerEvents: 'none',
  },
});
