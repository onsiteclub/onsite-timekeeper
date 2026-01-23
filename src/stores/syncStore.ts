/**
 * Sync Store - OnSite Timekeeper V3
 *
 * Handles synchronization between local SQLite and Supabase.
 *
 * SUPABASE TABLES (KRONOS):
 * - app_timekeeper_geofences → local "locations" table
 * - app_timekeeper_entries → local "records" table
 * - app_timekeeper_projects → (not used yet)
 *
 * LOCAL ONLY (no Supabase table):
 * - analytics_daily → marked synced locally
 * - error_log → marked synced locally
 * - location_audit → marked synced locally
 *
 * SYNC TRIGGERS:
 * - On boot (initial sync)
 * - At midnight (daily sync)
 * - After create/edit/delete location
 * - After entry/exit geofence events
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
  // Records
  getRecordsForSync,
  markRecordSynced,
  upsertRecordFromSync,
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
  type RecordDB,
  type AnalyticsDailyDB,
  type ErrorLogDB,
  type LocationAuditDB,
} from '../lib/database';
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
  uploadedRecords: number;
  uploadedAnalytics: number;
  uploadedErrors: number;
  uploadedAudit: number;
  downloadedLocations: number;
  downloadedRecords: number;
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
  syncRecordsOnly: () => Promise<void>;
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
  return new Date().toISOString().split('T')[0];
}

function isMidnight(): boolean {
  const now = new Date();
  return now.getHours() === 0 && now.getMinutes() < 5; // 00:00 - 00:05
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
    logger.info('boot', '🔄 Initializing sync store V2...');

    // ============================================
    // NETWORK LISTENER
    // ============================================
  netInfoUnsubscribe = NetInfo.addEventListener((state) => {
  const online = !!state.isConnected;
  
  // Only log when state actually changes
  if (lastOnlineState !== online) {
    logger.info('sync', `📶 Network: ${online ? 'online' : 'offline'}`);
    lastOnlineState = online;
  }
  
  set({ isOnline: online });
});

    // Initial check
    const state = await NetInfo.fetch();
    const online = !!state.isConnected;
    set({ isOnline: online });

    // ============================================
    // MIDNIGHT SYNC CHECK
    // ============================================
    midnightCheckInterval = setInterval(async () => {
      const today = getTodayDateString();
      
      // If it's midnight and we haven't synced today
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

    // ============================================
    // INITIAL SYNC (if online)
    // ============================================
    if (isSupabaseConfigured() && online) {
      logger.info('sync', '🚀 Running initial sync...');
      try {
        await get().syncNow();
      } catch (error) {
        logger.error('sync', 'Initial sync error', { error: String(error) });
      }
    }

    logger.info('boot', '✅ Sync store V2 initialized');

    // Return cleanup function
    return () => {
      if (netInfoUnsubscribe) netInfoUnsubscribe();
      if (midnightCheckInterval) clearInterval(midnightCheckInterval);
    };
  },

  // ============================================
  // MAIN SYNC
  // ============================================
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

      // Track sync attempt
      await trackMetric(userId, 'sync_attempts');

      // 1. Upload locations
      const locUp = await uploadLocations(userId);
      stats.uploadedLocations = locUp.count;
      stats.errors.push(...locUp.errors);

      // 2. Upload records
      const recUp = await uploadRecords(userId);
      stats.uploadedRecords = recUp.count;
      stats.errors.push(...recUp.errors);

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

      // 7. Download records
      const recDown = await downloadRecords(userId);
      stats.downloadedRecords = recDown.count;
      stats.errors.push(...recDown.errors);

      // Track failures
      if (stats.errors.length > 0) {
        await trackMetric(userId, 'sync_failures');
      }

      set({ 
        lastSyncAt: new Date(),
        lastSyncStats: stats,
      });

      const hasErrors = stats.errors.length > 0;
        logger.info('sync', `${hasErrors ? '⚠️' : '✅'} Sync completed`, {
        up: `${stats.uploadedLocations}L/${stats.uploadedRecords}R/${stats.uploadedAnalytics}A`,
        down: `${stats.downloadedLocations}L/${stats.downloadedRecords}R`,
        errors: stats.errors.length,
      });

      // Reload locations
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

  // ============================================
  // PARTIAL SYNCS
  // ============================================
  syncLocationsOnly: async () => {
    const userId = useAuthStore.getState().getUserId();
    if (!userId) return;
    
    if (!get().isOnline || !isSupabaseConfigured()) return;
    
    await uploadLocations(userId);
    await downloadLocations(userId);
    const { useLocationStore } = require('./locationStore');
await useLocationStore.getState().reloadLocations();
  },

  syncRecordsOnly: async () => {
    const userId = useAuthStore.getState().getUserId();
    if (!userId) return;
    
    if (!get().isOnline || !isSupabaseConfigured()) return;
    
    await uploadRecords(userId);
    await downloadRecords(userId);
  },

  forceFullSync: async () => {
    logger.info('sync', '🔄 Force full sync...');
    set({ isSyncing: false });
    await get().syncNow();
  },

  // ============================================
  // CLEANUP
  // ============================================
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

  // ============================================
  // DEBUG
  // ============================================
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
// UPLOAD FUNCTIONS
// ============================================

function createEmptyStats(): SyncStats {
  return {
    uploadedLocations: 0,
    uploadedRecords: 0,
    uploadedAnalytics: 0,
    uploadedErrors: 0,
    uploadedAudit: 0,
    downloadedLocations: 0,
    downloadedRecords: 0,
    errors: [],
  };
}

async function uploadLocations(userId: string): Promise<{ count: number; errors: string[] }> {
  let count = 0;
  const errors: string[] = [];

  try {
    const locations = await getLocationsForSync(userId);
    logger.info('sync', `[SYNC:geofences] UPLOAD START - ${locations.length} pending`);

    for (const location of locations) {
      try {
        // Map local fields to Supabase app_timekeeper_geofences schema
        // status mapping: local 'deleted' → Supabase 'archived'
        // Allowed values: 'active', 'paused', 'archived'
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
          last_entry_at: location.last_seen_at, // Mapped: last_seen_at → last_entry_at
          created_at: location.created_at,
          updated_at: location.updated_at,
          synced_at: new Date().toISOString(),
        };

        logger.info('sync', `[SYNC:geofences] UPSERT ATTEMPT - ${location.name}`, { payload });

        const { data, error, status, statusText } = await supabase
          .from('app_timekeeper_geofences')
          .upsert(payload)
          .select();

        logger.info('sync', `[SYNC:geofences] UPSERT RESPONSE - status: ${status} ${statusText}`, {
          data,
          error: error ? { message: error.message, code: error.code, details: error.details } : null
        });

        if (error) {
          const errMsg = `Geofence ${location.name}: ${error.message}`;
          errors.push(errMsg);
          logger.error('sync', `[SYNC:geofences] UPLOAD ERROR - ${location.name}: ${error.message} (code: ${error.code})`);
          await captureSyncError(new Error(error.message), { userId, action: 'uploadLocations', locationName: location.name });
        } else if (!data || data.length === 0) {
          // RLS might be blocking silently
          logger.warn('sync', `[SYNC:geofences] UPLOAD WARNING - ${location.name}: No data returned (RLS blocking?)`);
          errors.push(`Geofence ${location.name}: No data returned (possible RLS issue)`);
        } else {
          await markLocationSynced(location.id);
          count++;
          logger.info('sync', `[SYNC:geofences] UPLOAD OK - ${location.name}`);
        }
      } catch (e) {
        const errMsg = `Geofence ${location.name}: ${e}`;
        errors.push(errMsg);
        logger.error('sync', `❌ Upload geofence exception: ${location.name}`, { error: String(e) });
        await captureSyncError(e as Error, { userId, action: 'uploadLocations', locationName: location.name });
      }
    }
  } catch (error) {
    errors.push(String(error));
  }

  return { count, errors };
}

async function uploadRecords(userId: string): Promise<{ count: number; errors: string[] }> {
  let count = 0;
  const errors: string[] = [];

  try {
    const records = await getRecordsForSync(userId);
    logger.info('sync', `[SYNC:entries] UPLOAD START - ${records.length} pending`);

    for (const record of records) {
      try {
        // Calculate duration if exit exists
        let durationMinutes: number | null = null;
        if (record.exit_at && record.entry_at) {
          const entry = new Date(record.entry_at).getTime();
          const exit = new Date(record.exit_at).getTime();
          durationMinutes = Math.round((exit - entry) / 60000) - (record.pause_minutes || 0);
        }

        // Map local fields to Supabase app_timekeeper_entries schema
        // entry_method mapping: local 'automatic' → Supabase 'geofence'
        // Allowed values: 'manual', 'geofence', 'qrcode', 'nfc', 'voice'
        const entryMethod = record.type === 'automatic' ? 'geofence' : record.type;

        const payload = {
          id: record.id,
          user_id: record.user_id,
          geofence_id: record.location_id,        // Mapped: location_id → geofence_id
          geofence_name: record.location_name,    // Mapped: location_name → geofence_name
          entry_at: record.entry_at,
          exit_at: record.exit_at,
          entry_method: entryMethod,              // Mapped: 'automatic' → 'geofence'
          is_manual_entry: entryMethod === 'manual',
          manually_edited: record.manually_edited === 1,
          edit_reason: record.edit_reason,
          integrity_hash: record.integrity_hash,
          device_id: record.device_id,
          pause_minutes: record.pause_minutes || 0,
          duration_minutes: durationMinutes,
          client_created_at: record.created_at,   // Mapped: created_at → client_created_at
          synced_at: new Date().toISOString(),
        };

        logger.info('sync', `[SYNC:entries] UPSERT ATTEMPT - ${record.location_name}`, { payload });

        const { data, error, status, statusText } = await supabase
          .from('app_timekeeper_entries')
          .upsert(payload)
          .select();

        logger.info('sync', `[SYNC:entries] UPSERT RESPONSE - status: ${status} ${statusText}`, {
          data,
          error: error ? { message: error.message, code: error.code, details: error.details } : null
        });

        if (error) {
          errors.push(`Entry: ${error.message}`);
          logger.error('sync', `[SYNC:entries] UPLOAD ERROR - ${record.location_name}: ${error.message}`);
          await captureSyncError(new Error(error.message), { userId, action: 'uploadRecords' });
        } else if (!data || data.length === 0) {
          logger.warn('sync', `[SYNC:entries] UPLOAD WARNING - ${record.location_name}: No data returned (RLS blocking?)`);
          errors.push(`Entry ${record.location_name}: No data returned (possible RLS issue)`);
        } else {
          await markRecordSynced(record.id);
          count++;
          logger.info('sync', `[SYNC:entries] UPLOAD OK - ${record.location_name} (${record.type})`);
        }
      } catch (e) {
        errors.push(`Entry: ${e}`);
        logger.error('sync', `❌ Upload entry exception`, { error: String(e), recordId: record.id });
        await captureSyncError(e as Error, { userId, action: 'uploadRecords' });
      }
    }
  } catch (error) {
    errors.push(String(error));
  }

  return { count, errors };
}

async function uploadAnalytics(userId: string): Promise<{ count: number; errors: string[] }> {
  // NOTE: analytics_daily table doesn't exist in Supabase - mark as synced locally only
  const errors: string[] = [];

  try {
    const analytics = await getAnalyticsForSync(userId);

    if (analytics.length === 0) {
      return { count: 0, errors };
    }

    logger.debug('sync', `[SYNC:analytics] SKIP - table not in Supabase, marking ${analytics.length} days as synced locally`);

    for (const day of analytics) {
      await markAnalyticsSynced(day.date, day.user_id);
    }
  } catch (error) {
    logger.error('sync', '[SYNC:analytics] Error marking local sync', { error: String(error) });
  }

  return { count: 0, errors };
}

async function uploadErrors(): Promise<{ count: number; errors: string[] }> {
  // NOTE: log_errors table doesn't exist in Supabase - mark as synced locally only
  const errors: string[] = [];

  try {
    const errorLogs = await getErrorsForSync(100);

    if (errorLogs.length === 0) {
      return { count: 0, errors };
    }

    logger.debug('sync', `[SYNC:errors] SKIP - table not in Supabase, marking ${errorLogs.length} items as synced locally`);

    const idsToMark = errorLogs.map(err => err.id);
    await markErrorsSynced(idsToMark);
  } catch (error) {
    logger.error('sync', '[SYNC:errors] Error marking local sync', { error: String(error) });
  }

  return { count: 0, errors };
}

async function uploadAudit(userId: string): Promise<{ count: number; errors: string[] }> {
  // NOTE: log_locations table doesn't exist in Supabase - mark as synced locally only
  const errors: string[] = [];

  try {
    const audits = await getAuditForSync(userId, 100);

    if (audits.length === 0) {
      return { count: 0, errors };
    }

    logger.debug('sync', `[SYNC:audit] SKIP - table not in Supabase, marking ${audits.length} items as synced locally`);

    const idsToMark = audits.map(audit => audit.id);
    await markAuditSynced(idsToMark);
  } catch (error) {
    logger.error('sync', '[SYNC:audit] Error marking local sync', { error: String(error) });
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
      logger.error('sync', `❌ Download geofences failed`, { error: error.message, code: error.code });
      return { count, errors };
    }

    logger.debug('sync', `📥 ${data?.length || 0} geofences from Supabase`);

    for (const remote of data || []) {
      try {
        // Map Supabase app_timekeeper_geofences to local schema
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
          last_seen_at: remote.last_entry_at,  // Mapped: last_entry_at → last_seen_at
          created_at: remote.created_at,
          updated_at: remote.updated_at,
          synced_at: new Date().toISOString(),
        });
        count++;
      } catch (e) {
        errors.push(`Geofence ${remote.name}: ${e}`);
        logger.error('sync', `❌ Upsert geofence failed: ${remote.name}`, { error: String(e) });
      }
    }

    // After downloading locations, ensure monitoring is started if needed
    if (count > 0) {
      const { useLocationStore } = require('./locationStore');
      await useLocationStore.getState().reloadLocations(); // Reload from SQLite first!
      const { locations, isMonitoring, startMonitoring } = useLocationStore.getState();

      if (locations.length > 0 && !isMonitoring) {
        logger.info('sync', '🚀 Starting monitoring after download...');
        setReconfiguring(true); // Abre janela
        await startMonitoring();

        // Fecha janela após 1s para permitir eventos iniciais serem queued
        setTimeout(() => {
          setReconfiguring(false);
          logger.debug('geofence', '🔓 Reconfigure window closed');
        }, 1000);
      }
    }
  } catch (error) {
    errors.push(String(error));
    logger.error('sync', `❌ Download geofences exception`, { error: String(error) });
  }

  return { count, errors };
}
async function downloadRecords(userId: string): Promise<{ count: number; errors: string[] }> {
  let count = 0;
  const errors: string[] = [];

  try {
    const { data, error } = await supabase
      .from('app_timekeeper_entries')
      .select('*')
      .eq('user_id', userId);

    if (error) {
      errors.push(error.message);
      logger.error('sync', `❌ Download entries failed`, { error: error.message, code: error.code });
      return { count, errors };
    }

    logger.debug('sync', `📥 ${data?.length || 0} entries from Supabase`);

    for (const remote of data || []) {
      try {
        // Map Supabase app_timekeeper_entries to local schema
        await upsertRecordFromSync({
          id: remote.id,
          user_id: remote.user_id,
          location_id: remote.geofence_id,        // Mapped: geofence_id → location_id
          location_name: remote.geofence_name,    // Mapped: geofence_name → location_name
          entry_at: remote.entry_at,
          exit_at: remote.exit_at,
          type: remote.entry_method || (remote.is_manual_entry ? 'manual' : 'automatic'),  // Mapped: entry_method → type
          manually_edited: remote.manually_edited ? 1 : 0,
          edit_reason: remote.edit_reason,
          integrity_hash: remote.integrity_hash,
          device_id: remote.device_id,
          pause_minutes: remote.pause_minutes || 0,
          color: null,  // Not in new schema
          created_at: remote.client_created_at || remote.created_at,  // Mapped: client_created_at → created_at
          synced_at: new Date().toISOString(),
        });
        count++;
      } catch (e) {
        errors.push(`Entry: ${e}`);
        logger.error('sync', `❌ Upsert entry failed`, { error: String(e), recordId: remote.id });
      }
    }
  } catch (error) {
    errors.push(String(error));
    logger.error('sync', `❌ Download entries exception`, { error: String(error) });
  }

  return { count, errors };
}
