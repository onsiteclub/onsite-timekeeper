/**
 * Location Store - OnSite Timekeeper
 * 
 * Gerencia:
 * - Locais de trabalho (CRUD)
 * - Localização atual do usuário
 * - Geofencing (monitoramento de entrada/saída)
 * - Polling de backup
 */

import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { logger } from '../lib/logger';
import {
  obterLocalizacaoAtual,
  iniciarWatchPosicao,
  pararWatchPosicao,
  iniciarGeofencing,
  pararGeofencing,
  iniciarBackgroundLocation,
  pararBackgroundLocation,
  verificarPermissoes,
  calcularDistancia,
  estaDentroGeofence,
  type Coordenadas,
  type LocalizacaoResult,
  type GeofenceRegion,
  type PermissoesStatus,
} from '../lib/location';
import {
  criarLocal,
  getLocaisAtivos,
  deletarLocal,
  atualizarLocal,
  initDatabase,
  type LocalDB,
} from '../lib/database';
import { setGeofenceCallback, type GeofenceEvent } from '../lib/backgroundTasks';
import { useWorkSessionStore } from './workSessionStore';
import { useAuthStore } from './authStore';

// ============================================
// CONSTANTES
// ============================================

const POLLING_INTERVAL = 30000; // 30 segundos
const STORAGE_KEY_MONITORING = '@onsite_monitoring_active';

// ============================================
// TIPOS
// ============================================

export interface LocalDeTrabalho {
  id: string;
  nome: string;
  latitude: number;
  longitude: number;
  raio: number;
  cor: string;
  status: string;
}

interface LocationState {
  // Permissões
  permissoes: PermissoesStatus;
  
  // Localização atual
  localizacaoAtual: Coordenadas | null;
  precisao: number | null;
  ultimaAtualizacao: number | null;
  
  // Locais de trabalho
  locais: LocalDeTrabalho[];
  
  // Estado do monitoramento
  geofenceAtivo: string | null; // ID do local onde está
  isGeofencingAtivo: boolean;
  isBackgroundAtivo: boolean;
  isPollingAtivo: boolean;
  isWatching: boolean;
  
  // Controle de processamento
  isProcessandoEvento: boolean;
  ultimoEvento: GeofenceEvent | null;
  
  // Inicialização
  isInicializado: boolean;

  // Actions
  initialize: () => Promise<void>;
  atualizarLocalizacao: () => Promise<void>;
  iniciarTracking: () => Promise<void>;
  pararTracking: () => Promise<void>;
  
  // CRUD Locais
  adicionarLocal: (local: Omit<LocalDeTrabalho, 'id' | 'status'>) => Promise<string>;
  removerLocal: (id: string) => Promise<void>;
  editarLocal: (id: string, updates: Partial<LocalDeTrabalho>) => Promise<void>;
  recarregarLocais: () => Promise<void>;
  
  // Geofencing
  iniciarMonitoramento: () => Promise<void>;
  pararMonitoramento: () => Promise<void>;
  verificarGeofenceAtual: () => void;
  
  // Polling
  iniciarPolling: () => void;
  pararPolling: () => void;
}

// ============================================
// POLLING TIMER
// ============================================

let pollingTimer: NodeJS.Timeout | null = null;

// ============================================
// STORE
// ============================================

export const useLocationStore = create<LocationState>((set, get) => ({
  permissoes: { foreground: false, background: false },
  localizacaoAtual: null,
  precisao: null,
  ultimaAtualizacao: null,
  locais: [],
  geofenceAtivo: null,
  isGeofencingAtivo: false,
  isBackgroundAtivo: false,
  isPollingAtivo: false,
  isWatching: false,
  isProcessandoEvento: false,
  ultimoEvento: null,
  isInicializado: false,

  initialize: async () => {
    if (get().isInicializado) return;

    logger.info('boot', '📍 Inicializando location store...');

    try {
      // IMPORTANTE: Inicializa o banco primeiro
      await initDatabase();

      // Importa background tasks (registra as tasks)
      await import('../lib/backgroundTasks');

      // Verifica permissões
      const permissoes = await verificarPermissoes();
      set({ permissoes });

      // Configura callback de geofence nativo
      setGeofenceCallback((evento) => {
        const { isProcessandoEvento } = get();

        if (isProcessandoEvento) {
          logger.warn('geofence', 'Evento ignorado - já processando outro');
          return;
        }

        logger.info('geofence', `📍 Evento: ${evento.type} - ${evento.regionIdentifier}`);
        set({ ultimoEvento: evento, isProcessandoEvento: true });

        // Processa o evento
        processarEventoGeofence(evento, get, set);

        // Libera processamento após 1s
        setTimeout(() => set({ isProcessandoEvento: false }), 1000);
      });

      // Carrega locais do banco
      await get().recarregarLocais();

      // Obtém localização atual
      const localizacao = await obterLocalizacaoAtual();
      if (localizacao) {
        set({
          localizacaoAtual: localizacao.coords,
          precisao: localizacao.accuracy,
          ultimaAtualizacao: localizacao.timestamp,
        });
      }

      set({ isInicializado: true });

      // Auto-inicia monitoramento se necessário
      await autoIniciarMonitoramento(get, set);

      // Verifica geofence atual
      get().verificarGeofenceAtual();

      logger.info('boot', '✅ Location store inicializado');
    } catch (error) {
      logger.error('gps', 'Erro na inicialização do location store', { error: String(error) });
      set({ isInicializado: true }); // Marca como inicializado mesmo com erro
    }
  },

  atualizarLocalizacao: async () => {
    try {
      const localizacao = await obterLocalizacaoAtual();
      if (localizacao) {
        set({
          localizacaoAtual: localizacao.coords,
          precisao: localizacao.accuracy,
          ultimaAtualizacao: localizacao.timestamp,
        });
        get().verificarGeofenceAtual();
      }
    } catch (error) {
      logger.error('gps', 'Erro ao atualizar localização', { error: String(error) });
    }
  },

  iniciarTracking: async () => {
    const success = await iniciarWatchPosicao((localizacao) => {
      set({
        localizacaoAtual: localizacao.coords,
        precisao: localizacao.accuracy,
        ultimaAtualizacao: localizacao.timestamp,
      });
      get().verificarGeofenceAtual();
    });

    if (success) {
      set({ isWatching: true });
      logger.info('gps', '👁️ Tracking em tempo real iniciado');
    }
  },

  pararTracking: async () => {
    await pararWatchPosicao();
    set({ isWatching: false });
    logger.info('gps', '⏹️ Tracking em tempo real parado');
  },

  adicionarLocal: async (local) => {
    const userId = useAuthStore.getState().getUserId();
    if (!userId) {
      throw new Error('Usuário não autenticado');
    }

    logger.info('geofence', `➕ Adicionando local: ${local.nome}`);

    const id = await criarLocal({
      userId,
      nome: local.nome,
      latitude: local.latitude,
      longitude: local.longitude,
      raio: local.raio,
      cor: local.cor,
    });

    // Recarrega locais
    await get().recarregarLocais();

    // Reinicia geofencing para incluir novo local
    const { isGeofencingAtivo } = get();
    if (isGeofencingAtivo) {
      await get().pararMonitoramento();
      await get().iniciarMonitoramento();
    } else {
      // Auto-inicia monitoramento quando primeiro local é adicionado
      await get().iniciarMonitoramento();
    }

    logger.info('geofence', `✅ Local adicionado: ${local.nome}`, { id });
    return id;
  },

  removerLocal: async (id) => {
    const userId = useAuthStore.getState().getUserId();
    if (!userId) {
      throw new Error('Usuário não autenticado');
    }

    // VERIFICAR SE TEM SESSÃO ATIVA NESTE LOCAL
    const { useRegistroStore } = await import('./registroStore');
    const sessaoAtual = useRegistroStore.getState().sessaoAtual;
    
    if (sessaoAtual && sessaoAtual.local_id === id) {
      throw new Error('Não é possível excluir um local com sessão ativa. Encerre o cronômetro primeiro.');
    }

    logger.info('geofence', `🗑️ Removendo local`, { id });

    await deletarLocal(id, userId);
    
    // Remove do estado
    set(state => ({
      locais: state.locais.filter(l => l.id !== id),
      geofenceAtivo: state.geofenceAtivo === id ? null : state.geofenceAtivo,
    }));

    // Reinicia geofencing
    const { locais, isGeofencingAtivo } = get();
    if (isGeofencingAtivo) {
      if (locais.length === 0) {
        await get().pararMonitoramento();
      } else {
        await get().pararMonitoramento();
        await get().iniciarMonitoramento();
      }
    }

    logger.info('geofence', '✅ Local removido');
  },

  editarLocal: async (id, updates) => {
    const userId = useAuthStore.getState().getUserId();
    if (!userId) {
      throw new Error('Usuário não autenticado');
    }

    await atualizarLocal(id, userId, updates);
    await get().recarregarLocais();

    // Reinicia geofencing se estiver ativo
    const { isGeofencingAtivo } = get();
    if (isGeofencingAtivo) {
      await get().pararMonitoramento();
      await get().iniciarMonitoramento();
    }

    logger.info('geofence', '✅ Local editado', { id });
  },

  recarregarLocais: async () => {
    try {
      const userId = useAuthStore.getState().getUserId();
      if (!userId) {
        set({ locais: [] });
        return;
      }

      const locaisDB = await getLocaisAtivos(userId);
      const locais: LocalDeTrabalho[] = locaisDB.map(l => ({
        id: l.id,
        nome: l.nome,
        latitude: l.latitude,
        longitude: l.longitude,
        raio: l.raio,
        cor: l.cor,
        status: l.status,
      }));

      set({ locais });
      logger.debug('gps', `${locais.length} locais carregados`);
    } catch (error) {
      logger.error('gps', 'Erro ao carregar locais', { error: String(error) });
    }
  },

  iniciarMonitoramento: async () => {
    const { locais } = get();
    const locaisAtivos = locais.filter(l => l.status === 'active');

    if (locaisAtivos.length === 0) {
      logger.warn('geofence', 'Nenhum local ativo para monitorar');
      return;
    }

    // Prepara regiões de geofence
    const regioes: GeofenceRegion[] = locaisAtivos.map(l => ({
      identifier: l.id,
      latitude: l.latitude,
      longitude: l.longitude,
      radius: l.raio,
      notifyOnEnter: true,
      notifyOnExit: true,
    }));

    // Inicia geofencing nativo
    const success = await iniciarGeofencing(regioes);
    if (success) {
      set({ isGeofencingAtivo: true });

      // Inicia background location como backup
      await iniciarBackgroundLocation();
      set({ isBackgroundAtivo: true });

      // Inicia polling ativo
      get().iniciarPolling();

      // Salva estado
      await AsyncStorage.setItem(STORAGE_KEY_MONITORING, 'true');

      logger.info('geofence', '✅ Monitoramento completo iniciado');

      // Verifica geofence atual
      get().verificarGeofenceAtual();
    }
  },

  pararMonitoramento: async () => {
    get().pararPolling();
    await pararGeofencing();
    await pararBackgroundLocation();

    set({
      isGeofencingAtivo: false,
      isBackgroundAtivo: false,
      isPollingAtivo: false,
    });

    await AsyncStorage.setItem(STORAGE_KEY_MONITORING, 'false');
    logger.info('geofence', '⏹️ Monitoramento parado');
  },

  verificarGeofenceAtual: () => {
    const { localizacaoAtual, locais, geofenceAtivo, isProcessandoEvento, precisao } = get();
    
    if (!localizacaoAtual) return;
    if (isProcessandoEvento) return;

    const locaisAtivos = locais.filter(l => l.status === 'active');

    for (const local of locaisAtivos) {
      const dentro = estaDentroGeofence(localizacaoAtual, {
        identifier: local.id,
        latitude: local.latitude,
        longitude: local.longitude,
        radius: local.raio,
      });

      if (dentro) {
        if (geofenceAtivo !== local.id) {
          // Entrou no geofence
          logger.info('geofence', `✅ DENTRO: ${local.nome}`, {
            distancia: calcularDistancia(localizacaoAtual, { latitude: local.latitude, longitude: local.longitude }).toFixed(0) + 'm',
          });

          set({ geofenceAtivo: local.id, isProcessandoEvento: true });

          // Notifica workSessionStore
          const workSession = useWorkSessionStore.getState();
          workSession.handleGeofenceEnter(local.id, local.nome, {
            ...localizacaoAtual,
            accuracy: precisao ?? undefined,
          });

          setTimeout(() => set({ isProcessandoEvento: false }), 1000);
        }
        return; // Está dentro de um geofence, não precisa verificar outros
      }
    }

    // Não está em nenhum geofence
    if (geofenceAtivo !== null) {
      const localAnterior = locais.find(l => l.id === geofenceAtivo);
      
      logger.info('geofence', `🚪 SAIU: ${localAnterior?.nome || 'desconhecido'}`);

      // Notifica workSessionStore
      if (localAnterior) {
        const workSession = useWorkSessionStore.getState();
        workSession.handleGeofenceExit(localAnterior.id, localAnterior.nome, {
          ...localizacaoAtual!,
          accuracy: precisao ?? undefined,
        });
      }

      set({ geofenceAtivo: null });
    }
  },

  iniciarPolling: () => {
    get().pararPolling();
    
    logger.info('gps', '🔄 Iniciando polling (30s)');
    
    // Atualiza imediatamente
    get().atualizarLocalizacao();

    // Configura intervalo
    pollingTimer = setInterval(() => {
      logger.debug('gps', 'Polling...');
      get().atualizarLocalizacao();
    }, POLLING_INTERVAL);

    set({ isPollingAtivo: true });
  },

  pararPolling: () => {
    if (pollingTimer) {
      clearInterval(pollingTimer);
      pollingTimer = null;
      logger.info('gps', '⏹️ Polling parado');
    }
    set({ isPollingAtivo: false });
  },
}));

// ============================================
// HELPERS PRIVADOS
// ============================================

/**
 * Processa evento de geofence vindo do callback nativo
 */
function processarEventoGeofence(
  evento: GeofenceEvent,
  get: () => LocationState,
  set: (partial: Partial<LocationState>) => void
) {
  const { locais, localizacaoAtual, precisao } = get();
  const local = locais.find(l => l.id === evento.regionIdentifier);

  if (!local) {
    logger.warn('geofence', 'Local não encontrado para evento', { id: evento.regionIdentifier });
    return;
  }

  const workSession = useWorkSessionStore.getState();
  const coords = localizacaoAtual ? {
    ...localizacaoAtual,
    accuracy: precisao ?? undefined,
  } : undefined;

  if (evento.type === 'enter') {
    set({ geofenceAtivo: local.id });
    workSession.handleGeofenceEnter(local.id, local.nome, coords);
  } else {
    set({ geofenceAtivo: null });
    workSession.handleGeofenceExit(local.id, local.nome, coords);
  }
}

/**
 * Auto-inicia monitoramento se estava ativo antes
 */
async function autoIniciarMonitoramento(
  get: () => LocationState,
  set: (partial: Partial<LocationState>) => void
) {
  const { locais, isGeofencingAtivo } = get();

  if (isGeofencingAtivo) return;
  if (locais.length === 0) {
    logger.info('gps', 'Sem locais para monitorar');
    return;
  }

  try {
    const eraAtivo = await AsyncStorage.getItem(STORAGE_KEY_MONITORING);
    
    if (eraAtivo === 'true' || eraAtivo === null) {
      logger.info('gps', '🔄 Auto-iniciando monitoramento...');
      await get().iniciarMonitoramento();
    }
  } catch (error) {
    logger.error('gps', 'Erro ao verificar estado de monitoramento', { error: String(error) });
    // Inicia mesmo assim se há locais
    await get().iniciarMonitoramento();
  }
}
