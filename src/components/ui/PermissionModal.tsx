/**
 * PermissionModal - Base component for permission announcement modals
 *
 * Consolidates BatteryOptimizationModal, LocationDisclosureModal
 * which shared 95% identical styles.
 */

import React from 'react';
import { View, Text, Modal, Pressable, StyleSheet } from 'react-native';
import { colors, spacing, borderRadius, shadows, typography } from '../../constants/colors';

interface PermissionModalAction {
  label: string;
  onPress: () => void;
}

interface PermissionModalProps {
  visible: boolean;
  title: string;
  description: string;
  icon?: React.ReactNode;
  primaryAction: PermissionModalAction;
  secondaryAction?: PermissionModalAction;
  onDismiss: () => void;
}

export function PermissionModal({
  visible,
  title,
  description,
  icon,
  primaryAction,
  secondaryAction,
  onDismiss,
}: PermissionModalProps) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onDismiss}>
      <Pressable style={s.overlay} onPress={onDismiss}>
        <View style={s.card} onStartShouldSetResponder={() => true}>
          {icon && <View style={s.iconContainer}>{icon}</View>}
          <Text style={s.title}>{title}</Text>
          <Text style={s.body}>{description}</Text>
          <Pressable
            style={({ pressed }) => [s.primaryButton, pressed && s.pressed]}
            onPress={primaryAction.onPress}
          >
            <Text style={s.primaryButtonText}>{primaryAction.label}</Text>
          </Pressable>
          {secondaryAction && (
            <Pressable
              style={({ pressed }) => [s.secondaryButton, pressed && s.pressed]}
              onPress={secondaryAction.onPress}
            >
              <Text style={s.secondaryButtonText}>{secondaryAction.label}</Text>
            </Pressable>
          )}
        </View>
      </Pressable>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xxl,
  },
  card: {
    backgroundColor: colors.white,
    borderRadius: borderRadius.xl,
    padding: spacing.xxl,
    width: '100%',
    maxWidth: 380,
    alignItems: 'center',
    ...shadows.lg,
  },
  iconContainer: {
    width: 64,
    height: 64,
    borderRadius: borderRadius.full,
    backgroundColor: colors.primarySoft,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  title: {
    ...typography.titleLg,
    fontWeight: '700',
    color: colors.text,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  body: {
    ...typography.bodyMd,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: spacing.xxl,
  },
  primaryButton: {
    width: '100%',
    paddingVertical: spacing.lg,
    borderRadius: borderRadius.md,
    backgroundColor: colors.primary,
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  primaryButtonText: {
    ...typography.bodyLg,
    fontWeight: '600',
    color: colors.white,
  },
  secondaryButton: {
    width: '100%',
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  secondaryButtonText: {
    ...typography.bodyMd,
    fontWeight: '500',
    color: colors.textSecondary,
  },
  pressed: {
    opacity: 0.7,
  },
});
