/**
 * GeofenceAlert - OnSite Timekeeper
 * 
 * Popup fullscreen estilo "soneca do despertador"
 * Mostra opções de ação quando entra/sai de um geofence
 * Countdown de 30 segundos para auto-ação
 */

import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  Animated,
  Vibration,
} from 'react-native';
import { useWorkSessionStore, type PendingAction } from '../stores/workSessionStore';
import { colors, withOpacity } from '../constants/colors';

// ============================================
// COUNTDOWN HOOK
// ============================================

function useCountdown(startTime: number, timeout: number) {
  const [remaining, setRemaining] = useState(() => {
    const elapsed = Date.now() - startTime;
    return Math.max(0, Math.ceil((timeout - elapsed) / 1000));
  });

  useEffect(() => {
    const interval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const newRemaining = Math.max(0, Math.ceil((timeout - elapsed) / 1000));
      setRemaining(newRemaining);
    }, 100);

    return () => clearInterval(interval);
  }, [startTime, timeout]);

  return remaining;
}

// ============================================
// COMPONENTE PRINCIPAL
// ============================================

export function GeofenceAlert() {
  const pendingAction = useWorkSessionStore(state => state.pendingAction);
  
  if (!pendingAction) return null;

  return (
    <Modal
      visible={true}
      animationType="fade"
      transparent={false}
      statusBarTranslucent
    >
      {pendingAction.type === 'enter' ? (
        <EnterAlert action={pendingAction} />
      ) : (
        <ExitAlert action={pendingAction} />
      )}
    </Modal>
  );
}

// ============================================
// ALERT DE ENTRADA
// ============================================

function EnterAlert({ action }: { action: PendingAction }) {
  const remaining = useCountdown(action.startTime, 30000);
  const acaoIniciar = useWorkSessionStore(state => state.acaoIniciar);
  const acaoIgnorarHoje = useWorkSessionStore(state => state.acaoIgnorarHoje);
  const acaoDelay10Min = useWorkSessionStore(state => state.acaoDelay10Min);

  const [pulseAnim] = useState(new Animated.Value(1));

  // Vibra a cada 10 segundos
  useEffect(() => {
    if (remaining === 20 || remaining === 10) {
      Vibration.vibrate(200);
    }
  }, [remaining]);

  // Animação de pulse no contador
  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.1,
          duration: 500,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 500,
          useNativeDriver: true,
        }),
      ])
    );
    animation.start();
    return () => animation.stop();
  }, [pulseAnim]);

  return (
    <View style={[styles.container, { backgroundColor: colors.primary }]}>
      {/* Cabeçalho */}
      <View style={styles.header}>
        <Text style={styles.emoji}>📍</Text>
        <Text style={styles.title}>Você chegou!</Text>
        <Text style={styles.localName}>{action.localNome}</Text>
      </View>

      {/* Countdown */}
      <Animated.View style={[styles.countdownContainer, { transform: [{ scale: pulseAnim }] }]}>
        <Text style={styles.countdownNumber}>{remaining}</Text>
        <Text style={styles.countdownLabel}>segundos para iniciar</Text>
      </Animated.View>

      {/* Botões */}
      <View style={styles.buttonsContainer}>
        <TouchableOpacity
          style={[styles.button, styles.buttonPrimary]}
          onPress={acaoIniciar}
          activeOpacity={0.8}
        >
          <Text style={styles.buttonIcon}>▶️</Text>
          <Text style={styles.buttonText}>Trabalhar</Text>
        </TouchableOpacity>

        <View style={styles.secondaryButtons}>
          <TouchableOpacity
            style={[styles.button, styles.buttonSecondary]}
            onPress={acaoIgnorarHoje}
            activeOpacity={0.8}
          >
            <Text style={styles.buttonIcon}>😴</Text>
            <Text style={styles.buttonTextSecondary}>Ignorar hoje</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.button, styles.buttonSecondary]}
            onPress={acaoDelay10Min}
            activeOpacity={0.8}
          >
            <Text style={styles.buttonIcon}>⏰</Text>
            <Text style={styles.buttonTextSecondary}>Em 10 min</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Footer */}
      <Text style={styles.footer}>
        Inicia automaticamente em {remaining}s
      </Text>
    </View>
  );
}

// ============================================
// ALERT DE SAÍDA
// ============================================

function ExitAlert({ action }: { action: PendingAction }) {
  const remaining = useCountdown(action.startTime, 30000);
  const acaoPausar = useWorkSessionStore(state => state.acaoPausar);
  const acaoContinuar = useWorkSessionStore(state => state.acaoContinuar);
  const acaoEncerrar = useWorkSessionStore(state => state.acaoEncerrar);
  const acaoEncerrarComAjuste = useWorkSessionStore(state => state.acaoEncerrarComAjuste);

  const [showAjuste, setShowAjuste] = useState(false);
  const [pulseAnim] = useState(new Animated.Value(1));

  // Vibra a cada 10 segundos
  useEffect(() => {
    if (remaining === 20 || remaining === 10) {
      Vibration.vibrate(200);
    }
  }, [remaining]);

  // Animação de pulse
  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.1,
          duration: 500,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 500,
          useNativeDriver: true,
        }),
      ])
    );
    animation.start();
    return () => animation.stop();
  }, [pulseAnim]);

  const handleEncerrarComAjuste = useCallback((minutos: number) => {
    acaoEncerrarComAjuste(minutos);
  }, [acaoEncerrarComAjuste]);

  if (showAjuste) {
    return (
      <View style={[styles.container, { backgroundColor: colors.warning }]}>
        <View style={styles.header}>
          <Text style={styles.emoji}>⏱️</Text>
          <Text style={styles.title}>Quando você saiu?</Text>
          <Text style={styles.localName}>{action.localNome}</Text>
        </View>

        <View style={styles.ajusteContainer}>
          {[5, 10, 15, 30, 60].map((minutos) => (
            <TouchableOpacity
              key={minutos}
              style={[styles.button, styles.buttonAjuste]}
              onPress={() => handleEncerrarComAjuste(minutos)}
              activeOpacity={0.8}
            >
              <Text style={styles.buttonText}>
                Há {minutos} {minutos === 1 ? 'minuto' : 'minutos'}
              </Text>
            </TouchableOpacity>
          ))}

          <TouchableOpacity
            style={[styles.button, styles.buttonSecondary, { marginTop: 20 }]}
            onPress={() => setShowAjuste(false)}
            activeOpacity={0.8}
          >
            <Text style={styles.buttonTextSecondary}>← Voltar</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.warning }]}>
      {/* Cabeçalho */}
      <View style={styles.header}>
        <Text style={styles.emoji}>🚪</Text>
        <Text style={styles.title}>Você saiu!</Text>
        <Text style={styles.localName}>{action.localNome}</Text>
      </View>

      {/* Countdown */}
      <Animated.View style={[styles.countdownContainer, { transform: [{ scale: pulseAnim }] }]}>
        <Text style={styles.countdownNumber}>{remaining}</Text>
        <Text style={styles.countdownLabel}>segundos para encerrar</Text>
      </Animated.View>

      {/* Botões */}
      <View style={styles.buttonsContainer}>
        <TouchableOpacity
          style={[styles.button, styles.buttonDanger]}
          onPress={acaoEncerrar}
          activeOpacity={0.8}
        >
          <Text style={styles.buttonIcon}>⏹️</Text>
          <Text style={styles.buttonText}>Encerrar</Text>
        </TouchableOpacity>

        <View style={styles.secondaryButtons}>
          <TouchableOpacity
            style={[styles.button, styles.buttonSecondary]}
            onPress={acaoContinuar}
            activeOpacity={0.8}
          >
            <Text style={styles.buttonIcon}>▶️</Text>
            <Text style={styles.buttonTextSecondary}>Continuar</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.button, styles.buttonSecondary]}
            onPress={() => setShowAjuste(true)}
            activeOpacity={0.8}
          >
            <Text style={styles.buttonIcon}>✏️</Text>
            <Text style={styles.buttonTextSecondary}>Ajustar</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Footer */}
      <Text style={styles.footer}>
        Encerra automaticamente em {remaining}s
      </Text>
    </View>
  );
}

// ============================================
// STYLES
// ============================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 60,
    paddingHorizontal: 30,
  },

  header: {
    alignItems: 'center',
  },
  emoji: {
    fontSize: 60,
    marginBottom: 16,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: colors.white,
    marginBottom: 8,
  },
  localName: {
    fontSize: 24,
    color: withOpacity(colors.white, 0.9),
    textAlign: 'center',
  },

  countdownContainer: {
    alignItems: 'center',
    backgroundColor: withOpacity(colors.black, 0.2),
    paddingVertical: 30,
    paddingHorizontal: 50,
    borderRadius: 100,
  },
  countdownNumber: {
    fontSize: 80,
    fontWeight: 'bold',
    color: colors.white,
  },
  countdownLabel: {
    fontSize: 16,
    color: withOpacity(colors.white, 0.8),
  },

  buttonsContainer: {
    width: '100%',
    gap: 16,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 20,
    paddingHorizontal: 30,
    borderRadius: 16,
  },
  buttonPrimary: {
    backgroundColor: colors.white,
  },
  buttonDanger: {
    backgroundColor: colors.error,
  },
  buttonSecondary: {
    backgroundColor: withOpacity(colors.white, 0.2),
    flex: 1,
  },
  buttonAjuste: {
    backgroundColor: withOpacity(colors.white, 0.2),
    marginBottom: 10,
  },
  buttonIcon: {
    fontSize: 24,
    marginRight: 12,
  },
  buttonText: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.text,
  },
  buttonTextSecondary: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.white,
  },
  secondaryButtons: {
    flexDirection: 'row',
    gap: 16,
  },

  ajusteContainer: {
    flex: 1,
    justifyContent: 'center',
    width: '100%',
  },

  footer: {
    fontSize: 14,
    color: withOpacity(colors.white, 0.7),
  },
});
