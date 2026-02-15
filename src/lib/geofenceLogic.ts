/**
 * Geofence Logic - OnSite Timekeeper v4
 *
 * REDESIGNED: "Segue a Bolinha Azul"
 *
 * The blue dot (Fused Location) IS the truth.
 * Instead of accuracy gates and retry loops, we check one thing:
 * does the blue dot agree with the OS event?
 *
 * - ENTRY + blue dot inside fence → real → process
 * - ENTRY + blue dot outside fence → phantom → ignore
 * - EXIT + blue dot outside fence → real → process
 * - EXIT + blue dot inside fence → GPS bounce → ignore
 *
 * Removed: exit retry, reconfigure queue, reconfigure window, accuracy gates.
 * Kept: dedup (10s), fence cache, distance calc.
 */

import * as Location from 'expo-location';
import { logger } from './logger';
import { updateActiveFences as _updateActiveFences } from './backgroundHelpers';
import { getGeofenceCallback } from './taskCallbacks';
import {
  type InternalGeofenceEvent,
  EVENT_DEDUP_WINDOW_MS,
} from './backgroundTypes';

// ============================================
// FENCE CACHE (module-level)
// ============================================

const fenceCache: Map<string, { lat: number; lng: number; radius: number; name: string }> = new Map();

/**
 * Update fence cache (called by locationStore)
 */
export function updateFenceCache(
  locations: { id: string; latitude: number; longitude: number; radius: number; name: string }[]
): void {
  fenceCache.clear();
  locations.forEach(loc => {
    fenceCache.set(loc.id, {
      lat: loc.latitude,
      lng: loc.longitude,
      radius: loc.radius,
      name: loc.name,
    });
  });

  // Also update backgroundHelpers cache
  _updateActiveFences(locations.map(loc => ({
    id: loc.id,
    name: loc.name,
    latitude: loc.latitude,
    longitude: loc.longitude,
    radius: loc.radius,
  })));

  logger.debug('geofence', `Fences in cache: ${fenceCache.size}`);
}

/**
 * Get fence cache
 */
export function getFenceCache(): Map<string, { lat: number; lng: number; radius: number; name: string }> {
  return fenceCache;
}

// ============================================
// DISTANCE CALCULATION
// ============================================

/**
 * Calculate distance between two points (Haversine)
 */
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

/**
 * Check if inside any fence (uses real radius, no hysteresis)
 */
export function localCheckInsideFence(
  lat: number,
  lng: number
): { isInside: boolean; fenceId?: string; fenceName?: string; distance?: number } {
  for (const [id, fence] of fenceCache.entries()) {
    const distance = localCalculateDistance(lat, lng, fence.lat, fence.lng);
    if (distance <= fence.radius) {
      return { isInside: true, fenceId: id, fenceName: fence.name, distance };
    }
  }
  return { isInside: false };
}

// ============================================
// EVENT DEDUPLICATION
// ============================================

const processedEvents = new Map<string, number>();

/**
 * Check if event is duplicate (10s window)
 */
function isDuplicateEvent(regionId: string, eventType: string): boolean {
  const key = `${regionId}-${eventType}`;
  const lastTime = processedEvents.get(key);
  const now = Date.now();

  if (lastTime && now - lastTime < EVENT_DEDUP_WINDOW_MS) {
    return true;
  }

  processedEvents.set(key, now);

  // Cleanup old entries
  for (const [k, v] of processedEvents.entries()) {
    if (now - v > EVENT_DEDUP_WINDOW_MS * 2) {
      processedEvents.delete(k);
    }
  }

  return false;
}

// ============================================
// GEOFENCE EVENT PROCESSING (v4: Bolinha Azul)
// ============================================

/**
 * Process geofence event (used by backgroundTasks).
 *
 * v4 flow:
 * 1. Duplicate (10s)? → drop
 * 2. Get blue dot position (last known GPS)
 * 3. Blue dot agrees with event? → process. Disagrees? → phantom, drop.
 *
 * No reconfigure window needed — bolinha azul validates everything.
 */
export async function processGeofenceEvent(event: InternalGeofenceEvent): Promise<void> {
  const { region, state } = event;
  const regionId = region.identifier ?? 'unknown';
  const eventType = state === Location.GeofencingRegionState.Inside ? 'enter' : 'exit';

  // 1. Dedup (10s window)
  if (isDuplicateEvent(regionId, eventType)) {
    logger.warn('geofence', `🚫 DUPLICATE event ignored: ${eventType.toUpperCase()} - ${regionId}`);
    return;
  }

  // 2. Get fence info
  const fence = fenceCache.get(regionId);
  const fenceName = fence?.name || 'Unknown';

  // 3. BOLINHA AZUL: Get last known GPS position and verify distance
  if (fence) {
    try {
      const currentLocation = await Location.getLastKnownPositionAsync({
        maxAge: 15000, // 15s — fresh enough for Fused Location
      });

      if (currentLocation) {
        const blueDotLat = currentLocation.coords.latitude;
        const blueDotLng = currentLocation.coords.longitude;
        const distanceFromFence = localCalculateDistance(blueDotLat, blueDotLng, fence.lat, fence.lng);

        if (eventType === 'enter' && distanceFromFence > fence.radius * 1.5) {
          // OS says ENTER but blue dot is far outside → phantom
          logger.warn('geofence', `🚫 PHANTOM ENTRY rejected: blue dot ${distanceFromFence.toFixed(0)}m from ${fenceName} (limit=${(fence.radius * 1.5).toFixed(0)}m)`);
          return;
        }

        if (eventType === 'exit' && distanceFromFence <= fence.radius * 0.7) {
          // OS says EXIT but blue dot is deep inside fence → GPS bounce
          logger.warn('geofence', `🚫 GPS BOUNCE rejected: blue dot ${distanceFromFence.toFixed(0)}m from ${fenceName} (deep inside ${fence.radius}m radius)`);
          return;
        }

        // Blue dot agrees with event
        logger.info('geofence', `📍 Geofence ${eventType}: ${fenceName} (blue dot ${distanceFromFence.toFixed(0)}m, radius=${fence.radius}m)`);
      } else {
        // No GPS available — trust the OS event (Fused Location Provider already validated it)
        logger.info('geofence', `📍 Geofence ${eventType}: ${fenceName} (no GPS cache, trusting OS)`);
      }
    } catch {
      // GPS check failed — trust the OS event
      logger.debug('geofence', `📍 Geofence ${eventType}: ${fenceName} (GPS check failed, trusting OS)`);
    }
  } else {
    logger.info('geofence', `📍 Geofence ${eventType}: ${regionId} (fence not in cache)`);
  }

  // 4. Pass to callback (bootstrap → locationStore)
  const geofenceCallback = getGeofenceCallback();
  if (geofenceCallback) {
    geofenceCallback({
      type: eventType,
      regionIdentifier: regionId,
      timestamp: Date.now(),
    });
  } else {
    // Callback is null — app process was killed by Android (Doze mode).
    // Try to reinitialize listeners and deliver the event.
    logger.warn('geofence', `⚠️ Callback null (process killed?) — reinitializing for ${eventType} @ ${regionId}`);
    try {
      const { initializeListeners } = await import('./bootstrap');
      await initializeListeners();
      const retryCallback = getGeofenceCallback();
      if (retryCallback) {
        logger.info('geofence', `✅ Reinitialized — delivering ${eventType} @ ${regionId}`);
        retryCallback({
          type: eventType,
          regionIdentifier: regionId,
          timestamp: Date.now(),
        });
      } else {
        logger.error('geofence', `❌ Reinit failed — ${eventType} @ ${regionId} LOST`);
      }
    } catch (e) {
      logger.error('geofence', `❌ Reinit error — ${eventType} @ ${regionId} LOST`, { error: String(e) });
    }
  }
}
