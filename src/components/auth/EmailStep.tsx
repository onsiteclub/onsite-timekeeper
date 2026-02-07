/**
 * EmailStep - OnSite Timekeeper
 * Step 1: Email input - checks if account exists on button click
 */

import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../constants/colors';

// Logo
const logoOnsite = require('../../../assets/logo_onsite.png');

interface EmailStepProps {
  onEmailSubmit: (email: string, exists: boolean) => void;
  isLoading: boolean;
  setIsLoading: (loading: boolean) => void;
  checkEmailExists: (email: string) => Promise<boolean>;
}

export default function EmailStep({
  onEmailSubmit,
  isLoading,
  setIsLoading,
  checkEmailExists,
}: EmailStepProps) {
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);

  const validateEmail = (emailStr: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(emailStr);
  };

  const handleSubmit = useCallback(async () => {
    setError(null);

    const trimmedEmail = email.trim();

    if (!trimmedEmail) {
      setError('Please enter your email');
      return;
    }

    if (!validateEmail(trimmedEmail)) {
      setError('Please enter a valid email address');
      return;
    }

    // Show loading spinner while checking
    setIsLoading(true);

    try {
      // Check if email exists in Supabase
      const exists = await checkEmailExists(trimmedEmail);
      // Navigate to appropriate step
      onEmailSubmit(trimmedEmail, exists);
    } catch (err) {
      setError('Something went wrong. Please try again.');
      console.log('[EmailStep] Error:', err);
    } finally {
      setIsLoading(false);
    }
  }, [email, checkEmailExists, onEmailSubmit, setIsLoading]);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      {/* Header */}
      <View style={styles.header}>
        <Image
          source={logoOnsite}
          style={styles.logo}
          resizeMode="contain"
        />
        <Text style={styles.subtitle}>Enter your email to continue</Text>
      </View>

      {/* Form */}
      <View style={styles.form}>
        {error && (
          <View style={styles.errorBox}>
            <Ionicons name="alert-circle" size={18} color={colors.error} />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {/* Email Input */}
        <View style={styles.inputContainer}>
          <Text style={styles.label}>Email</Text>
          <TextInput
            style={styles.input}
            placeholder="your@email.com"
            placeholderTextColor={colors.textTertiary}
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            autoFocus
            value={email}
            onChangeText={setEmail}
            editable={!isLoading}
            onSubmitEditing={handleSubmit}
            returnKeyType="next"
          />
        </View>

        {/* Submit Button */}
        <TouchableOpacity
          style={[
            styles.button,
            (isLoading || !email.trim()) && styles.buttonDisabled
          ]}
          onPress={handleSubmit}
          disabled={isLoading || !email.trim()}
          activeOpacity={0.8}
        >
          {isLoading ? (
            <>
              <ActivityIndicator size="small" color={colors.white} />
              <Text style={styles.buttonText}>Verifying...</Text>
            </>
          ) : (
            <Text style={styles.buttonText}>Continue</Text>
          )}
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 24,
  },

  // Header
  header: {
    alignItems: 'center',
    marginBottom: 40,
  },
  logo: {
    width: 200,
    height: 60,
    marginBottom: 24,
  },
  subtitle: {
    fontSize: 16,
    color: colors.textSecondary,
    textAlign: 'center',
  },

  // Form
  form: {
    width: '100%',
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.errorSoft,
    padding: 12,
    borderRadius: 10,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.error + '30',
  },
  errorText: {
    flex: 1,
    color: colors.error,
    fontSize: 14,
  },

  // Input
  inputContainer: {
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: colors.text,
    backgroundColor: colors.backgroundTertiary,
  },

  // Button
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.primary,
    paddingVertical: 16,
    borderRadius: 12,
    marginTop: 8,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.white,
  },
});
