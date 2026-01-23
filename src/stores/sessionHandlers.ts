/**
 * Session Handlers - OnSite Timekeeper (SIMPLIFIED)
 * 
 * Simple geofence handlers that delegate to the new exitHandler system.
 */

import { logger } from '../lib/logger';
import { handleExitWithDelay, handleEnterWithMerge } from '../lib/exitHandler';
import { useAuthStore } from './authStore';
import type { Coordinates } from '../lib/location';

import {
  type QueuedGeofenceEvent,
  isBootReady,
  queueEvent,
  resolveLocationName,
} from './sessionHelpers';

// ============================================
// TYPES FOR STORE ACCESS (SIMPLIFIED)
// ============================================

export interface SessionState {
  skippedToday: string[];
  lastProcessedEnterLocationId: string | null;
}

export type GetState = () => SessionState;

export type SetState = (
  partial: Partial<SessionState> | ((state: SessionState) => Partial<SessionState>)
) => void;

// ============================================
// HANDLE GEOFENCE ENTER (SIMPLIFIED)
// ============================================

export async function handleGeofenceEnterLogic(
  get: GetState,
  set: SetState,
  locationId: string,
  locationName: string | null,
  coords?: Coordinates & { accuracy?: number }
): Promise<void> {
  // BOOT GATE: Queue if not ready
  if (!isBootReady()) {
    queueEvent({
      type: 'enter',
      locationId,
      locationName,
      coords,
      timestamp: Date.now(),
    });
    return;
  }
  
  // Resolve name if null/unknown
  const resolvedName = (locationName && locationName !== 'Unknown' && locationName !== 'null')
    ? locationName
    : resolveLocationName(locationId);
  
  const { skippedToday, lastProcessedEnterLocationId } = get();

  // Prevent duplicate processing
  if (lastProcessedEnterLocationId === locationId) {
    logger.debug('session', `Ignoring duplicate enter for ${resolvedName}`);
    return;
  }

  logger.info('session', `🚶 GEOFENCE ENTER: ${resolvedName}`, { locationId });

  // Check if skipped today
  if (skippedToday.includes(locationId)) {
    logger.info('session', `😴 Location skipped today: ${resolvedName}`);
    set({ lastProcessedEnterLocationId: locationId });
    return;
  }

  // Get user ID for the new system
  const userId = useAuthStore.getState().getUserId();
  if (!userId) {
    logger.warn('session', 'No user ID available for enter handling');
    return;
  }

  // Use the new simplified enter handler
  await handleEnterWithMerge(userId, locationId, resolvedName);
  
  set({ lastProcessedEnterLocationId: locationId });
}

// ============================================
// HANDLE GEOFENCE EXIT (SIMPLIFIED)
// ============================================

export async function handleGeofenceExitLogic(
  get: GetState,
  set: SetState,
  locationId: string,
  locationName: string | null,
  coords?: Coordinates & { accuracy?: number }
): Promise<void> {
  // BOOT GATE: Queue if not ready
  if (!isBootReady()) {
    queueEvent({
      type: 'exit',
      locationId,
      locationName,
      coords,
      timestamp: Date.now(),
    });
    return;
  }
  
  // Resolve name if null/unknown
  const resolvedName = (locationName && locationName !== 'Unknown' && locationName !== 'null')
    ? locationName
    : resolveLocationName(locationId);

  const { skippedToday } = get();

  logger.info('session', `🚶 GEOFENCE EXIT: ${resolvedName}`, { locationId });

  // Clear skipped today for this location (so they can enter tomorrow)
  if (skippedToday.includes(locationId)) {
    set({ skippedToday: skippedToday.filter(id => id !== locationId) });
  }

  // Reset lastProcessedEnterLocationId
  set({ lastProcessedEnterLocationId: null });

  // Get user ID for the new system
  const userId = useAuthStore.getState().getUserId();
  if (!userId) {
    logger.warn('session', 'No user ID available for exit handling');
    return;
  }

  // Use the new simplified exit handler
  await handleExitWithDelay(userId, locationId, resolvedName);
}

// ============================================
// LEGACY ENTRY WITH TIMEOUT (DEPRECATED)
// ============================================

/**
 * @deprecated Use handleGeofenceEnterLogic instead.
 * The new simplified flow handles everything via handleEnterWithMerge.
 * Kept for backward compatibility only.
 */
export async function handleEntryWithTimeout(
  _get: GetState,
  _set: SetState,
  locationId: string,
  locationName: string | null
): Promise<void> {
  // Redirect to simplified flow
  const resolvedName = (locationName && locationName !== 'Unknown' && locationName !== 'null')
    ? locationName
    : resolveLocationName(locationId);

  const userId = useAuthStore.getState().getUserId();
  if (!userId) {
    logger.warn('session', 'No user ID for handleEntryWithTimeout');
    return;
  }

  await handleEnterWithMerge(userId, locationId, resolvedName);
}
