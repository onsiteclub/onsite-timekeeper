/**
 * Background Tasks - OnSite Timekeeper
 * 
 * Define as tasks que rodam em background:
 * - GEOFENCE_TASK: Detecta entrada/saída de geofences
 * - LOCATION_TASK: Atualiza posição periodicamente
 * 
 * IMPORTANTE: Este arquivo deve ser importado no entry point do app
 * para que as tasks sejam registradas antes de serem usadas.
 */

import * as TaskManager from 'expo-task-manager';
import * as Location from 'expo-location';
import { logger } from './logger';
import { LOCATION_TASK_NAME, GEOFENCE_TASK_NAME } from './location';

// ============================================
// TIPOS
// ============================================

export interface GeofenceEvent {
  type: 'enter' | 'exit';
  regionIdentifier: string;
  timestamp: number;
}

// ============================================
// CALLBACKS (registrados pelos stores)
// ============================================

type GeofenceCallback = (event: GeofenceEvent) => void;
type LocationCallback = (location: Location.LocationObject) => void;

let onGeofenceEvent: GeofenceCallback | null = null;
let onLocationUpdate: LocationCallback | null = null;

/**
 * Registra callback para eventos de geofence
 * Chamado pelo locationStore durante inicialização
 */
export function setGeofenceCallback(callback: GeofenceCallback): void {
  onGeofenceEvent = callback;
  logger.debug('geofence', 'Callback de geofence registrado');
}

/**
 * Registra callback para atualizações de localização
 */
export function setLocationCallback(callback: LocationCallback): void {
  onLocationUpdate = callback;
  logger.debug('gps', 'Callback de location registrado');
}

/**
 * Remove callbacks (cleanup)
 */
export function clearCallbacks(): void {
  onGeofenceEvent = null;
  onLocationUpdate = null;
  logger.debug('gps', 'Callbacks removidos');
}

// ============================================
// TASK: GEOFENCING
// ============================================

TaskManager.defineTask(GEOFENCE_TASK_NAME, ({ data, error }) => {
  if (error) {
    logger.error('geofence', 'Erro na task de geofence', { error: error.message });
    return;
  }

  if (data) {
    const { eventType, region } = data as {
      eventType: Location.GeofencingEventType;
      region: Location.LocationRegion;
    };

    const event: GeofenceEvent = {
      type: eventType === Location.GeofencingEventType.Enter ? 'enter' : 'exit',
      regionIdentifier: region.identifier || 'unknown',
      timestamp: Date.now(),
    };

    logger.info('geofence', `📍 Evento: ${event.type.toUpperCase()} - ${event.regionIdentifier}`, {
      type: event.type,
      region: event.regionIdentifier,
    });

    // Dispara callback se registrado
    if (onGeofenceEvent) {
      try {
        onGeofenceEvent(event);
      } catch (e) {
        logger.error('geofence', 'Erro no callback de geofence', { error: String(e) });
      }
    } else {
      logger.warn('geofence', 'Evento recebido mas nenhum callback registrado');
    }
  }
});

// ============================================
// TASK: BACKGROUND LOCATION
// ============================================

TaskManager.defineTask(LOCATION_TASK_NAME, ({ data, error }) => {
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

      // Dispara callback se registrado
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
// VERIFICAÇÕES DE STATUS
// ============================================

/**
 * Verifica se a task de geofencing está rodando
 */
export async function isGeofencingTaskRunning(): Promise<boolean> {
  try {
    return await TaskManager.isTaskRegisteredAsync(GEOFENCE_TASK_NAME);
  } catch {
    return false;
  }
}

/**
 * Verifica se a task de location está rodando
 */
export async function isLocationTaskRunning(): Promise<boolean> {
  try {
    return await TaskManager.isTaskRegisteredAsync(LOCATION_TASK_NAME);
  } catch {
    return false;
  }
}

/**
 * Retorna todas as tasks registradas
 */
export async function getRegisteredTasks(): Promise<TaskManager.TaskManagerTask[]> {
  try {
    return await TaskManager.getRegisteredTasksAsync();
  } catch {
    return [];
  }
}

// Log de inicialização
logger.info('boot', '📋 Background tasks definidas', {
  geofence: GEOFENCE_TASK_NAME,
  location: LOCATION_TASK_NAME,
});
