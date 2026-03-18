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
    title: 'Location Access',
    body:
      'Timekeeper uses your location in the background, even when the app is closed, ' +
      'to detect when you arrive at or leave your saved locations and automatically ' +
      'record your time.\n\n' +
      'Your location is used only for arrival and departure detection. No coordinates, ' +
      'routes, or movement data are stored or shared with any third party.',
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
      'Timekeeper uses your location to show your position on the map when setting ' +
      'up location zones. For example, when you add a new location, your current ' +
      'position helps you place the zone accurately.',

    backgroundLocation:
      'Background location allows Timekeeper to log your hours automatically ' +
      'when you arrive at or leave your saved locations \u2014 even when the app is closed. ' +
      'For example, if you visit a saved location, your start time is recorded for you.\n\n' +
      'Without this, you can still log your hours manually anytime.',

    // Camera rationale kept for QRCodeScanner.tsx (Crew tab hidden, not deleted)
    camera:
      'Timekeeper uses the camera to scan QR codes when connecting with teammates. ' +
      'For example, you scan a teammate\u2019s QR code to link accounts and share time entries.',

    microphone:
      'Timekeeper uses the microphone for voice commands so you can manage time ' +
      'logging hands-free. For example, you can say \u2018start timer\u2019 when your hands ' +
      'are busy without touching your phone.',
  },

  // ============================================
  // RATIONALE TITLES
  // ============================================
  rationaleTitle: {
    foregroundLocation: 'Location Permission',
    backgroundLocation: 'Background Location',
    camera: 'Camera Permission',
    microphone: 'Microphone Permission',
  },

  // ============================================
  // iOS PURPOSE STRINGS (reference — actual values in app.json)
  // ============================================
  ios: {
    NSLocationWhenInUseUsageDescription:
      'Your location is used to show your position on the map when you set up a location zone. ' +
      'For example, when you open the Locations tab, the map centers on your current position so you can easily define a zone where you want automatic time logging.',
    NSLocationAlwaysAndWhenInUseUsageDescription:
      'Your location is used in the background to automatically record your time at saved locations. ' +
      'For example, when you arrive at a location you previously saved, your arrival time is recorded automatically. ' +
      'When you leave, your departure is logged. This saves you from having to remember to start and stop a timer manually. All data stays on your device and is never shared.',
    NSLocationAlwaysUsageDescription:
      'Your location is used in the background to detect when you enter or leave your saved locations, even when the app is not open. ' +
      'For example, if you visit a saved location, the app records your arrival time automatically. ' +
      'When you leave, your departure time is logged. All data is stored locally on your device for your personal records only.',
    NSMicrophoneUsageDescription:
      'The microphone is used for voice commands so you can manage time logging hands-free. ' +
      'For example, you can say \u2018start timer\u2019 when your hands are busy to begin logging time without touching your phone.',
  },
} as const;
