# Apple App Store Connect — App Privacy Guide

> Go to: App Store Connect > Your App > App Privacy
> Fill out each section as described below

---

## Step 1: "Do you or your third-party partners collect data from this app?"

**Answer:** Yes

---

## Step 2: Data Types

For each data type, follow the table below:

### COLLECTED — Data Linked to the User

| Data Type | Collected? | Usage | Linked to User? | Used for Tracking? |
|-----------|-----------|-------|-----------------|-------------------|
| **Email Address** | Yes | App Functionality | Yes | No |
| **Precise Location** | Yes | App Functionality | Yes | No |
| **Coarse Location** | Yes | App Functionality | Yes | No |

### COLLECTED — Data NOT Linked to the User

| Data Type | Collected? | Usage | Linked to User? | Used for Tracking? |
|-----------|-----------|-------|-----------------|-------------------|
| **Crash Data** | Yes | App Functionality | No | No |
| **Performance Data** | Yes | App Functionality | No | No |
| **Audio Data** | Yes | App Functionality | No | No |

### NOT COLLECTED (mark "No" for all of these)

- Name
- Phone Number
- Physical Address
- Other Contact Info
- Health & Fitness Data
- Financial Info
- Payment Info
- Photos or Videos
- Gameplay Content
- Customer Support
- Contacts
- Browsing History
- Search History
- Identifiers (User ID, Device ID)
- Purchases
- Usage Data
- Diagnostics (beyond crash data above)
- Sensitive Info
- Other Data

---

## Step 3: Details for each collected type

### Email Address
- **Usage:** App Functionality
- **Is this data linked to the user's identity?** Yes
- **Is this data used for tracking?** No
- **Collection is required:** Yes (needed for account creation)

### Precise Location
- **Usage:** App Functionality
- **Is this data linked to the user's identity?** Yes
- **Is this data used for tracking?** No
- **Collection is required:** Yes (core geofencing feature)
- **Note:** Location is only used to detect geofence boundary crossings. Not used for advertising or analytics.

### Coarse Location
- **Usage:** App Functionality
- **Is this data linked to the user's identity?** Yes
- **Is this data used for tracking?** No
- **Collection is required:** Yes (map display and geofencing)

### Audio Data
- **Usage:** App Functionality
- **Is this data linked to the user's identity?** No
- **Is this data used for tracking?** No
- **Collection is required:** No (voice commands are optional)
- **Note:** Audio is temporarily recorded for voice command transcription. It is sent to our backend server, transcribed via OpenAI Whisper, and deleted immediately. Audio is never stored permanently.

### Crash Data
- **Usage:** App Functionality
- **Is this data linked to the user's identity?** No
- **Is this data used for tracking?** No
- **Collection is required:** Yes (automatic via Sentry)
- **Note:** Crash reports contain no PII. Email addresses and GPS coordinates are stripped before sending to Sentry.

### Performance Data
- **Usage:** App Functionality
- **Is this data linked to the user's identity?** No
- **Is this data used for tracking?** No
- **Collection is required:** Yes (automatic via Sentry)

---

## Step 4: Review

Before submitting, verify:
- [x] "Data Used to Track You" section is EMPTY (we don't track)
- [x] "Data Linked to You" has: Email, Precise Location, Coarse Location
- [x] "Data Not Linked to You" has: Crash Data, Performance Data, Audio Data
- [x] No data marked as used for "Third-Party Advertising" or "Developer's Advertising"

---

## IMPORTANT NOTES

1. **Audio Data** is listed because voice commands send audio to OpenAI via our backend. Even though audio is deleted immediately, Apple requires disclosure of any data that leaves the device.

2. **Precise Location** must be disclosed even though it's only used for geofencing. Apple considers any GPS coordinate collection as "Precise Location" regardless of purpose.

3. **Crash Data** is sent to Sentry (third party) but is NOT linked to the user because we strip all PII (email, coordinates) before sending via our `beforeSend` sanitizer in `src/lib/sentry.ts`.

4. **Tracking** means using data to link user or device data with third-party data for targeted advertising. We do NOT do this.
