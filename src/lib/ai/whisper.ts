/**
 * Whisper Transcription Client - OnSite Timekeeper
 *
 * Records audio using expo-av and sends it to the ai-whisper Edge Function
 * for transcription via OpenAI Whisper API.
 *
 * Returns text transcription in any language (auto-detected by Whisper).
 */

import { Audio, InterruptionModeIOS, InterruptionModeAndroid } from 'expo-av';
import * as FileSystem from 'expo-file-system';
import { Platform } from 'react-native';
import { supabase } from '../supabase';
import { logger } from '../logger';

// Recording settings optimized for speech
const RECORDING_OPTIONS: Audio.RecordingOptions = {
  isMeteringEnabled: true,
  android: {
    extension: '.m4a',
    outputFormat: Audio.AndroidOutputFormat.MPEG_4,
    audioEncoder: Audio.AndroidAudioEncoder.AAC,
    sampleRate: 16000,
    numberOfChannels: 1,
    bitRate: 64000,
  },
  ios: {
    extension: '.m4a',
    // DO NOT set outputFormat — iOS infers correctly from extension.
    // Setting outputFormat: MPEG4AAC + sampleRate != 44100 → "recorder not prepared"
    audioQuality: Audio.IOSAudioQuality.MAX,
    sampleRate: 44100,
    numberOfChannels: 1,
    bitRate: 128000,
    linearPCMBitDepth: 16,
    linearPCMIsBigEndian: false,
    linearPCMIsFloat: false,
  },
  web: {
    mimeType: 'audio/webm',
    bitsPerSecond: 128000,
  },
};

let currentRecording: Audio.Recording | null = null;

/**
 * Request microphone permission and start recording audio.
 * Returns true if recording started successfully.
 */
export async function startRecording(): Promise<true | 'denied' | string> {
  try {
    // Check if permission is permanently denied (user must go to settings)
    const current = await Audio.getPermissionsAsync();
    if (!current.granted && !current.canAskAgain) {
      logger.warn('voice', 'Microphone permission permanently denied — user must enable in settings');
      return 'denied';
    }

    // Request permission
    const { granted } = await Audio.requestPermissionsAsync();
    if (!granted) {
      logger.warn('voice', 'Microphone permission not granted');
      return 'denied';
    }

    // Clean up any stale recording that wasn't properly released
    if (currentRecording) {
      try {
        await currentRecording.stopAndUnloadAsync();
      } catch {
        // Already stopped/unloaded, ignore
      }
      currentRecording = null;
      // Give iOS time to release native AVAudioRecorder resources
      await new Promise(r => setTimeout(r, 200));
    }

    // Reset audio session first, then configure for recording.
    // The reset→wait→configure cycle ensures iOS AVAudioSession is in a clean state.
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
      playsInSilentModeIOS: true,
      interruptionModeIOS: InterruptionModeIOS.DoNotMix,
    });
    await new Promise(r => setTimeout(r, 100));

    await Audio.setAudioModeAsync({
      allowsRecordingIOS: true,
      playsInSilentModeIOS: true,
      staysActiveInBackground: true,
      interruptionModeIOS: InterruptionModeIOS.DoNotMix,
      shouldDuckAndroid: true,
      interruptionModeAndroid: InterruptionModeAndroid.DoNotMix,
    });

    const { recording } = await Audio.Recording.createAsync(RECORDING_OPTIONS);

    currentRecording = recording;
    logger.info('voice', 'Whisper recording started');
    return true;
  } catch (error) {
    const msg = String(error);
    logger.error('voice', `Failed to start recording: ${msg}`, { error: msg });
    currentRecording = null;
    // Return error message so UI can display it for diagnosis
    return `error:${msg}`;
  }
}

/**
 * Stop recording and transcribe the audio via Whisper API.
 * Returns the transcribed text, or null if transcription failed.
 */
export async function stopAndTranscribe(): Promise<string | null> {
  if (!currentRecording) {
    logger.warn('voice', 'No active recording to stop');
    return null;
  }

  try {
    // Stop the recording
    await currentRecording.stopAndUnloadAsync();
    const uri = currentRecording.getURI();
    currentRecording = null;

    // Reset audio mode (disable recording so playback works normally)
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
      interruptionModeIOS: InterruptionModeIOS.DoNotMix,
    });

    if (!uri) {
      logger.error('voice', 'Recording URI is null');
      return null;
    }

    logger.info('voice', 'Recording stopped, transcribing...');

    // Read audio file as base64
    const base64Audio = await FileSystem.readAsStringAsync(uri, {
      encoding: FileSystem.EncodingType.Base64,
    });

    // Determine MIME type
    const mimeType = Platform.OS === 'android' ? 'audio/mp4' : 'audio/mp4';

    // Send to Whisper Edge Function (JWT verified inside the function)
    const { data, error } = await supabase.functions.invoke('ai-whisper', {
      body: {
        audio_base64: base64Audio,
        mime_type: mimeType,
      },
    });

    if (error) {
      // Extract response body for debugging
      let details = '';
      try {
        if (error.context instanceof Response) {
          details = await error.context.text();
        }
      } catch {
        // ignore
      }
      logger.error('voice', 'Whisper Edge Function error', {
        error: String(error),
        details: details || 'no details',
      });
      return null;
    }

    const transcript = data?.transcript;
    if (!transcript) {
      logger.warn('voice', 'Whisper returned empty transcript');
      return null;
    }

    logger.info('voice', 'Whisper transcription complete', {
      length: transcript.length,
    });

    // Clean up temp file
    try {
      await FileSystem.deleteAsync(uri, { idempotent: true });
    } catch {
      // Ignore cleanup errors
    }

    return transcript;
  } catch (error) {
    logger.error('voice', 'Whisper transcription failed', { error: String(error) });
    currentRecording = null;
    return null;
  }
}

/**
 * Cancel and discard the current recording without transcribing.
 */
export async function cancelRecording(): Promise<void> {
  if (!currentRecording) return;

  try {
    await currentRecording.stopAndUnloadAsync();
    const uri = currentRecording.getURI();
    currentRecording = null;

    await Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
      interruptionModeIOS: InterruptionModeIOS.DoNotMix,
    });

    if (uri) {
      await FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {});
    }
  } catch {
    currentRecording = null;
  }
}

/**
 * Check if currently recording.
 */
export function isCurrentlyRecording(): boolean {
  return currentRecording !== null;
}
