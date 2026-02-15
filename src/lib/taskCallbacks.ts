/**
 * Task Callbacks - OnSite Timekeeper v4
 *
 * Callback registration for geofence events.
 * SIMPLIFIED: No heartbeat, no reconcile, no GPS-based exit.
 */

import { logger } from './logger';
import type { GeofenceCallback } from './backgroundTypes';

// ============================================
// CALLBACK STATE (module-level)
// ============================================

let geofenceCallback: GeofenceCallback | null = null;

// ============================================
// CALLBACK SETTERS (public)
// ============================================

/**
 * Set geofence callback (used by bootstrap via backgroundTasks)
 */
export function setGeofenceCallback(callback: GeofenceCallback): void {
  geofenceCallback = callback;
  logger.debug('geofence', 'Geofence callback registered');
}

/**
 * Clear all callbacks (used by bootstrap via backgroundTasks)
 */
export function clearCallbacks(): void {
  geofenceCallback = null;
  logger.debug('geofence', 'Callbacks cleared');
}

// ============================================
// CALLBACK GETTERS (for internal use by other modules)
// ============================================

/**
 * Get geofence callback (used by geofenceLogic)
 */
export function getGeofenceCallback(): GeofenceCallback | null {
  return geofenceCallback;
}
