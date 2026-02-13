/**
 * Geofence Logic (Web) - OnSite Timekeeper
 *
 * Web shim: no geofencing processing, no event queue.
 * Exports same API surface as no-ops.
 */

// ============================================
// FENCE CACHE (no-op)
// ============================================

export function updateFenceCache(
  _locations: { id: string; latitude: number; longitude: number; radius: number; name: string }[],
): void {}

export function getFenceCache(): Map<string, { lat: number; lng: number; radius: number; name: string }> {
  return new Map();
}

// ============================================
// DISTANCE CALCULATION (pure math — works)
// ============================================

export function localCalculateDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371e3;
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lng2 - lng1) * Math.PI) / 180;
  const a = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export function localCheckInsideFence(
  _lat: number,
  _lng: number,
): { isInside: boolean; fenceId?: string; fenceName?: string; distance?: number } {
  return { isInside: false };
}

// ============================================
// RECONFIGURE STATE (no-op)
// ============================================

export function setReconfiguring(_value: boolean): void {}
export function cancelExitRetry(): void {}

// ============================================
// GEOFENCE EVENT PROCESSING (no-op)
// ============================================

export async function processGeofenceEvent(_event: unknown): Promise<void> {}
