/**
 * Permission Rationale Modal - OnSite Timekeeper
 *
 * Reusable modal shown when a user denies a permission and the OS
 * indicates a rationale should be displayed (shouldShowRequestPermissionRationale).
 *
 * Follows the same visual pattern as LocationDisclosureModal and
 * BatteryOptimizationModal for consistency.
 */

import React from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, borderRadius, shadows } from '../constants/colors';

interface Props {
  visible: boolean;
  title: string;
  body: string;
  icon: keyof typeof Ionicons.glyphMap;
  acceptLabel: string;
  declineLabel?: string;
  onAccept: () => void;
  onDecline: () => void;
}

export function PermissionRationaleModal({
  visible,
  title,
  body,
  icon,
  acceptLabel,
  declineLabel = 'Not now',
  onAccept,
  onDecline,
}: Props) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onDecline}
    >
      <View style={styles.overlay}>
        <View style={styles.card}>
          {/* Icon */}
          <View style={styles.iconContainer}>
            <Ionicons name={icon} size={48} color={colors.accent} />
          </View>

          {/* Title */}
          <Text style={styles.title}>{title}</Text>

          {/* Body */}
          <Text style={styles.body}>{body}</Text>

          {/* Primary button */}
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={onAccept}
            activeOpacity={0.8}
          >
            <Text style={styles.primaryButtonText}>{acceptLabel}</Text>
          </TouchableOpacity>

          {/* Secondary button */}
          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={onDecline}
            activeOpacity={0.6}
          >
            <Text style={styles.secondaryButtonText}>{declineLabel}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  },
  card: {
    backgroundColor: colors.white,
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    maxWidth: 360,
    width: '100%',
    alignItems: 'center',
    ...shadows.lg,
  },
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.accentSoft,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  body: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 21,
    marginBottom: spacing.lg,
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent,
    borderRadius: borderRadius.md,
    paddingVertical: 14,
    paddingHorizontal: spacing.lg,
    width: '100%',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  primaryButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.white,
  },
  secondaryButton: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  secondaryButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.textSecondary,
  },
});
