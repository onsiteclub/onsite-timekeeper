/**
 * Settings Store - OnSite Timekeeper
 * 
 * Gerencia configurações do usuário:
 * - Preferências de notificação
 * - Auto-start/stop
 * - Timeouts
 */

import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { logger } from '../lib/logger';

// ============================================
// TIPOS
// ============================================

interface SettingsState {
  // Notificações
  notificacoesAtivas: boolean;
  somNotificacao: boolean;
  vibracaoNotificacao: boolean;
  
  // Auto-ação
  autoStartHabilitado: boolean;
  autoStopHabilitado: boolean;
  timeoutAutoAcao: number; // em segundos (default: 30)
  
  // Geofencing
  raioDefault: number; // em metros (default: 100)
  distanciaMinimaLocais: number; // em metros (default: 50)
  
  // Debug
  devMonitorHabilitado: boolean;

  // Actions
  loadSettings: () => Promise<void>;
  saveSettings: () => Promise<void>;
  updateSetting: <K extends keyof SettingsState>(key: K, value: SettingsState[K]) => void;
  resetSettings: () => Promise<void>;
}

// ============================================
// DEFAULTS
// ============================================

const DEFAULT_SETTINGS = {
  notificacoesAtivas: true,
  somNotificacao: true,
  vibracaoNotificacao: true,
  autoStartHabilitado: true,
  autoStopHabilitado: true,
  timeoutAutoAcao: 30,
  raioDefault: 100,
  distanciaMinimaLocais: 50,
  devMonitorHabilitado: __DEV__,
};

const STORAGE_KEY = '@onsite_settings';

// ============================================
// STORE
// ============================================

export const useSettingsStore = create<SettingsState>((set, get) => ({
  ...DEFAULT_SETTINGS,

  loadSettings: async () => {
    try {
      const stored = await AsyncStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        set({ ...DEFAULT_SETTINGS, ...parsed });
        logger.info('boot', '⚙️ Configurações carregadas');
      }
    } catch (error) {
      logger.error('database', 'Erro ao carregar configurações', { error: String(error) });
    }
  },

  saveSettings: async () => {
    try {
      const state = get();
      const toSave = {
        notificacoesAtivas: state.notificacoesAtivas,
        somNotificacao: state.somNotificacao,
        vibracaoNotificacao: state.vibracaoNotificacao,
        autoStartHabilitado: state.autoStartHabilitado,
        autoStopHabilitado: state.autoStopHabilitado,
        timeoutAutoAcao: state.timeoutAutoAcao,
        raioDefault: state.raioDefault,
        distanciaMinimaLocais: state.distanciaMinimaLocais,
        devMonitorHabilitado: state.devMonitorHabilitado,
      };
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
      logger.debug('database', 'Configurações salvas');
    } catch (error) {
      logger.error('database', 'Erro ao salvar configurações', { error: String(error) });
    }
  },

  updateSetting: (key, value) => {
    set({ [key]: value } as any);
    get().saveSettings();
  },

  resetSettings: async () => {
    set(DEFAULT_SETTINGS);
    await AsyncStorage.removeItem(STORAGE_KEY);
    logger.info('database', 'Configurações resetadas');
  },
}));
