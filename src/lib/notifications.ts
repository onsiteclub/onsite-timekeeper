/**
 * Notification System - OnSite Timekeeper v2
 * 
 * SIMPLIFIED FLOW - Expanded notifications (no fullscreen popup)
 * 
 * Timer values are passed as parameters (come from settingsStore)
 * 
 * ENTRY: X min timeout → auto-start (silent)
 *   Buttons: [Start Work] [Skip Today]
 *   Expanded text with full explanation
 * 
 * EXIT: X sec timeout → auto-end with adjustment (silent)
 *   Buttons: [OK] [Pause]
 *   Shows time adjustment info (e.g., "Exit time will be recorded as 10 min earlier")
 * 
 * PAUSE EXPIRED: Alarm notification with 15s response window
 *   Buttons: [Resume Work] [+30 min Snooze]
 *   After timeout: checks GPS - inside fence = resume, outside = end
 * 
 * RETURN (during pause): X min timeout → auto-resume
 *   Buttons: [Resume] [Stop]
 * 
 * REPORT REMINDER: Weekly/biweekly/monthly notification
 *   Buttons: [Send Now] [Later]
 * 
 * NOTE: Auto-action confirmation notifications are DISABLED in simplified flow
 * 
 * FIXED: Added guard to prevent duplicate category configuration
 */

import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { logger } from './logger';


// ============================================
// INITIAL CONFIGURATION
// ============================================

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

// ============================================
// TYPES
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

// ============================================
// CONSTANTS
// ============================================

const REPORT_REMINDER_ID = 'report-reminder-scheduled';

// ============================================
// GUARDS (prevent duplicate initialization)
// ============================================

let categoriesConfigured = false;

// ============================================
// PERMISSIONS
// ============================================

export async function requestNotificationPermission(): Promise<boolean> {
  try {
    // 1. ALWAYS create Android channels first (required for Android 8+)
    // Channels must exist regardless of permission status — otherwise
    // notifications are silently dropped even after user grants permission later.
    if (Platform.OS === 'android') {
      // Delete old channels (Android won't update existing channel settings)
      await Notifications.deleteNotificationChannelAsync('geofence').catch(() => {});

      await Notifications.setNotificationChannelAsync('geofence_v2', {
        name: 'Location Alerts',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        enableVibrate: true,
        // sound omitted = uses system default notification sound
      });

      await Notifications.deleteNotificationChannelAsync('report_reminder').catch(() => {});

      await Notifications.setNotificationChannelAsync('report_reminder_v2', {
        name: 'Report Reminders',
        importance: Notifications.AndroidImportance.DEFAULT,
        vibrationPattern: [0, 250],
        enableVibrate: true,
      });

      logger.info('notification', '✅ Android notification channels created');
    }

    // 2. Request permission
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      logger.warn('notification', '⚠️ Notification permission denied — notifications will not appear');
      return false;
    }

    logger.info('notification', '✅ Notification permission granted');
    return true;
  } catch (error) {
    logger.error('notification', 'Error requesting permission', { error: String(error) });
    return false;
  }
}

// ============================================
// ACTION CATEGORIES
// ============================================

export async function configureNotificationCategories(): Promise<void> {
  // Guard: only configure once per app session
  if (categoriesConfigured) {
    logger.debug('notification', 'Categories already configured, skipping');
    return;
  }

  try {
    // SIMPLIFIED SYSTEM: No button-based categories needed
    // All geofence notifications are now informative only (no user action required)
    // Only report reminder keeps buttons for user convenience

    // Category for REPORT REMINDER (kept for user convenience)
    await Notifications.setNotificationCategoryAsync('report_reminder', [
      {
        identifier: 'send_now',
        buttonTitle: '📤 Send Now',
        options: { opensAppToForeground: true },
      },
      {
        identifier: 'remind_later',
        buttonTitle: '⏰ Later',
        options: { opensAppToForeground: false },
      },
    ]);

    // Category for SESSION GUARD (long-running timer safety net)
    await Notifications.setNotificationCategoryAsync('session_guard', [
      {
        identifier: 'still_here',
        buttonTitle: 'Yes, still here',
        options: { opensAppToForeground: false },
      },
      {
        identifier: 'stop_timer',
        buttonTitle: 'Stop timer',
        options: { opensAppToForeground: false },
      },
    ]);

    categoriesConfigured = true;
    logger.info('notification', '✅ Notification categories configured');
  } catch (error) {
    logger.error('notification', 'Error configuring categories', { error: String(error) });
  }
}

// ============================================
// GEOFENCE NOTIFICATIONS
// ============================================


/**
 * Check if notifications are allowed (permission granted)
 */
async function canSendNotification(): Promise<boolean> {
  try {
    const { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') {
      logger.warn('notification', '⚠️ Cannot send notification — permission not granted');
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Show simple informative notification (no buttons)
 * Used by the new exitHandler system for informative messages
 */
export async function showSimpleNotification(
  title: string,
  body: string
): Promise<string> {
  try {
    if (!await canSendNotification()) return '';

    const notificationId = await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        data: {
          type: 'auto_action',
        } as GeofenceNotificationData,
        sound: 'default',
        priority: Notifications.AndroidNotificationPriority.DEFAULT,
        ...(Platform.OS === 'android' && { channelId: 'geofence_v2' }),
      },
      trigger: null,
    });

    logger.info('notification', `📬 Simple notification: ${title}`, { notificationId });
    return notificationId;
  } catch (error) {
    logger.error('notification', '❌ Error showing simple notification', { error: String(error), title });
    return '';
  }
}

/**
 * Show arrival notification (first entry of the day only)
 * Simple informative notification without buttons
 */
export async function showArrivalNotification(locationName: string): Promise<string> {
  try {
    if (!await canSendNotification()) return '';

    const notificationId = await Notifications.scheduleNotificationAsync({
      content: {
        title: `📍 ${locationName}`,
        body: 'You arrived at work. Timer started. Have a great day!',
        data: {
          type: 'geofence_enter',
          locationName,
        } as GeofenceNotificationData,
        sound: 'default',
        priority: Notifications.AndroidNotificationPriority.HIGH,
        ...(Platform.OS === 'android' && { channelId: 'geofence_v2' }),
      },
      trigger: null,
    });

    logger.info('notification', `📬 Arrival notification: ${locationName}`, { notificationId });
    return notificationId;
  } catch (error) {
    logger.error('notification', '❌ Error showing arrival notification', { error: String(error), locationName });
    return '';
  }
}


/**
 * Show end of day notification with work summary
 * Called after 45 min without returning to the location
 */
export async function showEndOfDayNotification(
  totalHours: number,
  totalMinutes: number,
  locationName: string
): Promise<string> {
  try {
    if (!await canSendNotification()) return '';

    const timeStr = totalHours > 0
      ? `${totalHours}h ${totalMinutes}min`
      : `${totalMinutes} minutes`;

    const notificationId = await Notifications.scheduleNotificationAsync({
      content: {
        title: '🏁 End of Day',
        body: `You worked ${timeStr} at ${locationName} today. All saved. Rest well!`,
        data: {
          type: 'geofence_exit',
          locationName,
        } as GeofenceNotificationData,
        sound: 'default',
        priority: Notifications.AndroidNotificationPriority.HIGH,
        ...(Platform.OS === 'android' && { channelId: 'geofence_v2' }),
      },
      trigger: null,
    });

    logger.info('notification', `📬 End of day notification: ${locationName} - ${timeStr}`, { notificationId });
    return notificationId;
  } catch (error) {
    logger.error('notification', '❌ Error showing end of day notification', { error: String(error), locationName });
    return '';
  }
}

/**
 * Show session guard notification (timer running too long)
 * Has action buttons: "Yes, still here" / "Stop timer"
 */
export async function showSessionGuardNotification(
  locationName: string,
  locationId: string,
  hoursRunning: number,
): Promise<string> {
  try {
    if (!await canSendNotification()) return '';

    const notificationId = await Notifications.scheduleNotificationAsync({
      content: {
        title: `⏰ Timer running ${hoursRunning}h`,
        body: `Your timer at ${locationName} has been running for ${hoursRunning} hours. Still working?`,
        categoryIdentifier: 'session_guard',
        data: {
          type: 'session_guard',
          locationId,
          locationName,
        } as GeofenceNotificationData,
        sound: 'default',
        priority: Notifications.AndroidNotificationPriority.HIGH,
        ...(Platform.OS === 'android' && { channelId: 'geofence_v2' }),
      },
      trigger: null,
    });

    logger.info('notification', `📬 Session guard notification: ${locationName} (${hoursRunning}h)`, { notificationId });
    return notificationId;
  } catch (error) {
    logger.error('notification', '❌ Error showing session guard notification', { error: String(error), locationName });
    return '';
  }
}

// ============================================
// MANAGEMENT
// ============================================

export async function cancelNotification(notificationId: string): Promise<void> {
  if (!notificationId) return;

  try {
    await Notifications.cancelScheduledNotificationAsync(notificationId);
    await Notifications.dismissNotificationAsync(notificationId);
    logger.debug('notification', 'Notification cancelled', { notificationId });
  } catch (error) {
    logger.error('notification', 'Error cancelling notification', { error: String(error) });
  }
}

export async function cancelAllNotifications(): Promise<void> {
  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
    logger.info('notification', 'All notifications cancelled');
  } catch (error) {
    logger.error('notification', 'Error cancelling all notifications', { error: String(error) });
  }
}

export async function clearNotifications(): Promise<void> {
  try {
    await Notifications.dismissAllNotificationsAsync();
  } catch (error) {
    logger.error('notification', 'Error clearing notifications', { error: String(error) });
  }
}

/**
 * Get all scheduled notifications (for debugging)
 */
export async function getScheduledNotifications(): Promise<Notifications.NotificationRequest[]> {
  try {
    return await Notifications.getAllScheduledNotificationsAsync();
  } catch (error) {
    logger.error('notification', 'Error getting scheduled notifications', { error: String(error) });
    return [];
  }
}

// ============================================
// LISTENERS
// ============================================

export function addResponseListener(
  callback: (response: Notifications.NotificationResponse) => void
): Notifications.Subscription {
  return Notifications.addNotificationResponseReceivedListener(callback);
}

export function addReceivedListener(
  callback: (notification: Notifications.Notification) => void
): Notifications.Subscription {
  return Notifications.addNotificationReceivedListener(callback);
}

export async function getLastNotificationResponse(): Promise<Notifications.NotificationResponse | null> {
  return await Notifications.getLastNotificationResponseAsync();
}

// ============================================
// RE-EXPORTS for _layout.tsx (web shim compatibility)
// ============================================

export type NotificationSubscription = Notifications.Subscription;
export type NotificationResponse = Notifications.NotificationResponse;
export const DEFAULT_NOTIFICATION_ACTION = Notifications.DEFAULT_ACTION_IDENTIFIER;
