/**
 * Event Log - OnSite Timekeeper v4
 *
 * Logs confirmed geofence events to geofence_events table.
 * Used for history, audit trail, and Secretary AI.
 */

import { logger } from './logger';
import { db } from './database/core';

/**
 * Log a confirmed geofence event to geofence_events table.
 */
export function logGeofenceEvent(
  userId: string,
  locationId: string,
  eventType: 'entry' | 'exit',
  accuracy: number | null,
  latitude: number,
  longitude: number,
): void {
  try {
    db.runSync(
      `INSERT INTO geofence_events (user_id, location_id, event_type, timestamp, accuracy, latitude, longitude)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [userId, locationId, eventType, new Date().toISOString(), accuracy ?? null, latitude, longitude]
    );
  } catch (error) {
    logger.warn('geofence', 'Failed to log geofence event', { error: String(error) });
  }
}
