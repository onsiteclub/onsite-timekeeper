/**
 * Event Log - OnSite Timekeeper v4
 *
 * Logs confirmed geofence events to geofence_events table.
 * Used for history, audit trail, and Secretary AI.
 */

import { logger } from './logger';
import { db } from './database/core';

// ============================================
// SESSION BREAKDOWN (for Details view)
// ============================================

export interface SessionSegment {
  startTime: string;   // ISO timestamp
  endTime: string;     // ISO timestamp
  durationMinutes: number;
}

/**
 * Reconstruct individual sessions from geofence_events for a given day.
 * Pairs consecutive entry→exit events to build the breakdown.
 */
export function getSessionBreakdown(userId: string, date: string): SessionSegment[] {
  try {
    const dayStart = `${date}T00:00:00`;
    const dayEnd = `${date}T23:59:59`;

    const events = db.getAllSync<{
      event_type: string;
      timestamp: string;
    }>(
      `SELECT event_type, timestamp FROM geofence_events
       WHERE user_id = ? AND timestamp >= ? AND timestamp <= ?
       ORDER BY timestamp ASC`,
      [userId, dayStart, dayEnd]
    );

    const segments: SessionSegment[] = [];
    let lastEntry: string | null = null;

    for (const event of events) {
      if (event.event_type === 'entry') {
        lastEntry = event.timestamp;
      } else if (event.event_type === 'exit' && lastEntry) {
        const start = new Date(lastEntry).getTime();
        const end = new Date(event.timestamp).getTime();
        const minutes = Math.round((end - start) / 60000);
        if (minutes > 0) {
          segments.push({
            startTime: lastEntry,
            endTime: event.timestamp,
            durationMinutes: minutes,
          });
        }
        lastEntry = null;
      }
    }

    return segments;
  } catch (error) {
    logger.warn('geofence', 'Failed to get session breakdown', { error: String(error) });
    return [];
  }
}

// ============================================
// EVENT LOGGING
// ============================================

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
