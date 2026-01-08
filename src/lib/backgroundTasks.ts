/**
 * Background Tasks - OnSite Timekeeper
 * 
 * Tasks que rodam em background:
 * - GEOFENCE_TASK: Detecta entrada/saída (tempo real, via SO)
 * - LOCATION_TASK: Updates de posição
 * - HEARTBEAT_TASK: Verifica a cada 15 min se ainda está na fence (safety net)
 * 
 * IMPORTANTE: 
 * - Importar no entry point ANTES de usar
 * - Tasks processam DIRETO no banco, sem depender de callbacks
 *   (callbacks são opcionais, para atualizar UI quando app está ativo)
 */

import * as TaskManager from 'expo-task-manager';
import * as Location from 'expo-location';
import * as BackgroundFetch from 'expo-background-fetch';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { logger } from './logger';
import { LOCATION_TASK_NAME, GEOFENCE_TASK_NAME } from './location';

// ============================================
// IMPORTS DO DATABASE (processamento direto)
// ============================================

import {
  getSessaoAtivaGlobal,
  criarRegistroEntrada,
  registrarSaida,
  getLocais,
  registrarGeoponto,
  registrarHeartbeat,
} from './database';

// ============================================
// CONSTANTES
// ============================================

export const HEARTBEAT_TASK_NAME = 'onsite-heartbeat-task';
export const HEARTBEAT_INTERVAL = 15 * 60; // 15 minutos em segundos
const HISTERESE_ENTRADA = 1.0; // Entrada usa raio normal
const HISTERESE_SAIDA = 1.3; // Saída usa raio × 1.3 (evita ping-pong)
const USER_ID_KEY = '@onsite:userId'; // Chave para persistir userId
const SKIPPED_TODAY_KEY = '@onsite:skippedToday'; // Chave para persistir locais ignorados

// ============================================
// TIPOS
// ============================================

export interface GeofenceEvent {
  type: 'enter' | 'exit';
  regionIdentifier: string;
  timestamp: number;
}

export interface HeartbeatResult {
  isInsideFence: boolean;
  fenceId: string | null;
  fenceName: string | null;
  location: {
    latitude: number;
    longitude: number;
    accuracy: number | null;
  } | null;
  timestamp: number;
  batteryLevel: number | null;
}

export interface ActiveFence {
  id: string;
  nome: string;
  latitude: number;
  longitude: number;
  radius: number;
}

// ============================================
// CALLBACKS (OPCIONAIS - para atualizar UI)
// ============================================

type GeofenceCallback = (event: GeofenceEvent) => void;
type LocationCallback = (location: Location.LocationObject) => void;
type HeartbeatCallback = (result: HeartbeatResult) => Promise<void>;

let onGeofenceEvent: GeofenceCallback | null = null;
let onLocationUpdate: LocationCallback | null = null;
let onHeartbeat: HeartbeatCallback | null = null;

// Cache de fences (atualizado quando app está ativo)
let activeFencesCache: ActiveFence[] = [];

/**
 * Registra callback para eventos de geofence (opcional, para UI)
 */
export function setGeofenceCallback(callback: GeofenceCallback): void {
  onGeofenceEvent = callback;
  logger.debug('geofence', 'Callback de geofence registrado');
}

/**
 * Registra callback para atualizações de localização (opcional, para UI)
 */
export function setLocationCallback(callback: LocationCallback): void {
  onLocationUpdate = callback;
  logger.debug('gps', 'Callback de location registrado');
}

/**
 * Registra callback para heartbeat (opcional, para UI)
 */
export function setHeartbeatCallback(callback: HeartbeatCallback): void {
  onHeartbeat = callback;
  logger.debug('heartbeat', 'Callback de heartbeat registrado');
}

/**
 * Atualiza cache de fences ativas
 */
export function updateActiveFences(fences: ActiveFence[]): void {
  activeFencesCache = fences;
  logger.debug('heartbeat', `Fences em cache: ${fences.length}`);
}

/**
 * Retorna fences do cache
 */
export function getActiveFences(): ActiveFence[] {
  return activeFencesCache;
}

/**
 * Remove callbacks (cleanup)
 */
export function clearCallbacks(): void {
  onGeofenceEvent = null;
  onLocationUpdate = null;
  onHeartbeat = null;
  logger.debug('gps', 'Callbacks removidos');
}

// ============================================
// PERSISTÊNCIA DO USER ID
// ============================================

/**
 * Salva userId para uso em background
 * Chamar quando usuário faz login
 */
export async function setBackgroundUserId(userId: string): Promise<void> {
  try {
    await AsyncStorage.setItem(USER_ID_KEY, userId);
    logger.debug('boot', `UserId salvo para background: ${userId.substring(0, 8)}...`);
  } catch (error) {
    logger.error('boot', 'Erro ao salvar userId', { error: String(error) });
  }
}

/**
 * Remove userId (chamar no logout)
 */
export async function clearBackgroundUserId(): Promise<void> {
  try {
    await AsyncStorage.removeItem(USER_ID_KEY);
    logger.debug('boot', 'UserId removido');
  } catch (error) {
    logger.error('boot', 'Erro ao remover userId', { error: String(error) });
  }
}

/**
 * Recupera userId para processamento em background
 */
async function getBackgroundUserId(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(USER_ID_KEY);
  } catch (error) {
    logger.error('heartbeat', 'Erro ao recuperar userId', { error: String(error) });
    return null;
  }
}

// ============================================
// PERSISTÊNCIA DO SKIPPED TODAY
// ============================================

/**
 * Estrutura do skippedToday persistido
 */
interface SkippedTodayData {
  date: string; // YYYY-MM-DD
  localIds: string[];
}

/**
 * Recupera lista de locais ignorados hoje
 */
async function getSkippedToday(): Promise<string[]> {
  try {
    const data = await AsyncStorage.getItem(SKIPPED_TODAY_KEY);
    if (!data) return [];
    
    const parsed: SkippedTodayData = JSON.parse(data);
    const today = new Date().toISOString().split('T')[0];
    
    // Se for de outro dia, retorna vazio (reset automático)
    if (parsed.date !== today) {
      return [];
    }
    
    return parsed.localIds;
  } catch (error) {
    logger.error('geofence', 'Erro ao recuperar skippedToday', { error: String(error) });
    return [];
  }
}

/**
 * Adiciona local à lista de ignorados hoje
 */
export async function addToSkippedToday(localId: string): Promise<void> {
  try {
    const current = await getSkippedToday();
    if (current.includes(localId)) return;
    
    const today = new Date().toISOString().split('T')[0];
    const data: SkippedTodayData = {
      date: today,
      localIds: [...current, localId],
    };
    
    await AsyncStorage.setItem(SKIPPED_TODAY_KEY, JSON.stringify(data));
    logger.debug('geofence', `Local ${localId} adicionado ao skippedToday`);
  } catch (error) {
    logger.error('geofence', 'Erro ao adicionar ao skippedToday', { error: String(error) });
  }
}

/**
 * Remove local da lista de ignorados (quando sai da fence)
 */
export async function removeFromSkippedToday(localId: string): Promise<void> {
  try {
    const current = await getSkippedToday();
    if (!current.includes(localId)) return;
    
    const today = new Date().toISOString().split('T')[0];
    const data: SkippedTodayData = {
      date: today,
      localIds: current.filter(id => id !== localId),
    };
    
    await AsyncStorage.setItem(SKIPPED_TODAY_KEY, JSON.stringify(data));
    logger.debug('geofence', `Local ${localId} removido do skippedToday`);
  } catch (error) {
    logger.error('geofence', 'Erro ao remover do skippedToday', { error: String(error) });
  }
}

/**
 * Limpa toda a lista de ignorados
 */
export async function clearSkippedToday(): Promise<void> {
  try {
    await AsyncStorage.removeItem(SKIPPED_TODAY_KEY);
    logger.debug('geofence', 'skippedToday limpo');
  } catch (error) {
    logger.error('geofence', 'Erro ao limpar skippedToday', { error: String(error) });
  }
}

/**
 * Verifica se local está na lista de ignorados hoje
 */
async function isLocalSkippedToday(localId: string): Promise<boolean> {
  const skipped = await getSkippedToday();
  return skipped.includes(localId);
}

// ============================================
// HELPER: Calcular distância (Haversine)
// ============================================

function calcularDistancia(
  lat1: number, 
  lon1: number, 
  lat2: number, 
  lon2: number
): number {
  const R = 6371e3; // Raio da Terra em metros
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c; // Distância em metros
}

/**
 * Busca fences do banco (para quando cache está vazio)
 */
async function getFencesFromDb(userId: string): Promise<ActiveFence[]> {
  try {
    const locais = await getLocais(userId);
    return locais.map(l => ({
      id: l.id,
      nome: l.nome,
      latitude: l.latitude,
      longitude: l.longitude,
      radius: l.raio,
    }));
  } catch (error) {
    logger.error('geofence', 'Erro ao buscar fences do banco', { error: String(error) });
    return [];
  }
}

/**
 * Verifica em qual fence o ponto está dentro
 */
async function verificarDentroFence(
  latitude: number, 
  longitude: number,
  userId: string,
  usarHisterese: boolean = false
): Promise<{ isInside: boolean; fence: ActiveFence | null }> {
  // Usa cache se disponível, senão busca do banco
  let fences = activeFencesCache;
  if (fences.length === 0) {
    fences = await getFencesFromDb(userId);
  }

  for (const fence of fences) {
    const distancia = calcularDistancia(
      latitude, 
      longitude, 
      fence.latitude, 
      fence.longitude
    );
    
    const fatorHisterese = usarHisterese ? HISTERESE_SAIDA : HISTERESE_ENTRADA;
    const raioEfetivo = fence.radius * fatorHisterese;
    
    if (distancia <= raioEfetivo) {
      return { isInside: true, fence };
    }
  }
  return { isInside: false, fence: null };
}

/**
 * Encontra fence por ID
 */
async function getFenceById(fenceId: string, userId: string): Promise<ActiveFence | null> {
  let fences = activeFencesCache;
  if (fences.length === 0) {
    fences = await getFencesFromDb(userId);
  }
  return fences.find(f => f.id === fenceId) || null;
}

// ============================================
// TASK: GEOFENCING (Nativo) - PROCESSA DIRETO
// ============================================

TaskManager.defineTask(GEOFENCE_TASK_NAME, async ({ data, error }) => {
  const startTime = Date.now();
  logger.info('geofence', '🎯 Task de geofence executando...');

  if (error) {
    logger.error('geofence', 'Erro na task de geofence', { error: error.message });
    return;
  }

  if (!data) {
    logger.warn('geofence', 'Task executou sem dados');
    return;
  }

  const { eventType, region } = data as {
    eventType: Location.GeofencingEventType;
    region: Location.LocationRegion;
  };

  const isEnter = eventType === Location.GeofencingEventType.Enter;
  const fenceId = region.identifier || 'unknown';

  logger.info('geofence', `📍 Evento: ${isEnter ? 'ENTRADA' : 'SAÍDA'} - ${fenceId}`);

  // ============================================
  // PROCESSAMENTO DIRETO (sem depender de callback)
  // ============================================

  try {
    const userId = await getBackgroundUserId();
    
    if (!userId) {
      logger.warn('geofence', '⚠️ UserId não encontrado - usuário não logado?');
      return;
    }

    const fence = await getFenceById(fenceId, userId);
    
    if (!fence) {
      logger.warn('geofence', `⚠️ Fence não encontrada: ${fenceId}`);
      return;
    }

    if (isEnter) {
      // ========== ENTRADA ==========
      // Verifica se local foi ignorado hoje
      if (await isLocalSkippedToday(fenceId)) {
        logger.info('geofence', `😴 Local "${fence.nome}" ignorado hoje, pulando entrada`);
        return;
      }
      
      // Verifica se já tem sessão ativa para esta fence
      const sessaoAtiva = await getSessaoAtivaGlobal(userId);
      
      if (sessaoAtiva && sessaoAtiva.local_id === fenceId) {
        logger.info('geofence', '📍 Já existe sessão ativa para esta fence, ignorando');
      } else if (sessaoAtiva) {
        logger.warn('geofence', `⚠️ Já existe sessão ativa em outro local: ${sessaoAtiva.local_nome}`);
        // Poderia fechar a anterior e abrir nova, mas por segurança só loga
      } else {
        // Registra entrada
        logger.info('geofence', `✅ Registrando ENTRADA em "${fence.nome}"`);
        await criarRegistroEntrada({
          userId,
          localId: fence.id,
          localNome: fence.nome,
          tipo: 'automatico',
        });
      }
    } else {
      // ========== SAÍDA ==========
      // Remove do skippedToday ao sair (permite nova entrada na próxima vez)
      await removeFromSkippedToday(fenceId);
      
      const sessaoAtiva = await getSessaoAtivaGlobal(userId);
      
      if (sessaoAtiva && sessaoAtiva.local_id === fenceId) {
        logger.info('geofence', `✅ Registrando SAÍDA de "${fence.nome}"`);
        await registrarSaida(userId, fenceId);
      } else if (sessaoAtiva) {
        logger.warn('geofence', `⚠️ Saída de fence diferente da sessão ativa`);
      } else {
        logger.info('geofence', '📍 Saída detectada mas sem sessão ativa, ignorando');
      }
    }

    const duration = Date.now() - startTime;
    logger.info('geofence', `✅ Processamento concluído em ${duration}ms`);

  } catch (procError) {
    logger.error('geofence', 'Erro ao processar evento', { error: String(procError) });
  }

  // ============================================
  // CALLBACK OPCIONAL (para atualizar UI)
  // ============================================

  const event: GeofenceEvent = {
    type: isEnter ? 'enter' : 'exit',
    regionIdentifier: fenceId,
    timestamp: Date.now(),
  };

  if (onGeofenceEvent) {
    try {
      onGeofenceEvent(event);
    } catch (e) {
      logger.error('geofence', 'Erro no callback de geofence', { error: String(e) });
    }
  }
});

// ============================================
// TASK: BACKGROUND LOCATION
// ============================================

TaskManager.defineTask(LOCATION_TASK_NAME, async ({ data, error }) => {
  if (error) {
    logger.error('gps', 'Erro na task de location', { error: error.message });
    return;
  }

  if (data) {
    const { locations } = data as { locations: Location.LocationObject[] };

    if (locations && locations.length > 0) {
      const location = locations[0];

      logger.debug('gps', 'Background location update', {
        lat: location.coords.latitude.toFixed(6),
        lng: location.coords.longitude.toFixed(6),
        accuracy: location.coords.accuracy?.toFixed(0) ?? 'N/A',
      });

      // Registra geoponto no banco
      try {
        const userId = await getBackgroundUserId();
        if (userId) {
          const sessao = await getSessaoAtivaGlobal(userId);
          const { isInside, fence } = await verificarDentroFence(
            location.coords.latitude,
            location.coords.longitude,
            userId,
            true
          );

          await registrarGeoponto(
            userId,
            location.coords.latitude,
            location.coords.longitude,
            location.coords.accuracy ?? null,
            'background',
            isInside,
            fence?.id ?? null,
            fence?.nome ?? null,
            sessao?.id ?? null
          );
        }
      } catch (geoError) {
        logger.error('gps', 'Erro ao registrar geoponto', { error: String(geoError) });
      }

      // Callback opcional para UI
      if (onLocationUpdate) {
        try {
          onLocationUpdate(location);
        } catch (e) {
          logger.error('gps', 'Erro no callback de location', { error: String(e) });
        }
      }
    }
  }
});

// ============================================
// TASK: HEARTBEAT (Safety Net) - PROCESSA DIRETO
// ============================================

TaskManager.defineTask(HEARTBEAT_TASK_NAME, async () => {
  const startTime = Date.now();
  logger.info('heartbeat', '💓 Heartbeat executando...');

  try {
    // 1. Recupera userId
    const userId = await getBackgroundUserId();
    
    if (!userId) {
      logger.warn('heartbeat', '⚠️ UserId não encontrado - pulando heartbeat');
      return BackgroundFetch.BackgroundFetchResult.NoData;
    }

    // 2. Pega localização atual
    const location = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
      timeInterval: 5000,
      distanceInterval: 0,
    });

    const { latitude, longitude, accuracy } = location.coords;

    logger.info('heartbeat', `📍 Posição: ${latitude.toFixed(6)}, ${longitude.toFixed(6)} (±${accuracy?.toFixed(0)}m)`);

    // 3. Verifica se está dentro de alguma fence
    const { isInside, fence } = await verificarDentroFence(latitude, longitude, userId, true);

    // 4. Busca sessão ativa
    const sessaoAtiva = await getSessaoAtivaGlobal(userId);

    // 5. Registra heartbeat no banco
    await registrarHeartbeat(
      userId,
      latitude,
      longitude,
      accuracy ?? null,
      isInside,
      fence?.id ?? null,
      fence?.nome ?? null,
      sessaoAtiva?.id ?? null,
      null // batteryLevel
    );

    // ============================================
    // PROCESSAMENTO DE INCONSISTÊNCIAS
    // ============================================

    // Caso 1: Está DENTRO de fence mas SEM sessão ativa
    // → Entrada foi perdida! Registra agora (se não estiver ignorado)
    if (isInside && fence && !sessaoAtiva) {
      // Verifica se local foi ignorado hoje
      if (await isLocalSkippedToday(fence.id)) {
        logger.info('heartbeat', `😴 Local "${fence.nome}" ignorado hoje, não registrando entrada`);
      } else {
        logger.warn('heartbeat', `⚠️ ENTRADA PERDIDA detectada! Registrando entrada em "${fence.nome}"`);
        
        await criarRegistroEntrada({
          userId,
          localId: fence.id,
          localNome: fence.nome,
          tipo: 'automatico',
        });
        
        // Registra geoponto marcando a detecção
        await registrarGeoponto(
          userId,
          latitude,
          longitude,
          accuracy ?? null,
          'heartbeat',
          true,
          fence.id,
          fence.nome,
          null // sessaoId será da nova sessão
        );
      }
    }

    // Caso 2: Está FORA de todas as fences mas COM sessão ativa
    // → Saída foi perdida! Registra agora.
    if (!isInside && sessaoAtiva) {
      logger.warn('heartbeat', `⚠️ SAÍDA PERDIDA detectada! Registrando saída de "${sessaoAtiva.local_nome}"`);
      
      await registrarSaida(userId, sessaoAtiva.local_id);
      
      // Registra geoponto marcando a detecção
      await registrarGeoponto(
        userId,
        latitude,
        longitude,
        accuracy ?? null,
        'heartbeat',
        false,
        null,
        null,
        sessaoAtiva.id
      );
    }

    // Caso 3: Tudo consistente
    if ((isInside && sessaoAtiva) || (!isInside && !sessaoAtiva)) {
      logger.info('heartbeat', `✅ Estado consistente: ${isInside ? `dentro de "${fence?.nome}"` : 'fora de todas as fences'}`);
    }

    const duration = Date.now() - startTime;
    logger.info('heartbeat', `✅ Heartbeat concluído em ${duration}ms`);

    // ============================================
    // CALLBACK OPCIONAL (para atualizar UI)
    // ============================================

    const result: HeartbeatResult = {
      isInsideFence: isInside,
      fenceId: fence?.id ?? null,
      fenceName: fence?.nome ?? null,
      location: { latitude, longitude, accuracy: accuracy ?? null },
      timestamp: Date.now(),
      batteryLevel: null,
    };

    if (onHeartbeat) {
      try {
        await onHeartbeat(result);
      } catch (e) {
        logger.error('heartbeat', 'Erro no callback de heartbeat', { error: String(e) });
      }
    }

    return BackgroundFetch.BackgroundFetchResult.NewData;

  } catch (error) {
    logger.error('heartbeat', 'Erro no heartbeat', { error: String(error) });
    return BackgroundFetch.BackgroundFetchResult.Failed;
  }
});

// ============================================
// FUNÇÕES DE CONTROLE DO HEARTBEAT
// ============================================

/**
 * Inicia o heartbeat periódico
 */
export async function startHeartbeat(): Promise<boolean> {
  try {
    // Verifica se BackgroundFetch está disponível
    const status = await BackgroundFetch.getStatusAsync();
    
    if (status === BackgroundFetch.BackgroundFetchStatus.Restricted) {
      logger.warn('heartbeat', 'BackgroundFetch restrito pelo sistema');
      return false;
    }
    
    if (status === BackgroundFetch.BackgroundFetchStatus.Denied) {
      logger.warn('heartbeat', 'BackgroundFetch negado pelo usuário');
      return false;
    }

    // Verifica se já está registrado
    const isRegistered = await TaskManager.isTaskRegisteredAsync(HEARTBEAT_TASK_NAME);
    if (isRegistered) {
      logger.info('heartbeat', 'Heartbeat já está ativo');
      return true;
    }

    // Registra a task
    await BackgroundFetch.registerTaskAsync(HEARTBEAT_TASK_NAME, {
      minimumInterval: HEARTBEAT_INTERVAL,
      stopOnTerminate: false,
      startOnBoot: true,
    });

    logger.info('heartbeat', `✅ Heartbeat iniciado (intervalo: ${HEARTBEAT_INTERVAL / 60} min)`);
    return true;
  } catch (error) {
    logger.error('heartbeat', 'Erro ao iniciar heartbeat', { error: String(error) });
    return false;
  }
}

/**
 * Para o heartbeat
 */
export async function stopHeartbeat(): Promise<void> {
  try {
    const isRegistered = await TaskManager.isTaskRegisteredAsync(HEARTBEAT_TASK_NAME);
    if (isRegistered) {
      await BackgroundFetch.unregisterTaskAsync(HEARTBEAT_TASK_NAME);
      logger.info('heartbeat', '⏹️ Heartbeat parado');
    }
  } catch (error) {
    logger.error('heartbeat', 'Erro ao parar heartbeat', { error: String(error) });
  }
}

/**
 * Executa heartbeat manualmente (para testes)
 */
export async function executeHeartbeatNow(): Promise<HeartbeatResult | null> {
  try {
    logger.info('heartbeat', '🔄 Executando heartbeat manual...');
    
    const userId = await getBackgroundUserId();
    if (!userId) {
      logger.warn('heartbeat', 'UserId não encontrado para heartbeat manual');
      return null;
    }

    const location = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });

    const { latitude, longitude, accuracy } = location.coords;
    const { isInside, fence } = await verificarDentroFence(latitude, longitude, userId, true);

    const result: HeartbeatResult = {
      isInsideFence: isInside,
      fenceId: fence?.id ?? null,
      fenceName: fence?.nome ?? null,
      location: { latitude, longitude, accuracy: accuracy ?? null },
      timestamp: Date.now(),
      batteryLevel: null,
    };

    // Processa inconsistências também no manual
    const sessaoAtiva = await getSessaoAtivaGlobal(userId);

    if (isInside && fence && !sessaoAtiva) {
      // Verifica se local foi ignorado hoje
      if (await isLocalSkippedToday(fence.id)) {
        logger.info('heartbeat', `😴 Local "${fence.nome}" ignorado hoje`);
      } else {
        logger.warn('heartbeat', `⚠️ Entrada perdida detectada: ${fence.nome}`);
        await criarRegistroEntrada({
          userId,
          localId: fence.id,
          localNome: fence.nome,
          tipo: 'automatico',
        });
      }
    }

    if (!isInside && sessaoAtiva) {
      logger.warn('heartbeat', `⚠️ Saída perdida detectada: ${sessaoAtiva.local_nome}`);
      await registrarSaida(userId, sessaoAtiva.local_id);
    }

    if (onHeartbeat) {
      await onHeartbeat(result);
    }

    return result;
  } catch (error) {
    logger.error('heartbeat', 'Erro no heartbeat manual', { error: String(error) });
    return null;
  }
}

// ============================================
// VERIFICAÇÕES DE STATUS
// ============================================

export async function isGeofencingTaskRunning(): Promise<boolean> {
  try {
    return await TaskManager.isTaskRegisteredAsync(GEOFENCE_TASK_NAME);
  } catch {
    return false;
  }
}

export async function isLocationTaskRunning(): Promise<boolean> {
  try {
    return await TaskManager.isTaskRegisteredAsync(LOCATION_TASK_NAME);
  } catch {
    return false;
  }
}

export async function isHeartbeatRunning(): Promise<boolean> {
  try {
    return await TaskManager.isTaskRegisteredAsync(HEARTBEAT_TASK_NAME);
  } catch {
    return false;
  }
}

export async function getRegisteredTasks(): Promise<TaskManager.TaskManagerTask[]> {
  try {
    return await TaskManager.getRegisteredTasksAsync();
  } catch {
    return [];
  }
}

/**
 * Status completo das tasks
 */
export async function getTasksStatus(): Promise<{
  geofencing: boolean;
  location: boolean;
  heartbeat: boolean;
  activeFences: number;
  backgroundFetchStatus: string;
  hasUserId: boolean;
}> {
  const [geofencing, location, heartbeat, bgStatus, userId] = await Promise.all([
    isGeofencingTaskRunning(),
    isLocationTaskRunning(),
    isHeartbeatRunning(),
    BackgroundFetch.getStatusAsync(),
    getBackgroundUserId(),
  ]);

  const statusNames = {
    [BackgroundFetch.BackgroundFetchStatus.Restricted]: 'Restricted',
    [BackgroundFetch.BackgroundFetchStatus.Denied]: 'Denied',
    [BackgroundFetch.BackgroundFetchStatus.Available]: 'Available',
  };

  return {
    geofencing,
    location,
    heartbeat,
    activeFences: activeFencesCache.length,
    backgroundFetchStatus: bgStatus !== null ? statusNames[bgStatus] : 'Unknown',
    hasUserId: !!userId,
  };
}

// ============================================
// LOG DE INICIALIZAÇÃO
// ============================================

logger.info('boot', '📋 Background tasks definidas', {
  geofence: GEOFENCE_TASK_NAME,
  location: LOCATION_TASK_NAME,
  heartbeat: HEARTBEAT_TASK_NAME,
  heartbeatInterval: `${HEARTBEAT_INTERVAL / 60} min`,
  histereseSaida: `${HISTERESE_SAIDA}x`,
});
