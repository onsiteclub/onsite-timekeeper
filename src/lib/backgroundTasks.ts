/**
 * Background Tasks - OnSite Timekeeper v3
 *
 * Geofencing + Location tracking (SIMPLIFIED - no heartbeat).
 *
 * NOTE: TaskManager.defineTask MUST be at global scope in this file!
 */

import * as TaskManager from 'expo-task-manager';
import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { logger } from './logger';
import {
  setBackgroundUserId as _setBackgroundUserId,
  clearBackgroundUserId as _clearBackgroundUserId,
} from './backgroundHelpers';

// Import from refactored modules
import {
  GEOFENCE_TASK,
  LOCATION_TASK,
  BACKGROUND_USER_KEY,
} from './backgroundTypes';

import {
  setGeofenceCallback,
  clearCallbacks,
} from './taskCallbacks';

import { processGeofenceEvent } from './geofenceLogic';

// Re-export from backgroundHelpers (used by stores)
export {
  addToSkippedToday,
  removeFromSkippedToday,
  clearSkippedToday,
} from './backgroundHelpers';

// ============================================
// RE-EXPORTS (only what bootstrap.ts needs)
// ============================================

export {
  setGeofenceCallback,
  clearCallbacks,
} from './taskCallbacks';

// ============================================
// MODULE STATE
// ============================================

let lastUserIdSaved: string | null = null;

// ============================================
// BACKGROUND USER
// ============================================

export async function setBackgroundUserId(userId: string): Promise<void> {
  if (lastUserIdSaved === userId) {
    logger.debug('boot', `UserId unchanged, skipping save: ${userId.substring(0, 8)}...`);
    return;
  }

  lastUserIdSaved = userId;
  await AsyncStorage.setItem(BACKGROUND_USER_KEY, userId);
  await _setBackgroundUserId(userId);
  logger.debug('boot', `UserId saved for background: ${userId.substring(0, 8)}...`);
}

export async function clearBackgroundUserId(): Promise<void> {
  lastUserIdSaved = null;
  await AsyncStorage.removeItem(BACKGROUND_USER_KEY);
  await _clearBackgroundUserId();
  logger.debug('boot', 'Background userId cleared');
}

// ============================================
// TASK DEFINITIONS (MUST be at global scope)
// ============================================

TaskManager.defineTask(GEOFENCE_TASK, async ({ data, error }) => {
  // CRITICAL DEBUG: Log EVERY task invocation
  logger.info('geofence', `🔔 GEOFENCE TASK FIRED`, {
    hasError: !!error,
    hasData: !!data,
    dataKeys: data ? Object.keys(data) : [],
  });

  if (error) {
    logger.error('geofence', 'Geofence task error', { error: String(error) });
    return;
  }

  if (!data) {
    logger.warn('geofence', 'Geofence task received null data');
    return;
  }

  const eventData = data as { eventType: Location.GeofencingEventType; region: Location.LocationRegion };

  // Log event type for debugging
  logger.info('geofence', `🔔 Native event type: ${eventData.eventType}`, {
    regionId: eventData.region?.identifier ?? 'unknown',
  });

  if (eventData.eventType === Location.GeofencingEventType.Enter) {
    logger.info('geofence', '🔔 Processing ENTER event');
    await processGeofenceEvent({
      region: eventData.region,
      state: Location.GeofencingRegionState.Inside,
    });
  } else if (eventData.eventType === Location.GeofencingEventType.Exit) {
    logger.info('geofence', '🔔 Processing EXIT event');
    await processGeofenceEvent({
      region: eventData.region,
      state: Location.GeofencingRegionState.Outside,
    });
  } else {
    logger.warn('geofence', `🔔 Unknown event type: ${eventData.eventType}`);
  }
});

// Location task: telemetry/logging only (no enter/exit decisions)
let lastLocationTimestamp = 0;

TaskManager.defineTask(LOCATION_TASK, async ({ data, error }) => {
  if (error) {
    logger.error('gps', 'Location task error', { error: String(error) });
    return;
  }

  const locationData = data as { locations: Location.LocationObject[] };

  if (!locationData?.locations?.length) return;

  const location = locationData.locations[0];

  // Dedup: skip if same timestamp as last update (duplicate invocation)
  if (location.timestamp === lastLocationTimestamp) {
    return;
  }
  lastLocationTimestamp = location.timestamp;

  logger.debug('gps', 'Background location update', {
    lat: location.coords.latitude.toFixed(6),
    lng: location.coords.longitude.toFixed(6),
  });
});

logger.info('boot', '📋 Background tasks V3 loaded (simplified, no heartbeat)', {
  geofence: GEOFENCE_TASK,
  location: LOCATION_TASK,
});
