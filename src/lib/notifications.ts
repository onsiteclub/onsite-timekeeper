/**
 * Sistema de Notificações - OnSite Timekeeper
 * 
 * - Notificações de entrada/saída de geofence
 * - Ações inline (iniciar, pausar, encerrar)
 * - Notificações agendadas (delay 10 min)
 */

import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { logger } from './logger';

// ============================================
// CONFIGURAÇÃO INICIAL
// ============================================

// Como as notificações aparecem quando o app está aberto
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

// ============================================
// TIPOS
// ============================================

export type NotificationAction =
  | 'start'           // Iniciar cronômetro
  | 'skip_today'      // Ignorar hoje
  | 'delay_10min'     // Iniciar em 10 minutos
  | 'pause'           // Pausar cronômetro
  | 'continue'        // Continuar contando (ignorar saída)
  | 'stop'            // Encerrar cronômetro
  | 'timeout';        // Ação automática por timeout

export interface GeofenceNotificationData {
  type: 'geofence_enter' | 'geofence_exit' | 'auto_action' | 'reminder';
  localId: string;
  localNome: string;
  action?: NotificationAction;
}

// ============================================
// PERMISSÕES
// ============================================

/**
 * Solicita permissões de notificação
 */
export async function solicitarPermissaoNotificacao(): Promise<boolean> {
  try {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      logger.warn('notification', 'Permissão de notificação negada');
      return false;
    }

    // Canal de notificação no Android
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('geofence', {
        name: 'Alertas de Local',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#3B82F6',
        sound: 'default',
      });
    }

    logger.info('notification', '✅ Permissão de notificação concedida');
    return true;
  } catch (error) {
    logger.error('notification', 'Erro ao solicitar permissão', { error: String(error) });
    return false;
  }
}

// ============================================
// CATEGORIAS DE AÇÕES
// ============================================

/**
 * Configura categorias de ações para notificações interativas
 */
export async function configurarCategoriasNotificacao(): Promise<void> {
  try {
    // Categoria para ENTRADA no geofence
    await Notifications.setNotificationCategoryAsync('geofence_enter', [
      {
        identifier: 'start',
        buttonTitle: '▶️ Trabalhar',
        options: { opensAppToForeground: false },
      },
      {
        identifier: 'skip_today',
        buttonTitle: '😴 Ignorar hoje',
        options: { opensAppToForeground: false },
      },
      {
        identifier: 'delay_10min',
        buttonTitle: '⏰ Em 10 min',
        options: { opensAppToForeground: false },
      },
    ]);

    // Categoria para SAÍDA do geofence
    await Notifications.setNotificationCategoryAsync('geofence_exit', [
      {
        identifier: 'pause',
        buttonTitle: '⏸️ Pausar',
        options: { opensAppToForeground: false },
      },
      {
        identifier: 'continue',
        buttonTitle: '▶️ Continuar',
        options: { opensAppToForeground: false },
      },
      {
        identifier: 'stop',
        buttonTitle: '⏹️ Encerrar',
        options: { opensAppToForeground: false },
      },
    ]);

    logger.info('notification', '✅ Categorias de notificação configuradas');
  } catch (error) {
    logger.error('notification', 'Erro ao configurar categorias', { error: String(error) });
  }
}

// ============================================
// NOTIFICAÇÕES DE GEOFENCE
// ============================================

/**
 * Mostra notificação de ENTRADA no geofence
 */
export async function mostrarNotificacaoEntrada(
  localId: string,
  localNome: string
): Promise<string> {
  try {
    const notificationId = await Notifications.scheduleNotificationAsync({
      content: {
        title: `📍 Você chegou em ${localNome}`,
        body: 'Deseja iniciar o cronômetro? (Inicia automaticamente em 30s)',
        data: {
          type: 'geofence_enter',
          localId,
          localNome,
        } as GeofenceNotificationData,
        categoryIdentifier: 'geofence_enter',
        sound: 'default',
      },
      trigger: null, // Imediato
    });

    logger.info('notification', `📬 Notificação de entrada: ${localNome}`, { notificationId });
    return notificationId;
  } catch (error) {
    logger.error('notification', 'Erro ao mostrar notificação de entrada', { error: String(error) });
    return '';
  }
}

/**
 * Mostra notificação de SAÍDA do geofence
 */
export async function mostrarNotificacaoSaida(
  localId: string,
  localNome: string
): Promise<string> {
  try {
    const notificationId = await Notifications.scheduleNotificationAsync({
      content: {
        title: `🚪 Você saiu de ${localNome}`,
        body: 'O que deseja fazer? (Encerra automaticamente em 30s)',
        data: {
          type: 'geofence_exit',
          localId,
          localNome,
        } as GeofenceNotificationData,
        categoryIdentifier: 'geofence_exit',
        sound: 'default',
      },
      trigger: null,
    });

    logger.info('notification', `📬 Notificação de saída: ${localNome}`, { notificationId });
    return notificationId;
  } catch (error) {
    logger.error('notification', 'Erro ao mostrar notificação de saída', { error: String(error) });
    return '';
  }
}

/**
 * Mostra notificação de ação automática
 */
export async function mostrarNotificacaoAutoAcao(
  localNome: string,
  acao: 'start' | 'stop' | 'pause'
): Promise<void> {
  try {
    const acaoTexto = {
      start: '▶️ Cronômetro iniciado automaticamente',
      stop: '⏹️ Cronômetro encerrado automaticamente',
      pause: '⏸️ Cronômetro pausado automaticamente',
    };

    await Notifications.scheduleNotificationAsync({
      content: {
        title: acaoTexto[acao],
        body: localNome,
        data: { type: 'auto_action' } as GeofenceNotificationData,
        sound: 'default',
      },
      trigger: null,
    });

    logger.info('notification', `📬 Notificação de auto-ação: ${acao}`);
  } catch (error) {
    logger.error('notification', 'Erro ao mostrar notificação de auto-ação', { error: String(error) });
  }
}

/**
 * Agenda lembrete para iniciar cronômetro
 */
export async function agendarLembreteInicio(
  localId: string,
  localNome: string,
  delayMinutos: number = 10
): Promise<string> {
  try {
    const notificationId = await Notifications.scheduleNotificationAsync({
      content: {
        title: `⏰ Hora de começar!`,
        body: `Iniciando cronômetro em ${localNome}`,
        data: {
          type: 'reminder',
          localId,
          localNome,
          action: 'start',
        } as GeofenceNotificationData,
        sound: 'default',
      },
      trigger: {
        seconds: delayMinutos * 60,
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      },
    });

    logger.info('notification', `⏰ Lembrete agendado para ${delayMinutos} minutos`, { notificationId });
    return notificationId;
  } catch (error) {
    logger.error('notification', 'Erro ao agendar lembrete', { error: String(error) });
    return '';
  }
}

// ============================================
// GERENCIAMENTO
// ============================================

/**
 * Cancela uma notificação específica
 */
export async function cancelarNotificacao(notificationId: string): Promise<void> {
  if (!notificationId) return;

  try {
    await Notifications.cancelScheduledNotificationAsync(notificationId);
    logger.debug('notification', 'Notificação cancelada', { notificationId });
  } catch (error) {
    logger.error('notification', 'Erro ao cancelar notificação', { error: String(error) });
  }
}

/**
 * Cancela todas as notificações agendadas
 */
export async function cancelarTodasNotificacoes(): Promise<void> {
  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
    logger.info('notification', 'Todas as notificações canceladas');
  } catch (error) {
    logger.error('notification', 'Erro ao cancelar todas notificações', { error: String(error) });
  }
}

/**
 * Limpa notificações da bandeja
 */
export async function limparNotificacoes(): Promise<void> {
  try {
    await Notifications.dismissAllNotificationsAsync();
  } catch (error) {
    logger.error('notification', 'Erro ao limpar notificações', { error: String(error) });
  }
}

// ============================================
// LISTENERS
// ============================================

/**
 * Adiciona listener para resposta às notificações (quando usuário toca em ação)
 */
export function adicionarListenerResposta(
  callback: (response: Notifications.NotificationResponse) => void
): Notifications.Subscription {
  return Notifications.addNotificationResponseReceivedListener(callback);
}

/**
 * Adiciona listener para notificações recebidas (quando app está aberto)
 */
export function adicionarListenerRecebida(
  callback: (notification: Notifications.Notification) => void
): Notifications.Subscription {
  return Notifications.addNotificationReceivedListener(callback);
}

/**
 * Retorna a última notificação que abriu o app
 */
export async function getUltimaNotificacaoResposta(): Promise<Notifications.NotificationResponse | null> {
  return await Notifications.getLastNotificationResponseAsync();
}
