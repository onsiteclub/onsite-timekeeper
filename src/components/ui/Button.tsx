/**
 * Componentes UI Básicos - OnSite Timekeeper
 */

import React from 'react';
import {
  TouchableOpacity,
  Text,
  TextInput,
  View,
  StyleSheet,
  ActivityIndicator,
  type TouchableOpacityProps,
  type TextInputProps,
  type ViewStyle,
  type TextStyle,
} from 'react-native';
import { colors } from '../../constants/colors';

// ============================================
// BUTTON
// ============================================

interface ButtonProps extends TouchableOpacityProps {
  title: string;
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  icon?: React.ReactNode;
}

export function Button({
  title,
  variant = 'primary',
  size = 'md',
  loading = false,
  icon,
  disabled,
  style,
  ...props
}: ButtonProps) {
  const buttonStyles = [
    styles.button,
    styles[`button_${variant}` as keyof typeof styles],
    styles[`button_${size}` as keyof typeof styles],
    (disabled || loading) && styles.button_disabled,
    style,
  ].filter(Boolean) as ViewStyle[];

  const textStyles = [
    styles.buttonText,
    styles[`buttonText_${variant}` as keyof typeof styles],
    styles[`buttonText_${size}` as keyof typeof styles],
    (disabled || loading) && styles.buttonText_disabled,
  ].filter(Boolean) as TextStyle[];

  return (
    <TouchableOpacity
      style={buttonStyles}
      disabled={disabled || loading}
      activeOpacity={0.7}
      {...props}
    >
      {loading ? (
        <ActivityIndicator
          size="small"
          color={variant === 'primary' ? colors.white : colors.primary}
        />
      ) : (
        <>
          {icon && <View style={styles.buttonIcon}>{icon}</View>}
          <Text style={textStyles}>{title}</Text>
        </>
      )}
    </TouchableOpacity>
  );
}

// ============================================
// INPUT
// ============================================

interface InputProps extends TextInputProps {
  label?: string;
  error?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export function Input({
  label,
  error,
  leftIcon,
  rightIcon,
  style,
  ...props
}: InputProps) {
  const inputStyles = [
    styles.input,
    leftIcon && styles.input_withLeftIcon,
    rightIcon && styles.input_withRightIcon,
    style,
  ].filter(Boolean) as TextStyle[];

  return (
    <View style={styles.inputContainer}>
      {label && <Text style={styles.inputLabel}>{label}</Text>}
      <View style={[styles.inputWrapper, error && styles.inputWrapper_error]}>
        {leftIcon && <View style={styles.inputIcon}>{leftIcon}</View>}
        <TextInput
          style={inputStyles}
          placeholderTextColor={colors.textTertiary}
          {...props}
        />
        {rightIcon && <View style={styles.inputIcon}>{rightIcon}</View>}
      </View>
      {error && <Text style={styles.inputError}>{error}</Text>}
    </View>
  );
}

// ============================================
// CARD
// ============================================

interface CardProps {
  children: React.ReactNode;
  style?: ViewStyle | ViewStyle[];
}

export function Card({ children, style }: CardProps) {
  const cardStyles = [styles.card, style].flat().filter(Boolean) as ViewStyle[];
  return <View style={cardStyles}>{children}</View>;
}

// ============================================
// STYLES
// ============================================

const styles = StyleSheet.create({
  // Button base
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
  },
  
  // Button variants
  button_primary: {
    backgroundColor: colors.primary,
  },
  button_secondary: {
    backgroundColor: colors.backgroundSecondary,
    borderWidth: 1,
    borderColor: colors.border,
  },
  button_danger: {
    backgroundColor: colors.error,
  },
  button_ghost: {
    backgroundColor: 'transparent',
  },
  
  // Button sizes
  button_sm: {
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  button_md: {
    paddingVertical: 12,
    paddingHorizontal: 20,
  },
  button_lg: {
    paddingVertical: 16,
    paddingHorizontal: 24,
  },
  
  button_disabled: {
    opacity: 0.5,
  },
  
  buttonIcon: {
    marginRight: 8,
  },
  
  // Button text
  buttonText: {
    fontWeight: '600',
  },
  buttonText_primary: {
    color: colors.white,
  },
  buttonText_secondary: {
    color: colors.text,
  },
  buttonText_danger: {
    color: colors.white,
  },
  buttonText_ghost: {
    color: colors.primary,
  },
  buttonText_sm: {
    fontSize: 14,
  },
  buttonText_md: {
    fontSize: 16,
  },
  buttonText_lg: {
    fontSize: 18,
  },
  buttonText_disabled: {
    opacity: 0.7,
  },
  
  // Input
  inputContainer: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.text,
    marginBottom: 6,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    backgroundColor: colors.white,
  },
  inputWrapper_error: {
    borderColor: colors.error,
  },
  input: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    fontSize: 16,
    color: colors.text,
  },
  input_withLeftIcon: {
    paddingLeft: 8,
  },
  input_withRightIcon: {
    paddingRight: 8,
  },
  inputIcon: {
    paddingHorizontal: 12,
  },
  inputError: {
    fontSize: 12,
    color: colors.error,
    marginTop: 4,
  },
  
  // Card
  card: {
    backgroundColor: colors.white,
    borderRadius: 16,
    padding: 16,
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
});