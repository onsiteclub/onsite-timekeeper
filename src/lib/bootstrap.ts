/**
 * Bootstrap - OnSite Timekeeper v5
 *
 * Singleton listener initialization for geofence events.
 * Uses transistorsoft BackgroundGeolocation SDK.
 */

import { AppState, type AppStateStatus } from 'react-native';
import { logger } from './logger';
import { useLocationStore } from '../stores/locationStore';
import { useDailyLogStore } from '../stores/dailyLogStore';
import {
  configure as bgGeoConfigure,
  setGeofenceHandler,
  cleanup as bgGeoCleanup,
} from './bgGeo';
import {
  setBackgroundUserId,
  clearBackgroundUserId,
} from './backgroundHelpers';

// ============================================
// SINGLETON STATE
// ============================================

let listenersInitialized = false;
let appStateSubscription: ReturnType<typeof AppState.addEventListener> | null = null;

// ============================================
// APP STATE HANDLER
// ============================================

function handleAppStateChange(nextState: AppStateStatus): void {
  logger.debug('boot', `📱 AppState: ${nextState}`);

  if (nextState === 'active') {
    // App returned to foreground — refresh store so timer recalculates from SQLite enter_at
    useDailyLogStore.getState().reloadToday();
  }
}

// ============================================
// GEOFENCE CALLBACK
// ============================================

function handleGeofenceEvent(event: { type: 'enter' | 'exit'; regionIdentifier: string; timestamp: string }): void {
  logger.info('geofence', `[2/6] bootstrap→locationStore: ${event.type.toUpperCase()} "${event.regionIdentifier}" | ts=${event.timestamp}`);

  const locationStore = useLocationStore.getState();
  locationStore.handleGeofenceEvent(event);
}

// ============================================
// INITIALIZE LISTENERS (CALL ONCE!)
// ============================================

export async function initializeListeners(): Promise<void> {
  if (listenersInitialized) {
    logger.debug('boot', '⚠️ Listeners already initialized - skipping');
    return;
  }

  logger.info('boot', '🎧 Initializing singleton listeners...');

  try {
    // Configure transistorsoft SDK
    await bgGeoConfigure();

    // Route geofence events → locationStore
    setGeofenceHandler(handleGeofenceEvent);

    if (appStateSubscription) {
      appStateSubscription.remove();
    }
    appStateSubscription = AppState.addEventListener('change', handleAppStateChange);

    listenersInitialized = true;
    logger.info('boot', '✅ Singleton listeners ready');

  } catch (error) {
    logger.error('boot', 'Failed to initialize listeners', { error: String(error) });
    listenersInitialized = true;
  }
}

// ============================================
// CLEANUP LISTENERS
// ============================================

export function cleanupListeners(): void {
  logger.info('boot', '🧹 Cleaning up listeners...');

  if (appStateSubscription) {
    appStateSubscription.remove();
    appStateSubscription = null;
  }

  bgGeoCleanup();

  listenersInitialized = false;
  logger.info('boot', '✅ Listeners cleanup complete');
}

// ============================================
// USER SESSION HANDLERS
// ============================================

export async function onUserLogin(userId: string): Promise<void> {
  logger.info('boot', `👤 User logged in: ${userId.substring(0, 8)}...`);
  await setBackgroundUserId(userId);
}

export async function onUserLogout(): Promise<void> {
  logger.info('boot', '👤 User logging out...');
  await clearBackgroundUserId();

  // Clear any pending exit timers
  const { clearAllPendingExits } = await import('./exitHandler');
  clearAllPendingExits();
}

// ============================================
// STATUS
// ============================================

export function areListenersInitialized(): boolean {
  return listenersInitialized;
}

export async function forceReinitialize(): Promise<void> {
  cleanupListeners();
  await initializeListeners();
}
