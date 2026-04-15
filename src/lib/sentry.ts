/**
 * Sentry Crash Reporting - OnSite Timekeeper
 *
 * Integrates with existing logger for error-level reporting.
 * Privacy: Masks emails, GPS coordinates before sending.
 *
 * SOURCE MAPS: Uploaded automatically via @sentry/react-native/expo plugin during EAS build.
 * Requires SENTRY_AUTH_TOKEN in EAS secrets:
 *   eas secret:create --name SENTRY_AUTH_TOKEN --value <token>
 * Get token: Sentry Dashboard → Settings → Auth Tokens → Create (scopes: project:releases, org:read)
 */

import * as Sentry from '@sentry/react-native';
import Constants from 'expo-constants';

const SENTRY_DSN = 'https://101d5cc3c3e4ebe034eba5d26790a195@o4510846541103104.ingest.us.sentry.io/4510846575706112';

// Allowed breadcrumb categories (PII-safe custom categories + defaults)
const ALLOWED_BREADCRUMB_CATEGORIES = new Set([
  'navigation',
  'ui.click',
  'geofence',
  'sync',
  'invoice',
]);

let initialized = false;

export function initSentry(): void {
  if (__DEV__) return; // Don't send in development
  if (initialized) return;

  try {
    Sentry.init({
      dsn: SENTRY_DSN,
      environment: 'production',
      release: Constants.expoConfig?.version || '1.0.0',

      // Privacy: Strip PII before sending
      beforeSend(event) {
        return sanitizeEvent(event) as typeof event | null;
      },

      // Sample 10% of transactions for performance monitoring
      tracesSampleRate: 0.1,

      // Only allow PII-safe breadcrumb categories
      beforeBreadcrumb(breadcrumb) {
        if (breadcrumb.category && ALLOWED_BREADCRUMB_CATEGORIES.has(breadcrumb.category)) {
          return breadcrumb;
        }
        return null;
      },
    });

    initialized = true;
  } catch {
    // Sentry init failed, continue without crash reporting
  }
}

// Keys that may contain PII in event.extra
const GPS_KEYS = ['lat', 'lng', 'longitude', 'latitude', 'coord'];
const MONEY_KEYS = ['amount', 'total', 'subtotal', 'price', 'rate', 'cost'];
const IDENTITY_KEYS = ['client_name', 'clientname', 'name', 'phone', 'address', 'street', 'email'];

function sanitizeEvent(event: Sentry.Event): Sentry.Event | null {
  // Mask email in user context
  if (event.user?.email) {
    const parts = event.user.email.split('@');
    if (parts.length === 2) {
      event.user.email = `${parts[0][0]}******@${parts[1]}`;
    }
  }

  // Scrub PII from extra data
  if (event.extra) {
    for (const key of Object.keys(event.extra)) {
      const k = key.toLowerCase();

      // GPS coordinates
      if (GPS_KEYS.some(gk => k.includes(gk))) {
        event.extra[key] = '[redacted]';
        continue;
      }

      // Dollar amounts / financial
      if (MONEY_KEYS.some(mk => k.includes(mk))) {
        event.extra[key] = '[redacted]';
        continue;
      }

      // Client names, phone, address, email
      if (IDENTITY_KEYS.some(ik => k.includes(ik))) {
        event.extra[key] = '[redacted]';
        continue;
      }

      // Scrub inline emails and phone numbers from string values
      if (typeof event.extra[key] === 'string') {
        const val = event.extra[key] as string;
        event.extra[key] = val
          .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[email]')
          .replace(/(\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g, '[phone]');
      }
    }
  }

  return event;
}

export function captureException(error: Error, context?: Record<string, unknown>): void {
  if (__DEV__ || !initialized) return;
  Sentry.captureException(error, { extra: context });
}

export function captureMessage(
  message: string,
  options?: { level?: Sentry.SeverityLevel; tags?: Record<string, string>; extra?: Record<string, unknown> },
): void {
  if (__DEV__ || !initialized) return;
  Sentry.captureMessage(message, {
    level: options?.level ?? 'info',
    tags: options?.tags,
    extra: options?.extra,
  });
}

export function setUser(userId: string): void {
  if (__DEV__ || !initialized) return;
  Sentry.setUser({ id: userId });
}

export function clearUser(): void {
  if (!initialized) return;
  Sentry.setUser(null);
}

// ============================================
// CONTEXT & BREADCRUMBS
// ============================================

/**
 * Sets Sentry tags for the current screen and optional business context.
 * Call this on screen mount or when entering a critical flow.
 */
export function setSentryContext(screen: string, extras?: Record<string, string>): void {
  if (__DEV__ || !initialized) return;
  Sentry.setTag('screen', screen);
  Sentry.setTag('app_version', Constants.expoConfig?.version ?? 'unknown');
  if (extras) {
    Object.entries(extras).forEach(([key, value]) => Sentry.setTag(key, value));
  }
}

/**
 * Adds a breadcrumb for a key business action.
 * Use sparingly — only for actions that help debug errors.
 */
export function addSentryBreadcrumb(
  category: string,
  message: string,
  data?: Record<string, string | number | boolean>
): void {
  if (__DEV__ || !initialized) return;
  Sentry.addBreadcrumb({
    category,
    message,
    data,
    level: 'info',
  });
}
