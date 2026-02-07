/**
 * Background Helpers - OnSite Timekeeper v3
 *
 * Helper functions for background tasks:
 * - User ID persistence
 * - Skipped today persistence
 * - Fence cache management
 * - Distance calculation
 * - Fence check (inside/outside)
 *
 * SIMPLIFIED: No hysteresis, no ping-pong tracking.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { logger } from './logger';
import {
  USER_ID_KEY,
  SKIPPED_TODAY_KEY,
} from './constants';
import { getLocations, getToday } from './database';

// ============================================
// TYPES
// ============================================

export interface ActiveFence {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  radius: number;
}

interface SkippedTodayData {
  date: string;
  locationIds: string[];
}

// ============================================
// FENCE CACHE
// ============================================

let activeFencesCache: ActiveFence[] = [];

export function updateActiveFences(fences: ActiveFence[]): void {
  activeFencesCache = fences;
  logger.debug('geofence', `Fences in cache: ${fences.length}`);
}

export function getActiveFences(): ActiveFence[] {
  return activeFencesCache;
}

export function clearFencesCache(): void {
  activeFencesCache = [];
}

// ============================================
// USER ID PERSISTENCE
// ============================================

export async function setBackgroundUserId(userId: string): Promise<void> {
  try {
    await AsyncStorage.setItem(USER_ID_KEY, userId);
    logger.debug('boot', `UserId saved for background: ${userId.substring(0, 8)}...`);
  } catch (error) {
    logger.error('boot', 'Error saving userId', { error: String(error) });
  }
}

export async function clearBackgroundUserId(): Promise<void> {
  try {
    await AsyncStorage.removeItem(USER_ID_KEY);
    logger.debug('boot', 'UserId removed');
  } catch (error) {
    logger.error('boot', 'Error removing userId', { error: String(error) });
  }
}

export async function getBackgroundUserId(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(USER_ID_KEY);
  } catch (error) {
    logger.error('geofence', 'Error retrieving userId', { error: String(error) });
    return null;
  }
}

// ============================================
// SKIPPED TODAY PERSISTENCE
// ============================================

async function getSkippedToday(): Promise<string[]> {
  try {
    const data = await AsyncStorage.getItem(SKIPPED_TODAY_KEY);
    if (!data) return [];

    const parsed: SkippedTodayData = JSON.parse(data);
    const today = getToday();

    if (parsed.date !== today) {
      return [];
    }

    return parsed.locationIds;
  } catch (error) {
    logger.error('geofence', 'Error retrieving skippedToday', { error: String(error) });
    return [];
  }
}

export async function addToSkippedToday(locationId: string): Promise<void> {
  try {
    const current = await getSkippedToday();
    if (current.includes(locationId)) return;

    const today = getToday();
    const data: SkippedTodayData = {
      date: today,
      locationIds: [...current, locationId],
    };

    await AsyncStorage.setItem(SKIPPED_TODAY_KEY, JSON.stringify(data));
    logger.debug('geofence', `Location ${locationId} added to skippedToday`);
  } catch (error) {
    logger.error('geofence', 'Error adding to skippedToday', { error: String(error) });
  }
}

export async function removeFromSkippedToday(locationId: string): Promise<void> {
  try {
    const current = await getSkippedToday();
    if (!current.includes(locationId)) return;

    const today = getToday();
    const data: SkippedTodayData = {
      date: today,
      locationIds: current.filter(id => id !== locationId),
    };

    await AsyncStorage.setItem(SKIPPED_TODAY_KEY, JSON.stringify(data));
    logger.debug('geofence', `Location ${locationId} removed from skippedToday`);
  } catch (error) {
    logger.error('geofence', 'Error removing from skippedToday', { error: String(error) });
  }
}

export async function clearSkippedToday(): Promise<void> {
  try {
    await AsyncStorage.removeItem(SKIPPED_TODAY_KEY);
    logger.debug('geofence', 'skippedToday cleared');
  } catch (error) {
    logger.error('geofence', 'Error clearing skippedToday', { error: String(error) });
  }
}

export async function isLocationSkippedToday(locationId: string): Promise<boolean> {
  const skipped = await getSkippedToday();
  return skipped.includes(locationId);
}

// ============================================
// DISTANCE CALCULATION
// ============================================

export function calculateDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371e3;
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

// ============================================
// CHECK INSIDE FENCE (SIMPLIFIED - no hysteresis)
// ============================================

export async function checkInsideFence(
  latitude: number,
  longitude: number,
  userId: string,
  _useHysteresis: boolean = false, // DEPRECATED - ignored
  _source: string = 'manual',
  _gpsAccuracy?: number
): Promise<{ isInside: boolean; fence: ActiveFence | null; distance?: number }> {
  // Try cache first
  let fences = activeFencesCache;

  // If cache empty, load from DB
  if (fences.length === 0) {
    try {
      const locations = await getLocations(userId);
      fences = locations
        .filter(l => l.status === 'active')
        .map(l => ({
          id: l.id,
          name: l.name,
          latitude: l.latitude,
          longitude: l.longitude,
          radius: l.radius,
        }));
      activeFencesCache = fences;
    } catch (error) {
      logger.error('geofence', 'Error loading fences', { error: String(error) });
      return { isInside: false, fence: null };
    }
  }

  // Check each fence (no hysteresis - use real radius)
  for (const fence of fences) {
    const distance = calculateDistance(latitude, longitude, fence.latitude, fence.longitude);

    if (distance <= fence.radius) {
      return { isInside: true, fence, distance };
    }
  }

  return { isInside: false, fence: null };
}
