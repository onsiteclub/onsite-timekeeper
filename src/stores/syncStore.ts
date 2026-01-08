/**
 * Sync Store - OnSite Timekeeper
 * 
 * MODIFIED: 
 * - Adds batch telemetry sync
 * - Tracks sync success/failure in telemetry
 */

import { create } from 'zustand';
import NetInfo from '@react-native-community/netinfo';
import { logger } from '../lib/logger';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import {
  getLocaisParaSync,
  getRegistrosParaSync,
  marcarLocalSincronizado,
  marcarRegistroSincronizado,
  upsertLocalFromSync,
  upsertRegistroFromSync,
  // Telemetry
  getTelemetriaParaSync,
  marcarTelemetriaSincronizada,
  limparTelemetriaAntiga,
  incrementarTelemetria,
  getTelemetriaStats,
  limparHeartbeatsAntigos,
  limparGeopontosAntigos,
} from '../lib/database';
import { useAuthStore } from './authStore';
import { useLocationStore } from './locationStore';

// ============================================
// CONSTANTS
// ============================================

const SYNC_INTERVAL = 5 * 60 * 1000; // 5 minutes - business data
const TELEMETRY_SYNC_INTERVAL = 60 * 60 * 1000; // 1 hour - telemetry (only uploads previous days)
const CLEANUP_INTERVAL = 24 * 60 * 60 * 1000; // 24 hours - cleanup

// ============================================
// TYPES
// ============================================

interface SyncStats {
  uploadedLocations: number;
  uploadedRecords: number;
  downloadedLocations: number;
  downloadedRecords: number;
  uploadedTelemetry: number;
  errors: string[];
  
  // Legacy aliases
  uploadedLocais: number;
  uploadedRegistros: number;
  downloadedLocais: number;
  downloadedRegistros: number;
}

interface SyncState {
  isSyncing: boolean;
  lastSyncAt: Date | null;
  lastTelemetrySyncAt: Date | null;
  isOnline: boolean;
  autoSyncEnabled: boolean;
  lastSyncStats: SyncStats | null;

  initialize: () => Promise<() => void>;
  syncNow: () => Promise<void>;
  syncTelemetry: () => Promise<void>;
  forceFullSync: () => Promise<void>;
  debugSync: () => Promise<{ success: boolean; error?: string; stats?: any }>;
  toggleAutoSync: () => void;
  syncLocations: () => Promise<void>;
  syncRecords: () => Promise<void>;
  reconcileOnBoot: () => Promise<void>;
  runCleanup: () => Promise<void>;

  // Legacy method aliases
  syncLocais: () => Promise<void>;
  syncRegistros: () => Promise<void>;
  reconciliarNoBoot: () => Promise<void>;
}

// ============================================
// TIMERS
// ============================================

let syncInterval: ReturnType<typeof setInterval> | null = null;
let telemetrySyncInterval: ReturnType<typeof setInterval> | null = null;
let cleanupInterval: ReturnType<typeof setInterval> | null = null;
let netInfoUnsubscribe: (() => void) | null = null;

// ============================================
// STORE
// ============================================

export const useSyncStore = create<SyncState>((set, get) => ({
  isSyncing: false,
  lastSyncAt: null,
  lastTelemetrySyncAt: null,
  isOnline: true,
  autoSyncEnabled: true,
  lastSyncStats: null,

  initialize: async () => {
    logger.info('boot', '🔄 Initializing sync store...');

    // Connectivity listener
    netInfoUnsubscribe = NetInfo.addEventListener((state) => {
      const online = !!state.isConnected;
      
      logger.info('sync', `📶 NetInfo: connected=${state.isConnected}, online=${online}`);
      set({ isOnline: online });

      // If came online and auto-sync is active, sync
      if (online && get().autoSyncEnabled && !get().isSyncing) {
        get().syncNow();
      }
    });

    // Initial check
    const state = await NetInfo.fetch();
    const online = !!state.isConnected;
    
    logger.info('sync', `📶 Initial connection: connected=${state.isConnected}, online=${online}`);
    set({ isOnline: online });

    // ============================================
    // INTERVAL: Business data (5 min)
    // ============================================
    syncInterval = setInterval(() => {
      const { isOnline, autoSyncEnabled, isSyncing } = get();
      if (isOnline && autoSyncEnabled && !isSyncing) {
        logger.debug('sync', '⏰ Auto-sync triggered');
        get().syncNow();
      }
    }, SYNC_INTERVAL);

    // ============================================
    // INTERVAL: Telemetry (1 hour)
    // ============================================
    telemetrySyncInterval = setInterval(() => {
      const { isOnline, autoSyncEnabled } = get();
      if (isOnline && autoSyncEnabled) {
        logger.debug('sync', '⏰ Telemetry sync triggered');
        get().syncTelemetry();
      }
    }, TELEMETRY_SYNC_INTERVAL);

    // ============================================
    // INTERVAL: Cleanup (24 hours)
    // ============================================
    cleanupInterval = setInterval(() => {
      get().runCleanup();
    }, CLEANUP_INTERVAL);

    // Initial sync
    if (isSupabaseConfigured()) {
      logger.info('sync', '🚀 Starting boot sync...');
      try {
        await get().syncNow();
        // Also sync telemetry on boot
        await get().syncTelemetry();
      } catch (error) {
        logger.error('sync', 'Boot sync error', { error: String(error) });
      }
    }

    logger.info('boot', '✅ Sync store initialized', { online });

    // Return cleanup function
    return () => {
      if (netInfoUnsubscribe) netInfoUnsubscribe();
      if (syncInterval) clearInterval(syncInterval);
      if (telemetrySyncInterval) clearInterval(telemetrySyncInterval);
      if (cleanupInterval) clearInterval(cleanupInterval);
    };
  },

  // ============================================
  // BUSINESS DATA SYNC (immediate)
  // ============================================
  syncNow: async () => {
    const { isSyncing } = get();
    
    if (isSyncing) {
      logger.warn('sync', 'Sync already in progress');
      return;
    }

    if (!isSupabaseConfigured()) {
      logger.warn('sync', '⚠️ Supabase not configured');
      return;
    }

    const userId = useAuthStore.getState().getUserId();
    if (!userId) {
      logger.warn('sync', '⚠️ User not authenticated');
      return;
    }

    set({ isSyncing: true, lastSyncStats: null });

    const stats: SyncStats = {
      uploadedLocations: 0,
      uploadedRecords: 0,
      downloadedLocations: 0,
      downloadedRecords: 0,
      uploadedTelemetry: 0,
      errors: [],
      // Legacy aliases
      uploadedLocais: 0,
      uploadedRegistros: 0,
      downloadedLocais: 0,
      downloadedRegistros: 0,
    };

    try {
      logger.info('sync', '🔄 Starting business sync...');

      // Increment sync attempt in telemetry
      await incrementarTelemetria(userId, 'sync_attempts');

      // 1. Upload locations
      const locationsUp = await uploadLocations(userId);
      stats.uploadedLocations = locationsUp.count;
      stats.uploadedLocais = locationsUp.count;
      stats.errors.push(...locationsUp.errors);

      // 2. Upload records
      const recordsUp = await uploadRecords(userId);
      stats.uploadedRecords = recordsUp.count;
      stats.uploadedRegistros = recordsUp.count;
      stats.errors.push(...recordsUp.errors);

      // 3. Download locations
      const locationsDown = await downloadLocations(userId);
      stats.downloadedLocations = locationsDown.count;
      stats.downloadedLocais = locationsDown.count;
      stats.errors.push(...locationsDown.errors);

      // 4. Download records
      const recordsDown = await downloadRecords(userId);
      stats.downloadedRecords = recordsDown.count;
      stats.downloadedRegistros = recordsDown.count;
      stats.errors.push(...recordsDown.errors);

      // If there were errors, increment failures in telemetry
      if (stats.errors.length > 0) {
        await incrementarTelemetria(userId, 'sync_failures');
      }

      set({ 
        lastSyncAt: new Date(),
        lastSyncStats: stats,
        isOnline: true,
      });

      logger.info('sync', '✅ Business sync completed', {
        up: `${stats.uploadedLocations}L/${stats.uploadedRecords}R`,
        down: `${stats.downloadedLocations}L/${stats.downloadedRecords}R`,
        errors: stats.errors.length,
      });

      // Reload locations
      await useLocationStore.getState().reloadLocations();

    } catch (error) {
      logger.error('sync', '❌ Sync error', { error: String(error) });
      
      // Increment failure in telemetry
      await incrementarTelemetria(userId, 'sync_failures');
      
      set({ 
        lastSyncStats: {
          ...stats,
          errors: [String(error)],
        }
      });
    } finally {
      set({ isSyncing: false });
    }
  },

  // ============================================
  // TELEMETRY SYNC (batch)
  // ============================================
  syncTelemetry: async () => {
    if (!isSupabaseConfigured()) return;

    const userId = useAuthStore.getState().getUserId();
    if (!userId) return;

    try {
      logger.info('sync', '📊 Starting telemetry sync...');

      // Get pending days
      const pendingDays = await getTelemetriaParaSync(userId);
      
      if (pendingDays.length === 0) {
        logger.debug('sync', 'No pending telemetry');
        set({ lastTelemetrySyncAt: new Date() });
        return;
      }

      logger.info('sync', `📊 ${pendingDays.length} telemetry days to sync`);

      let syncedCount = 0;

      for (const day of pendingDays) {
        try {
          // Calculate averages
          const geofence_accuracy_avg = day.geofence_accuracy_count > 0
            ? day.geofence_accuracy_sum / day.geofence_accuracy_count
            : null;
          
          const battery_level_avg = day.battery_level_count > 0
            ? day.battery_level_sum / day.battery_level_count
            : null;

          // Upsert to Supabase
          const { error } = await supabase.from('timekeeper_telemetry_daily').upsert({
            user_id: userId,
            date: day.date,
            app_opens: day.app_opens,
            manual_entries_count: day.manual_entries_count,
            geofence_entries_count: day.geofence_entries_count,
            geofence_triggers: day.geofence_triggers,
            geofence_accuracy_avg,
            background_location_checks: day.background_location_checks,
            battery_level_avg,
            offline_entries_count: day.offline_entries_count,
            sync_attempts: day.sync_attempts,
            sync_failures: day.sync_failures,
          }, {
            onConflict: 'user_id,date',
          });

          if (error) {
            logger.error('sync', `❌ Error syncing telemetry ${day.date}`, { error: error.message });
            continue;
          }

          // Mark as synced locally
          await marcarTelemetriaSincronizada(day.date, userId);
          syncedCount++;
          
          logger.debug('sync', `✅ Telemetry ${day.date} synced`);
        } catch (e) {
          logger.error('sync', `❌ Exception syncing telemetry ${day.date}`, { error: String(e) });
        }
      }

      set({ lastTelemetrySyncAt: new Date() });

      logger.info('sync', `✅ Telemetry synced: ${syncedCount}/${pendingDays.length} days`);

    } catch (error) {
      logger.error('sync', '❌ Telemetry sync error', { error: String(error) });
    }
  },

  // ============================================
  // CLEANUP (old data)
  // ============================================
  runCleanup: async () => {
    try {
      logger.info('sync', '🧹 Running cleanup...');

      // Clean old local telemetry (already synced, > 7 days)
      const telemetryCleaned = await limparTelemetriaAntiga(7);

      // Clean old heartbeats (> 30 days)
      const heartbeatsCleaned = await limparHeartbeatsAntigos(30);

      // Clean old geopoints (> 90 days)
      const geopointsCleaned = await limparGeopontosAntigos(90);

      logger.info('sync', '✅ Cleanup completed', {
        telemetry: telemetryCleaned,
        heartbeats: heartbeatsCleaned,
        geopoints: geopointsCleaned,
      });
    } catch (error) {
      logger.error('sync', '❌ Cleanup error', { error: String(error) });
    }
  },

  forceFullSync: async () => {
    logger.info('sync', '🔄 Forcing full sync...');
    set({ isSyncing: false, isOnline: true });
    await get().syncNow();
    await get().syncTelemetry();
  },

  debugSync: async () => {
    const netState = await NetInfo.fetch();
    const userId = useAuthStore.getState().getUserId();
    
    // Include telemetry stats
    const telemetryStats = userId ? await getTelemetriaStats(userId) : null;
    
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
          lastSyncAt: get().lastSyncAt?.toISOString() || null,
          lastTelemetrySyncAt: get().lastTelemetrySyncAt?.toISOString() || null,
        },
        supabase: {
          isConfigured: isSupabaseConfigured(),
        },
        auth: {
          userId: userId || 'NOT AUTHENTICATED',
        },
        telemetry: telemetryStats,
      },
    };
  },

  toggleAutoSync: () => {
    const newValue = !get().autoSyncEnabled;
    set({ autoSyncEnabled: newValue });
    logger.info('sync', `Auto-sync ${newValue ? 'enabled' : 'disabled'}`);
  },

  syncLocations: async () => {
    const userId = useAuthStore.getState().getUserId();
    if (!userId) return;
    await uploadLocations(userId);
    await downloadLocations(userId);
    await useLocationStore.getState().reloadLocations();
  },

  syncRecords: async () => {
    const userId = useAuthStore.getState().getUserId();
    if (!userId) return;
    await uploadRecords(userId);
    await downloadRecords(userId);
  },

  reconcileOnBoot: async () => {
    const userId = useAuthStore.getState().getUserId();
    if (!userId) return;
    await downloadLocations(userId);
    await downloadRecords(userId);
    await useLocationStore.getState().reloadLocations();
  },

  // ============================================
  // LEGACY METHOD ALIASES
  // ============================================
  syncLocais: async () => get().syncLocations(),
  syncRegistros: async () => get().syncRecords(),
  reconciliarNoBoot: async () => get().reconcileOnBoot(),
}));

// ============================================
// UPLOAD/DOWNLOAD FUNCTIONS
// ============================================

async function uploadLocations(userId: string): Promise<{ count: number; errors: string[] }> {
  let count = 0;
  const errors: string[] = [];

  try {
    const locations = await getLocaisParaSync(userId);
    logger.info('sync', `📤 ${locations.length} locations pending`);

    for (const location of locations) {
      try {
        const { error } = await supabase.from('locais').upsert({
          id: location.id,
          user_id: location.user_id,
          nome: location.nome,
          latitude: location.latitude,
          longitude: location.longitude,
          raio: location.raio,
          cor: location.cor,
          status: location.status,
          deleted_at: location.deleted_at,
          last_seen_at: location.last_seen_at,
          created_at: location.created_at,
          updated_at: location.updated_at,
        });

        if (error) {
          errors.push(`${location.nome}: ${error.message}`);
          logger.error('sync', `❌ Location upload failed: ${location.nome}`, { error: error.message });
        } else {
          await marcarLocalSincronizado(location.id);
          count++;
          logger.info('sync', `✅ Location uploaded: ${location.nome}`);
        }
      } catch (e) {
        errors.push(`${location.nome}: ${e}`);
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
    const records = await getRegistrosParaSync(userId);
    logger.info('sync', `📤 ${records.length} records pending`);

    for (const record of records) {
      try {
        const { error } = await supabase.from('registros').upsert({
          id: record.id,
          user_id: record.user_id,
          local_id: record.local_id,
          local_nome: record.local_nome,
          entrada: record.entrada,
          saida: record.saida,
          tipo: record.tipo,
          editado_manualmente: record.editado_manualmente === 1,
          motivo_edicao: record.motivo_edicao,
          hash_integridade: record.hash_integridade,
          cor: record.cor,
          device_id: record.device_id,
          pausa_minutos: record.pausa_minutos || 0,
          created_at: record.created_at,
        });

        if (error) {
          errors.push(`Record: ${error.message}`);
          logger.error('sync', `❌ Record upload failed`, { error: error.message });
        } else {
          await marcarRegistroSincronizado(record.id);
          count++;
          logger.info('sync', `✅ Record uploaded: ${record.id}`);
        }
      } catch (e) {
        errors.push(`Record: ${e}`);
      }
    }
  } catch (error) {
    errors.push(String(error));
  }

  return { count, errors };
}

async function downloadLocations(userId: string): Promise<{ count: number; errors: string[] }> {
  let count = 0;
  const errors: string[] = [];

  try {
    const { data, error } = await supabase
      .from('locais')
      .select('*')
      .eq('user_id', userId);

    if (error) {
      errors.push(error.message);
      return { count, errors };
    }

    logger.info('sync', `📥 ${data?.length || 0} locations from Supabase`);

    for (const remote of data || []) {
      try {
        await upsertLocalFromSync({
          ...remote,
          synced_at: new Date().toISOString(),
        });
        count++;
      } catch (e) {
        errors.push(`${remote.nome}: ${e}`);
      }
    }
  } catch (error) {
    errors.push(String(error));
  }

  return { count, errors };
}

async function downloadRecords(userId: string): Promise<{ count: number; errors: string[] }> {
  let count = 0;
  const errors: string[] = [];

  try {
    const { data, error } = await supabase
      .from('registros')
      .select('*')
      .eq('user_id', userId);

    if (error) {
      errors.push(error.message);
      return { count, errors };
    }

    logger.info('sync', `📥 ${data?.length || 0} records from Supabase`);

    for (const remote of data || []) {
      try {
        await upsertRegistroFromSync({
          ...remote,
          editado_manualmente: remote.editado_manualmente ? 1 : 0,
          synced_at: new Date().toISOString(),
        });
        count++;
      } catch (e) {
        errors.push(`Record: ${e}`);
      }
    }
  } catch (error) {
    errors.push(String(error));
  }

  return { count, errors };
}
