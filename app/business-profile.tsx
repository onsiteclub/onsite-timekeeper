/**
 * Business Profile Screen - OnSite Timekeeper
 *
 * Form to manage business details (name, address, tax info).
 * Data used in PDF report exports and future invoicing.
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { colors, spacing, borderRadius } from '../src/constants/colors';
import { useBusinessProfileStore } from '../src/stores/businessProfileStore';
import { useAuthStore } from '../src/stores/authStore';

// ============================================
// CANADIAN PROVINCES
// ============================================

const PROVINCES = [
  'AB', 'BC', 'MB', 'NB', 'NL', 'NS', 'NT', 'NU', 'ON', 'PE', 'QC', 'SK', 'YT',
] as const;

// ============================================
// COMPONENT
// ============================================

export default function BusinessProfileScreen() {
  const router = useRouter();
  const { user } = useAuthStore();
  const { profile, loadProfile, saveProfile, deleteProfile } = useBusinessProfileStore();

  // Form state
  const [businessName, setBusinessName] = useState('');
  const [addressStreet, setAddressStreet] = useState('');
  const [addressCity, setAddressCity] = useState('');
  const [addressProvince, setAddressProvince] = useState('');
  const [addressPostalCode, setAddressPostalCode] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [businessNumber, setBusinessNumber] = useState('');
  const [gstHstNumber, setGstHstNumber] = useState('');
  const [hourlyRate, setHourlyRate] = useState('');
  const [taxRate, setTaxRate] = useState('');
  const [hasChanges, setHasChanges] = useState(false);

  // Load profile on mount
  useEffect(() => {
    if (user?.id) {
      loadProfile(user.id);
    }
  }, [user?.id]);

  // Populate form when profile loads
  useEffect(() => {
    if (profile) {
      setBusinessName(profile.business_name || '');
      setAddressStreet(profile.address_street || '');
      setAddressCity(profile.address_city || '');
      setAddressProvince(profile.address_province || '');
      setAddressPostalCode(profile.address_postal_code || '');
      setPhone(profile.phone || '');
      setEmail(profile.email || '');
      setBusinessNumber(profile.business_number || '');
      setGstHstNumber(profile.gst_hst_number || '');
      setHourlyRate(profile.default_hourly_rate?.toString() || '');
      setTaxRate(profile.tax_rate?.toString() || '');
      setHasChanges(false);
    }
  }, [profile]);

  const markChanged = (setter: (v: string) => void) => (value: string) => {
    setter(value);
    setHasChanges(true);
  };

  const handleSave = () => {
    if (!user?.id) return;

    const success = saveProfile(user.id, {
      businessName: businessName.trim(),
      addressStreet: addressStreet.trim() || null,
      addressCity: addressCity.trim() || null,
      addressProvince: addressProvince.trim().toUpperCase() || null,
      addressPostalCode: addressPostalCode.trim() || null,
      phone: phone.trim() || null,
      email: email.trim() || null,
      businessNumber: businessNumber.trim() || null,
      gstHstNumber: gstHstNumber.trim() || null,
      defaultHourlyRate: hourlyRate ? parseFloat(hourlyRate) : null,
      taxRate: taxRate ? parseFloat(taxRate) : null,
    });

    if (success) {
      setHasChanges(false);
      Alert.alert('Saved', 'Business profile updated successfully.');
    }
  };

  const handleDelete = () => {
    if (!user?.id) return;
    Alert.alert(
      'Delete Business Profile',
      'This will clear all business profile information. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            deleteProfile(user.id);
            setBusinessName('');
            setAddressStreet('');
            setAddressCity('');
            setAddressProvince('');
            setAddressPostalCode('');
            setPhone('');
            setEmail('');
            setBusinessNumber('');
            setGstHstNumber('');
            setHourlyRate('');
            setTaxRate('');
            setHasChanges(false);
            Alert.alert('Deleted', 'Business profile cleared.');
          },
        },
      ]
    );
  };

  const handleBack = () => {
    if (hasChanges) {
      Alert.alert(
        'Unsaved Changes',
        'You have unsaved changes. Discard them?',
        [
          { text: 'Keep Editing', style: 'cancel' },
          { text: 'Discard', style: 'destructive', onPress: () => router.back() },
        ]
      );
    } else {
      router.back();
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.headerButton} onPress={handleBack}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Business Profile</Text>
        <View style={{ width: 40 }} />
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          style={styles.content}
          contentContainerStyle={styles.contentContainer}
          keyboardShouldPersistTaps="handled"
        >
          {/* Business Info Section */}
          <Text style={styles.sectionTitle}>Business Info</Text>
          <View style={styles.card}>
            <FormField
              label="Business Name"
              value={businessName}
              onChangeText={markChanged(setBusinessName)}
              placeholder="Your business or personal name"
              required
            />
            <Divider />
            <FormField
              label="Phone"
              value={phone}
              onChangeText={markChanged(setPhone)}
              placeholder="(416) 555-1234"
              keyboardType="phone-pad"
            />
            <Divider />
            <FormField
              label="Email"
              value={email}
              onChangeText={markChanged(setEmail)}
              placeholder="you@example.com"
              keyboardType="email-address"
              autoCapitalize="none"
            />
          </View>

          {/* Address Section */}
          <Text style={styles.sectionTitle}>Address</Text>
          <View style={styles.card}>
            <FormField
              label="Street"
              value={addressStreet}
              onChangeText={markChanged(setAddressStreet)}
              placeholder="123 Main Street"
            />
            <Divider />
            <FormField
              label="City"
              value={addressCity}
              onChangeText={markChanged(setAddressCity)}
              placeholder="Toronto"
            />
            <Divider />
            <View style={styles.row}>
              <View style={styles.rowHalf}>
                <FormField
                  label="Province"
                  value={addressProvince}
                  onChangeText={markChanged(setAddressProvince)}
                  placeholder="ON"
                  autoCapitalize="characters"
                  maxLength={2}
                />
              </View>
              <View style={styles.rowHalf}>
                <FormField
                  label="Postal Code"
                  value={addressPostalCode}
                  onChangeText={markChanged(setAddressPostalCode)}
                  placeholder="M5V 2T6"
                  autoCapitalize="characters"
                  maxLength={7}
                />
              </View>
            </View>
          </View>

          {/* Tax & Billing Section */}
          <Text style={styles.sectionTitle}>Tax & Billing</Text>
          <View style={styles.card}>
            <FormField
              label="Business Number (BN)"
              value={businessNumber}
              onChangeText={markChanged(setBusinessNumber)}
              placeholder="123456789"
              hint="CRA Business Number"
            />
            <Divider />
            <FormField
              label="GST/HST Number"
              value={gstHstNumber}
              onChangeText={markChanged(setGstHstNumber)}
              placeholder="123456789 RT0001"
              hint="Leave blank if not registered"
            />
            <Divider />
            <FormField
              label="Default Hourly Rate"
              value={hourlyRate}
              onChangeText={markChanged(setHourlyRate)}
              placeholder="0.00"
              keyboardType="decimal-pad"
              prefix="$"
              hint="Used in report exports"
            />
            <Divider />
            <FormField
              label="Tax Rate"
              value={taxRate}
              onChangeText={markChanged(setTaxRate)}
              placeholder="13"
              keyboardType="decimal-pad"
              suffix="%"
              hint="e.g. 13 for Ontario HST, 5 for GST only"
            />
          </View>

          {/* Info note */}
          <View style={styles.infoBox}>
            <Ionicons name="information-circle-outline" size={18} color={colors.info} />
            <Text style={styles.infoText}>
              This information appears on your exported timesheets and reports. It stays on your device and syncs securely to your account.
            </Text>
          </View>

          {/* Action buttons */}
          <View style={styles.actionRow}>
            <TouchableOpacity
              style={styles.deleteButton}
              onPress={handleDelete}
            >
              <Ionicons name="trash-outline" size={18} color={colors.error} />
              <Text style={styles.deleteButtonText}>Delete</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.saveButtonBottom, !hasChanges && styles.saveButtonBottomDisabled]}
              onPress={handleSave}
              disabled={!hasChanges}
            >
              <Ionicons name="checkmark" size={18} color={hasChanges ? colors.white : colors.textTertiary} />
              <Text style={[styles.saveButtonBottomText, !hasChanges && styles.saveButtonBottomTextDisabled]}>
                Save
              </Text>
            </TouchableOpacity>
          </View>

          <View style={{ height: 40 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ============================================
// SUB-COMPONENTS
// ============================================

interface FormFieldProps {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  hint?: string;
  required?: boolean;
  keyboardType?: 'default' | 'email-address' | 'phone-pad' | 'decimal-pad' | 'numeric';
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  maxLength?: number;
  prefix?: string;
  suffix?: string;
}

function FormField({
  label,
  value,
  onChangeText,
  placeholder,
  hint,
  required,
  keyboardType = 'default',
  autoCapitalize = 'sentences',
  maxLength,
  prefix,
  suffix,
}: FormFieldProps) {
  return (
    <View style={styles.fieldContainer}>
      <Text style={styles.fieldLabel}>
        {label}
        {required && <Text style={styles.required}> *</Text>}
      </Text>
      <View style={styles.inputRow}>
        {prefix && <Text style={styles.inputAffix}>{prefix}</Text>}
        <TextInput
          style={[styles.input, prefix && styles.inputWithPrefix, suffix && styles.inputWithSuffix]}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={colors.textTertiary}
          keyboardType={keyboardType}
          autoCapitalize={autoCapitalize}
          maxLength={maxLength}
        />
        {suffix && <Text style={styles.inputAffix}>{suffix}</Text>}
      </View>
      {hint && <Text style={styles.fieldHint}>{hint}</Text>}
    </View>
  );
}

function Divider() {
  return <View style={styles.divider} />;
}

// ============================================
// STYLES
// ============================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
  },
  saveButton: {
    width: 'auto',
    paddingHorizontal: 16,
    backgroundColor: colors.accent,
  },
  saveButtonDisabled: {
    backgroundColor: colors.border,
  },
  saveButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.white,
  },
  saveButtonTextDisabled: {
    color: colors.textTertiary,
  },

  // Content
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
  },

  // Sections
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 20,
    marginBottom: 8,
    marginLeft: 4,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },

  // Form fields
  fieldContainer: {
    paddingVertical: 8,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.textSecondary,
    marginBottom: 6,
  },
  required: {
    color: colors.error,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: colors.text,
    paddingVertical: 8,
    paddingHorizontal: 0,
  },
  inputWithPrefix: {
    paddingLeft: 4,
  },
  inputWithSuffix: {
    paddingRight: 4,
  },
  inputAffix: {
    fontSize: 16,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  fieldHint: {
    fontSize: 12,
    color: colors.textTertiary,
    marginTop: 4,
  },

  // Layout
  row: {
    flexDirection: 'row',
    gap: 16,
  },
  rowHalf: {
    flex: 1,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: 4,
  },

  // Action buttons
  actionRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 24,
  },
  deleteButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 14,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.error,
    backgroundColor: colors.surface,
  },
  deleteButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.error,
  },
  saveButtonBottom: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 14,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.accent,
  },
  saveButtonBottomDisabled: {
    backgroundColor: colors.border,
  },
  saveButtonBottomText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.white,
  },
  saveButtonBottomTextDisabled: {
    color: colors.textTertiary,
  },

  // Info box
  infoBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginTop: 16,
    paddingHorizontal: 4,
  },
  infoText: {
    flex: 1,
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 18,
  },
});
