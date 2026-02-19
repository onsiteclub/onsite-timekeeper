/**
 * Location Disclosure Modal
 *
 * Google Play REQUIRES a "prominent disclosure" screen BEFORE requesting
 * background location permission. Apple also recommends it.
 *
 * This modal explains WHY the app needs background location and gives the
 * user the choice to accept or decline before the native permission dialog.
 */

import React from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, borderRadius, shadows } from '../constants/colors';

interface Props {
  visible: boolean;
  onAccept: () => void;
  onDecline: () => void;
}

export function LocationDisclosureModal({ visible, onAccept, onDecline }: Props) {
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
            <Ionicons name="location-outline" size={48} color={colors.accent} />
          </View>

          {/* Title */}
          <Text style={styles.title}>Background Location</Text>

          {/* Body */}
          <Text style={styles.body}>
            OnSite Timekeeper collects location data to automatically detect
            when you arrive at or leave a work site,{' '}
            <Text style={styles.bold}>
              even when the app is closed or not in use.
            </Text>
            {'\n\n'}
            This is used exclusively for geofence-based time tracking.
            Your location is never shared with advertisers or third parties.
          </Text>

          {/* Privacy policy link */}
          <TouchableOpacity
            style={styles.privacyLink}
            onPress={() =>
              Linking.openURL('https://www.onsiteclub.ca/legal/timekeeper-privacy')
            }
            activeOpacity={0.6}
          >
            <Ionicons name="shield-checkmark-outline" size={16} color={colors.info} />
            <Text style={styles.privacyLinkText}>Privacy Policy</Text>
          </TouchableOpacity>

          {/* Primary button */}
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={onAccept}
            activeOpacity={0.8}
          >
            <Ionicons name="location" size={20} color={colors.white} />
            <Text style={styles.primaryButtonText}>Enable Location Access</Text>
          </TouchableOpacity>

          {/* Secondary button */}
          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={onDecline}
            activeOpacity={0.6}
          >
            <Text style={styles.secondaryButtonText}>Not now</Text>
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
    marginBottom: spacing.md,
  },
  bold: {
    fontWeight: '700',
    color: colors.text,
  },
  privacyLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: spacing.lg,
    paddingVertical: 4,
  },
  privacyLinkText: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.info,
    textDecorationLine: 'underline',
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
