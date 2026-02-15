/**
 * Background Types (Web) - OnSite Timekeeper
 *
 * Web shim: provides same types/constants without expo-location dependency.
 */

// ============================================
// TASK NAMES
// ============================================

export const GEOFENCE_TASK = 'onsite-geofence';
export const LOCATION_TASK = 'onsite-location-task';

// ============================================
// TYPES
// ============================================

export interface GeofenceEvent {
  type: 'enter' | 'exit';
  regionIdentifier: string;
  timestamp: number;
}

export interface InternalGeofenceEvent {
  region: { identifier: string; latitude?: number; longitude?: number; radius?: number };
  state: number;
}

// ============================================
// CALLBACK TYPES
// ============================================

export type GeofenceCallback = (event: GeofenceEvent) => void;

// ============================================
// CONSTANTS
// ============================================

export const BACKGROUND_USER_KEY = '@onsite/background_user_id';
export const EVENT_DEDUP_WINDOW_MS = 10000;
