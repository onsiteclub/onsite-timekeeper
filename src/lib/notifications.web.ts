/**
 * Notification System (Web) - OnSite Timekeeper
 *
 * Web shim: no push notifications, no channels, no categories.
 * All functions are no-ops returning safe defaults.
 */

// ============================================
// TYPES (same interface as native)
// ============================================

export type NotificationAction =
  | 'start'
  | 'skip_today'
  | 'ok'
  | 'pause'
  | 'resume'
  | 'stop'
  | 'snooze'
  | 'send_now'
  | 'remind_later'
  | 'timeout'
  | 'still_here'
  | 'stop_timer';

export interface GeofenceNotificationData {
  type: 'geofence_enter' | 'geofence_exit' | 'geofence_return' | 'auto_action' | 'reminder' | 'report_reminder' | 'session_guard';
  locationId?: string;
  locationName?: string;
  action?: NotificationAction;
  periodStart?: string;
  periodEnd?: string;
}

// Web-compatible types for _layout.tsx
export type NotificationSubscription = { remove: () => void };
export interface NotificationResponse {
  notification: { request: { content: { data: unknown } } };
  actionIdentifier: string;
}

export const DEFAULT_NOTIFICATION_ACTION = 'expo.modules.notifications.actions.DEFAULT';

// ============================================
// PERMISSIONS (no-op)
// ============================================

export async function requestNotificationPermission(): Promise<boolean> {
  return false;
}

// ============================================
// CATEGORIES (no-op)
// ============================================

export async function configureNotificationCategories(): Promise<void> {}

// ============================================
// NOTIFICATIONS (no-op)
// ============================================

export async function showSimpleNotification(_title: string, _body: string): Promise<string> {
  return '';
}

export async function showArrivalNotification(_locationName: string): Promise<string> {
  return '';
}

export async function showEndOfDayNotification(
  _totalHours: number,
  _totalMinutes: number,
  _locationName: string,
): Promise<string> {
  return '';
}

export async function showSessionGuardNotification(
  _locationName: string,
  _locationId: string,
  _hoursRunning: number,
): Promise<string> {
  return '';
}

// ============================================
// MANAGEMENT (no-op)
// ============================================

export async function cancelNotification(_notificationId: string): Promise<void> {}
export async function cancelAllNotifications(): Promise<void> {}
export async function clearNotifications(): Promise<void> {}
export async function getScheduledNotifications(): Promise<unknown[]> {
  return [];
}

// ============================================
// LISTENERS (no-op)
// ============================================

export function addResponseListener(
  _callback: (response: NotificationResponse) => void,
): NotificationSubscription {
  return { remove: () => {} };
}

export function addReceivedListener(
  _callback: (notification: unknown) => void,
): NotificationSubscription {
  return { remove: () => {} };
}

export async function getLastNotificationResponse(): Promise<NotificationResponse | null> {
  return null;
}
