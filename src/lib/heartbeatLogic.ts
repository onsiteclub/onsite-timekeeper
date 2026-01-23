/**
 * Heartbeat Logic - OnSite Timekeeper (SIMPLIFIED)
 * 
 * Simple heartbeat for sync purposes only - no session logic.
 */

import * as TaskManager from 'expo-task-manager';
import * as BackgroundFetch from 'expo-background-fetch';
import { logger } from './logger';
import { HEARTBEAT_TASK } from './backgroundTypes';

// ============================================
// CONSTANTS
// ============================================

const HEARTBEAT_INTERVAL = 15 * 60; // 15 minutes - fixed interval

// ============================================
// SAFE TASK MANAGEMENT
// ============================================

/**
 * Check if task is registered (used by backgroundTasks)
 */
export async function isTaskRegistered(taskName: string): Promise<boolean> {
  try {
    return await TaskManager.isTaskRegisteredAsync(taskName);
  } catch (error) {
    logger.warn('heartbeat', `Error checking task registration: ${taskName}`, { error: String(error) });
    return false;
  }
}

/**
 * Safely unregister a task (used by backgroundTasks)
 */
export async function safeUnregisterTask(taskName: string): Promise<boolean> {
  try {
    const registered = await isTaskRegistered(taskName);
    
    if (!registered) {
      logger.debug('heartbeat', `⚠️ Task not registered, skip unregister: ${taskName}`);
      return true; // Treat as success - already clean
    }
    
    await BackgroundFetch.unregisterTaskAsync(taskName);
    logger.debug('heartbeat', `✅ Task unregistered: ${taskName}`);
    return true;
  } catch (error) {
    logger.warn('heartbeat', `Failed to unregister task: ${taskName}`, { error: String(error) });
    return false;
  }
}

/**
 * Safely register heartbeat task (used by backgroundTasks)
 */
export async function safeRegisterHeartbeat(intervalSeconds: number): Promise<boolean> {
  try {
    // Unregister first (safely)
    await safeUnregisterTask(HEARTBEAT_TASK);
    
    // Register with new interval
    await BackgroundFetch.registerTaskAsync(HEARTBEAT_TASK, {
      minimumInterval: intervalSeconds,
      stopOnTerminate: false,
      startOnBoot: true,
    });
    
    logger.info('heartbeat', `✅ Heartbeat registered: ${intervalSeconds / 60}min`);
    return true;
  } catch (error) {
    logger.error('heartbeat', 'Failed to register heartbeat', { error: String(error) });
    return false;
  }
}

// ============================================
// SIMPLIFIED HEARTBEAT EXECUTION
// ============================================

/**
 * Run simplified heartbeat check (used by backgroundTasks)
 * Only for sync purposes - no session logic
 */
export async function runHeartbeat(): Promise<void> {
  const startTime = Date.now();
  
  logger.info('heartbeat', `💓 Heartbeat (sync-only, 15min)`);
  
  try {
    // Simple heartbeat - just trigger sync if needed
    const { useSyncStore } = await import('../stores/syncStore');
    const syncStore = useSyncStore.getState();
    
    // Check if we need to sync
    const lastSync = syncStore.lastSyncAt;
    const now = new Date();
    const hoursSinceSync = lastSync 
      ? (now.getTime() - lastSync.getTime()) / (1000 * 60 * 60)
      : 24; // Force sync if never synced
    
    // Sync every 6 hours during heartbeat
    if (hoursSinceSync >= 6) {
      logger.info('heartbeat', '🔄 Triggering background sync');
      await syncStore.syncNow();
    } else {
      logger.debug('heartbeat', `⏭️ Sync not needed (last: ${hoursSinceSync.toFixed(1)}h ago)`);
    }
    
  } catch (error) {
    logger.error('heartbeat', 'Error in heartbeat sync', { error: String(error) });
  }
  
  const elapsed = Date.now() - startTime;
  logger.info('heartbeat', `✅ Heartbeat completed in ${elapsed}ms`);
}

// ============================================
// SIMPLIFIED INTERVAL MANAGEMENT
// ============================================

/**
 * No-op for compatibility (used by backgroundTasks)
 */
export async function maybeUpdateHeartbeatInterval(): Promise<void> {
  // Simplified: always use fixed 15 min interval
  logger.debug('heartbeat', 'Using fixed 15min interval - no updates needed');
}
