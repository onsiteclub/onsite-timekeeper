/**
 * Permission Banner Components - OnSite Timekeeper
 * 
 * Banners to alert users about:
 * - Notification permissions disabled
 * - Location permissions not "Always"
 * - Foreground service killed (user dismissed notification)
 */

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { colors, withOpacity } from '../constants/colors';
import { usePermissionStatus } from '../hooks/usePermissionStatus';

// ============================================
// TYPES
// ============================================

interface BannerProps {
  type: 'error' | 'warning' | 'info';
  title: string;
  message: string;
  actionLabel: string;
  onAction: () => void;
  icon?: keyof typeof Ionicons.glyphMap;
  secondaryAction?: {
    label: string;
    onPress: () => void;
  };
}

// ============================================
// BASE BANNER COMPONENT
// ============================================

export function PermissionBanner({
  type,
  title,
  message,
  actionLabel,
  onAction,
  icon,
  secondaryAction,
}: BannerProps) {
  const styles = type === 'error' ? errorStyles : type === 'warning' ? warningStyles : infoStyles;
  const iconName = icon || (type === 'error' ? 'warning' : type === 'warning' ? 'alert-circle' : 'information-circle');
  const iconColor = type === 'error' ? colors.error : type === 'warning' ? colors.amberDark : colors.infoDark;

  return (
    <View style={[baseStyles.container, styles.container]}>
      <View style={baseStyles.iconContainer}>
        <Ionicons name={iconName} size={24} color={iconColor} />
      </View>
      <View style={baseStyles.content}>
        <Text style={[baseStyles.title, styles.title]}>{title}</Text>
        <Text style={[baseStyles.message, styles.message]}>{message}</Text>
        <View style={baseStyles.actions}>
          <TouchableOpacity 
            style={[baseStyles.button, styles.button]} 
            onPress={onAction}
            activeOpacity={0.7}
          >
            <Text style={[baseStyles.buttonText, styles.buttonText]}>{actionLabel}</Text>
          </TouchableOpacity>
          {secondaryAction && (
            <TouchableOpacity 
              style={baseStyles.secondaryButton} 
              onPress={secondaryAction.onPress}
              activeOpacity={0.7}
            >
              <Text style={baseStyles.secondaryButtonText}>{secondaryAction.label}</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </View>
  );
}

// ============================================
// SPECIALIZED BANNERS
// ============================================

/**
 * Banner shown when user dismissed the foreground service notification
 * This is the most critical - tracking will not work reliably
 */
export function ForegroundServiceKilledBanner() {
  const { restartMonitoring, openAppSettings } = usePermissionStatus();
  const router = useRouter();

  return (
    <PermissionBanner
      type="error"
      title="Logging paused"
      message="The notification was dismissed. Tap Restart to resume automatic time logging."
      actionLabel="Restart"
      onAction={restartMonitoring}
      icon="notifications-off"
      secondaryAction={{
        label: 'Learn more',
        onPress: () => router.push('/(tabs)/settings'),
      }}
    />
  );
}

/**
 * Banner shown when notification permission is disabled
 */
export function NotificationDisabledBanner() {
  const { openAppSettings } = usePermissionStatus();
  const router = useRouter();

  return (
    <PermissionBanner
      type="error"
      title="Notifications off"
      message="Turn on notifications to receive time logging updates and reminders."
      actionLabel="Enable"
      onAction={openAppSettings}
      icon="notifications-off"
      secondaryAction={{
        label: 'Learn more',
        onPress: () => router.push('/(tabs)/settings'),
      }}
    />
  );
}

/**
 * Banner shown when location permission is not "Always"
 */
export function LocationPermissionBanner() {
  const { requestLocationPermission, openAppSettings } = usePermissionStatus();
  const router = useRouter();

  return (
    <PermissionBanner
      type="warning"
      title="Location set to limited"
      message="Change to 'Always Allow' so your hours are logged automatically when you arrive or leave."
      actionLabel="Allow"
      onAction={async () => {
        const granted = await requestLocationPermission();
        if (!granted) {
          openAppSettings();
        }
      }}
      icon="location-outline"
      secondaryAction={{
        label: 'Learn more',
        onPress: () => router.push('/(tabs)/settings'),
      }}
    />
  );
}

/**
 * Combined banner that shows the highest priority issue
 * Priority: foregroundServiceKilled > notifications > location
 */
export function CombinedPermissionBanner() {
  const { 
    notificationsEnabled, 
    locationBackground, 
    foregroundServiceKilled,
  } = usePermissionStatus();

  // Priority 1: Foreground service killed (most critical)
  if (foregroundServiceKilled) {
    return <ForegroundServiceKilledBanner />;
  }

  // Priority 2: Notifications disabled
  if (!notificationsEnabled) {
    return <NotificationDisabledBanner />;
  }

  // Priority 3: Location not "Always"
  if (!locationBackground) {
    return <LocationPermissionBanner />;
  }

  return null;
}

/**
 * Smart banner for Home screen
 * Shows warning about keeping notification active even when permissions OK
 */
export function HomePermissionBanner() {
  const { 
    needsAttention,
  } = usePermissionStatus();

  // Show combined banner if there's an issue
  if (needsAttention) {
    return <CombinedPermissionBanner />;
  }

  // Everything is OK - don't show anything
  return null;
}

/**
 * Banner for Map screen
 */
export function MapPermissionBanner() {
  const { 
    locationBackground, 
    foregroundServiceKilled,
  } = usePermissionStatus();

  // Priority 1: Foreground service killed
  if (foregroundServiceKilled) {
    return <ForegroundServiceKilledBanner />;
  }

  // Priority 2: Location not "Always"
  if (!locationBackground) {
    return <LocationPermissionBanner />;
  }

  return null;
}

// ============================================
// STYLES
// ============================================

const baseStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    padding: 12,
    marginHorizontal: 16,
    marginVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  iconContainer: {
    marginRight: 12,
    paddingTop: 2,
  },
  content: {
    flex: 1,
  },
  title: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 4,
  },
  message: {
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 10,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  button: {
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 6,
  },
  buttonText: {
    fontSize: 13,
    fontWeight: '600',
  },
  secondaryButton: {
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  secondaryButtonText: {
    fontSize: 13,
    color: colors.textSecondary,
    textDecorationLine: 'underline',
  },
});

const errorStyles = StyleSheet.create({
  container: {
    backgroundColor: withOpacity(colors.error, 0.12),
    borderColor: withOpacity(colors.error, 0.2),
  },
  title: {
    color: colors.error,
  },
  message: {
    color: colors.buttonDangerPressed,
  },
  button: {
    backgroundColor: colors.error,
  },
  buttonText: {
    color: colors.white,
  },
});

const warningStyles = StyleSheet.create({
  container: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.amberLine,
  },
  title: {
    color: colors.primaryStrong,
  },
  message: {
    color: colors.primaryDark,
  },
  button: {
    backgroundColor: colors.amberDark,
  },
  buttonText: {
    color: colors.white,
  },
});

const infoStyles = StyleSheet.create({
  container: {
    backgroundColor: withOpacity(colors.info, 0.1),
    borderColor: withOpacity(colors.info, 0.2),
  },
  title: {
    color: colors.infoDark,
  },
  message: {
    color: colors.infoDark,
  },
  button: {
    backgroundColor: colors.infoDark,
  },
  buttonText: {
    color: colors.white,
  },
});
