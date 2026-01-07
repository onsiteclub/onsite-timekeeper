/**
 * Database - Tracking
 * 
 * Geopontos, Telemetria agregada, Heartbeat (legado) e Debug
 */

import { logger } from '../logger';
import {
  db,
  generateUUID,
  now,
  getToday,
  type GeopontoFonte,
  type GeopontoDB,
  type HeartbeatLogDB,
  type TelemetryDailyDB,
} from './core';

// ============================================
// TELEMETRIA DIÁRIA AGREGADA
// ============================================

/**
 * Garante que existe uma row para hoje
 */
function ensureTodayTelemetry(userId: string): void {
  const today = getToday();
  
  try {
    db.runSync(
      `INSERT OR IGNORE INTO telemetry_daily (date, user_id, created_at) VALUES (?, ?, ?)`,
      [today, userId, now()]
    );
  } catch {
    logger.debug('telemetry', 'Row de hoje já existe ou erro ao criar');
  }
}

/**
 * Incrementa um campo de telemetria do dia
 */
export async function incrementarTelemetria(
  userId: string,
  campo: 'app_opens' | 'manual_entries_count' | 'geofence_entries_count' | 
         'geofence_triggers' | 'background_location_checks' | 
         'offline_entries_count' | 'sync_attempts' | 'sync_failures'
): Promise<void> {
  try {
    ensureTodayTelemetry(userId);
    const today = getToday();
    
    db.runSync(
      `UPDATE telemetry_daily SET ${campo} = ${campo} + 1, synced_at = NULL WHERE date = ? AND user_id = ?`,
      [today, userId]
    );
    
    logger.debug('telemetry', `Incrementado: ${campo}`);
  } catch (error) {
    logger.error('telemetry', `Erro ao incrementar ${campo}`, { error: String(error) });
  }
}

/**
 * Incrementa telemetria específica de geofence (com accuracy)
 */
export async function incrementarTelemetriaGeofence(
  userId: string,
  accuracy: number | null
): Promise<void> {
  try {
    ensureTodayTelemetry(userId);
    const today = getToday();
    
    if (accuracy !== null && accuracy > 0) {
      db.runSync(
        `UPDATE telemetry_daily SET 
          geofence_triggers = geofence_triggers + 1,
          geofence_accuracy_sum = geofence_accuracy_sum + ?,
          geofence_accuracy_count = geofence_accuracy_count + 1,
          synced_at = NULL
        WHERE date = ? AND user_id = ?`,
        [accuracy, today, userId]
      );
    } else {
      db.runSync(
        `UPDATE telemetry_daily SET geofence_triggers = geofence_triggers + 1, synced_at = NULL WHERE date = ? AND user_id = ?`,
        [today, userId]
      );
    }
  } catch (error) {
    logger.error('telemetry', 'Erro ao incrementar geofence telemetry', { error: String(error) });
  }
}

/**
 * Incrementa telemetria de heartbeat (agregado)
 */
export async function incrementarTelemetriaHeartbeat(
  userId: string,
  insideFence: boolean,
  batteryLevel: number | null
): Promise<void> {
  try {
    ensureTodayTelemetry(userId);
    const today = getToday();
    
    if (batteryLevel !== null) {
      db.runSync(
        `UPDATE telemetry_daily SET 
          heartbeat_count = heartbeat_count + 1,
          heartbeat_inside_fence_count = heartbeat_inside_fence_count + ?,
          battery_level_sum = battery_level_sum + ?,
          battery_level_count = battery_level_count + 1,
          synced_at = NULL
        WHERE date = ? AND user_id = ?`,
        [insideFence ? 1 : 0, batteryLevel, today, userId]
      );
    } else {
      db.runSync(
        `UPDATE telemetry_daily SET 
          heartbeat_count = heartbeat_count + 1,
          heartbeat_inside_fence_count = heartbeat_inside_fence_count + ?,
          synced_at = NULL
        WHERE date = ? AND user_id = ?`,
        [insideFence ? 1 : 0, today, userId]
      );
    }
  } catch (error) {
    logger.error('telemetry', 'Erro ao incrementar heartbeat telemetry', { error: String(error) });
  }
}

/**
 * Busca telemetria de hoje
 */
export async function getTelemetriaHoje(userId: string): Promise<TelemetryDailyDB | null> {
  try {
    return db.getFirstSync<TelemetryDailyDB>(
      `SELECT * FROM telemetry_daily WHERE date = ? AND user_id = ?`,
      [getToday(), userId]
    );
  } catch (error) {
    logger.error('telemetry', 'Erro ao buscar telemetria de hoje', { error: String(error) });
    return null;
  }
}

/**
 * Busca telemetria para sync (não sincronizada)
 */
export async function getTelemetriaParaSync(userId: string): Promise<TelemetryDailyDB[]> {
  try {
    return db.getAllSync<TelemetryDailyDB>(
      `SELECT * FROM telemetry_daily WHERE user_id = ? AND synced_at IS NULL ORDER BY date ASC`,
      [userId]
    );
  } catch (error) {
    logger.error('telemetry', 'Erro ao buscar telemetria para sync', { error: String(error) });
    return [];
  }
}

/**
 * Marca telemetria como sincronizada
 */
export async function marcarTelemetriaSincronizada(date: string, userId: string): Promise<void> {
  try {
    db.runSync(
      `UPDATE telemetry_daily SET synced_at = ? WHERE date = ? AND user_id = ?`,
      [now(), date, userId]
    );
  } catch (error) {
    logger.error('telemetry', 'Erro ao marcar telemetria sincronizada', { error: String(error) });
  }
}

/**
 * Limpa telemetria antiga (mais de X dias, só se já sincronizada)
 */
export async function limparTelemetriaAntiga(diasManter: number = 7): Promise<number> {
  try {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - diasManter);
    const cutoffStr = cutoff.toISOString().split('T')[0];
    
    const result = db.runSync(
      `DELETE FROM telemetry_daily WHERE date < ? AND synced_at IS NOT NULL`,
      [cutoffStr]
    );
    
    const deletados = result.changes || 0;
    if (deletados > 0) {
      logger.info('telemetry', `Telemetria antiga limpa: ${deletados} dias`);
    }
    return deletados;
  } catch (error) {
    logger.error('telemetry', 'Erro ao limpar telemetria antiga', { error: String(error) });
    return 0;
  }
}

/**
 * Stats de telemetria para debug
 */
export async function getTelemetriaStats(userId: string): Promise<{
  diasPendentes: number;
  diasSincronizados: number;
  hoje: TelemetryDailyDB | null;
}> {
  try {
    const pendentes = db.getFirstSync<{ count: number }>(
      `SELECT COUNT(*) as count FROM telemetry_daily WHERE user_id = ? AND synced_at IS NULL`,
      [userId]
    );
    
    const sincronizados = db.getFirstSync<{ count: number }>(
      `SELECT COUNT(*) as count FROM telemetry_daily WHERE user_id = ? AND synced_at IS NOT NULL`,
      [userId]
    );
    
    const hoje = await getTelemetriaHoje(userId);
    
    return {
      diasPendentes: pendentes?.count || 0,
      diasSincronizados: sincronizados?.count || 0,
      hoje,
    };
  } catch (error) {
    logger.error('telemetry', 'Erro ao obter stats de telemetria', { error: String(error) });
    return { diasPendentes: 0, diasSincronizados: 0, hoje: null };
  }
}

// ============================================
// GEOPONTOS (Auditoria GPS)
// ============================================

/**
 * Registra um geoponto (leitura GPS)
 */
export async function registrarGeoponto(
  userId: string,
  latitude: number,
  longitude: number,
  accuracy: number | null,
  fonte: GeopontoFonte,
  dentroFence: boolean,
  fenceId: string | null,
  fenceNome: string | null,
  sessaoId: string | null
): Promise<string> {
  const id = generateUUID();
  const timestamp = now();
  
  try {
    db.runSync(
      `INSERT INTO geopontos (id, sessao_id, user_id, latitude, longitude, accuracy, 
       timestamp, fonte, dentro_fence, fence_id, fence_nome, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, sessaoId, userId, latitude, longitude, accuracy, 
       timestamp, fonte, dentroFence ? 1 : 0, fenceId, fenceNome, timestamp]
    );
    
    // Incrementa telemetria de geofence se for trigger
    if (fonte === 'geofence') {
      await incrementarTelemetriaGeofence(userId, accuracy);
    } else if (fonte === 'background') {
      await incrementarTelemetria(userId, 'background_location_checks');
    }
    
    logger.debug('database', 'Geoponto registrado', { 
      id, 
      fonte, 
      dentroFence, 
      accuracy: accuracy?.toFixed(0) 
    });
    return id;
  } catch (error) {
    logger.error('database', 'Erro ao registrar geoponto', { error: String(error) });
    throw error;
  }
}

/**
 * Busca geopontos de uma sessão específica
 */
export async function getGeopontosSessao(sessaoId: string): Promise<GeopontoDB[]> {
  try {
    return db.getAllSync<GeopontoDB>(
      `SELECT * FROM geopontos WHERE sessao_id = ? ORDER BY timestamp ASC`,
      [sessaoId]
    );
  } catch (error) {
    logger.error('database', 'Erro ao buscar geopontos da sessão', { error: String(error) });
    return [];
  }
}

/**
 * Busca geopontos por período
 */
export async function getGeopontosPorPeriodo(
  userId: string,
  dataInicio: string,
  dataFim: string
): Promise<GeopontoDB[]> {
  try {
    return db.getAllSync<GeopontoDB>(
      `SELECT * FROM geopontos WHERE user_id = ? AND timestamp >= ? AND timestamp <= ? ORDER BY timestamp ASC`,
      [userId, dataInicio, dataFim]
    );
  } catch (error) {
    logger.error('database', 'Erro ao buscar geopontos por período', { error: String(error) });
    return [];
  }
}

/**
 * Busca último geoponto do usuário
 */
export async function getUltimoGeoponto(userId: string): Promise<GeopontoDB | null> {
  try {
    return db.getFirstSync<GeopontoDB>(
      `SELECT * FROM geopontos WHERE user_id = ? ORDER BY timestamp DESC LIMIT 1`,
      [userId]
    );
  } catch (error) {
    logger.error('database', 'Erro ao buscar último geoponto', { error: String(error) });
    return null;
  }
}

/**
 * Limpa geopontos antigos (mais de X dias)
 */
export async function limparGeopontosAntigos(diasManter: number = 90): Promise<number> {
  try {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - diasManter);
    
    const result = db.runSync(
      `DELETE FROM geopontos WHERE timestamp < ?`,
      [cutoff.toISOString()]
    );
    
    const deletados = result.changes || 0;
    if (deletados > 0) {
      logger.info('database', `Geopontos antigos limpos: ${deletados}`);
    }
    return deletados;
  } catch (error) {
    logger.error('database', 'Erro ao limpar geopontos', { error: String(error) });
    return 0;
  }
}

/**
 * Estatísticas de geopontos
 */
export async function getGeopontosStats(userId: string): Promise<{
  total: number;
  hoje: number;
  porFonte: Record<GeopontoFonte, number>;
  ultimoTimestamp: string | null;
}> {
  try {
    const hoje = new Date().toISOString().split('T')[0];
    
    const total = db.getFirstSync<{ count: number }>(
      `SELECT COUNT(*) as count FROM geopontos WHERE user_id = ?`,
      [userId]
    );
    
    const hojeCount = db.getFirstSync<{ count: number }>(
      `SELECT COUNT(*) as count FROM geopontos WHERE user_id = ? AND timestamp LIKE ?`,
      [userId, `${hoje}%`]
    );
    
    const ultimo = db.getFirstSync<{ timestamp: string }>(
      `SELECT timestamp FROM geopontos WHERE user_id = ? ORDER BY timestamp DESC LIMIT 1`,
      [userId]
    );

    // Conta por fonte
    const fontes: GeopontoFonte[] = ['polling', 'geofence', 'heartbeat', 'background', 'manual'];
    const porFonte: Record<GeopontoFonte, number> = {
      polling: 0,
      geofence: 0,
      heartbeat: 0,
      background: 0,
      manual: 0,
    };

    for (const fonte of fontes) {
      const count = db.getFirstSync<{ count: number }>(
        `SELECT COUNT(*) as count FROM geopontos WHERE user_id = ? AND fonte = ?`,
        [userId, fonte]
      );
      porFonte[fonte] = count?.count || 0;
    }
    
    return {
      total: total?.count || 0,
      hoje: hojeCount?.count || 0,
      porFonte,
      ultimoTimestamp: ultimo?.timestamp || null,
    };
  } catch (error) {
    logger.error('database', 'Erro ao obter stats de geopontos', { error: String(error) });
    return { 
      total: 0, 
      hoje: 0, 
      porFonte: { polling: 0, geofence: 0, heartbeat: 0, background: 0, manual: 0 },
      ultimoTimestamp: null 
    };
  }
}

/**
 * Busca geopontos para sync (não sincronizados)
 */
export async function getGeopontosParaSync(userId: string, limit: number = 100): Promise<GeopontoDB[]> {
  try {
    return db.getAllSync<GeopontoDB>(
      `SELECT * FROM geopontos WHERE user_id = ? AND synced_at IS NULL ORDER BY timestamp ASC LIMIT ?`,
      [userId, limit]
    );
  } catch (error) {
    logger.error('database', 'Erro ao buscar geopontos para sync', { error: String(error) });
    return [];
  }
}

/**
 * Marca geopontos como sincronizados
 */
export async function marcarGeopontosSincronizados(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  
  try {
    const placeholders = ids.map(() => '?').join(',');
    db.runSync(
      `UPDATE geopontos SET synced_at = ? WHERE id IN (${placeholders})`,
      [now(), ...ids]
    );
    logger.debug('database', `${ids.length} geopontos marcados como sincronizados`);
  } catch (error) {
    logger.error('database', 'Erro ao marcar geopontos sincronizados', { error: String(error) });
  }
}

// ============================================
// HEARTBEAT LOG (LEGADO - manter por enquanto)
// ============================================

/**
 * Registra um heartbeat
 * NOTA: Esta função será substituída por incrementarTelemetria
 */
export async function registrarHeartbeat(
  userId: string,
  latitude: number,
  longitude: number,
  accuracy: number | null,
  insideFence: boolean,
  fenceId: string | null,
  fenceName: string | null,
  sessaoId: string | null,
  batteryLevel: number | null
): Promise<string> {
  const id = generateUUID();
  const timestamp = now();
  
  try {
    db.runSync(
      `INSERT INTO heartbeat_log (id, user_id, timestamp, latitude, longitude, accuracy, 
       inside_fence, fence_id, fence_name, sessao_id, battery_level, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, userId, timestamp, latitude, longitude, accuracy, 
       insideFence ? 1 : 0, fenceId, fenceName, sessaoId, batteryLevel, timestamp]
    );
    
    // Também incrementa telemetria agregada
    await incrementarTelemetriaHeartbeat(userId, insideFence, batteryLevel);
    
    logger.debug('heartbeat', 'Heartbeat registrado', { id, insideFence, fenceId });
    return id;
  } catch (error) {
    logger.error('database', 'Erro ao registrar heartbeat', { error: String(error) });
    throw error;
  }
}

/**
 * Busca último heartbeat de uma sessão
 */
export async function getUltimoHeartbeatSessao(sessaoId: string): Promise<HeartbeatLogDB | null> {
  try {
    return db.getFirstSync<HeartbeatLogDB>(
      `SELECT * FROM heartbeat_log WHERE sessao_id = ? ORDER BY timestamp DESC LIMIT 1`,
      [sessaoId]
    );
  } catch (error) {
    logger.error('database', 'Erro ao buscar último heartbeat', { error: String(error) });
    return null;
  }
}

/**
 * Busca último heartbeat do usuário (qualquer sessão)
 */
export async function getUltimoHeartbeat(userId: string): Promise<HeartbeatLogDB | null> {
  try {
    return db.getFirstSync<HeartbeatLogDB>(
      `SELECT * FROM heartbeat_log WHERE user_id = ? ORDER BY timestamp DESC LIMIT 1`,
      [userId]
    );
  } catch (error) {
    logger.error('database', 'Erro ao buscar último heartbeat', { error: String(error) });
    return null;
  }
}

/**
 * Busca heartbeats por período
 */
export async function getHeartbeatsPorPeriodo(
  userId: string,
  dataInicio: string,
  dataFim: string
): Promise<HeartbeatLogDB[]> {
  try {
    return db.getAllSync<HeartbeatLogDB>(
      `SELECT * FROM heartbeat_log WHERE user_id = ? AND timestamp >= ? AND timestamp <= ? ORDER BY timestamp DESC`,
      [userId, dataInicio, dataFim]
    );
  } catch (error) {
    logger.error('database', 'Erro ao buscar heartbeats', { error: String(error) });
    return [];
  }
}

/**
 * Limpa heartbeats antigos (mais de X dias)
 */
export async function limparHeartbeatsAntigos(diasManter: number = 30): Promise<number> {
  try {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - diasManter);
    
    const result = db.runSync(
      `DELETE FROM heartbeat_log WHERE timestamp < ?`,
      [cutoff.toISOString()]
    );
    
    const deletados = result.changes || 0;
    if (deletados > 0) {
      logger.info('database', `Heartbeats antigos limpos: ${deletados}`);
    }
    return deletados;
  } catch (error) {
    logger.error('database', 'Erro ao limpar heartbeats', { error: String(error) });
    return 0;
  }
}

/**
 * Conta heartbeats (para stats)
 */
export async function getHeartbeatStats(userId: string): Promise<{
  total: number;
  hoje: number;
  ultimoTimestamp: string | null;
}> {
  try {
    const hoje = new Date().toISOString().split('T')[0];
    
    const total = db.getFirstSync<{ count: number }>(
      `SELECT COUNT(*) as count FROM heartbeat_log WHERE user_id = ?`,
      [userId]
    );
    
    const hojeCount = db.getFirstSync<{ count: number }>(
      `SELECT COUNT(*) as count FROM heartbeat_log WHERE user_id = ? AND timestamp LIKE ?`,
      [userId, `${hoje}%`]
    );
    
    const ultimo = db.getFirstSync<{ timestamp: string }>(
      `SELECT timestamp FROM heartbeat_log WHERE user_id = ? ORDER BY timestamp DESC LIMIT 1`,
      [userId]
    );
    
    return {
      total: total?.count || 0,
      hoje: hojeCount?.count || 0,
      ultimoTimestamp: ultimo?.timestamp || null,
    };
  } catch (error) {
    logger.error('database', 'Erro ao obter stats de heartbeat', { error: String(error) });
    return { total: 0, hoje: 0, ultimoTimestamp: null };
  }
}

// ============================================
// DEBUG - Funções para DevMonitor
// ============================================

/**
 * Retorna contagem de registros em cada tabela
 */
export async function getDbStats(): Promise<{
  locais_total: number;
  locais_ativos: number;
  locais_deletados: number;
  registros_total: number;
  registros_abertos: number;
  sync_logs: number;
  geopontos_total: number;
  telemetry_days: number;
}> {
  try {
    const locaisTotal = db.getFirstSync<{ count: number }>(`SELECT COUNT(*) as count FROM locais`);
    const locaisAtivos = db.getFirstSync<{ count: number }>(`SELECT COUNT(*) as count FROM locais WHERE status = 'active'`);
    const locaisDeletados = db.getFirstSync<{ count: number }>(`SELECT COUNT(*) as count FROM locais WHERE status = 'deleted'`);
    const registrosTotal = db.getFirstSync<{ count: number }>(`SELECT COUNT(*) as count FROM registros`);
    const registrosAbertos = db.getFirstSync<{ count: number }>(`SELECT COUNT(*) as count FROM registros WHERE saida IS NULL`);
    const syncLogs = db.getFirstSync<{ count: number }>(`SELECT COUNT(*) as count FROM sync_log`);
    const geopontosTotal = db.getFirstSync<{ count: number }>(`SELECT COUNT(*) as count FROM geopontos`);
    const telemetryDays = db.getFirstSync<{ count: number }>(`SELECT COUNT(*) as count FROM telemetry_daily`);

    return {
      locais_total: locaisTotal?.count || 0,
      locais_ativos: locaisAtivos?.count || 0,
      locais_deletados: locaisDeletados?.count || 0,
      registros_total: registrosTotal?.count || 0,
      registros_abertos: registrosAbertos?.count || 0,
      sync_logs: syncLogs?.count || 0,
      geopontos_total: geopontosTotal?.count || 0,
      telemetry_days: telemetryDays?.count || 0,
    };
  } catch (error) {
    logger.error('database', 'Erro ao obter stats', { error: String(error) });
    return {
      locais_total: 0,
      locais_ativos: 0,
      locais_deletados: 0,
      registros_total: 0,
      registros_abertos: 0,
      sync_logs: 0,
      geopontos_total: 0,
      telemetry_days: 0,
    };
  }
}

/**
 * Limpa todos os dados locais (NUCLEAR OPTION)
 */
export async function resetDatabase(): Promise<void> {
  try {
    logger.warn('database', '⚠️ RESET DATABASE - Limpando todos os dados locais');
    db.execSync(`DELETE FROM sync_log`);
    db.execSync(`DELETE FROM registros`);
    db.execSync(`DELETE FROM locais`);
    db.execSync(`DELETE FROM geopontos`);
    db.execSync(`DELETE FROM heartbeat_log`);
    db.execSync(`DELETE FROM telemetry_daily`);
    logger.info('database', '✅ Database resetado');
  } catch (error) {
    logger.error('database', 'Erro ao resetar database', { error: String(error) });
    throw error;
  }
}
