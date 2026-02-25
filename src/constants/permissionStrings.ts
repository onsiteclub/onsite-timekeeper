/**
 * Permission Strings - OnSite Timekeeper
 *
 * Centralized permission texts for Google Play Store, Apple App Store,
 * prominent disclosure, and rationale dialogs.
 *
 * Keep ALL user-facing permission copy here so Play Store reviews
 * and future updates only touch one file.
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
      'to detect when you arrive at or leave your job sites and automatically log ' +
      'your work hours.\n\n' +
      'Your location is used only for geofence detection. No coordinates, routes, ' +
      'or movement data are stored or shared with any third party.',
    accept: 'I understand',
    decline: 'Not now',
  },

  // ============================================
  // RATIONALE DIALOGS
  // Shown when user denies a permission and the OS says
  // "you should show a rationale" (shouldShowRequestPermissionRationale).
  // ============================================
  rationale: {
    foregroundLocation:
      'Timekeeper needs your location to show your position on the map when setting ' +
      'up job site geofences. For example, when you add a new job site, your current ' +
      'location helps you place the geofence accurately.',

    backgroundLocation:
      'Timekeeper needs background location access to automatically clock you in and ' +
      'out when you arrive at or leave your job sites \u2014 even when the app is closed. ' +
      'For example, if you drive to a job site, your hours are logged automatically.\n\n' +
      'Without this permission, you\u2019ll need to clock in and out manually.',

    camera:
      'Timekeeper needs camera access to scan QR codes when connecting with other ' +
      'workers through Team Crew. For example, you scan a fellow contractor\u2019s QR ' +
      'code to link accounts and share time entries.',

    microphone:
      'Timekeeper needs microphone access for voice commands so you can manage time ' +
      'tracking hands-free. For example, you can say \u2018clock in\u2019 when you arrive at ' +
      'a job site without touching your phone.',
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
      'Your location is used to show your position on the map when setting up job site geofences. ' +
      'For example, when you add a new job site, your current location helps you place the geofence accurately.',
    NSLocationAlwaysAndWhenInUseUsageDescription:
      'Your location is used to detect when you arrive at or leave your job sites, so your work hours are logged automatically. ' +
      'For example, when you arrive at a saved job site, your start time is recorded without any manual input.',
    NSLocationAlwaysUsageDescription:
      'Your location is used in the background to detect when you enter or leave a job site geofence. ' +
      'For example, if you drive to a job site, your hours are logged automatically \u2014 even if the app is not open.',
    NSMicrophoneUsageDescription:
      'The microphone is used for voice commands so you can manage time tracking hands-free. ' +
      'For example, you can say \u2018clock in\u2019 when you arrive at a job site without touching your phone.',
    NSCameraUsageDescription:
      'The camera is used to scan QR codes when connecting with other workers through Team Crew. ' +
      'For example, you scan a fellow contractor\u2019s QR code to link accounts and share time entries.',
  },
} as const;
