/**
 * Sentry Crash Reporting - OnSite Timekeeper
 *
 * Integrates with existing logger for error-level reporting.
 * Privacy: Masks emails, GPS coordinates before sending.
 *
 * SETUP: Replace SENTRY_DSN with your project DSN from sentry.io
 */

import * as Sentry from '@sentry/react-native';
import Constants from 'expo-constants';

const SENTRY_DSN = 'https://101d5cc3c3e4ebe034eba5d26790a195@o4510846541103104.ingest.us.sentry.io/4510846575706112';

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
        return sanitizeEvent(event);
      },

      // Sample 10% of transactions for performance monitoring
      tracesSampleRate: 0.1,

      // Drop breadcrumbs that might contain PII
      beforeBreadcrumb(breadcrumb) {
        if (breadcrumb.category === 'navigation') return breadcrumb;
        if (breadcrumb.category === 'ui.click') return breadcrumb;
        return null;
      },
    });

    initialized = true;
  } catch {
    // Sentry init failed, continue without crash reporting
  }
}

function sanitizeEvent(event: Sentry.ErrorEvent): Sentry.ErrorEvent {
  // Mask email in user context
  if (event.user?.email) {
    const parts = event.user.email.split('@');
    if (parts.length === 2) {
      event.user.email = `${parts[0][0]}******@${parts[1]}`;
    }
  }

  // Remove exact GPS coordinates from extra data
  if (event.extra) {
    for (const key of Object.keys(event.extra)) {
      const k = key.toLowerCase();
      if (k.includes('lat') || k.includes('lng') || k.includes('longitude') || k.includes('latitude')) {
        event.extra[key] = '[redacted]';
      }
    }
  }

  return event;
}

export function captureException(error: Error, context?: Record<string, unknown>): void {
  if (__DEV__ || !initialized) return;
  Sentry.captureException(error, { extra: context });
}

export function setUser(userId: string): void {
  if (__DEV__ || !initialized) return;
  Sentry.setUser({ id: userId });
}

export function clearUser(): void {
  if (!initialized) return;
  Sentry.setUser(null);
}
