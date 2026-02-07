/**
 * Bootstrap - OnSite Timekeeper v3
 *
 * Singleton listener initialization for geofence events.
 */

import { AppState, type AppStateStatus } from 'react-native';
import { logger } from './logger';
import { useLocationStore } from '../stores/locationStore';
import {
  setGeofenceCallback,
  setReconcileCallback,
  setLocationCallback,
  clearCallbacks,
  setBackgroundUserId,
  clearBackgroundUserId,
} from './backgroundTasks';
import { getBackgroundUserId, checkInsideFence } from './backgroundHelpers';
import type * as Location from 'expo-location';

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
}

// ============================================
// GEOFENCE CALLBACK
// ============================================

function handleGeofenceEvent(event: { type: 'enter' | 'exit'; regionIdentifier: string; timestamp: number }): void {
  logger.info('geofence', `🎯 Geofence event: ${event.type} @ ${event.regionIdentifier}`);

  const locationStore = useLocationStore.getState();
  locationStore.handleGeofenceEvent(event);
}

// ============================================
// RECONCILE CALLBACK
// ============================================

async function handleReconcile(): Promise<void> {
  logger.info('geofence', '🔄 Reconcile triggered');

  const locationStore = useLocationStore.getState();
  await locationStore.reconcileState();
}

// ============================================
// LOCATION UPDATE CALLBACK (GPS-based exit detection)
// ============================================

async function handleLocationUpdate(location: Location.LocationObject): Promise<void> {
  try {
    const { coords } = location;
    const locationStore = useLocationStore.getState();
    const currentFenceId = locationStore.currentFenceId;

    if (!currentFenceId) {
      return;
    }

    const userId = await getBackgroundUserId();
    if (!userId) {
      logger.debug('gps', 'No userId for location update, skipping');
      return;
    }

    const result = await checkInsideFence(
      coords.latitude,
      coords.longitude,
      userId
    );

    if (!result.isInside) {
      logger.info('gps', `📍 GPS detected exit from fence: ${currentFenceId}`, {
        lat: coords.latitude.toFixed(6),
        lng: coords.longitude.toFixed(6),
        accuracy: coords.accuracy?.toFixed(0) ?? 'N/A',
      });

      locationStore.handleGeofenceEvent({
        type: 'exit',
        regionIdentifier: currentFenceId,
        timestamp: Date.now(),
      });
    } else {
      logger.debug('gps', `📍 Still inside fence: ${currentFenceId}`, {
        distance: result.distance?.toFixed(0) ?? 'N/A',
      });
    }
  } catch (error) {
    logger.error('gps', 'Error in location update handler', { error: String(error) });
  }
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
    setGeofenceCallback(handleGeofenceEvent);
    setReconcileCallback(handleReconcile);
    setLocationCallback(handleLocationUpdate);

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

  clearCallbacks();

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
