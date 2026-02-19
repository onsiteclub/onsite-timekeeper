# OnSite Timekeeper - Legal Content Update Directive

> **Purpose**: This document contains (1) an AI agent directive with exact instructions for fixing broken links and updating legal content across the codebase, and (2) the complete, store-compliant Privacy Policy and Terms of Service content.

---

## PART 1: AI AGENT DIRECTIVE

### Context

OnSite Timekeeper is a React Native (Expo) mobile app for work hour tracking with GPS geofencing. The app has **broken legal URLs** and **outdated in-app legal content** that must be fixed before Apple App Store and Google Play submission.

### 1.1 - Fix Broken URLs (6 locations in 3 files)

The app currently uses URLs that return **404**. The correct URLs on the live website are:

| Purpose | WRONG URL (current in code) | CORRECT URL |
|---|---|---|
| Privacy Policy | `https://onsiteclub.ca/legal/timekeeper/privacy.html` | `https://www.onsiteclub.ca/legal/timekeeper-privacy` |
| Terms of Service | `https://onsiteclub.ca/legal/timekeeper/terms.html` | `https://www.onsiteclub.ca/legal/timekeeper-terms` |
| Privacy (Disclosure Modal) | `https://timekeeperweb.onsiteclub.ca/privacy` | `https://www.onsiteclub.ca/legal/timekeeper-privacy` |

**Files to modify:**

#### File 1: `app/legal.tsx`
- **Line 21**: Change `PRIVACY_URL` from `'https://onsiteclub.ca/legal/timekeeper/privacy.html'` to `'https://www.onsiteclub.ca/legal/timekeeper-privacy'`
- **Line 22**: Change `TERMS_URL` from `'https://onsiteclub.ca/legal/timekeeper/terms.html'` to `'https://www.onsiteclub.ca/legal/timekeeper-terms'`

#### File 2: `src/components/auth/SignupStep.tsx`
- **Line 92**: Change `'https://onsiteclub.ca/legal/timekeeper/terms.html'` to `'https://www.onsiteclub.ca/legal/timekeeper-terms'`
- **Line 96**: Change `'https://onsiteclub.ca/legal/timekeeper/privacy.html'` to `'https://www.onsiteclub.ca/legal/timekeeper-privacy'`

#### File 3: `app/(tabs)/settings.tsx`
- **Line 389**: Change `'https://onsiteclub.ca/legal/timekeeper/privacy.html'` to `'https://www.onsiteclub.ca/legal/timekeeper-privacy'`
- **Line 399**: Change `'https://onsiteclub.ca/legal/timekeeper/terms.html'` to `'https://www.onsiteclub.ca/legal/timekeeper-terms'`

#### File 4: `src/components/LocationDisclosureModal.tsx`
- **Line 63**: Change `'https://timekeeperweb.onsiteclub.ca/privacy'` to `'https://www.onsiteclub.ca/legal/timekeeper-privacy'`

### 1.2 - Update In-App Legal Content

The file `app/legal.tsx` contains the full inline Privacy Policy (`PrivacyContent` component) and Terms of Service (`TermsContent` component). **Replace the entire content** of both components with the updated versions provided in **Part 2** of this document.

Key changes from the old content:
- Third-party services updated: Supabase + Google Maps + Expo + **Sentry** (error tracking)
- Freemium model clarified: Free tier (manual entry) + Premium tier (geofencing)
- Added explicit **Google Play prominent disclosure** compliance language
- Added explicit **Apple App Store 5.1.1** compliance language
- Added **account deletion** section (required by both stores since 2022)
- Added **data processing legal basis** for GDPR
- Added **Sentry** to third-party services (error monitoring SDK)
- Updated "Last Updated" date
- Contact emails: `privacy@onsiteclub.ca` (privacy), `legal@onsiteclub.ca` (legal/terms), `support@onsiteclub.ca` (general)

### 1.3 - Verify After Changes

After making all changes, confirm:
1. All 7 URL replacements are done
2. `PrivacyContent` and `TermsContent` in `app/legal.tsx` use the new text from Part 2
3. No remaining references to the old URLs exist in the codebase (search for `timekeeperweb.onsiteclub.ca` and `/legal/timekeeper/`)
4. `LocationDisclosureModal.tsx` prominent disclosure text still meets Google Play requirements (mentions "background", "location", and the feature that uses it)

---

## PART 2: UPDATED LEGAL CONTENT

> These texts are designed to comply with Apple App Store Guidelines (5.1.1), Google Play Developer Policy (background location, data safety, prominent disclosure), GDPR, CCPA, and LGPD requirements.

---

### 2.1 PRIVACY POLICY

```
OnSite Timekeeper - Privacy Policy
Last Updated: February 19, 2026

OnSite Club ("we," "our," or "us") operates the OnSite Timekeeper mobile application
(the "App"). This Privacy Policy explains how we collect, use, disclose, and safeguard
your information when you use our App.


1. Information We Collect

1.1 Personal Information
When you create an account, we collect:
  - Email address - Used for authentication and account recovery
  - Name and surname - Used to identify you within the App
  - User ID - A unique identifier assigned to your account

1.2 Location Data
Our App collects location data to provide its core functionality:
  - Precise GPS coordinates - Collected when you use the map feature or when
    geofencing is enabled
  - Background location - With your explicit permission, we collect location data
    even when the App is closed or not in use. This is essential for:
      * Automatically detecting when you arrive at or leave your work location
      * Recording accurate work entry and exit times
      * Providing geofence-based time tracking
  - We use geofencing technology, NOT continuous GPS tracking. Location is only
    processed when you enter or exit a defined work zone.

1.3 Work Session Data
  - Entry and exit timestamps
  - Work location names
  - Session duration and break times
  - Notes attached to work sessions

1.4 Device and Usage Information
  - Device type and operating system version
  - App version
  - Timezone settings
  - Anonymous usage analytics (features used, session duration)
  - Crash reports and error logs (via Sentry - no PII included)


2. How We Use Your Information

We use the collected information for the following purposes:
  - Account Management - Email, name, user ID
  - Time Tracking - Location data, timestamps
  - Geofencing - Background location, work locations
  - Work Reports - Session data, timestamps
  - App Improvement - Anonymous usage data, crash reports
  - Customer Support - Email, session data

We do NOT use your data for:
  - Advertising or marketing to third parties
  - Selling to data brokers
  - Tracking your movements outside of work-related geofences
  - Building advertising profiles


3. Location Data - Detailed Disclosure

3.1 Why We Need Background Location
OnSite Timekeeper is a work time tracking application. The geofencing feature
requires detecting when you physically arrive at or leave your designated work
location. This functionality requires background location access because:
  - You may arrive at work with your phone in your pocket (App not open)
  - You may leave work without manually opening the App
  - Automatic time tracking requires continuous geofence monitoring

IMPORTANT: Background location is ONLY required for the premium geofencing
feature. The free tier (manual time entry) does NOT require any location access.

3.2 How Background Location Works
  - We use geofencing technology (not continuous GPS tracking)
  - Location is only processed when you enter or exit a defined work zone
  - We do NOT track your location continuously throughout the day
  - Location data is processed locally on your device first
  - Only entry/exit events are recorded and optionally synced

3.3 Your Control Over Location
You can at any time:
  - Disable background location in your device settings
  - Remove work locations from the App
  - Switch to manual time entry mode (no location required)
  - Delete all stored location data
  - Revoke location permission entirely (manual entry still works)


4. Data Storage and Security

4.1 Local Storage (Offline-First)
Your data is stored locally on your device using:
  - SQLite database for offline functionality
  - Secure storage for authentication tokens
Your data is NEVER lost, even without internet connection.

4.2 Cloud Storage (Optional Sync)
When you are online, data may sync to our cloud servers:
  - Provider: Supabase (hosted on AWS)
  - Location: United States / Canada
  - Encryption: TLS 1.3 in transit, AES-256 at rest
  - Access Control: Row Level Security (RLS) ensures you can only access your
    own data

4.3 Security Measures
  - All data transmission uses HTTPS/TLS encryption
  - Authentication tokens are stored in device secure storage
  - Database access requires authentication
  - Row-level security on all cloud tables
  - We implement industry-standard security practices


5. Data Sharing and Disclosure

5.1 We Do NOT Sell Your Data
We do not sell, trade, or rent your personal information to third parties.

5.2 Limited Sharing
We may share your data only in these circumstances:
  - Your Employer/Manager - Only if you explicitly grant access via the Team
    Sharing feature (work hours and session times only)
  - Service Providers - Infrastructure and hosting (encrypted data only)
  - Legal Authorities - If required by law or valid legal process

5.3 Team Sharing Feature
If you choose to share your timesheet with a manager or employer:
  - You explicitly grant access via a sharing code or QR code
  - You can revoke access at any time
  - Shared data includes: work hours, entry/exit times, location names
  - Shared data does NOT include: precise GPS coordinates, personal device info


6. Third-Party Services

Our App uses the following third-party services:
  - Supabase - Authentication, database, and cloud sync
    (https://supabase.com/privacy)
  - Google Maps - Map display and geocoding
    (https://policies.google.com/privacy)
  - Expo - App framework and push notifications
    (https://expo.dev/privacy)
  - Sentry - Error monitoring and crash reporting (no PII collected)
    (https://sentry.io/privacy/)

Each third-party provider has their own privacy policy. We require that all
third-party partners provide equivalent or greater data protection.


7. Data Retention

  - Account information - Until you delete your account
  - Work session records - 2 years (for legal/tax compliance)
  - Location audit logs - 90 days
  - Error logs and crash reports - 30 days
  - Anonymous analytics - 12 months
After these periods, data is automatically deleted from our servers.


8. Account Deletion

You can delete your account at any time through:
  - In-App: Settings > Account > Delete Account
  - Email: privacy@onsiteclub.ca

Upon deletion:
  - Your account is permanently deactivated
  - All personal data is deleted from our servers within 30 days
  - Local data on your device is cleared immediately
  - Anonymized, aggregated data may be retained for analytics
  - Shared access (Team Sharing) is automatically revoked


9. Your Rights

9.1 Under GDPR (European Users)
Legal basis for processing: Consent (location data), Legitimate Interest
(service provision), Contract (account management).
You have the right to:
  - Access - Request a copy of your data
  - Rectification - Correct inaccurate data
  - Erasure - Request deletion of your data ("right to be forgotten")
  - Portability - Export your data in a standard format (PDF, CSV)
  - Restriction - Limit how we process your data
  - Objection - Object to certain processing activities
  - Withdraw Consent - Revoke previously given consent at any time

9.2 Under CCPA (California Users)
You have the right to:
  - Know what personal information we collect
  - Request deletion of your personal information
  - Opt-out of the sale of personal information (we don't sell data)
  - Non-discrimination for exercising your rights

9.3 Under LGPD (Brazilian Users)
You have equivalent rights to access, correct, delete, and port your data,
as well as the right to information about data sharing and the identity of
the data protection officer.

9.4 How to Exercise Your Rights
Contact us at:
  - Email: privacy@onsiteclub.ca
  - In-App: Settings > Privacy > Request Data / Delete Account
We will respond to your request within 30 days.


10. Children's Privacy

OnSite Timekeeper is not intended for use by children under 16 years of age.
We do not knowingly collect personal information from children. If you believe
we have collected data from a child, please contact us immediately at
privacy@onsiteclub.ca.


11. Changes to This Privacy Policy

We may update this Privacy Policy from time to time. We will notify you of
changes by:
  - Posting the new Privacy Policy in the App
  - Updating the "Last Updated" date
  - Sending an email notification for significant changes
Your continued use of the App after changes constitutes acceptance of the
updated policy.


12. Contact Us

If you have questions or concerns about this Privacy Policy or our data
practices, please contact us:

OnSite Club
  - Privacy: privacy@onsiteclub.ca
  - Support: support@onsiteclub.ca
  - Website: https://onsiteclub.ca

Located in Ontario, Canada.


13. Consent

By using OnSite Timekeeper, you consent to the collection and use of your
information as described in this Privacy Policy. For location data, we request
explicit consent through your device's permission system before any collection
begins. You may withdraw consent at any time by disabling permissions in your
device settings.


Summary of Key Points:
  [check] We collect location data only for work time tracking
  [check] We do NOT sell your data
  [check] We do NOT track you outside of work geofences
  [check] You control your data and can delete it anytime
  [check] All data is encrypted in transit and at rest
  [check] Free tier works without any location access
  [check] Account deletion available in-app and via email

(c) 2026 OnSite Club. All rights reserved.
```

---

### 2.2 TERMS OF SERVICE

```
OnSite Timekeeper - Terms of Service
Last Updated: February 19, 2026

Please read these Terms of Service ("Terms," "Agreement") carefully before using
the OnSite Timekeeper mobile application ("App") operated by OnSite Club
("Company," "we," "our," or "us").

By downloading, installing, or using the App, you agree to be bound by these
Terms. If you do not agree to these Terms, do not use the App.


1. Acceptance of Terms

1.1 Agreement to Terms
By accessing or using OnSite Timekeeper, you confirm that:
  - You are at least 16 years of age
  - You have the legal capacity to enter into this Agreement
  - You will comply with these Terms and all applicable laws
  - If using on behalf of an organization, you have authority to bind that
    organization

1.2 Additional Policies
These Terms incorporate by reference our Privacy Policy and any additional
guidelines or rules posted within the App.


2. Description of Service

2.1 What OnSite Timekeeper Does
OnSite Timekeeper is a mobile application designed to help users track their
work hours. The App provides:
  - Manual time entry - Record work hours by manually entering start and end
    times
  - Location-based tracking - Save work locations for quick access
  - Geofencing (Premium) - Automatically detect arrival and departure from work
    locations using background location
  - Reports and exports - Generate timesheets in PDF and CSV formats
  - Team sharing - Share your timesheet with employers or managers

2.2 Service Tiers

Free Tier:
  - Manual time entry and editing
  - Work session history and calendar view
  - Basic reports
  - Local data storage (offline-first)
  - Cloud backup and sync

Premium Tier (Geofencing):
  - All Free features plus:
  - Automatic entry/exit detection via GPS geofencing
  - Multiple work location zones
  - Background location monitoring
  - Location audit trail

2.3 Service Availability
We strive to maintain continuous service availability. However, we do not
guarantee that the App will be:
  - Available at all times without interruption
  - Free from errors, bugs, or security vulnerabilities
  - Compatible with all devices or operating systems


3. User Accounts

3.1 Account Creation
To use OnSite Timekeeper, you must create an account by providing:
  - A valid email address
  - A secure password
  - Your name (optional but recommended)

3.2 Account Responsibilities
You are responsible for:
  - Maintaining the confidentiality of your login credentials
  - All activities that occur under your account
  - Notifying us immediately of any unauthorized access
  - Ensuring your account information is accurate and current

3.3 Account Security
We implement industry-standard security measures, but you acknowledge that no
system is completely secure. We are not liable for any loss resulting from
unauthorized access to your account due to your failure to protect your
credentials.

3.4 Account Deletion
You may delete your account at any time through:
  - In-App: Settings > Account > Delete Account
  - Email: privacy@onsiteclub.ca
Upon deletion, your data will be permanently removed within 30 days. See our
Privacy Policy for full details.


4. Service Plans and Pricing

4.1 Current Offering
OnSite Timekeeper offers both free and premium features. The free tier includes
manual time entry, reports, and cloud sync. Premium geofencing features may
require a subscription.

4.2 Future Changes
We reserve the right to modify pricing or introduce new subscription plans. If
we do, we will provide at least 30 days notice. Features that were free at the
time you started using them will be communicated clearly if any changes apply.

4.3 Payments and Refunds
If applicable, subscriptions are processed through the Apple App Store or Google
Play Store. Refund policies follow the respective store's policies. You may
cancel your subscription at any time.


5. Acceptable Use

5.1 Permitted Uses
You may use OnSite Timekeeper to:
  - Track your own work hours
  - Generate personal timesheets and reports
  - Share your data with authorized parties (employers, managers)
  - Export your data for personal or professional use

5.2 Prohibited Uses
You agree NOT to:
  - Use the App for any illegal purpose
  - Falsify time records or location data
  - Attempt to circumvent security features
  - Reverse engineer, decompile, or disassemble the App
  - Use automated systems to access the App (bots, scrapers)
  - Interfere with or disrupt the App's functionality
  - Impersonate another person or entity
  - Share your account credentials with others
  - Use the App to track other people without their consent

5.3 Consequences of Violation
Violation of these terms may result in:
  - Suspension or termination of your account
  - Loss of access to premium features without refund
  - Legal action if applicable


6. Location Services and Geofencing

6.1 Location Data Collection
When you enable location features, you understand and agree that:
  - The App collects precise GPS coordinates
  - Background location may be collected when the App is not in use
  - Location data is used to detect arrival/departure from work locations
  - You can disable location services at any time in your device settings
  - Location access is NOT required for manual time entry (free tier)

6.2 Background Location Disclosure
The App uses background location access to automatically detect when you arrive
at or leave a work site, even when the App is closed or not in use. This data
is used exclusively for geofence-based time tracking. Your location is never
shared with advertisers or third parties. You can disable this at any time in
your device settings.

6.3 Geofencing Limitations
You acknowledge that geofencing technology has inherent limitations:
  - GPS Accuracy - Location accuracy varies based on device, environment, and
    signal strength
  - Timing Delays - Entry/exit detection may be delayed by several minutes
  - False Triggers - Occasional false positives or negatives may occur
  - Battery Impact - Background location services consume battery
  - Indoor Accuracy - GPS may be less accurate inside buildings

6.4 No Guarantee of Accuracy
IMPORTANT: OnSite Timekeeper is a tool to assist with time tracking, NOT an
official timekeeping system. You are responsible for:
  - Verifying the accuracy of recorded times
  - Making manual corrections when necessary
  - Maintaining your own official records if required by law or employer
  - Reviewing time records before submission to employers

We are NOT liable for any disputes, losses, or damages arising from inaccurate
time records.


7. Data and Content

7.1 Your Data
You retain ownership of all data you input into the App, including:
  - Work session records
  - Location names and addresses
  - Personal information

7.2 License to Use Your Data
By using the App, you grant us a limited license to:
  - Store your data on our servers
  - Process your data to provide the service
  - Back up your data for recovery purposes
  - Display your data to you within the App

7.3 Data Export
You may export your data at any time through the App's export features. We
provide data in standard formats (PDF, CSV) for your convenience.

7.4 Data Deletion
You may delete your data and account at any time. Upon deletion:
  - Your account will be permanently deactivated
  - Personal data will be deleted from servers within 30 days
  - Local data on your device is cleared immediately
  - Anonymized, aggregated data may be retained for analytics


8. Intellectual Property

8.1 Our Property
OnSite Timekeeper and its original content, features, and functionality are
owned by OnSite Club and are protected by copyright, trademark, and other
intellectual property rights.

8.2 Restrictions
You may not:
  - Copy, modify, or distribute the App
  - Use our trademarks without permission
  - Create derivative works based on the App
  - Remove any copyright or proprietary notices

8.3 Feedback
If you provide suggestions, ideas, or feedback about the App, you grant us the
right to use such feedback without compensation or attribution.


9. Third-Party Services

9.1 Third-Party Integrations
The App may integrate with third-party services including:
  - Google Maps - Map display and geocoding
  - Supabase - Authentication and data storage
  - Sentry - Error monitoring
  - App Store / Google Play - Distribution and payments

9.2 Third-Party Terms
Your use of third-party services is subject to their respective terms and
privacy policies. We are not responsible for third-party services.

9.3 Links
The App may contain links to external websites or services. We do not endorse
or control these external resources.


10. Disclaimers

10.1 "As Is" Basis
THE APP IS PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT WARRANTIES OF ANY KIND,
EITHER EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO MERCHANTABILITY, FITNESS
FOR A PARTICULAR PURPOSE, NON-INFRINGEMENT, OR ACCURACY OR RELIABILITY.

10.2 No Professional Advice
OnSite Timekeeper is a time tracking tool, not a substitute for:
  - Professional HR or payroll systems
  - Legal compliance systems
  - Official timekeeping required by law
Consult appropriate professionals for employment, legal, or tax matters.

10.3 Service Interruptions
We do not warrant that the App will be uninterrupted or error-free, that defects
will be corrected, or that the App is free of viruses or harmful components.


11. Limitation of Liability

11.1 Exclusion of Damages
TO THE MAXIMUM EXTENT PERMITTED BY LAW, ONSITE CLUB SHALL NOT BE LIABLE FOR:
  - Indirect, incidental, special, or consequential damages
  - Loss of profits, revenue, or data
  - Business interruption
  - Damages arising from use or inability to use the App

11.2 Maximum Liability
OUR TOTAL LIABILITY SHALL NOT EXCEED THE AMOUNT YOU PAID FOR THE APP IN THE 12
MONTHS PRECEDING THE CLAIM, OR $100 CAD, WHICHEVER IS GREATER.

11.3 Exceptions
Some jurisdictions do not allow limitation of liability for certain damages. In
such cases, our liability is limited to the maximum extent permitted by law.


12. Indemnification

You agree to indemnify and hold harmless OnSite Club, its officers, directors,
employees, and agents from any claims, damages, losses, or expenses (including
legal fees) arising from:
  - Your use of the App
  - Your violation of these Terms
  - Your violation of any third-party rights
  - Any dispute between you and your employer regarding time records


13. Termination

13.1 Termination by You
You may stop using the App and delete your account at any time.

13.2 Termination by Us
We may suspend or terminate your account if:
  - You violate these Terms
  - Your account is inactive for more than 24 months
  - We discontinue the App (with reasonable notice)
  - Required by law

13.3 Effect of Termination
Upon termination:
  - Your right to use the App ceases immediately
  - We may delete your data (subject to legal retention requirements)
  - Provisions that should survive termination will remain in effect


14. Dispute Resolution

14.1 Informal Resolution
Before filing a formal dispute, you agree to contact us at legal@onsiteclub.ca
to attempt informal resolution.

14.2 Governing Law
These Terms are governed by the laws of the Province of Ontario, Canada, without
regard to conflict of law principles.

14.3 Jurisdiction
Any disputes shall be resolved in the courts located in Ontario, Canada. You
consent to the personal jurisdiction of such courts.

14.4 Class Action Waiver
YOU AGREE TO RESOLVE DISPUTES ONLY ON AN INDIVIDUAL BASIS AND NOT AS PART OF
ANY CLASS OR REPRESENTATIVE ACTION.


15. Changes to Terms

15.1 Modifications
We reserve the right to modify these Terms at any time. Changes become effective
when posted unless otherwise specified.

15.2 Notification
We will notify you of material changes through:
  - In-app notification
  - Email to your registered address
  - Notice on our website

15.3 Continued Use
Your continued use of the App after changes constitutes acceptance of the
modified Terms. If you do not agree, you must stop using the App.


16. General Provisions

16.1 Entire Agreement
These Terms, together with our Privacy Policy, constitute the entire agreement
between you and OnSite Club regarding the App.

16.2 Severability
If any provision of these Terms is found invalid or unenforceable, the remaining
provisions remain in full effect.

16.3 Waiver
Our failure to enforce any provision does not constitute a waiver of that
provision or any other provision.

16.4 Assignment
You may not assign your rights under these Terms. We may assign our rights to
any affiliate or successor.

16.5 Force Majeure
We are not liable for delays or failures due to circumstances beyond our
reasonable control (natural disasters, war, government actions, etc.).


17. Contact Information

For questions about these Terms, please contact us:

OnSite Club
  - Legal: legal@onsiteclub.ca
  - Support: support@onsiteclub.ca
  - Website: https://onsiteclub.ca

Located in Ontario, Canada.


18. Acknowledgment

BY USING ONSITE TIMEKEEPER, YOU ACKNOWLEDGE THAT YOU HAVE READ, UNDERSTOOD, AND
AGREE TO BE BOUND BY THESE TERMS OF SERVICE.

If you do not agree to these Terms, please do not use the App.


Summary of Key Points:
  [check] Free tier available (manual time entry, no location required)
  [check] Premium geofencing requires background location permission
  [check] GPS/geofencing has inherent accuracy limitations
  [check] You own your data and can export/delete it anytime
  [check] App is a tool, not an official timekeeping system
  [check] We are not liable for time record disputes
  [check] Account deletion available in-app and via email

(c) 2026 OnSite Club. All rights reserved.
```

---

## PART 3: STORE COMPLIANCE CHECKLIST

### Apple App Store (Guidelines 5.1.1)

| Requirement | Status | Notes |
|---|---|---|
| Privacy Policy URL in App Store Connect | Must verify | URL must return 200 (currently 404!) |
| Privacy Policy accessible in-app | OK | Settings > Legal, and at signup |
| Purpose strings in Info.plist | OK | NSLocationWhenInUse, NSLocationAlways, NSLocationAlwaysAndWhenInUse all present in app.json |
| Privacy Nutrition Labels (App Privacy) | Must verify | Declare in App Store Connect: Location (Precise), Email, Name, User ID, Usage Data, Crash Data |
| Account Deletion in-app | Must verify | Required since June 2022. Must exist in Settings |
| Explain background location purpose | OK | LocationDisclosureModal.tsx shows before permission |
| Third-party SDK disclosure | Updated | Now includes Supabase, Google Maps, Expo, Sentry |

### Google Play Store

| Requirement | Status | Notes |
|---|---|---|
| Privacy Policy URL in Play Console | Must verify | URL must return 200 (currently 404!) |
| Data Safety Form completed | Must verify | Declare: Location (precise, background), Email, Name, Crash logs |
| Prominent Disclosure before background location | OK | LocationDisclosureModal.tsx - must contain words "location" + "background"/"when app is closed" |
| Location permission declaration form | Must verify | Required in Play Console for background location apps |
| Demo video for background location | Must verify | Google may require a video showing the feature + disclosure |
| Account Deletion | Must verify | Required. Must be in-app + email option |

### Data Safety Form - What to Declare (Google Play)

**Data collected:**
| Data Type | Collected | Shared | Purpose |
|---|---|---|---|
| Precise location | Yes | No | App functionality (geofencing) |
| Email address | Yes | No | Account management |
| Name | Yes | No | Account management |
| App interactions | Yes | No | Analytics |
| Crash logs | Yes | No | App functionality |
| Device ID | No | No | - |
| Advertising ID | No | No | - |

**Security practices to declare:**
- Data encrypted in transit: Yes (TLS 1.3)
- Data encrypted at rest: Yes (AES-256)
- Users can request data deletion: Yes
- Independent security review: No

### Apple Privacy Nutrition Labels - What to Declare

**Data Linked to You:**
- Email Address (Account)
- Name (Account)
- Precise Location (App Functionality)
- User ID (App Functionality)

**Data NOT Linked to You:**
- Crash Data (App Functionality)
- Usage Data (Analytics)

---

## PART 4: WEBSITE vs IN-APP CONTENT DISCREPANCIES

The website (`www.onsiteclub.ca/legal/timekeeper-privacy` and `timekeeper-terms`) has DIFFERENT content than the in-app version. Key differences:

| Topic | Website | In-App (legal.tsx) |
|---|---|---|
| Third-party services | Stripe, Mapbox, Vercel | Supabase, Google Maps, Expo |
| Pricing | $9.99 CAD/month Pro | "Currently free" |
| Data storage | "Canadian servers" | "AWS US/Canada via Supabase" |
| Map provider | Mapbox | Google Maps |

**Recommendation:** The website content should be updated separately to match the in-app version, OR both should be aligned. The in-app version (Part 2 of this document) is the authoritative source. The website is managed outside this codebase — flag this to the web team.

---

*Generated: February 19, 2026*
*For use by: AI agent or developer implementing legal content updates*
