/**
 * AuthScreen - OnSite Timekeeper
 * Multi-step authentication flow (React Native)
 *
 * Flow:
 * 1. EmailStep - Check if email exists
 * 2a. PasswordStep - Login (existing user)
 * 2b. SignupStep - Register (new user)
 */

import React, { useState, useCallback } from 'react';
import {
  View,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
} from 'react-native';
import { colors } from '../../constants/colors';
import { supabase, isSupabaseConfigured } from '../../lib/supabase';
import { useAuthStore } from '../../stores/authStore';
import type { User } from '@supabase/supabase-js';

import EmailStep from './EmailStep';
import PasswordStep from './PasswordStep';
import SignupStep from './SignupStep';

export interface AuthScreenProps {
  onSuccess?: (user: User, isNewUser: boolean) => void;
}

type AuthStep = 'email' | 'password' | 'signup';

export default function AuthScreen({ onSuccess }: AuthScreenProps) {
  const { signIn } = useAuthStore();

  const [step, setStep] = useState<AuthStep>('email');
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Check if email exists in Supabase using RPC function
  const checkEmailExists = useCallback(async (emailToCheck: string): Promise<boolean> => {
    if (!isSupabaseConfigured() || !supabase) return false;

    try {
      const { data, error } = await supabase.rpc('check_email_exists', {
        email_to_check: emailToCheck.toLowerCase()
      });

      if (error) {
        // RPC might not exist — fallback: try to sign in with a dummy password
        // If we get "Invalid login credentials" it means the account EXISTS (wrong password)
        // If we get "user not found" or similar, account doesn't exist
        console.log('[AuthScreen] RPC not available, using signIn probe fallback');
        try {
          const { error: signInError } = await supabase.auth.signInWithPassword({
            email: emailToCheck.toLowerCase(),
            password: '__probe_only__',
          });
          // "Invalid login credentials" = account exists (password was wrong, as expected)
          if (signInError?.message?.includes('Invalid login credentials')) {
            return true;
          }
          // Any other error or no error (unlikely) = treat as not found
          return false;
        } catch {
          return false;
        }
      }

      console.log('[AuthScreen] Email exists:', data);
      return data === true;
    } catch (err) {
      console.log('[AuthScreen] checkEmailExists skipped:', err);
      return false;
    }
  }, []);

  // Handle email submission - determines next step
  const handleEmailSubmit = useCallback((submittedEmail: string, exists: boolean) => {
    setEmail(submittedEmail);
    setStep(exists ? 'password' : 'signup');
  }, []);

  // Handle sign in (existing user)
  const handleSignIn = useCallback(async (
    emailToUse: string,
    password: string
  ): Promise<{ error: string | null }> => {
    try {
      const result = await signIn(emailToUse, password);

      if (!result.success) {
        if (result.error?.includes('Invalid login credentials')) {
          return { error: 'Incorrect password' };
        }
        if (result.error?.includes('Email not confirmed')) {
          return { error: 'Please confirm your email first' };
        }
        return { error: result.error || 'Sign in failed' };
      }

      // Success - call onSuccess callback if provided
      // Navigation is handled by the navigation guard in _layout.tsx
      if (onSuccess) {
        const { user } = useAuthStore.getState();
        if (user) onSuccess(user, false);
      }
      // Note: Don't call router.replace here - let the auth state change
      // trigger the navigation guard in _layout.tsx to avoid race conditions
      return { error: null };
    } catch (err) {
      // Don't use console.error to avoid LogBox toast in dev mode
      console.log('[AuthScreen] signIn error:', err);
      return { error: 'Something went wrong. Please try again.' };
    }
  }, [signIn, onSuccess]);

  // Handle forgot password
  const handleForgotPassword = useCallback(async (
    emailToUse: string
  ): Promise<{ error: string | null }> => {
    if (!isSupabaseConfigured() || !supabase) {
      return { error: 'Authentication is not available.' };
    }

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(emailToUse);

      if (error) {
        console.log('[AuthScreen] Reset password error:', error.message);
        return { error: error.message };
      }

      console.log('[AuthScreen] Password reset email sent to:', emailToUse);
      return { error: null };
    } catch (err) {
      console.log('[AuthScreen] forgotPassword error:', err);
      return { error: 'Something went wrong. Please try again.' };
    }
  }, []);

  // Handle sign up (new user)
  const handleSignUp = useCallback(async (
    emailToUse: string,
    password: string,
    profile: {
      firstName: string;
      lastName: string;
    }
  ): Promise<{ error: string | null; needsConfirmation?: boolean }> => {
    if (!isSupabaseConfigured() || !supabase) {
      return { error: 'Authentication is not available.' };
    }

    try {
      // Create the user account
      const { data, error } = await supabase.auth.signUp({
        email: emailToUse,
        password,
        options: {
          data: {
            first_name: profile.firstName,
            last_name: profile.lastName,
            full_name: `${profile.firstName} ${profile.lastName}`,
          },
        },
      });

      if (error) {
        if (error.message.toLowerCase().includes('already registered') ||
            error.message.toLowerCase().includes('already been registered')) {
          // Email exists - redirect to password step
          console.log('[AuthScreen] Email already registered, redirecting to password step');
          setStep('password');
          return { error: null };
        }
        return { error: error.message };
      }

      // Check if user was created but has no identities (means email already exists)
      if (data.user && data.user.identities && data.user.identities.length === 0) {
        console.log('[AuthScreen] Email already exists (empty identities), redirecting to password step');
        setStep('password');
        return { error: null };
      }

      // If we have a session, user is logged in
      if (data.session) {
        console.log('[AuthScreen] User has session, logging in');
        if (onSuccess && data.user) {
          onSuccess(data.user, true);
        }
        // Navigation is handled by the navigation guard in _layout.tsx
        return { error: null, needsConfirmation: false };
      }

      // No session - email confirmation might be required
      if (data.user && !data.session) {
        console.log('[AuthScreen] No session after signup, email confirmation required');
        return { error: null, needsConfirmation: true };
      }

      return { error: null, needsConfirmation: true };
    } catch (err) {
      console.log('[AuthScreen] signUp error:', err);
      return { error: 'Something went wrong. Please try again.' };
    }
  }, [onSuccess]);

  // Handle going back to email step
  const handleBack = useCallback(() => {
    setStep('email');
  }, []);

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
      >
        {step === 'email' && (
          <EmailStep
            onEmailSubmit={handleEmailSubmit}
            isLoading={isLoading}
            setIsLoading={setIsLoading}
            checkEmailExists={checkEmailExists}
          />
        )}

        {step === 'password' && (
          <PasswordStep
            email={email}
            onSignIn={handleSignIn}
            onForgotPassword={handleForgotPassword}
            onBack={handleBack}
            isLoading={isLoading}
            setIsLoading={setIsLoading}
          />
        )}

        {step === 'signup' && (
          <SignupStep
            email={email}
            onSignUp={handleSignUp}
            onBack={handleBack}
            isLoading={isLoading}
            setIsLoading={setIsLoading}
          />
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  keyboardView: {
    flex: 1,
  },
});
