/**
 * Permission Strings - OnSite Timekeeper
 *
 * Centralized permission texts for Google Play Store, Apple App Store,
 * prominent disclosure, and rationale dialogs.
 *
 * Keep ALL user-facing permission copy here so Play Store reviews
 * and future updates only touch one file.
 *
 * IMPORTANT: Avoid terms that signal employee surveillance:
 *   - NO: "job site", "work site", "geofence", "clock in/out",
 *         "timesheets", "work hours", "workers", "employees"
 *   - YES: "saved locations", "location zones", "time logging",
 *          "personal records", "teammates"
 */

export const PERMISSION_STRINGS = {
  // ============================================
  // PROMINENT DISCLOSURE (Google Play requirement)
  // Must appear BEFORE native background location prompt.
  // ============================================
  prominentDisclosure: {
    title: 'Background Location',
    body:
      'Timekeeper uses your location in the background to automatically record your hours ' +
      'when you arrive at or leave your saved locations.\n\n' +
      'No routes or movement data are stored or shared.',
    accept: 'I understand',
    decline: 'Skip',
  },

  // ============================================
  // RATIONALE DIALOGS
  // Shown when user denies a permission and the OS says
  // "you should show a rationale" (shouldShowRequestPermissionRationale).
  // ============================================
  rationale: {
    foregroundLocation:
      'Shows your position on the map when you set up a location zone.',

    backgroundLocation:
      'Automatically records your hours when you arrive at or leave your saved locations ' +
      '\u2014 even when the app is closed.\n\n' +
      'Without this, you can still log hours manually.',

  },

  // ============================================
  // RATIONALE TITLES
  // ============================================
  rationaleTitle: {
    foregroundLocation: 'Location Permission',
    backgroundLocation: 'Background Location',
  },

  // ============================================
  // iOS PURPOSE STRINGS (reference — actual values in app.json)
  // ============================================
  ios: {
    NSLocationWhenInUseUsageDescription:
      'Shows your position on the map when you set up a location zone.',
    NSLocationAlwaysAndWhenInUseUsageDescription:
      'Automatically records your time when you arrive at or leave your saved locations, even when the app is closed. All data stays on your device.',
    NSLocationAlwaysUsageDescription:
      'Records your arrival and departure times at saved locations in the background. All data stays on your device.',
  },
} as const;
