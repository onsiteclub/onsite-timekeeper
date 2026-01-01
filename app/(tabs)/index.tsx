/**
 * Home/Dashboard Screen - OnSite Timekeeper
 */

import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { colors, withOpacity } from '../../src/constants/colors';
import { Card } from '../../src/components/ui/Button';
import { useAuthStore } from '../../src/stores/authStore';
import { useLocationStore } from '../../src/stores/locationStore';
import { useRegistroStore } from '../../src/stores/registroStore';
import { useSyncStore } from '../../src/stores/syncStore';
import { formatarDuracao } from '../../src/lib/database';

export default function HomeScreen() {
  const userName = useAuthStore(s => s.getUserName());
  const { locais, geofenceAtivo, isGeofencingAtivo, precisao } = useLocationStore();
  const { 
    sessaoAtual, 
    estatisticasHoje, 
    sessoesHoje, 
    recarregarDados, 
    registrarSaida, 
    registrarEntrada,
    compartilharUltimaSessao, 
    ultimaSessaoFinalizada, 
    limparUltimaSessao 
  } = useRegistroStore();
  const { isOnline, lastSyncAt, syncNow } = useSyncStore();

  const [refreshing, setRefreshing] = useState(false);
  const [cronometro, setCronometro] = useState('00:00:00');
  const [isPaused, setIsPaused] = useState(false);

  // Local ativo (fence onde está)
  const localAtivo = geofenceAtivo ? locais.find(l => l.id === geofenceAtivo) : null;
  
  // Está dentro de um local mas sem sessão ativa? Pode recomeçar!
  const podeRecomecar = localAtivo && !sessaoAtual;

  useEffect(() => {
    if (!sessaoAtual || sessaoAtual.status !== 'ativa') {
      setCronometro('00:00:00');
      setIsPaused(false);
      return;
    }

    if (isPaused) return;

    const updateCronometro = () => {
      const inicio = new Date(sessaoAtual.entrada).getTime();
      const agora = Date.now();
      const diff = Math.floor((agora - inicio) / 1000);

      const h = Math.floor(diff / 3600);
      const m = Math.floor((diff % 3600) / 60);
      const s = diff % 60;

      setCronometro(
        `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
      );
    };

    updateCronometro();
    const interval = setInterval(updateCronometro, 1000);
    return () => clearInterval(interval);
  }, [sessaoAtual, isPaused]);

  // Mostrar relatório quando sessão finaliza
  useEffect(() => {
    if (ultimaSessaoFinalizada) {
      Alert.alert(
        '✅ Sessão Finalizada',
        `Local: ${ultimaSessaoFinalizada.local_nome}\nDuração: ${formatarDuracao(ultimaSessaoFinalizada.duracao_minutos)}`,
        [
          { text: 'OK', onPress: limparUltimaSessao },
          { text: '📤 Compartilhar', onPress: () => { compartilharUltimaSessao(); limparUltimaSessao(); } },
        ]
      );
    }
  }, [ultimaSessaoFinalizada]);

  const onRefresh = async () => {
    setRefreshing(true);
    await recarregarDados();
    await syncNow();
    setRefreshing(false);
  };

  const handlePausar = () => {
    if (!sessaoAtual) return;
    setIsPaused(true);
  };

  const handleContinuar = () => {
    setIsPaused(false);
  };

  const handleParar = () => {
    if (!sessaoAtual) return;

    Alert.alert(
      '⏹️ Parar Cronômetro',
      'Deseja encerrar a sessão atual? Um relatório será gerado.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Parar',
          style: 'destructive',
          onPress: async () => {
            try {
              await registrarSaida(sessaoAtual.local_id);
              setIsPaused(false);
            } catch (error: any) {
              Alert.alert('Erro', error.message || 'Não foi possível encerrar a sessão');
            }
          },
        },
      ]
    );
  };

  const handleRecomecar = async () => {
    if (!localAtivo) return;

    Alert.alert(
      '▶️ Iniciar Nova Sessão',
      `Deseja iniciar o cronômetro em "${localAtivo.nome}"?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Iniciar',
          onPress: async () => {
            try {
              await registrarEntrada(localAtivo.id, localAtivo.nome);
            } catch (error: any) {
              Alert.alert('Erro', error.message || 'Não foi possível iniciar a sessão');
            }
          },
        },
      ]
    );
  };

  // Filtra sessões finalizadas para mostrar
  const sessoesFinalizadas = sessoesHoje.filter(s => s.saida);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <Text style={styles.greeting}>Olá, {userName || 'Trabalhador'}! 👋</Text>

      {/* Cronômetro */}
      <Card style={[
        styles.timerCard, 
        sessaoAtual && styles.timerCardActive,
        podeRecomecar && styles.timerCardIdle
      ]}>
        {sessaoAtual ? (
          // SESSÃO ATIVA
          <>
            <Text style={styles.timerLabel}>Trabalhando em</Text>
            <Text style={styles.timerLocal}>{sessaoAtual.local_nome}</Text>
            <Text style={[styles.timer, isPaused && styles.timerPaused]}>{cronometro}</Text>
            <View style={styles.timerStatus}>
              <View style={[styles.statusDot, { backgroundColor: isPaused ? colors.warning : colors.success }]} />
              <Text style={styles.statusText}>{isPaused ? 'Pausado' : 'Sessão ativa'}</Text>
            </View>

            <View style={styles.timerActions}>
              {isPaused ? (
                <TouchableOpacity style={[styles.actionButton, styles.continueButton]} onPress={handleContinuar}>
                  <Text style={styles.actionButtonText}>▶️ Continuar</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity style={[styles.actionButton, styles.pauseButton]} onPress={handlePausar}>
                  <Text style={styles.actionButtonText}>⏸️ Pausar</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity style={[styles.actionButton, styles.stopButton]} onPress={handleParar}>
                <Text style={styles.actionButtonText}>⏹️ Parar</Text>
              </TouchableOpacity>
            </View>
          </>
        ) : podeRecomecar ? (
          // DENTRO DE FENCE MAS SEM SESSÃO - PODE RECOMEÇAR
          <>
            <Text style={styles.timerLabel}>Você está em</Text>
            <Text style={styles.timerLocal}>{localAtivo?.nome}</Text>
            <Text style={styles.timer}>00:00:00</Text>
            <View style={styles.timerStatus}>
              <View style={[styles.statusDot, { backgroundColor: colors.primary }]} />
              <Text style={styles.statusText}>Dentro do local • Sessão encerrada</Text>
            </View>

            <TouchableOpacity style={[styles.actionButton, styles.startButton]} onPress={handleRecomecar}>
              <Text style={styles.actionButtonText}>▶️ Recomeçar</Text>
            </TouchableOpacity>
          </>
        ) : (
          // SEM SESSÃO E FORA DE FENCE
          <>
            <Text style={styles.timerLabel}>Nenhuma sessão ativa</Text>
            <Text style={styles.timer}>--:--:--</Text>
            <Text style={styles.timerHint}>
              {isGeofencingAtivo 
                ? 'Aguardando entrada em um local...' 
                : 'Ative o monitoramento na aba Locais'}
            </Text>
          </>
        )}
      </Card>

      {/* Estatísticas */}
      <Text style={styles.sectionTitle}>📊 Hoje</Text>
      <View style={styles.statsGrid}>
        <Card style={styles.statCard}>
          <Text style={styles.statValue}>{formatarDuracao(estatisticasHoje.total_minutos)}</Text>
          <Text style={styles.statLabel}>Trabalhado</Text>
        </Card>
        <Card style={styles.statCard}>
          <Text style={styles.statValue}>{estatisticasHoje.total_sessoes}</Text>
          <Text style={styles.statLabel}>Sessões</Text>
        </Card>
      </View>

      {/* Sessões de Hoje (apenas finalizadas) */}
      {sessoesFinalizadas.length > 0 && (
        <>
          <Text style={styles.sectionTitle}>📋 Registros de Hoje</Text>
          {sessoesFinalizadas.slice(0, 5).map((sessao) => (
            <Card key={sessao.id} style={styles.sessionCard}>
              <View style={styles.sessionHeader}>
                <View style={[styles.sessionDot, { backgroundColor: sessao.cor || colors.primary }]} />
                <Text style={styles.sessionLocal}>{sessao.local_nome}</Text>
              </View>
              <View style={styles.sessionTimes}>
                <Text style={styles.sessionTime}>
                  {new Date(sessao.entrada).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                  {' → '}
                  {new Date(sessao.saida!).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                </Text>
                <Text style={styles.sessionDuration}>{formatarDuracao(sessao.duracao_minutos)}</Text>
              </View>
            </Card>
          ))}
        </>
      )}

      {/* Status */}
      <Text style={styles.sectionTitle}>⚙️ Status</Text>
      <Card style={styles.statusCard}>
        <StatusRow icon="📡" label="Conexão" value={isOnline ? 'Online' : 'Offline'} color={isOnline ? colors.success : colors.error} />
        <StatusRow icon="🔄" label="Último sync" value={lastSyncAt ? lastSyncAt.toLocaleTimeString('pt-BR') : 'Nunca'} />
        <StatusRow icon="📍" label="Monitoramento" value={isGeofencingAtivo ? 'Ativo' : 'Inativo'} color={isGeofencingAtivo ? colors.success : colors.textSecondary} />
        <StatusRow icon="🎯" label="Precisão GPS" value={precisao ? `${precisao.toFixed(0)}m` : 'N/A'} />
        <StatusRow icon="📌" label="Locais cadastrados" value={`${locais.length}`} />
        {localAtivo && <StatusRow icon="✅" label="Dentro de" value={localAtivo.nome} color={colors.primary} />}
      </Card>
    </ScrollView>
  );
}

function StatusRow({ icon, label, value, color }: { icon: string; label: string; value: string; color?: string }) {
  return (
    <View style={styles.statusRow}>
      <Text style={styles.statusIcon}>{icon}</Text>
      <Text style={styles.statusLabel}>{label}</Text>
      <Text style={[styles.statusValue, color && { color }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.backgroundSecondary },
  content: { padding: 16, paddingBottom: 32 },
  greeting: { fontSize: 20, fontWeight: '600', color: colors.text, marginBottom: 16 },
  timerCard: { alignItems: 'center', paddingVertical: 24, marginBottom: 24 },
  timerCardActive: { backgroundColor: colors.primaryLight },
  timerCardIdle: { backgroundColor: withOpacity(colors.primary, 0.1) },
  timerLabel: { fontSize: 14, color: colors.textSecondary, marginBottom: 4 },
  timerLocal: { fontSize: 18, fontWeight: '600', color: colors.text, marginBottom: 12 },
  timer: { fontSize: 48, fontWeight: 'bold', fontVariant: ['tabular-nums'], color: colors.text, marginBottom: 12 },
  timerPaused: { opacity: 0.5 },
  timerHint: { fontSize: 14, color: colors.textSecondary, textAlign: 'center' },
  timerStatus: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  statusDot: { width: 8, height: 8, borderRadius: 4, marginRight: 6 },
  statusText: { fontSize: 14, color: colors.textSecondary },
  timerActions: { flexDirection: 'row', gap: 12, marginTop: 8 },
  actionButton: { 
    paddingVertical: 12, 
    paddingHorizontal: 24, 
    borderRadius: 25,
    minWidth: 120,
    alignItems: 'center',
  },
  actionButtonText: { fontSize: 16, fontWeight: '600', color: colors.white },
  pauseButton: { backgroundColor: colors.warning },
  continueButton: { backgroundColor: colors.success },
  stopButton: { backgroundColor: colors.error },
  startButton: { backgroundColor: colors.primary, marginTop: 8 },
  sectionTitle: { fontSize: 16, fontWeight: '600', color: colors.text, marginBottom: 12, marginTop: 8 },
  statsGrid: { flexDirection: 'row', gap: 12, marginBottom: 16 },
  statCard: { flex: 1, alignItems: 'center', paddingVertical: 16 },
  statValue: { fontSize: 24, fontWeight: 'bold', color: colors.primary },
  statLabel: { fontSize: 12, color: colors.textSecondary, marginTop: 4 },
  sessionCard: { marginBottom: 8, padding: 12 },
  sessionHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  sessionDot: { width: 10, height: 10, borderRadius: 5, marginRight: 8 },
  sessionLocal: { fontSize: 14, fontWeight: '600', color: colors.text },
  sessionTimes: { flexDirection: 'row', justifyContent: 'space-between', marginLeft: 18 },
  sessionTime: { fontSize: 13, color: colors.textSecondary },
  sessionDuration: { fontSize: 13, fontWeight: '500', color: colors.primary },
  statusCard: { padding: 0, overflow: 'hidden' },
  statusRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: colors.border },
  statusIcon: { fontSize: 16, marginRight: 12 },
  statusLabel: { flex: 1, fontSize: 14, color: colors.textSecondary },
  statusValue: { fontSize: 14, fontWeight: '500', color: colors.text },
});
