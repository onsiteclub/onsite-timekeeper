/**
 * Team Dashboard Screen - OnSite Timekeeper
 *
 * Shows work hours from linked workers (for managers).
 * Compact bar layout with archive system for paid/viewed hours.
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  Alert,
  TextInput,
  Platform,
  KeyboardAvoidingView,
  StatusBar,
} from 'react-native';
import Constants from 'expo-constants';
import { Ionicons } from '@expo/vector-icons';
import { colors, borderRadius, spacing } from '../../src/constants/colors';
import {
  getGrantedAccess,
  getMyGrants,
  getAllSharedRecords,
  revokeGrant,
  unlinkWorker,
  updateGrantLabel,
  getArchivedIds,
  archiveRecords,
  type AccessGrant,
  type SharedDailyHour,
} from '../../src/lib/accessGrants';
import { QRCodeGenerator, QRCodeScanner } from '../../src/components/sharing';
import { useAuthStore } from '../../src/stores/authStore';

// ============================================
// HELPERS
// ============================================

function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
}

function calculateTotalMinutes(records: SharedDailyHour[]): number {
  return records.reduce((total, record) => {
    return total + (record.total_minutes - record.break_minutes);
  }, 0);
}

// ============================================
// WORKER BAR (Compact)
// ============================================

interface WorkerBarProps {
  name: string;
  records: SharedDailyHour[];
  archivedIds: Set<string>;
  expanded: boolean;
  onToggle: () => void;
  onRemove: () => void;
  onArchive: (recordIds: string[]) => void;
  onEditName: () => void;
}

function WorkerBar({
  name,
  records,
  archivedIds,
  expanded,
  onToggle,
  onRemove,
  onArchive,
  onEditName,
}: WorkerBarProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showArchived, setShowArchived] = useState(false);

  const pendingRecords = records.filter(r => !archivedIds.has(r.id));
  const archivedRecords = records.filter(r => archivedIds.has(r.id));
  const pendingMinutes = calculateTotalMinutes(pendingRecords);

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleArchiveSelected = () => {
    if (selectedIds.size === 0) return;
    onArchive(Array.from(selectedIds));
    setSelectedIds(new Set());
  };

  const handleArchiveAll = () => {
    const ids = pendingRecords.map(r => r.id);
    if (ids.length === 0) return;
    onArchive(ids);
    setSelectedIds(new Set());
  };

  const formatRecordDate = (dateStr: string) => {
    // work_date is YYYY-MM-DD, parse as local date
    const [year, month, day] = dateStr.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    return date.toLocaleDateString('en-US', {
      day: '2-digit',
      month: 'short',
    });
  };

  const formatTimeRange = (record: SharedDailyHour): string => {
    const parts: string[] = [];
    if (record.first_entry) parts.push(record.first_entry);
    if (record.last_exit) parts.push(record.last_exit);
    if (parts.length === 2) return `${parts[0]} - ${parts[1]}`;
    if (parts.length === 1) return parts[0];
    return formatDuration(record.total_minutes);
  };

  return (
    <View style={styles.workerCard}>
      {/* Compact Bar */}
      <TouchableOpacity style={styles.compactBar} onPress={onToggle}>
        <View style={styles.barLeft}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{name[0]?.toUpperCase() || '?'}</Text>
          </View>
          <Text style={styles.barName} numberOfLines={1}>{name}</Text>
          <TouchableOpacity
            style={styles.editNameBtn}
            onPress={(e) => { e.stopPropagation(); onEditName(); }}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="pencil-outline" size={14} color={colors.textMuted} />
          </TouchableOpacity>
        </View>
        <View style={styles.barRight}>
          <Text style={styles.barHours}>{formatDuration(pendingMinutes)}</Text>
          <Ionicons
            name={expanded ? 'chevron-up' : 'chevron-down'}
            size={18}
            color={colors.textSecondary}
          />
        </View>
      </TouchableOpacity>

      {/* Expanded Content */}
      {expanded && (
        <View style={styles.expandedContent}>
          {/* Pending Records */}
          {pendingRecords.length > 0 && (
            <>
              <Text style={styles.sectionLabel}>Pending Hours</Text>
              {pendingRecords.map(record => (
                <TouchableOpacity
                  key={record.id}
                  style={styles.recordRow}
                  onPress={() => toggleSelect(record.id)}
                  activeOpacity={0.6}
                >
                  <View style={styles.checkboxArea}>
                    <Ionicons
                      name={selectedIds.has(record.id) ? 'checkbox' : 'square-outline'}
                      size={20}
                      color={selectedIds.has(record.id) ? colors.primary : colors.textMuted}
                    />
                  </View>
                  <Text style={styles.recordDate}>{formatRecordDate(record.work_date)}</Text>
                  <Text style={styles.recordTime}>
                    {formatTimeRange(record)}
                  </Text>
                  <Text style={styles.recordHours}>
                    {formatDuration(record.total_minutes)}
                  </Text>
                  <Text style={styles.recordLocation} numberOfLines={1}>
                    {record.location_name || ''}
                  </Text>
                </TouchableOpacity>
              ))}

              {/* Archive Buttons */}
              <View style={styles.archiveActions}>
                <TouchableOpacity
                  style={[styles.archiveBtn, selectedIds.size === 0 && styles.archiveBtnDisabled]}
                  onPress={handleArchiveSelected}
                  disabled={selectedIds.size === 0}
                >
                  <Text style={[styles.archiveBtnText, selectedIds.size === 0 && styles.archiveBtnTextDisabled]}>
                    Archive ({selectedIds.size})
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.archiveBtn} onPress={handleArchiveAll}>
                  <Text style={styles.archiveBtnText}>Archive All</Text>
                </TouchableOpacity>
              </View>
            </>
          )}

          {pendingRecords.length === 0 && archivedRecords.length === 0 && (
            <Text style={styles.noRecordsText}>No records yet</Text>
          )}

          {pendingRecords.length === 0 && archivedRecords.length > 0 && (
            <Text style={styles.allArchivedText}>All hours archived</Text>
          )}

          {/* Archived Section */}
          {archivedRecords.length > 0 && (
            <>
              <TouchableOpacity
                style={styles.archivedToggle}
                onPress={() => setShowArchived(!showArchived)}
              >
                <Ionicons
                  name={showArchived ? 'chevron-down' : 'chevron-forward'}
                  size={16}
                  color={colors.textMuted}
                />
                <Text style={styles.archivedToggleText}>
                  Archived ({archivedRecords.length})
                </Text>
              </TouchableOpacity>

              {showArchived && archivedRecords.map(record => (
                <View key={record.id} style={styles.archivedRow}>
                  <Ionicons name="archive-outline" size={14} color={colors.textMuted} />
                  <Text style={styles.archivedDate}>{formatRecordDate(record.work_date)}</Text>
                  <Text style={styles.archivedTime}>
                    {formatTimeRange(record)}
                  </Text>
                  <Text style={styles.archivedHours}>
                    {formatDuration(record.total_minutes)}
                  </Text>
                  <Text style={styles.archivedLocation} numberOfLines={1}>
                    {record.location_name || ''}
                  </Text>
                </View>
              ))}
            </>
          )}

          {/* Remove Worker */}
          <TouchableOpacity style={styles.removeWorkerBtn} onPress={onRemove}>
            <Ionicons name="person-remove-outline" size={16} color={colors.error} />
            <Text style={styles.removeWorkerBtnText}>Remove from team</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

// ============================================
// MAIN SCREEN
// ============================================

export default function TeamScreen() {
  const { user } = useAuthStore();
  const [workers, setWorkers] = useState<
    { ownerId: string; ownerName: string | null; records: SharedDailyHour[] }[]
  >([]);
  const [archivedMap, setArchivedMap] = useState<Record<string, Set<string>>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [expandedWorker, setExpandedWorker] = useState<string | null>(null);

  // QR Code state
  const [showQRGenerator, setShowQRGenerator] = useState(false);
  const [showQRScanner, setShowQRScanner] = useState(false);
  const [myGrants, setMyGrants] = useState<AccessGrant[]>([]);
  const [grantedAccess, setGrantedAccess] = useState<AccessGrant[]>([]);

  // Naming modal state
  const [namingModal, setNamingModal] = useState<{
    visible: boolean;
    ownerId: string;
    currentName: string;
  }>({ visible: false, ownerId: '', currentName: '' });
  const [nameInput, setNameInput] = useState('');
  const nameInputRef = useRef<TextInput>(null);

  const loadData = useCallback(async () => {
    const [data, my, granted] = await Promise.all([
      getAllSharedRecords(),
      getMyGrants(),
      getGrantedAccess(),
    ]);

    // Load archived IDs for each worker
    const archMap: Record<string, Set<string>> = {};
    await Promise.all(
      data.map(async (w) => {
        archMap[w.ownerId] = await getArchivedIds(w.ownerId);
      })
    );

    setWorkers(data);
    setArchivedMap(archMap);
    setMyGrants(my);
    setGrantedAccess(granted);
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadData();
  }, [loadData]);

  const toggleWorker = (ownerId: string) => {
    setExpandedWorker((prev) => (prev === ownerId ? null : ownerId));
  };

  const handleRevokeGrant = async (grantId: string) => {
    Alert.alert(
      'Revoke Access',
      'Are you sure? The manager will no longer be able to see your hours.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Revoke',
          style: 'destructive',
          onPress: async () => {
            const success = await revokeGrant(grantId);
            if (success) loadData();
          },
        },
      ]
    );
  };

  const handleUnlinkWorker = async (ownerId: string, ownerName: string) => {
    const grant = grantedAccess.find(g => g.owner_id === ownerId);
    if (!grant) return;

    Alert.alert(
      'Remove Worker',
      `Remove "${ownerName}" from your team? You will no longer see their hours.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            const success = await unlinkWorker(grant.id);
            if (success) loadData();
          },
        },
      ]
    );
  };

  const handleArchive = async (ownerId: string, recordIds: string[]) => {
    await archiveRecords(ownerId, recordIds);
    // Update local state immediately
    setArchivedMap(prev => {
      const next = { ...prev };
      const existing = new Set(prev[ownerId] || []);
      recordIds.forEach(id => existing.add(id));
      next[ownerId] = existing;
      return next;
    });
  };

  const handleQRScanSuccess = (ownerId: string, ownerName?: string) => {
    setShowQRScanner(false);
    loadData();
    // Show naming modal so manager can set a recognizable name
    const defaultName = ownerName || '';
    setNameInput(defaultName);
    setNamingModal({ visible: true, ownerId, currentName: defaultName });
  };

  const openEditName = (ownerId: string, currentName: string) => {
    setNameInput(currentName);
    setNamingModal({ visible: true, ownerId, currentName });
  };

  const handleSaveName = async () => {
    const trimmed = nameInput.trim();
    if (!trimmed || !namingModal.ownerId) {
      setNamingModal({ visible: false, ownerId: '', currentName: '' });
      return;
    }
    await updateGrantLabel(namingModal.ownerId, trimmed);
    setNamingModal({ visible: false, ownerId: '', currentName: '' });
    loadData();
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Loading team data...</Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {/* Status bar strip */}
      <StatusBar barStyle="dark-content" backgroundColor={colors.background} />
      <View style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: Constants.statusBarHeight || 28,
        backgroundColor: colors.background,
        zIndex: 1,
      }} />

      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
          />
        }
      >
        <View style={styles.header}>
        <Text style={styles.title}>Team</Text>
        <Text style={styles.subtitle}>
          {workers.length} worker{workers.length !== 1 ? 's' : ''} linked
        </Text>
      </View>

      {/* QR Code Actions */}
      <View style={styles.qrActions}>
        <TouchableOpacity
          style={styles.qrActionButton}
          onPress={() => setShowQRGenerator(true)}
        >
          <Ionicons name="qr-code-outline" size={24} color={colors.primary} />
          <Text style={styles.qrActionText}>Share My Hours</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.qrActionButton}
          onPress={() => setShowQRScanner(true)}
        >
          <Ionicons name="scan-outline" size={24} color={colors.info} />
          <Text style={styles.qrActionText}>Scan QR Code</Text>
        </TouchableOpacity>
      </View>

      {/* Active Grants (who can see my hours) */}
      {myGrants.filter(g => g.status === 'active').length > 0 && (
        <View style={styles.activeGrantsSection}>
          <Text style={styles.sectionTitle}>Who Can See My Hours</Text>
          {myGrants.filter(g => g.status === 'active').map(grant => (
            <View key={grant.id} style={styles.grantCard}>
              <View style={styles.grantInfo}>
                <Ionicons name="eye-outline" size={20} color={colors.success} />
                <Text style={styles.grantLabel}>{grant.label || 'Manager'}</Text>
              </View>
              <TouchableOpacity
                style={styles.grantRevokeBtn}
                onPress={() => handleRevokeGrant(grant.id)}
              >
                <Text style={styles.grantRevokeBtnText}>Revoke</Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}

      {/* Workers List */}
      {workers.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="people-outline" size={64} color={colors.textMuted} />
          <Text style={styles.emptyTitle}>No Workers Linked</Text>
          <Text style={styles.emptyText}>
            Ask workers to share their access with you by scanning their QR code above.
          </Text>
        </View>
      ) : (
        <>
          <Text style={styles.sectionTitle}>Workers I Follow</Text>
          <View style={styles.workersList}>
            {workers.map((worker) => (
              <WorkerBar
                key={worker.ownerId}
                name={worker.ownerName || 'Worker'}
                records={worker.records}
                archivedIds={archivedMap[worker.ownerId] || new Set()}
                expanded={expandedWorker === worker.ownerId}
                onToggle={() => toggleWorker(worker.ownerId)}
                onRemove={() => handleUnlinkWorker(worker.ownerId, worker.ownerName || 'Worker')}
                onArchive={(ids) => handleArchive(worker.ownerId, ids)}
                onEditName={() => openEditName(worker.ownerId, worker.ownerName || '')}
              />
            ))}
          </View>
        </>
      )}

      {/* QR Code Generator Modal */}
      <Modal
        visible={showQRGenerator}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowQRGenerator(false)}
      >
        <View style={styles.qrModalContainer}>
          <QRCodeGenerator
            ownerName={user?.email?.split('@')[0]}
            onClose={() => setShowQRGenerator(false)}
          />
        </View>
      </Modal>

      {/* QR Code Scanner Modal */}
      <Modal
        visible={showQRScanner}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => setShowQRScanner(false)}
      >
        <QRCodeScanner
          onSuccess={handleQRScanSuccess}
          onCancel={() => setShowQRScanner(false)}
        />
      </Modal>

      {/* Naming Modal */}
      <Modal
        visible={namingModal.visible}
        transparent
        animationType="fade"
        onRequestClose={() => setNamingModal({ visible: false, ownerId: '', currentName: '' })}
      >
        <KeyboardAvoidingView
          style={styles.namingOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <View style={styles.namingContainer}>
            <Text style={styles.namingTitle}>Worker Name</Text>
            <Text style={styles.namingSubtitle}>
              Enter a name to identify this worker
            </Text>
            <TextInput
              ref={nameInputRef}
              style={styles.namingInput}
              value={nameInput}
              onChangeText={setNameInput}
              placeholder="e.g. John, Maria..."
              placeholderTextColor={colors.textMuted}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={handleSaveName}
              maxLength={50}
            />
            <View style={styles.namingActions}>
              <TouchableOpacity
                style={styles.namingCancelBtn}
                onPress={() => setNamingModal({ visible: false, ownerId: '', currentName: '' })}
              >
                <Text style={styles.namingCancelText}>Skip</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.namingSaveBtn, !nameInput.trim() && styles.namingSaveBtnDisabled]}
                onPress={handleSaveName}
                disabled={!nameInput.trim()}
              >
                <Text style={styles.namingSaveText}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
      </ScrollView>
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
  content: {
    padding: spacing.md,
    paddingTop: (Constants.statusBarHeight || 28) + 12,
    paddingBottom: spacing.xxl,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
  },
  loadingText: {
    marginTop: spacing.md,
    fontSize: 14,
    color: colors.textSecondary,
  },
  header: {
    marginBottom: spacing.lg,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: colors.text,
  },
  subtitle: {
    fontSize: 14,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: spacing.xxl,
    paddingHorizontal: spacing.lg,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.text,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  emptyText: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
  workersList: {
    gap: spacing.sm,
  },

  // Compact Bar
  workerCard: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    overflow: 'hidden',
  },
  compactBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  barLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flex: 1,
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.black,
  },
  barName: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
    flexShrink: 1,
  },
  editNameBtn: {
    padding: 2,
    marginLeft: 4,
  },
  barRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  barHours: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.primary,
  },

  // Expanded Content
  expandedContent: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    padding: spacing.md,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.sm,
  },
  recordRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    gap: 6,
  },
  checkboxArea: {
    width: 24,
    alignItems: 'center',
  },
  recordDate: {
    fontSize: 13,
    color: colors.textSecondary,
    width: 52,
  },
  recordTime: {
    fontSize: 13,
    color: colors.text,
    flex: 1,
  },
  recordHours: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.primary,
    minWidth: 48,
    textAlign: 'right',
  },
  recordLocation: {
    fontSize: 12,
    color: colors.textTertiary,
    maxWidth: 80,
  },

  // Archive Actions
  archiveActions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  archiveBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: borderRadius.sm,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
  },
  archiveBtnDisabled: {
    opacity: 0.4,
  },
  archiveBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.primary,
  },
  archiveBtnTextDisabled: {
    color: colors.textMuted,
  },

  // Archived Section
  archivedToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: spacing.md,
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  archivedToggleText: {
    fontSize: 13,
    color: colors.textMuted,
    fontWeight: '500',
  },
  archivedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    gap: 6,
    opacity: 0.5,
  },
  archivedDate: {
    fontSize: 12,
    color: colors.textMuted,
    width: 52,
  },
  archivedTime: {
    fontSize: 12,
    color: colors.textMuted,
    flex: 1,
  },
  archivedHours: {
    fontSize: 12,
    color: colors.textMuted,
    minWidth: 48,
    textAlign: 'right',
  },
  archivedLocation: {
    fontSize: 11,
    color: colors.textMuted,
    maxWidth: 80,
  },

  noRecordsText: {
    fontSize: 13,
    color: colors.textSecondary,
    fontStyle: 'italic',
    textAlign: 'center',
    paddingVertical: spacing.md,
  },
  allArchivedText: {
    fontSize: 13,
    color: colors.success,
    textAlign: 'center',
    paddingVertical: spacing.sm,
    fontWeight: '500',
  },
  removeWorkerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    marginTop: spacing.md,
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  removeWorkerBtnText: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.error,
  },

  // QR Actions
  qrActions: {
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  qrActionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  qrActionText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },

  // Section titles
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: spacing.sm,
    marginTop: spacing.sm,
  },

  // Active Grants
  activeGrantsSection: {
    marginBottom: spacing.md,
  },
  grantCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.card,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  grantInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  grantLabel: {
    fontSize: 15,
    color: colors.text,
    fontWeight: '500',
  },
  grantRevokeBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: colors.errorSoft,
  },
  grantRevokeBtnText: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.error,
  },

  // QR Modal
  qrModalContainer: {
    flex: 1,
    backgroundColor: colors.background,
    justifyContent: 'center',
    padding: 20,
  },

  // Naming Modal
  namingOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  namingContainer: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
  },
  namingTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 4,
  },
  namingSubtitle: {
    fontSize: 13,
    color: colors.textSecondary,
    marginBottom: spacing.md,
  },
  namingInput: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    fontSize: 16,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
  },
  namingActions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  namingCancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: borderRadius.md,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
  },
  namingCancelText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  namingSaveBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: borderRadius.md,
    backgroundColor: colors.primary,
    alignItems: 'center',
  },
  namingSaveBtnDisabled: {
    opacity: 0.4,
  },
  namingSaveText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.black,
  },
});
