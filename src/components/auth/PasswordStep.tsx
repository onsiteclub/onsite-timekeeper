/**
 * PasswordStep - OnSite Timekeeper
 * Step 2A: Password input for existing accounts (Login)
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

interface PasswordStepProps {
  email: string;
  onSignIn: (email: string, password: string) => Promise<{ error: string | null }>;
  onForgotPassword: (email: string) => Promise<{ error: string | null }>;
  onBack: () => void;
  isLoading: boolean;
  setIsLoading: (loading: boolean) => void;
}

export default function PasswordStep({
  email,
  onSignIn,
  onForgotPassword,
  onBack,
  isLoading,
  setIsLoading,
}: PasswordStepProps) {
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resetSent, setResetSent] = useState(false);

  const handleSubmit = useCallback(async () => {
    setError(null);

    if (!password) {
      setError('Please enter your password');
      return;
    }

    setIsLoading(true);

    try {
      const result = await onSignIn(email, password);
      if (result.error) {
        setError(result.error);
      }
    } catch (err) {
      setError('Something went wrong. Please try again.');
      console.log('[PasswordStep] Error:', err);
    } finally {
      setIsLoading(false);
    }
  }, [email, password, onSignIn, setIsLoading]);

  const handleForgotPassword = useCallback(async () => {
    setError(null);
    setIsLoading(true);

    try {
      const result = await onForgotPassword(email);
      if (result.error) {
        setError(result.error);
      } else {
        setResetSent(true);
      }
    } catch (err) {
      setError('Something went wrong. Please try again.');
      console.log('[PasswordStep] Forgot password error:', err);
    } finally {
      setIsLoading(false);
    }
  }, [email, onForgotPassword, setIsLoading]);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      {/* Back Button */}
      <TouchableOpacity
        style={styles.backButton}
        onPress={onBack}
        disabled={isLoading}
      >
        <Ionicons name="arrow-back" size={24} color={colors.text} />
      </TouchableOpacity>

      {/* Header */}
      <View style={styles.header}>
        <Image
          source={logoOnsite}
          style={styles.logo}
          resizeMode="contain"
        />
        <Text style={styles.subtitle}>Enter your password to sign in</Text>
      </View>

      {/* Form */}
      <View style={styles.form}>
        {error && (
          <View style={styles.errorBox}>
            <Ionicons name="alert-circle" size={18} color={colors.error} />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {/* Email Display (read-only) */}
        <View style={styles.emailDisplay}>
          <Text style={styles.emailValue}>{email}</Text>
          <TouchableOpacity onPress={onBack} disabled={isLoading}>
            <Text style={styles.changeLink}>Change</Text>
          </TouchableOpacity>
        </View>

        {/* Password Input */}
        <View style={styles.inputContainer}>
          <Text style={styles.label}>Password</Text>
          <View style={styles.passwordContainer}>
            <TextInput
              style={styles.passwordInput}
              placeholder="Enter your password"
              placeholderTextColor={colors.textTertiary}
              secureTextEntry={!showPassword}
              autoComplete="password"
              autoFocus
              value={password}
              onChangeText={setPassword}
              editable={!isLoading}
              onSubmitEditing={handleSubmit}
              returnKeyType="go"
            />
            <TouchableOpacity
              style={styles.eyeButton}
              onPress={() => setShowPassword(!showPassword)}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Ionicons
                name={showPassword ? 'eye-off' : 'eye'}
                size={22}
                color={colors.textSecondary}
              />
            </TouchableOpacity>
          </View>
        </View>

        {/* Submit Button */}
        <TouchableOpacity
          style={[
            styles.button,
            (isLoading || !password) && styles.buttonDisabled
          ]}
          onPress={handleSubmit}
          disabled={isLoading || !password}
          activeOpacity={0.8}
        >
          {isLoading ? (
            <>
              <ActivityIndicator size="small" color={colors.white} />
              <Text style={styles.buttonText}>Signing in...</Text>
            </>
          ) : (
            <Text style={styles.buttonText}>Sign In</Text>
          )}
        </TouchableOpacity>

        {/* Forgot Password */}
        <View style={styles.footer}>
          {resetSent ? (
            <View style={styles.resetSentBox}>
              <Ionicons name="checkmark-circle" size={18} color={colors.success} />
              <Text style={styles.resetSentText}>
                Password reset email sent to {email}
              </Text>
            </View>
          ) : (
            <TouchableOpacity
              onPress={handleForgotPassword}
              disabled={isLoading}
            >
              <Text style={styles.forgotLink}>Forgot password?</Text>
            </TouchableOpacity>
          )}
        </View>
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

  // Back Button
  backButton: {
    position: 'absolute',
    top: 16,
    left: 16,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
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

  // Email Display
  emailDisplay: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    padding: 16,
    borderRadius: 12,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: colors.border,
  },
  emailValue: {
    fontSize: 15,
    fontWeight: '500',
    color: colors.text,
    flex: 1,
  },
  changeLink: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.primary,
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
  passwordContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    backgroundColor: colors.backgroundTertiary,
  },
  passwordInput: {
    flex: 1,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: colors.text,
  },
  eyeButton: {
    paddingHorizontal: 16,
    paddingVertical: 14,
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

  // Footer
  footer: {
    alignItems: 'center',
    marginTop: 24,
  },
  forgotLink: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.primary,
  },
  resetSentBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.successSoft,
    padding: 12,
    borderRadius: 10,
  },
  resetSentText: {
    flex: 1,
    fontSize: 14,
    color: colors.success,
  },
});
