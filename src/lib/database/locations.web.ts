/**
 * Database - Locations / Geofences (Web)
 *
 * Supabase-backed in-memory cache for web platform.
 * On web, there's no SQLite — data lives in Supabase,
 * cached in memory for synchronous reads.
 *
 * Column mapping:
 *  - local "locations" table → Supabase "app_timekeeper_geofences"
 *  - local "last_seen_at" → Supabase "last_entry_at"
 */

import { logger } from '../logger';
import {
  generateUUID,
  now,
  type LocationDB,
} from './core';
import { supabase } from '../supabase';

// ============================================
// TYPES (same as native)
// ============================================

export interface CreateLocationParams {
  userId: string;
  name: string;
  latitude: number;
  longitude: number;
  radius?: number;
  color?: string;
}

// ============================================
// IN-MEMORY CACHE
// ============================================

let locationsCache: LocationDB[] = [];

// ============================================
// SUPABASE TRANSFORM
// ============================================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function fromSupabase(remote: any): LocationDB {
  return {
    id: remote.id,
    user_id: remote.user_id,
    name: remote.name,
    latitude: remote.latitude,
    longitude: remote.longitude,
    radius: remote.radius,
    color: remote.color,
    status: remote.status,
    deleted_at: remote.deleted_at,
    last_seen_at: remote.last_entry_at || remote.last_seen_at || now(),
    created_at: remote.created_at,
    updated_at: remote.updated_at,
    synced_at: remote.synced_at || now(),
  };
}

function toSupabasePayload(loc: LocationDB) {
  return {
    id: loc.id,
    user_id: loc.user_id,
    name: loc.name,
    latitude: loc.latitude,
    longitude: loc.longitude,
    radius: loc.radius,
    color: loc.color,
    status: loc.status,
    deleted_at: loc.deleted_at,
    last_entry_at: loc.last_seen_at, // local 'last_seen_at' → Supabase 'last_entry_at'
    created_at: loc.created_at,
    updated_at: loc.updated_at,
    synced_at: now(),
  };
}

// ============================================
// INIT — Load all data from Supabase into cache
// ============================================

export async function initWebData(userId: string): Promise<void> {
  try {
    const { data, error } = await supabase
      .from('app_timekeeper_geofences')
      .select('*')
      .eq('user_id', userId);

    if (error) {
      logger.error('database', '[locations:web] initWebData failed', { error: error.message });
      return;
    }

    locationsCache = (data || [])
      .map(fromSupabase)
      .filter(loc => loc.status === 'active');

    logger.info('database', `[locations:web] Cache loaded: ${locationsCache.length} locations`);
  } catch (error) {
    logger.error('database', '[locations:web] initWebData exception', { error: String(error) });
  }
}

// ============================================
// CRUD — cache + Supabase
// ============================================

export async function createLocation(params: CreateLocationParams): Promise<string> {
  const id = generateUUID();
  const timestamp = now();
  const safeRadius = Math.min(1000, Math.max(50, params.radius || 100));

  const location: LocationDB = {
    id,
    user_id: params.userId,
    name: params.name,
    latitude: params.latitude,
    longitude: params.longitude,
    radius: safeRadius,
    color: params.color || '#3B82F6',
    status: 'active',
    deleted_at: null,
    last_seen_at: timestamp,
    created_at: timestamp,
    updated_at: timestamp,
    synced_at: timestamp,
  };

  // Update cache
  locationsCache.push(location);

  // Write to Supabase
  try {
    const { error } = await supabase
      .from('app_timekeeper_geofences')
      .upsert(toSupabasePayload(location));

    if (error) {
      logger.error('database', '[locations:web] Supabase create failed', { error: error.message });
    }
  } catch (error) {
    logger.error('database', '[locations:web] Supabase create exception', { error: String(error) });
  }

  logger.info('database', `[locations:web] CREATED - id: ${id}, name: ${params.name}`);
  return id;
}

export async function getLocations(userId: string): Promise<LocationDB[]> {
  return locationsCache.filter(loc => loc.user_id === userId && loc.status === 'active');
}

export async function getLocationById(id: string): Promise<LocationDB | null> {
  return locationsCache.find(loc => loc.id === id) || null;
}

export async function updateLocation(
  id: string,
  updates: Partial<Pick<LocationDB, 'name' | 'latitude' | 'longitude' | 'radius' | 'color'>>
): Promise<void> {
  const idx = locationsCache.findIndex(loc => loc.id === id);
  if (idx === -1) return;

  const timestamp = now();
  const updated = {
    ...locationsCache[idx],
    ...updates,
    updated_at: timestamp,
    synced_at: timestamp,
  };
  locationsCache[idx] = updated;

  // Write to Supabase
  try {
    const { error } = await supabase
      .from('app_timekeeper_geofences')
      .upsert(toSupabasePayload(updated));

    if (error) {
      logger.error('database', '[locations:web] Supabase update failed', { error: error.message });
    }
  } catch (error) {
    logger.error('database', '[locations:web] Supabase update exception', { error: String(error) });
  }

  logger.info('database', `[locations:web] UPDATED - id: ${id}`);
}

export async function removeLocation(userId: string, id: string): Promise<void> {
  const timestamp = now();

  // Update cache
  locationsCache = locationsCache.filter(loc => !(loc.id === id && loc.user_id === userId));

  // Soft-delete in Supabase
  try {
    const { error } = await supabase
      .from('app_timekeeper_geofences')
      .update({ status: 'deleted', deleted_at: timestamp, updated_at: timestamp, synced_at: now() })
      .eq('id', id)
      .eq('user_id', userId);

    if (error) {
      logger.error('database', '[locations:web] Supabase delete failed', { error: error.message });
    }
  } catch (error) {
    logger.error('database', '[locations:web] Supabase delete exception', { error: String(error) });
  }

  logger.info('database', `[locations:web] DELETED (soft) - id: ${id}`);
}

export async function updateLastSeen(id: string): Promise<void> {
  const idx = locationsCache.findIndex(loc => loc.id === id);
  if (idx >= 0) {
    locationsCache[idx] = { ...locationsCache[idx], last_seen_at: now() };
  }
}

// ============================================
// SYNC — used by syncStore
// ============================================

export async function getLocationsForSync(_userId: string): Promise<LocationDB[]> {
  // On web, writes go directly to Supabase — nothing to upload
  return [];
}

export async function markLocationSynced(_id: string): Promise<void> {
  // On web, everything is already synced
}

/**
 * Called by syncStore when downloading from Supabase.
 * Populates the in-memory cache.
 */
export async function upsertLocationFromSync(location: LocationDB): Promise<void> {
  try {
    const idx = locationsCache.findIndex(loc => loc.id === location.id);

    if (location.status === 'deleted') {
      // Remove deleted locations from cache
      if (idx >= 0) {
        locationsCache.splice(idx, 1);
      }
      return;
    }

    if (idx >= 0) {
      // Update existing
      if (new Date(location.updated_at) > new Date(locationsCache[idx].updated_at)) {
        locationsCache[idx] = { ...location, synced_at: now() };
      }
    } else {
      // Insert new
      locationsCache.push({ ...location, synced_at: now() });
    }
  } catch (error) {
    logger.error('database', '[locations:web] upsertFromSync error', { error: String(error) });
  }
}
