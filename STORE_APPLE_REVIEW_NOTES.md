# Apple App Store Connect — Review Notes

> Copy-paste the text below into App Store Connect > App Review Information > Notes

---

## REVIEW NOTES (paste this entire block)

```
BACKGROUND LOCATION JUSTIFICATION:

OnSite Timekeeper is a workforce time-tracking app for construction workers.
It uses background location EXCLUSIVELY for geofencing — detecting when the
user physically arrives at or leaves a registered work site.

How it works:
1. User creates a work site (geofence) on the Map tab with a name and radius
2. When the user enters or exits that geofence, the app automatically logs
   entry/exit time to their daily timesheet
3. This eliminates the need for manual clock-in/clock-out
4. Background location is ONLY active when the user has at least one active
   geofence configured
5. No continuous GPS tracking — we use region monitoring (geofencing), which
   is battery-efficient and only triggers on boundary crossings

Why "Always" permission is required:
- Construction workers arrive at job sites with the app closed/backgrounded
- The geofence entry event MUST fire even when the app is not in foreground
- Without "Always", the app cannot detect arrival at the work site
- This is the core value proposition for the user

A prominent disclosure modal is shown to the user BEFORE the native permission
dialog, explaining background location usage and linking to our privacy policy.

Data handling:
- GPS coordinates are stored locally (SQLite) and synced to our backend
  (Supabase) for audit trail purposes only
- Coordinates are never shared with third parties or advertisers
- User can delete all location data at any time

---

VOICE COMMANDS / MICROPHONE USAGE:

The app includes a voice assistant accessible via a floating microphone button.
When the user taps the button, audio is recorded and sent to our Supabase
Edge Function backend, which forwards it to OpenAI Whisper API for transcription.

The transcript is then processed by OpenAI GPT-4o to interpret the command
(e.g., "log 8 hours today", "start timer", "send weekly report").

IMPORTANT:
- Audio is NEVER stored permanently — it is deleted immediately after transcription
- Only the text transcript is kept (temporarily, for command execution)
- The user must explicitly tap the microphone button to start recording
- A clear visual indicator (red pulsing button) shows when recording is active
- The user can stop recording at any time
- Microphone permission is requested only when the user first taps the mic button

---

CAMERA USAGE:

The app uses the camera exclusively for scanning QR codes in the Team tab.
QR codes are used for device-linking (sharing access between worker and manager).
No photos or videos are captured or stored.

---

HOW TO TEST OnSite Timekeeper:

1. LOGIN
   - Open the app > Login screen appears
   - Use: test@onsiteclub.ca / Teste123!
   - You will be taken to the Home screen

2. MANUAL TIME ENTRY (core feature)
   - On Home tab, tap "Entry" time field > set time
   - Tap "Exit" time field > set time
   - Select a location from the horizontal cards
   - Tap "Save" > Entry appears in the calendar
   - Go to Reports tab to see the calendar with your entry

3. GEOFENCING (background location feature)
   - Go to Map tab
   - Tap "+" to create a new geofence
   - Name it "Test Site", set radius to 200m
   - Place it on your current location
   - NOTE: Geofencing requires a physical device with GPS.
     It will not work in the simulator.

4. VOICE COMMANDS (microphone feature)
   - Tap the green floating microphone button (bottom-right)
   - A chat sheet slides up
   - Say "Log 8 hours today" or "Start timer"
   - The app transcribes your voice and executes the command
   - You can also type commands in the text field

5. QR CODE SCANNER (camera feature)
   - Go to Team tab
   - Tap "Link Device" to open the QR scanner

6. REPORTS
   - Go to Reports tab
   - Tap any day with entries to see details
   - Use export to generate PDF timesheet
```

---

## APP REVIEW INFORMATION — Other Fields

| Field | Value |
|-------|-------|
| **Demo Account Username** | `test@onsiteclub.ca` |
| **Demo Account Password** | `Teste123!` |
| **Contact Email** | `support@onsiteclub.ca` |
| **Support URL** | `https://timekeeperweb.onsiteclub.ca` |
| **Privacy Policy URL** | `https://timekeeperweb.onsiteclub.ca/privacy` |

---

## APP STORE LISTING TEXT

### Name
```
OnSite Timekeeper
```

### Subtitle (max 30 characters)
```
Work Hours & Job Site Tracker
```

### Category
```
Primary: Business
Secondary: Productivity
```

### Keywords (max 100 characters)
```
timesheet,time tracker,geofence,work hours,clock in,construction,job site,ponto,horas
```

### Description
```
OnSite Timekeeper is the easiest way to track your work hours on construction sites and job locations.

SIMPLE TIME TRACKING
- Log your daily hours with just a few taps
- Set entry and exit times manually
- Track break time separately
- View your work history on a clean calendar
- Export professional PDF timesheets

AUTOMATIC GEOFENCING
- Create geofence zones around your job sites
- The app automatically detects when you arrive and leave
- No more forgetting to clock in or out
- Works in the background, even when your phone is locked
- Battery-efficient region monitoring (not constant GPS tracking)

VOICE COMMANDS
- Tap the microphone button to speak commands
- "Log 8 hours today" - done in seconds
- "Start timer" / "Stop timer" - hands-free control
- Works in English and Portuguese
- AI-powered natural language understanding

REPORTS & EXPORT
- Monthly calendar view with daily summaries
- Detailed breakdown per day (entry, exit, breaks, total)
- Export to PDF for payroll or invoicing
- Share reports via email or messaging apps

MULTIPLE JOB SITES
- Track hours across different locations
- Color-coded sites for easy identification
- Map view to manage all your geofences

PRIVACY FIRST
- Your data stays on your device (offline-first)
- Syncs securely when online
- GPS data used only for geofencing, never sold or shared
- Delete your data anytime

Built for construction workers, contractors, freelancers, and anyone who needs reliable proof of their work hours.
```

### What's New (v1.6.2)
```
- Simplified logs screen for easier navigation
- Performance improvements and bug fixes
```
