/**
 * Team Dashboard Screen - OnSite Timekeeper
 *
 * Shows work hours from linked workers (for managers).
 * Uses access grants system to fetch shared records.
 */

import React, { useState, useEffect, useCallback } from 'react';
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
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, borderRadius, spacing } from '../../src/constants/colors';
import {
  getGrantedAccess,
  getMyGrants,
  getAllSharedRecords,
  revokeGrant,
  type AccessGrant,
} from '../../src/lib/accessGrants';
import { QRCodeGenerator, QRCodeScanner } from '../../src/components/sharing';
import { useAuthStore } from '../../src/stores/authStore';
import type { RecordRow } from '../../src/lib/supabase';

// ============================================
// HELPERS
// ============================================

function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
}

function calculateTotalMinutes(records: RecordRow[]): number {
  return records.reduce((total, record) => {
    if (!record.entry_at) return total;
    const entry = new Date(record.entry_at);
    const exit = record.exit_at ? new Date(record.exit_at) : new Date();
    const diff = Math.floor((exit.getTime() - entry.getTime()) / (1000 * 60));
    return total + diff - (record.pause_minutes || 0);
  }, 0);
}

function getRecordsForPeriod(records: RecordRow[], days: number): RecordRow[] {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  cutoff.setHours(0, 0, 0, 0);

  return records.filter((r) => {
    const date = new Date(r.entry_at);
    return date >= cutoff;
  });
}

function getTodayRecords(records: RecordRow[]): RecordRow[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return records.filter((r) => {
    const date = new Date(r.entry_at);
    date.setHours(0, 0, 0, 0);
    return date.getTime() === today.getTime();
  });
}

// ============================================
// WORKER CARD
// ============================================

interface WorkerCardProps {
  name: string;
  records: RecordRow[];
  expanded: boolean;
  onToggle: () => void;
}

function WorkerCard({ name, records, expanded, onToggle }: WorkerCardProps) {
  const todayRecords = getTodayRecords(records);
  const weekRecords = getRecordsForPeriod(records, 7);

  const todayMinutes = calculateTotalMinutes(todayRecords);
  const weekMinutes = calculateTotalMinutes(weekRecords);

  const isWorking = todayRecords.some((r) => !r.exit_at);

  return (
    <View style={styles.workerCard}>
      <TouchableOpacity style={styles.workerHeader} onPress={onToggle}>
        <View style={styles.workerInfo}>
          <View style={[styles.avatar, isWorking && styles.avatarActive]}>
            <Text style={styles.avatarText}>{name[0]?.toUpperCase() || '?'}</Text>
          </View>
          <View>
            <Text style={styles.workerName}>{name}</Text>
            {isWorking && (
              <View style={styles.workingBadge}>
                <View style={styles.workingDot} />
                <Text style={styles.workingText}>Working</Text>
              </View>
            )}
          </View>
        </View>
        <Ionicons
          name={expanded ? 'chevron-up' : 'chevron-down'}
          size={20}
          color={colors.textSecondary}
        />
      </TouchableOpacity>

      <View style={styles.statsRow}>
        <View style={styles.statItem}>
          <Text style={styles.statLabel}>Today</Text>
          <Text style={styles.statValue}>{formatDuration(todayMinutes)}</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={styles.statLabel}>This Week</Text>
          <Text style={styles.statValue}>{formatDuration(weekMinutes)}</Text>
        </View>
      </View>

      {expanded && (
        <View style={styles.expandedContent}>
          <Text style={styles.recentTitle}>Recent Activity</Text>
          {records.slice(0, 5).map((record, index) => (
            <View key={record.id || index} style={styles.recordRow}>
              <View style={styles.recordDate}>
                <Text style={styles.recordDateText}>
                  {new Date(record.entry_at).toLocaleDateString('pt-BR', {
                    weekday: 'short',
                    day: '2-digit',
                    month: 'short',
                  })}
                </Text>
              </View>
              <View style={styles.recordTime}>
                <Text style={styles.recordTimeText}>
                  {new Date(record.entry_at).toLocaleTimeString('pt-BR', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                  {' - '}
                  {record.exit_at
                    ? new Date(record.exit_at).toLocaleTimeString('pt-BR', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })
                    : 'In progress'}
                </Text>
              </View>
              <Text style={styles.recordLocation}>
                {record.location_name || 'Unknown'}
              </Text>
            </View>
          ))}
          {records.length === 0 && (
            <Text style={styles.noRecordsText}>No records yet</Text>
          )}
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
    { ownerId: string; ownerName: string | null; records: RecordRow[] }[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [expandedWorker, setExpandedWorker] = useState<string | null>(null);

  // QR Code state
  const [showQRGenerator, setShowQRGenerator] = useState(false);
  const [showQRScanner, setShowQRScanner] = useState(false);
  const [myGrants, setMyGrants] = useState<AccessGrant[]>([]);
  const [grantedAccess, setGrantedAccess] = useState<AccessGrant[]>([]);

  const loadData = useCallback(async () => {
    const [data, my, granted] = await Promise.all([
      getAllSharedRecords(),
      getMyGrants(),
      getGrantedAccess(),
    ]);
    setWorkers(data);
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
      'Revogar Acesso',
      'Tem certeza que deseja revogar este acesso? O gerente não poderá mais ver suas horas.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Revogar',
          style: 'destructive',
          onPress: async () => {
            const success = await revokeGrant(grantId);
            if (success) loadData();
          },
        },
      ]
    );
  };

  const handleQRScanSuccess = () => {
    setShowQRScanner(false);
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
              <WorkerCard
                key={worker.ownerId}
                name={worker.ownerName || 'Worker'}
                records={worker.records}
                expanded={expandedWorker === worker.ownerId}
                onToggle={() => toggleWorker(worker.ownerId)}
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
    </ScrollView>
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
    gap: spacing.md,
  },
  workerCard: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    overflow: 'hidden',
  },
  workerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.md,
  },
  workerInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarActive: {
    borderWidth: 2,
    borderColor: colors.success,
  },
  avatarText: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.black,
  },
  workerName: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  workingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  workingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.success,
  },
  workingText: {
    fontSize: 12,
    color: colors.success,
    fontWeight: '500',
  },
  statsRow: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.md,
  },
  statDivider: {
    width: 1,
    backgroundColor: colors.border,
  },
  statLabel: {
    fontSize: 12,
    color: colors.textSecondary,
    marginBottom: 4,
  },
  statValue: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
  },
  expandedContent: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    padding: spacing.md,
  },
  recentTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  recordRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  recordDate: {
    width: 80,
  },
  recordDateText: {
    fontSize: 13,
    color: colors.textSecondary,
  },
  recordTime: {
    flex: 1,
  },
  recordTimeText: {
    fontSize: 13,
    color: colors.text,
  },
  recordLocation: {
    fontSize: 12,
    color: colors.textTertiary,
    maxWidth: 100,
  },
  noRecordsText: {
    fontSize: 13,
    color: colors.textSecondary,
    fontStyle: 'italic',
    textAlign: 'center',
    paddingVertical: spacing.md,
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
});
