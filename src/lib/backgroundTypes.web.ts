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

export interface QueuedEvent {
  event: InternalGeofenceEvent;
  queuedAt: number;
}

// ============================================
// CALLBACK TYPES
// ============================================

export type GeofenceCallback = (event: GeofenceEvent) => void;
export type LocationCallback = (location: { coords: { latitude: number; longitude: number; accuracy: number | null }; timestamp: number }) => void;
export type ReconcileCallback = () => Promise<void>;

// ============================================
// CONSTANTS
// ============================================

export const BACKGROUND_USER_KEY = '@onsite/background_user_id';
export const RECONFIGURE_DEBOUNCE_MS = 5000;
export const EVENT_DEDUP_WINDOW_MS = 10000;
export const MAX_QUEUE_SIZE = 20;
export const MAX_QUEUE_AGE_MS = 30000;
