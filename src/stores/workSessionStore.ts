/**
 * Work Session Store - OnSite Timekeeper
 * 
 * Gerencia o fluxo de sessões de trabalho:
 * - Popup fullscreen de entrada/saída (estilo soneca)
 * - Auto-ação após 30 segundos
 * - Sistema de PAUSA com countdown de 30 minutos
 * - Retorno à fence (mesma sessão)
 * - Integração com notificações
 * 
 * MODIFICADO: 
 * - Eventos de geofence TÊM PRIORIDADE sobre modais pendentes
 * - skippedToday é limpo ao SAIR da fence
 * - Enter cancela Exit pendente (usuário voltou rápido)
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
import {
  addToSkippedToday,
  removeFromSkippedToday,
  clearSkippedToday,
} from '../lib/backgroundTasks';
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
  
  // Locais ignorados hoje (limpa ao sair da fence)
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
  removerDoSkippedToday: (localId: string) => void;
  getTempoRestante: () => number;
  getTempoRestantePausa: () => number;
}

// ============================================
// HELPER: Limpar pending action de forma segura
// ============================================

async function limparPendingAction(pendingAction: PendingAction | null): Promise<void> {
  if (!pendingAction) return;
  
  clearTimeout(pendingAction.timeoutId);
  if (pendingAction.notificationId) {
    await cancelarNotificacao(pendingAction.notificationId);
  }
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

    logger.info('session', `📍 GEOFENCE ENTER: ${localNome}`, { localId });

    // ============================================
    // PRIORIDADE: Fecha modal de relatório se estiver aberto
    // (Eventos de geofence têm prioridade sobre modais informativos)
    // ============================================
    if (registroStore.ultimaSessaoFinalizada) {
      logger.debug('session', 'Fechando modal de relatório para processar evento');
      registroStore.limparUltimaSessao();
    }

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
      await limparPendingAction(pendingAction);

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

    // ============================================
    // CASO 2: Tinha EXIT pendente → usuário voltou rápido!
    // Cancela o exit e NÃO mostra popup (continua trabalhando)
    // ============================================
    if (pendingAction?.type === 'exit' && pendingAction.localId === localId) {
      logger.info('session', `↩️ RETORNO RÁPIDO: ${localNome} (cancelando exit pendente)`);
      
      await limparPendingAction(pendingAction);
      set({ pendingAction: null });
      
      // Não precisa fazer nada - sessão continua ativa
      return;
    }

    // ============================================
    // CASO 3: Pausado em OUTRO local, entrando em novo
    // → Encerra pausa anterior e trata como nova entrada
    // ============================================
    if (pauseState && pauseState.localId !== localId) {
      logger.warn('session', `⚠️ Pausado em ${pauseState.localNome}, entrando em ${localNome}`);
      
      // Encerra sessão pausada
      if (pauseState.timeoutId) {
        clearTimeout(pauseState.timeoutId);
      }
      
      // Registra saída da sessão pausada
      await registroStore.registrarSaida(pauseState.localId);
      
      set({ pauseState: null });
      
      // Continua para processar nova entrada...
    }

    // ============================================
    // CASO 4: Verifica se local foi ignorado hoje
    // ============================================
    if (skippedToday.includes(localId)) {
      logger.info('session', `😴 Local ignorado hoje: ${localNome}`);
      return;
    }

    // ============================================
    // CASO 5: Já tem sessão ativa neste local
    // ============================================
    const sessaoAtual = registroStore.sessaoAtual;
    if (sessaoAtual?.local_id === localId && sessaoAtual.status === 'ativa') {
      logger.debug('session', 'Já trabalhando neste local');
      return;
    }

    // ============================================
    // CASO 6: Sessão ativa em OUTRO local
    // → Por segurança, ignora (não pode ter 2 sessões)
    // ============================================
    if (sessaoAtual && sessaoAtual.status === 'ativa' && sessaoAtual.local_id !== localId) {
      logger.warn('session', 'Sessão ativa em outro local - ignorando entrada', {
        localAtivo: sessaoAtual.local_id,
        novoLocal: localId,
      });
      return;
    }

    // ============================================
    // CASO 7: Tinha outro pending (enter de outro local, etc)
    // → Cancela e processa o novo enter
    // ============================================
    if (pendingAction) {
      logger.info('session', `Cancelando pending anterior (${pendingAction.type}) para processar nova entrada`);
      await limparPendingAction(pendingAction);
    }

    // ============================================
    // CRIAR POPUP DE ENTRADA
    // ============================================
    logger.info('session', `📍 ENTRADA: ${localNome}`);

    // Mostra notificação (pode estar desativado)
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
    const { pendingAction, pauseState, skippedToday } = get();
    const registroStore = useRegistroStore.getState();

    logger.info('session', `🚪 GEOFENCE EXIT: ${localNome}`, { localId });

    // ============================================
    // PRIORIDADE: Fecha modal de relatório se estiver aberto
    // ============================================
    if (registroStore.ultimaSessaoFinalizada) {
      logger.debug('session', 'Fechando modal de relatório para processar evento');
      registroStore.limparUltimaSessao();
    }

    // ============================================
    // SEMPRE: Remove do skippedToday ao sair
    // (permite que na próxima entrada, popup apareça)
    // ============================================
    if (skippedToday.includes(localId)) {
      logger.info('session', `🔄 Removendo ${localNome} do skippedToday (saiu da fence)`);
      
      // Remove do AsyncStorage (para background tasks)
      removeFromSkippedToday(localId);
      
      // Remove do state local
      set({ 
        skippedToday: skippedToday.filter(id => id !== localId) 
      });
    }

    // ============================================
    // CASO 1: Já está pausado neste local → não faz nada
    // ============================================
    if (pauseState && pauseState.localId === localId) {
      logger.debug('session', 'Já está pausado neste local');
      return;
    }

    // ============================================
    // CASO 2: Tinha entrada pendente neste local → cancela
    // (saiu antes de decidir se queria trabalhar)
    // ============================================
    if (pendingAction?.type === 'enter' && pendingAction.localId === localId) {
      await limparPendingAction(pendingAction);
      set({ pendingAction: null });
      logger.info('session', '❌ Entrada cancelada - saiu antes de decidir');
      return;
    }

    // ============================================
    // CASO 3: Tinha return pendente (voltou da pausa mas saiu de novo)
    // → Cancela return, continua pausado
    // ============================================
    if (pendingAction?.type === 'return' && pendingAction.localId === localId) {
      await limparPendingAction(pendingAction);
      set({ pendingAction: null });
      logger.info('session', '⏸️ Retorno cancelado - saiu novamente (continua pausado)');
      // Nota: pauseState ainda existe, então sessão continua pausada
      return;
    }

    // ============================================
    // CASO 4: Verifica se está trabalhando neste local
    // ============================================
    const sessaoAtual = registroStore.sessaoAtual;
    if (!sessaoAtual || sessaoAtual.local_id !== localId || sessaoAtual.status !== 'ativa') {
      logger.debug('session', 'Não estava trabalhando neste local');
      return;
    }

    // ============================================
    // CASO 5: Tinha outro pending → cancela
    // ============================================
    if (pendingAction) {
      logger.info('session', `Cancelando pending anterior (${pendingAction.type}) para processar saída`);
      await limparPendingAction(pendingAction);
    }

    // ============================================
    // CRIAR POPUP DE SAÍDA
    // ============================================
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
    await limparPendingAction(pendingAction);

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
  // (Só ignora enquanto estiver DENTRO da fence)
  // ============================================
  acaoIgnorarHoje: () => {
    const { pendingAction, skippedToday } = get();
    if (!pendingAction) return;

    logger.info('session', `😴 IGNORAR HOJE: ${pendingAction.localNome}`);

    // Limpa pending
    clearTimeout(pendingAction.timeoutId);
    if (pendingAction.notificationId) {
      cancelarNotificacao(pendingAction.notificationId);
    }

    // Persiste no AsyncStorage (para background tasks respeitarem)
    addToSkippedToday(pendingAction.localId);

    // Adiciona à lista de ignorados local
    // NOTA: Será removido quando SAIR da fence
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
    await limparPendingAction(pendingAction);

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
  // AÇÃO: PAUSAR (30 minutos)
  // ============================================
  acaoPausar: async () => {
    const { pendingAction } = get();
    if (!pendingAction || pendingAction.type !== 'exit') return;

    logger.info('session', `⏸️ PAUSAR: ${pendingAction.localNome}`);

    // Limpa pending
    await limparPendingAction(pendingAction);

    // Configura timer de 30 minutos
    const pauseTimeoutId = setTimeout(async () => {
      logger.info('session', '⏱️ PAUSA EXPIROU (30min) - Auto-encerrando');
      
      // Encerra sessão
      const registroStore = useRegistroStore.getState();
      const { pauseState } = get();
      
      if (pauseState) {
        await registroStore.registrarSaida(pauseState.localId);
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
      await limparPendingAction(pendingAction);
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
      
      await limparPendingAction(pendingAction);
      
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
      
      await limparPendingAction(pendingAction);
      
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
      if (pendingAction.notificationId) {
        cancelarNotificacao(pendingAction.notificationId);
      }
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
    // Limpa AsyncStorage
    clearSkippedToday();
    
    // Limpa state local
    set({ skippedToday: [], delayedStarts: new Map() });
    logger.info('session', 'Lista de ignorados resetada');
  },

  removerDoSkippedToday: (localId: string) => {
    const { skippedToday } = get();
    if (skippedToday.includes(localId)) {
      // Remove do AsyncStorage
      removeFromSkippedToday(localId);
      
      // Remove do state local
      set({ skippedToday: skippedToday.filter(id => id !== localId) });
      logger.debug('session', `Removido ${localId} do skippedToday`);
    }
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
