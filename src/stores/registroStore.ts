/**
 * Registro Store - OnSite Timekeeper
 * 
 * Gerencia persistência de sessões de trabalho:
 * - Entrada/Saída no SQLite
 * - Estatísticas do dia
 * - Histórico de sessões
 */

import { create } from 'zustand';
import { Share } from 'react-native';
import { logger } from '../lib/logger';
import {
  initDatabase,
  criarRegistroEntrada,
  registrarSaida as dbRegistrarSaida,
  getSessaoAtivaGlobal,
  getSessoesHoje,
  getSessoesPorPeriodo,
  getEstatisticasHoje,
  formatarDuracao,
  type SessaoComputada,
  type EstatisticasDia,
} from '../lib/database';
import { gerarRelatorioSessao, gerarRelatorioCompleto } from '../lib/reports';
import { useAuthStore } from './authStore';
import type { Coordenadas } from '../lib/location';

// ============================================
// TIPOS
// ============================================

interface RegistroState {
  isInicializado: boolean;
  
  // Sessão atual (se houver uma aberta)
  sessaoAtual: SessaoComputada | null;
  
  // Sessões de hoje
  sessoesHoje: SessaoComputada[];
  
  // Estatísticas
  estatisticasHoje: EstatisticasDia;
  
  // Última sessão finalizada (para mostrar relatório)
  ultimaSessaoFinalizada: SessaoComputada | null;

  // Actions
  initialize: () => Promise<void>;
  
  // Registros
  registrarEntrada: (
    localId: string,
    localNome: string,
    coords?: Coordenadas & { accuracy?: number }
  ) => Promise<string>;
  
  registrarSaida: (
    localId: string,
    coords?: Coordenadas & { accuracy?: number }
  ) => Promise<void>;
  
  registrarSaidaComAjuste: (
    localId: string,
    coords?: Coordenadas & { accuracy?: number },
    ajusteMinutos?: number
  ) => Promise<void>;
  
  // Refresh
  recarregarDados: () => Promise<void>;
  
  // Relatórios
  compartilharUltimaSessao: () => Promise<void>;
  compartilharRelatorio: (dataInicio: string, dataFim: string) => Promise<void>;
  limparUltimaSessao: () => void;
  
  // Helpers
  getSessoesPeriodo: (dataInicio: string, dataFim: string) => Promise<SessaoComputada[]>;
}

// ============================================
// CONTROLE DE INICIALIZAÇÃO DO DB
// ============================================

let dbInicializado = false;
let dbInicializando = false;

async function garantirDbInicializado(): Promise<boolean> {
  if (dbInicializado) return true;

  if (dbInicializando) {
    // Aguarda inicialização em andamento
    let tentativas = 0;
    while (dbInicializando && tentativas < 50) {
      await new Promise(resolve => setTimeout(resolve, 100));
      tentativas++;
    }
    return dbInicializado;
  }

  dbInicializando = true;
  try {
    await initDatabase();
    dbInicializado = true;
    return true;
  } catch (error) {
    logger.error('database', 'Falha ao inicializar banco', { error: String(error) });
    return false;
  } finally {
    dbInicializando = false;
  }
}

// ============================================
// STORE
// ============================================

export const useRegistroStore = create<RegistroState>((set, get) => ({
  isInicializado: false,
  sessaoAtual: null,
  sessoesHoje: [],
  estatisticasHoje: { total_minutos: 0, total_sessoes: 0 },
  ultimaSessaoFinalizada: null,

  initialize: async () => {
    if (get().isInicializado) return;

    try {
      logger.info('boot', '📝 Inicializando registro store...');

      const dbOk = await garantirDbInicializado();
      if (!dbOk) {
        logger.error('database', 'Não foi possível inicializar o banco');
        set({ isInicializado: true });
        return;
      }

      await get().recarregarDados();

      set({ isInicializado: true });
      logger.info('boot', '✅ Registro store inicializado');
    } catch (error) {
      logger.error('database', 'Erro na inicialização do registro store', { error: String(error) });
      set({ isInicializado: true });
    }
  },

  registrarEntrada: async (localId, localNome, coords) => {
    const userId = useAuthStore.getState().getUserId();
    if (!userId) {
      throw new Error('Usuário não autenticado');
    }

    try {
      const dbOk = await garantirDbInicializado();
      if (!dbOk) throw new Error('Banco não disponível');

      logger.info('session', `📥 ENTRADA: ${localNome}`, { localId });

      const registroId = await criarRegistroEntrada({
        userId,
        localId,
        localNome,
        tipo: 'automatico',
      });

      await get().recarregarDados();

      return registroId;
    } catch (error) {
      logger.error('database', 'Erro ao registrar entrada', { error: String(error) });
      throw error;
    }
  },

  registrarSaida: async (localId, coords) => {
    const userId = useAuthStore.getState().getUserId();
    if (!userId) {
      throw new Error('Usuário não autenticado');
    }

    try {
      const dbOk = await garantirDbInicializado();
      if (!dbOk) throw new Error('Banco não disponível');

      logger.info('session', `📤 SAÍDA`, { localId });

      await dbRegistrarSaida(userId, localId);

      await get().recarregarDados();

      // Guarda última sessão finalizada para relatório
      const { sessoesHoje } = get();
      const sessaoFinalizada = sessoesHoje.find(
        s => s.local_id === localId && s.status === 'finalizada'
      );
      if (sessaoFinalizada) {
        set({ ultimaSessaoFinalizada: sessaoFinalizada });
      }
    } catch (error) {
      logger.error('database', 'Erro ao registrar saída', { error: String(error) });
      throw error;
    }
  },

  registrarSaidaComAjuste: async (localId, coords, ajusteMinutos = 0) => {
    const userId = useAuthStore.getState().getUserId();
    if (!userId) {
      throw new Error('Usuário não autenticado');
    }

    try {
      const dbOk = await garantirDbInicializado();
      if (!dbOk) throw new Error('Banco não disponível');

      logger.info('session', `📤 SAÍDA (ajuste: ${ajusteMinutos}min)`, { localId });

      await dbRegistrarSaida(userId, localId, ajusteMinutos);

      await get().recarregarDados();

      // Guarda última sessão finalizada
      const { sessoesHoje } = get();
      const sessaoFinalizada = sessoesHoje.find(
        s => s.local_id === localId && s.status === 'finalizada'
      );
      if (sessaoFinalizada) {
        set({ ultimaSessaoFinalizada: sessaoFinalizada });
      }
    } catch (error) {
      logger.error('database', 'Erro ao registrar saída com ajuste', { error: String(error) });
      throw error;
    }
  },

  recarregarDados: async () => {
    const userId = useAuthStore.getState().getUserId();
    if (!userId) {
      set({
        sessaoAtual: null,
        sessoesHoje: [],
        estatisticasHoje: { total_minutos: 0, total_sessoes: 0 },
      });
      return;
    }

    try {
      const dbOk = await garantirDbInicializado();
      if (!dbOk) return;

      const [sessaoAtual, sessoesHoje, estatisticasHoje] = await Promise.all([
        getSessaoAtivaGlobal(userId),
        getSessoesHoje(userId),
        getEstatisticasHoje(userId),
      ]);

      set({ sessaoAtual, sessoesHoje, estatisticasHoje });

      logger.debug('database', 'Dados recarregados', {
        sessaoAtiva: sessaoAtual?.local_nome ?? 'nenhuma',
        sessoes: sessoesHoje.length,
        minutos: estatisticasHoje.total_minutos,
      });
    } catch (error) {
      logger.error('database', 'Erro ao recarregar dados', { error: String(error) });
    }
  },

  compartilharUltimaSessao: async () => {
    const { ultimaSessaoFinalizada } = get();
    if (!ultimaSessaoFinalizada) {
      logger.warn('database', 'Nenhuma sessão para compartilhar');
      return;
    }

    try {
      const nomeUsuario = useAuthStore.getState().getUserName();
      const relatorio = gerarRelatorioSessao(ultimaSessaoFinalizada, nomeUsuario ?? undefined);
      
      await Share.share({
        message: relatorio,
        title: 'Registro de Trabalho',
      });

      logger.info('database', 'Relatório compartilhado');
    } catch (error) {
      logger.error('database', 'Erro ao compartilhar', { error: String(error) });
    }
  },

  compartilharRelatorio: async (dataInicio, dataFim) => {
    const userId = useAuthStore.getState().getUserId();
    if (!userId) return;

    try {
      const sessoes = await getSessoesPorPeriodo(userId, dataInicio, dataFim);
      const nomeUsuario = useAuthStore.getState().getUserName();
      const relatorio = gerarRelatorioCompleto(sessoes, nomeUsuario ?? undefined);

      await Share.share({
        message: relatorio,
        title: 'Relatório de Horas',
      });

      logger.info('database', 'Relatório completo compartilhado');
    } catch (error) {
      logger.error('database', 'Erro ao compartilhar relatório', { error: String(error) });
    }
  },

  limparUltimaSessao: () => {
    set({ ultimaSessaoFinalizada: null });
  },

  getSessoesPeriodo: async (dataInicio, dataFim) => {
    const userId = useAuthStore.getState().getUserId();
    if (!userId) return [];

    try {
      return await getSessoesPorPeriodo(userId, dataInicio, dataFim);
    } catch (error) {
      logger.error('database', 'Erro ao buscar sessões por período', { error: String(error) });
      return [];
    }
  },
}));

// ============================================
// HOOK HELPER
// ============================================

export function useFormatarDuracao(minutos: number | null | undefined): string {
  return formatarDuracao(minutos);
}
