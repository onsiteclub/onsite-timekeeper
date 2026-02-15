/**
 * Location Service (Web) - OnSite Timekeeper
 *
 * Web shim: no GPS, no geofencing, no background location.
 * All functions return safe defaults.
 */

// ============================================
// TYPES (same as native)
// ============================================

export interface Coordinates {
  latitude: number;
  longitude: number;
}

export interface LocationResult {
  coords: Coordinates;
  accuracy: number | null;
  timestamp: number;
}

export interface GeofenceRegion {
  identifier: string;
  latitude: number;
  longitude: number;
  radius: number;
  notifyOnEnter?: boolean;
  notifyOnExit?: boolean;
}

export interface PermissionsStatus {
  foreground: boolean;
  background: boolean;
}

export interface WatchOptions {
  accuracy?: number;
  distanceInterval?: number;
  timeInterval?: number;
}

// ============================================
// PERMISSIONS (no-op on web)
// ============================================

export async function checkPermissions(): Promise<PermissionsStatus> {
  return { foreground: false, background: false };
}

export async function requestForegroundPermission(): Promise<boolean> {
  return false;
}

export async function requestBackgroundPermission(): Promise<boolean> {
  return false;
}

export async function requestAllPermissions(): Promise<PermissionsStatus> {
  return { foreground: false, background: false };
}

// ============================================
// CURRENT LOCATION (no-op on web)
// ============================================

export async function getCurrentLocation(): Promise<LocationResult | null> {
  return null;
}

// ============================================
// POSITION WATCH (no-op on web)
// ============================================

export async function startPositionWatch(
  _onUpdate: (location: LocationResult) => void,
  _options?: WatchOptions,
): Promise<boolean> {
  return false;
}

export async function stopPositionWatch(): Promise<void> {}

// NOTE: Geofencing + background location now handled by bgGeo.ts (transistorsoft)

// ============================================
// UTILITIES (pure math — works on web)
// ============================================

export function calculateDistance(
  point1: Coordinates,
  point2: Coordinates,
): number {
  const R = 6371e3;
  const φ1 = (point1.latitude * Math.PI) / 180;
  const φ2 = (point2.latitude * Math.PI) / 180;
  const Δφ = ((point2.latitude - point1.latitude) * Math.PI) / 180;
  const Δλ = ((point2.longitude - point1.longitude) * Math.PI) / 180;
  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export function isInsideGeofence(
  position: Coordinates,
  geofence: GeofenceRegion,
): boolean {
  const distance = calculateDistance(position, {
    latitude: geofence.latitude,
    longitude: geofence.longitude,
  });
  return distance <= geofence.radius;
}

export function formatDistance(meters: number): string {
  if (meters < 1000) {
    return `${Math.round(meters)}m`;
  }
  return `${(meters / 1000).toFixed(1)}km`;
}
