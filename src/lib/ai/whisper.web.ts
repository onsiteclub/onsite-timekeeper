/**
 * Whisper Transcription Client - OnSite Timekeeper (Web)
 *
 * Uses Web MediaRecorder API instead of expo-av (which doesn't support
 * audio recording on web). Records audio as webm, converts to base64,
 * and sends to the ai-whisper Edge Function.
 */

import { supabase } from '../supabase';
import { logger } from '../logger';

let mediaRecorder: MediaRecorder | null = null;
let audioChunks: Blob[] = [];
let stream: MediaStream | null = null;

/**
 * Request microphone permission and start recording audio.
 */
export async function startRecording(): Promise<boolean> {
  try {
    // Check for MediaRecorder support
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      logger.warn('voice', 'MediaRecorder API not available in this browser');
      return false;
    }

    // Request microphone access
    stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        sampleRate: 16000,
      },
    });

    // Determine supported MIME type
    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : MediaRecorder.isTypeSupported('audio/webm')
        ? 'audio/webm'
        : 'audio/ogg';

    audioChunks = [];
    mediaRecorder = new MediaRecorder(stream, { mimeType });

    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        audioChunks.push(event.data);
      }
    };

    mediaRecorder.start(250); // Collect data every 250ms
    logger.info('voice', 'Web recording started', { mimeType });
    return true;
  } catch (error) {
    logger.error('voice', 'Failed to start web recording', { error: String(error) });
    cleanup();
    return false;
  }
}

/**
 * Stop recording and transcribe the audio via Whisper API.
 */
export async function stopAndTranscribe(): Promise<string | null> {
  if (!mediaRecorder || mediaRecorder.state === 'inactive') {
    logger.warn('voice', 'No active web recording to stop');
    return null;
  }

  try {
    // Stop recording and wait for all data
    const audioBlob = await new Promise<Blob>((resolve) => {
      if (!mediaRecorder) {
        resolve(new Blob());
        return;
      }

      mediaRecorder.onstop = () => {
        const mimeType = mediaRecorder?.mimeType || 'audio/webm';
        const blob = new Blob(audioChunks, { type: mimeType });
        resolve(blob);
      };

      mediaRecorder.stop();
    });

    // Stop all tracks
    cleanup();

    if (audioBlob.size === 0) {
      logger.error('voice', 'Web recording produced empty audio');
      return null;
    }

    logger.info('voice', 'Web recording stopped, transcribing...', {
      size: audioBlob.size,
      type: audioBlob.type,
    });

    // Convert blob to base64
    const base64Audio = await blobToBase64(audioBlob);

    // Send to Whisper Edge Function
    const { data, error } = await supabase.functions.invoke('ai-whisper', {
      body: {
        audio_base64: base64Audio,
        mime_type: audioBlob.type || 'audio/webm',
      },
    });

    if (error) {
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
      console.error('[OnSite Web] Whisper error:', error, details);
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

    return transcript;
  } catch (error) {
    logger.error('voice', 'Web whisper transcription failed', { error: String(error) });
    console.error('[OnSite Web] Whisper transcription failed:', error);
    cleanup();
    return null;
  }
}

/**
 * Cancel and discard the current recording.
 */
export async function cancelRecording(): Promise<void> {
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    try {
      mediaRecorder.stop();
    } catch {
      // ignore
    }
  }
  cleanup();
}

/**
 * Check if currently recording.
 */
export function isCurrentlyRecording(): boolean {
  return mediaRecorder !== null && mediaRecorder.state === 'recording';
}

// ============================================
// HELPERS
// ============================================

function cleanup(): void {
  if (stream) {
    stream.getTracks().forEach(track => track.stop());
    stream = null;
  }
  mediaRecorder = null;
  audioChunks = [];
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      // Remove data URL prefix (e.g., "data:audio/webm;base64,")
      const base64 = result.split(',')[1] || result;
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
