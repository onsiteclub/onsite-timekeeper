/**
 * Database - OnSite Timekeeper
 * 
 * Re-exporta todos os módulos para manter compatibilidade
 * com imports existentes: import { ... } from './database'
 */

// ============================================
// CORE - Instância, Init, Tipos, Helpers
// ============================================
export {
  // Instância
  db,
  
  // Inicialização
  initDatabase,
  
  // Tipos
  type LocalStatus,
  type RegistroTipo,
  type SyncLogAction,
  type SyncLogStatus,
  type GeopontoFonte,
  type LocalDB,
  type RegistroDB,
  type SyncLogDB,
  type SessaoComputada,
  type EstatisticasDia,
  type HeartbeatLogDB,
  type GeopontoDB,
  type TelemetryDailyDB,
  
  // Helpers
  generateUUID,
  now,
  getToday,
  calcularDistancia,
  calcularDuracao,
  formatarDuracao,
  
  // Sync Log
  registrarSyncLog,
  getSyncLogs,
  getSyncLogsByEntity,
} from './core';

// ============================================
// LOCAIS - CRUD de Geofences
// ============================================
export {
  type CriarLocalParams,
  criarLocal,
  getLocais,
  getLocalById,
  atualizarLocal,
  removerLocal,
  atualizarLastSeen,
  getLocaisParaSync,
  marcarLocalSincronizado,
  upsertLocalFromSync,
} from './locais';

// ============================================
// REGISTROS - CRUD de Sessões
// ============================================
export {
  type CriarRegistroParams,
  criarRegistroEntrada,
  registrarSaida,
  getSessaoAberta,
  getSessaoAtivaGlobal,
  getSessoesHoje,
  getSessoesPorPeriodo,
  getEstatisticasHoje,
  getRegistrosParaSync,
  marcarRegistroSincronizado,
  upsertRegistroFromSync,
} from './registros';

// ============================================
// TRACKING - Geopontos, Telemetria, Debug
// ============================================
export {
  // Telemetria
  incrementarTelemetria,
  incrementarTelemetriaGeofence,
  incrementarTelemetriaHeartbeat,
  getTelemetriaHoje,
  getTelemetriaParaSync,
  marcarTelemetriaSincronizada,
  limparTelemetriaAntiga,
  getTelemetriaStats,
  
  // Geopontos
  registrarGeoponto,
  getGeopontosSessao,
  getGeopontosPorPeriodo,
  getUltimoGeoponto,
  limparGeopontosAntigos,
  getGeopontosStats,
  getGeopontosParaSync,
  marcarGeopontosSincronizados,
  
  // Heartbeat (legado)
  registrarHeartbeat,
  getUltimoHeartbeatSessao,
  getUltimoHeartbeat,
  getHeartbeatsPorPeriodo,
  limparHeartbeatsAntigos,
  getHeartbeatStats,
  
  // Debug
  getDbStats,
  resetDatabase,
} from './tracking';
