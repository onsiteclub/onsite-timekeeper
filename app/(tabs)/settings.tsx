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
  Switch,
  Alert,
  Modal,
  TextInput,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { startActivityAsync, ActivityAction } from 'expo-intent-launcher';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import Constants from 'expo-constants';
import { colors } from '../../src/constants/colors';
import { useAuthStore } from '../../src/stores/authStore';
import { useSettingsStore } from '../../src/stores/settingsStore';
import { onUserLogout } from '../../src/lib/bootstrap';
import { useBusinessProfileStore } from '../../src/stores/businessProfileStore';

// ============================================
// MAIN COMPONENT
// ============================================

export default function MoreScreen() {
  const router = useRouter();
  const { user, signOut, deleteAccount, isLoading, getUserName } = useAuthStore();
  const settings = useSettingsStore();
  const businessProfile = useBusinessProfileStore(s => s.profile);
  const loadBusinessProfile = useBusinessProfileStore(s => s.loadProfile);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteInput, setDeleteInput] = useState('');

  // ============================================
  // HANDLERS
  // ============================================

  const handleVersionLongPress = () => {
    router.push('/logs' as any);
  };

  const handleSignOut = async () => {
    Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign Out',
          style: 'destructive',
          onPress: async () => {
            await onUserLogout();
            await signOut();
            router.replace('/');
          },
        },
      ]
    );
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      'Delete Account',
      'This will permanently delete your account and ALL your data (work hours, locations, audit trail). This action CANNOT be undone.\n\nAre you sure you want to continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Continue',
          style: 'destructive',
          onPress: () => {
            setDeleteInput('');
            setShowDeleteModal(true);
          },
        },
      ]
    );
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

  // Get user initials for avatar
  const getUserInitials = () => {
    const name = getUserName();
    if (name && name.includes(' ')) {
      const parts = name.split(' ');
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    if (name) return name[0].toUpperCase();
    const email = user?.email || '';
    return email ? email[0].toUpperCase() : '?';
  };

  const appVersion = Constants.expoConfig?.version || '1.0.0';

  // ============================================
  // RENDER
  // ============================================

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>

      {/* ============================================ */}
      {/* PROFILE CARD */}
      {/* ============================================ */}
      <View style={styles.profileSection}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{getUserInitials()}</Text>
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
          onPress={() => router.push('/business-profile' as any)}
          activeOpacity={0.6}
        >
          <View style={styles.rowLeft}>
            <Ionicons name="briefcase" size={20} color={colors.primary} style={styles.rowIcon} />
            <Text style={styles.rowText}>Business Profile</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
        </TouchableOpacity>

        <View style={styles.rowSeparator} />

        <TouchableOpacity
          style={styles.row}
          onPress={() => router.push('/(tabs)/team' as any)}
          activeOpacity={0.6}
        >
          <View style={styles.rowLeft}>
            <Ionicons name="people" size={20} color={colors.primary} style={styles.rowIcon} />
            <Text style={styles.rowText}>My Crew</Text>
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
            <Text style={styles.rowText}>Auto-logging</Text>
          </View>
          <Switch
            value={settings.autoLoggingEnabled}
            onValueChange={(v) => settings.updateSetting('autoLoggingEnabled', v)}
            trackColor={{ false: colors.border, true: colors.primarySoft }}
            thumbColor={settings.autoLoggingEnabled ? colors.primary : '#FFFFFF'}
          />
        </View>

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
          onLongPress={handleVersionLongPress}
          delayLongPress={5000}
          activeOpacity={1}
        >
          <View style={styles.rowLeft}>
            <Ionicons name="information-circle" size={20} color={colors.primary} style={styles.rowIcon} />
            <Text style={styles.rowText}>OnSite v{appVersion}</Text>
          </View>
        </TouchableOpacity>
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
        <View style={styles.modalOverlay}>
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
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.modalDeleteText}>Delete Forever</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
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
    paddingBottom: 40,
  },

  // ============================================
  // PROFILE CARD
  // ============================================
  profileSection: {
    alignItems: 'center',
    paddingTop: 32,
    paddingBottom: 28,
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  avatarText: {
    fontSize: 24,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  profileName: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 2,
  },
  profileEmail: {
    fontSize: 14,
    color: colors.textSecondary,
  },

  // ============================================
  // SECTION HEADERS
  // ============================================
  sectionHeader: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textSecondary,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginLeft: 32,
    marginTop: 24,
    marginBottom: 6,
  },

  // ============================================
  // GROUPED CARD
  // ============================================
  groupedCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    marginHorizontal: 16,
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
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  rowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  rowIcon: {
    marginRight: 12,
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
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  reviewBadgeText: {
    color: colors.warning,
    fontSize: 11,
    fontWeight: '600',
  },

  // ============================================
  // SIGN OUT
  // ============================================
  signOutSection: {
    marginTop: 32,
  },
  signOutRow: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
    paddingVertical: 8,
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
    marginTop: 16,
    paddingVertical: 12,
  },
  deleteAccountText: {
    fontSize: 13,
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
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalContent: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 400,
    alignItems: 'center',
  },
  modalIcon: {
    marginBottom: 12,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 8,
  },
  modalMessage: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 16,
  },
  modalBold: {
    fontWeight: '700',
    color: colors.error,
  },
  modalInput: {
    width: '100%',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    color: colors.text,
    textAlign: 'center',
    letterSpacing: 2,
    marginBottom: 20,
    backgroundColor: colors.background,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
  },
  modalCancelButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
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
    paddingVertical: 12,
    borderRadius: 8,
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
});
