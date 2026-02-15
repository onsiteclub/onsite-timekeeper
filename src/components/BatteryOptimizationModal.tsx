/**
 * Battery Optimization Modal - Android Only
 *
 * Onboarding modal that guides the user to disable battery optimization
 * so geofence events fire reliably with the screen off.
 */

import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { startActivityAsync, ActivityAction } from 'expo-intent-launcher';
import { colors, spacing, borderRadius, shadows } from '../constants/colors';
import { logger } from '../lib/logger';

interface Props {
  visible: boolean;
  onDismiss: (skipped: boolean) => void;
}

export function BatteryOptimizationModal({ visible, onDismiss }: Props) {
  const [loading, setLoading] = useState(false);

  if (Platform.OS !== 'android') return null;

  const handleAllow = async () => {
    setLoading(true);
    try {
      await startActivityAsync(ActivityAction.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, {
        data: 'package:com.onsiteclub.timekeeper',
      });
      logger.info('settings', 'Battery optimization dialog shown');
      onDismiss(false);
    } catch (error) {
      logger.warn('settings', 'Failed to open battery dialog', { error: String(error) });
      onDismiss(false);
    } finally {
      setLoading(false);
    }
  };

  const handleSkip = () => {
    logger.info('settings', 'Battery optimization modal skipped');
    onDismiss(true);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleSkip}
    >
      <View style={styles.overlay}>
        <View style={styles.card}>
          {/* Icon */}
          <View style={styles.iconContainer}>
            <Ionicons name="shield-checkmark-outline" size={48} color={colors.accent} />
          </View>

          {/* Title */}
          <Text style={styles.title}>Keep your hours accurate</Text>

          {/* Body */}
          <Text style={styles.body}>
            To track your work hours reliably, OnSite needs to run in the background
            without restrictions.
            {'\n\n'}
            Tap below and select{' '}
            <Text style={styles.bold}>"Unrestricted"</Text> or{' '}
            <Text style={styles.bold}>"No restrictions"</Text>.
          </Text>

          {/* Primary button */}
          <TouchableOpacity
            style={[styles.primaryButton, loading && styles.primaryButtonDisabled]}
            onPress={handleAllow}
            disabled={loading}
            activeOpacity={0.8}
          >
            <Ionicons name="battery-full-outline" size={20} color={colors.white} />
            <Text style={styles.primaryButtonText}>
              {loading ? 'Opening...' : 'Allow Background Access'}
            </Text>
          </TouchableOpacity>

          {/* Secondary button */}
          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={handleSkip}
            activeOpacity={0.6}
          >
            <Text style={styles.secondaryButtonText}>Skip for now</Text>
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
  bold: {
    fontWeight: '700',
    color: colors.text,
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
  primaryButtonDisabled: {
    opacity: 0.6,
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
