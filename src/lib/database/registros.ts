/**
 * Database - Registros (Sessões de Trabalho)
 * 
 * CRUD de registros e funções de sync
 */

import { logger } from '../logger';
import {
  db,
  generateUUID,
  now,
  calcularDuracao,
  registrarSyncLog,
  type RegistroDB,
  type RegistroTipo,
  type SessaoComputada,
  type EstatisticasDia,
} from './core';
import { getLocalById } from './locais';
import { incrementarTelemetria } from './tracking';

// ============================================
// TIPOS
// ============================================

export interface CriarRegistroParams {
  userId: string;
  localId: string;
  localNome: string;
  tipo?: RegistroTipo;
  cor?: string;
}

// ============================================
// CRUD
// ============================================

export async function criarRegistroEntrada(params: CriarRegistroParams): Promise<string> {
  const id = generateUUID();
  const timestamp = now();

  try {
    // Buscar cor do local se não fornecida
    let cor = params.cor;
    if (!cor) {
      const local = await getLocalById(params.localId);
      cor = local?.cor || '#3B82F6';
    }

    db.runSync(
      `INSERT INTO registros (id, user_id, local_id, local_nome, entrada, tipo, cor, pausa_minutos, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)`,
      [
        id,
        params.userId,
        params.localId,
        params.localNome,
        timestamp,
        params.tipo || 'automatico',
        cor,
        timestamp
      ]
    );

    // Log de sync
    await registrarSyncLog(params.userId, 'registro', id, 'create', null, params);

    // Incrementa telemetria
    if (params.tipo === 'manual') {
      await incrementarTelemetria(params.userId, 'manual_entries_count');
    } else {
      await incrementarTelemetria(params.userId, 'geofence_entries_count');
    }

    logger.info('database', `📥 Registro criado: ${params.localNome}`, { id });
    return id;
  } catch (error) {
    logger.error('database', 'Erro ao criar registro', { error: String(error) });
    throw error;
  }
}

export async function registrarSaida(
  userId: string,
  localId: string,
  ajusteMinutos: number = 0
): Promise<void> {
  try {
    // Busca sessão ativa para este local
    const sessao = db.getFirstSync<RegistroDB>(
      `SELECT * FROM registros WHERE user_id = ? AND local_id = ? AND saida IS NULL ORDER BY entrada DESC LIMIT 1`,
      [userId, localId]
    );

    if (!sessao) {
      throw new Error('Nenhuma sessão ativa encontrada para este local');
    }

    // Calcular saída com ajuste
    let saidaTime = new Date();
    if (ajusteMinutos > 0) {
      saidaTime = new Date(saidaTime.getTime() - ajusteMinutos * 60000);
    }

    db.runSync(
      `UPDATE registros SET saida = ?, synced_at = NULL WHERE id = ?`,
      [saidaTime.toISOString(), sessao.id]
    );

    // Log de sync
    await registrarSyncLog(userId, 'registro', sessao.id, 'update', 
      { saida: null }, 
      { saida: saidaTime.toISOString() }
    );

    logger.info('database', `📤 Saída registrada`, { id: sessao.id, ajusteMinutos });
  } catch (error) {
    logger.error('database', 'Erro ao registrar saída', { error: String(error) });
    throw error;
  }
}

export async function getSessaoAberta(userId: string, localId: string): Promise<RegistroDB | null> {
  try {
    return db.getFirstSync<RegistroDB>(
      `SELECT * FROM registros WHERE user_id = ? AND local_id = ? AND saida IS NULL ORDER BY entrada DESC LIMIT 1`,
      [userId, localId]
    );
  } catch (error) {
    logger.error('database', 'Erro ao buscar sessão aberta', { error: String(error) });
    return null;
  }
}

export async function getSessaoAtivaGlobal(userId: string): Promise<SessaoComputada | null> {
  try {
    const sessao = db.getFirstSync<RegistroDB>(
      `SELECT * FROM registros WHERE user_id = ? AND saida IS NULL ORDER BY entrada DESC LIMIT 1`,
      [userId]
    );

    if (!sessao) return null;

    return {
      ...sessao,
      status: 'ativa',
      duracao_minutos: calcularDuracao(sessao.entrada, null),
    };
  } catch (error) {
    logger.error('database', 'Erro ao buscar sessão ativa global', { error: String(error) });
    return null;
  }
}

export async function getSessoesHoje(userId: string): Promise<SessaoComputada[]> {
  try {
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const amanha = new Date(hoje);
    amanha.setDate(amanha.getDate() + 1);

    const sessoes = db.getAllSync<RegistroDB>(
      `SELECT * FROM registros WHERE user_id = ? AND entrada >= ? AND entrada < ? ORDER BY entrada DESC`,
      [userId, hoje.toISOString(), amanha.toISOString()]
    );

    return sessoes.map(s => ({
      ...s,
      status: s.saida ? 'finalizada' : 'ativa',
      duracao_minutos: calcularDuracao(s.entrada, s.saida),
    })) as SessaoComputada[];
  } catch (error) {
    logger.error('database', 'Erro ao buscar sessões de hoje', { error: String(error) });
    return [];
  }
}

export async function getSessoesPorPeriodo(
  userId: string,
  dataInicio: string,
  dataFim: string
): Promise<SessaoComputada[]> {
  try {
    const sessoes = db.getAllSync<RegistroDB>(
      `SELECT * FROM registros WHERE user_id = ? AND entrada >= ? AND entrada <= ? ORDER BY entrada ASC`,
      [userId, dataInicio, dataFim]
    );

    return sessoes.map(s => ({
      ...s,
      status: s.saida ? 'finalizada' : 'ativa',
      duracao_minutos: calcularDuracao(s.entrada, s.saida),
    })) as SessaoComputada[];
  } catch (error) {
    logger.error('database', 'Erro ao buscar sessões por período', { error: String(error) });
    return [];
  }
}

export async function getEstatisticasHoje(userId: string): Promise<EstatisticasDia> {
  try {
    const sessoes = await getSessoesHoje(userId);
    const finalizadas = sessoes.filter(s => s.saida);
    
    // Calcula total considerando pausas
    let totalMinutos = 0;
    for (const s of finalizadas) {
      const duracao = calcularDuracao(s.entrada, s.saida);
      const pausa = s.pausa_minutos || 0;
      totalMinutos += Math.max(0, duracao - pausa);
    }

    return {
      total_minutos: totalMinutos,
      total_sessoes: finalizadas.length,
    };
  } catch (error) {
    logger.error('database', 'Erro ao calcular estatísticas', { error: String(error) });
    return { total_minutos: 0, total_sessoes: 0 };
  }
}

// ============================================
// SYNC
// ============================================

export async function getRegistrosParaSync(userId: string): Promise<RegistroDB[]> {
  try {
    return db.getAllSync<RegistroDB>(
      `SELECT * FROM registros WHERE user_id = ? AND synced_at IS NULL`,
      [userId]
    );
  } catch (error) {
    logger.error('database', 'Erro ao buscar registros para sync', { error: String(error) });
    return [];
  }
}

export async function marcarRegistroSincronizado(id: string): Promise<void> {
  try {
    db.runSync(
      `UPDATE registros SET synced_at = ? WHERE id = ?`,
      [now(), id]
    );
  } catch (error) {
    logger.error('database', 'Erro ao marcar registro sincronizado', { error: String(error) });
  }
}

/**
 * Upsert de registro vindo do Supabase
 */
export async function upsertRegistroFromSync(registro: RegistroDB): Promise<void> {
  try {
    const existente = db.getFirstSync<RegistroDB>(
      `SELECT * FROM registros WHERE id = ?`,
      [registro.id]
    );

    if (existente) {
      // Atualiza se mudou
      db.runSync(
        `UPDATE registros SET saida = ?, editado_manualmente = ?, motivo_edicao = ?, pausa_minutos = ?, synced_at = ? WHERE id = ?`,
        [registro.saida, registro.editado_manualmente, registro.motivo_edicao, registro.pausa_minutos || 0, now(), registro.id]
      );
    } else {
      db.runSync(
        `INSERT INTO registros (id, user_id, local_id, local_nome, entrada, saida, tipo, 
         editado_manualmente, motivo_edicao, cor, device_id, pausa_minutos, created_at, synced_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [registro.id, registro.user_id, registro.local_id, registro.local_nome, registro.entrada,
         registro.saida, registro.tipo, registro.editado_manualmente, registro.motivo_edicao,
         registro.cor, registro.device_id, registro.pausa_minutos || 0, registro.created_at, now()]
      );
    }
  } catch (error) {
    logger.error('database', 'Erro no upsert de registro', { error: String(error) });
  }
}
