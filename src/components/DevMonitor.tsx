/**
 * DevMonitor - OnSite Timekeeper
 * 
 * Console de debug flutuante para desenvolvimento
 * - Logs em tempo real com filtros
 * - Stats do banco de dados
 * - Funções de debug (purge, reset, force sync)
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Modal,
  Alert,
} from 'react-native';
import { colors, withOpacity } from '../constants/colors';
import {
  addLogListener,
  getStoredLogs,
  clearLogs,
  exportLogsAsText,
  type LogEntry,
} from '../lib/logger';
import { getDbStats, resetDatabase, purgeLocaisDeletados, getSyncLogs } from '../lib/database';
import { useSyncStore } from '../stores/syncStore';
import { useLocationStore } from '../stores/locationStore';
import { useRegistroStore } from '../stores/registroStore';
import { useSettingsStore } from '../stores/settingsStore';
import { Share } from 'react-native';

// ============================================
// TIPOS
// ============================================

type LogLevel = 'all' | 'debug' | 'info' | 'warn' | 'error';

interface DbStats {
  locais_total: number;
  locais_ativos: number;
  locais_deletados: number;
  registros_total: number;
  registros_abertos: number;
  sync_logs: number;
}

// ============================================
// COMPONENTE PRINCIPAL
// ============================================

export function DevMonitor() {
  const devMonitorHabilitado = useSettingsStore(state => state.devMonitorHabilitado);
  const [isOpen, setIsOpen] = useState(false);

  if (!devMonitorHabilitado) return null;

  return (
    <>
      {/* Botão flutuante */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => setIsOpen(true)}
        activeOpacity={0.8}
      >
        <Text style={styles.fabText}>🔍</Text>
      </TouchableOpacity>

      {/* Modal de logs */}
      <Modal
        visible={isOpen}
        animationType="slide"
        transparent={false}
        onRequestClose={() => setIsOpen(false)}
      >
        <DevMonitorContent onClose={() => setIsOpen(false)} />
      </Modal>
    </>
  );
}

// ============================================
// CONTEÚDO DO DEV MONITOR
// ============================================

function DevMonitorContent({ onClose }: { onClose: () => void }) {
  const [activeTab, setActiveTab] = useState<'logs' | 'stats' | 'actions'>('logs');
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [filter, setFilter] = useState<LogLevel>('all');
  const [dbStats, setDbStats] = useState<DbStats | null>(null);

  // Stores
  const syncStore = useSyncStore();
  const locationStore = useLocationStore();
  const registroStore = useRegistroStore();

  // Carrega logs iniciais
  useEffect(() => {
    setLogs(getStoredLogs());
  }, []);

  // Listener para novos logs
  useEffect(() => {
    const unsubscribe = addLogListener((entry) => {
      setLogs(prev => [...prev, entry].slice(-500));
    });
    return unsubscribe;
  }, []);

  // Carrega stats do DB
  useEffect(() => {
    if (activeTab === 'stats') {
      loadDbStats();
    }
  }, [activeTab]);

  const loadDbStats = async () => {
    const stats = await getDbStats();
    setDbStats(stats);
  };

  // Filtro de logs
  const filteredLogs = filter === 'all'
    ? logs
    : logs.filter(l => l.level === filter);

  // Handlers
  const handleClearLogs = () => {
    Alert.alert('Limpar Logs', 'Deseja limpar todos os logs?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Limpar', style: 'destructive', onPress: () => {
        clearLogs();
        setLogs([]);
      }},
    ]);
  };

  const handleExportLogs = async () => {
    const text = exportLogsAsText();
    await Share.share({ message: text, title: 'OnSite Logs' });
  };

  const handlePurge = async () => {
    Alert.alert('Purge', 'Remover locais deletados há mais de 7 dias?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Purge', onPress: async () => {
        const count = await purgeLocaisDeletados(7);
        Alert.alert('Concluído', `${count} locais removidos`);
        loadDbStats();
      }},
    ]);
  };

  const handleForceSync = async () => {
    const result = await syncStore.debugSync();
    if (result.success) {
      Alert.alert('✅ Sync OK', `Locais: ↑${result.stats?.uploadedLocais} ↓${result.stats?.downloadedLocais}\nRegistros: ↑${result.stats?.uploadedRegistros} ↓${result.stats?.downloadedRegistros}`);
    } else {
      Alert.alert('❌ Sync Falhou', result.error || 'Erro desconhecido');
    }
    loadDbStats();
  };

  const handleResetDb = () => {
    Alert.alert(
      '⚠️ RESET DATABASE',
      'Isso apagará TODOS os dados locais. Tem certeza?',
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'APAGAR TUDO', style: 'destructive', onPress: async () => {
          await resetDatabase();
          await locationStore.recarregarLocais();
          await registroStore.recarregarDados();
          Alert.alert('Reset', 'Database resetado');
          loadDbStats();
        }},
      ]
    );
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>🔍 DevMonitor</Text>
        <TouchableOpacity onPress={onClose} style={styles.closeButton}>
          <Text style={styles.closeButtonText}>✕</Text>
        </TouchableOpacity>
      </View>

      {/* Tabs */}
      <View style={styles.tabs}>
        {(['logs', 'stats', 'actions'] as const).map((tab) => (
          <TouchableOpacity
            key={tab}
            style={[styles.tab, activeTab === tab && styles.tabActive]}
            onPress={() => setActiveTab(tab)}
          >
            <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>
              {tab === 'logs' ? '📜 Logs' : tab === 'stats' ? '📊 Stats' : '🛠️ Actions'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Conteúdo */}
      {activeTab === 'logs' && (
        <View style={styles.content}>
          {/* Filtros */}
          <View style={styles.filters}>
            {(['all', 'debug', 'info', 'warn', 'error'] as const).map((level) => (
              <TouchableOpacity
                key={level}
                style={[styles.filterButton, filter === level && styles.filterButtonActive]}
                onPress={() => setFilter(level)}
              >
                <Text style={[styles.filterText, filter === level && styles.filterTextActive]}>
                  {level.toUpperCase()}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Lista de logs */}
          <ScrollView style={styles.logsList}>
            {filteredLogs.slice().reverse().map((log) => (
              <View key={log.id} style={[styles.logItem, styles[`log_${log.level}`]]}>
                <Text style={styles.logTime}>
                  {log.timestamp.toLocaleTimeString('pt-BR')}
                </Text>
                <Text style={styles.logCategory}>[{log.category}]</Text>
                <Text style={styles.logMessage} numberOfLines={2}>
                  {log.message}
                </Text>
              </View>
            ))}
          </ScrollView>

          {/* Botões */}
          <View style={styles.logActions}>
            <TouchableOpacity style={styles.actionButton} onPress={handleClearLogs}>
              <Text style={styles.actionButtonText}>🗑️ Limpar</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionButton} onPress={handleExportLogs}>
              <Text style={styles.actionButtonText}>📤 Exportar</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {activeTab === 'stats' && (
        <ScrollView style={styles.content}>
          <View style={styles.statsContainer}>
            <Text style={styles.statsTitle}>📦 Database</Text>
            {dbStats && (
              <>
                <StatRow label="Locais (total)" value={dbStats.locais_total} />
                <StatRow label="Locais (ativos)" value={dbStats.locais_ativos} color={colors.success} />
                <StatRow label="Locais (deletados)" value={dbStats.locais_deletados} color={colors.error} />
                <StatRow label="Registros (total)" value={dbStats.registros_total} />
                <StatRow label="Registros (abertos)" value={dbStats.registros_abertos} color={colors.warning} />
                <StatRow label="Sync logs" value={dbStats.sync_logs} />
              </>
            )}

            <Text style={[styles.statsTitle, { marginTop: 20 }]}>🔄 Sync</Text>
            <StatRow label="Online" value={syncStore.isOnline ? 'Sim' : 'Não'} color={syncStore.isOnline ? colors.success : colors.error} />
            <StatRow label="Syncing" value={syncStore.isSyncing ? 'Sim' : 'Não'} />
            <StatRow label="Auto-sync" value={syncStore.autoSyncEnabled ? 'ON' : 'OFF'} />
            <StatRow label="Último sync" value={syncStore.lastSyncAt ? syncStore.lastSyncAt.toLocaleTimeString('pt-BR') : 'Nunca'} />
            {syncStore.lastSyncStats && (
              <>
                <StatRow label="↑ Locais" value={syncStore.lastSyncStats.uploadedLocais} color={colors.info} />
                <StatRow label="↑ Registros" value={syncStore.lastSyncStats.uploadedRegistros} color={colors.info} />
                <StatRow label="↓ Locais" value={syncStore.lastSyncStats.downloadedLocais} color={colors.success} />
                <StatRow label="↓ Registros" value={syncStore.lastSyncStats.downloadedRegistros} color={colors.success} />
                {syncStore.lastSyncStats.errors.length > 0 && (
                  <StatRow label="Erros" value={syncStore.lastSyncStats.errors.length} color={colors.error} />
                )}
              </>
            )}

            <Text style={[styles.statsTitle, { marginTop: 20 }]}>📍 Location</Text>
            <StatRow label="Geofencing" value={locationStore.isGeofencingAtivo ? 'Ativo' : 'Inativo'} color={locationStore.isGeofencingAtivo ? colors.success : colors.textSecondary} />
            <StatRow label="Polling" value={locationStore.isPollingAtivo ? 'Ativo' : 'Inativo'} />
            <StatRow label="Dentro de" value={locationStore.geofenceAtivo ? locationStore.locais.find(l => l.id === locationStore.geofenceAtivo)?.nome || 'N/A' : 'Nenhum'} />
            <StatRow label="Precisão GPS" value={locationStore.precisao ? `${locationStore.precisao.toFixed(0)}m` : 'N/A'} />

            <TouchableOpacity style={[styles.actionButton, { marginTop: 20 }]} onPress={loadDbStats}>
              <Text style={styles.actionButtonText}>🔄 Atualizar</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      )}

      {activeTab === 'actions' && (
        <ScrollView style={styles.content}>
          <View style={styles.actionsContainer}>
            <Text style={styles.statsTitle}>🔄 Sincronização</Text>
            <TouchableOpacity style={styles.bigButton} onPress={handleForceSync}>
              <Text style={styles.bigButtonText}>🔄 Force Full Sync</Text>
              <Text style={styles.bigButtonDesc}>Reconcilia e sincroniza tudo</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.bigButton} onPress={() => syncStore.toggleAutoSync()}>
              <Text style={styles.bigButtonText}>
                {syncStore.autoSyncEnabled ? '⏸️ Desativar Auto-Sync' : '▶️ Ativar Auto-Sync'}
              </Text>
            </TouchableOpacity>

            <Text style={[styles.statsTitle, { marginTop: 20 }]}>🧹 Limpeza</Text>
            <TouchableOpacity style={styles.bigButton} onPress={handlePurge}>
              <Text style={styles.bigButtonText}>🧹 Purge Deletados</Text>
              <Text style={styles.bigButtonDesc}>Remove locais deletados há mais de 7 dias</Text>
            </TouchableOpacity>

            <Text style={[styles.statsTitle, { marginTop: 20 }]}>⚠️ Danger Zone</Text>
            <TouchableOpacity style={[styles.bigButton, styles.dangerButton]} onPress={handleResetDb}>
              <Text style={styles.bigButtonText}>💥 RESET DATABASE</Text>
              <Text style={styles.bigButtonDesc}>Apaga todos os dados locais</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      )}
    </View>
  );
}

// ============================================
// STAT ROW
// ============================================

function StatRow({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <View style={styles.statRow}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statValue, color && { color }]}>{value}</Text>
    </View>
  );
}

// ============================================
// STYLES
// ============================================

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    bottom: 100,
    right: 20,
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
    zIndex: 1000,
  },
  fabText: {
    fontSize: 24,
  },

  container: {
    flex: 1,
    backgroundColor: colors.backgroundSecondary,
  },

  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    paddingTop: 50,
    backgroundColor: colors.primary,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.white,
  },
  closeButton: {
    padding: 8,
  },
  closeButtonText: {
    fontSize: 24,
    color: colors.white,
  },

  tabs: {
    flexDirection: 'row',
    backgroundColor: colors.white,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
  },
  tabActive: {
    borderBottomWidth: 2,
    borderBottomColor: colors.primary,
  },
  tabText: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  tabTextActive: {
    color: colors.primary,
    fontWeight: '600',
  },

  content: {
    flex: 1,
  },

  // Logs
  filters: {
    flexDirection: 'row',
    padding: 8,
    backgroundColor: colors.white,
    gap: 4,
  },
  filterButton: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 4,
    backgroundColor: colors.backgroundSecondary,
  },
  filterButtonActive: {
    backgroundColor: colors.primary,
  },
  filterText: {
    fontSize: 10,
    color: colors.textSecondary,
  },
  filterTextActive: {
    color: colors.white,
  },

  logsList: {
    flex: 1,
    padding: 8,
  },
  logItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 6,
    marginBottom: 4,
    borderRadius: 4,
    backgroundColor: colors.white,
  },
  log_debug: {
    borderLeftWidth: 3,
    borderLeftColor: colors.info,
  },
  log_info: {
    borderLeftWidth: 3,
    borderLeftColor: colors.success,
  },
  log_warn: {
    borderLeftWidth: 3,
    borderLeftColor: colors.warning,
  },
  log_error: {
    borderLeftWidth: 3,
    borderLeftColor: colors.error,
  },
  logTime: {
    fontSize: 10,
    color: colors.textTertiary,
    width: 55,
  },
  logCategory: {
    fontSize: 10,
    color: colors.textSecondary,
    width: 70,
  },
  logMessage: {
    flex: 1,
    fontSize: 11,
    color: colors.text,
  },

  logActions: {
    flexDirection: 'row',
    padding: 8,
    gap: 8,
    backgroundColor: colors.white,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },

  // Stats
  statsContainer: {
    padding: 16,
  },
  statsTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 12,
  },
  statRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  statLabel: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  statValue: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.text,
  },

  // Actions
  actionsContainer: {
    padding: 16,
  },
  actionButton: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 16,
    backgroundColor: colors.backgroundSecondary,
    borderRadius: 8,
    alignItems: 'center',
  },
  actionButtonText: {
    fontSize: 14,
    color: colors.text,
  },

  bigButton: {
    padding: 16,
    backgroundColor: colors.white,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  bigButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  bigButtonDesc: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 4,
  },
  dangerButton: {
    borderColor: colors.error,
    backgroundColor: colors.errorLight,
  },
});
