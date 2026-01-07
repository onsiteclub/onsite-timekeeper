/**
 * Database Core - OnSite Timekeeper
 * 
 * Instância SQLite, inicialização, tipos e helpers
 */

import * as SQLite from 'expo-sqlite';
import { logger } from '../logger';

// ============================================
// INSTÂNCIA DO BANCO (Singleton)
// ============================================

export const db = SQLite.openDatabaseSync('onsite-timekeeper.db');

// ============================================
// TIPOS
// ============================================

export type LocalStatus = 'active' | 'deleted' | 'pending_delete' | 'syncing';
export type RegistroTipo = 'automatico' | 'manual';
export type SyncLogAction = 'create' | 'update' | 'delete' | 'sync_up' | 'sync_down';
export type SyncLogStatus = 'pending' | 'synced' | 'conflict' | 'failed';
export type GeopontoFonte = 'polling' | 'geofence' | 'heartbeat' | 'background' | 'manual';

export interface LocalDB {
  id: string;
  user_id: string;
  nome: string;
  latitude: number;
  longitude: number;
  raio: number;
  cor: string;
  status: LocalStatus;
  deleted_at: string | null;
  last_seen_at: string;
  created_at: string;
  updated_at: string;
  synced_at: string | null;
}

export interface RegistroDB {
  id: string;
  user_id: string;
  local_id: string;
  local_nome: string | null;
  entrada: string;
  saida: string | null;
  tipo: RegistroTipo;
  editado_manualmente: number; // SQLite não tem boolean
  motivo_edicao: string | null;
  hash_integridade: string | null;
  cor: string | null;
  device_id: string | null;
  pausa_minutos: number | null;
  created_at: string;
  synced_at: string | null;
}

export interface SyncLogDB {
  id: string;
  user_id: string;
  entity_type: 'local' | 'registro';
  entity_id: string;
  action: SyncLogAction;
  old_value: string | null;
  new_value: string | null;
  sync_status: SyncLogStatus;
  error_message: string | null;
  created_at: string;
}

// Sessão com campos calculados para UI
export interface SessaoComputada extends RegistroDB {
  status: 'ativa' | 'pausada' | 'finalizada';
  duracao_minutos: number;
}

export interface EstatisticasDia {
  total_minutos: number;
  total_sessoes: number;
}

export interface HeartbeatLogDB {
  id: string;
  user_id: string;
  timestamp: string;
  latitude: number;
  longitude: number;
  accuracy: number | null;
  inside_fence: number; // 0 ou 1 (SQLite não tem boolean)
  fence_id: string | null;
  fence_name: string | null;
  sessao_id: string | null;
  battery_level: number | null;
  created_at: string;
}

export interface GeopontoDB {
  id: string;
  sessao_id: string | null;
  user_id: string;
  latitude: number;
  longitude: number;
  accuracy: number | null;
  timestamp: string;
  fonte: GeopontoFonte;
  dentro_fence: number; // 0 ou 1
  fence_id: string | null;
  fence_nome: string | null;
  created_at: string;
  synced_at: string | null;
}

export interface TelemetryDailyDB {
  date: string; // YYYY-MM-DD (PRIMARY KEY junto com user_id)
  user_id: string;
  
  // Uso do app
  app_opens: number;
  
  // Entries
  manual_entries_count: number;
  geofence_entries_count: number;
  
  // Geofence performance
  geofence_triggers: number;
  geofence_accuracy_sum: number;
  geofence_accuracy_count: number;
  
  // Background & Battery
  background_location_checks: number;
  battery_level_sum: number;
  battery_level_count: number;
  
  // Sync health
  offline_entries_count: number;
  sync_attempts: number;
  sync_failures: number;
  
  // Heartbeat (agregado)
  heartbeat_count: number;
  heartbeat_inside_fence_count: number;
  
  // Metadata
  created_at: string;
  synced_at: string | null;
}

// ============================================
// INICIALIZAÇÃO
// ============================================

let dbInitialized = false;

export async function initDatabase(): Promise<void> {
  if (dbInitialized) {
    logger.debug('database', 'Database já inicializado');
    return;
  }

  try {
    logger.info('boot', '🗄️ Inicializando SQLite...');

    // Tabela de locais
    db.execSync(`
      CREATE TABLE IF NOT EXISTS locais (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        nome TEXT NOT NULL,
        latitude REAL NOT NULL,
        longitude REAL NOT NULL,
        raio INTEGER DEFAULT 100,
        cor TEXT DEFAULT '#3B82F6',
        status TEXT DEFAULT 'active',
        deleted_at TEXT,
        last_seen_at TEXT DEFAULT CURRENT_TIMESTAMP,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        synced_at TEXT
      )
    `);

    // Tabela de registros (sessões)
    db.execSync(`
      CREATE TABLE IF NOT EXISTS registros (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        local_id TEXT NOT NULL,
        local_nome TEXT,
        entrada TEXT NOT NULL,
        saida TEXT,
        tipo TEXT DEFAULT 'automatico',
        editado_manualmente INTEGER DEFAULT 0,
        motivo_edicao TEXT,
        hash_integridade TEXT,
        cor TEXT,
        device_id TEXT,
        pausa_minutos INTEGER DEFAULT 0,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        synced_at TEXT
      )
    `);

    // Migration: coluna pausa_minutos
    try {
      db.execSync(`ALTER TABLE registros ADD COLUMN pausa_minutos INTEGER DEFAULT 0`);
      logger.info('database', '✅ Migration: coluna pausa_minutos adicionada');
    } catch {
      logger.debug('database', 'Coluna pausa_minutos já existe (ok)');
    }

    // Tabela de auditoria de sync
    db.execSync(`
      CREATE TABLE IF NOT EXISTS sync_log (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        action TEXT NOT NULL,
        old_value TEXT,
        new_value TEXT,
        sync_status TEXT DEFAULT 'pending',
        error_message TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Tabela de heartbeat logs (LEGADO)
    db.execSync(`
      CREATE TABLE IF NOT EXISTS heartbeat_log (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        latitude REAL NOT NULL,
        longitude REAL NOT NULL,
        accuracy REAL,
        inside_fence INTEGER DEFAULT 0,
        fence_id TEXT,
        fence_name TEXT,
        sessao_id TEXT,
        battery_level INTEGER,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Índices para heartbeat
    db.execSync(`CREATE INDEX IF NOT EXISTS idx_heartbeat_user ON heartbeat_log(user_id)`);
    db.execSync(`CREATE INDEX IF NOT EXISTS idx_heartbeat_timestamp ON heartbeat_log(timestamp)`);
    db.execSync(`CREATE INDEX IF NOT EXISTS idx_heartbeat_sessao ON heartbeat_log(sessao_id)`);

    // Tabela geopontos
    db.execSync(`
      CREATE TABLE IF NOT EXISTS geopontos (
        id TEXT PRIMARY KEY,
        sessao_id TEXT,
        user_id TEXT NOT NULL,
        latitude REAL NOT NULL,
        longitude REAL NOT NULL,
        accuracy REAL,
        timestamp TEXT NOT NULL,
        fonte TEXT DEFAULT 'polling',
        dentro_fence INTEGER DEFAULT 0,
        fence_id TEXT,
        fence_nome TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        synced_at TEXT
      )
    `);

    // Índices para geopontos
    db.execSync(`CREATE INDEX IF NOT EXISTS idx_geopontos_user ON geopontos(user_id)`);
    db.execSync(`CREATE INDEX IF NOT EXISTS idx_geopontos_sessao ON geopontos(sessao_id)`);
    db.execSync(`CREATE INDEX IF NOT EXISTS idx_geopontos_timestamp ON geopontos(timestamp)`);

    // Tabela telemetry_daily
    db.execSync(`
      CREATE TABLE IF NOT EXISTS telemetry_daily (
        date TEXT NOT NULL,
        user_id TEXT NOT NULL,
        app_opens INTEGER DEFAULT 0,
        manual_entries_count INTEGER DEFAULT 0,
        geofence_entries_count INTEGER DEFAULT 0,
        geofence_triggers INTEGER DEFAULT 0,
        geofence_accuracy_sum REAL DEFAULT 0,
        geofence_accuracy_count INTEGER DEFAULT 0,
        background_location_checks INTEGER DEFAULT 0,
        battery_level_sum REAL DEFAULT 0,
        battery_level_count INTEGER DEFAULT 0,
        offline_entries_count INTEGER DEFAULT 0,
        sync_attempts INTEGER DEFAULT 0,
        sync_failures INTEGER DEFAULT 0,
        heartbeat_count INTEGER DEFAULT 0,
        heartbeat_inside_fence_count INTEGER DEFAULT 0,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        synced_at TEXT,
        PRIMARY KEY (date, user_id)
      )
    `);

    // Índices para telemetry_daily
    db.execSync(`CREATE INDEX IF NOT EXISTS idx_telemetry_user ON telemetry_daily(user_id)`);
    db.execSync(`CREATE INDEX IF NOT EXISTS idx_telemetry_synced ON telemetry_daily(synced_at)`);

    // Índices gerais
    db.execSync(`CREATE INDEX IF NOT EXISTS idx_locais_user ON locais(user_id)`);
    db.execSync(`CREATE INDEX IF NOT EXISTS idx_locais_status ON locais(status)`);
    db.execSync(`CREATE INDEX IF NOT EXISTS idx_registros_user ON registros(user_id)`);
    db.execSync(`CREATE INDEX IF NOT EXISTS idx_registros_local ON registros(local_id)`);
    db.execSync(`CREATE INDEX IF NOT EXISTS idx_registros_entrada ON registros(entrada)`);
    db.execSync(`CREATE INDEX IF NOT EXISTS idx_sync_log_entity ON sync_log(entity_type, entity_id)`);

    dbInitialized = true;
    logger.info('boot', '✅ SQLite inicializado com sucesso');
  } catch (error) {
    logger.error('database', '❌ Erro ao inicializar SQLite', { error: String(error) });
    throw error;
  }
}

// ============================================
// HELPERS
// ============================================

export function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function now(): string {
  return new Date().toISOString();
}

export function getToday(): string {
  return new Date().toISOString().split('T')[0];
}

function toRad(deg: number): number {
  return deg * (Math.PI / 180);
}

/**
 * Calcula distância entre dois pontos (Haversine)
 */
export function calcularDistancia(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371000; // Raio da Terra em metros
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Calcula duração em minutos entre duas datas
 */
export function calcularDuracao(inicio: string, fim: string | null): number {
  if (!inicio) return 0;
  const start = new Date(inicio).getTime();
  const end = fim ? new Date(fim).getTime() : Date.now();
  if (isNaN(start) || isNaN(end)) return 0;
  const diff = Math.round((end - start) / 60000);
  return diff > 0 ? diff : 0;
}

/**
 * Formata duração em minutos para string legível
 */
export function formatarDuracao(minutos: number | null | undefined): string {
  if (minutos === null || minutos === undefined || isNaN(minutos)) {
    return '0min';
  }
  const total = Math.floor(Math.max(0, minutos));
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m}min`;
  return `${h}h ${m}min`;
}

// ============================================
// SYNC LOG (Auditoria)
// ============================================

export async function registrarSyncLog(
  userId: string,
  entityType: 'local' | 'registro',
  entityId: string,
  action: SyncLogAction,
  oldValue: unknown | null,
  newValue: unknown | null,
  status: SyncLogStatus = 'pending',
  errorMessage: string | null = null
): Promise<void> {
  try {
    const id = generateUUID();
    db.runSync(
      `INSERT INTO sync_log (id, user_id, entity_type, entity_id, action, old_value, new_value, sync_status, error_message, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        userId,
        entityType,
        entityId,
        action,
        oldValue ? JSON.stringify(oldValue) : null,
        newValue ? JSON.stringify(newValue) : null,
        status,
        errorMessage,
        now()
      ]
    );
    logger.debug('database', `📝 Sync log: ${action} ${entityType}`, { entityId });
  } catch (error) {
    logger.error('database', 'Erro ao registrar sync log', { error: String(error) });
  }
}

export async function getSyncLogs(
  userId: string,
  limit: number = 100
): Promise<SyncLogDB[]> {
  try {
    return db.getAllSync<SyncLogDB>(
      `SELECT * FROM sync_log WHERE user_id = ? ORDER BY created_at DESC LIMIT ?`,
      [userId, limit]
    );
  } catch (error) {
    logger.error('database', 'Erro ao buscar sync logs', { error: String(error) });
    return [];
  }
}

export async function getSyncLogsByEntity(
  entityType: 'local' | 'registro',
  entityId: string
): Promise<SyncLogDB[]> {
  try {
    return db.getAllSync<SyncLogDB>(
      `SELECT * FROM sync_log WHERE entity_type = ? AND entity_id = ? ORDER BY created_at DESC`,
      [entityType, entityId]
    );
  } catch (error) {
    logger.error('database', 'Erro ao buscar sync logs por entidade', { error: String(error) });
    return [];
  }
}
