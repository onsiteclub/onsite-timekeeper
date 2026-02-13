/**
 * Permission Status Hook (Web) - OnSite Timekeeper
 *
 * Web shim: returns safe defaults, no native permission checks.
 */

import { useCallback } from 'react';

// ============================================
// TYPES (same as native)
// ============================================

export interface PermissionStatus {
  locationForeground: boolean;
  locationBackground: boolean;
  notificationsEnabled: boolean;
  foregroundServiceKilled: boolean;
  canTrackReliably: boolean;
  needsAttention: boolean;
  isChecking: boolean;
  checkPermissions: () => Promise<void>;
  openAppSettings: () => void;
  openNotificationSettings: () => void;
  requestLocationPermission: () => Promise<boolean>;
  requestNotificationPermission: () => Promise<boolean>;
  restartMonitoring: () => Promise<boolean>;
}

// ============================================
// HOOK (web: all permissions "denied" — no GPS on web)
// ============================================

export function usePermissionStatus(): PermissionStatus {
  const noop = useCallback(() => {}, []);
  const noopAsync = useCallback(async () => false, []);
  const noopAsyncVoid = useCallback(async () => {}, []);

  return {
    locationForeground: false,
    locationBackground: false,
    notificationsEnabled: false,
    foregroundServiceKilled: false,
    canTrackReliably: false,
    needsAttention: false, // Don't show banners on web
    isChecking: false,
    checkPermissions: noopAsyncVoid,
    openAppSettings: noop,
    openNotificationSettings: noop,
    requestLocationPermission: noopAsync,
    requestNotificationPermission: noopAsync,
    restartMonitoring: noopAsync,
  };
}
