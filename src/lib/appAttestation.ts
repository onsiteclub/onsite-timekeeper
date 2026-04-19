/**
 * App Attestation - OnSite Timekeeper
 *
 * Phase 1 (current): Basic device/app identity headers sent with every
 * Supabase request. No native SDK — uses Expo APIs only.
 *
 * Phase 2 (TODO): Apple App Attest (DeviceCheck framework)
 *   - Generate attestation key pair on first launch
 *   - Attest the key with Apple servers
 *   - Sign assertions for each API call
 *   - Verify on Supabase Edge Function
 *   - Requires: expo-device-attestation or bare native module
 *
 * Phase 3 (TODO): Google Play Integrity API
 *   - Request integrity verdict token per session
 *   - Send token to Supabase Edge Function for verification
 *   - Verify device, app, and license integrity
 *   - Requires: @react-native-google/play-integrity or bare native module
 *
 * These headers make it harder (not impossible) for non-app clients
 * to call the API. Real protection comes in Phase 2/3.
 */

import { Platform } from 'react-native';
import * as Application from 'expo-application';
import * as Device from 'expo-device';
import Constants from 'expo-constants';

// ============================================
// TYPES
// ============================================

/** Headers sent with every Supabase request for basic app identity */
export type AttestationHeaders = Record<string, string>;

// ============================================
// HEADER GENERATION
// ============================================

/**
 * Build attestation headers to include with Supabase requests.
 *
 * These are static per app session — compute once and reuse.
 * The Supabase client sends them automatically via global.headers.
 */
export function getAttestationHeaders(): AttestationHeaders {
  const appVersion = Application.nativeApplicationVersion || Constants.expoConfig?.version || 'unknown';
  const buildNumber = Application.nativeBuildVersion || '0';
  const bundleId = Application.applicationId || Constants.expoConfig?.ios?.bundleIdentifier || 'unknown';

  return {
    'X-App-Platform': Platform.OS,
    'X-App-Version': appVersion,
    'X-App-Build': buildNumber,
    'X-App-Bundle': bundleId,
    'X-Device-OS-Version': `${Platform.OS} ${Platform.Version}`,
    'X-Device-Brand': Device.brand || 'unknown',
    'X-Device-IsPhysical': String(Device.isDevice),
    // TODO Phase 2: Add Apple App Attest assertion
    // 'X-Apple-Attestation': await getAppleAttestation(),
    // TODO Phase 3: Add Google Play Integrity token
    // 'X-Play-Integrity': await getPlayIntegrityToken(),
  };
}

// ============================================
// PHASE 2 STUBS (Apple App Attest)
// ============================================

/**
 * TODO Phase 2: Apple App Attest
 *
 * Implementation steps:
 * 1. Check DCAppAttestService.shared.isSupported (iOS 14+)
 * 2. generateKey() → store keyId in Keychain
 * 3. attestKey(keyId, clientDataHash) → send attestation to server
 * 4. generateAssertion(keyId, clientDataHash) → per-request assertion
 * 5. Server verifies via Apple's attestation verification endpoint
 *
 * Requires native module — either:
 *   - expo-device-attestation (when available)
 *   - Custom bare native module using DCAppAttestService
 *
 * @returns Attestation assertion string (base64)
 */
// async function getAppleAttestation(): Promise<string> {
//   if (Platform.OS !== 'ios') return '';
//   // TODO: Implement with native module
//   return '';
// }

// ============================================
// PHASE 3 STUBS (Google Play Integrity)
// ============================================

/**
 * TODO Phase 3: Google Play Integrity API
 *
 * Implementation steps:
 * 1. Create IntegrityManager via Play Core library
 * 2. requestIntegrityToken(nonce) → integrity token
 * 3. Send token to Supabase Edge Function for decryption + verification
 * 4. Server calls Google Play servers to decode verdict
 * 5. Verdict includes: device integrity, app integrity, license status
 *
 * Requires native module — either:
 *   - @react-native-google/play-integrity
 *   - Custom bare native module using com.google.android.play:integrity
 *
 * Important: Nonce must be server-generated to prevent replay attacks.
 *
 * @returns Play Integrity token string
 */
// async function getPlayIntegrityToken(): Promise<string> {
//   if (Platform.OS !== 'android') return '';
//   // TODO: Implement with native module
//   return '';
// }

