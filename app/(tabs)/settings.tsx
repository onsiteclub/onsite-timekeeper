/**
 * More Screen - OnSite Timekeeper v1.8
 *
 * iOS-standard grouped table view with flat rows.
 * Replaces accordion-style settings.
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Pressable,
  Switch,
  Alert,
  Modal,
  TextInput,
  ActivityIndicator,
  Platform,
  KeyboardAvoidingView,
  Linking,
} from 'react-native';
import { startActivityAsync, ActivityAction } from 'expo-intent-launcher';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import Constants from 'expo-constants';
import { colors, spacing, borderRadius } from '../../src/constants/colors';
import { AvatarCircle } from '../../src/components/ui/AvatarCircle';
import { confirmAsync } from '../../src/lib/confirm';
import { useAuthStore } from '../../src/stores/authStore';
import { useSettingsStore, DETECTION_ZONE_OPTIONS } from '../../src/stores/settingsStore';
import { onUserLogout } from '../../src/lib/bootstrap';
import { useBusinessProfileStore } from '../../src/stores/businessProfileStore';
import { useLocationStore, selectLocations } from '../../src/stores/locationStore';
import { useAutoLogToggle } from '../../src/hooks/useAutoLogToggle';
import { setSentryContext, captureException } from '../../src/lib/sentry';

// ============================================
// MAIN COMPONENT
// ============================================

export default function MoreScreen() {
  const router = useRouter();
  const { user, signOut, deleteAccount, isLoading, getUserName } = useAuthStore();
  const settings = useSettingsStore();
  const businessProfile = useBusinessProfileStore(s => s.profile);
  const loadBusinessProfile = useBusinessProfileStore(s => s.loadProfile);
  const locations = useLocationStore(selectLocations);
  const editLocation = useLocationStore(s => s.editLocation);
  const { autoLoggingEnabled, isToggling: isTogglingAutoLog, handleToggle: handleAutoLogToggle } = useAutoLogToggle();
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showRadiusPicker, setShowRadiusPicker] = useState(false);
  const [deleteInput, setDeleteInput] = useState('');
  // UX6: Logout transition
  const [isSigningOut, setIsSigningOut] = useState(false);

  // ============================================
  // SENTRY CONTEXT
  // ============================================
  React.useEffect(() => { setSentryContext('settings'); }, []);

  // ============================================
  // HANDLERS
  // ============================================

  // TEMPORARY — Remove after confirming Sentry receives events
  // TODO: Remove after Sentry verification
  const handleTestSentry = () => {
    if (!__DEV__) return;
    try {
      throw new Error('Sentry audit test — Timekeeper — safe to ignore');
    } catch (e) {
      captureException(e as Error);
      Alert.alert(
        'Sentry Test Sent',
        'Check your Sentry dashboard for an event titled "Sentry audit test". If you see it, the pipeline works.\n\nNote: In __DEV__ mode, Sentry is disabled. Build a production build to test.'
      );
    }
  };

  const handleVersionLongPress = () => {
    router.push('/logs' as any);
  };

  // UX6: Logout with brief "Signing out..." transition.
  // Uses confirmAsync (cross-platform) instead of Alert.alert because
  // Alert.alert with multiple buttons is a no-op on web.
  const handleSignOut = async () => {
    const ok = await confirmAsync({
      title: 'Sign Out',
      message: 'Are you sure you want to sign out?',
      confirmText: 'Sign Out',
      destructive: true,
    });
    if (!ok) return;
    setIsSigningOut(true);
    await onUserLogout();
    await signOut();
    setTimeout(() => {
      router.replace('/');
    }, 300);
  };

  const handleDeleteAccount = async () => {
    const ok = await confirmAsync({
      title: 'Delete Account',
      message:
        'This will permanently delete your account and ALL your data (work hours, locations, audit trail). This action CANNOT be undone.\n\nAre you sure you want to continue?',
      confirmText: 'Continue',
      destructive: true,
    });
    if (!ok) return;
    setDeleteInput('');
    setShowDeleteModal(true);
  };

  const confirmDeleteAccount = async () => {
    if (deleteInput !== 'DELETE') {
      Alert.alert('Error', 'Please type DELETE to confirm.');
      return;
    }

    setShowDeleteModal(false);
    setDeleteInput('');

    const result = await deleteAccount();
    if (result.success) {
      router.replace('/');
    } else {
      Alert.alert('Error', result.error || 'Failed to delete account. Please try again.');
    }
  };

  const handleRadiusChange = async (newRadius: number) => {
    settings.updateSetting('defaultRadius', newRadius);
    for (const loc of locations) {
      await editLocation(loc.id, { radius: newRadius });
    }
    setShowRadiusPicker(false);
  };

  const handleOpenBatterySettings = async () => {
    try {
      await startActivityAsync(ActivityAction.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, {
        data: 'package:com.onsiteclub.timekeeper',
      });
    } catch {
      Alert.alert('Error', 'Could not open battery settings. Please go to Settings > Apps > OnSite Timekeeper > Battery manually.');
    }
  };

  // Load business profile on mount
  React.useEffect(() => {
    if (user?.id) loadBusinessProfile(user.id);
  }, [user?.id]);

  const appVersion = Constants.expoConfig?.version || '1.0.0';

  // ============================================
  // RENDER
  // ============================================

  // UX6: Show signing out overlay
  if (isSigningOut) {
    return (
      <View style={styles.signingOutOverlay}>
        <ActivityIndicator size="small" color={colors.primary} />
        <Text style={styles.signingOutText}>Signing out...</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>

      {/* ============================================ */}
      {/* PROFILE CARD */}
      {/* ============================================ */}
      <View style={styles.profileSection}>
        <View style={{ marginBottom: spacing.md }}>
          <AvatarCircle name={getUserName()} email={user?.email} size={72} />
        </View>
        <Text style={styles.profileName}>{getUserName() || 'Guest'}</Text>
        <Text style={styles.profileEmail}>{user?.email || ''}</Text>
      </View>

      {/* ============================================ */}
      {/* TOOLS */}
      {/* ============================================ */}
      <Text style={styles.sectionHeader}>TOOLS</Text>
      <View style={styles.groupedCard}>
        <TouchableOpacity
          style={styles.row}
          onPress={() => router.navigate('/business-profile' as any)}
          activeOpacity={0.6}
        >
          <View style={styles.rowLeft}>
            <Ionicons name="briefcase" size={20} color={colors.primary} style={styles.rowIcon} />
            <Text style={styles.rowText}>Business Profile</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
        </TouchableOpacity>
      </View>

      {/* ============================================ */}
      {/* SMART FEATURES */}
      {/* ============================================ */}
      <Text style={styles.sectionHeader}>SMART FEATURES</Text>
      <View style={styles.groupedCard}>
        <View style={styles.row}>
          <View style={styles.rowLeft}>
            <Ionicons name="sync" size={20} color={colors.primary} style={styles.rowIcon} />
            <View>
              <Text style={styles.rowText}>Auto-logging</Text>
              <Text style={{ fontSize: 13, color: colors.textSecondary, marginTop: spacing.xxs }}>Automatically log hours at your saved locations</Text>
            </View>
          </View>
          <Switch
            value={autoLoggingEnabled}
            onValueChange={handleAutoLogToggle}
            disabled={isTogglingAutoLog}
            trackColor={{ false: colors.border, true: colors.primarySoft }}
            thumbColor={autoLoggingEnabled ? colors.primary : '#FFFFFF'}
          />
        </View>

        <View style={styles.rowSeparator} />

        <TouchableOpacity style={styles.row} onPress={() => setShowRadiusPicker(true)} activeOpacity={0.6}>
          <View style={styles.rowLeft}>
            <Ionicons name="radio-outline" size={20} color={colors.primary} style={styles.rowIcon} />
            <Text style={styles.rowText}>Detection zone</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
            <Text style={{ fontSize: 15, color: colors.textSecondary }}>{settings.defaultRadius}m</Text>
            <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
          </View>
        </TouchableOpacity>

        <View style={styles.rowSeparator} />

        <View style={styles.row}>
          <View style={styles.rowLeft}>
            <Ionicons name="notifications" size={20} color={colors.primary} style={styles.rowIcon} />
            <Text style={styles.rowText}>Reminders</Text>
          </View>
          <Switch
            value={settings.notificationsEnabled}
            onValueChange={(v) => settings.updateSetting('notificationsEnabled', v)}
            trackColor={{ false: colors.border, true: colors.primarySoft }}
            thumbColor={settings.notificationsEnabled ? colors.primary : '#FFFFFF'}
          />
        </View>

        {/* Battery Optimization - Android only */}
        {Platform.OS === 'android' && (
          <>
            <View style={styles.rowSeparator} />
            <TouchableOpacity
              style={styles.row}
              onPress={handleOpenBatterySettings}
              activeOpacity={0.6}
            >
              <View style={styles.rowLeft}>
                <Ionicons name="battery-half" size={20} color={colors.primary} style={styles.rowIcon} />
                <Text style={styles.rowText}>Battery Optimization</Text>
              </View>
              {settings.batteryOptimizationSkipped ? (
                <View style={styles.reviewBadge}>
                  <Text style={styles.reviewBadgeText}>Review</Text>
                </View>
              ) : (
                <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
              )}
            </TouchableOpacity>
          </>
        )}
      </View>

      {/* ============================================ */}
      {/* ABOUT */}
      {/* ============================================ */}
      <Text style={styles.sectionHeader}>ABOUT</Text>
      <View style={styles.groupedCard}>
        <TouchableOpacity
          style={styles.row}
          onPress={() => router.push('/legal' as any)}
          activeOpacity={0.6}
        >
          <View style={styles.rowLeft}>
            <Ionicons name="document-text" size={20} color={colors.primary} style={styles.rowIcon} />
            <Text style={styles.rowText}>Privacy & Terms</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
        </TouchableOpacity>

        <View style={styles.rowSeparator} />

        <TouchableOpacity
          style={styles.row}
          onPress={() => Linking.openURL('mailto:contact@onsiteclub.ca?subject=Timekeeper%20Support')}
          activeOpacity={0.6}
        >
          <View style={styles.rowLeft}>
            <Ionicons name="mail" size={20} color={colors.primary} style={styles.rowIcon} />
            <Text style={styles.rowText}>Contact Support</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
        </TouchableOpacity>

        <View style={styles.rowSeparator} />

        <TouchableOpacity
          style={styles.row}
          onLongPress={handleVersionLongPress}
          delayLongPress={5000}
          activeOpacity={1}
        >
          <View style={styles.rowLeft}>
            <Ionicons name="information-circle" size={20} color={colors.primary} style={styles.rowIcon} />
            <Text style={styles.rowText}>OnSite v{appVersion}</Text>
          </View>
        </TouchableOpacity>

        {/* TEMPORARY — Remove after Sentry verification */}
        {/* TODO: Remove after confirming Sentry receives events */}
        {__DEV__ && (
          <>
            <View style={styles.rowSeparator} />
            <TouchableOpacity style={styles.row} onPress={handleTestSentry} activeOpacity={0.6}>
              <View style={styles.rowLeft}>
                <Ionicons name="bug" size={20} color="#FF6B35" style={styles.rowIcon} />
                <Text style={[styles.rowText, { color: '#FF6B35' }]}>Test Sentry (DEV only)</Text>
              </View>
            </TouchableOpacity>
          </>
        )}
      </View>

      {/* ============================================ */}
      {/* SIGN OUT */}
      {/* ============================================ */}
      <View style={styles.signOutSection}>
        <View style={styles.groupedCard}>
          <TouchableOpacity
            style={styles.signOutRow}
            onPress={handleSignOut}
            activeOpacity={0.6}
          >
            <Text style={styles.signOutText}>Sign Out</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* ============================================ */}
      {/* DELETE ACCOUNT */}
      {/* ============================================ */}
      <TouchableOpacity
        style={styles.deleteAccountRow}
        onPress={handleDeleteAccount}
        activeOpacity={0.6}
      >
        <Text style={styles.deleteAccountText}>Delete Account</Text>
      </TouchableOpacity>

      <View style={styles.footer} />

      {/* ============================================ */}
      {/* DELETE ACCOUNT CONFIRMATION MODAL */}
      {/* ============================================ */}
      <Modal
        visible={showDeleteModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowDeleteModal(false)}
      >
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <View style={styles.modalContent}>
            <Ionicons name="warning" size={40} color={colors.error} style={styles.modalIcon} />
            <Text style={styles.modalTitle}>Delete Account</Text>
            <Text style={styles.modalMessage}>
              Type <Text style={styles.modalBold}>DELETE</Text> below to permanently delete your account and all data.
            </Text>
            <TextInput
              style={styles.modalInput}
              value={deleteInput}
              onChangeText={setDeleteInput}
              placeholder="Type DELETE to confirm"
              placeholderTextColor={colors.textTertiary}
              autoCapitalize="characters"
              autoCorrect={false}
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.modalCancelButton}
                onPress={() => {
                  setShowDeleteModal(false);
                  setDeleteInput('');
                }}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.modalDeleteButton,
                  deleteInput !== 'DELETE' && styles.modalDeleteButtonDisabled,
                ]}
                onPress={confirmDeleteAccount}
                disabled={deleteInput !== 'DELETE' || isLoading}
              >
                {isLoading ? (
                  <ActivityIndicator color={colors.white} size="small" />
                ) : (
                  <Text style={styles.modalDeleteText}>Delete Forever</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ============================================ */}
      {/* DETECTION ZONE PICKER MODAL */}
      {/* ============================================ */}
      <Modal
        visible={showRadiusPicker}
        transparent
        animationType="fade"
        onRequestClose={() => setShowRadiusPicker(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setShowRadiusPicker(false)}>
          <View style={styles.pickerCard} onStartShouldSetResponder={() => true}>
            <Text style={styles.pickerTitle}>Detection Zone</Text>
            <Text style={styles.pickerSubtitle}>Radius around your location for automatic detection</Text>
            {DETECTION_ZONE_OPTIONS.map((radius) => (
              <TouchableOpacity
                key={radius}
                style={styles.pickerOption}
                onPress={() => handleRadiusChange(radius)}
                activeOpacity={0.6}
              >
                <Text style={[
                  styles.pickerOptionText,
                  settings.defaultRadius === radius && styles.pickerOptionActive,
                ]}>{radius}m</Text>
                {settings.defaultRadius === radius && (
                  <Ionicons name="checkmark" size={20} color={colors.primary} />
                )}
              </TouchableOpacity>
            ))}
          </View>
        </Pressable>
      </Modal>
    </ScrollView>
  );
}

// ============================================
// STYLES
// ============================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    paddingBottom: spacing['4xl'],
  },

  // ============================================
  // PROFILE CARD
  // ============================================
  profileSection: {
    alignItems: 'center',
    paddingTop: spacing['3xl'],
    paddingBottom: spacing['3xl'],
  },
  profileName: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    marginBottom: spacing.xxs,
  },
  profileEmail: {
    fontSize: 14,
    color: colors.textSecondary,
  },

  // ============================================
  // SECTION HEADERS
  // ============================================
  sectionHeader: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginLeft: spacing['3xl'],
    marginTop: spacing.xxl,
    marginBottom: spacing.sm,
  },

  // ============================================
  // GROUPED CARD
  // ============================================
  groupedCard: {
    backgroundColor: colors.white,
    borderRadius: borderRadius.md,
    marginHorizontal: spacing.lg,
    borderWidth: 0.5,
    borderColor: colors.border,
    overflow: 'hidden',
  },

  // ============================================
  // ROWS
  // ============================================
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 52,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  rowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  rowIcon: {
    marginRight: spacing.md,
    width: 24,
    textAlign: 'center',
  },
  rowText: {
    fontSize: 15,
    fontWeight: '500',
    color: colors.text,
  },
  rowSeparator: {
    height: 0.5,
    backgroundColor: colors.border,
    marginLeft: 52,
  },

  // ============================================
  // BATTERY REVIEW BADGE
  // ============================================
  reviewBadge: {
    backgroundColor: colors.warningSoft,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs,
    borderRadius: borderRadius.sm,
  },
  reviewBadgeText: {
    color: colors.warning,
    fontSize: 12,
    fontWeight: '600',
  },

  // ============================================
  // SIGN OUT
  // ============================================
  signOutSection: {
    marginTop: spacing['3xl'],
  },
  signOutRow: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
    paddingVertical: spacing.sm,
  },
  signOutText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.primary,
  },

  // ============================================
  // DELETE ACCOUNT
  // ============================================
  deleteAccountRow: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.lg,
    paddingVertical: spacing.md,
  },
  deleteAccountText: {
    fontSize: 15,
    fontWeight: '500',
    color: colors.textSecondary,
  },

  // ============================================
  // FOOTER
  // ============================================
  footer: {
    height: 40,
  },

  // ============================================
  // DELETE ACCOUNT MODAL
  // ============================================
  modalOverlay: {
    flex: 1,
    backgroundColor: colors.overlayHeavy,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xxl,
  },
  modalContent: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.xxl,
    width: '100%',
    maxWidth: 400,
    alignItems: 'center',
  },
  modalIcon: {
    marginBottom: spacing.md,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    marginBottom: spacing.sm,
  },
  modalMessage: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: spacing.lg,
  },
  modalBold: {
    fontWeight: '700',
    color: colors.error,
  },
  modalInput: {
    width: '100%',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontSize: 16,
    color: colors.text,
    textAlign: 'center',
    letterSpacing: 2,
    marginBottom: spacing.xl,
    backgroundColor: colors.background,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: spacing.md,
    width: '100%',
  },
  modalCancelButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: borderRadius.sm,
    alignItems: 'center',
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
  },
  modalCancelText: {
    fontSize: 15,
    fontWeight: '500',
    color: colors.text,
  },
  modalDeleteButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: borderRadius.sm,
    alignItems: 'center',
    backgroundColor: colors.error,
  },
  modalDeleteButtonDisabled: {
    opacity: 0.4,
  },
  modalDeleteText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
  },

  // ============================================
  // DETECTION ZONE PICKER
  // ============================================
  pickerCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.xl,
    width: '100%',
    maxWidth: 340,
  },
  pickerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    marginBottom: spacing.xs,
  },
  pickerSubtitle: {
    fontSize: 13,
    color: colors.textSecondary,
    marginBottom: spacing.lg,
  },
  pickerOption: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    borderTopWidth: 0.5,
    borderTopColor: colors.borderLight,
  },
  pickerOptionText: {
    fontSize: 16,
    color: colors.text,
  },
  pickerOptionActive: {
    fontWeight: '600',
    color: colors.primary,
  },

  // UX6: Signing out overlay
  signingOutOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
    gap: spacing.md,
  },
  signingOutText: {
    fontSize: 15,
    color: colors.textSecondary,
  },
});
