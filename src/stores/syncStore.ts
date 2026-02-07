/**
 * Sync Store - OnSite Timekeeper V3
 *
 * Handles synchronization between local SQLite and Supabase.
 *
 * SUPABASE TABLES (bi-directional sync):
 * - app_timekeeper_geofences → local "locations" table
 * - daily_hours → local "daily_hours" table
 *
 * LOCAL ONLY (marked synced locally):
 * - analytics_daily
 * - error_log
 * - location_audit
 *
 * SYNC TRIGGERS:
 * - On boot (initial sync)
 * - At midnight (daily sync)
 * - After confirmed geofence exit
 */

import { create } from 'zustand';
import NetInfo from '@react-native-community/netinfo';
import { logger } from '../lib/logger';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import {
  // Locations
  getLocationsForSync,
  markLocationSynced,
  upsertLocationFromSync,
  // Analytics
  getAnalyticsForSync,
  markAnalyticsSynced,
  cleanOldAnalytics,
  trackMetric,
  // Errors
  getErrorsForSync,
  markErrorsSynced,
  cleanOldErrors,
  captureSyncError,
  // Audit
  getAuditForSync,
  markAuditSynced,
  cleanOldAudit,
  // Types
  type LocationDB,
  type AnalyticsDailyDB,
  type ErrorLogDB,
  type LocationAuditDB,
} from '../lib/database';
import {
  getUnsyncedDailyHours,
  markDailyHoursSynced,
  upsertDailyHoursFromSync,
  type DailyHoursEntry,
} from '../lib/database/daily';
import { useAuthStore } from './authStore';
import { setReconfiguring } from '../lib/geofenceLogic';

// ============================================
// CONSTANTS
// ============================================

const MIDNIGHT_CHECK_INTERVAL = 60 * 1000; // Check every minute
const CLEANUP_DAYS = {
  analytics: 30,
  errors: 14,
  audit: 90,
};

// ============================================
// TYPES
// ============================================

interface SyncStats {
  uploadedLocations: number;
  uploadedDailyHours: number;
  uploadedAnalytics: number;
  uploadedErrors: number;
  uploadedAudit: number;
  downloadedLocations: number;
  downloadedDailyHours: number;
  errors: string[];
}

interface SyncState {
  isSyncing: boolean;
  lastSyncAt: Date | null;
  isOnline: boolean;
  lastSyncStats: SyncStats | null;
  syncEnabled: boolean;

  // Actions
  initialize: () => Promise<() => void>;
  syncNow: () => Promise<SyncStats>;
  syncLocationsOnly: () => Promise<void>;
  forceFullSync: () => Promise<void>;
  runCleanup: () => Promise<void>;
  toggleSync: () => void;

  // Debug
  debugSync: () => Promise<{ success: boolean; stats?: any }>;
}

// ============================================
// TIMERS
// ============================================

let midnightCheckInterval: ReturnType<typeof setInterval> | null = null;
let netInfoUnsubscribe: (() => void) | null = null;
let lastSyncDate: string | null = null;
let lastOnlineState: boolean | null = null;

// ============================================
// HELPERS
// ============================================

function getTodayDateString(): string {
  // Use local date, not UTC (toISOString returns UTC)
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function isMidnight(): boolean {
  const now = new Date();
  return now.getHours() === 0 && now.getMinutes() < 5;
}

// ============================================
// STORE
// ============================================

export const useSyncStore = create<SyncState>((set, get) => ({
  isSyncing: false,
  lastSyncAt: null,
  isOnline: true,
  lastSyncStats: null,
  syncEnabled: true,

  initialize: async () => {
    logger.info('boot', '🔄 Initializing sync store...');

    // Network listener
    netInfoUnsubscribe = NetInfo.addEventListener((state) => {
      const online = !!state.isConnected;

      if (lastOnlineState !== online) {
        logger.info('sync', `📶 Network: ${online ? 'online' : 'offline'}`);
        lastOnlineState = online;
      }

      set({ isOnline: online });
    });

    const state = await NetInfo.fetch();
    const online = !!state.isConnected;
    set({ isOnline: online });

    // Midnight sync check
    midnightCheckInterval = setInterval(async () => {
      const today = getTodayDateString();

      if (isMidnight() && lastSyncDate !== today) {
        const { isOnline, syncEnabled, isSyncing } = get();

        if (isOnline && syncEnabled && !isSyncing) {
          logger.info('sync', '🌙 Midnight sync triggered');
          lastSyncDate = today;
          await get().syncNow();
          await get().runCleanup();
        }
      }
    }, MIDNIGHT_CHECK_INTERVAL);

    // Initial sync
    if (isSupabaseConfigured() && online) {
      logger.info('sync', '🚀 Running initial sync...');
      try {
        await get().syncNow();
      } catch (error) {
        logger.error('sync', 'Initial sync error', { error: String(error) });
      }
    }

    logger.info('boot', '✅ Sync store initialized');

    return () => {
      if (netInfoUnsubscribe) netInfoUnsubscribe();
      if (midnightCheckInterval) clearInterval(midnightCheckInterval);
    };
  },

  syncNow: async () => {
    const { isSyncing, isOnline } = get();

    if (isSyncing) {
      logger.warn('sync', 'Sync already in progress');
      return get().lastSyncStats || createEmptyStats();
    }

    if (!isSupabaseConfigured()) {
      logger.warn('sync', '⚠️ Supabase not configured');
      return createEmptyStats();
    }

    if (!isOnline) {
      logger.warn('sync', '⚠️ Offline - skipping sync');
      return createEmptyStats();
    }

    const userId = useAuthStore.getState().getUserId();
    if (!userId) {
      logger.warn('sync', '⚠️ User not authenticated');
      return createEmptyStats();
    }

    set({ isSyncing: true, lastSyncStats: null });

    const stats: SyncStats = createEmptyStats();

    try {
      logger.info('sync', '🔄 Starting sync...');

      await trackMetric(userId, 'sync_attempts');

      // 1. Upload locations
      const locUp = await uploadLocations(userId);
      stats.uploadedLocations = locUp.count;
      stats.errors.push(...locUp.errors);

      // 2. Upload daily_hours (mark as synced locally for now)
      const dhUp = await uploadDailyHours(userId);
      stats.uploadedDailyHours = dhUp.count;
      stats.errors.push(...dhUp.errors);

      // 3. Upload analytics
      const anaUp = await uploadAnalytics(userId);
      stats.uploadedAnalytics = anaUp.count;
      stats.errors.push(...anaUp.errors);

      // 4. Upload errors
      const errUp = await uploadErrors();
      stats.uploadedErrors = errUp.count;
      stats.errors.push(...errUp.errors);

      // 5. Upload audit
      const audUp = await uploadAudit(userId);
      stats.uploadedAudit = audUp.count;
      stats.errors.push(...audUp.errors);

      // 6. Download locations
      const locDown = await downloadLocations(userId);
      stats.downloadedLocations = locDown.count;
      stats.errors.push(...locDown.errors);

      // 7. Download daily_hours (for multi-device sync)
      const dhDown = await downloadDailyHours(userId);
      stats.downloadedDailyHours = dhDown.count;
      stats.errors.push(...dhDown.errors);

      if (stats.errors.length > 0) {
        await trackMetric(userId, 'sync_failures');
      }

      set({
        lastSyncAt: new Date(),
        lastSyncStats: stats,
      });

      const hasErrors = stats.errors.length > 0;
      logger.info('sync', `${hasErrors ? '⚠️' : '✅'} Sync completed`, {
        up: `${stats.uploadedLocations}L/${stats.uploadedDailyHours}D/${stats.uploadedAnalytics}A`,
        down: `${stats.downloadedLocations}L/${stats.downloadedDailyHours}D`,
        errors: stats.errors.length,
      });

      const { useLocationStore } = require('./locationStore');
      await useLocationStore.getState().reloadLocations();
      return stats;

    } catch (error) {
      const errorMsg = String(error);
      logger.error('sync', '❌ Sync error', { error: errorMsg });
      stats.errors.push(errorMsg);
      await captureSyncError(error as Error, { userId, action: 'syncNow' });
      set({ lastSyncStats: stats });
      return stats;
    } finally {
      set({ isSyncing: false });
    }
  },

  syncLocationsOnly: async () => {
    const userId = useAuthStore.getState().getUserId();
    if (!userId) return;

    if (!get().isOnline || !isSupabaseConfigured()) return;

    await uploadLocations(userId);
    await downloadLocations(userId);
    const { useLocationStore } = require('./locationStore');
    await useLocationStore.getState().reloadLocations();
  },

  forceFullSync: async () => {
    logger.info('sync', '🔄 Force full sync...');
    set({ isSyncing: false });
    await get().syncNow();
  },

  runCleanup: async () => {
    try {
      logger.info('sync', '🧹 Running cleanup...');

      const analyticsDeleted = await cleanOldAnalytics(CLEANUP_DAYS.analytics);
      const errorsDeleted = await cleanOldErrors(CLEANUP_DAYS.errors);
      const auditDeleted = await cleanOldAudit(CLEANUP_DAYS.audit);

      logger.info('sync', '✅ Cleanup completed', {
        analytics: analyticsDeleted,
        errors: errorsDeleted,
        audit: auditDeleted,
      });
    } catch (error) {
      logger.error('sync', '❌ Cleanup error', { error: String(error) });
    }
  },

  toggleSync: () => {
    const newValue = !get().syncEnabled;
    set({ syncEnabled: newValue });
    logger.info('sync', `Sync ${newValue ? 'enabled' : 'disabled'}`);
  },

  debugSync: async () => {
    const netState = await NetInfo.fetch();
    const userId = useAuthStore.getState().getUserId();

    return {
      success: true,
      stats: {
        network: {
          isConnected: netState.isConnected,
          isInternetReachable: netState.isInternetReachable,
        },
        store: {
          isOnline: get().isOnline,
          isSyncing: get().isSyncing,
          syncEnabled: get().syncEnabled,
          lastSyncAt: get().lastSyncAt?.toISOString() || null,
        },
        supabase: {
          isConfigured: isSupabaseConfigured(),
        },
        auth: {
          userId: userId || 'NOT AUTHENTICATED',
        },
        lastStats: get().lastSyncStats,
      },
    };
  },
}));

// ============================================
// HELPERS
// ============================================

function createEmptyStats(): SyncStats {
  return {
    uploadedLocations: 0,
    uploadedDailyHours: 0,
    uploadedAnalytics: 0,
    uploadedErrors: 0,
    uploadedAudit: 0,
    downloadedLocations: 0,
    downloadedDailyHours: 0,
    errors: [],
  };
}

// ============================================
// UPLOAD FUNCTIONS
// ============================================

async function uploadLocations(userId: string): Promise<{ count: number; errors: string[] }> {
  let count = 0;
  const errors: string[] = [];

  try {
    const locations = await getLocationsForSync(userId);
    logger.info('sync', `[SYNC:geofences] ${locations.length} pending`);

    for (const location of locations) {
      try {
        const statusMapped = location.status === 'deleted' ? 'archived' : location.status;

        const payload = {
          id: location.id,
          user_id: location.user_id,
          name: location.name,
          latitude: location.latitude,
          longitude: location.longitude,
          radius: location.radius,
          color: location.color,
          status: statusMapped,
          deleted_at: location.deleted_at,
          last_entry_at: location.last_seen_at,
          created_at: location.created_at,
          updated_at: location.updated_at,
          synced_at: new Date().toISOString(),
        };

        const { data, error } = await supabase
          .from('app_timekeeper_geofences')
          .upsert(payload)
          .select();

        if (error) {
          errors.push(`Geofence ${location.name}: ${error.message}`);
          await captureSyncError(new Error(error.message), { userId, action: 'uploadLocations' });
        } else if (!data || data.length === 0) {
          errors.push(`Geofence ${location.name}: No data returned`);
        } else {
          await markLocationSynced(location.id);
          count++;
        }
      } catch (e) {
        errors.push(`Geofence ${location.name}: ${e}`);
        await captureSyncError(e as Error, { userId, action: 'uploadLocations' });
      }
    }
  } catch (error) {
    errors.push(String(error));
  }

  return { count, errors };
}

async function uploadDailyHours(userId: string): Promise<{ count: number; errors: string[] }> {
  let count = 0;
  const errors: string[] = [];

  try {
    const dailyHours = getUnsyncedDailyHours(userId);

    if (dailyHours.length === 0) {
      return { count: 0, errors };
    }

    logger.info('sync', `[SYNC:daily_hours] ${dailyHours.length} pending`);

    for (const day of dailyHours) {
      try {
        // FIX: Supabase column is 'work_date' (not 'date'), and 'type' column exists
        const payload = {
          id: day.id,
          user_id: day.user_id,
          work_date: day.date, // LOCAL 'date' → SUPABASE 'work_date'
          total_minutes: day.total_minutes,
          break_minutes: day.break_minutes,
          location_name: day.location_name,
          location_id: day.location_id,
          verified: day.verified, // Already boolean from DailyHoursEntry
          source: day.source,
          type: day.type || 'work', // Now included (Supabase has this column)
          first_entry: day.first_entry,
          last_exit: day.last_exit,
          notes: day.notes,
          created_at: day.created_at,
          updated_at: day.updated_at,
          synced_at: new Date().toISOString(),
        };

        const { data, error } = await supabase
          .from('daily_hours')
          .upsert(payload, { onConflict: 'user_id,work_date' })
          .select();

        if (error) {
          errors.push(`DailyHours ${day.date}: ${error.message}`);
          await captureSyncError(new Error(error.message), { userId, action: 'uploadDailyHours' });
        } else if (!data || data.length === 0) {
          errors.push(`DailyHours ${day.date}: No data returned`);
        } else {
          markDailyHoursSynced(userId, day.date);
          count++;
        }
      } catch (e) {
        errors.push(`DailyHours ${day.date}: ${e}`);
        await captureSyncError(e as Error, { userId, action: 'uploadDailyHours' });
      }
    }
  } catch (error) {
    logger.error('sync', '[SYNC:daily_hours] Error', { error: String(error) });
    errors.push(String(error));
  }

  return { count, errors };
}

async function uploadAnalytics(userId: string): Promise<{ count: number; errors: string[] }> {
  const errors: string[] = [];

  try {
    const analytics = await getAnalyticsForSync(userId);

    if (analytics.length === 0) {
      return { count: 0, errors };
    }

    for (const day of analytics) {
      await markAnalyticsSynced(day.date, day.user_id);
    }
  } catch (error) {
    logger.error('sync', '[SYNC:analytics] Error', { error: String(error) });
  }

  return { count: 0, errors };
}

async function uploadErrors(): Promise<{ count: number; errors: string[] }> {
  const errors: string[] = [];

  try {
    const errorLogs = await getErrorsForSync(100);

    if (errorLogs.length === 0) {
      return { count: 0, errors };
    }

    const idsToMark = errorLogs.map(err => err.id);
    await markErrorsSynced(idsToMark);
  } catch (error) {
    logger.error('sync', '[SYNC:errors] Error', { error: String(error) });
  }

  return { count: 0, errors };
}

async function uploadAudit(userId: string): Promise<{ count: number; errors: string[] }> {
  const errors: string[] = [];

  try {
    const audits = await getAuditForSync(userId, 100);

    if (audits.length === 0) {
      return { count: 0, errors };
    }

    const idsToMark = audits.map(audit => audit.id);
    await markAuditSynced(idsToMark);
  } catch (error) {
    logger.error('sync', '[SYNC:audit] Error', { error: String(error) });
  }

  return { count: 0, errors };
}

// ============================================
// DOWNLOAD FUNCTIONS
// ============================================

async function downloadLocations(userId: string): Promise<{ count: number; errors: string[] }> {
  let count = 0;
  const errors: string[] = [];

  try {
    const { data, error } = await supabase
      .from('app_timekeeper_geofences')
      .select('*')
      .eq('user_id', userId);

    if (error) {
      errors.push(error.message);
      logger.error('sync', `❌ Download geofences failed`, { error: error.message });
      return { count, errors };
    }

    logger.debug('sync', `📥 ${data?.length || 0} geofences from Supabase`);

    for (const remote of data || []) {
      try {
        await upsertLocationFromSync({
          id: remote.id,
          user_id: remote.user_id,
          name: remote.name,
          latitude: remote.latitude,
          longitude: remote.longitude,
          radius: remote.radius,
          color: remote.color,
          status: remote.status,
          deleted_at: remote.deleted_at,
          last_seen_at: remote.last_entry_at,
          created_at: remote.created_at,
          updated_at: remote.updated_at,
          synced_at: new Date().toISOString(),
        });
        count++;
      } catch (e) {
        errors.push(`Geofence ${remote.name}: ${e}`);
      }
    }

    if (count > 0) {
      const { useLocationStore } = require('./locationStore');
      await useLocationStore.getState().reloadLocations();
      const { locations, isMonitoring, startMonitoring } = useLocationStore.getState();

      if (locations.length > 0 && !isMonitoring) {
        logger.info('sync', '🚀 Starting monitoring after download...');
        setReconfiguring(true);
        await startMonitoring();

        setTimeout(() => {
          setReconfiguring(false);
        }, 1000);
      }
    }
  } catch (error) {
    errors.push(String(error));
    logger.error('sync', `❌ Download geofences exception`, { error: String(error) });
  }

  return { count, errors };
}

async function downloadDailyHours(userId: string): Promise<{ count: number; errors: string[] }> {
  let count = 0;
  const errors: string[] = [];

  try {
    const { data, error } = await supabase
      .from('daily_hours')
      .select('*')
      .eq('user_id', userId);

    if (error) {
      errors.push(error.message);
      logger.error('sync', `❌ Download daily_hours failed`, { error: error.message });
      return { count, errors };
    }

    logger.debug('sync', `📥 ${data?.length || 0} daily_hours from Supabase`);

    for (const remote of data || []) {
      try {
        // FIX: Supabase column is 'work_date' (not 'date'), and 'type' exists in Supabase
        upsertDailyHoursFromSync({
          id: remote.id,
          user_id: remote.user_id,
          date: remote.work_date, // SUPABASE 'work_date' → LOCAL 'date'
          total_minutes: remote.total_minutes,
          break_minutes: remote.break_minutes || 0,
          location_name: remote.location_name,
          location_id: remote.location_id,
          verified: remote.verified ? 1 : 0,
          source: remote.source || 'manual',
          type: remote.type || 'work', // Now read from Supabase
          first_entry: remote.first_entry,
          last_exit: remote.last_exit,
          notes: remote.notes,
          created_at: remote.created_at,
          updated_at: remote.updated_at,
          synced_at: new Date().toISOString(),
        });
        count++;
      } catch (e) {
        errors.push(`DailyHours ${remote.work_date}: ${e}`);
      }
    }

    // Reload dailyLogStore if we downloaded data
    if (count > 0) {
      const { useDailyLogStore } = require('./dailyLogStore');
      await useDailyLogStore.getState().reloadToday();
      await useDailyLogStore.getState().reloadWeek();
    }
  } catch (error) {
    errors.push(String(error));
    logger.error('sync', `❌ Download daily_hours exception`, { error: String(error) });
  }

  return { count, errors };
}
