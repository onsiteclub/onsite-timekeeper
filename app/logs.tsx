/**
 * System Logs Screen - OnSite Timekeeper
 *
 * Displays in-memory runtime logs for debugging.
 * Accessible from Settings > About > System Logs.
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Share,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { colors } from '../src/constants/colors';
import {
  getStoredLogs,
  addLogListener,
  clearLogs,
  exportLogsAsText,
  type LogEntry,
} from '../src/lib/logger';
import { getSDKStatus, getSDKLog, emailSDKLog } from '../src/lib/bgGeo';

// ============================================
// CONSTANTS
// ============================================

const LEVEL_COLORS: Record<string, string> = {
  debug: '#3B82F6',  // blue
  info: '#0F766E',   // green
  warn: '#C58B1B',   // amber
  error: '#DC2626',  // red
};

const LEVEL_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  debug: 'bug-outline',
  info: 'information-circle-outline',
  warn: 'warning-outline',
  error: 'alert-circle-outline',
};

const CATEGORIES = [
  'all', 'boot', 'geofence', 'session', 'sync', 'auth',
  'gps', 'database', 'ai', 'voice', 'secretary', 'ui',
  'notification', 'permissions', 'settings', 'dailyLog',
] as const;

// ============================================
// LOG ROW COMPONENT
// ============================================

const LogRow = React.memo(({ item }: { item: LogEntry }) => {
  const [expanded, setExpanded] = useState(false);
  const levelColor = LEVEL_COLORS[item.level] || colors.textSecondary;
  const icon = LEVEL_ICONS[item.level] || 'ellipse-outline';
  const time = item.timestamp.toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  return (
    <TouchableOpacity
      style={styles.logRow}
      onPress={() => setExpanded(!expanded)}
      activeOpacity={0.7}
    >
      <View style={styles.logHeader}>
        <Ionicons name={icon} size={14} color={levelColor} />
        <Text style={[styles.logTime, { color: colors.textSecondary }]}>{time}</Text>
        <View style={[styles.categoryBadge, { backgroundColor: levelColor + '18' }]}>
          <Text style={[styles.categoryText, { color: levelColor }]}>
            {item.category}
          </Text>
        </View>
      </View>
      <Text
        style={[styles.logMessage, { color: item.level === 'error' ? colors.error : colors.text }]}
        numberOfLines={expanded ? undefined : 2}
      >
        {item.message}
      </Text>
      {expanded && item.metadata && (
        <Text style={styles.logMeta}>
          {JSON.stringify(item.metadata, null, 2)}
        </Text>
      )}
    </TouchableOpacity>
  );
});

// ============================================
// MAIN COMPONENT
// ============================================

const AUTH_STATUS_LABELS: Record<number, string> = {
  0: 'Not Determined',
  1: 'Restricted',
  2: 'Denied',
  3: 'Always',
  4: 'WhenInUse',
  [-1]: 'Error',
};

const TRACKING_MODE_LABELS: Record<number, string> = {
  0: 'Geofences Only',
  1: 'Location + Geofences',
  [-1]: 'Error',
};

export default function LogsScreen() {
  const router = useRouter();
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [filter, setFilter] = useState<string>('all');
  const [levelFilter, setLevelFilter] = useState<string | null>(null);
  const flatListRef = useRef<FlatList>(null);

  // SDK status
  const [sdkStatus, setSdkStatus] = useState<{
    enabled: boolean; trackingMode: number; authorization: number;
    gps: boolean; network: boolean; geofences: number;
  } | null>(null);
  const [sdkLog, setSdkLog] = useState<string | null>(null);
  const [sdkLogLoading, setSdkLogLoading] = useState(false);

  // Load logs + subscribe to new ones
  useEffect(() => {
    setLogs(getStoredLogs().reverse());
    const unsubscribe = addLogListener(() => {
      setLogs(getStoredLogs().reverse());
    });
    // Load SDK status
    if (Platform.OS !== 'web') {
      getSDKStatus().then(setSdkStatus).catch(() => {});
    }
    return unsubscribe;
  }, []);

  const handleLoadSDKLog = useCallback(async () => {
    setSdkLogLoading(true);
    try {
      const log = await getSDKLog();
      setSdkLog(log);
    } catch {
      setSdkLog('Failed to load SDK log');
    } finally {
      setSdkLogLoading(false);
    }
  }, []);

  const handleShareSDKLog = useCallback(async () => {
    if (!sdkLog) return;
    try {
      const filePath = `${FileSystem.cacheDirectory}sdk-log-${Date.now()}.txt`;
      await FileSystem.writeAsStringAsync(filePath, sdkLog);
      await Sharing.shareAsync(filePath, { mimeType: 'text/plain', dialogTitle: 'SDK Native Log' });
    } catch {
      // Fallback to Share API
      await Share.share({ message: sdkLog.slice(-5000), title: 'SDK Native Log (truncated)' });
    }
  }, [sdkLog]);

  const handleEmailSDKLog = useCallback(async () => {
    try {
      await emailSDKLog('cris@onsiteclub.com');
    } catch {
      // emailLog opens native email client — may fail if no email app configured
    }
  }, []);

  const filteredLogs = logs.filter(log => {
    if (filter !== 'all' && log.category !== filter) return false;
    if (levelFilter && log.level !== levelFilter) return false;
    return true;
  });

  const handleExport = useCallback(async () => {
    const text = exportLogsAsText();
    if (Platform.OS === 'web') {
      // Web: copy to clipboard
      try {
        await navigator.clipboard.writeText(text);
      } catch {
        // fallback
      }
      return;
    }
    await Share.share({ message: text, title: 'OnSite Logs' });
  }, []);

  const handleClear = useCallback(() => {
    clearLogs();
    setLogs([]);
  }, []);

  const renderItem = useCallback(({ item }: { item: LogEntry }) => (
    <LogRow item={item} />
  ), []);

  const keyExtractor = useCallback((item: LogEntry) => item.id, []);

  // Count by level for header badges
  const errorCount = logs.filter(l => l.level === 'error').length;
  const warnCount = logs.filter(l => l.level === 'warn').length;

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>System Logs</Text>
        <View style={styles.headerActions}>
          <TouchableOpacity onPress={handleExport} style={styles.headerButton}>
            <Ionicons name="share-outline" size={20} color={colors.text} />
          </TouchableOpacity>
          <TouchableOpacity onPress={handleClear} style={styles.headerButton}>
            <Ionicons name="trash-outline" size={20} color={colors.error} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Summary bar */}
      <View style={styles.summaryBar}>
        <Text style={styles.summaryText}>{filteredLogs.length} logs</Text>
        {errorCount > 0 && (
          <TouchableOpacity
            style={[styles.summaryBadge, { backgroundColor: colors.errorSoft }]}
            onPress={() => setLevelFilter(levelFilter === 'error' ? null : 'error')}
          >
            <Text style={[styles.summaryBadgeText, { color: colors.error }]}>
              {errorCount} errors
            </Text>
          </TouchableOpacity>
        )}
        {warnCount > 0 && (
          <TouchableOpacity
            style={[styles.summaryBadge, { backgroundColor: colors.warningSoft }]}
            onPress={() => setLevelFilter(levelFilter === 'warn' ? null : 'warn')}
          >
            <Text style={[styles.summaryBadgeText, { color: colors.warning }]}>
              {warnCount} warns
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* SDK Status Card (native only) */}
      {Platform.OS !== 'web' && sdkStatus && (
        <View style={styles.sdkCard}>
          <View style={styles.sdkCardHeader}>
            <Ionicons name="hardware-chip-outline" size={16} color={colors.primary} />
            <Text style={styles.sdkCardTitle}>Transistorsoft SDK</Text>
            <View style={[styles.sdkStatusDot, { backgroundColor: sdkStatus.enabled ? '#22C55E' : '#EF4444' }]} />
            <Text style={[styles.sdkStatusText, { color: sdkStatus.enabled ? '#22C55E' : '#EF4444' }]}>
              {sdkStatus.enabled ? 'Running' : 'Stopped'}
            </Text>
          </View>
          <View style={styles.sdkGrid}>
            <View style={styles.sdkGridItem}>
              <Text style={styles.sdkLabel}>Auth</Text>
              <Text style={[styles.sdkValue, {
                color: sdkStatus.authorization === 3 ? '#22C55E' : '#EF4444'
              }]}>
                {AUTH_STATUS_LABELS[sdkStatus.authorization] || `Unknown(${sdkStatus.authorization})`}
              </Text>
            </View>
            <View style={styles.sdkGridItem}>
              <Text style={styles.sdkLabel}>Mode</Text>
              <Text style={styles.sdkValue}>
                {TRACKING_MODE_LABELS[sdkStatus.trackingMode] || `${sdkStatus.trackingMode}`}
              </Text>
            </View>
            <View style={styles.sdkGridItem}>
              <Text style={styles.sdkLabel}>GPS</Text>
              <Text style={[styles.sdkValue, { color: sdkStatus.gps ? '#22C55E' : '#EF4444' }]}>
                {sdkStatus.gps ? 'ON' : 'OFF'}
              </Text>
            </View>
            <View style={styles.sdkGridItem}>
              <Text style={styles.sdkLabel}>Fences</Text>
              <Text style={styles.sdkValue}>{sdkStatus.geofences}</Text>
            </View>
          </View>
          <View style={styles.sdkActions}>
            <TouchableOpacity
              style={styles.sdkButton}
              onPress={handleLoadSDKLog}
              disabled={sdkLogLoading}
            >
              <Ionicons name="document-text-outline" size={14} color={colors.primary} />
              <Text style={styles.sdkButtonText}>
                {sdkLogLoading ? 'Loading...' : sdkLog ? 'Refresh Log' : 'SDK Log'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.sdkButton}
              onPress={handleEmailSDKLog}
            >
              <Ionicons name="mail-outline" size={14} color={colors.primary} />
              <Text style={styles.sdkButtonText}>Email Log</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.sdkButton}
              onPress={() => getSDKStatus().then(setSdkStatus).catch(() => {})}
            >
              <Ionicons name="refresh-outline" size={14} color={colors.primary} />
              <Text style={styles.sdkButtonText}>Refresh</Text>
            </TouchableOpacity>
          </View>
          {sdkLog && (
            <View style={styles.sdkLogContainer}>
              <View style={styles.sdkLogHeader}>
                <Text style={styles.sdkLogTitle}>Native SDK Log (persists in background)</Text>
                <TouchableOpacity onPress={handleShareSDKLog}>
                  <Ionicons name="share-outline" size={16} color={colors.primary} />
                </TouchableOpacity>
              </View>
              <Text style={styles.sdkLogText} selectable>
                {sdkLog.slice(-3000)}
              </Text>
              {sdkLog.length > 3000 && (
                <Text style={styles.sdkLogTruncated}>
                  ... showing last 3000 chars (share for full log)
                </Text>
              )}
            </View>
          )}
        </View>
      )}

      {/* Category filter chips */}
      <FlatList
        horizontal
        data={CATEGORIES}
        keyExtractor={(item) => item}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filtersContainer}
        renderItem={({ item: cat }) => (
          <TouchableOpacity
            style={[
              styles.filterChip,
              filter === cat && styles.filterChipActive,
            ]}
            onPress={() => setFilter(cat)}
          >
            <Text
              style={[
                styles.filterChipText,
                filter === cat && styles.filterChipTextActive,
              ]}
            >
              {cat}
            </Text>
          </TouchableOpacity>
        )}
      />

      {/* Log list */}
      <FlatList
        ref={flatListRef}
        data={filteredLogs}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        style={styles.list}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="document-text-outline" size={48} color={colors.iconMuted} />
            <Text style={styles.emptyText}>No logs yet</Text>
            <Text style={styles.emptySubtext}>
              Logs appear as the app runs
            </Text>
          </View>
        }
      />
    </View>
  );
}

// ============================================
// STYLES
// ============================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'ios' ? 56 : 16,
    paddingBottom: 12,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backButton: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
  },
  headerActions: {
    flexDirection: 'row',
    gap: 12,
  },
  headerButton: {
    padding: 4,
  },

  // Summary bar
  summaryBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: colors.surface,
  },
  summaryText: {
    fontSize: 13,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  summaryBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  summaryBadgeText: {
    fontSize: 11,
    fontWeight: '600',
  },

  // Filters
  filtersContainer: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 6,
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  filterChipActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  filterChipText: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.textSecondary,
  },
  filterChipTextActive: {
    color: '#FFFFFF',
  },

  // Log list
  list: {
    flex: 1,
  },
  listContent: {
    paddingBottom: 40,
  },
  logRow: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  logHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 3,
  },
  logTime: {
    fontSize: 11,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  categoryBadge: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
  },
  categoryText: {
    fontSize: 10,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  logMessage: {
    fontSize: 13,
    lineHeight: 18,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  logMeta: {
    fontSize: 11,
    lineHeight: 16,
    color: colors.textSecondary,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    marginTop: 4,
    backgroundColor: colors.surface2,
    padding: 8,
    borderRadius: 6,
  },

  // SDK Status Card
  sdkCard: {
    margin: 12,
    padding: 12,
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sdkCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 10,
  },
  sdkCardTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
    flex: 1,
  },
  sdkStatusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  sdkStatusText: {
    fontSize: 12,
    fontWeight: '600',
  },
  sdkGrid: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
  },
  sdkGridItem: {
    flex: 1,
    backgroundColor: colors.surface2,
    padding: 8,
    borderRadius: 8,
    alignItems: 'center',
  },
  sdkLabel: {
    fontSize: 10,
    color: colors.textSecondary,
    fontWeight: '500',
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  sdkValue: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.text,
  },
  sdkActions: {
    flexDirection: 'row',
    gap: 8,
  },
  sdkButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 8,
    backgroundColor: colors.surface2,
    borderRadius: 8,
  },
  sdkButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.primary,
  },
  sdkLogContainer: {
    marginTop: 10,
    backgroundColor: '#0D1117',
    borderRadius: 8,
    padding: 10,
    maxHeight: 300,
  },
  sdkLogHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  sdkLogTitle: {
    fontSize: 11,
    fontWeight: '600',
    color: '#8B949E',
  },
  sdkLogText: {
    fontSize: 10,
    lineHeight: 14,
    color: '#C9D1D9',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  sdkLogTruncated: {
    fontSize: 10,
    color: '#8B949E',
    fontStyle: 'italic',
    marginTop: 4,
  },

  // Empty state
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 80,
    gap: 8,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  emptySubtext: {
    fontSize: 13,
    color: colors.textTertiary,
  },
});
