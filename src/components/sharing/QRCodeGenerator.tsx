/**
 * QR Code Generator - OnSite Timekeeper
 *
 * Generates a QR code for device linking.
 * Shows a countdown timer and allows regeneration.
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
} from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { colors, borderRadius, spacing } from '../../constants/colors';
import { createAccessToken, createQRPayload } from '../../lib/accessGrants';

interface QRCodeGeneratorProps {
  ownerName?: string;
  size?: number;
  onClose?: () => void;
}

export function QRCodeGenerator({
  ownerName,
  size = 200,
  onClose,
}: QRCodeGeneratorProps) {
  const [token, setToken] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<Date | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [timeLeft, setTimeLeft] = useState(0);

  const generateToken = useCallback(async () => {
    setLoading(true);
    setError(null);

    const result = await createAccessToken(ownerName);

    if (result) {
      setToken(result.token);
      setExpiresAt(result.expiresAt);
    } else {
      setError('Erro ao gerar QR code. Tente novamente.');
    }

    setLoading(false);
  }, [ownerName]);

  // Generate token on mount
  useEffect(() => {
    generateToken();
  }, [generateToken]);

  // Countdown timer
  useEffect(() => {
    if (!expiresAt) return;

    const updateTimer = () => {
      const now = new Date();
      const diff = Math.max(0, Math.floor((expiresAt.getTime() - now.getTime()) / 1000));
      setTimeLeft(diff);

      if (diff === 0) {
        setToken(null);
        setError('QR code expirado');
      }
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);

    return () => clearInterval(interval);
  }, [expiresAt]);

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Gerando QR code...</Text>
      </View>
    );
  }

  if (error || !token) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>{error || 'Erro desconhecido'}</Text>
        <TouchableOpacity style={styles.retryButton} onPress={generateToken}>
          <Text style={styles.retryButtonText}>Tentar novamente</Text>
        </TouchableOpacity>
        {onClose && (
          <TouchableOpacity style={styles.closeButton} onPress={onClose}>
            <Text style={styles.closeButtonText}>Fechar</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  }

  const qrPayload = createQRPayload(token, ownerName);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Compartilhar Acesso</Text>
      <Text style={styles.subtitle}>
        Peça para o gerente escanear este QR code
      </Text>

      <View style={styles.qrContainer}>
        <QRCode
          value={qrPayload}
          size={size}
          backgroundColor={colors.white}
          color={colors.text}
        />
      </View>

      <View style={styles.timerContainer}>
        <Text style={styles.timerLabel}>Expira em</Text>
        <Text style={[styles.timerText, timeLeft < 60 && styles.timerWarning]}>
          {formatTime(timeLeft)}
        </Text>
      </View>

      <TouchableOpacity style={styles.refreshButton} onPress={generateToken}>
        <Text style={styles.refreshButtonText}>Gerar novo QR</Text>
      </TouchableOpacity>

      {onClose && (
        <TouchableOpacity style={styles.closeButton} onPress={onClose}>
          <Text style={styles.closeButtonText}>Fechar</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    padding: spacing.lg,
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text,
    marginBottom: spacing.xs,
  },
  subtitle: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  qrContainer: {
    padding: spacing.md,
    backgroundColor: colors.white,
    borderRadius: borderRadius.md,
    marginBottom: spacing.lg,
  },
  timerContainer: {
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  timerLabel: {
    fontSize: 12,
    color: colors.textTertiary,
    marginBottom: spacing.xs,
  },
  timerText: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.text,
  },
  timerWarning: {
    color: colors.error,
  },
  loadingText: {
    marginTop: spacing.md,
    fontSize: 14,
    color: colors.textSecondary,
  },
  errorText: {
    fontSize: 14,
    color: colors.error,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  retryButton: {
    backgroundColor: colors.primary,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.md,
    marginBottom: spacing.sm,
  },
  retryButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.black,
  },
  refreshButton: {
    backgroundColor: colors.backgroundTertiary,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.md,
    marginBottom: spacing.sm,
  },
  refreshButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.text,
  },
  closeButton: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  closeButtonText: {
    fontSize: 14,
    color: colors.textSecondary,
  },
});
