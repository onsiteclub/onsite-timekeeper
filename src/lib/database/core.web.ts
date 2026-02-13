/**
 * Database Core (Web) - OnSite Timekeeper
 *
 * Web shim: provides the same exports as core.ts without expo-sqlite.
 * Phase 1: Mock db with no-op methods (app compiles, data comes from Supabase sync).
 * Phase 2: Replace with sql.js WASM or Supabase-direct adapter.
 */

import { logger } from '../logger';

// ============================================
// DATABASE MOCK (Web)
// ============================================

const mockDb = {
  runSync(_sql: string, _params?: unknown[]): { changes: number; lastInsertRowId: number } {
    logger.debug('database', 'Web: runSync called (no-op)');
    return { changes: 0, lastInsertRowId: 0 };
  },
  getAllSync<T = Record<string, unknown>>(_sql: string, _params?: unknown[]): T[] {
    logger.debug('database', 'Web: getAllSync called (no-op)');
    return [];
  },
  getFirstSync<T = Record<string, unknown>>(_sql: string, _params?: unknown[]): T | null {
    logger.debug('database', 'Web: getFirstSync called (no-op)');
    return null;
  },
  execSync(_sql: string): void {
    // No-op
  },
};

export const db = mockDb;

// ============================================
// TYPES - CORE (same as native)
// ============================================

export type LocationStatus = 'active' | 'deleted' | 'pending_delete' | 'syncing';
export type AuditEventType = 'entry' | 'exit' | 'dispute' | 'correction';

export interface LocationDB {
  id: string;
  user_id: string;
  name: string;
  latitude: number;
  longitude: number;
  radius: number;
  color: string;
  status: LocationStatus;
  deleted_at: string | null;
  last_seen_at: string;
  created_at: string;
  updated_at: string;
  synced_at: string | null;
}

// ============================================
// TYPES - ANALYTICS
// ============================================

export interface AnalyticsDailyDB {
  date: string;
  user_id: string;
  sessions_count: number;
  total_minutes: number;
  manual_entries: number;
  auto_entries: number;
  locations_created: number;
  locations_deleted: number;
  app_opens: number;
  app_foreground_seconds: number;
  notifications_shown: number;
  notifications_actioned: number;
  features_used: string;
  errors_count: number;
  sync_attempts: number;
  sync_failures: number;
  geofence_triggers: number;
  geofence_accuracy_sum: number;
  geofence_accuracy_count: number;
  app_version: string | null;
  os: string | null;
  device_model: string | null;
  created_at: string;
  synced_at: string | null;
}

// ============================================
// TYPES - ERROR LOG
// ============================================

export interface ErrorLogDB {
  id: string;
  user_id: string | null;
  error_type: string;
  error_message: string;
  error_stack: string | null;
  error_context: string | null;
  app_version: string | null;
  os: string | null;
  os_version: string | null;
  device_model: string | null;
  occurred_at: string;
  created_at: string;
  synced_at: string | null;
}

// ============================================
// TYPES - LOCATION AUDIT
// ============================================

export interface LocationAuditDB {
  id: string;
  user_id: string;
  session_id: string | null;
  event_type: AuditEventType;
  location_id: string | null;
  location_name: string | null;
  latitude: number;
  longitude: number;
  accuracy: number | null;
  occurred_at: string;
  created_at: string;
  synced_at: string | null;
}

// ============================================
// TYPES - DAILY HOURS
// ============================================

export type DailyHoursSource = 'gps' | 'manual' | 'edited';
export type DailyHoursType = 'work' | 'rain' | 'snow' | 'sick' | 'dayoff' | 'holiday';

export interface DailyHoursDB {
  id: string;
  user_id: string;
  date: string;
  total_minutes: number;
  break_minutes: number;
  location_name: string | null;
  location_id: string | null;
  verified: number;
  source: DailyHoursSource;
  first_entry: string | null;
  last_exit: string | null;
  type: DailyHoursType;
  notes: string | null;
  created_at: string;
  updated_at: string;
  synced_at: string | null;
}

// ============================================
// TYPES - ACTIVE TRACKING
// ============================================

export interface ActiveTrackingDB {
  id: string;
  location_id: string;
  location_name: string;
  enter_at: string;
  pause_seconds: number;
  created_at: string;
}

// ============================================
// INITIALIZATION (no-op on web)
// ============================================

export async function initDatabase(): Promise<void> {
  logger.info('boot', 'Database init (web): no-op — using Supabase online mode');
}

// ============================================
// HELPERS (pure JS — same as native)
// ============================================

export function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function now(): string {
  return new Date().toISOString();
}

export function toLocalDateString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function getToday(): string {
  return toLocalDateString(new Date());
}

function toRad(deg: number): number {
  return deg * (Math.PI / 180);
}

export function calculateDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export function calculateDuration(start: string, end: string | null): number {
  if (!start) return 0;
  const startTime = new Date(start).getTime();
  const endTime = end ? new Date(end).getTime() : Date.now();
  if (isNaN(startTime) || isNaN(endTime)) return 0;
  const diff = Math.round((endTime - startTime) / 60000);
  return diff > 0 ? diff : 0;
}

export function formatDuration(minutes: number | null | undefined): string {
  if (minutes === null || minutes === undefined || isNaN(minutes)) {
    return '0min';
  }
  const total = Math.floor(Math.max(0, minutes));
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m}min`;
  return `${h}h ${m}min`;
}
