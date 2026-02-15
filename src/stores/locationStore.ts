/**
 * Location Store - OnSite Timekeeper V3
 *
 * Manages geofences and handles entry/exit events.
 * Uses active_tracking table and daily_hours as source of truth.
 *
 * V3 CHANGES:
 * - Removed records dependency (uses exitHandler instead)
 * - activeSession now uses ActiveTracking type
 * - handleGeofenceEvent calls exitHandler directly
 * - Manual entry/exit uses onGeofenceEnter/onManualExit
 */

import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { logger } from '../lib/logger';
import {
  requestAllPermissions,
  getCurrentLocation,
  type LocationResult,
} from '../lib/location';
import {
  addGeofences as bgGeoAddGeofences,
  startGeofences as bgGeoStart,
  stopMonitoring as bgGeoStop,
  isEnabled as bgGeoIsEnabled,
} from '../lib/bgGeo';
import {
  // Location CRUD
  createLocation,
  getLocations,
  getLocationById,
  updateLocation,
  removeLocation as removeLocationDb,
  updateLastSeen,
  // V2: Observability
  trackMetric,
  trackGeofenceTrigger,
  trackFeatureUsed,
  recordEntryAudit,
  recordExitAudit,
  captureGeofenceError,
  // Web init
  initLocationsWebData,
  // Types
  type LocationDB,
} from '../lib/database';
import {
  // V3: Exit handler (replaces records)
  onGeofenceEnter,
  onGeofenceExit,
  onManualExit,
  hasActiveTracking,
  getActiveTrackingState,
  type ActiveTracking,
} from '../lib/exitHandler';
import {
  updateActiveFences,
  addToSkippedToday,
  removeFromSkippedToday,
} from '../lib/backgroundHelpers';
import type { GeofenceEvent } from '../lib/bgGeo';
import { logGeofenceEvent } from '../lib/eventLog';
import { useAuthStore } from './authStore';
import { useSyncStore } from './syncStore';
// NOTE: WorkSessionStore removed in V3 - now using exitHandler directly
import { useDailyLogStore } from './dailyLogStore';
import { useSettingsStore } from './settingsStore';

// Radius bounds (transistorsoft minimum reliable radius is 200m)
const MIN_RADIUS = 200;  // meters
const MAX_RADIUS = 1000;

// ============================================
// CONSTANTS
// ============================================

const MONITORING_STATE_KEY = '@onsite:monitoringEnabled';
// v4: OS geofencing is the sole decision maker for enter/exit. No Guardian AI, no reconcile, no GPS-based exit.

// ============================================
// HELPER: Calculate distance between two points (Haversine)
// ============================================

function calculateDistanceMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371000; // Earth radius in meters
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// ============================================
// TYPES (BACKWARD COMPATIBLE)
// ============================================

// Alias for backward compatibility
export type WorkLocation = LocationDB;

// Location coordinates type
export interface LocationCoords {
  latitude: number;
  longitude: number;
  accuracy?: number | null;
}

export interface LocationState {
  // State
  locations: LocationDB[];
  isLoading: boolean;
  isMonitoring: boolean;
  currentLocation: LocationCoords | null;
  activeSession: ActiveTracking | null; // V3: Now uses active_tracking table
  permissionStatus: 'unknown' | 'granted' | 'denied' | 'restricted';
  lastGeofenceEvent: GeofenceEvent | null;
  currentFenceId: string | null; // Track which fence user is physically inside
  
  // Timer configs (from settings)
  entryTimeout: number;
  exitTimeout: number;
  pauseTimeout: number;
  
  // Actions
  initialize: () => Promise<void>;
  reloadLocations: () => Promise<void>;
  addLocation: (name: string, latitude: number, longitude: number, radius?: number, color?: string) => Promise<string>;
  editLocation: (id: string, updates: Partial<Pick<LocationDB, 'name' | 'latitude' | 'longitude' | 'radius' | 'color'>>) => Promise<void>;
  deleteLocation: (id: string) => Promise<void>;
  removeLocation: (id: string) => Promise<void>; // Alias for deleteLocation
  updateLocation: (id: string, updates: Partial<Pick<LocationDB, 'name' | 'latitude' | 'longitude' | 'radius' | 'color'>>) => Promise<void>; // Alias
  startMonitoring: () => Promise<boolean>;
  stopMonitoring: () => Promise<void>;
  restartMonitoring: () => Promise<boolean>;
  handleGeofenceEvent: (event: GeofenceEvent) => Promise<void>;
  handleManualEntry: (locationId: string) => Promise<string>;
  handleManualExit: (locationId: string) => Promise<void>;
  skipLocationToday: (locationId: string) => Promise<void>;
  unskipLocationToday: (locationId: string) => Promise<void>;
  refreshCurrentLocation: () => Promise<LocationCoords | null>;
  setTimerConfigs: (entry: number, exit: number, pause: number) => void;
  
  // Debug
  getDebugState: () => object;
}

// ============================================
// SELECTORS (BACKWARD COMPATIBLE)
// ============================================

export const selectLocations = (state: LocationState) => state.locations;
export const selectCurrentLocation = (state: LocationState) => state.currentLocation;
export const selectIsGeofencingActive = (state: LocationState) => state.isMonitoring;
export const selectActiveGeofence = (state: LocationState) => state.activeSession?.location_id || null;
export const selectPermissions = (state: LocationState) => state.permissionStatus;
export const selectCurrentFenceId = (state: LocationState) => state.currentFenceId; // NEW

// ============================================
// HELPER: Persist monitoring state
// ============================================

async function saveMonitoringState(enabled: boolean): Promise<void> {
  try {
    await AsyncStorage.setItem(MONITORING_STATE_KEY, JSON.stringify(enabled));
  } catch (error) {
    logger.error('geofence', 'Error saving monitoring state', { error: String(error) });
  }
}

async function loadMonitoringState(): Promise<boolean> {
  try {
    const value = await AsyncStorage.getItem(MONITORING_STATE_KEY);
    // Default to TRUE - we want monitoring ON by default for automation
    return value !== null ? JSON.parse(value) : true;
  } catch (error) {
    logger.error('geofence', 'Error loading monitoring state', { error: String(error) });
    return true; // Default ON
  }
}

// (Guardian AI removed in v4 — OS geofencing + exitHandler are the only decision makers)

// ============================================
// STORE
// ============================================

export const useLocationStore = create<LocationState>((set, get) => ({
  // Initial state
  locations: [],
  isLoading: true,
  isMonitoring: false,
  currentLocation: null,
  activeSession: null,
  permissionStatus: 'unknown',
  lastGeofenceEvent: null,
  currentFenceId: null, // NEW
  entryTimeout: 120,
  exitTimeout: 60,
  pauseTimeout: 30,

  // ============================================
  // INITIALIZE
  // ============================================
  initialize: async () => {
    logger.info('boot', '📍 Initializing location store V2...');
    set({ isLoading: true });

    try {
      // Check permissions
      const permissions = await requestAllPermissions();
      
      if (!permissions.foreground) {
        logger.warn('geofence', 'Location permission denied');
        set({ permissionStatus: 'denied', isLoading: false });
        return;
      }

      set({ permissionStatus: permissions.background ? 'granted' : 'restricted' });

      // On web, populate in-memory cache from Supabase before first read
      const userId = useAuthStore.getState().getUserId();
      if (userId) {
        await initLocationsWebData(userId);
      }

      // Load locations
      await get().reloadLocations();

      // Get current location
      const location = await getCurrentLocation();
      if (location) {
        set({ 
          currentLocation: {
            latitude: location.coords.latitude,
            longitude: location.coords.longitude,
            accuracy: location.accuracy,
          }
     });
        
        const { locations } = get();
        for (const fence of locations) {
          const distance = calculateDistanceMeters(
            location.coords.latitude,
            location.coords.longitude,
            fence.latitude,
            fence.longitude
          );
          if (distance <= fence.radius) {
            logger.info('geofence', `📍 Boot: Already inside fence "${fence.name}"`);
            set({ currentFenceId: fence.id });
            break;
          }
        }
      }  // <- fecha o if (location)

      // NOTE: Callbacks are registered in bootstrap.ts (singleton pattern)
      // DO NOT register here to avoid duplicates

      // V3: Check for active tracking (replaced records-based session)
      const activeTracking = getActiveTrackingState();
      set({ activeSession: activeTracking });

      // Session guard recovery (restart safety net timer from enter_at)
      if (activeTracking) {
        const { recoverSessionGuard } = await import('../lib/exitHandler');
        recoverSessionGuard();
      }

      // ============================================
      // AUTO-START MONITORING (NEW!)
      // ============================================
      const { locations, permissionStatus } = get();
      const shouldMonitor = await loadMonitoringState();
      
      if (shouldMonitor && permissionStatus === 'granted' && locations.length > 0) {
        logger.info('geofence', '🚀 Auto-starting monitoring...');
        await get().startMonitoring();
      } else {
        logger.info('geofence', 'Monitoring not auto-started', {
          shouldMonitor,
          hasPermission: permissionStatus === 'granted',
          hasLocations: locations.length > 0,
        });
      }

      // Also check if geofencing was already running (e.g., app was killed and restarted)
      const isAlreadyRunning = await bgGeoIsEnabled();
      if (isAlreadyRunning && !get().isMonitoring) {
        logger.info('geofence', '♻️ Geofencing was already active, updating state');
        set({ isMonitoring: true });
      }

      logger.info('boot', '✅ Location store V2 initialized');
    } catch (error) {
      logger.error('boot', 'Error initializing location store', { error: String(error) });
    } finally {
      set({ isLoading: false });
    }
  },

  // ============================================
  // RELOAD LOCATIONS
  // ============================================
  reloadLocations: async () => {
    const userId = useAuthStore.getState().getUserId();
    if (!userId) {
      logger.warn('database', 'Cannot reload locations: no userId');
      return;
    }

    try {
      const locations = await getLocations(userId);
      set({ locations });

      // Update background task cache
      const activeFences = locations.map(l => ({
        id: l.id,
        name: l.name,
        latitude: l.latitude,
        longitude: l.longitude,
        radius: l.radius,
      }));
      updateActiveFences(activeFences);

      logger.debug('database', `Loaded ${locations.length} locations`);
    } catch (error) {
      logger.error('database', 'Error loading locations', { error: String(error) });
    }
  },

  // ============================================
  // ADD LOCATION
  // ============================================
  addLocation: async (name, latitude, longitude, radius = 100, color = '#3B82F6') => {
    const userId = useAuthStore.getState().getUserId();
    if (!userId) throw new Error('User not authenticated');

    // Validate radius bounds
    if (radius < MIN_RADIUS || radius > MAX_RADIUS) {
      throw new Error(`Minimum radius for reliable tracking: ${MIN_RADIUS}m`);
    }

    // Get minimum distance setting
    const minDistance = useSettingsStore.getState().distanciaMinimaLocais;
    const existingLocations = get().locations;

    // Track closest location for audit logging
    let closestLocation: { name: string; distance: number; minimum: number } | null = null;

    // Check if new location is too close to any existing location
    for (const existing of existingLocations) {
      const distance = calculateDistanceMeters(
        latitude,
        longitude,
        existing.latitude,
        existing.longitude
      );
      
      // Check if circles would overlap (distance < sum of radii + minimum gap)
      const effectiveMinDistance = Math.max(minDistance, radius + existing.radius);
      
      // Track closest for audit
      if (!closestLocation || distance < closestLocation.distance) {
        closestLocation = {
          name: existing.name,
          distance: Math.round(distance),
          minimum: effectiveMinDistance,
        };
      }
      
      if (distance < effectiveMinDistance) {
        const distanceRounded = Math.round(distance);
        logger.warn('database', `⚠️ Location too close to "${existing.name}"`, {
          distance: `${distanceRounded}m`,
          minimum: `${effectiveMinDistance}m`,
        });
        throw new Error(
          `Too close to "${existing.name}" (${distanceRounded}m). Minimum distance: ${effectiveMinDistance}m`
        );
      }
    }

    // Audit log: record proximity even when validation passes
    if (closestLocation) {
      const isTooClose = closestLocation.distance < closestLocation.minimum;
      const margin = closestLocation.distance - closestLocation.minimum;
      
      if (isTooClose || margin < 50) {
        // Log warning if validation somehow passed but distance is suspicious
        logger.warn('database', `🚨 AUDIT: Location created with small margin`, {
          newLocation: name,
          closestTo: closestLocation.name,
          distance: `${closestLocation.distance}m`,
          minimum: `${closestLocation.minimum}m`,
          margin: `${margin}m`,
          coords: `${latitude.toFixed(6)},${longitude.toFixed(6)}`,
        });
      } else {
        logger.debug('database', `📍 Location proximity check passed`, {
          closestTo: closestLocation.name,
          distance: `${closestLocation.distance}m`,
          margin: `${margin}m`,
        });
      }
    }

    try {
      const id = await createLocation({
        userId,
        name,
        latitude,
        longitude,
        radius,
        color,
      });

      // V2: Track feature usage
      await trackFeatureUsed(userId, 'create_location');

      // Reload and restart monitoring
      await get().reloadLocations();
      
      if (get().isMonitoring) {
        // Restart with updated fences (bolinha azul validates events)
        await get().restartMonitoring();
      } else {
  // Auto-start if this is the first location
  const { locations, permissionStatus } = get();
  if (permissionStatus === 'granted' && locations.length > 0) {
    logger.info('geofence', '🚀 First location added, auto-starting monitoring');
    await get().startMonitoring();
  }
}

      // Sync to cloud
      await useSyncStore.getState().syncLocationsOnly();

      logger.info('database', `📍 Location added: ${name}`);
      return id;
    } catch (error) {
      logger.error('database', 'Error adding location', { error: String(error) });
      throw error;
    }
  },

  // ============================================
  // EDIT LOCATION
  // ============================================
  editLocation: async (id, updates) => {
    const userId = useAuthStore.getState().getUserId();
    if (!userId) throw new Error('User not authenticated');

    // Get current location data
    const currentLocation = get().locations.find(l => l.id === id);
    if (!currentLocation) throw new Error('Location not found');

    // Calculate effective values after update
    const newLatitude = updates.latitude ?? currentLocation.latitude;
    const newLongitude = updates.longitude ?? currentLocation.longitude;
    const newRadius = updates.radius ?? currentLocation.radius;

    // Validate proximity if position or radius changed
    if (updates.latitude !== undefined || updates.longitude !== undefined || updates.radius !== undefined) {
      const minDistance = useSettingsStore.getState().distanciaMinimaLocais;
      const otherLocations = get().locations.filter(l => l.id !== id);

      let closestLocation: { name: string; distance: number; minimum: number } | null = null;

      for (const other of otherLocations) {
        const distance = calculateDistanceMeters(
          newLatitude,
          newLongitude,
          other.latitude,
          other.longitude
        );

        const effectiveMinDistance = Math.max(minDistance, newRadius + other.radius);

        // Track closest for audit
        if (!closestLocation || distance < closestLocation.distance) {
          closestLocation = {
            name: other.name,
            distance: Math.round(distance),
            minimum: effectiveMinDistance,
          };
        }

        if (distance < effectiveMinDistance) {
          const distanceRounded = Math.round(distance);
          logger.warn('database', `⚠️ Edit would overlap with "${other.name}"`, {
            location: currentLocation.name,
            newRadius: `${newRadius}m`,
            distance: `${distanceRounded}m`,
            minimum: `${effectiveMinDistance}m`,
          });
          throw new Error(
            `Would overlap with "${other.name}" (${distanceRounded}m apart). Minimum: ${effectiveMinDistance}m`
          );
        }
      }

      // Audit log for edits
      if (closestLocation) {
        const margin = closestLocation.distance - closestLocation.minimum;
        if (margin < 50) {
          logger.warn('database', `🚨 AUDIT: Location edited with small margin`, {
            location: currentLocation.name,
            closestTo: closestLocation.name,
            distance: `${closestLocation.distance}m`,
            minimum: `${closestLocation.minimum}m`,
            margin: `${margin}m`,
            newRadius: updates.radius ? `${newRadius}m` : 'unchanged',
          });
        }
      }
    }

    try {
      await updateLocation(id, updates);

      // V2: Track feature usage
      await trackFeatureUsed(userId, 'edit_location');

      // Reload and restart monitoring
      await get().reloadLocations();
      
      if (get().isMonitoring) {
        // Restart with updated fences (bolinha azul validates events)
        await get().restartMonitoring();
      }

      // Sync to cloud
      await useSyncStore.getState().syncLocationsOnly();

      logger.info('database', `📍 Location updated: ${id}`);
    } catch (error) {
      logger.error('database', 'Error editing location', { error: String(error) });
      throw error;
    }
  },

  // Alias for editLocation (backward compat)
  updateLocation: async (id, updates) => {
    return get().editLocation(id, updates);
  },

  // ============================================
  // DELETE LOCATION
  // ============================================
  deleteLocation: async (id) => {
    const userId = useAuthStore.getState().getUserId();
    if (!userId) throw new Error('User not authenticated');

    try {
      // V3: Check if tracking this location and trigger exit
      const activeTracking = getActiveTrackingState();
      if (activeTracking && activeTracking.location_id === id) {
        const location = await getLocationById(id);
        await onGeofenceExit(userId, id, location?.name || 'Unknown');
      }

      await removeLocationDb(userId, id);

      // V2: Track feature usage
      await trackFeatureUsed(userId, 'delete_location');

      // Reload and restart monitoring
      await get().reloadLocations();

      if (get().isMonitoring) {
        // Restart with updated fences (bolinha azul validates events)
        await get().restartMonitoring();
      }

      // Sync to cloud
      await useSyncStore.getState().syncLocationsOnly();

      // V3: Update active session state from active_tracking
      set({ activeSession: getActiveTrackingState() });

      // Notify daily log store
      useDailyLogStore.getState().reloadToday();

      logger.info('database', `🗑️ Location deleted: ${id}`);
    } catch (error) {
      logger.error('database', 'Error deleting location', { error: String(error) });
      throw error;
    }
  },

  // Alias for deleteLocation (backward compat)
  removeLocation: async (id) => {
    return get().deleteLocation(id);
  },

  // ============================================
  // START MONITORING
  // ============================================
  startMonitoring: async () => {
    const { locations, permissionStatus } = get();

    logger.info('geofence', `🚀 startMonitoring called: permissionStatus=${permissionStatus}, locations=${locations.length}`);

    if (permissionStatus !== 'granted') {
      logger.warn('geofence', `Cannot start monitoring: permissionStatus="${permissionStatus}" (need "granted")`);
      return false;
    }

    if (locations.length === 0) {
      logger.warn('geofence', 'Cannot start monitoring: no locations');
      return false;
    }

    try {
      // Register geofences + start monitoring (transistorsoft)
      await bgGeoAddGeofences(locations.map(l => ({
        id: l.id,
        latitude: l.latitude,
        longitude: l.longitude,
        radius: l.radius,
        name: l.name,
      })));

      logger.info('geofence', `📍 Geofences registered, now calling startGeofences...`);
      await bgGeoStart();

      // Save state for next app launch
      await saveMonitoringState(true);

      set({ isMonitoring: true });

      logger.info('geofence', `✅ Monitoring started (${locations.length} fences)`);

      // Post-start: verify current position matches tracking state
      // Only inject ENTER (not EXIT) — boot GPS might be briefly inaccurate
      try {
        const coords = await getCurrentLocation();
        if (coords) {
          const isTracking = hasActiveTracking();
          let insideFence: LocationDB | null = null;
          for (const fence of locations) {
            const distance = calculateDistanceMeters(
              coords.coords.latitude, coords.coords.longitude,
              fence.latitude, fence.longitude,
            );
            if (distance <= fence.radius) { insideFence = fence; break; }
          }

          if (insideFence && !isTracking) {
            logger.info('geofence', `🚀 Post-start: inside "${insideFence.name}" → injecting ENTER`);
            get().handleGeofenceEvent({
              type: 'enter',
              regionIdentifier: insideFence.id,
              timestamp: new Date().toISOString(), // Synthetic — no SDK timestamp
            });
          }
        }
      } catch {
        // Non-critical, OS geofencing will catch transitions
      }

      return true;
    } catch (error) {
      logger.error('geofence', 'Error starting monitoring', { error: String(error) });
      return false;
    }
  },

  // ============================================
  // STOP MONITORING
  // ============================================
  stopMonitoring: async () => {
    try {
      await bgGeoStop();

      // Cancel session guard when monitoring is stopped manually
      const { cancelSessionGuard } = await import('../lib/exitHandler');
      cancelSessionGuard();

      // Save state for next app launch
      await saveMonitoringState(false);

      set({ isMonitoring: false });
      logger.info('geofence', '⏹️ Monitoring stopped');
    } catch (error) {
      logger.error('geofence', 'Error stopping monitoring', { error: String(error) });
    }
  },

  // ============================================
  // RESTART MONITORING
  // v4: No reconfigure window — bolinha azul validates all events.
  // ============================================
  restartMonitoring: async () => {
    const { locations, permissionStatus } = get();

    if (permissionStatus !== 'granted') {
      logger.warn('geofence', 'Cannot restart monitoring: permission not granted');
      return false;
    }

    if (locations.length === 0) {
      await get().stopMonitoring();
      return false;
    }

    try {
      // Re-register geofences (transistorsoft replaces existing ones)
      await bgGeoAddGeofences(locations.map(l => ({
        id: l.id,
        latitude: l.latitude,
        longitude: l.longitude,
        radius: l.radius,
        name: l.name,
      })));

      // Ensure monitoring is running
      const running = await bgGeoIsEnabled();
      if (!running) {
        await bgGeoStart();
      }

      set({ isMonitoring: true });

      logger.info('geofence', `🔄 Monitoring restarted (${locations.length} fences)`);

      // Post-restart: verify GPS position after 5s delay
      // (gives SDK time to fire initial triggers naturally — if it doesn't, we inject)
      setTimeout(async () => {
        try {
          const userId = useAuthStore.getState().getUserId();
          if (!userId) return;

          const coords = await getCurrentLocation();
          if (!coords) return;

          const { locations: currentLocations } = get();
          const isTracking = hasActiveTracking();

          // Check if inside any fence
          let insideFence: LocationDB | null = null;
          for (const fence of currentLocations) {
            const distance = calculateDistanceMeters(
              coords.coords.latitude,
              coords.coords.longitude,
              fence.latitude,
              fence.longitude,
            );
            if (distance <= fence.radius) {
              insideFence = fence;
              break;
            }
          }

          if (insideFence && !isTracking) {
            // Inside fence but no tracking → ENTER was dropped during re-registration
            logger.info('geofence', `🔄 Post-restart: inside "${insideFence.name}" but no tracking → injecting ENTER`);
            get().handleGeofenceEvent({
              type: 'enter',
              regionIdentifier: insideFence.id,
              timestamp: new Date().toISOString(), // Synthetic — no SDK timestamp
            });
          } else if (!insideFence && isTracking) {
            // Outside all fences but tracking active → EXIT was dropped
            const tracking = getActiveTrackingState();
            if (tracking) {
              logger.info('geofence', `🔄 Post-restart: outside fences but tracking "${tracking.location_name}" → injecting EXIT`);
              get().handleGeofenceEvent({
                type: 'exit',
                regionIdentifier: tracking.location_id,
                timestamp: new Date().toISOString(), // Synthetic — no SDK timestamp
              });
            }
          } else {
            logger.debug('geofence', `🔄 Post-restart: state consistent (inside=${!!insideFence}, tracking=${isTracking})`);
          }
        } catch (error) {
          logger.warn('geofence', 'Post-restart position check failed', { error: String(error) });
        }
      }, 5000);

      return true;
    } catch (error) {
      logger.error('geofence', 'Error restarting monitoring', { error: String(error) });
      return false;
    }
  },

  // ============================================
  // HANDLE GEOFENCE EVENT (v4: direct → exitHandler, no AI)
  // ============================================
  handleGeofenceEvent: async (event) => {
    const userId = useAuthStore.getState().getUserId();
    if (!userId) {
      logger.warn('geofence', 'Cannot handle event: no userId');
      return;
    }

    // Update currentFenceId based on event type
    if (event.type === 'enter') {
      set({ lastGeofenceEvent: event, currentFenceId: event.regionIdentifier });
    } else if (event.type === 'exit') {
      const current = get().currentFenceId;
      set({
        lastGeofenceEvent: event,
        currentFenceId: current === event.regionIdentifier ? null : current,
      });
    }

    const location = await getLocationById(event.regionIdentifier);
    if (!location) {
      logger.warn('geofence', `Location not found: ${event.regionIdentifier}`);
      return;
    }

    logger.info('geofence', `[3/6] locationStore→exitHandler: ${event.type.toUpperCase()} "${location.name}" | ts=${event.timestamp}`);

    // Get current GPS for audit
    let coords: LocationResult | null = null;
    try {
      coords = await getCurrentLocation();
    } catch {
      logger.warn('geofence', 'Could not get GPS for audit');
    }

    // Track geofence trigger
    await trackGeofenceTrigger(userId, coords?.accuracy ?? null);

    const gpsLat = coords?.coords.latitude ?? location.latitude;
    const gpsLng = coords?.coords.longitude ?? location.longitude;
    const gpsAccuracy = coords?.accuracy ?? 999;

    try {
      // Log event for history
      const eventType: 'entry' | 'exit' = event.type === 'enter' ? 'entry' : 'exit';
      logGeofenceEvent(userId, location.id, eventType, gpsAccuracy, gpsLat, gpsLng);

      // Act directly via exitHandler (propagate SDK timestamp)
      if (event.type === 'enter') {
        await onGeofenceEnter(userId, location.id, location.name, event.timestamp);
      } else {
        await onGeofenceExit(userId, location.id, location.name, event.timestamp);
      }

      // Update active session state
      set({ activeSession: getActiveTrackingState() });
    } catch (error) {
      logger.error('geofence', 'Error handling geofence event', { error: String(error) });

      await captureGeofenceError(error as Error, {
        userId,
        action: `geofence_${event.type}`,
        locationId: location.id,
      });
    }
  },

  // ============================================
  // MANUAL ENTRY (V3: uses exitHandler)
  // ============================================
  handleManualEntry: async (locationId) => {
    const userId = useAuthStore.getState().getUserId();
    if (!userId) throw new Error('User not authenticated');

    const location = await getLocationById(locationId);
    if (!location) throw new Error('Location not found');

    // V3: Check for existing tracking
    if (hasActiveTracking()) {
      throw new Error('Session already active');
    }

    // Track feature usage
    await trackFeatureUsed(userId, 'manual_entry');

    // V3: Use exitHandler to start tracking (same as geofence enter)
    await onGeofenceEnter(userId, location.id, location.name);

    // Get GPS for audit (best effort)
    try {
      const coords = await getCurrentLocation();
      if (coords) {
        await recordEntryAudit(
          userId,
          coords.coords.latitude,
          coords.coords.longitude,
          coords.accuracy ?? null,
          location.id,
          location.name,
          null // No session ID in V3
        );
      }
    } catch (e) {
      logger.warn('geofence', 'Could not record GPS audit for manual entry');
    }

    // V3: Update state from active_tracking
    set({ activeSession: getActiveTrackingState(), currentFenceId: location.id });

    logger.info('geofence', `✅ Manual entry: ${location.name}`);
    return location.id; // Return location ID instead of session ID
  },

  // ============================================
  // MANUAL EXIT (V3: uses exitHandler)
  // ============================================
  handleManualExit: async (locationId) => {
    const userId = useAuthStore.getState().getUserId();
    if (!userId) throw new Error('User not authenticated');

    const location = await getLocationById(locationId);
    if (!location) throw new Error('Location not found');

    // V3: Check for active tracking
    const tracking = getActiveTrackingState();
    if (!tracking || tracking.location_id !== locationId) {
      throw new Error('No active session');
    }

    // Get GPS for audit (best effort)
    try {
      const coords = await getCurrentLocation();
      if (coords) {
        await recordExitAudit(
          userId,
          coords.coords.latitude,
          coords.coords.longitude,
          coords.accuracy ?? null,
          location.id,
          location.name,
          null // No session ID in V3
        );
      }
    } catch (e) {
      logger.warn('geofence', 'Could not record GPS audit for manual exit');
    }

    // V3: Use exitHandler for immediate exit (no cooldown)
    await onManualExit(userId, locationId, location.name);

    // V3: Update state from active_tracking
    set({ activeSession: getActiveTrackingState(), currentFenceId: null });

    logger.info('geofence', `✅ Manual exit: ${location.name}`);
  },

  // ============================================
  // SKIP/UNSKIP LOCATION TODAY
  // ============================================
  skipLocationToday: async (locationId) => {
    const userId = useAuthStore.getState().getUserId();
    if (!userId) return;

    await addToSkippedToday(locationId);

    // V3: If tracking this location, end it
    const tracking = getActiveTrackingState();
    if (tracking && tracking.location_id === locationId) {
      await onManualExit(userId, locationId, tracking.location_name);
      set({ activeSession: getActiveTrackingState(), currentFenceId: null });
    }

    logger.info('geofence', `😴 Location skipped for today: ${locationId}`);
  },

  unskipLocationToday: async (locationId) => {
    await removeFromSkippedToday(locationId);
    logger.info('geofence', `👀 Location unskipped: ${locationId}`);
  },

  // ============================================
  // REFRESH CURRENT LOCATION
  // ============================================
  refreshCurrentLocation: async () => {
    try {
      const location = await getCurrentLocation();
      if (location) {
        const coords: LocationCoords = {
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
          accuracy: location.accuracy,
        };
        set({ currentLocation: coords });
        return coords;
      }
      return null;
    } catch (error) {
      logger.error('gps', 'Error refreshing location', { error: String(error) });
      return null;
    }
  },

  // ============================================
  // TIMER CONFIGS
  // ============================================
  setTimerConfigs: (entry, exit, pause) => {
    set({
      entryTimeout: entry,
      exitTimeout: exit,
      pauseTimeout: pause,
    });
    logger.debug('sync', 'Timer configs updated', { entry, exit, pause });
  },

  // ============================================
  // DEBUG
  // ============================================
  getDebugState: () => {
    const state = get();
    return {
      locations: state.locations.length,
      isMonitoring: state.isMonitoring,
      permissionStatus: state.permissionStatus,
      activeSession: state.activeSession?.location_name || null,
      lastEvent: state.lastGeofenceEvent?.type || null,
      currentFenceId: state.currentFenceId, // NEW
      currentLocation: state.currentLocation ? {
        lat: state.currentLocation.latitude.toFixed(6),
        lng: state.currentLocation.longitude.toFixed(6),
      } : null,
      timerConfigs: {
        entry: state.entryTimeout,
        exit: state.exitTimeout,
        pause: state.pauseTimeout,
      },
    };
  },
}));
