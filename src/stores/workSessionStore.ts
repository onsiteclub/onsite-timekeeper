/**
 * Work Session Store - OnSite Timekeeper
 * 
 * Gerencia o fluxo de sessões de trabalho:
 * - Popup fullscreen de entrada/saída (estilo soneca)
 * - Auto-ação após 30 segundos
 * - Sistema de PAUSA com countdown de 30 minutos
 * - Retorno à fence (mesma sessão)
 * - Integração com notificações
 */

import { create } from 'zustand';
import * as Notifications from 'expo-notifications';
import { logger } from '../lib/logger';
import {
  solicitarPermissaoNotificacao,
  configurarCategoriasNotificacao,
  mostrarNotificacaoEntrada,
  mostrarNotificacaoSaida,
  mostrarNotificacaoAutoAcao,
  agendarLembreteInicio,
  cancelarNotificacao,
  adicionarListenerResposta,
  type NotificationAction,
  type GeofenceNotificationData,
} from '../lib/notifications';
import { useRegistroStore } from './registroStore';
import { useAuthStore } from './authStore';
import type { Coordenadas } from '../lib/location';

// ============================================
// CONSTANTES
// ============================================

const AUTO_ACTION_TIMEOUT = 30000; // 30 segundos para popup
const PAUSE_TIMEOUT = 30 * 60 * 1000; // 30 minutos para pausa

// ============================================
// TIPOS
// ============================================

export type PendingActionType = 'enter' | 'exit' | 'return';

export interface PendingAction {
  type: PendingActionType;
  localId: string;
  localNome: string;
  notificationId: string;
  timeoutId: NodeJS.Timeout;
  coords?: Coordenadas & { accuracy?: number };
  startTime: number; // Para countdown
}

export interface PauseState {
  isPaused: boolean;
  localId: string;
  localNome: string;
  startTime: number; // Quando pausou
  timeoutId: NodeJS.Timeout | null;
}

interface WorkSessionState {
  // Estado
  isInicializado: boolean;
  
  // Ação pendente (exibe popup fullscreen)
  pendingAction: PendingAction | null;
  
  // Estado de PAUSA (novo!)
  pauseState: PauseState | null;
  
  // Locais ignorados hoje
  skippedToday: string[];
  
  // Lembretes agendados (localId -> notificationId)
  delayedStarts: Map<string, string>;

  // Actions
  initialize: () => Promise<void>;
  
  // Handlers de geofence (chamados pelo locationStore)
  handleGeofenceEnter: (
    localId: string,
    localNome: string,
    coords?: Coordenadas & { accuracy?: number }
  ) => Promise<void>;
  
  handleGeofenceExit: (
    localId: string,
    localNome: string,
    coords?: Coordenadas & { accuracy?: number }
  ) => Promise<void>;
  
  // Ações do usuário no popup
  acaoIniciar: () => Promise<void>;
  acaoIgnorarHoje: () => void;
  acaoDelay10Min: () => Promise<void>;
  acaoPausar: () => Promise<void>;
  acaoRetomar: () => Promise<void>;
  acaoEncerrar: () => Promise<void>;
  acaoEncerrarComAjuste: (minutosAtras: number) => Promise<void>;
  
  // Helpers
  limparPending: () => void;
  limparPausa: () => void;
  resetSkippedToday: () => void;
  getTempoRestante: () => number;
  getTempoRestantePausa: () => number;
}

// ============================================
// STORE
// ============================================

export const useWorkSessionStore = create<WorkSessionState>((set, get) => ({
  isInicializado: false,
  pendingAction: null,
  pauseState: null,
  skippedToday: [],
  delayedStarts: new Map(),

  initialize: async () => {
    if (get().isInicializado) return;

    try {
      logger.info('boot', '⏱️ Inicializando work session store...');

      // Solicita permissões de notificação
      await solicitarPermissaoNotificacao();

      // Configura categorias de ações
      await configurarCategoriasNotificacao();

      // Listener para respostas às notificações
      adicionarListenerResposta((response) => {
        const actionId = response.actionIdentifier;
        const data = response.notification.request.content.data as GeofenceNotificationData;

        logger.info('notification', `📲 Ação recebida: ${actionId}`, { data });

        // Mapeia ação
        switch (actionId) {
          case 'start':
            get().acaoIniciar();
            break;
          case 'skip_today':
            get().acaoIgnorarHoje();
            break;
          case 'delay_10min':
            get().acaoDelay10Min();
            break;
          case 'pause':
            get().acaoPausar();
            break;
          case 'resume':
            get().acaoRetomar();
            break;
          case 'stop':
            get().acaoEncerrar();
            break;
          case Notifications.DEFAULT_ACTION_IDENTIFIER:
            // Usuário tocou na notificação (sem botão específico)
            // Abre o app - ação será decidida pelo popup
            break;
        }
      });

      set({ isInicializado: true });
      logger.info('boot', '✅ Work session store inicializado');
    } catch (error) {
      logger.error('session', 'Erro na inicialização', { error: String(error) });
      set({ isInicializado: true });
    }
  },

  // ============================================
  // ENTRADA NA FENCE
  // ============================================
  handleGeofenceEnter: async (localId, localNome, coords) => {
    const { skippedToday, pendingAction, pauseState } = get();
    const registroStore = useRegistroStore.getState();

    // ============================================
    // CASO 1: Estava PAUSADO neste local → RETORNO!
    // ============================================
    if (pauseState && pauseState.localId === localId) {
      logger.info('session', `🔄 RETORNO (pausado): ${localNome}`);

      // Cancela timer de pausa
      if (pauseState.timeoutId) {
        clearTimeout(pauseState.timeoutId);
      }

      // Cancela pending anterior se houver
      if (pendingAction) {
        clearTimeout(pendingAction.timeoutId);
        await cancelarNotificacao(pendingAction.notificationId);
      }

      // Configura auto-RETOMAR em 30 segundos
      const timeoutId = setTimeout(async () => {
        logger.info('session', '⏱️ Auto-RETOMAR (30s timeout)');
        await get().acaoRetomar();
        await mostrarNotificacaoAutoAcao(localNome, 'start');
      }, AUTO_ACTION_TIMEOUT);

      set({
        pendingAction: {
          type: 'return',
          localId,
          localNome,
          notificationId: '',
          timeoutId,
          coords,
          startTime: Date.now(),
        },
      });

      return;
    }

    // Verifica se local foi ignorado hoje
    if (skippedToday.includes(localId)) {
      logger.info('session', `Local ignorado hoje: ${localNome}`);
      return;
    }

    // Verifica se já tem sessão ativa neste local
    const sessaoAtual = registroStore.sessaoAtual;
    if (sessaoAtual?.local_id === localId && sessaoAtual.status === 'ativa') {
      logger.debug('session', 'Já trabalhando neste local');
      return;
    }

    // Verifica se já tem sessão ativa em OUTRO local
    if (sessaoAtual && sessaoAtual.status === 'ativa' && sessaoAtual.local_id !== localId) {
      logger.warn('session', 'Sessão ativa em outro local - ignorando entrada', {
        localAtivo: sessaoAtual.local_id,
        novoLocal: localId,
      });
      return;
    }

    // Cancela pending anterior se houver
    if (pendingAction) {
      clearTimeout(pendingAction.timeoutId);
      await cancelarNotificacao(pendingAction.notificationId);
    }

    logger.info('session', `📍 ENTRADA: ${localNome}`);

    // Mostra notificação (desativado por enquanto)
    const notificationId = '';

    // Configura auto-start em 30 segundos
    const timeoutId = setTimeout(async () => {
      logger.info('session', '⏱️ Auto-START (30s timeout)');
      await get().acaoIniciar();
      await mostrarNotificacaoAutoAcao(localNome, 'start');
    }, AUTO_ACTION_TIMEOUT);

    set({
      pendingAction: {
        type: 'enter',
        localId,
        localNome,
        notificationId,
        timeoutId,
        coords,
        startTime: Date.now(),
      },
    });
  },

  // ============================================
  // SAÍDA DA FENCE
  // ============================================
  handleGeofenceExit: async (localId, localNome, coords) => {
    const { pendingAction, pauseState } = get();
    const registroStore = useRegistroStore.getState();

    // Se já está pausado, não faz nada (já saiu antes)
    if (pauseState && pauseState.localId === localId) {
      logger.debug('session', 'Já está pausado neste local');
      return;
    }

    // Se tinha entrada pendente, cancela (saiu antes de decidir)
    if (pendingAction?.type === 'enter' && pendingAction.localId === localId) {
      clearTimeout(pendingAction.timeoutId);
      await cancelarNotificacao(pendingAction.notificationId);
      set({ pendingAction: null });
      logger.info('session', 'Entrada cancelada - saiu rapidamente');
      return;
    }

    // Verifica se está trabalhando neste local
    const sessaoAtual = registroStore.sessaoAtual;
    if (!sessaoAtual || sessaoAtual.local_id !== localId || sessaoAtual.status !== 'ativa') {
      logger.debug('session', 'Não estava trabalhando neste local');
      return;
    }

    // Cancela pending anterior se houver
    if (pendingAction) {
      clearTimeout(pendingAction.timeoutId);
      await cancelarNotificacao(pendingAction.notificationId);
    }

    logger.info('session', `🚪 SAÍDA: ${localNome}`);

    // Mostra notificação
    const notificationId = await mostrarNotificacaoSaida(localId, localNome);

    // Configura auto-ENCERRAR em 30 segundos
    const timeoutId = setTimeout(async () => {
      logger.info('session', '⏱️ Auto-ENCERRAR (30s timeout)');
      await get().acaoEncerrar();
      await mostrarNotificacaoAutoAcao(localNome, 'stop');
    }, AUTO_ACTION_TIMEOUT);

    set({
      pendingAction: {
        type: 'exit',
        localId,
        localNome,
        notificationId,
        timeoutId,
        coords,
        startTime: Date.now(),
      },
    });
  },

  // ============================================
  // AÇÃO: INICIAR
  // ============================================
  acaoIniciar: async () => {
    const { pendingAction } = get();
    if (!pendingAction || pendingAction.type !== 'enter') return;

    logger.info('session', `▶️ INICIAR: ${pendingAction.localNome}`);

    // Limpa pending
    clearTimeout(pendingAction.timeoutId);
    await cancelarNotificacao(pendingAction.notificationId);

    // Registra entrada
    const registroStore = useRegistroStore.getState();
    await registroStore.registrarEntrada(
      pendingAction.localId,
      pendingAction.localNome,
      pendingAction.coords
    );

    set({ pendingAction: null });
  },

  // ============================================
  // AÇÃO: IGNORAR HOJE
  // ============================================
  acaoIgnorarHoje: () => {
    const { pendingAction, skippedToday } = get();
    if (!pendingAction) return;

    logger.info('session', `😴 IGNORAR HOJE: ${pendingAction.localNome}`);

    // Limpa pending
    clearTimeout(pendingAction.timeoutId);
    cancelarNotificacao(pendingAction.notificationId);

    // Adiciona à lista de ignorados
    set({
      pendingAction: null,
      skippedToday: [...skippedToday, pendingAction.localId],
    });
  },

  // ============================================
  // AÇÃO: DELAY 10 MIN
  // ============================================
  acaoDelay10Min: async () => {
    const { pendingAction, delayedStarts } = get();
    if (!pendingAction || pendingAction.type !== 'enter') return;

    logger.info('session', `⏰ DELAY 10 MIN: ${pendingAction.localNome}`);

    // Limpa pending atual
    clearTimeout(pendingAction.timeoutId);
    await cancelarNotificacao(pendingAction.notificationId);

    // Agenda lembrete
    const notificationId = await agendarLembreteInicio(
      pendingAction.localId,
      pendingAction.localNome,
      10
    );

    const newDelayed = new Map(delayedStarts);
    newDelayed.set(pendingAction.localId, notificationId);

    set({
      pendingAction: null,
      delayedStarts: newDelayed,
    });
  },

  // ============================================
  // AÇÃO: PAUSAR (novo!)
  // ============================================
  acaoPausar: async () => {
    const { pendingAction } = get();
    if (!pendingAction || pendingAction.type !== 'exit') return;

    logger.info('session', `⏸️ PAUSAR: ${pendingAction.localNome}`);

    // Limpa pending
    clearTimeout(pendingAction.timeoutId);
    await cancelarNotificacao(pendingAction.notificationId);

    // Configura timer de 30 minutos
    const pauseTimeoutId = setTimeout(async () => {
      logger.info('session', '⏱️ PAUSA EXPIROU (30min) - Auto-encerrando');
      
      // Encerra sessão
      const registroStore = useRegistroStore.getState();
      const { pauseState } = get();
      
      if (pauseState) {
        // Calcula minutos de pausa
        const pausaMinutos = Math.floor((Date.now() - pauseState.startTime) / 60000);
        
        await registroStore.registrarSaida(pauseState.localId);
        
        // Atualiza pausa_minutos no registro
        // (opcional: pode ser implementado depois)
        
        await mostrarNotificacaoAutoAcao(pauseState.localNome, 'stop');
      }
      
      set({ pauseState: null, pendingAction: null });
    }, PAUSE_TIMEOUT);

    // Salva estado de pausa
    set({
      pendingAction: null,
      pauseState: {
        isPaused: true,
        localId: pendingAction.localId,
        localNome: pendingAction.localNome,
        startTime: Date.now(),
        timeoutId: pauseTimeoutId,
      },
    });
  },

  // ============================================
  // AÇÃO: RETOMAR (após pausa)
  // ============================================
  acaoRetomar: async () => {
    const { pendingAction, pauseState } = get();
    
    // Pode vir do popup de return ou da tela de pausa
    if (pendingAction?.type === 'return') {
      logger.info('session', `▶️ RETOMAR: ${pendingAction.localNome}`);
      
      // Limpa pending
      clearTimeout(pendingAction.timeoutId);
      await cancelarNotificacao(pendingAction.notificationId);
    }

    // Limpa estado de pausa (mas NÃO encerra sessão!)
    if (pauseState?.timeoutId) {
      clearTimeout(pauseState.timeoutId);
    }

    // Calcula minutos pausados (para registro futuro)
    const pausaMinutos = pauseState 
      ? Math.floor((Date.now() - pauseState.startTime) / 60000)
      : 0;

    logger.info('session', `✅ Sessão retomada (pausou ${pausaMinutos}min)`);

    set({ 
      pendingAction: null, 
      pauseState: null,
    });
  },

  // ============================================
  // AÇÃO: ENCERRAR
  // ============================================
  acaoEncerrar: async () => {
    const { pendingAction, pauseState } = get();
    
    let localId: string | null = null;
    let coords: (Coordenadas & { accuracy?: number }) | undefined;

    // Pode vir do popup de exit, return, ou da tela de pausa
    if (pendingAction) {
      localId = pendingAction.localId;
      coords = pendingAction.coords;
      
      clearTimeout(pendingAction.timeoutId);
      await cancelarNotificacao(pendingAction.notificationId);
      
      logger.info('session', `⏹️ ENCERRAR: ${pendingAction.localNome}`);
    } else if (pauseState) {
      localId = pauseState.localId;
      
      if (pauseState.timeoutId) {
        clearTimeout(pauseState.timeoutId);
      }
      
      logger.info('session', `⏹️ ENCERRAR (da pausa): ${pauseState.localNome}`);
    }

    if (!localId) {
      logger.warn('session', 'Nenhuma sessão para encerrar');
      return;
    }

    // Registra saída
    const registroStore = useRegistroStore.getState();
    await registroStore.registrarSaida(localId, coords);

    set({ pendingAction: null, pauseState: null });
  },

  // ============================================
  // AÇÃO: ENCERRAR COM AJUSTE
  // ============================================
  acaoEncerrarComAjuste: async (minutosAtras) => {
    const { pendingAction, pauseState } = get();
    
    let localId: string | null = null;
    let coords: (Coordenadas & { accuracy?: number }) | undefined;

    if (pendingAction?.type === 'exit' || pendingAction?.type === 'return') {
      localId = pendingAction.localId;
      coords = pendingAction.coords;
      
      clearTimeout(pendingAction.timeoutId);
      await cancelarNotificacao(pendingAction.notificationId);
      
      logger.info('session', `⏹️ ENCERRAR (há ${minutosAtras} min): ${pendingAction.localNome}`);
    } else if (pauseState) {
      localId = pauseState.localId;
      
      if (pauseState.timeoutId) {
        clearTimeout(pauseState.timeoutId);
      }
    }

    if (!localId) return;

    // Registra saída com ajuste negativo
    const registroStore = useRegistroStore.getState();
    await registroStore.registrarSaidaComAjuste(
      localId,
      coords,
      -minutosAtras // Negativo = desconta tempo
    );

    set({ pendingAction: null, pauseState: null });
  },

  // ============================================
  // HELPERS
  // ============================================
  limparPending: () => {
    const { pendingAction } = get();
    if (pendingAction) {
      clearTimeout(pendingAction.timeoutId);
      cancelarNotificacao(pendingAction.notificationId);
    }
    set({ pendingAction: null });
  },

  limparPausa: () => {
    const { pauseState } = get();
    if (pauseState?.timeoutId) {
      clearTimeout(pauseState.timeoutId);
    }
    set({ pauseState: null });
  },

  resetSkippedToday: () => {
    set({ skippedToday: [], delayedStarts: new Map() });
    logger.info('session', 'Lista de ignorados resetada');
  },

  getTempoRestante: () => {
    const { pendingAction } = get();
    if (!pendingAction) return 0;
    
    const elapsed = Date.now() - pendingAction.startTime;
    const remaining = Math.max(0, AUTO_ACTION_TIMEOUT - elapsed);
    return Math.ceil(remaining / 1000);
  },

  getTempoRestantePausa: () => {
    const { pauseState } = get();
    if (!pauseState) return 0;
    
    const elapsed = Date.now() - pauseState.startTime;
    const remaining = Math.max(0, PAUSE_TIMEOUT - elapsed);
    return Math.ceil(remaining / 1000);
  },
}));
