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
import type { ReportReminder } from '../stores/settingsStore';
import { getNextReminderDate } from '../stores/settingsStore';


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
  | 'timeout';

export interface GeofenceNotificationData {
  type: 'geofence_enter' | 'geofence_exit' | 'geofence_return' | 'pause_expired' | 'auto_action' | 'reminder' | 'report_reminder';
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
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      logger.warn('notification', 'Notification permission denied');
      return false;
    }

    if (Platform.OS === 'android') {
      // Geofence channel
      await Notifications.setNotificationChannelAsync('geofence', {
        name: 'Location Alerts',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        sound: 'default',
      });

      // Report reminder channel
      await Notifications.setNotificationChannelAsync('report_reminder', {
        name: 'Report Reminders',
        importance: Notifications.AndroidImportance.DEFAULT,
        vibrationPattern: [0, 250],
        sound: 'default',
      });
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

    categoriesConfigured = true;
    logger.info('notification', '✅ Notification categories configured (simplified)');
  } catch (error) {
    logger.error('notification', 'Error configuring categories', { error: String(error) });
  }
}

// ============================================
// GEOFENCE NOTIFICATIONS
// ============================================

/**
 * @deprecated Use showArrivalNotification() instead
 * Show geofence ENTRY notification (old button-based style)
 * Kept for backward compatibility - now redirects to simple notification
 */
export async function showEntryNotification(
  _locationId: string,
  locationName: string,
  _timeoutMinutes: number = 5
): Promise<string> {
  // DEPRECATED: Redirect to new simple arrival notification
  logger.debug('notification', 'showEntryNotification deprecated, using showArrivalNotification');
  return showArrivalNotification(locationName);
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
    const notificationId = await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        data: {
          type: 'auto_action',
        } as GeofenceNotificationData,
        sound: 'default',
        priority: Notifications.AndroidNotificationPriority.DEFAULT,
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
 * Show pending entry notification (waiting to register)
 * User has X minutes to leave if they don't want to start session
 */
export async function showPendingEntryNotification(
  locationName: string,
  timeoutMinutes: number
): Promise<string> {
  try {
    const notificationId = await Notifications.scheduleNotificationAsync({
      content: {
        title: `⏳ ${locationName}`,
        body: `You arrived. Timer starts in ${timeoutMinutes} min. Leave to cancel.`,
        data: {
          type: 'geofence_enter',
          locationName,
        } as GeofenceNotificationData,
        sound: 'default',
        priority: Notifications.AndroidNotificationPriority.DEFAULT,
      },
      trigger: null,
    });

    logger.info('notification', `📬 Pending entry notification: ${locationName} (${timeoutMinutes} min)`, { notificationId });
    return notificationId;
  } catch (error) {
    logger.error('notification', '❌ Error showing pending entry notification', { error: String(error), locationName });
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
 * Show pause expired notification (alarm)
 * Called when pause limit is reached
 */
export async function showPauseExpiredNotification(
  locationId: string,
  locationName: string,
  pauseLimitMinutes: number
): Promise<string> {
  try {
    const notificationId = await Notifications.scheduleNotificationAsync({
      content: {
        title: `⏰ Break Expired!`,
        body: `Your break time (${pauseLimitMinutes} min) at ${locationName} is over.`,
        data: {
          type: 'pause_expired',
          locationId,
          locationName,
        } as GeofenceNotificationData,
        sound: 'default',
        priority: Notifications.AndroidNotificationPriority.MAX,
      },
      trigger: null,
    });

    logger.info('notification', `📬 Pause expired notification: ${locationName}`, { notificationId });
    return notificationId;
  } catch (error) {
    logger.error('notification', '❌ Error showing pause expired notification', { error: String(error), locationName });
    return '';
  }
}

/**
 * Show auto-action notification (confirmation)
 * NOTE: This is kept for backward compatibility but should not be called
 * in the simplified flow (only entry/exit notifications, no confirmations)
 */
export async function showAutoActionNotification(
  locationName: string,
  action: 'start' | 'stop' | 'pause' | 'resume'
): Promise<void> {
  // DISABLED: In simplified flow, we don't show confirmation notifications
  // This reduces notification spam - only entry and exit notifications are shown
  logger.debug('notification', `⏭️ Auto-action notification skipped (simplified flow): ${action}`, { locationName });
  return;
  
  /* Original implementation (disabled):
  try {
    const actionText = {
      start: '▶️ Timer started',
      stop: '⏹️ Timer stopped',
      pause: '⏸️ Timer paused',
      resume: '▶️ Timer resumed',
    };

    await Notifications.scheduleNotificationAsync({
      content: {
        title: actionText[action],
        body: locationName,
        data: { type: 'auto_action' } as GeofenceNotificationData,
        sound: 'default',
      },
      trigger: null,
    });

    logger.info('notification', `📬 Auto-action notification: ${action}`);
  } catch (error) {
    logger.error('notification', 'Error showing auto-action notification', { error: String(error) });
  }
  */
}

// ============================================
// REPORT REMINDER NOTIFICATIONS
// ============================================

/**
 * Schedule a report reminder notification
 * @param config - Report reminder configuration from settingsStore
 * @returns The scheduled notification ID
 */
export async function scheduleReportReminder(config: ReportReminder): Promise<string | null> {
  try {
    // Cancel any existing scheduled reminder first
    await cancelReportReminder();

    if (!config.enabled) {
      logger.info('notification', '🔔 Report reminder disabled, not scheduling');
      return null;
    }

    const triggerDate = getNextReminderDate(config);
    const now = new Date();

    // Calculate seconds until trigger
    const secondsUntil = Math.floor((triggerDate.getTime() - now.getTime()) / 1000);

    if (secondsUntil <= 0) {
      logger.warn('notification', '🔔 Trigger date is in the past, skipping');
      return null;
    }

    // Format period label
    const periodLabel = getPeriodLabel(config.frequency);

    const notificationId = await Notifications.scheduleNotificationAsync({
      identifier: REPORT_REMINDER_ID,
      content: {
        title: '📊 Report Ready',
        body: `Your ${periodLabel} report is ready to send`,
        data: {
          type: 'report_reminder',
          periodStart: getPeriodStart(config.frequency).toISOString(),
          periodEnd: now.toISOString(),
        } as GeofenceNotificationData,
        categoryIdentifier: 'report_reminder',
        sound: 'default',
      },
      trigger: {
        seconds: secondsUntil,
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      },
    });

    logger.info('notification', '🔔 Report reminder scheduled', {
      notificationId,
      triggerDate: triggerDate.toISOString(),
      secondsUntil,
      frequency: config.frequency,
    });

    return notificationId;
  } catch (error) {
    logger.error('notification', 'Error scheduling report reminder', { error: String(error) });
    return null;
  }
}

/**
 * Cancel any scheduled report reminder
 */
export async function cancelReportReminder(): Promise<void> {
  try {
    await Notifications.cancelScheduledNotificationAsync(REPORT_REMINDER_ID);
    logger.info('notification', '🔔 Report reminder cancelled');
  } catch (error) {
    // Ignore errors if notification doesn't exist
    logger.debug('notification', 'No existing report reminder to cancel');
  }
}

/**
 * Show immediate "report ready" notification
 * Used when user wants to be reminded in 1 hour
 */
export async function showReportReadyNotification(
  totalHours: string,
  periodLabel: string
): Promise<string> {
  try {
    const notificationId = await Notifications.scheduleNotificationAsync({
      content: {
        title: '📊 Report Ready',
        body: `You worked ${totalHours} ${periodLabel}`,
        data: {
          type: 'report_reminder',
        } as GeofenceNotificationData,
        categoryIdentifier: 'report_reminder',
        sound: 'default',
      },
      trigger: null,
    });

    logger.info('notification', `📬 Report ready notification shown`, { totalHours });
    return notificationId;
  } catch (error) {
    logger.error('notification', 'Error showing report ready notification', { error: String(error) });
    return '';
  }
}

/**
 * Schedule "remind later" - triggers in 1 hour
 */
export async function scheduleRemindLater(): Promise<string | null> {
  try {
    const notificationId = await Notifications.scheduleNotificationAsync({
      identifier: 'report-reminder-later',
      content: {
        title: '📊 Report Reminder',
        body: "Don't forget to send your time report",
        data: {
          type: 'report_reminder',
        } as GeofenceNotificationData,
        categoryIdentifier: 'report_reminder',
        sound: 'default',
      },
      trigger: {
        seconds: 3600, // 1 hour
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      },
    });

    logger.info('notification', '🔔 Remind later scheduled (1 hour)');
    return notificationId;
  } catch (error) {
    logger.error('notification', 'Error scheduling remind later', { error: String(error) });
    return null;
  }
}

// ============================================
// HELPER FUNCTIONS
// ============================================

function getPeriodLabel(frequency: ReportReminder['frequency']): string {
  switch (frequency) {
    case 'weekly': return 'weekly';
    case 'biweekly': return 'bi-weekly';
    case 'monthly': return 'monthly';
    default: return 'weekly';
  }
}

function getPeriodStart(frequency: ReportReminder['frequency']): Date {
  const now = new Date();
  const start = new Date(now);

  switch (frequency) {
    case 'weekly':
      // Start of current week (Sunday)
      start.setDate(now.getDate() - now.getDay());
      break;
    case 'biweekly':
      // 2 weeks ago
      start.setDate(now.getDate() - 14);
      break;
    case 'monthly':
      // Start of month
      start.setDate(1);
      break;
  }

  start.setHours(0, 0, 0, 0);
  return start;
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
