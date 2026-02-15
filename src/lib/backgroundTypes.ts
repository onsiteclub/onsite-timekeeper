/**
 * Background Types - OnSite Timekeeper v3
 *
 * Types and constants for background tasks.
 * SIMPLIFIED: Removed heartbeat system.
 */

import * as Location from 'expo-location';

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
  region: Location.LocationRegion;
  state: Location.GeofencingRegionState;
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
