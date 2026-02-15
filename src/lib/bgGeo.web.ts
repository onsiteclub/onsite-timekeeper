/**
 * Background Geolocation (Web) - OnSite Timekeeper
 *
 * Web shim: no background geolocation on web.
 */

import { logger } from './logger';

export interface GeofenceEvent {
  type: 'enter' | 'exit';
  regionIdentifier: string;
  timestamp: number;
}

export function setGeofenceHandler(_handler: unknown): void {}
export async function configure(): Promise<void> {
  logger.debug('boot', 'BackgroundGeolocation (web shim) — no-op');
}
export async function addGeofences(_locations: unknown[]): Promise<void> {}
export async function removeAllGeofences(): Promise<void> {}
export async function startGeofences(): Promise<void> {}
export async function stopMonitoring(): Promise<void> {}
export async function isEnabled(): Promise<boolean> { return false; }
export async function switchToActiveMode(): Promise<void> {}
export async function switchToIdleMode(): Promise<void> {}
export async function isIgnoringBatteryOptimizations(): Promise<boolean> { return true; }
export function cleanup(): void {}
export async function getUserIdForBackground(): Promise<string | null> { return null; }
