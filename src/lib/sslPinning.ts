/**
 * SSL Pinning - OnSite Timekeeper
 *
 * Layer 1: JS-level domain validation for all Supabase requests.
 * Prevents MITM via DNS hijacking by ensuring requests only go to
 * the expected Supabase host.
 *
 * Layer 2: Android network_security_config.xml via config plugin
 * (see plugins/withSSLPinning.js) — blocks cleartext, enforces HTTPS.
 *
 * NOTE: True certificate pinning (SPKI hash comparison) requires
 * native TLS delegate hooks. This JS layer covers domain-level validation.
 * Native pinning is a TODO for Phase 2.
 */

import { logger } from './logger';
import { captureMessage } from './sentry';

// ============================================
// ALLOWED HOSTS
// ============================================

/** Supabase project host — the ONLY domain the app should talk to */
const SUPABASE_HOST = 'bjkhofdrzpczgnwxoauk.supabase.co';

/** Hosts allowed for non-Supabase requests (maps tiles, Sentry, etc.) */
const ALLOWED_EXTERNAL_HOSTS = [
  // Google Maps tiles
  'maps.googleapis.com',
  'maps.google.com',
  'khms0.googleapis.com',
  'khms1.googleapis.com',
  // Sentry error reporting
  'sentry.io',
  'o4509154101993472.ingest.us.sentry.io',
  // Expo updates (if applicable)
  'expo.dev',
  'u.expo.dev',
  // Transistorsoft license validation
  'transistorsoft.com',
];

// ============================================
// DOMAIN VALIDATION
// ============================================

/**
 * Check if a URL targets an allowed host.
 * Returns true if the URL is safe to fetch.
 */
export function isAllowedHost(url: string): boolean {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();

    // Must be HTTPS (except localhost in dev)
    if (parsed.protocol !== 'https:') {
      if (__DEV__ && (host === 'localhost' || host === '127.0.0.1' || host === '10.0.2.2')) {
        return true; // Allow local dev server
      }
      return false;
    }

    // Check Supabase host
    if (host === SUPABASE_HOST) return true;

    // Check allowed external hosts
    if (ALLOWED_EXTERNAL_HOSTS.some(allowed => host === allowed || host.endsWith('.' + allowed))) {
      return true;
    }

    return false;
  } catch {
    // Malformed URL
    return false;
  }
}

/**
 * Validate that a Supabase URL points to the expected host.
 * Use this before making Supabase API calls.
 */
export function validateSupabaseUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.hostname.toLowerCase() === SUPABASE_HOST && parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

// ============================================
// FETCH INTERCEPTOR
// ============================================

let interceptorInstalled = false;
let originalFetch: typeof globalThis.fetch | null = null;

/**
 * Install a global fetch interceptor that validates request domains.
 * Blocks requests to unexpected hosts (defense against MITM redirects).
 *
 * Call once during app bootstrap (before any network calls).
 * Safe to call multiple times — only installs once.
 */
export function installFetchInterceptor(): void {
  if (interceptorInstalled) return;

  originalFetch = globalThis.fetch;

  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string'
      ? input
      : input instanceof URL
        ? input.toString()
        : (input as Request).url;

    // Skip validation for relative URLs (React Native bundler, etc.)
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      return originalFetch!(input, init);
    }

    if (!isAllowedHost(url)) {
      const hostInfo = (() => {
        try { return new URL(url).hostname; } catch { return 'unknown'; }
      })();

      logger.error('boot', 'Blocked fetch to unauthorized host', {
        host: hostInfo,
      });

      // In dev, warn but allow (for debugging tools, HMR, etc.)
      if (__DEV__) {
        console.warn(`[SSL Pinning] Request to unauthorized host: ${hostInfo} — allowing in dev mode`);
        return originalFetch!(input, init);
      }

      // Report to Sentry for security monitoring
      captureMessage('SSL Pinning: unauthorized host blocked', {
        level: 'warning',
        tags: { security: 'ssl-pinning' },
        extra: { host: hostInfo },
      });

      // In production, block the request
      throw new Error(`[SSL Pinning] Request blocked: unauthorized host`);
    }

    return originalFetch!(input, init);
  };

  interceptorInstalled = true;
  logger.info('boot', 'Fetch interceptor installed');
}

/**
 * Remove the fetch interceptor (for testing or cleanup).
 */
export function removeFetchInterceptor(): void {
  if (originalFetch) {
    globalThis.fetch = originalFetch;
    originalFetch = null;
    interceptorInstalled = false;
  }
}
