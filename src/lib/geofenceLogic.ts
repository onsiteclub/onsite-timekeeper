/**
 * Geofence Logic - OnSite Timekeeper v3
 *
 * Event processing, fence cache, deduplication, reconfigure queue.
 * SIMPLIFIED: No hysteresis, no ping-pong tracking.
 */

import * as Location from 'expo-location';
import { logger } from './logger';
import { updateActiveFences as _updateActiveFences } from './backgroundHelpers';
import { getGeofenceCallback } from './taskCallbacks';
import {
  type InternalGeofenceEvent,
  type QueuedEvent,
  EVENT_DEDUP_WINDOW_MS,
  MAX_QUEUE_SIZE,
  MAX_QUEUE_AGE_MS,
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
    // Use real radius (no hysteresis)
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
// RECONFIGURE STATE
// ============================================

let isReconfiguring = false;
let drainScheduled = false;
const reconfigureQueue: QueuedEvent[] = [];

/**
 * Set reconfiguring state (used by locationStore, syncStore)
 */
export function setReconfiguring(value: boolean): void {
  const wasReconfiguring = isReconfiguring;
  isReconfiguring = value;
  logger.debug('geofence', `Reconfiguring: ${value}`);

  // Drain queue when reconfiguring ends (with debounce)
  if (wasReconfiguring && !value && !drainScheduled) {
    drainScheduled = true;
    setTimeout(async () => {
      drainScheduled = false;
      await drainReconfigureQueue();
    }, 500);
  }
}

/**
 * Queue event during reconfigure
 */
function queueEventDuringReconfigure(event: InternalGeofenceEvent): void {
  const regionId = event.region.identifier ?? 'unknown';
  const eventType = event.state === Location.GeofencingRegionState.Inside ? 'ENTER' : 'EXIT';

  // Check queue size limit
  if (reconfigureQueue.length >= MAX_QUEUE_SIZE) {
    logger.warn('geofence', `⚠️ Event queue full, dropping oldest: ${eventType} - ${regionId}`);
    reconfigureQueue.shift();
  }

  reconfigureQueue.push({ event, queuedAt: Date.now() });
  logger.info('geofence', `⏸️ Event QUEUED (reconfiguring): ${eventType} - ${regionId}`, {
    queueSize: reconfigureQueue.length,
  });
}

async function drainReconfigureQueue(): Promise<void> {
  if (reconfigureQueue.length === 0) {
    logger.debug('geofence', '📭 Reconfigure queue empty, nothing to drain');
    return;
  }

  const now = Date.now();
  const queueSize = reconfigureQueue.length;

  logger.info('geofence', `▶️ Draining ${queueSize} queued events`);

  let processed = 0;
  let dropped = 0;

  while (reconfigureQueue.length > 0) {
    const item = reconfigureQueue.shift()!;
    const age = now - item.queuedAt;

    // Drop events that are too old
    if (age > MAX_QUEUE_AGE_MS) {
      const regionId = item.event.region.identifier ?? 'unknown';
      logger.warn('geofence', `🗑️ Event dropped (too old: ${(age / 1000).toFixed(1)}s): ${regionId}`);
      dropped++;
      continue;
    }

    // Process the event
    try {
      await processQueuedEvent(item.event);
      processed++;
    } catch (error) {
      logger.error('geofence', 'Error processing queued event', { error: String(error) });
    }
  }

  logger.info('geofence', `✅ Queue drained: ${processed} processed, ${dropped} dropped`);
}

async function processQueuedEvent(event: InternalGeofenceEvent): Promise<void> {
  const { region, state } = event;
  const regionId = region.identifier ?? 'unknown';
  const eventType = state === Location.GeofencingRegionState.Inside ? 'enter' : 'exit';

  // Check duplicate (even for queued events)
  if (isDuplicateEvent(regionId, eventType)) {
    logger.warn('geofence', `🚫 DUPLICATE queued event ignored: ${eventType.toUpperCase()} - ${regionId}`);
    return;
  }

  // Get fence info
  const fence = fenceCache.get(regionId);
  const fenceName = fence?.name || 'Unknown';

  logger.info('geofence', `📍 Geofence ${eventType} (from queue): ${fenceName}`);

  // Call callback
  const geofenceCallback = getGeofenceCallback();
  if (geofenceCallback) {
    geofenceCallback({
      type: eventType,
      regionIdentifier: regionId,
      timestamp: Date.now(),
    });
  }
}

// ============================================
// EXIT RETRY (up to 3 attempts, 15s apart)
// ============================================

const EXIT_RETRY_INTERVAL_MS = 15_000; // 15 seconds
const EXIT_RETRY_MAX_ATTEMPTS = 3;
const EXIT_RETRY_ACCURACY_THRESHOLD = 150; // meters

let activeExitRetry: { regionId: string; timer: ReturnType<typeof setTimeout> } | null = null;

function scheduleExitRetry(
  event: InternalGeofenceEvent,
  fenceName: string,
  attempt: number,
): void {
  const regionId = event.region.identifier ?? 'unknown';

  // Cancel any existing retry for a different region
  if (activeExitRetry && activeExitRetry.regionId !== regionId) {
    clearTimeout(activeExitRetry.timer);
    activeExitRetry = null;
  }

  if (attempt > EXIT_RETRY_MAX_ATTEMPTS) {
    logger.warn('geofence', `🚫 EXIT retry exhausted (${EXIT_RETRY_MAX_ATTEMPTS} attempts): ${fenceName}`);
    activeExitRetry = null;
    return;
  }

  logger.info('geofence', `🔄 EXIT retry ${attempt}/${EXIT_RETRY_MAX_ATTEMPTS} scheduled in 15s: ${fenceName}`);

  const timer = setTimeout(async () => {
    activeExitRetry = null;

    try {
      // Get fresh high-accuracy GPS
      const freshLocation = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });

      const accuracy = freshLocation.coords.accuracy ?? 999;
      logger.info('geofence', `🔄 EXIT retry ${attempt} GPS: accuracy ${accuracy.toFixed(0)}m`);

      // If still poor accuracy, retry again
      if (accuracy > EXIT_RETRY_ACCURACY_THRESHOLD) {
        logger.warn('geofence', `⏳ EXIT retry ${attempt} still poor accuracy (${accuracy.toFixed(0)}m)`);
        scheduleExitRetry(event, fenceName, attempt + 1);
        return;
      }

      // Check if actually outside the fence
      const fence = fenceCache.get(regionId);
      if (!fence) {
        logger.warn('geofence', `🔄 EXIT retry: fence ${regionId} not in cache, discarding`);
        return;
      }

      const distance = localCalculateDistance(
        freshLocation.coords.latitude,
        freshLocation.coords.longitude,
        fence.lat,
        fence.lng,
      );

      if (distance > fence.radius) {
        // Confirmed outside — process the exit
        logger.info('geofence', `✅ EXIT retry ${attempt} CONFIRMED outside ${fenceName} (${distance.toFixed(0)}m > ${fence.radius}m radius)`);

        const geofenceCallback = getGeofenceCallback();
        if (geofenceCallback) {
          geofenceCallback({
            type: 'exit',
            regionIdentifier: regionId,
            timestamp: Date.now(),
          });
        }
      } else {
        // Still inside — discard the exit
        logger.info('geofence', `🚫 EXIT retry ${attempt}: still inside ${fenceName} (${distance.toFixed(0)}m <= ${fence.radius}m) — discarding exit`);
      }
    } catch (error) {
      logger.error('geofence', `EXIT retry ${attempt} error`, { error: String(error) });
      scheduleExitRetry(event, fenceName, attempt + 1);
    }
  }, EXIT_RETRY_INTERVAL_MS);

  activeExitRetry = { regionId, timer };
}

/**
 * Cancel any active exit retry (exported for cleanup)
 */
export function cancelExitRetry(): void {
  if (activeExitRetry) {
    clearTimeout(activeExitRetry.timer);
    activeExitRetry = null;
    logger.debug('geofence', 'Exit retry cancelled');
  }
}

// ============================================
// GEOFENCE EVENT PROCESSING
// ============================================

/**
 * Process geofence event (used by backgroundTasks)
 */
export async function processGeofenceEvent(event: InternalGeofenceEvent): Promise<void> {
  const { region, state } = event;
  const regionId = region.identifier ?? 'unknown';
  const eventType = state === Location.GeofencingRegionState.Inside ? 'enter' : 'exit';

  // Queue during reconfigure
  if (isReconfiguring) {
    queueEventDuringReconfigure(event);
    return;
  }

  // Check duplicate (10s window)
  if (isDuplicateEvent(regionId, eventType)) {
    logger.warn('geofence', `🚫 DUPLICATE event ignored: ${eventType.toUpperCase()} - ${regionId}`);
    return;
  }

  // Get fence info
  const fence = fenceCache.get(regionId);
  const fenceName = fence?.name || 'Unknown';

  // GPS accuracy gate
  try {
    const currentLocation = await Location.getLastKnownPositionAsync({
      maxAge: 10000,
      requiredAccuracy: 100,
    });
    if (currentLocation?.coords.accuracy) {
      const accuracy = currentLocation.coords.accuracy;
      const threshold = eventType === 'exit' ? 150 : 100;
      if (accuracy > threshold) {
        if (eventType === 'exit') {
          // Don't discard — schedule retry with fresh high-accuracy GPS
          logger.warn('geofence', `⏳ EXIT deferred (accuracy ${accuracy.toFixed(0)}m > ${threshold}m): ${fenceName}`);
          scheduleExitRetry(event, fenceName, 1);
          return;
        }
        logger.warn('geofence', `🚫 SKIPPED ${eventType} (accuracy ${accuracy.toFixed(0)}m > ${threshold}m): ${fenceName}`);
        return;
      }
      if (accuracy > 50) {
        logger.warn('geofence', `⚠️ LOW GPS ACCURACY: ${accuracy.toFixed(0)}m for ${eventType}: ${fenceName}`);
      }
    }
  } catch {
    // Could not check GPS accuracy, proceed normally
    logger.debug('geofence', 'Could not check GPS accuracy, proceeding');
  }

  // Log event
  logger.info('geofence', `📍 Geofence ${eventType}: ${fenceName}`);

  // Call callback
  const geofenceCallback = getGeofenceCallback();
  if (geofenceCallback) {
    geofenceCallback({
      type: eventType,
      regionIdentifier: regionId,
      timestamp: Date.now(),
    });
  }
}
