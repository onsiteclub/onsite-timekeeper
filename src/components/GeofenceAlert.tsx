/**
 * GeofenceAlert - OnSite Timekeeper
 * 
 * Fullscreen popup "alarm snooze" style
 * - EnterAlert: When entering the fence
 * - ExitAlert: When exiting the fence (Pause/End/Adjust)
 * - PauseScreen: Pause screen with 30min countdown
 * - ReturnAlert: When returning to fence after pause
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
import { useWorkSessionStore, type PendingAction, type PauseState } from '../stores/workSessionStore';
import { colors, withOpacity } from '../constants/colors';

// ============================================
// COUNTDOWN HOOK (seconds)
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
// COUNTDOWN HOOK (minutes:seconds) for pause
// ============================================

function usePauseCountdown(startTime: number, timeout: number) {
  const [remaining, setRemaining] = useState(() => {
    const elapsed = Date.now() - startTime;
    return Math.max(0, timeout - elapsed);
  });

  useEffect(() => {
    const interval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const newRemaining = Math.max(0, timeout - elapsed);
      setRemaining(newRemaining);
    }, 1000);

    return () => clearInterval(interval);
  }, [startTime, timeout]);

  const minutes = Math.floor(remaining / 60000);
  const seconds = Math.floor((remaining % 60000) / 1000);

  return { minutes, seconds };
}

// ============================================
// MAIN COMPONENT
// ============================================

export function GeofenceAlert() {
  const pendingAction = useWorkSessionStore(state => state.pendingAction);
  const pauseState = useWorkSessionStore(state => state.pauseState);
  
  // Priority: PauseScreen > Popups
  if (pauseState && !pendingAction) {
    return (
      <Modal
        visible={true}
        animationType="fade"
        transparent={false}
        statusBarTranslucent
      >
        <PauseScreen pause={pauseState} />
      </Modal>
    );
  }

  if (!pendingAction) return null;

  return (
    <Modal
      visible={true}
      animationType="fade"
      transparent={false}
      statusBarTranslucent
    >
      {pendingAction.type === 'enter' && <EnterAlert action={pendingAction} />}
      {pendingAction.type === 'exit' && <ExitAlert action={pendingAction} />}
      {pendingAction.type === 'return' && <ReturnAlert action={pendingAction} />}
    </Modal>
  );
}

// ============================================
// ENTRY ALERT
// ============================================

function EnterAlert({ action }: { action: PendingAction }) {
  const remaining = useCountdown(action.startTime, 30000);
  const actionStart = useWorkSessionStore(state => state.actionStart);
  const actionSkipToday = useWorkSessionStore(state => state.actionSkipToday);
  const actionDelay10Min = useWorkSessionStore(state => state.actionDelay10Min);

  const [pulseAnim] = useState(new Animated.Value(1));

  // Vibrate every 10 seconds
  useEffect(() => {
    if (remaining === 20 || remaining === 10) {
      Vibration.vibrate(200);
    }
  }, [remaining]);

  // Pulse animation on counter
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

  // Get location name (supports both old and new format)
  const locationName = action.locationName || action.localNome;

  return (
    <View style={[styles.container, { backgroundColor: colors.primary }]}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.emoji}>📍</Text>
        <Text style={styles.title}>You arrived!</Text>
        <Text style={styles.localName}>{locationName}</Text>
      </View>

      {/* Countdown */}
      <Animated.View style={[styles.countdownContainer, { transform: [{ scale: pulseAnim }] }]}>
        <Text style={styles.countdownNumber}>{remaining}</Text>
        <Text style={styles.countdownLabel}>seconds to start</Text>
      </Animated.View>

      {/* Buttons */}
      <View style={styles.buttonsContainer}>
        <TouchableOpacity
          style={[styles.button, styles.buttonPrimary]}
          onPress={actionStart}
          activeOpacity={0.8}
        >
          <Text style={styles.buttonIcon}>▶️</Text>
          <Text style={styles.buttonText}>Start Work</Text>
        </TouchableOpacity>

        <View style={styles.secondaryButtons}>
          <TouchableOpacity
            style={[styles.button, styles.buttonSecondary]}
            onPress={actionSkipToday}
            activeOpacity={0.8}
          >
            <Text style={styles.buttonIcon}>😴</Text>
            <Text style={styles.buttonTextSecondary}>Skip today</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.button, styles.buttonSecondary]}
            onPress={actionDelay10Min}
            activeOpacity={0.8}
          >
            <Text style={styles.buttonIcon}>⏰</Text>
            <Text style={styles.buttonTextSecondary}>In 10 min</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Footer */}
      <Text style={styles.footer}>
        Auto-starts in {remaining}s
      </Text>
    </View>
  );
}

// ============================================
// EXIT ALERT (no "Continue"!)
// ============================================

function ExitAlert({ action }: { action: PendingAction }) {
  const remaining = useCountdown(action.startTime, 30000);
  const actionPause = useWorkSessionStore(state => state.actionPause);
  const actionEnd = useWorkSessionStore(state => state.actionEnd);
  const actionEndWithAdjustment = useWorkSessionStore(state => state.actionEndWithAdjustment);

  const [showAdjust, setShowAdjust] = useState(false);
  const [pulseAnim] = useState(new Animated.Value(1));

  // Vibrate every 10 seconds
  useEffect(() => {
    if (remaining === 20 || remaining === 10) {
      Vibration.vibrate(200);
    }
  }, [remaining]);

  // Pulse animation
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

  const handleEndWithAdjustment = useCallback((minutes: number) => {
    actionEndWithAdjustment(minutes);
  }, [actionEndWithAdjustment]);

  // Get location name (supports both old and new format)
  const locationName = action.locationName || action.localNome;

  // Adjustment screen
  if (showAdjust) {
    return (
      <View style={[styles.container, { backgroundColor: colors.warning }]}>
        <View style={styles.header}>
          <Text style={styles.emoji}>⏱️</Text>
          <Text style={styles.title}>When did you leave?</Text>
          <Text style={styles.localName}>{locationName}</Text>
        </View>

        <View style={styles.ajusteContainer}>
          {[5, 10, 15, 30, 60].map((minutes) => (
            <TouchableOpacity
              key={minutes}
              style={[styles.button, styles.buttonAjuste]}
              onPress={() => handleEndWithAdjustment(minutes)}
              activeOpacity={0.8}
            >
              <Text style={styles.buttonText}>
                {minutes} {minutes === 1 ? 'minute' : 'minutes'} ago
              </Text>
            </TouchableOpacity>
          ))}

          <TouchableOpacity
            style={[styles.button, styles.buttonSecondary, { marginTop: 20 }]}
            onPress={() => setShowAdjust(false)}
            activeOpacity={0.8}
          >
            <Text style={styles.buttonTextSecondary}>← Back</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.warning }]}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.emoji}>🚪</Text>
        <Text style={styles.title}>You left!</Text>
        <Text style={styles.localName}>{locationName}</Text>
      </View>

      {/* Countdown */}
      <Animated.View style={[styles.countdownContainer, { transform: [{ scale: pulseAnim }] }]}>
        <Text style={styles.countdownNumber}>{remaining}</Text>
        <Text style={styles.countdownLabel}>seconds to end</Text>
      </Animated.View>

      {/* Buttons - NO "Continue"! */}
      <View style={styles.buttonsContainer}>
        {/* Main button: Pause */}
        <TouchableOpacity
          style={[styles.button, styles.buttonPause]}
          onPress={actionPause}
          activeOpacity={0.8}
        >
          <Text style={styles.buttonIcon}>⏸️</Text>
          <Text style={styles.buttonText}>Pause</Text>
          <Text style={styles.buttonSubtext}>back soon</Text>
        </TouchableOpacity>

        <View style={styles.secondaryButtons}>
          <TouchableOpacity
            style={[styles.button, styles.buttonDanger]}
            onPress={actionEnd}
            activeOpacity={0.8}
          >
            <Text style={styles.buttonIcon}>⏹️</Text>
            <Text style={styles.buttonTextWhite}>End</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.button, styles.buttonSecondary]}
            onPress={() => setShowAdjust(true)}
            activeOpacity={0.8}
          >
            <Text style={styles.buttonIcon}>✏️</Text>
            <Text style={styles.buttonTextSecondary}>Adjust</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Footer */}
      <Text style={styles.footer}>
        Auto-ends in {remaining}s
      </Text>
    </View>
  );
}

// ============================================
// PAUSE SCREEN (30 minutes)
// ============================================

function PauseScreen({ pause }: { pause: PauseState }) {
  const { minutes, seconds } = usePauseCountdown(pause.startTime, 30 * 60 * 1000);
  const actionResume = useWorkSessionStore(state => state.actionResume);
  const actionEnd = useWorkSessionStore(state => state.actionEnd);

  const [pulseAnim] = useState(new Animated.Value(1));

  // Vibrate when time is running out
  useEffect(() => {
    if (minutes === 5 && seconds === 0) {
      Vibration.vibrate([0, 200, 100, 200]);
    }
    if (minutes === 1 && seconds === 0) {
      Vibration.vibrate([0, 300, 100, 300, 100, 300]);
    }
  }, [minutes, seconds]);

  // Smooth pulse animation
  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.05,
          duration: 1000,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        }),
      ])
    );
    animation.start();
    return () => animation.stop();
  }, [pulseAnim]);

  // Format time
  const timeFormatted = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;

  // Color changes when time is running out
  const isUrgent = minutes < 5;
  const backgroundColor = isUrgent ? colors.error : colors.backgroundSecondary;

  // Get location name (supports both old and new format)
  const locationName = pause.locationName || pause.localNome;

  return (
    <View style={[styles.container, { backgroundColor }]}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.emoji}>⏸️</Text>
        <Text style={[styles.title, isUrgent && { color: colors.white }]}>Paused</Text>
        <Text style={[styles.localName, isUrgent && { color: withOpacity(colors.white, 0.9) }]}>
          {locationName}
        </Text>
      </View>

      {/* Large countdown */}
      <Animated.View style={[styles.pauseCountdownContainer, { transform: [{ scale: pulseAnim }] }]}>
        <Text style={[styles.pauseCountdownNumber, isUrgent && { color: colors.white }]}>
          {timeFormatted}
        </Text>
        <Text style={[styles.pauseCountdownLabel, isUrgent && { color: withOpacity(colors.white, 0.8) }]}>
          Auto-resuming
        </Text>
      </Animated.View>

      {/* Buttons */}
      <View style={styles.buttonsContainer}>
        <TouchableOpacity
          style={[styles.button, styles.buttonPrimary]}
          onPress={actionResume}
          activeOpacity={0.8}
        >
          <Text style={styles.buttonIcon}>▶️</Text>
          <Text style={styles.buttonText}>Resume now</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.button, isUrgent ? styles.buttonSecondaryLight : styles.buttonSecondary]}
          onPress={actionEnd}
          activeOpacity={0.8}
        >
          <Text style={styles.buttonIcon}>⏹️</Text>
          <Text style={isUrgent ? styles.buttonTextSecondaryLight : styles.buttonTextSecondary}>
            End session
          </Text>
        </TouchableOpacity>
      </View>

      {/* Footer */}
      <Text style={[styles.footer, isUrgent && { color: withOpacity(colors.white, 0.7) }]}>
        {isUrgent 
          ? 'Session will end soon!'
          : 'Return to work area to resume'
        }
      </Text>
    </View>
  );
}

// ============================================
// RETURN ALERT (after pause)
// ============================================

function ReturnAlert({ action }: { action: PendingAction }) {
  const remaining = useCountdown(action.startTime, 30000);
  const actionResume = useWorkSessionStore(state => state.actionResume);
  const actionEnd = useWorkSessionStore(state => state.actionEnd);

  const [pulseAnim] = useState(new Animated.Value(1));

  // Vibrate every 10 seconds
  useEffect(() => {
    if (remaining === 20 || remaining === 10) {
      Vibration.vibrate(200);
    }
  }, [remaining]);

  // Pulse animation
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

  // Get location name (supports both old and new format)
  const locationName = action.locationName || action.localNome;

  return (
    <View style={[styles.container, { backgroundColor: colors.success }]}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.emoji}>🔄</Text>
        <Text style={styles.title}>You're back!</Text>
        <Text style={styles.localName}>{locationName}</Text>
      </View>

      {/* Countdown */}
      <Animated.View style={[styles.countdownContainer, { transform: [{ scale: pulseAnim }] }]}>
        <Text style={styles.countdownNumber}>{remaining}</Text>
        <Text style={styles.countdownLabel}>seconds to resume</Text>
      </Animated.View>

      {/* Buttons */}
      <View style={styles.buttonsContainer}>
        <TouchableOpacity
          style={[styles.button, styles.buttonPrimary]}
          onPress={actionResume}
          activeOpacity={0.8}
        >
          <Text style={styles.buttonIcon}>▶️</Text>
          <Text style={styles.buttonText}>Resume</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.button, styles.buttonSecondary]}
          onPress={actionEnd}
          activeOpacity={0.8}
        >
          <Text style={styles.buttonIcon}>⏹️</Text>
          <Text style={styles.buttonTextSecondary}>End session</Text>
        </TouchableOpacity>
      </View>

      {/* Footer */}
      <Text style={styles.footer}>
        Auto-resumes in {remaining}s
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

  // Pause countdown (larger)
  pauseCountdownContainer: {
    alignItems: 'center',
    backgroundColor: withOpacity(colors.black, 0.1),
    paddingVertical: 40,
    paddingHorizontal: 60,
    borderRadius: 30,
  },
  pauseCountdownNumber: {
    fontSize: 72,
    fontWeight: 'bold',
    color: colors.text,
    fontVariant: ['tabular-nums'],
  },
  pauseCountdownLabel: {
    fontSize: 16,
    color: colors.textSecondary,
    marginTop: 8,
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
    flex: 1,
  },
  buttonPause: {
    backgroundColor: colors.white,
    flexDirection: 'column',
    paddingVertical: 24,
  },
  buttonSecondary: {
    backgroundColor: withOpacity(colors.white, 0.2),
    flex: 1,
  },
  buttonSecondaryLight: {
    backgroundColor: withOpacity(colors.white, 0.3),
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
  buttonTextWhite: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.white,
  },
  buttonTextSecondary: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.white,
  },
  buttonTextSecondaryLight: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.white,
  },
  buttonSubtext: {
    fontSize: 14,
    color: colors.textSecondary,
    marginTop: 4,
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
