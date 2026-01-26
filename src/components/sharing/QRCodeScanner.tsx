/**
 * QR Code Scanner - OnSite Timekeeper
 *
 * Scans a QR code for device linking.
 * Uses expo-camera for barcode scanning.
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { colors, borderRadius, spacing } from '../../constants/colors';
import { parseQRPayload, redeemToken } from '../../lib/accessGrants';

interface QRCodeScannerProps {
  onSuccess?: (ownerName?: string) => void;
  onCancel?: () => void;
}

export function QRCodeScanner({ onSuccess, onCancel }: QRCodeScannerProps) {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [processing, setProcessing] = useState(false);

  // Request permission on mount
  useEffect(() => {
    if (!permission?.granted) {
      requestPermission();
    }
  }, [permission, requestPermission]);

  const handleBarCodeScanned = async ({ data }: { data: string }) => {
    if (scanned || processing) return;

    setScanned(true);
    setProcessing(true);

    try {
      // Parse QR code
      const payload = parseQRPayload(data);

      if (!payload) {
        Alert.alert(
          'QR Code Inválido',
          'Este QR code não é do OnSite Timekeeper.',
          [{ text: 'OK', onPress: () => setScanned(false) }]
        );
        setProcessing(false);
        return;
      }

      // Redeem the token
      const result = await redeemToken(payload.token);

      if (result.success) {
        Alert.alert(
          'Acesso Liberado!',
          result.message,
          [{ text: 'OK', onPress: () => onSuccess?.(result.ownerName) }]
        );
      } else {
        Alert.alert(
          'Erro',
          result.message,
          [{ text: 'OK', onPress: () => setScanned(false) }]
        );
      }
    } catch (error) {
      Alert.alert(
        'Erro',
        'Erro ao processar QR code. Tente novamente.',
        [{ text: 'OK', onPress: () => setScanned(false) }]
      );
    } finally {
      setProcessing(false);
    }
  };

  // Loading permission state
  if (!permission) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Carregando câmera...</Text>
      </View>
    );
  }

  // Permission denied
  if (!permission.granted) {
    return (
      <View style={styles.container}>
        <Text style={styles.permissionTitle}>Permissão Necessária</Text>
        <Text style={styles.permissionText}>
          Para escanear o QR code, precisamos de acesso à câmera.
        </Text>
        <TouchableOpacity style={styles.permissionButton} onPress={requestPermission}>
          <Text style={styles.permissionButtonText}>Permitir Câmera</Text>
        </TouchableOpacity>
        {onCancel && (
          <TouchableOpacity style={styles.cancelButton} onPress={onCancel}>
            <Text style={styles.cancelButtonText}>Cancelar</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.cameraContainer}>
        <CameraView
          style={styles.camera}
          facing="back"
          barcodeScannerSettings={{
            barcodeTypes: ['qr'],
          }}
          onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
        />

        {/* Overlay with scanning guide */}
        <View style={styles.overlay}>
          <View style={styles.overlayTop} />
          <View style={styles.overlayMiddle}>
            <View style={styles.overlaySide} />
            <View style={styles.scanArea}>
              <View style={[styles.corner, styles.cornerTL]} />
              <View style={[styles.corner, styles.cornerTR]} />
              <View style={[styles.corner, styles.cornerBL]} />
              <View style={[styles.corner, styles.cornerBR]} />
            </View>
            <View style={styles.overlaySide} />
          </View>
          <View style={styles.overlayBottom}>
            <Text style={styles.instructionText}>
              Aponte a câmera para o QR code
            </Text>
          </View>
        </View>

        {processing && (
          <View style={styles.processingOverlay}>
            <ActivityIndicator size="large" color={colors.white} />
            <Text style={styles.processingText}>Processando...</Text>
          </View>
        )}
      </View>

      {onCancel && (
        <TouchableOpacity style={styles.cancelButtonCamera} onPress={onCancel}>
          <Text style={styles.cancelButtonCameraText}>Cancelar</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const SCAN_AREA_SIZE = 250;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  cameraContainer: {
    flex: 1,
    position: 'relative',
  },
  camera: {
    flex: 1,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
  },
  overlayTop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
  },
  overlayMiddle: {
    flexDirection: 'row',
    height: SCAN_AREA_SIZE,
  },
  overlaySide: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
  },
  scanArea: {
    width: SCAN_AREA_SIZE,
    height: SCAN_AREA_SIZE,
    position: 'relative',
  },
  corner: {
    position: 'absolute',
    width: 30,
    height: 30,
    borderColor: colors.primary,
  },
  cornerTL: {
    top: 0,
    left: 0,
    borderTopWidth: 4,
    borderLeftWidth: 4,
    borderTopLeftRadius: 8,
  },
  cornerTR: {
    top: 0,
    right: 0,
    borderTopWidth: 4,
    borderRightWidth: 4,
    borderTopRightRadius: 8,
  },
  cornerBL: {
    bottom: 0,
    left: 0,
    borderBottomWidth: 4,
    borderLeftWidth: 4,
    borderBottomLeftRadius: 8,
  },
  cornerBR: {
    bottom: 0,
    right: 0,
    borderBottomWidth: 4,
    borderRightWidth: 4,
    borderBottomRightRadius: 8,
  },
  overlayBottom: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'flex-start',
    alignItems: 'center',
    paddingTop: spacing.lg,
  },
  instructionText: {
    color: colors.white,
    fontSize: 16,
    fontWeight: '500',
    textAlign: 'center',
  },
  processingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  processingText: {
    color: colors.white,
    fontSize: 16,
    marginTop: spacing.md,
  },
  loadingText: {
    marginTop: spacing.md,
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  permissionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text,
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
  permissionText: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.lg,
    paddingHorizontal: spacing.lg,
  },
  permissionButton: {
    backgroundColor: colors.primary,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    borderRadius: borderRadius.md,
    marginBottom: spacing.md,
  },
  permissionButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.black,
  },
  cancelButton: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  cancelButtonText: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  cancelButtonCamera: {
    backgroundColor: colors.overlay,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  cancelButtonCameraText: {
    fontSize: 16,
    fontWeight: '500',
    color: colors.white,
  },
});
