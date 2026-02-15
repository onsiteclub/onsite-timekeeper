/**
 * Settings Screen - OnSite Timekeeper v2
 *
 * Accordion-style settings with timer configurations.
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
  Linking,
  Modal,
  TextInput,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { startActivityAsync, ActivityAction } from 'expo-intent-launcher';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import Constants from 'expo-constants';
import { colors, withOpacity } from '../../src/constants/colors';
import { useAuthStore } from '../../src/stores/authStore';
import {
  useSettingsStore,
  TIMER_OPTIONS,
} from '../../src/stores/settingsStore';
import { onUserLogout } from '../../src/lib/bootstrap';

// ============================================
// ACCORDION SECTION
// ============================================

interface AccordionProps {
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
  children: React.ReactNode;
  defaultOpen?: boolean;
}

function AccordionSection({ title, icon, children, defaultOpen = false }: AccordionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <View style={styles.accordionContainer}>
      <TouchableOpacity
        style={styles.accordionHeader}
        onPress={() => setIsOpen(!isOpen)}
        activeOpacity={0.7}
      >
        <View style={styles.accordionTitleRow}>
          <Ionicons name={icon} size={22} color={colors.primary} />
          <Text style={styles.accordionTitle}>{title}</Text>
        </View>
        <Ionicons
          name={isOpen ? 'chevron-up' : 'chevron-down'}
          size={20}
          color={colors.textSecondary}
        />
      </TouchableOpacity>
      {isOpen && <View style={styles.accordionContent}>{children}</View>}
    </View>
  );
}

// ============================================
// SELECT ROW (for timer options)
// ============================================

interface SelectRowProps {
  label: string;
  value: number;
  options: readonly { value: number; label: string }[];
  onChange: (value: number) => void;
  hint?: string;
}

function SelectRow({ label, value, options, onChange, hint }: SelectRowProps) {
  const [showOptions, setShowOptions] = useState(false);
  const currentOption = options.find(o => o.value === value);

  return (
    <View style={styles.settingRow}>
      <View style={styles.settingLabelContainer}>
        <Text style={styles.settingLabel}>{label}</Text>
        {hint && <Text style={styles.settingHint}>{hint}</Text>}
      </View>
      
      <TouchableOpacity
        style={styles.selectButton}
        onPress={() => setShowOptions(!showOptions)}
      >
        <Text style={styles.selectButtonText}>
          {currentOption?.label || `${value}`}
        </Text>
        <Ionicons name="chevron-down" size={16} color={colors.textSecondary} />
      </TouchableOpacity>

      {showOptions && (
        <View style={styles.optionsContainer}>
          {options.map((option) => (
            <TouchableOpacity
              key={option.value}
              style={[
                styles.optionItem,
                option.value === value && styles.optionItemSelected,
              ]}
              onPress={() => {
                onChange(option.value);
                setShowOptions(false);
              }}
            >
              <Text
                style={[
                  styles.optionText,
                  option.value === value && styles.optionTextSelected,
                ]}
              >
                {option.label}
              </Text>
              {option.value === value && (
                <Ionicons name="checkmark" size={18} color={colors.primary} />
              )}
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
}

// ============================================
// SWITCH ROW
// ============================================

interface SwitchRowProps {
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
  hint?: string;
}

function SwitchRow({ label, value, onChange, hint }: SwitchRowProps) {
  return (
    <View style={styles.settingRow}>
      <View style={styles.settingLabelContainer}>
        <Text style={styles.settingLabel}>{label}</Text>
        {hint && <Text style={styles.settingHint}>{hint}</Text>}
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ false: colors.border, true: colors.primaryLight }}
        thumbColor={value ? colors.primary : colors.textTertiary}
      />
    </View>
  );
}

// ============================================
// MAIN COMPONENT
// ============================================

export default function SettingsScreen() {
  const router = useRouter();
  const { user, signOut, deleteAccount, isLoading } = useAuthStore();
  const settings = useSettingsStore();
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteInput, setDeleteInput] = useState('');

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

  const handleResetSettings = () => {
    Alert.alert(
      'Reset Settings',
      'This will restore all settings to their default values.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: () => settings.resetSettings(),
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

  // Get user initials for avatar
  const getUserInitials = () => {
    const email = user?.email || '';
    return email ? email[0].toUpperCase() : '?';
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Profile Header */}
      <View style={styles.profileSection}>
        <View style={styles.avatarContainer}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {getUserInitials()}
            </Text>
          </View>
        </View>
        <Text style={styles.userName}>{user?.email || 'Guest'}</Text>
      </View>

      {/* ============================================ */}
      {/* TIMERS SECTION */}
      {/* ============================================ */}
      <AccordionSection title="Timers" icon="timer-outline">
        <SelectRow
          label="Entry timeout"
          value={settings.entryTimeoutMinutes}
          options={TIMER_OPTIONS.entryTimeout}
          onChange={(v) => settings.updateSetting('entryTimeoutMinutes', v)}
          hint="Time before auto-start when entering a location"
        />

        <View style={styles.divider} />

        <SelectRow
          label="Exit adjustment"
          value={settings.exitAdjustmentMinutes}
          options={TIMER_OPTIONS.exitAdjustment}
          onChange={(v) => settings.updateSetting('exitAdjustmentMinutes', v)}
          hint="Minutes deducted from exit time at end of day"
        />
      </AccordionSection>

      {/* ============================================ */}
      {/* AUTO-ACTIONS SECTION */}
      {/* ============================================ */}
      <AccordionSection title="Auto-Actions" icon="flash-outline">
        <SwitchRow
          label="Auto-start"
          value={settings.autoStartEnabled}
          onChange={(v) => settings.updateSetting('autoStartEnabled', v)}
          hint="Automatically start tracking when entering a location"
        />

        <View style={styles.divider} />

        <SwitchRow
          label="Auto-stop"
          value={settings.autoStopEnabled}
          onChange={(v) => settings.updateSetting('autoStopEnabled', v)}
          hint="Automatically stop tracking when leaving a location"
        />
      </AccordionSection>

      {/* ============================================ */}
      {/* NOTIFICATIONS SECTION */}
      {/* ============================================ */}
      <AccordionSection title="Notifications" icon="notifications-outline">
        <SwitchRow
          label="Notifications"
          value={settings.notificationsEnabled}
          onChange={(v) => settings.updateSetting('notificationsEnabled', v)}
          hint="Show notifications for geofence events"
        />

        <View style={styles.divider} />

        <SwitchRow
          label="Sound"
          value={settings.soundEnabled}
          onChange={(v) => settings.updateSetting('soundEnabled', v)}
        />

        <View style={styles.divider} />

        <SwitchRow
          label="Vibration"
          value={settings.vibrationEnabled}
          onChange={(v) => settings.updateSetting('vibrationEnabled', v)}
        />
      </AccordionSection>

      {/* ============================================ */}
      {/* BATTERY OPTIMIZATION (Android only) */}
      {/* ============================================ */}
      {Platform.OS === 'android' && (
        <AccordionSection title="Battery" icon="battery-half-outline">
          <TouchableOpacity
            style={styles.legalButton}
            onPress={handleOpenBatterySettings}
          >
            <View style={styles.legalButtonContent}>
              <Ionicons name="shield-checkmark-outline" size={20} color={colors.primary} />
              <View style={styles.legalButtonText}>
                <Text style={styles.legalButtonTitle}>Battery Optimization</Text>
                <Text style={styles.legalButtonSubtitle}>
                  Allow unrestricted background access
                </Text>
              </View>
            </View>
            {settings.batteryOptimizationSkipped ? (
              <View style={styles.reviewBadge}>
                <Text style={styles.reviewBadgeText}>Review</Text>
              </View>
            ) : (
              <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
            )}
          </TouchableOpacity>
        </AccordionSection>
      )}

      {/* ============================================ */}
      {/* LEGAL SECTION */}
      {/* ============================================ */}
      <AccordionSection title="Legal" icon="document-text-outline">
        <TouchableOpacity
          style={styles.legalButton}
          onPress={() => router.push('/legal' as any)}
        >
          <View style={styles.legalButtonContent}>
            <Ionicons name="shield-checkmark-outline" size={20} color={colors.primary} />
            <View style={styles.legalButtonText}>
              <Text style={styles.legalButtonTitle}>Privacy & Terms</Text>
              <Text style={styles.legalButtonSubtitle}>View our policies in the app</Text>
            </View>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
        </TouchableOpacity>

        <View style={styles.divider} />

        <TouchableOpacity
          style={styles.linkRow}
          onPress={() => Linking.openURL('https://onsiteclub.ca/legal/timekeeper/privacy.html')}
        >
          <Text style={styles.linkText}>Privacy Policy (Web)</Text>
          <Ionicons name="open-outline" size={18} color={colors.textSecondary} />
        </TouchableOpacity>

        <View style={styles.divider} />

        <TouchableOpacity
          style={styles.linkRow}
          onPress={() => Linking.openURL('https://onsiteclub.ca/legal/timekeeper/terms.html')}
        >
          <Text style={styles.linkText}>Terms of Service (Web)</Text>
          <Ionicons name="open-outline" size={18} color={colors.textSecondary} />
        </TouchableOpacity>
      </AccordionSection>

      {/* ============================================ */}
      {/* ABOUT SECTION */}
      {/* ============================================ */}
      <AccordionSection title="About" icon="information-circle-outline">
        <TouchableOpacity
          style={styles.linkRow}
          onPress={() => Linking.openURL('https://onsiteclub.ca')}
        >
          <Text style={styles.linkText}>Website</Text>
          <Ionicons name="open-outline" size={18} color={colors.textSecondary} />
        </TouchableOpacity>

        <View style={styles.divider} />

        <View style={styles.versionRow}>
          <Text style={styles.versionLabel}>Version</Text>
          <Text style={styles.versionValue}>{Constants.expoConfig?.version || '1.0.0'}</Text>
        </View>

        <View style={styles.divider} />

        <TouchableOpacity
          style={styles.linkRow}
          onPress={() => router.push('/logs' as any)}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Ionicons name="terminal-outline" size={18} color={colors.textSecondary} />
            <Text style={styles.linkText}>System Logs</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
        </TouchableOpacity>
      </AccordionSection>

      {/* ============================================ */}
      {/* ACCOUNT SECTION */}
      {/* ============================================ */}
      <AccordionSection title="Account" icon="person-outline">
        <TouchableOpacity style={styles.linkRow} onPress={handleResetSettings}>
          <Text style={styles.linkText}>Reset settings</Text>
          <Ionicons name="refresh-outline" size={18} color={colors.textSecondary} />
        </TouchableOpacity>

        <View style={styles.divider} />

        <TouchableOpacity style={styles.dangerRow} onPress={handleSignOut}>
          <Ionicons name="log-out-outline" size={20} color={colors.error} />
          <Text style={styles.dangerText}>Sign out</Text>
        </TouchableOpacity>

        <View style={styles.divider} />

        <TouchableOpacity style={styles.dangerRow} onPress={handleDeleteAccount}>
          <Ionicons name="trash-outline" size={20} color={colors.error} />
          <Text style={styles.dangerText}>Delete account</Text>
        </TouchableOpacity>
      </AccordionSection>

      <View style={styles.footer} />

      {/* Delete Account Confirmation Modal */}
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

  // Profile
  profileSection: {
    alignItems: 'center',
    paddingVertical: 24,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  avatarContainer: {
    position: 'relative',
    marginBottom: 12,
  },
  avatar: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarImage: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: colors.surfaceMuted,
  },
  avatarText: {
    fontSize: 32,
    fontWeight: '700',
    color: '#fff',
  },
  avatarEditBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: colors.background,
  },
  userName: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 2,
  },
  userEmail: {
    fontSize: 14,
    color: colors.textSecondary,
  },

  // Accordion
  accordionContainer: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  accordionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  accordionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  accordionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  accordionContent: {
    paddingHorizontal: 16,
    paddingBottom: 16,
  },

  // Settings rows
  settingRow: {
    paddingVertical: 12,
  },
  settingLabelContainer: {
    flex: 1,
    marginBottom: 8,
  },
  settingLabel: {
    fontSize: 15,
    color: colors.text,
    fontWeight: '500',
  },
  settingHint: {
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 2,
  },

  // Select button
  selectButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  selectButtonText: {
    fontSize: 15,
    color: colors.text,
  },

  // Options dropdown
  optionsContainer: {
    marginTop: 8,
    backgroundColor: colors.surface,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  optionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  optionItemSelected: {
    backgroundColor: colors.primaryLight + '20',
  },
  optionText: {
    fontSize: 15,
    color: colors.text,
  },
  optionTextSelected: {
    color: colors.primary,
    fontWeight: '500',
  },

  // Link row
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
  },
  linkText: {
    fontSize: 15,
    color: colors.text,
  },

  // Danger row
  dangerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 12,
  },
  dangerText: {
    fontSize: 15,
    color: colors.error,
    fontWeight: '500',
  },

  // Version
  versionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
  },
  versionLabel: {
    fontSize: 15,
    color: colors.text,
  },
  versionValue: {
    fontSize: 15,
    color: colors.textSecondary,
  },

  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: 4,
  },

  // Legal button
  legalButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 12,
    backgroundColor: colors.primarySoft,
    borderRadius: 10,
    marginBottom: 8,
  },
  legalButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  legalButtonText: {
    gap: 2,
  },
  legalButtonTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
  },
  legalButtonSubtitle: {
    fontSize: 13,
    color: colors.textSecondary,
  },

  // Battery optimization badge
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

  footer: {
    height: 40,
  },

  // Delete Account Modal
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
