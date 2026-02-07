/**
 * Session Handlers - OnSite Timekeeper v3
 *
 * Simple geofence handlers that delegate to the new exitHandler system.
 * SIMPLIFIED: No boot gate (SQLite persists state), no dedup (handled in exitHandler).
 */

import { logger } from '../lib/logger';
import { onGeofenceEnter, onGeofenceExit } from '../lib/exitHandler';
import { useAuthStore } from './authStore';
import type { Coordinates } from '../lib/location';

import { resolveLocationName } from './sessionHelpers';

// ============================================
// TYPES FOR STORE ACCESS (SIMPLIFIED)
// ============================================

export interface SessionState {
  skippedToday: string[];
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
  _set: SetState,
  locationId: string,
  locationName: string | null,
  _coords?: Coordinates & { accuracy?: number }
): Promise<void> {
  // Resolve name if null/unknown
  const resolvedName =
    locationName && locationName !== 'Unknown' && locationName !== 'null'
      ? locationName
      : resolveLocationName(locationId);

  const { skippedToday } = get();

  logger.info('session', `🚶 GEOFENCE ENTER: ${resolvedName}`, { locationId });

  // Check if skipped today
  if (skippedToday.includes(locationId)) {
    logger.info('session', `😴 Location skipped today: ${resolvedName}`);
    return;
  }

  // Get user ID
  const userId = useAuthStore.getState().getUserId();
  if (!userId) {
    logger.warn('session', 'No user ID available for enter handling');
    return;
  }

  // Delegate to new exitHandler system (handles dedup, SQLite persistence)
  await onGeofenceEnter(userId, locationId, resolvedName);
}

// ============================================
// HANDLE GEOFENCE EXIT (SIMPLIFIED)
// ============================================

export async function handleGeofenceExitLogic(
  get: GetState,
  set: SetState,
  locationId: string,
  locationName: string | null,
  _coords?: Coordinates & { accuracy?: number }
): Promise<void> {
  // Resolve name if null/unknown
  const resolvedName =
    locationName && locationName !== 'Unknown' && locationName !== 'null'
      ? locationName
      : resolveLocationName(locationId);

  const { skippedToday } = get();

  logger.info('session', `🚶 GEOFENCE EXIT: ${resolvedName}`, { locationId });

  // Clear skipped today for this location (so they can enter tomorrow)
  if (skippedToday.includes(locationId)) {
    set({ skippedToday: skippedToday.filter((id) => id !== locationId) });
  }

  // Get user ID
  const userId = useAuthStore.getState().getUserId();
  if (!userId) {
    logger.warn('session', 'No user ID available for exit handling');
    return;
  }

  // Delegate to new exitHandler system (handles 60s cooldown, SQLite persistence)
  await onGeofenceExit(userId, locationId, resolvedName);
}

