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
import { getBackgroundUserId, calculateDistance } from './backgroundHelpers';

// ============================================
// TYPES
// ============================================

export interface GeofenceEvent {
  type: 'enter' | 'exit';
  regionIdentifier: string;
  /** ISO string — from SDK's event.timestamp (OS time when geofence fired) */
  timestamp: string;
}

type GeofenceHandler = (event: GeofenceEvent) => void;

// ============================================
// MODULE STATE
// ============================================

let isConfigured = false;
let geofenceHandler: GeofenceHandler | null = null;
let heartbeatOutsideCount = 0;

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
    const config = {
      // DEBUG: set true to emit sounds on ALL SDK events (movement, GPS, geofence, heartbeat)
      // SDK doesn't support selective sounds (geofence-only) — it's all or nothing
      debug: false,
      locationAuthorizationRequest: 'Always',
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
      foregroundService: true,
      notification: {
        title: 'OnSite Timekeeper',
        text: 'Tracking work hours',
        sticky: true,
      },
      autoSync: false,
      autoSyncThreshold: 0,
      // Frozen: set to LOG_LEVEL_VERBOSE (5) to re-enable full SDK logging
      logLevel: (BackgroundGeolocation as any).LOG_LEVEL_ERROR,
      logMaxDays: 1,
    };

    // ready() only applies config on FIRST launch — subsequent launches use cached state.
    // So we call ready() first, then setConfig() to ensure our values override on EVERY launch.
    const readyState = await BackgroundGeolocation.ready(config as any);
    logger.info('boot', `📋 ready() result: enabled=${readyState.enabled}, trackingMode=${readyState.trackingMode}`, {
      enabled: readyState.enabled,
      trackingMode: readyState.trackingMode,
      didLaunchInBackground: (readyState as any).didLaunchInBackground,
    });

    await BackgroundGeolocation.setConfig(config as any);
    logger.info('boot', '📋 setConfig() applied');

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

      // Use SDK's event.timestamp (OS time when geofence was received)
      const sdkTimestamp = event.timestamp;
      const delayMs = Date.now() - new Date(sdkTimestamp).getTime();

      logger.info('geofence', `[1/6] SDK→JS onGeofence: ${type.toUpperCase()} "${identifier}" | sdkTs=${sdkTimestamp} | delay=${delayMs}ms`);

      if (geofenceHandler) {
        geofenceHandler({
          type,
          regionIdentifier: identifier,
          timestamp: sdkTimestamp,
        });
      } else {
        // Handler not registered — try lazy init (headless mode)
        logger.warn('geofence', `[1/6] ⚠️ No JS handler for ${type} @ ${identifier} — lazy init`);
        lazyInitAndDeliver(type, identifier, sdkTimestamp);
      }
    });

    // Exit watchdog via heartbeat
    BackgroundGeolocation.onHeartbeat(async () => {
      logger.info('geofence', '💓 Heartbeat fired');
      try {
        const { getActiveTrackingState } = await import('./exitHandler');
        const tracking = getActiveTrackingState();

        if (!tracking) {
          heartbeatOutsideCount = 0;
          return;
        }

        const { getLocationById } = await import('./database');
        const location = await getLocationById(tracking.location_id);
        if (!location) {
          heartbeatOutsideCount = 0;
          return;
        }

        const position = await BackgroundGeolocation.getCurrentPosition({
          samples: 1,
          persist: false,
        } as any);

        const distance = calculateDistance(
          position.coords.latitude,
          position.coords.longitude,
          location.latitude,
          location.longitude,
        );

        if (distance > location.radius) {
          heartbeatOutsideCount++;
          logger.info('geofence', `💓 Heartbeat: outside "${location.name}" (${Math.round(distance)}m, count=${heartbeatOutsideCount})`);

          if (heartbeatOutsideCount >= 2 && geofenceHandler) {
            logger.info('geofence', `🚨 Watchdog: 2x outside → injecting EXIT for "${location.name}"`);
            heartbeatOutsideCount = 0;
            geofenceHandler({
              type: 'exit',
              regionIdentifier: tracking.location_id,
              timestamp: new Date().toISOString(), // Synthetic event — no SDK timestamp
            });
          }
        } else {
          if (heartbeatOutsideCount > 0) {
            logger.info('geofence', `💓 Heartbeat: back inside "${location.name}" (${Math.round(distance)}m), reset`);
          }
          heartbeatOutsideCount = 0;
        }
      } catch (error) {
        logger.warn('geofence', '💓 Heartbeat check failed', { error: String(error) });
      }
    });

    isConfigured = true;
    logger.info('boot', '✅ BackgroundGeolocation configured (transistorsoft)');

    // Log SDK state to verify license + config
    try {
      const state = await BackgroundGeolocation.getState() as any;
      logger.info('boot', `📋 SDK state: enabled=${state.enabled}, didLaunchInBackground=${state.didLaunchInBackground}`, {
        enabled: state.enabled,
        trackingMode: state.trackingMode,
        didLaunchInBackground: state.didLaunchInBackground,
        stopOnTerminate: state.stopOnTerminate,
        startOnBoot: state.startOnBoot,
        distanceFilter: state.distanceFilter,
        geofenceProximityRadius: state.geofenceProximityRadius,
      });
    } catch (stateError) {
      logger.warn('boot', '⚠️ Could not read SDK state', { error: String(stateError) });
    }

    // Log Android permission status from SDK's perspective
    try {
      const providerState = await BackgroundGeolocation.getProviderState();
      logger.info('boot', `📋 Provider: enabled=${providerState.enabled}, status=${providerState.status}, gps=${providerState.gps}, network=${providerState.network}`, {
        enabled: providerState.enabled,
        status: providerState.status,
        gps: providerState.gps,
        network: providerState.network,
      });
    } catch (providerError) {
      logger.warn('boot', '⚠️ Could not read provider state', { error: String(providerError) });
    }
  } catch (error) {
    logger.error('boot', '❌ BackgroundGeolocation.ready() failed', { error: String(error) });
  }
}

/**
 * Headless fallback: when handler is null (app was killed),
 * try to import bootstrap and reinitialize.
 */
async function lazyInitAndDeliver(type: 'enter' | 'exit', identifier: string, sdkTimestamp?: string): Promise<void> {
  try {
    const { initializeListeners } = await import('./bootstrap');
    await initializeListeners();

    if (geofenceHandler) {
      logger.info('geofence', `✅ Lazy init OK — delivering ${type} @ ${identifier}`);
      geofenceHandler({
        type,
        regionIdentifier: identifier,
        timestamp: sdkTimestamp || new Date().toISOString(),
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
    radius: Math.max(loc.radius, 150), // min 150m for reasonable accuracy
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
 * Start geofence monitoring using start() with high distanceFilter.
 *
 * WHY NOT startGeofences()?
 * startGeofences() uses trackingMode=0 which relies on Android's native
 * GeofencingClient. This is unreliable in Doze mode — ENTER events don't
 * fire with screen off. Using start() with distanceFilter=200 keeps
 * trackingMode=1 (active location tracking) which detects geofence
 * crossings reliably even with screen off, with minimal battery impact.
 */
export async function startGeofences(): Promise<void> {
  if (!isConfigured) {
    logger.info('geofence', '⚠️ startGeofences: SDK not configured yet, calling configure()...');
    await configure();
  }

  logger.info('geofence', `🔄 startGeofences: isConfigured=${isConfigured}, calling SDK start() with high distanceFilter...`);

  try {
    // Use start() instead of startGeofences() for reliable background ENTER detection
    await BackgroundGeolocation.setConfig({
      distanceFilter: 200,
      stationaryRadius: 150,
      stopTimeout: 15,
    } as any);
    await BackgroundGeolocation.start();
    const stateAfter = await BackgroundGeolocation.getState() as any;
    logger.info('geofence', `✅ startGeofences OK: enabled=${stateAfter.enabled}, trackingMode=${stateAfter.trackingMode}`);
  } catch (error) {
    const errorStr = String(error);
    logger.error('geofence', `❌ startGeofences FAILED: ${errorStr}`, {
      isConfigured,
      error: errorStr,
    });

    // Log SDK + provider state for diagnostics
    try {
      const state = await BackgroundGeolocation.getState() as any;
      const provider = await BackgroundGeolocation.getProviderState();
      logger.error('geofence', `📋 SDK state at failure`, {
        enabled: state.enabled,
        trackingMode: state.trackingMode,
        didLaunchInBackground: state.didLaunchInBackground,
        providerStatus: provider.status,
        providerEnabled: provider.enabled,
        gps: provider.gps,
        network: provider.network,
      });
    } catch {
      logger.error('geofence', '📋 Could not read SDK/provider state after failure');
    }

    // Fallback: try start() instead of startGeofences()
    // startGeofences() requires background permission, start() may work with foreground-only
    if (errorStr.includes('Permission')) {
      logger.info('geofence', '🔄 Fallback: trying start() instead of startGeofences()...');
      try {
        await BackgroundGeolocation.start();
        logger.info('geofence', '✅ Fallback start() succeeded (full tracking mode)');
        return; // Success via fallback
      } catch (fallbackError) {
        logger.error('geofence', `❌ Fallback start() also failed: ${String(fallbackError)}`);
      }
    }

    throw error;
  }
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
// MODE SWITCHING (active tracking vs idle)
// ============================================

/**
 * ACTIVE mode: switch from geofence-only to full tracking.
 * GPS + motion detection + accelerometer → reliable EXIT detection.
 * Called by exitHandler on ENTER (session starts).
 */
export async function switchToActiveMode(): Promise<void> {
  try {
    await BackgroundGeolocation.setConfig({
      distanceFilter: 10,
      stationaryRadius: 25,
      stopTimeout: 5,
    } as any);
    logger.info('geofence', '⚡ ACTIVE setConfig applied (distanceFilter=10)');

    const startState = await BackgroundGeolocation.start();
    logger.info('geofence', `⚡ start() result: enabled=${startState.enabled}, trackingMode=${startState.trackingMode}`, {
      enabled: startState.enabled,
      trackingMode: startState.trackingMode,
    });

    // Verify foreground service is running
    const provider = await BackgroundGeolocation.getProviderState();
    logger.info('geofence', `⚡ ACTIVE provider: status=${provider.status}, enabled=${provider.enabled}, gps=${provider.gps}`, {
      status: provider.status,
      enabled: provider.enabled,
      gps: provider.gps,
      network: provider.network,
    });
  } catch (error) {
    logger.error('geofence', `❌ switchToActiveMode FAILED: ${String(error)}`);
    throw error;
  }
}

/**
 * IDLE mode: switch from active tracking back to low-power monitoring.
 * Uses start() with high distanceFilter (not startGeofences) so ENTER
 * events still fire reliably with screen off.
 * Called by exitHandler on EXIT (session ends).
 */
export async function switchToIdleMode(): Promise<void> {
  try {
    await BackgroundGeolocation.setConfig({
      distanceFilter: 200,
      stationaryRadius: 150,
      stopTimeout: 15,
    } as any);
    // Keep start() running (trackingMode=1) — don't switch to startGeofences()
    // because startGeofences() (trackingMode=0) doesn't detect ENTER in Doze mode
    const state = await BackgroundGeolocation.getState() as any;
    logger.info('geofence', `💤 IDLE mode: enabled=${state.enabled}, trackingMode=${state.trackingMode}`);
  } catch (error) {
    logger.error('geofence', `❌ switchToIdleMode FAILED: ${String(error)}`);
    throw error;
  }
}

// ============================================
// BATTERY OPTIMIZATION (Android)
// ============================================

/**
 * Check if battery optimization is disabled for this app (Android only).
 * Wraps BackgroundGeolocation.deviceSettings so _layout.tsx
 * doesn't import the native module directly (breaks web build).
 */
export async function isIgnoringBatteryOptimizations(): Promise<boolean> {
  try {
    return await (BackgroundGeolocation.deviceSettings as any).isIgnoringBatteryOptimizations();
  } catch {
    return true; // Assume OK if check fails
  }
}

// ============================================
// SDK LOG RETRIEVAL (survives background)
// ============================================

/**
 * Get the SDK's native log. This log persists in the SDK's own SQLite DB
 * and survives background/headless execution — unlike Metro console logs.
 * Use this to see what happened while the screen was off.
 */
export async function getSDKLog(): Promise<string> {
  try {
    const log = await (BackgroundGeolocation as any).getLog();
    return log || '(empty log)';
  } catch (error) {
    return `Error reading SDK log: ${String(error)}`;
  }
}

/**
 * Email the SDK's native log (useful for remote debugging).
 */
export async function emailSDKLog(email: string): Promise<void> {
  await (BackgroundGeolocation as any).emailLog(email);
}

/**
 * Get a compact SDK status summary for display.
 */
export async function getSDKStatus(): Promise<{
  enabled: boolean;
  trackingMode: number;
  authorization: number;
  gps: boolean;
  network: boolean;
  geofences: number;
}> {
  try {
    const state = await BackgroundGeolocation.getState() as any;
    const provider = await BackgroundGeolocation.getProviderState();
    const geofences = await BackgroundGeolocation.getGeofences();
    return {
      enabled: state.enabled,
      trackingMode: state.trackingMode, // 0=geofences-only, 1=location+geofences
      authorization: provider.status,    // 0=notDetermined, 2=denied, 3=always, 4=whenInUse
      gps: provider.gps,
      network: provider.network,
      geofences: geofences.length,
    };
  } catch (error) {
    logger.error('geofence', `getSDKStatus failed: ${String(error)}`);
    return { enabled: false, trackingMode: -1, authorization: -1, gps: false, network: false, geofences: 0 };
  }
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
    const { action, identifier, timestamp } = event.params;
    const type: 'enter' | 'exit' | null =
      action === 'ENTER' ? 'enter' :
      action === 'EXIT' ? 'exit' :
      null;

    if (!type) return;

    logger.info('geofence', `[1/6] [HEADLESS] SDK→JS: ${type.toUpperCase()} "${identifier}" | sdkTs=${timestamp}`);

    // Lazy init bootstrap → handler (propagate SDK timestamp)
    await lazyInitAndDeliver(type, identifier, timestamp);
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
