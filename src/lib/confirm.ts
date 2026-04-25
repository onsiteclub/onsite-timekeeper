/**
 * Cross-platform confirmation dialog.
 *
 * react-native's Alert.alert is a no-op on web — react-native-web only
 * polyfills it for single-button alerts and silently drops the buttons
 * array. Anything that needs Cancel/Confirm choice never resolves and
 * the destructive action quietly does nothing.
 *
 * This helper falls back to window.confirm() on the web. The text-based
 * `window.confirm()` ignores per-button styling but it does block the
 * thread until the user picks one — which is what we need for flows
 * like Sign Out and Delete Account that branch on confirmation.
 */

import { Alert, Platform } from 'react-native';

export interface ConfirmOptions {
  title: string;
  message?: string;
  confirmText?: string;
  cancelText?: string;
  destructive?: boolean;
}

export async function confirmAsync(opts: ConfirmOptions): Promise<boolean> {
  const {
    title,
    message,
    confirmText = 'OK',
    cancelText = 'Cancel',
    destructive = false,
  } = opts;

  if (Platform.OS === 'web') {
    // window.confirm doesn't render distinct button styles, so we put
    // the title and message together in the body for clarity.
    const body = message ? `${title}\n\n${message}` : title;
    return typeof window !== 'undefined' && window.confirm(body);
  }

  return new Promise((resolve) => {
    Alert.alert(title, message, [
      { text: cancelText, style: 'cancel', onPress: () => resolve(false) },
      {
        text: confirmText,
        style: destructive ? 'destructive' : 'default',
        onPress: () => resolve(true),
      },
    ], {
      // Treat hardware back / outside tap as cancel on Android
      cancelable: true,
      onDismiss: () => resolve(false),
    });
  });
}
