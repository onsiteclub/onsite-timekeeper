/**
 * Task Callbacks - OnSite Timekeeper v3
 *
 * Callback registration for geofence and location events.
 * SIMPLIFIED: No heartbeat.
 */

import { logger } from './logger';
import type {
  GeofenceCallback,
  LocationCallback,
  ReconcileCallback,
} from './backgroundTypes';

// ============================================
// CALLBACK STATE (module-level)
// ============================================

let geofenceCallback: GeofenceCallback | null = null;
let locationCallback: LocationCallback | null = null;
let reconcileCallback: ReconcileCallback | null = null;

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
 * Set reconcile callback (used by bootstrap via backgroundTasks)
 */
export function setReconcileCallback(callback: ReconcileCallback): void {
  reconcileCallback = callback;
  logger.debug('geofence', 'Reconcile callback registered');
}

/**
 * Set location callback (used by bootstrap.ts for GPS-based exit detection)
 */
export function setLocationCallback(callback: LocationCallback): void {
  locationCallback = callback;
  logger.debug('gps', 'Location callback registered');
}

/**
 * Clear all callbacks (used by bootstrap via backgroundTasks)
 */
export function clearCallbacks(): void {
  geofenceCallback = null;
  locationCallback = null;
  reconcileCallback = null;
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

/**
 * Get location callback (used by backgroundTasks)
 */
export function getLocationCallback(): LocationCallback | null {
  return locationCallback;
}

/**
 * Get reconcile callback (internal use only)
 */
export function getReconcileCallback(): ReconcileCallback | null {
  return reconcileCallback;
}
