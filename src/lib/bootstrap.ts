/**
 * Bootstrap - OnSite Timekeeper v2
 * 
 * SINGLETON listener initialization.
 * This is the ONLY place that registers callbacks.
 * 
 * FIX: Now calls locationStore.handleGeofenceEvent() to update currentFenceId
 */

import { AppState, type AppStateStatus } from 'react-native';
import { logger } from './logger';
import { useLocationStore } from '../stores/locationStore';
import {
  startHeartbeat,
  stopHeartbeat,
  setGeofenceCallback,
  setReconcileCallback,
  setLocationCallback,
  clearCallbacks,
  updateHeartbeatInterval,
  setBackgroundUserId,
  clearBackgroundUserId,
} from './backgroundTasks';
import { getBackgroundUserId, checkInsideFence } from './backgroundHelpers';
import { useWorkSessionStore } from '../stores/workSessionStore';
import type * as Location from 'expo-location';

// ============================================
// SINGLETON STATE
// ============================================

let listenersInitialized = false;
let appStateSubscription: ReturnType<typeof AppState.addEventListener> | null = null;

// ============================================
// APP STATE HANDLER
// ============================================

async function handleAppStateChange(nextState: AppStateStatus): Promise<void> {
  logger.debug('boot', `📱 AppState: ${nextState}`);
  
  if (nextState === 'active') {
    // Update heartbeat interval when app becomes active
    await updateHeartbeatInterval();
  }
}

// ============================================
// GEOFENCE CALLBACK
// ============================================

function handleGeofenceEvent(event: { type: 'enter' | 'exit'; regionIdentifier: string; timestamp: number }): void {
  logger.info('geofence', `🎯 Geofence event: ${event.type} @ ${event.regionIdentifier}`);
  
  // FIX: Call locationStore.handleGeofenceEvent() which:
  // 1. Updates currentFenceId (for START button)
  // 2. Calls workSessionStore for notification flow
  const locationStore = useLocationStore.getState();
  locationStore.handleGeofenceEvent(event);
}

// ============================================
// RECONCILE CALLBACK
// ============================================

async function handleReconcile(): Promise<void> {
  logger.info('geofence', '🔄 Reconcile triggered');

  // FIX: Call locationStore.reconcileState() which handles currentFenceId
  const locationStore = useLocationStore.getState();
  await locationStore.reconcileState();
}

// ============================================
// LOCATION UPDATE CALLBACK (GPS-based exit detection)
// ============================================

/**
 * Handle continuous GPS updates to detect exit from geofence.
 * Called every 50m or 60s by LOCATION_TASK.
 * This provides reliable exit detection even with screen off.
 */
async function handleLocationUpdate(location: Location.LocationObject): Promise<void> {
  try {
    const { coords } = location;
    const locationStore = useLocationStore.getState();
    const currentFenceId = locationStore.currentFenceId;

    // If not inside any fence, nothing to check
    if (!currentFenceId) {
      return;
    }

    // Get user ID for fence check
    const userId = await getBackgroundUserId();
    if (!userId) {
      logger.debug('gps', 'No userId for location update, skipping');
      return;
    }

    // Check if still inside the fence using hysteresis
    const result = await checkInsideFence(
      coords.latitude,
      coords.longitude,
      userId,
      true, // useHysteresis for exit
      'heartbeat', // source
      coords.accuracy ?? undefined
    );

    // If outside the fence, trigger exit event
    if (!result.isInside) {
      logger.info('gps', `📍 GPS detected exit from fence: ${currentFenceId}`, {
        lat: coords.latitude.toFixed(6),
        lng: coords.longitude.toFixed(6),
        accuracy: coords.accuracy?.toFixed(0) ?? 'N/A',
      });

      // Trigger exit via locationStore (same path as native geofence)
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
    // Register callbacks (ONCE!)
    setGeofenceCallback(handleGeofenceEvent);
    setReconcileCallback(handleReconcile);
    setLocationCallback(handleLocationUpdate); // GPS-based exit detection

    // AppState listener (ONCE!)
    if (appStateSubscription) {
      appStateSubscription.remove();
    }
    appStateSubscription = AppState.addEventListener('change', handleAppStateChange);
    
    // Start heartbeat
    await startHeartbeat();
    
    listenersInitialized = true;
    logger.info('boot', '✅ Singleton listeners ready');
    
  } catch (error) {
    logger.error('boot', 'Failed to initialize listeners', { error: String(error) });
    // Mark as initialized to prevent infinite retries
    listenersInitialized = true;
  }
}

// ============================================
// CLEANUP LISTENERS
// ============================================

export async function cleanupListeners(): Promise<void> {
  logger.info('boot', '🧹 Cleaning up listeners...');
  
  if (appStateSubscription) {
    appStateSubscription.remove();
    appStateSubscription = null;
  }
  
  clearCallbacks();
  await stopHeartbeat();
  
  listenersInitialized = false;
  logger.info('boot', '✅ Listeners cleanup complete');
}

// ============================================
// USER SESSION HANDLERS
// ============================================

export async function onUserLogin(userId: string): Promise<void> {
  logger.info('boot', `👤 User logged in: ${userId.substring(0, 8)}...`);
  await setBackgroundUserId(userId);
  await updateHeartbeatInterval();
}

export async function onUserLogout(): Promise<void> {
  logger.info('boot', '👤 User logging out...');
  await clearBackgroundUserId();

  // Clear any pending session state
  const { clearAllPendingExitNotifications } = await import('./exitHandler');
  clearAllPendingExitNotifications();
}

// ============================================
// STATUS
// ============================================

export function areListenersInitialized(): boolean {
  return listenersInitialized;
}

/**
 * Force re-initialization (use with caution)
 */
export async function forceReinitialize(): Promise<void> {
  await cleanupListeners();
  await initializeListeners();
}
