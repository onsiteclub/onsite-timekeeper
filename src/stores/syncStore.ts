/**
 * Sync Store - OnSite Timekeeper
 * 
 * Gerencia sincronização bidirecional:
 * - SQLite → Supabase (upload)
 * - Supabase → SQLite (download)
 * - Auto-sync a cada 5 minutos
 * - Boot reconciliation
 */

import { create } from 'zustand';
import NetInfo from '@react-native-community/netinfo';
import { logger } from '../lib/logger';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import {
  getLocaisPendentesSync,
  getRegistrosPendentesSync,
  marcarLocalSincronizado,
  marcarRegistroSincronizado,
  upsertLocalFromSync,
  upsertRegistroFromSync,
  purgeLocaisDeletados,
  registrarSyncLog,
  getTodosLocais,
  type LocalDB,
  type RegistroDB,
} from '../lib/database';
import { useAuthStore } from './authStore';
import { useLocationStore } from './locationStore';

// ============================================
// CONSTANTES
// ============================================

const SYNC_INTERVAL = 5 * 60 * 1000; // 5 minutos

// ============================================
// TIPOS
// ============================================

interface SyncState {
  isSyncing: boolean;
  lastSyncAt: Date | null;
  isOnline: boolean;
  autoSyncEnabled: boolean;
  
  // Estatísticas do último sync
  lastSyncStats: {
    uploadedLocais: number;
    uploadedRegistros: number;
    downloadedLocais: number;
    downloadedRegistros: number;
    errors: string[];
  } | null;

  // Actions
  initialize: () => Promise<() => void>;
  syncNow: () => Promise<void>;
  forceFullSync: () => Promise<void>;
  debugSync: () => Promise<{ success: boolean; error?: string; stats?: any }>;
  toggleAutoSync: () => void;
  
  // Sync parciais
  syncLocais: () => Promise<void>;
  syncRegistros: () => Promise<void>;
  
  // Boot reconciliation
  reconciliarNoBoot: () => Promise<void>;
}

// ============================================
// TIMER
// ============================================

let syncInterval: NodeJS.Timeout | null = null;
let netInfoUnsubscribe: (() => void) | null = null;

// ============================================
// STORE
// ============================================

export const useSyncStore = create<SyncState>((set, get) => ({
  isSyncing: false,
  lastSyncAt: null,
  isOnline: false,
  autoSyncEnabled: true,
  lastSyncStats: null,

  initialize: async () => {
    logger.info('boot', '🔄 Inicializando sync store...');

    // Monitora conexão
    netInfoUnsubscribe = NetInfo.addEventListener((state) => {
      // isInternetReachable pode ser null no início, assumir online se connected
      const online = state.isConnected === true && (state.isInternetReachable !== false);
      logger.debug('sync', `NetInfo: connected=${state.isConnected}, reachable=${state.isInternetReachable}, online=${online}`);
      set({ isOnline: online });

      if (online && get().autoSyncEnabled && !get().isSyncing) {
        logger.info('sync', '📶 Online - iniciando sync');
        get().syncNow();
      }
    });

    // Verifica conexão inicial
    const state = await NetInfo.fetch();
    const online = state.isConnected === true && (state.isInternetReachable !== false);
    logger.info('sync', `Conexão inicial: connected=${state.isConnected}, reachable=${state.isInternetReachable}, online=${online}`);
    set({ isOnline: online });

    // Auto-sync a cada 5 minutos
    syncInterval = setInterval(() => {
      const { isOnline, autoSyncEnabled, isSyncing } = get();
      if (isOnline && autoSyncEnabled && !isSyncing) {
        logger.debug('sync', '⏰ Auto-sync triggered');
        get().syncNow();
      }
    }, SYNC_INTERVAL);

    // Sync inicial se online e Supabase configurado
    if (online && isSupabaseConfigured()) {
      logger.info('sync', 'Iniciando sync de boot...');
      await get().reconciliarNoBoot();
      await get().syncNow();
    } else {
      logger.warn('sync', `Sync de boot pulado: online=${online}, supabaseConfigured=${isSupabaseConfigured()}`);
    }

    logger.info('boot', '✅ Sync store inicializado', { online, supabaseConfigured: isSupabaseConfigured() });

    // Retorna cleanup function
    return () => {
      if (netInfoUnsubscribe) netInfoUnsubscribe();
      if (syncInterval) clearInterval(syncInterval);
    };
  },

  syncNow: async () => {
    const { isSyncing, isOnline } = get();
    
    if (isSyncing) {
      logger.warn('sync', 'Sync já em andamento');
      return;
    }

    if (!isOnline) {
      logger.warn('sync', 'Offline - sync ignorado');
      return;
    }

    if (!isSupabaseConfigured()) {
      logger.warn('sync', 'Supabase não configurado');
      return;
    }

    set({ isSyncing: true, lastSyncStats: null });

    try {
      logger.info('sync', '🔄 Iniciando sync...');

      const stats = {
        uploadedLocais: 0,
        uploadedRegistros: 0,
        downloadedLocais: 0,
        downloadedRegistros: 0,
        errors: [] as string[],
      };

      // 1. Upload locais
      const locaisUploaded = await uploadLocais();
      stats.uploadedLocais = locaisUploaded.count;
      stats.errors.push(...locaisUploaded.errors);

      // 2. Upload registros
      const registrosUploaded = await uploadRegistros();
      stats.uploadedRegistros = registrosUploaded.count;
      stats.errors.push(...registrosUploaded.errors);

      // 3. Download locais
      const locaisDownloaded = await downloadLocais();
      stats.downloadedLocais = locaisDownloaded.count;
      stats.errors.push(...locaisDownloaded.errors);

      // 4. Download registros
      const registrosDownloaded = await downloadRegistros();
      stats.downloadedRegistros = registrosDownloaded.count;
      stats.errors.push(...registrosDownloaded.errors);

      // 5. Purge de locais deletados antigos
      await purgeLocaisDeletados(7);

      set({ 
        lastSyncAt: new Date(),
        lastSyncStats: stats,
      });

      logger.info('sync', '✅ Sync concluído', {
        up: `${stats.uploadedLocais}L/${stats.uploadedRegistros}R`,
        down: `${stats.downloadedLocais}L/${stats.downloadedRegistros}R`,
        errors: stats.errors.length,
      });

      // Recarrega locais no locationStore
      await useLocationStore.getState().recarregarLocais();

    } catch (error) {
      logger.error('sync', 'Erro no sync', { error: String(error) });
    } finally {
      set({ isSyncing: false });
    }
  },

  forceFullSync: async () => {
    logger.info('sync', '🔄 Forçando sync completo...');
    await get().reconciliarNoBoot();
    await get().syncNow();
  },

  // Debug: força sync ignorando verificações de online/supabase
  debugSync: async () => {
    logger.info('sync', '🔧 DEBUG SYNC - ignorando verificações...');
    
    const supabaseOk = isSupabaseConfigured();
    logger.info('sync', `Supabase configurado: ${supabaseOk}`);
    
    if (!supabaseOk) {
      logger.error('sync', 'Supabase NÃO está configurado! Verifique .env');
      return { success: false, error: 'Supabase não configurado' };
    }

    set({ isSyncing: true, lastSyncStats: null });

    try {
      const stats = {
        uploadedLocais: 0,
        uploadedRegistros: 0,
        downloadedLocais: 0,
        downloadedRegistros: 0,
        errors: [] as string[],
      };

      // 1. Upload locais
      logger.info('sync', '📤 Uploading locais...');
      const locaisUploaded = await uploadLocais();
      stats.uploadedLocais = locaisUploaded.count;
      stats.errors.push(...locaisUploaded.errors);
      logger.info('sync', `Locais uploaded: ${locaisUploaded.count}, errors: ${locaisUploaded.errors.length}`);

      // 2. Upload registros
      logger.info('sync', '📤 Uploading registros...');
      const registrosUploaded = await uploadRegistros();
      stats.uploadedRegistros = registrosUploaded.count;
      stats.errors.push(...registrosUploaded.errors);
      logger.info('sync', `Registros uploaded: ${registrosUploaded.count}, errors: ${registrosUploaded.errors.length}`);

      // 3. Download locais
      logger.info('sync', '📥 Downloading locais...');
      const locaisDownloaded = await downloadLocais();
      stats.downloadedLocais = locaisDownloaded.count;
      stats.errors.push(...locaisDownloaded.errors);

      // 4. Download registros
      logger.info('sync', '📥 Downloading registros...');
      const registrosDownloaded = await downloadRegistros();
      stats.downloadedRegistros = registrosDownloaded.count;
      stats.errors.push(...registrosDownloaded.errors);

      set({ 
        lastSyncAt: new Date(),
        lastSyncStats: stats,
        isOnline: true, // Forçar online já que conseguiu sincronizar
      });

      logger.info('sync', '✅ DEBUG SYNC concluído', stats);

      // Recarrega locais
      await useLocationStore.getState().recarregarLocais();

      return { success: true, stats };
    } catch (error) {
      logger.error('sync', 'Erro no debug sync', { error: String(error) });
      return { success: false, error: String(error) };
    } finally {
      set({ isSyncing: false });
    }
  },

  toggleAutoSync: () => {
    set(state => {
      const newValue = !state.autoSyncEnabled;
      logger.info('sync', `Auto-sync: ${newValue ? 'ON' : 'OFF'}`);
      return { autoSyncEnabled: newValue };
    });
  },

  syncLocais: async () => {
    await uploadLocais();
    await downloadLocais();
    await useLocationStore.getState().recarregarLocais();
  },

  syncRegistros: async () => {
    await uploadRegistros();
    await downloadRegistros();
  },

  reconciliarNoBoot: async () => {
    const userId = useAuthStore.getState().getUserId();
    if (!userId) return;

    logger.info('sync', '🔧 Reconciliação de boot...');

    try {
      const locaisLocais = await getTodosLocais(userId);
      
      const { data: locaisRemoto, error } = await supabase
        .from('locais')
        .select('*')
        .eq('user_id', userId);

      if (error) {
        logger.error('sync', 'Erro ao buscar locais remotos', { error: error.message });
        return;
      }

      const locaisRemotoMap = new Map((locaisRemoto || []).map(l => [l.id, l]));
      const locaisLocalMap = new Map(locaisLocais.map(l => [l.id, l]));

      // Locais no servidor mas não local → inserir local
      for (const [id, remoto] of locaisRemotoMap) {
        if (!locaisLocalMap.has(id)) {
          logger.debug('sync', `Inserindo local do servidor: ${remoto.nome}`);
          await upsertLocalFromSync(remoto);
        }
      }

      // Locais em ambos com timestamps diferentes → usar mais recente
      for (const [id, local] of locaisLocalMap) {
        const remoto = locaisRemotoMap.get(id);
        if (remoto && local.status === 'active') {
          const localTime = new Date(local.updated_at).getTime();
          const remotoTime = new Date(remoto.updated_at).getTime();

          if (remotoTime > localTime) {
            logger.debug('sync', `Atualizando local do servidor (mais recente): ${remoto.nome}`);
            await upsertLocalFromSync(remoto);
          }
        }
      }

      logger.info('sync', '✅ Reconciliação concluída');
    } catch (error) {
      logger.error('sync', 'Erro na reconciliação', { error: String(error) });
    }
  },
}));

// ============================================
// FUNÇÕES DE UPLOAD/DOWNLOAD
// ============================================

async function uploadLocais(): Promise<{ count: number; errors: string[] }> {
  const userId = useAuthStore.getState().getUserId();
  if (!userId) return { count: 0, errors: ['Usuário não autenticado'] };

  const errors: string[] = [];
  let count = 0;

  try {
    const pendentes = await getLocaisPendentesSync(userId);
    
    for (const local of pendentes) {
      const { error } = await supabase.from('locais').upsert({
        id: local.id,
        user_id: userId,
        nome: local.nome,
        latitude: local.latitude,
        longitude: local.longitude,
        raio: local.raio,
        cor: local.cor,
        status: local.status,
        deleted_at: local.deleted_at,
        created_at: local.created_at,
        updated_at: local.updated_at,
      });

      if (error) {
        errors.push(`Local ${local.nome}: ${error.message}`);
        await registrarSyncLog(userId, 'local', local.id, 'sync_up', local, null, 'failed', error.message);
      } else {
        await marcarLocalSincronizado(local.id);
        await registrarSyncLog(userId, 'local', local.id, 'sync_up', null, local, 'synced');
        count++;
      }
    }
  } catch (error) {
    errors.push(`Upload locais: ${String(error)}`);
  }

  return { count, errors };
}

async function uploadRegistros(): Promise<{ count: number; errors: string[] }> {
  const userId = useAuthStore.getState().getUserId();
  if (!userId) return { count: 0, errors: ['Usuário não autenticado'] };

  const errors: string[] = [];
  let count = 0;

  try {
    const pendentes = await getRegistrosPendentesSync(userId);

    for (const registro of pendentes) {
      const { error } = await supabase.from('registros').upsert({
        id: registro.id,
        user_id: userId,
        local_id: registro.local_id,
        local_nome: registro.local_nome,
        entrada: registro.entrada,
        saida: registro.saida,
        tipo: registro.tipo,
        editado_manualmente: registro.editado_manualmente === 1,
        motivo_edicao: registro.motivo_edicao,
        created_at: registro.created_at,
      });

      if (error) {
        errors.push(`Registro ${registro.id}: ${error.message}`);
        await registrarSyncLog(userId, 'registro', registro.id, 'sync_up', registro, null, 'failed', error.message);
      } else {
        await marcarRegistroSincronizado(registro.id);
        await registrarSyncLog(userId, 'registro', registro.id, 'sync_up', null, registro, 'synced');
        count++;
      }
    }
  } catch (error) {
    errors.push(`Upload registros: ${String(error)}`);
  }

  return { count, errors };
}

async function downloadLocais(): Promise<{ count: number; errors: string[] }> {
  const userId = useAuthStore.getState().getUserId();
  if (!userId) return { count: 0, errors: ['Usuário não autenticado'] };

  const errors: string[] = [];
  let count = 0;

  try {
    const { data, error } = await supabase
      .from('locais')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'active');

    if (error) {
      errors.push(`Download locais: ${error.message}`);
      return { count, errors };
    }

    for (const local of data || []) {
      try {
        await upsertLocalFromSync(local as LocalDB);
        await registrarSyncLog(userId, 'local', local.id, 'sync_down', null, local, 'synced');
        count++;
      } catch (e) {
        errors.push(`Local ${local.nome}: ${String(e)}`);
      }
    }
  } catch (error) {
    errors.push(`Download locais: ${String(error)}`);
  }

  return { count, errors };
}

async function downloadRegistros(): Promise<{ count: number; errors: string[] }> {
  const userId = useAuthStore.getState().getUserId();
  if (!userId) return { count: 0, errors: ['Usuário não autenticado'] };

  const errors: string[] = [];
  let count = 0;

  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    const { data, error } = await supabase
      .from('registros')
      .select('*')
      .eq('user_id', userId)
      .gte('entrada', thirtyDaysAgo);

    if (error) {
      errors.push(`Download registros: ${error.message}`);
      return { count, errors };
    }

    for (const registro of data || []) {
      try {
        await upsertRegistroFromSync({
          ...registro,
          editado_manualmente: registro.editado_manualmente ? 1 : 0,
        } as RegistroDB);
        await registrarSyncLog(userId, 'registro', registro.id, 'sync_down', null, registro, 'synced');
        count++;
      } catch (e) {
        errors.push(`Registro ${registro.id}: ${String(e)}`);
      }
    }
  } catch (error) {
    errors.push(`Download registros: ${String(error)}`);
  }

  return { count, errors };
}
