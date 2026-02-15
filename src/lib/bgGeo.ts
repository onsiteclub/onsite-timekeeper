/**
 * Background Geolocation - OnSite Timekeeper v5
 *
 * Transistorsoft BackgroundGeolocation wrapper.
 * Replaces: expo-location geofencing, TaskManager, geofenceLogic, backgroundTasks.
 *
 * The SDK handles:
 * - Native geofencing with process resurrection
 * - Foreground service (Android)
 * - Headless mode (app terminated)
 * - Phantom event filtering
 * - Deduplication
 */

import BackgroundGeolocation from 'react-native-background-geolocation';
import { logger } from './logger';
import { getBackgroundUserId } from './backgroundHelpers';

// ============================================
// TYPES
// ============================================

export interface GeofenceEvent {
  type: 'enter' | 'exit';
  regionIdentifier: string;
  timestamp: number;
}

type GeofenceHandler = (event: GeofenceEvent) => void;

// ============================================
// MODULE STATE
// ============================================

let isConfigured = false;
let geofenceHandler: GeofenceHandler | null = null;

// ============================================
// HANDLER REGISTRATION
// ============================================

/**
 * Register the handler that receives geofence events.
 * Called by bootstrap.ts to route events → locationStore.
 */
export function setGeofenceHandler(handler: GeofenceHandler): void {
  geofenceHandler = handler;
  logger.debug('geofence', 'Geofence handler registered (transistorsoft)');
}

// ============================================
// CONFIGURE (call once at app init)
// ============================================

/**
 * Initialize the BackgroundGeolocation SDK.
 * Must be called once before addGeofences/startGeofences.
 */
export async function configure(): Promise<void> {
  if (isConfigured) return;

  try {
    // v5 types expect nested config but runtime uses flat — cast to any
    await BackgroundGeolocation.ready({
      reset: true,
      desiredAccuracy: BackgroundGeolocation.DesiredAccuracy.High,
      distanceFilter: 50,
      geofenceProximityRadius: 1000,
      geofenceInitialTriggerEntry: true,
      geofenceModeHighAccuracy: true,
      stopOnTerminate: false,
      startOnBoot: true,
      enableHeadless: true,
      preventSuspend: true,
      heartbeatInterval: 60,
      notification: {
        title: 'OnSite Timekeeper',
        text: 'Tracking work hours',
        sticky: true,
      },
      autoSync: false,
      autoSyncThreshold: 0,
      logLevel: BackgroundGeolocation.LogLevel.Info,
      logMaxDays: 3,
    } as any);

    // Register geofence event listener
    BackgroundGeolocation.onGeofence((event) => {
      const { action, identifier } = event;

      // GeofenceAction not exported at runtime — use string literals
      const type: 'enter' | 'exit' | null =
        action === 'ENTER' ? 'enter' :
        action === 'EXIT' ? 'exit' :
        null;

      if (!type) {
        logger.warn('geofence', `Unknown geofence action: ${action} @ ${identifier}`);
        return;
      }

      logger.info('geofence', `🔔 Geofence ${type}: ${identifier}`);

      if (geofenceHandler) {
        geofenceHandler({
          type,
          regionIdentifier: identifier,
          timestamp: Date.now(),
        });
      } else {
        // Handler not registered — try lazy init (headless mode)
        logger.warn('geofence', `⚠️ No handler for ${type} @ ${identifier} — attempting lazy init`);
        lazyInitAndDeliver(type, identifier);
      }
    });

    isConfigured = true;
    logger.info('boot', '✅ BackgroundGeolocation configured (transistorsoft)');
  } catch (error) {
    logger.error('boot', '❌ BackgroundGeolocation.ready() failed', { error: String(error) });
  }
}

/**
 * Headless fallback: when handler is null (app was killed),
 * try to import bootstrap and reinitialize.
 */
async function lazyInitAndDeliver(type: 'enter' | 'exit', identifier: string): Promise<void> {
  try {
    const { initializeListeners } = await import('./bootstrap');
    await initializeListeners();

    if (geofenceHandler) {
      logger.info('geofence', `✅ Lazy init OK — delivering ${type} @ ${identifier}`);
      geofenceHandler({
        type,
        regionIdentifier: identifier,
        timestamp: Date.now(),
      });
    } else {
      logger.error('geofence', `❌ Lazy init failed — ${type} @ ${identifier} LOST`);
    }
  } catch (e) {
    logger.error('geofence', `❌ Lazy init error — ${type} @ ${identifier} LOST`, { error: String(e) });
  }
}

// ============================================
// GEOFENCE MANAGEMENT
// ============================================

/**
 * Register geofences with the SDK.
 * Replaces all existing geofences (clean slate).
 */
export async function addGeofences(
  locations: {
    id: string;
    latitude: number;
    longitude: number;
    radius: number;
    name: string;
  }[]
): Promise<void> {
  // Remove existing geofences first
  await BackgroundGeolocation.removeGeofences();

  if (locations.length === 0) {
    logger.info('geofence', '🗑️ All geofences removed (no locations)');
    return;
  }

  const geofences = locations.map(loc => ({
    identifier: loc.id,
    latitude: loc.latitude,
    longitude: loc.longitude,
    radius: Math.max(loc.radius, 200), // transistorsoft min 200m
    notifyOnEntry: true,
    notifyOnExit: true,
    extras: { name: loc.name },
  }));

  await BackgroundGeolocation.addGeofences(geofences);
  logger.info('geofence', `📍 ${geofences.length} geofences registered (transistorsoft)`);
}

/**
 * Remove all geofences from the SDK.
 */
export async function removeAllGeofences(): Promise<void> {
  await BackgroundGeolocation.removeGeofences();
  logger.info('geofence', '🗑️ All geofences removed');
}

// ============================================
// MONITORING CONTROL
// ============================================

/**
 * Start geofence-only monitoring.
 * Lower power than full tracking — only fires on geofence transitions.
 */
export async function startGeofences(): Promise<void> {
  if (!isConfigured) await configure();
  await BackgroundGeolocation.startGeofences();
  logger.info('geofence', '✅ Geofence monitoring started (transistorsoft)');
}

/**
 * Stop all monitoring (geofences + location).
 */
export async function stopMonitoring(): Promise<void> {
  await BackgroundGeolocation.stop();
  logger.info('geofence', '⏹️ Geofence monitoring stopped');
}

/**
 * Check if the SDK is currently enabled/tracking.
 */
export async function isEnabled(): Promise<boolean> {
  const state = await BackgroundGeolocation.getState();
  return state.enabled;
}

// ============================================
// CLEANUP
// ============================================

export function cleanup(): void {
  BackgroundGeolocation.removeListeners();
  isConfigured = false;
  geofenceHandler = null;
  logger.debug('geofence', 'BackgroundGeolocation listeners removed');
}

// ============================================
// HEADLESS TASK (Android — app terminated)
// ============================================

/**
 * Register headless task at module scope.
 * When the app is killed, Android wakes JS engine and delivers events here.
 */
BackgroundGeolocation.registerHeadlessTask(async (event) => {
  const name = event.name;

  if (name === 'geofence') {
    const { action, identifier } = event.params;
    const type: 'enter' | 'exit' | null =
      action === 'ENTER' ? 'enter' :
      action === 'EXIT' ? 'exit' :
      null;

    if (!type) return;

    logger.info('geofence', `🔔 [Headless] Geofence ${type}: ${identifier}`);

    // Lazy init bootstrap → handler
    await lazyInitAndDeliver(type, identifier);
  }
});

// ============================================
// USER ID (for headless mode)
// ============================================

/**
 * Get userId — tries Zustand first, falls back to AsyncStorage (headless).
 */
export async function getUserIdForBackground(): Promise<string | null> {
  try {
    // Try Zustand store first (foreground mode)
    const { useAuthStore } = await import('../stores/authStore');
    const userId = useAuthStore.getState().getUserId();
    if (userId) return userId;
  } catch {
    // Store not available (headless mode)
  }

  // Fallback: AsyncStorage (persisted by authStore on login)
  return getBackgroundUserId();
}
