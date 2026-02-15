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
  clearCallbacks,
  setBackgroundUserId,
  clearBackgroundUserId,
} from './backgroundTasks';

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
