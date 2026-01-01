/**
 * Root Layout - OnSite Timekeeper
 * 
 * Entry point do app:
 * - Importa background tasks (obrigatório)
 * - Inicializa stores
 * - Protege rotas (auth)
 * - Renderiza GeofenceAlert globalmente
 */

import React, { useEffect, useState } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';

// IMPORTANTE: Importa background tasks ANTES de qualquer coisa
import '../src/lib/backgroundTasks';

import { colors } from '../src/constants/colors';
import { logger } from '../src/lib/logger';
import { initDatabase } from '../src/lib/database'; // ✅ ADICIONAR
import { GeofenceAlert } from '../src/components/GeofenceAlert';
import { DevMonitor } from '../src/components/DevMonitor';
import { useAuthStore } from '../src/stores/authStore';
import { useLocationStore } from '../src/stores/locationStore';
import { useRegistroStore } from '../src/stores/registroStore';
import { useWorkSessionStore } from '../src/stores/workSessionStore';
import { useSyncStore } from '../src/stores/syncStore';
import { useSettingsStore } from '../src/stores/settingsStore';

// Mantém splash screen enquanto carrega
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [isReady, setIsReady] = useState(false);
  const router = useRouter();
  const segments = useSegments();

  // Auth state
  const { isAuthenticated, isLoading: authLoading, initialize: initAuth } = useAuthStore();

  // Inicialização
  useEffect(() => {
    async function bootstrap() {
      logger.info('boot', '🚀 Iniciando OnSite Timekeeper...');

      try {
        // ✅ 1. SEMPRE inicializar database (ANTES de tudo)
        await initDatabase();
        logger.info('boot', '✅ Database inicializado');

        // 2. Carrega configurações
        await useSettingsStore.getState().loadSettings();

        // 3. Inicializa autenticação
        await initAuth();

        // 4. Inicializa stores dependentes (apenas se autenticado)
        const isAuth = useAuthStore.getState().isAuthenticated;
        if (isAuth) {
          logger.info('boot', '👤 Usuário autenticado - inicializando stores...');
          
          // Ordem importa: registro → location → workSession → sync
          await useRegistroStore.getState().initialize();
          await useLocationStore.getState().initialize();
          await useWorkSessionStore.getState().initialize();
          await useSyncStore.getState().initialize();
        } else {
          logger.info('boot', '🔓 Usuário não autenticado - stores não inicializados');
        }

        logger.info('boot', '✅ Bootstrap concluído');
      } catch (error) {
        logger.error('boot', 'Erro no bootstrap', { error: String(error) });
      } finally {
        setIsReady(true);
        await SplashScreen.hideAsync();
      }
    }

    bootstrap();
  }, []);

  // Navegação baseada em auth
  useEffect(() => {
    if (!isReady || authLoading) return;

    const inAuthGroup = segments[0] === '(auth)';

    if (!isAuthenticated && !inAuthGroup) {
      // Não logado e fora de auth → vai para login
      router.replace('/(auth)/login');
    } else if (isAuthenticated && inAuthGroup) {
      // Logado e em auth → vai para home
      router.replace('/(tabs)');
    }
  }, [isReady, authLoading, isAuthenticated, segments]);

  // Loading screen
  if (!isReady || authLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <>
      <StatusBar style="auto" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(tabs)" />
      </Stack>
      
      {/* Componentes globais */}
      <GeofenceAlert />
      <DevMonitor />
    </>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
  },
});
