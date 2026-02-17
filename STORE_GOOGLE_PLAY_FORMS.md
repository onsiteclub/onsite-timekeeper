# Google Play Console — Forms & Listing Texts

> Step-by-step guide for filling out all required forms in Google Play Console

---

## 1. STORE LISTING

### Title (max 30 characters)
```
OnSite Timekeeper
```

### Short description (max 80 characters)
```
Track work hours automatically with geofencing. Voice commands & PDF reports.
```

### Full description (max 4000 characters)
```
OnSite Timekeeper is the simplest way to track your work hours on construction sites and job locations.

MANUAL TIME ENTRY
Log your daily entry and exit times with just a few taps. Track breaks, select your job site, and save. It's as simple as writing on a notepad, but smarter.

AUTOMATIC GEOFENCING
Create a virtual boundary around your work site. When you arrive, the app automatically starts tracking. When you leave, it logs your exit time. No more forgetting to clock in.

VOICE COMMANDS
Tap the microphone and say what you need: "Log 8 hours today", "Start timer", "Send my weekly report". The AI assistant understands natural language in English and Portuguese.

CALENDAR & REPORTS
See all your work days on a clean monthly calendar. Tap any day to see the full breakdown. Export professional PDF timesheets for payroll or invoicing.

MULTIPLE JOB SITES
Managing different locations? Create color-coded geofences for each site. The app knows which site you're at and logs accordingly.

OFFLINE FIRST
Your data is stored locally on your device. It syncs securely to the cloud when you're online. You're never blocked by poor connectivity on a job site.

PRIVACY FOCUSED
GPS data is used exclusively for geofencing and is never sold or shared with advertisers. You can delete all your data at any time.

Perfect for: construction workers, contractors, freelancers, field technicians, maintenance crews, and anyone who needs proof of their work hours.

Questions? Contact us at support@onsiteclub.ca
```

### Category
```
Business
```

---

## 2. APP CONTENT > APP ACCESS

**Select:** "All or some functionality is restricted"

**Instructions for reviewer:**
```
Username: test@onsiteclub.ca
Password: Teste123!

How to test:
1. Login with above credentials
2. Home tab: Tap entry/exit times, select location, save
3. Reports tab: View calendar, tap a day with data
4. Map tab: View geofences on map
5. Voice: Tap floating green mic button, say "Log 8 hours today"
6. Geofencing requires a physical device — it won't work on emulator
```

---

## 3. DATA SAFETY FORM

> Go to: Play Console > App Content > Data safety

### Does your app collect or share any of the required user data types?
**Yes**

### Is all of the user data collected by your app encrypted in transit?
**Yes**

### Do you provide a way for users to request that their data is deleted?
**Yes** (user can delete account and all associated data)

### Data Types Collected:

#### Location > Precise location
- **Collected:** Yes
- **Shared:** No
- **Ephemeral:** No
- **Required:** Yes
- **Purpose:** App functionality (geofencing for automatic time tracking)

#### Location > Approximate location
- **Collected:** Yes
- **Shared:** No
- **Ephemeral:** No
- **Required:** Yes
- **Purpose:** App functionality

#### Audio > Voice or sound recordings
- **Collected:** Yes
- **Shared:** Yes (sent to OpenAI for transcription)
- **Ephemeral:** Yes (deleted immediately after processing)
- **Required:** No (voice commands are optional)
- **Purpose:** App functionality (voice command processing)

#### App activity > App interactions
- **Collected:** Yes
- **Shared:** No
- **Ephemeral:** No
- **Required:** Yes
- **Purpose:** Analytics (local only, not shared)

#### App info and performance > Crash logs
- **Collected:** Yes
- **Shared:** Yes (sent to Sentry for crash reporting)
- **Ephemeral:** No
- **Required:** Yes (automatic)
- **Purpose:** App functionality (bug fixing)

#### App info and performance > Diagnostics
- **Collected:** Yes
- **Shared:** Yes (sent to Sentry)
- **Ephemeral:** No
- **Required:** Yes (automatic)
- **Purpose:** App functionality

#### Personal info > Email address
- **Collected:** Yes
- **Shared:** No
- **Ephemeral:** No
- **Required:** Yes (for account creation)
- **Purpose:** Account management

### Data NOT collected (mark "No" for these):
- Name
- Phone number
- Address
- Financial info (credit card, bank, etc.)
- Health info
- Messages / SMS
- Photos or videos
- Files and docs
- Calendar
- Contacts
- Web browsing history
- Device or other IDs (advertising ID, IMEI, etc.)

---

## 4. APP CONTENT > SENSITIVE PERMISSIONS

### Background Location

**Type of use:** Geofencing

**Justification (paste this):**
```
OnSite Timekeeper is a workforce time-tracking app for construction workers.
Background location is required for geofence-based automatic time tracking.

The app creates geofence boundaries around registered work sites. When the
user physically enters or exits a geofence, the app automatically logs their
arrival/departure time to their daily timesheet.

This must work when the app is in the background because construction workers
arrive at job sites with the app closed. Without background location, the
geofence entry event would not fire, defeating the app's core purpose.

The app shows a prominent in-app disclosure explaining background location
usage BEFORE the system permission dialog, with options to accept or decline.

Location data is:
- Stored locally on device (SQLite) and synced to our backend (Supabase)
- Used exclusively for geofencing and audit trail
- Never shared with third parties or advertisers
- Deletable by the user at any time
```

**Video:** Record a ~30 second video showing:
1. App opens > Login screen
2. Location disclosure modal appears (after login)
3. User taps "Enable Location Access"
4. System permission dialog appears
5. User grants "Always Allow"
6. Map tab shows geofences working

---

## 5. BATTERY OPTIMIZATION EXEMPTION

**Justification (if questioned by Google):**
```
OnSite Timekeeper requires exemption from battery optimization because its
core feature - geofence-based automatic time tracking - depends on receiving
location events when the app is in the background. Without this exemption,
the Android OS may kill the geofence monitoring service, causing missed
clock-in/clock-out events for construction workers.

The app already uses battery-efficient region monitoring (not continuous GPS
tracking). Battery optimization kills the background service entirely,
preventing any geofence events from firing.
```

---

## 6. APP CONTENT > TARGET AUDIENCE AND CONTENT

- **Target age group:** 18 and over
- **Does your app appeal to children?** No
- **Does your app contain ads?** No

---

## 7. CONTENT RATING QUESTIONNAIRE

- **Violence:** None
- **Sexual content:** None
- **Language:** None
- **Controlled substances:** None
- **User interaction:** Users cannot interact with each other
- **Users can share their location:** Yes (location is collected but NOT shared with other users)
- **Does the app share user location data with third parties?** No

Expected rating: **Everyone (E)**

---

## 8. PRIVACY POLICY

**URL:** `https://timekeeperweb.onsiteclub.ca/privacy`
