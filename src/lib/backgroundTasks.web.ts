/**
 * Background Tasks (Web) - OnSite Timekeeper
 *
 * Web shim: no TaskManager, no background tasks.
 * All exports are no-ops.
 */

import { logger } from './logger';

// Re-export no-ops for backgroundHelpers functions
export async function addToSkippedToday(_locationId: string): Promise<void> {}
export async function removeFromSkippedToday(_locationId: string): Promise<void> {}
export async function clearSkippedToday(): Promise<void> {}

// Callback stubs
export function setGeofenceCallback(_callback: unknown): void {}
export function clearCallbacks(): void {}

// Background user stubs
export async function setBackgroundUserId(_userId: string): Promise<void> {}
export async function clearBackgroundUserId(): Promise<void> {}

logger.debug('boot', 'Background tasks (web shim) loaded — no-op');
