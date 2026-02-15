/**
 * Root Layout - OnSite Timekeeper v2
 * 
 * UPDATED: Integrated singleton bootstrap for listeners
 * FIX: Added initialization lock to prevent boot loop
 */

import React, { useEffect, useState, useRef } from 'react';
import { View, ActivityIndicator, Platform, StyleSheet } from 'react-native';
import { Stack, useRouter, useSegments, useRootNavigationState } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { colors } from '../src/constants/colors';
import { logger } from '../src/lib/logger';
import { initSentry, setUser as setSentryUser, clearUser as clearSentryUser } from '../src/lib/sentry';
import { initDatabase } from '../src/lib/database';
import { ErrorBoundary } from '../src/components/ErrorBoundary';
import { useAuthStore } from '../src/stores/authStore';
import { useLocationStore } from '../src/stores/locationStore';
// V3: recordStore removed - using dailyLogStore instead
import { useDailyLogStore } from '../src/stores/dailyLogStore';
import { useSyncStore } from '../src/stores/syncStore';
import { useSettingsStore } from '../src/stores/settingsStore';
import {
  configureNotificationCategories,
  requestNotificationPermission,
  addResponseListener,
  getLastNotificationResponse,
  DEFAULT_NOTIFICATION_ACTION,
  type NotificationSubscription,
  type GeofenceNotificationData,
  type NotificationResponse,
} from '../src/lib/notifications';
import {
  initializeListeners,
  onUserLogin,
  onUserLogout,
} from '../src/lib/bootstrap';
import { BatteryOptimizationModal } from '../src/components/BatteryOptimizationModal';
import { isIgnoringBatteryOptimizations } from '../src/lib/bgGeo';


export default function RootLayout() {
  const [isReady, setIsReady] = useState(false);
  const [storesInitialized, setStoresInitialized] = useState(false);
  const router = useRouter();
  const segments = useSegments();
  const navigationState = useRootNavigationState();

  const isAuthenticated = useAuthStore(s => s.isAuthenticated());
  const authLoading = useAuthStore(s => s.isLoading);
  const user = useAuthStore(s => s.user);
  const initAuth = useAuthStore(s => s.initialize);
  
  // Refs for singleton control
  const initRef = useRef(false);
  const userSessionRef = useRef<string | null>(null);
  const notificationListenerRef = useRef<NotificationSubscription | null>(null);
  
  // FIX: Lock to prevent initialization loop
  const storesInitInProgress = useRef(false);

  // Battery optimization modal (Android only)
  const [showBatteryModal, setShowBatteryModal] = useState(false);

  // ============================================
  // STORE INITIALIZATION
  // ============================================

  const initializeStores = async () => {
    // Double-check both state and ref
    if (storesInitialized || storesInitInProgress.current) {
      logger.debug('boot', '⚠️ Stores init skipped (already done or in progress)');
      return;
    }
    
    // LOCK IMMEDIATELY before any async operation
    storesInitInProgress.current = true;
    
    logger.info('boot', '📦 Initializing stores...');
    
    try {
      // V3: Initialize daily log store (Caderneta Digital) - primary data store
      logger.info('boot', '📖 Initializing daily log store...');
      await useDailyLogStore.getState().initialize();
      logger.info('boot', '✅ Daily log store initialized');

      // Location store (permissions + geofencing)
      await useLocationStore.getState().initialize();
      
      // Sync store
      await useSyncStore.getState().initialize();
      
      setStoresInitialized(true);
      logger.info('boot', '✅ Stores initialized');
    } catch (error) {
      logger.error('boot', 'Error initializing stores', { error: String(error) });
      // Reset lock on error so retry is possible
      storesInitInProgress.current = false;
    }
  };

  // ============================================
  // NOTIFICATION RESPONSE HANDLER
  // ============================================

  const handleNotificationResponse = async (response: NotificationResponse) => {
    const data = response.notification.request.content.data as GeofenceNotificationData | undefined;
    const actionIdentifier = response.actionIdentifier;

    logger.info('notification', '🔔 Notification response received', {
      type: data?.type,
      action: actionIdentifier,
    });

    // Handle report reminder notifications
    if (data?.type === 'report_reminder') {
      if (actionIdentifier === 'send_now' || actionIdentifier === DEFAULT_NOTIFICATION_ACTION) {
        logger.info('notification', '📤 Report reminder: Send Now');

        if (data?.periodStart && data?.periodEnd) {
          useSettingsStore.getState().setPendingReportExport({
            periodStart: data.periodStart,
            periodEnd: data.periodEnd,
          });
        }
        router.push('/');
      }
    }

    // Handle session guard notifications (10h/16h safety net)
    if (data?.type === 'session_guard') {
      if (actionIdentifier === 'stop_timer' && data.locationId) {
        logger.info('notification', '🛡️ Session guard: Stop timer');
        try {
          await useLocationStore.getState().handleManualExit(data.locationId);
        } catch (e) {
          logger.error('notification', 'Session guard stop failed', { error: String(e) });
        }
      }
      // 'still_here' and default tap → no-op (next check already auto-scheduled)
    }
  };

  // ============================================
  // BOOTSTRAP (runs once)
  // ============================================

  useEffect(() => {
    async function bootstrap() {
      if (initRef.current) return;
      initRef.current = true;
      
      logger.info('boot', '🚀 Starting OnSite Timekeeper v2...');

      try {
        // 0. Sentry (as early as possible, before any async ops)
        initSentry();

        // 1. Database
        await initDatabase();
        logger.info('boot', '✅ Database initialized');

        // 2. Settings
        await useSettingsStore.getState().loadSettings();

        // 3. Notifications (permission + channels + categories)
        await requestNotificationPermission();
        await configureNotificationCategories();

        // 4. SINGLETON LISTENERS (AppState, geofence callback, heartbeat)
        await initializeListeners();

        // 5. Auth
        logger.info('boot', '🔐 Initializing auth store V2...');
        await initAuth();
        logger.info('boot', '✅ Auth store V2 initialized');

        // 6. If authenticated, init stores + user session
        if (useAuthStore.getState().isAuthenticated()) {
          await initializeStores();

          const currentUser = useAuthStore.getState().user;
          if (currentUser) {
            await onUserLogin(currentUser.id);
            userSessionRef.current = currentUser.id;
          }
        }

        logger.info('boot', '✅ Bootstrap completed');
      } catch (error) {
        logger.error('boot', 'Bootstrap error', { error: String(error) });
      } finally {
        setIsReady(true);
      }
    }

    bootstrap();

    // NOTE: No cleanup here — listeners MUST survive background transitions.
    // When the app is killed, the JS engine is destroyed anyway.
    // cleanupListeners() is only called on explicit logout (onUserLogout).
  }, []);

  // ============================================
  // NOTIFICATION LISTENER
  // ============================================

  useEffect(() => {
    notificationListenerRef.current = addResponseListener(
      handleNotificationResponse
    );

    getLastNotificationResponse().then(response => {
      if (response) {
        handleNotificationResponse(response);
      }
    });

    return () => {
      if (notificationListenerRef.current) {
        notificationListenerRef.current.remove();
      }
    };
  }, []);

  // ============================================
  // AUTH STATE EFFECTS
  // ============================================

  // Handle login (stores init + user session)
  // FIX: Removed 'user' from dependencies to prevent loop
  useEffect(() => {
    if (!isReady || !isAuthenticated || storesInitialized || storesInitInProgress.current) {
      return;
    }
    
    logger.info('boot', '🔑 Login detected - initializing stores...');
    
    initializeStores().then(async () => {
      // Get user fresh from store after init completes
      const currentUser = useAuthStore.getState().user;
      if (currentUser && userSessionRef.current !== currentUser.id) {
        await onUserLogin(currentUser.id);
        setSentryUser(currentUser.id);
        userSessionRef.current = currentUser.id;
      }

      // Android: check battery optimization after login
      if (Platform.OS === 'android') {
        const settings = useSettingsStore.getState();
        if (!settings.batteryOptimizationSkipped) {
          try {
            const isIgnoring = await isIgnoringBatteryOptimizations();
            if (!isIgnoring) {
              setShowBatteryModal(true);
            }
          } catch {
            // SDK not ready or method not available — skip silently
          }
        }
      }
    });
  }, [isReady, isAuthenticated, storesInitialized]); // FIX: Removed 'user' dependency

  // Handle logout
  useEffect(() => {
    if (isReady && !isAuthenticated && userSessionRef.current) {
      logger.info('boot', '🚪 Logout detected - cleaning up...');
      clearSentryUser();
      onUserLogout().then(() => {
        userSessionRef.current = null;
        setStoresInitialized(false);
        storesInitInProgress.current = false; // Reset lock for next login
      });
    }
  }, [isReady, isAuthenticated]);

  // Battery optimization modal dismiss handler
  const handleBatteryModalDismiss = (skipped: boolean) => {
    setShowBatteryModal(false);
    if (skipped) {
      useSettingsStore.getState().updateSetting('batteryOptimizationSkipped', true);
    }
  };

  // Navigation guard
  // FIX: Defer router.replace() to next tick so <Stack> finishes mounting.
  // navigationState?.key can be truthy before the Stack registers — setTimeout(0)
  // ensures we run after React commits the layout (Stack mount).
  useEffect(() => {
    if (!isReady || authLoading || !navigationState?.key) return;

    const inAuthGroup = segments[0] === '(auth)';

    const timer = setTimeout(() => {
      if (!isAuthenticated && !inAuthGroup) {
        router.replace('/(auth)/login');
      } else if (isAuthenticated && inAuthGroup) {
        router.replace('/(tabs)');
      }
    }, 0);

    return () => clearTimeout(timer);
  }, [isReady, authLoading, isAuthenticated, segments, navigationState?.key]);

  // ============================================
  // RENDER
  // ============================================

  if (!isReady || authLoading) {
    return (
      <View style={styles.loadingContainer}>
        <StatusBar style="light" />
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <ErrorBoundary>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen
          name="legal"
          options={{
            presentation: 'modal',
            animation: 'slide_from_bottom',
          }}
        />
      </Stack>
      {Platform.OS === 'android' && (
        <BatteryOptimizationModal
          visible={showBatteryModal}
          onDismiss={handleBatteryModalDismiss}
        />
      )}
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
  },
});
