/**
 * Settings Screen - OnSite Timekeeper
 */

import React from 'react';
import { View, Text, StyleSheet, ScrollView, Switch, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { colors } from '../../src/constants/colors';
import { Card, Button } from '../../src/components/ui/Button';
import { useAuthStore } from '../../src/stores/authStore';
import { useSettingsStore } from '../../src/stores/settingsStore';
import { useSyncStore } from '../../src/stores/syncStore';

export default function SettingsScreen() {
  const router = useRouter();
  const { signOut, getUserEmail, getUserName } = useAuthStore();
  const settings = useSettingsStore();
  const { syncNow, isSyncing, lastSyncAt, isOnline } = useSyncStore();

  const handleLogout = () => {
    Alert.alert('Sair', 'Deseja sair da sua conta?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Sair', style: 'destructive', onPress: async () => {
        await signOut();
        router.replace('/(auth)/login');
      }},
    ]);
  };

  const handleSync = async () => {
    if (!isOnline) {
      Alert.alert('Offline', 'Você está sem conexão');
      return;
    }
    await syncNow();
    Alert.alert('Sync', 'Sincronização concluída');
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* User */}
      <Text style={styles.sectionTitle}>👤 Conta</Text>
      <Card style={styles.card}>
        <Text style={styles.userName}>{getUserName() || 'Usuário'}</Text>
        <Text style={styles.userEmail}>{getUserEmail()}</Text>
        <Button title="Sair" variant="danger" onPress={handleLogout} style={{ marginTop: 12 }} />
      </Card>

      {/* Notifications */}
      <Text style={styles.sectionTitle}>🔔 Notificações</Text>
      <Card style={styles.card}>
        <SettingRow label="Notificações" value={settings.notificacoesAtivas} onChange={(v) => settings.updateSetting('notificacoesAtivas', v)} />
        <SettingRow label="Som" value={settings.somNotificacao} onChange={(v) => settings.updateSetting('somNotificacao', v)} />
        <SettingRow label="Vibração" value={settings.vibracaoNotificacao} onChange={(v) => settings.updateSetting('vibracaoNotificacao', v)} />
      </Card>

      {/* Auto-action */}
      <Text style={styles.sectionTitle}>⚡ Auto-ação</Text>
      <Card style={styles.card}>
        <SettingRow label="Auto-iniciar" value={settings.autoStartHabilitado} onChange={(v) => settings.updateSetting('autoStartHabilitado', v)} />
        <SettingRow label="Auto-encerrar" value={settings.autoStopHabilitado} onChange={(v) => settings.updateSetting('autoStopHabilitado', v)} />
        <Text style={styles.hint}>Timeout: {settings.timeoutAutoAcao} segundos</Text>
      </Card>

      {/* Sync */}
      <Text style={styles.sectionTitle}>🔄 Sincronização</Text>
      <Card style={styles.card}>
        <View style={styles.syncInfo}>
          <Text style={styles.syncLabel}>Status</Text>
          <Text style={[styles.syncValue, { color: isOnline ? colors.success : colors.error }]}>{isOnline ? 'Online' : 'Offline'}</Text>
        </View>
        <View style={styles.syncInfo}>
          <Text style={styles.syncLabel}>Último sync</Text>
          <Text style={styles.syncValue}>{lastSyncAt ? lastSyncAt.toLocaleString('pt-BR') : 'Nunca'}</Text>
        </View>
        <Button title={isSyncing ? 'Sincronizando...' : 'Sincronizar agora'} onPress={handleSync} loading={isSyncing} style={{ marginTop: 12 }} />
      </Card>

      {/* Dev */}
      <Text style={styles.sectionTitle}>🛠️ Desenvolvedor</Text>
      <Card style={styles.card}>
        <SettingRow label="DevMonitor" value={settings.devMonitorHabilitado} onChange={(v) => settings.updateSetting('devMonitorHabilitado', v)} />
        <Text style={styles.hint}>Mostra botão de debug flutuante</Text>
      </Card>

      {/* Info */}
      <View style={styles.footer}>
        <Text style={styles.footerText}>OnSite Timekeeper v1.0.0</Text>
        <Text style={styles.footerText}>© 2024 OnSite Club</Text>
      </View>
    </ScrollView>
  );
}

function SettingRow({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <View style={styles.settingRow}>
      <Text style={styles.settingLabel}>{label}</Text>
      <Switch value={value} onValueChange={onChange} trackColor={{ true: colors.primary, false: colors.border }} thumbColor={colors.white} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.backgroundSecondary },
  content: { padding: 16, paddingBottom: 40 },
  sectionTitle: { fontSize: 14, fontWeight: '600', color: colors.textSecondary, marginBottom: 8, marginTop: 16, marginLeft: 4 },
  card: { padding: 16 },
  userName: { fontSize: 18, fontWeight: '600', color: colors.text },
  userEmail: { fontSize: 14, color: colors.textSecondary, marginTop: 2 },
  settingRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8 },
  settingLabel: { fontSize: 16, color: colors.text },
  hint: { fontSize: 12, color: colors.textTertiary, marginTop: 8 },
  syncInfo: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 },
  syncLabel: { fontSize: 14, color: colors.textSecondary },
  syncValue: { fontSize: 14, fontWeight: '500', color: colors.text },
  footer: { alignItems: 'center', marginTop: 32 },
  footerText: { fontSize: 12, color: colors.textTertiary },
});
