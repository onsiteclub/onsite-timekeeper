/**
 * Database - Debug Functions
 *
 * Stats and reset for DevMonitor
 *
 * V3: records table removed, using daily_hours + active_tracking
 */

import { logger } from '../logger';
import { db } from './core';

// ============================================
// DATABASE STATS
// ============================================

export interface DbStats {
  // Core
  locations_total: number;
  locations_active: number;
  locations_deleted: number;

  // V3: daily_hours replaces records
  daily_hours_total: number;
  daily_hours_pending: number;
  active_tracking_count: number;

  // Analytics
  analytics_days: number;
  analytics_pending: number;

  // Errors
  errors_total: number;
  errors_pending: number;

  // Audit
  audit_total: number;
  audit_pending: number;
}

/**
 * Returns record counts for each table
 */
export async function getDbStats(): Promise<DbStats> {
  try {
    // Locations
    const locationsTotal = db.getFirstSync<{ count: number }>(
      `SELECT COUNT(*) as count FROM locations`
    );
    const locationsActive = db.getFirstSync<{ count: number }>(
      `SELECT COUNT(*) as count FROM locations WHERE status = 'active'`
    );
    const locationsDeleted = db.getFirstSync<{ count: number }>(
      `SELECT COUNT(*) as count FROM locations WHERE status = 'deleted'`
    );

    // V3: daily_hours (replaces records)
    const dailyHoursTotal = db.getFirstSync<{ count: number }>(
      `SELECT COUNT(*) as count FROM daily_hours`
    );
    const dailyHoursPending = db.getFirstSync<{ count: number }>(
      `SELECT COUNT(*) as count FROM daily_hours WHERE synced_at IS NULL`
    );
    const activeTrackingCount = db.getFirstSync<{ count: number }>(
      `SELECT COUNT(*) as count FROM active_tracking`
    );

    // Analytics
    const analyticsDays = db.getFirstSync<{ count: number }>(
      `SELECT COUNT(*) as count FROM analytics_daily`
    );
    const analyticsPending = db.getFirstSync<{ count: number }>(
      `SELECT COUNT(*) as count FROM analytics_daily WHERE synced_at IS NULL`
    );

    // Errors
    const errorsTotal = db.getFirstSync<{ count: number }>(
      `SELECT COUNT(*) as count FROM error_log`
    );
    const errorsPending = db.getFirstSync<{ count: number }>(
      `SELECT COUNT(*) as count FROM error_log WHERE synced_at IS NULL`
    );

    // Audit
    const auditTotal = db.getFirstSync<{ count: number }>(
      `SELECT COUNT(*) as count FROM location_audit`
    );
    const auditPending = db.getFirstSync<{ count: number }>(
      `SELECT COUNT(*) as count FROM location_audit WHERE synced_at IS NULL`
    );

    return {
      locations_total: locationsTotal?.count || 0,
      locations_active: locationsActive?.count || 0,
      locations_deleted: locationsDeleted?.count || 0,
      daily_hours_total: dailyHoursTotal?.count || 0,
      daily_hours_pending: dailyHoursPending?.count || 0,
      active_tracking_count: activeTrackingCount?.count || 0,
      analytics_days: analyticsDays?.count || 0,
      analytics_pending: analyticsPending?.count || 0,
      errors_total: errorsTotal?.count || 0,
      errors_pending: errorsPending?.count || 0,
      audit_total: auditTotal?.count || 0,
      audit_pending: auditPending?.count || 0,
    };
  } catch (error) {
    logger.error('database', 'Error getting stats', { error: String(error) });
    return {
      locations_total: 0,
      locations_active: 0,
      locations_deleted: 0,
      daily_hours_total: 0,
      daily_hours_pending: 0,
      active_tracking_count: 0,
      analytics_days: 0,
      analytics_pending: 0,
      errors_total: 0,
      errors_pending: 0,
      audit_total: 0,
      audit_pending: 0,
    };
  }
}

/**
 * Clears all local data (NUCLEAR OPTION)
 */
export async function resetDatabase(): Promise<void> {
  try {
    logger.warn('database', '⚠️ RESET DATABASE - Clearing all local data');

    db.execSync(`DELETE FROM location_audit`);
    db.execSync(`DELETE FROM error_log`);
    db.execSync(`DELETE FROM analytics_daily`);
    db.execSync(`DELETE FROM daily_hours`);
    db.execSync(`DELETE FROM active_tracking`);
    db.execSync(`DELETE FROM locations`);

    logger.info('database', '✅ Database reset');
  } catch (error) {
    logger.error('database', 'Error resetting database', { error: String(error) });
    throw error;
  }
}

/**
 * Get table sizes for storage analysis
 */
export async function getTableSizes(): Promise<Record<string, number>> {
  try {
    const tables = ['locations', 'daily_hours', 'active_tracking', 'analytics_daily', 'error_log', 'location_audit'];
    const sizes: Record<string, number> = {};

    for (const table of tables) {
      try {
        const result = db.getFirstSync<{ count: number }>(
          `SELECT COUNT(*) as count FROM ${table}`
        );
        sizes[table] = result?.count || 0;
      } catch {
        sizes[table] = 0;
      }
    }

    return sizes;
  } catch (error) {
    logger.error('database', 'Error getting table sizes', { error: String(error) });
    return {};
  }
}

/**
 * Get pending sync counts
 */
export async function getPendingSyncCounts(): Promise<Record<string, number>> {
  try {
    return {
      locations: db.getFirstSync<{ count: number }>(
        `SELECT COUNT(*) as count FROM locations WHERE synced_at IS NULL`
      )?.count || 0,
      daily_hours: db.getFirstSync<{ count: number }>(
        `SELECT COUNT(*) as count FROM daily_hours WHERE synced_at IS NULL`
      )?.count || 0,
      analytics: db.getFirstSync<{ count: number }>(
        `SELECT COUNT(*) as count FROM analytics_daily WHERE synced_at IS NULL`
      )?.count || 0,
      errors: db.getFirstSync<{ count: number }>(
        `SELECT COUNT(*) as count FROM error_log WHERE synced_at IS NULL`
      )?.count || 0,
      audit: db.getFirstSync<{ count: number }>(
        `SELECT COUNT(*) as count FROM location_audit WHERE synced_at IS NULL`
      )?.count || 0,
    };
  } catch (error) {
    logger.error('database', 'Error getting pending counts', { error: String(error) });
    return { locations: 0, daily_hours: 0, analytics: 0, errors: 0, audit: 0 };
  }
}
