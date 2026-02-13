/**
 * VoiceCommandSheet - Chat-style modal for voice/text commands
 *
 * Opens from FloatingMicButton. Auto-starts recording immediately.
 * Uses OpenAI Whisper (via Supabase Edge Function) for transcription.
 * Chat UI: user message on left, AI response on right (WhatsApp-style).
 *
 * Flow: Record audio → Whisper transcription → processVoiceCommand() → AI response
 */

import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Modal,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Keyboard,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors } from '../constants/colors';
import { processVoiceCommand, type VoiceAppState, type VoiceAction } from '../lib/ai/voice';
import {
  startRecording,
  stopAndTranscribe,
  cancelRecording,
  isCurrentlyRecording,
} from '../lib/ai/whisper';
import { useAuthStore } from '../stores/authStore';
import { useDailyLogStore } from '../stores/dailyLogStore';
import { useLocationStore } from '../stores/locationStore';
import { logger } from '../lib/logger';
import { getDailyHoursByPeriod } from '../lib/database';
import { generateAndShareTimesheetPDF } from '../lib/timesheetPdf';
import type { DailyHoursEntry } from '../lib/database/daily';
import type { ComputedSession } from '../screens/home/hooks';

interface VoiceCommandSheetProps {
  visible: boolean;
  onClose: () => void;
}

/** Convert DailyHoursEntry to ComputedSession for PDF generation */
function dailyEntryToSession(entry: DailyHoursEntry): ComputedSession {
  const entryTime = entry.first_entry
    ? new Date(`${entry.date}T${entry.first_entry}:00`).toISOString()
    : new Date(`${entry.date}T09:00:00`).toISOString();
  const exitTime = entry.last_exit
    ? new Date(`${entry.date}T${entry.last_exit}:00`).toISOString()
    : null;

  return {
    id: entry.id,
    location_id: entry.location_id || '',
    location_name: entry.location_name,
    entry_at: entryTime,
    exit_at: exitTime,
    duration_minutes: entry.total_minutes,
    pause_minutes: entry.break_minutes,
    status: exitTime ? 'finished' : 'active',
    type: entry.source === 'gps' ? 'automatic' : 'manual',
    manually_edited: entry.source === 'edited' || entry.source === 'manual' ? 1 : 0,
  };
}

const SUGGESTIONS = [
  'Log my hours today from 7 to 3',
  'Send report from 1st to 15th',
  'Delete yesterday',
];

/** A single chat message in the conversation history */
interface ChatMessage {
  id: number;
  role: 'user' | 'ai';
  text: string;
}

/** Tracks a completed voice action for the confirmation UI */
interface CompletedAction {
  type: string;
  date?: string;
  periodStart?: string;
  periodEnd?: string;
}

export function VoiceCommandSheet({ visible, onClose }: VoiceCommandSheetProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);
  const [inputText, setInputText] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [completedAction, setCompletedAction] = useState<CompletedAction | null>(null);
  const hasAutoStarted = useRef(false);
  const msgIdRef = useRef(0);

  const addMessage = useCallback((role: 'user' | 'ai', text: string) => {
    msgIdRef.current += 1;
    setMessages(prev => [...prev, { id: msgIdRef.current, role, text }]);
  }, []);

  // Auto-start recording when modal opens (keep message history)
  useEffect(() => {
    if (visible) {
      setInputText('');
      setCompletedAction(null);
      setIsLoading(false);
      setIsRecording(false);
      setIsTranscribing(false);
      hasAutoStarted.current = false;

      const timer = setTimeout(() => {
        if (!hasAutoStarted.current) {
          hasAutoStarted.current = true;
          handleStartRecording();
        }
      }, 400);

      return () => clearTimeout(timer);
    } else {
      if (isCurrentlyRecording()) {
        cancelRecording();
      }
    }
  }, [visible]);

  // Auto-scroll when content changes
  useEffect(() => {
    if (messages.length > 0 || isLoading) {
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [messages, isLoading]);

  const handleStartRecording = async () => {
    try {
      setInputText('');
      setCompletedAction(null);
      const started = await startRecording();
      if (started) {
        setIsRecording(true);
      } else {
        addMessage('ai', 'Microphone permission required.');
      }
    } catch (error) {
      logger.error('voice', 'Failed to start Whisper recording', { error: String(error) });
      setIsRecording(false);
    }
  };

  const handleStopRecording = useCallback(async () => {
    if (!isCurrentlyRecording()) {
      setIsRecording(false);
      return;
    }

    setIsRecording(false);
    setIsTranscribing(true);

    try {
      const transcript = await stopAndTranscribe();
      if (transcript) {
        setInputText(transcript);
      } else {
        addMessage('ai', 'Could not transcribe. Please try again.');
      }
    } catch (error) {
      logger.error('voice', 'Whisper transcription failed', { error: String(error) });
      addMessage('ai', 'Transcription error. Please try again.');
    } finally {
      setIsTranscribing(false);
    }
  }, [addMessage]);

  const handleSubmit = useCallback(async (text?: string) => {
    if (isCurrentlyRecording()) {
      setIsRecording(false);
      setIsTranscribing(true);
      try {
        const transcript = await stopAndTranscribe();
        if (transcript) {
          setInputText(transcript);
          setIsTranscribing(false);
          await executeCommand(transcript);
          return;
        } else {
          setIsTranscribing(false);
          addMessage('ai', 'Could not transcribe. Please try again.');
          return;
        }
      } catch (error) {
        setIsTranscribing(false);
        logger.error('voice', 'Whisper transcription failed on submit', { error: String(error) });
        addMessage('ai', 'Transcription error. Please try again.');
        return;
      }
    }

    const transcript = (text || inputText).trim();
    if (!transcript) return;

    await executeCommand(transcript);
  }, [inputText, addMessage]);

  const executeCommand = async (transcript: string) => {
    Keyboard.dismiss();
    addMessage('user', transcript);
    setInputText('');
    setIsLoading(true);
    setCompletedAction(null);

    try {
      const userId = useAuthStore.getState().getUserId();
      if (!userId) {
        addMessage('ai', 'Not logged in.');
        setIsLoading(false);
        return;
      }

      const tracking = useDailyLogStore.getState().tracking;
      const currentFenceId = useLocationStore.getState().currentFenceId;
      const locations = useLocationStore.getState().locations;
      const activeLocation = locations.find(l => l.id === currentFenceId);

      const appState: VoiceAppState = {
        now: new Date().toISOString(),
        has_active_session: tracking.isTracking,
        current_site: tracking.locationName || activeLocation?.name || null,
        timer: null,
        is_paused: false,
        available_sites: locations
          .filter(l => l.status === 'active')
          .map(l => ({ id: l.id, name: l.name })),
      };

      const result = await processVoiceCommand(transcript, userId, appState);

      addMessage('ai', result.responseText);

      if (result.actionExecuted === 'stop' && currentFenceId) {
        await useLocationStore.getState().handleManualExit(currentFenceId);
      }

      if (result.actionExecuted === 'start') {
        await useDailyLogStore.getState().reloadToday();
      }

      if (['update_record', 'delete_record'].includes(result.actionExecuted)) {
        await useDailyLogStore.getState().reloadToday();
        await useDailyLogStore.getState().reloadWeek();
      }

      // Handle report generation (both send_report and generate_report)
      if (
        (result.actionExecuted === 'send_report' || result.actionExecuted === 'generate_report') &&
        result.action?.period
      ) {
        const { period } = result.action;
        const entries = getDailyHoursByPeriod(userId, period.start, period.end);
        const sessions = entries.map(dailyEntryToSession);
        const finished = sessions.filter(s => s.exit_at);

        if (finished.length === 0) {
          addMessage('ai', 'No completed sessions found for this period.');
        } else {
          const employeeName = useAuthStore.getState().getUserName() || 'Employee';
          await generateAndShareTimesheetPDF(finished, {
            employeeName,
            employeeId: userId,
            periodStart: new Date(period.start),
            periodEnd: new Date(period.end),
          });
        }
      }

      // Handle navigation
      if (result.actionExecuted === 'navigate' && result.action?.screen) {
        const screen = result.action.screen;
        const params = result.action.params as Record<string, string> | undefined;
        setTimeout(() => {
          onClose();
          if (screen === 'reports' && params?.selectedDate) {
            router.push(`/(tabs)/reports?viewDate=${params.selectedDate}`);
          } else if (screen === 'reports') {
            router.push('/(tabs)/reports');
          } else if (screen === 'map') {
            router.push('/(tabs)/map');
          } else if (screen === 'settings') {
            router.push('/(tabs)/settings');
          } else {
            router.push('/(tabs)');
          }
        }, 600);
      }

      const actionable = ['start', 'update_record', 'delete_record', 'send_report', 'generate_report', 'stop', 'pause', 'resume'];
      if (actionable.includes(result.actionExecuted)) {
        setCompletedAction({
          type: result.actionExecuted,
          date: result.action?.date,
          periodStart: result.action?.period?.start,
          periodEnd: result.action?.period?.end,
        });
      }
    } catch (error) {
      logger.error('voice', 'Voice command failed', { error: String(error) });
      addMessage('ai', 'Something went wrong. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSuggestionPress = useCallback((text: string) => {
    if (isCurrentlyRecording()) {
      cancelRecording();
      setIsRecording(false);
    }
    executeCommand(text);
  }, []);

  const handleDone = useCallback(() => {
    if (isCurrentlyRecording()) cancelRecording();
    setIsRecording(false);
    setCompletedAction(null);
    onClose();
  }, [onClose]);

  const handleViewChanges = useCallback(() => {
    if (isCurrentlyRecording()) cancelRecording();
    setIsRecording(false);
    const action = completedAction;
    setCompletedAction(null);
    onClose();

    if (action?.type === 'update_record' || action?.type === 'delete_record') {
      const viewDate = action.date || new Date().toISOString().split('T')[0];
      router.push(`/(tabs)/reports?viewDate=${viewDate}`);
    } else if (action?.type === 'send_report' || action?.type === 'generate_report') {
      router.push('/(tabs)/reports');
    }
  }, [onClose, completedAction, router]);

  const handleClose = useCallback(() => {
    if (isCurrentlyRecording()) cancelRecording();
    setIsRecording(false);
    setCompletedAction(null);
    onClose();
  }, [onClose]);

  const hasConversation = messages.length > 0;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={handleClose}
    >
      <KeyboardAvoidingView
        style={s.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Backdrop */}
        <TouchableOpacity
          style={s.backdrop}
          activeOpacity={1}
          onPress={handleClose}
        />

        {/* Chat Card — anchored to bottom */}
        <View style={s.card}>
          {/* Header */}
          <View style={s.header}>
            <Ionicons name="chatbubbles" size={18} color={colors.amber} />
            <Text style={s.headerTitle}>AI Assistant</Text>
            <TouchableOpacity onPress={handleClose} style={s.closeBtn}>
              <Ionicons name="close" size={20} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          {/* Chat area */}
          <ScrollView
            ref={scrollRef}
            style={s.chatArea}
            contentContainerStyle={s.chatContent}
            showsVerticalScrollIndicator={false}
          >
            {/* Suggestions (only when no conversation yet) */}
            {!hasConversation && !isRecording && !isTranscribing && !isLoading && (
              <View style={s.suggestionsWrap}>
                <Text style={s.suggestionsLabel}>Try saying:</Text>
                {SUGGESTIONS.map((text, i) => (
                  <TouchableOpacity
                    key={i}
                    style={s.suggestionChip}
                    onPress={() => handleSuggestionPress(text)}
                  >
                    <Text style={s.suggestionChipText}>{text}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {/* Recording indicator */}
            {isRecording && (
              <View style={s.recordingBanner}>
                <View style={s.recordingDot} />
                <Text style={s.recordingText}>Listening...</Text>
                <TouchableOpacity onPress={handleStopRecording} style={s.stopPill}>
                  <Ionicons name="stop" size={14} color={colors.white} />
                  <Text style={s.stopPillText}>Stop</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Transcribing */}
            {isTranscribing && (
              <View style={s.statusRow}>
                <ActivityIndicator size="small" color={colors.amber} />
                <Text style={s.statusText}>Transcribing...</Text>
              </View>
            )}

            {/* Conversation history */}
            {messages.map((msg) => (
              msg.role === 'user' ? (
                <View key={msg.id} style={s.userBubbleRow}>
                  <View style={s.userBubble}>
                    <Text style={s.userBubbleText}>{msg.text}</Text>
                  </View>
                </View>
              ) : (
                <View key={msg.id} style={s.aiBubbleRow}>
                  <View style={s.aiBubble}>
                    <Text style={s.aiBubbleText}>{msg.text}</Text>
                  </View>
                </View>
              )
            ))}

            {/* AI thinking */}
            {isLoading && (
              <View style={s.aiBubbleRow}>
                <View style={s.aiBubbleThinking}>
                  <ActivityIndicator size="small" color={colors.amber} />
                  <Text style={s.aiThinkingText}>Thinking...</Text>
                </View>
              </View>
            )}

          </ScrollView>

          {/* Action buttons above input row */}
          {completedAction && !isLoading && (
            <View style={s.actionRow}>
              <TouchableOpacity style={s.actionBtnPrimary} onPress={handleDone}>
                <Ionicons name="checkmark" size={16} color={colors.white} />
                <Text style={s.actionBtnPrimaryText}>Done</Text>
              </TouchableOpacity>

              {(completedAction.type === 'update_record' ||
                completedAction.type === 'delete_record' ||
                completedAction.type === 'send_report' ||
                completedAction.type === 'generate_report') && (
                <TouchableOpacity style={s.actionBtnSecondary} onPress={handleViewChanges}>
                  <Ionicons name="eye-outline" size={16} color={colors.amber} />
                  <Text style={s.actionBtnSecondaryText}>View</Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          {/* Input row — always visible */}
          <View style={[s.inputRow, { paddingBottom: Math.max(insets.bottom, 10) }]}>
            <TextInput
              style={s.textInput}
              placeholder={isRecording ? 'Speak now...' : 'Type a command...'}
              placeholderTextColor={colors.textMuted}
              value={inputText}
              onChangeText={setInputText}
              onSubmitEditing={() => handleSubmit()}
              returnKeyType="send"
              editable={!isLoading && !isTranscribing}
            />
            <TouchableOpacity
              style={[s.micBtn, isRecording && s.micBtnRecording]}
              onPress={isRecording ? handleStopRecording : handleStartRecording}
              disabled={isLoading || isTranscribing}
            >
              <Ionicons
                name={isRecording ? 'stop' : 'mic'}
                size={18}
                color={colors.white}
              />
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.sendBtn, (isLoading || isTranscribing) && s.sendBtnDisabled]}
              onPress={() => handleSubmit()}
              disabled={isLoading || isTranscribing}
            >
              <Ionicons name="send" size={16} color={colors.white} />
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ============================================================
// STYLES
// ============================================================

const s = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  card: {
    backgroundColor: colors.white,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '85%',
    minHeight: 300,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 16,
    elevation: 10,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
    flex: 1,
  },
  closeBtn: {
    padding: 4,
  },

  // Chat area
  chatArea: {
    flex: 1,
    minHeight: 120,
  },
  chatContent: {
    padding: 16,
    gap: 10,
  },

  // Suggestions
  suggestionsWrap: {
    gap: 8,
    paddingBottom: 4,
  },
  suggestionsLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  suggestionChip: {
    backgroundColor: colors.surfaceMuted,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  suggestionChipText: {
    fontSize: 14,
    color: colors.text,
  },

  // Recording
  recordingBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FEF2F2',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
  },
  recordingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.error,
  },
  recordingText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.error,
    flex: 1,
  },
  stopPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.error,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 12,
  },
  stopPillText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.white,
  },

  // Status
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 8,
  },
  statusText: {
    fontSize: 14,
    color: colors.textSecondary,
  },

  // User bubble (left-aligned)
  userBubbleRow: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
  },
  userBubble: {
    backgroundColor: colors.surfaceMuted,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 16,
    borderTopLeftRadius: 4,
    maxWidth: '85%',
  },
  userBubbleText: {
    fontSize: 14,
    color: colors.text,
    lineHeight: 20,
  },

  // AI bubble (right-aligned)
  aiBubbleRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  aiBubble: {
    backgroundColor: `${colors.amber}15`,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 16,
    borderTopRightRadius: 4,
    maxWidth: '85%',
  },
  aiBubbleThinking: {
    backgroundColor: `${colors.amber}15`,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 16,
    borderTopRightRadius: 4,
    maxWidth: '85%',
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 8,
  },
  aiBubbleText: {
    fontSize: 14,
    color: colors.text,
    lineHeight: 20,
  },
  aiThinkingText: {
    fontSize: 14,
    color: colors.textSecondary,
  },

  // Action buttons (above input row)
  actionRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  actionBtnPrimary: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 40,
    backgroundColor: colors.accent,
    borderRadius: 12,
  },
  actionBtnPrimaryText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.white,
  },
  actionBtnSecondary: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 40,
    backgroundColor: `${colors.amber}15`,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.amber,
  },
  actionBtnSecondaryText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.amber,
  },
  // Input row
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  micBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.accent,
    justifyContent: 'center',
    alignItems: 'center',
  },
  micBtnRecording: {
    backgroundColor: colors.error,
  },
  textInput: {
    flex: 1,
    height: 42,
    backgroundColor: colors.surfaceMuted,
    borderRadius: 21,
    paddingHorizontal: 16,
    fontSize: 14,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.amber,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendBtnDisabled: {
    backgroundColor: colors.border,
  },
});
