/**
 * SocialButtons - OnSite Timekeeper
 *
 * Google + Apple native sign-in buttons. Calls authStore OAuth actions.
 * Apple button hidden on Android (native Sign-In with Apple is iOS-only).
 *
 * See: oauth-implementation-plan.md §6.3
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as AppleAuthentication from 'expo-apple-authentication';
import { colors } from '../../constants/colors';
import { useAuthStore } from '../../stores/authStore';

interface Props {
  onSuccess?: () => void;
  onError?: (msg: string) => void;
  disabled?: boolean;
}

export function SocialButtons({ onSuccess, onError, disabled }: Props) {
  const [loading, setLoading] = useState<'google' | 'apple' | null>(null);
  const { signInWithGoogle, signInWithApple } = useAuthStore();

  const busy = loading !== null || disabled === true;

  const handleGoogle = async () => {
    if (busy) return;
    setLoading('google');
    try {
      const res = await signInWithGoogle();
      if (res.success) onSuccess?.();
      else if (!res.cancelled && res.error) onError?.(res.error);
    } finally {
      setLoading(null);
    }
  };

  const handleApple = async () => {
    if (busy) return;
    setLoading('apple');
    try {
      const res = await signInWithApple();
      if (res.success) onSuccess?.();
      else if (!res.cancelled && res.error) onError?.(res.error);
    } finally {
      setLoading(null);
    }
  };

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={[styles.button, busy && styles.disabled]}
        onPress={handleGoogle}
        disabled={busy}
        activeOpacity={0.8}
      >
        {loading === 'google' ? (
          <ActivityIndicator size="small" color={colors.text} />
        ) : (
          <>
            <Ionicons name="logo-google" size={20} color={colors.text} />
            <Text style={styles.buttonText}>Continue with Google</Text>
          </>
        )}
      </TouchableOpacity>

      {Platform.OS === 'ios' && (
        <AppleAuthentication.AppleAuthenticationButton
          buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
          buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
          cornerRadius={12}
          style={styles.appleButton}
          onPress={handleApple}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    gap: 10,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
    minHeight: 50,
  },
  buttonText: {
    fontSize: 15,
    fontWeight: '500',
    color: colors.text,
  },
  appleButton: {
    width: '100%',
    height: 50,
  },
  disabled: {
    opacity: 0.6,
  },
});
