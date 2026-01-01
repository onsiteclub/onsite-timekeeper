/**
 * History Screen - OnSite Timekeeper
 * Histórico e relatórios de sessões
 */

import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Share, Alert, RefreshControl, Modal } from 'react-native';
import { colors, withOpacity } from '../../src/constants/colors';
import { Card, Button } from '../../src/components/ui/Button';
import { useRegistroStore } from '../../src/stores/registroStore';
import { formatarDuracao, type SessaoComputada } from '../../src/lib/database';
import { gerarRelatorioCompleto, agruparSessoesPorLocal } from '../../src/lib/reports';
import { useAuthStore } from '../../src/stores/authStore';
import { useFocusEffect } from 'expo-router';

type Period = 'today' | 'week' | 'month';

export default function HistoryScreen() {
  const { recarregarDados, getSessoesPeriodo, sessaoAtual } = useRegistroStore();
  const userName = useAuthStore(s => s.getUserName());

  const [period, setPeriod] = useState<Period>('today');
  const [sessoes, setSessoes] = useState<SessaoComputada[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectedSessao, setSelectedSessao] = useState<SessaoComputada | null>(null);
  const [showDetail, setShowDetail] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  const loadSessoes = useCallback(async () => {
    const now = new Date();
    let dataInicio: string;
    let dataFim = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(); // Amanhã para incluir hoje

    switch (period) {
      case 'today':
        const hoje = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
        dataInicio = hoje.toISOString();
        break;
      case 'week':
        const weekAgo = new Date(now);
        weekAgo.setDate(weekAgo.getDate() - 7);
        weekAgo.setHours(0, 0, 0, 0);
        dataInicio = weekAgo.toISOString();
        break;
      case 'month':
        const monthAgo = new Date(now);
        monthAgo.setMonth(monthAgo.getMonth() - 1);
        monthAgo.setHours(0, 0, 0, 0);
        dataInicio = monthAgo.toISOString();
        break;
    }

    const result = await getSessoesPeriodo(dataInicio, dataFim);
    setSessoes(result);
  }, [period, getSessoesPeriodo]);

  // Recarrega quando a tela ganha foco
  useFocusEffect(
    useCallback(() => {
      loadSessoes();
    }, [loadSessoes])
  );

  useEffect(() => {
    loadSessoes();
  }, [period, loadSessoes]);

  // Recarrega quando sessaoAtual muda (sessão finalizada)
  useEffect(() => {
    loadSessoes();
  }, [sessaoAtual, loadSessoes]);

  const onRefresh = async () => {
    setRefreshing(true);
    await recarregarDados();
    await loadSessoes();
    setRefreshing(false);
  };

  const toggleSelect = (id: string) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedIds(newSet);
  };

  const selectAll = () => {
    // Apenas sessões finalizadas podem ser selecionadas para exportação
    const finalizadas = sessoes.filter(s => s.saida);
    if (selectedIds.size === finalizadas.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(finalizadas.map(s => s.id)));
    }
  };

  const handleShowDetail = (sessao: SessaoComputada) => {
    setSelectedSessao(sessao);
    setShowDetail(true);
  };

  const handlePreviewExport = () => {
    const toExport = getSessionsToExport();
    if (toExport.length === 0) {
      Alert.alert('Aviso', 'Selecione pelo menos uma sessão finalizada para exportar');
      return;
    }
    setShowPreview(true);
  };

  const getSessionsToExport = (): SessaoComputada[] => {
    const finalizadas = sessoes.filter(s => s.saida);
    return selectedIds.size > 0
      ? finalizadas.filter(s => selectedIds.has(s.id))
      : finalizadas;
  };

  const handleExport = async () => {
    const toExport = getSessionsToExport();

    if (toExport.length === 0) {
      Alert.alert('Aviso', 'Nenhuma sessão finalizada para exportar');
      return;
    }

    const relatorio = gerarRelatorioCompleto(toExport, userName || undefined);

    try {
      await Share.share({ message: relatorio, title: 'Relatório de Horas' });
      setShowPreview(false);
    } catch (e) {
      Alert.alert('Erro', 'Não foi possível compartilhar');
    }
  };

  // Calcula totais apenas de sessões finalizadas
  const sessoesFinalizadas = sessoes.filter(s => s.saida);
  const totalMinutos = sessoesFinalizadas.reduce((acc, s) => acc + s.duracao_minutos, 0);
  const totalSessoes = sessoesFinalizadas.length;
  const sessoesAtivas = sessoes.filter(s => !s.saida);

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
  };

  const formatTime = (iso: string) => {
    return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  };

  const formatFullDate = (iso: string) => {
    return new Date(iso).toLocaleDateString('pt-BR', { 
      weekday: 'long', 
      day: '2-digit', 
      month: 'long', 
      year: 'numeric' 
    });
  };

  // Preview de exportação agrupado por local
  const grupos = agruparSessoesPorLocal(getSessionsToExport());

  return (
    <View style={styles.container}>
      {/* Period selector */}
      <View style={styles.periodSelector}>
        {([
          { key: 'today', label: 'Hoje' },
          { key: 'week', label: 'Semana' },
          { key: 'month', label: 'Mês' },
        ] as const).map((p) => (
          <TouchableOpacity
            key={p.key}
            style={[styles.periodButton, period === p.key && styles.periodButtonActive]}
            onPress={() => setPeriod(p.key)}
          >
            <Text style={[styles.periodText, period === p.key && styles.periodTextActive]}>{p.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Summary */}
      <View style={styles.summary}>
        <View style={styles.summaryItem}>
          <Text style={styles.summaryValue}>{formatarDuracao(totalMinutos)}</Text>
          <Text style={styles.summaryLabel}>Total</Text>
        </View>
        <View style={styles.summaryDivider} />
        <View style={styles.summaryItem}>
          <Text style={styles.summaryValue}>{totalSessoes}</Text>
          <Text style={styles.summaryLabel}>Finalizadas</Text>
        </View>
        {sessoesAtivas.length > 0 && (
          <>
            <View style={styles.summaryDivider} />
            <View style={styles.summaryItem}>
              <Text style={[styles.summaryValue, { color: colors.success }]}>{sessoesAtivas.length}</Text>
              <Text style={styles.summaryLabel}>Ativas</Text>
            </View>
          </>
        )}
      </View>

      {/* Actions */}
      <View style={styles.actions}>
        <TouchableOpacity style={styles.actionButton} onPress={selectAll}>
          <Text style={styles.actionText}>
            {selectedIds.size === sessoesFinalizadas.length && sessoesFinalizadas.length > 0 ? '☑️ Desmarcar' : '☐ Selecionar'}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionButton} onPress={handlePreviewExport}>
          <Text style={styles.actionText}>📤 Exportar</Text>
        </TouchableOpacity>
      </View>

      {/* Sessions list */}
      <ScrollView
        style={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {sessoes.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>Nenhum registro no período</Text>
          </View>
        ) : (
          sessoes.map((sessao) => {
            const isAtiva = !sessao.saida;
            const isSelected = selectedIds.has(sessao.id);
            
            return (
              <TouchableOpacity
                key={sessao.id}
                style={[
                  styles.sessionCard, 
                  isSelected && styles.sessionCardSelected,
                  isAtiva && styles.sessionCardActive
                ]}
                onPress={() => isAtiva ? null : toggleSelect(sessao.id)}
                onLongPress={() => handleShowDetail(sessao)}
                activeOpacity={0.7}
              >
                <View style={styles.sessionHeader}>
                  <View style={[styles.sessionDot, { backgroundColor: sessao.cor || colors.primary }]} />
                  <Text style={styles.sessionLocal}>{sessao.local_nome}</Text>
                  {isAtiva ? (
                    <View style={styles.activeBadge}>
                      <Text style={styles.activeBadgeText}>🔴 Ativa</Text>
                    </View>
                  ) : (
                    <Text style={styles.sessionDate}>{formatDate(sessao.entrada)}</Text>
                  )}
                </View>
                <View style={styles.sessionBody}>
                  <Text style={styles.sessionTime}>
                    {formatTime(sessao.entrada)} → {sessao.saida ? formatTime(sessao.saida) : 'Em andamento'}
                  </Text>
                  <Text style={[styles.sessionDuration, isAtiva && { color: colors.success }]}>
                    {isAtiva ? '⏱️ Contando...' : formatarDuracao(sessao.duracao_minutos)}
                  </Text>
                </View>
                {sessao.editado_manualmente === 1 && (
                  <Text style={styles.editedBadge}>✏️ Editado</Text>
                )}
              </TouchableOpacity>
            );
          })
        )}
        <View style={{ height: 20 }} />
      </ScrollView>

      {/* Detail Modal */}
      <Modal visible={showDetail} animationType="slide" transparent onRequestClose={() => setShowDetail(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            {selectedSessao && (
              <>
                <Text style={styles.modalTitle}>📋 Detalhes do Registro</Text>
                
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>📍 Local:</Text>
                  <Text style={styles.detailValue}>{selectedSessao.local_nome}</Text>
                </View>
                
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>📅 Data:</Text>
                  <Text style={styles.detailValue}>{formatFullDate(selectedSessao.entrada)}</Text>
                </View>
                
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>🕐 Entrada:</Text>
                  <Text style={styles.detailValue}>{formatTime(selectedSessao.entrada)}</Text>
                </View>
                
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>🕐 Saída:</Text>
                  <Text style={styles.detailValue}>
                    {selectedSessao.saida ? formatTime(selectedSessao.saida) : 'Em andamento'}
                  </Text>
                </View>
                
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>⏱️ Duração:</Text>
                  <Text style={[styles.detailValue, { fontWeight: 'bold', color: colors.primary }]}>
                    {formatarDuracao(selectedSessao.duracao_minutos)}
                  </Text>
                </View>
                
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>📝 Tipo:</Text>
                  <Text style={styles.detailValue}>
                    {selectedSessao.tipo === 'automatico' ? 'Automático (geofence)' : 'Manual'}
                  </Text>
                </View>
                
                {selectedSessao.editado_manualmente === 1 && (
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>⚠️ Status:</Text>
                    <Text style={[styles.detailValue, { color: colors.warning }]}>Horário editado manualmente</Text>
                  </View>
                )}

                <Button title="Fechar" onPress={() => setShowDetail(false)} style={{ marginTop: 20 }} />
              </>
            )}
          </View>
        </View>
      </Modal>

      {/* Preview/Export Modal */}
      <Modal visible={showPreview} animationType="slide" transparent onRequestClose={() => setShowPreview(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>📊 Preview do Relatório</Text>
            
            <ScrollView style={styles.previewScroll}>
              {grupos.length === 0 ? (
                <Text style={styles.emptyText}>Nenhuma sessão selecionada</Text>
              ) : (
                <>
                  {grupos.map((grupo, idx) => (
                    <View key={idx} style={styles.previewGroup}>
                      <Text style={styles.previewGroupTitle}>📍 {grupo.localNome}</Text>
                      {grupo.sessoes.map((s, i) => (
                        <Text key={i} style={styles.previewLine}>
                          {formatDate(s.data)} • {s.entrada} → {s.saida} • {formatarDuracao(s.duracao)}
                        </Text>
                      ))}
                      <Text style={styles.previewSubtotal}>Subtotal: {formatarDuracao(grupo.subtotal)}</Text>
                    </View>
                  ))}
                  
                  <View style={styles.previewTotal}>
                    <Text style={styles.previewTotalText}>
                      TOTAL GERAL: {formatarDuracao(grupos.reduce((acc, g) => acc + g.subtotal, 0))}
                    </Text>
                  </View>
                </>
              )}
            </ScrollView>

            <View style={styles.modalActions}>
              <Button title="Cancelar" variant="ghost" onPress={() => setShowPreview(false)} />
              <Button title="📤 Exportar" onPress={handleExport} />
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.backgroundSecondary },
  periodSelector: { flexDirection: 'row', padding: 16, gap: 8 },
  periodButton: { flex: 1, paddingVertical: 10, borderRadius: 8, backgroundColor: colors.white, alignItems: 'center' },
  periodButtonActive: { backgroundColor: colors.primary },
  periodText: { fontSize: 14, color: colors.textSecondary },
  periodTextActive: { color: colors.white, fontWeight: '600' },
  summary: { flexDirection: 'row', backgroundColor: colors.white, marginHorizontal: 16, borderRadius: 12, padding: 16, marginBottom: 8 },
  summaryItem: { flex: 1, alignItems: 'center' },
  summaryDivider: { width: 1, backgroundColor: colors.border },
  summaryValue: { fontSize: 24, fontWeight: 'bold', color: colors.primary },
  summaryLabel: { fontSize: 12, color: colors.textSecondary, marginTop: 4 },
  actions: { flexDirection: 'row', paddingHorizontal: 16, gap: 12, marginBottom: 8 },
  actionButton: { paddingVertical: 8, paddingHorizontal: 12, backgroundColor: colors.white, borderRadius: 8 },
  actionText: { fontSize: 14, color: colors.text },
  list: { flex: 1, paddingHorizontal: 16 },
  empty: { alignItems: 'center', paddingVertical: 40 },
  emptyText: { fontSize: 16, color: colors.textSecondary },
  sessionCard: { backgroundColor: colors.white, borderRadius: 12, padding: 12, marginBottom: 8 },
  sessionCardSelected: { borderWidth: 2, borderColor: colors.primary },
  sessionCardActive: { backgroundColor: withOpacity(colors.success, 0.1), borderWidth: 1, borderColor: colors.success },
  sessionHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  sessionDot: { width: 10, height: 10, borderRadius: 5, marginRight: 8 },
  sessionLocal: { flex: 1, fontSize: 15, fontWeight: '600', color: colors.text },
  sessionDate: { fontSize: 12, color: colors.textSecondary },
  activeBadge: { backgroundColor: withOpacity(colors.success, 0.2), paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
  activeBadgeText: { fontSize: 11, color: colors.success, fontWeight: '600' },
  sessionBody: { flexDirection: 'row', justifyContent: 'space-between', marginLeft: 18 },
  sessionTime: { fontSize: 14, color: colors.textSecondary },
  sessionDuration: { fontSize: 14, fontWeight: '600', color: colors.primary },
  editedBadge: { fontSize: 11, color: colors.warning, marginTop: 4, marginLeft: 18 },
  
  // Modal styles
  modalOverlay: { flex: 1, backgroundColor: withOpacity(colors.black, 0.5), justifyContent: 'flex-end' },
  modalContent: { backgroundColor: colors.white, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, maxHeight: '80%' },
  modalTitle: { fontSize: 20, fontWeight: 'bold', marginBottom: 20, textAlign: 'center' },
  modalActions: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 16, gap: 12 },
  
  // Detail styles
  detailRow: { flexDirection: 'row', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
  detailLabel: { width: 100, fontSize: 14, color: colors.textSecondary },
  detailValue: { flex: 1, fontSize: 14, color: colors.text },
  
  // Preview styles
  previewScroll: { maxHeight: 300 },
  previewGroup: { marginBottom: 16, padding: 12, backgroundColor: colors.backgroundSecondary, borderRadius: 8 },
  previewGroupTitle: { fontSize: 16, fontWeight: '600', color: colors.text, marginBottom: 8 },
  previewLine: { fontSize: 13, color: colors.textSecondary, marginBottom: 4 },
  previewSubtotal: { fontSize: 14, fontWeight: '600', color: colors.primary, marginTop: 8, textAlign: 'right' },
  previewTotal: { backgroundColor: colors.primary, padding: 16, borderRadius: 8, marginTop: 8 },
  previewTotalText: { fontSize: 18, fontWeight: 'bold', color: colors.white, textAlign: 'center' },
});
