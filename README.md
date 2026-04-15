# OnSite Timekeeper

Mobile time tracking and invoicing app for construction workers and contractors. Automatic geofence-based hour detection, manual time entry, PDF invoice generation, and offline-first architecture.

## Features

- **Automatic Geofencing** - detects entry/exit from work locations via Transistorsoft BackgroundGeolocation
- **Manual Time Entry** - log hours directly from the calendar view
- **Invoice Generation** - create hourly or products/services invoices with PDF export
- **Client Management** - save clients for invoice autofill
- **Business Profile** - company info, logo, GST number for professional invoices
- **Calendar View** - month view with day detail modal, date range selection
- **Export Reports** - PDF timesheet export, share via system share sheet
- **Offline-First** - works without internet, bi-directional sync with Supabase
- **Security** - SSL pinning, Sentry PII sanitization, app attestation
- **AI Voice Commands** - Whisper STT + GPT interpretation (currently disabled in UI)

## Tech Stack

| Layer | Technology |
|-------|------------|
| **Mobile** | React Native 0.76 + Expo SDK 52 |
| **Navigation** | Expo Router (file-based tabs) |
| **State** | Zustand 5 |
| **Local Database** | SQLite (expo-sqlite) |
| **Cloud** | Supabase (PostgreSQL + Auth) |
| **Maps** | react-native-maps (Google Maps) |
| **Geofencing** | react-native-background-geolocation (Transistorsoft) |
| **PDF** | expo-print (HTML to PDF) |
| **Crash Reporting** | Sentry (@sentry/react-native) |
| **Notifications** | expo-notifications |

## Setup

### 1. Clone and install

```bash
git clone https://github.com/your-org/onsite-timekeeper.git
cd onsite-timekeeper
npm install
```

### 2. Configure Supabase

1. Create a project at [Supabase](https://supabase.com)
2. Run migrations from `supabase/migrations/`
3. Enable **Email** auth provider
4. Copy credentials from **Settings > API**

### 3. Environment variables

Create a `.env` file at root:

```env
EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIs...
```

### 4. EAS secrets (for builds)

```bash
eas secret:create --name SENTRY_AUTH_TOKEN --value <token>
```

### 5. Run

```bash
npx expo start           # Development server
npx expo run:android     # Android dev build
npx expo run:ios         # iOS dev build
```

## Scripts

```bash
npm start              # Start Expo dev server
npm run android        # Run on Android
npm run ios            # Run on iOS
npm run web            # Run in browser
npm run typecheck      # TypeScript check (tsc --noEmit)
npm run doctor         # Expo config check
npm run lint           # ESLint
```

## Project Structure

```
onsite-timekeeper/
├── app/                              # Expo Router screens
│   ├── (auth)/                       # Auth flow
│   │   ├── _layout.tsx
│   │   ├── login.tsx
│   │   ├── register.tsx
│   │   └── complete-profile.tsx
│   ├── (tabs)/                       # Main tab screens
│   │   ├── _layout.tsx               # Tab bar (Log, Invoices, Locations)
│   │   ├── reports.tsx               # Log tab — calendar + reports
│   │   ├── invoice.tsx               # Invoices tab — dashboard + wizards
│   │   ├── map.tsx                   # Locations tab — geofence map
│   │   ├── settings.tsx              # Settings (hidden tab, gear icon)
│   │   └── team.tsx                  # Team (hidden, future)
│   ├── business-profile.tsx          # Business profile setup
│   ├── legal.tsx                     # Terms / Privacy
│   ├── logs.tsx                      # Debug log viewer
│   └── _layout.tsx                   # Root layout
├── src/
│   ├── components/
│   │   ├── Calendar.tsx              # Custom calendar (invoices + reports)
│   │   ├── CollapsibleCard.tsx       # Expandable card
│   │   ├── ErrorBoundary.tsx         # React error boundary
│   │   ├── PermissionBanner.tsx      # Permission status
│   │   ├── VoiceCommandSheet.tsx     # Voice commands (disabled)
│   │   ├── FloatingMicButton.tsx     # Mic FAB (disabled)
│   │   └── ui/                       # Reusable UI kit
│   │       ├── index.ts              # Barrel export
│   │       ├── Button.tsx
│   │       ├── PressableOpacity.tsx
│   │       ├── AvatarCircle.tsx
│   │       ├── HeaderRow.tsx
│   │       ├── SectionHeader.tsx
│   │       ├── ModalOverlay.tsx
│   │       ├── PermissionModal.tsx
│   │       ├── ToggleRow.tsx
│   │       ├── ErrorBox.tsx
│   │       └── OfflineBanner.tsx
│   ├── constants/
│   │   └── colors.ts                # App color palette
│   ├── hooks/
│   │   ├── useAutoLogToggle.ts
│   │   └── usePermissionStatus.ts
│   ├── lib/
│   │   ├── database/                 # SQLite CRUD (modular)
│   │   │   ├── core.ts              # Init, migrations, types, helpers
│   │   │   ├── daily.ts             # daily_hours CRUD
│   │   │   ├── locations.ts         # Geofence locations CRUD
│   │   │   ├── invoices.ts          # Invoices + items CRUD
│   │   │   ├── clients.ts           # Client CRUD (autofill)
│   │   │   ├── businessProfile.ts   # Business profile CRUD
│   │   │   ├── audit.ts             # GPS audit trail
│   │   │   ├── analytics.ts         # Metrics/KPIs
│   │   │   ├── errors.ts            # Error log
│   │   │   └── index.ts             # Barrel export
│   │   ├── ai/                       # AI system
│   │   │   ├── voice.ts             # Voice command processing
│   │   │   ├── whisper.ts           # Speech-to-text
│   │   │   ├── interpreter.ts       # AI Guardian (geofence consultant)
│   │   │   ├── secretary.ts         # AI time corrections
│   │   │   └── timekeeperSystemPrompt.ts
│   │   ├── bgGeo.ts                 # Transistorsoft geofencing
│   │   ├── exitHandler.ts           # Geofence exit + cooldown
│   │   ├── invoicePdf.ts            # Invoice HTML + PDF generation
│   │   ├── timesheetPdf.ts          # Timesheet PDF export
│   │   ├── sslPinning.ts            # Fetch interceptor + domain validation
│   │   ├── sentry.ts                # Crash reporting + PII sanitization
│   │   ├── appAttestation.ts        # App integrity
│   │   ├── logger.ts                # In-memory structured logging
│   │   ├── supabase.ts              # Supabase client
│   │   ├── notifications.ts         # Push notifications
│   │   ├── bootstrap.ts             # App init sequence
│   │   ├── format.ts                # Number/currency/duration formatting
│   │   ├── constructionPresets.ts   # Industry presets
│   │   ├── geocoding.ts             # Reverse geocoding
│   │   ├── reports.ts               # Report text generation
│   │   └── telemetry.ts             # Analytics
│   ├── screens/
│   │   ├── home/
│   │   │   ├── hooks.ts             # Log/Reports screen hook
│   │   │   ├── helpers.ts           # Date utilities
│   │   │   └── styles/              # Modular styles
│   │   ├── map/
│   │   │   ├── hooks.ts             # Map screen hook
│   │   │   ├── SearchBox.tsx         # Address search
│   │   │   ├── RadiusSlider.tsx      # Geofence radius control
│   │   │   ├── styles.ts
│   │   │   └── constants.ts
│   │   └── invoice/
│   │       ├── ServicesWizard.tsx    # Products/services wizard
│   │       └── InvoiceSummaryCard.tsx # Invoice summary display
│   └── stores/                       # Zustand stores
│       ├── dailyLogStore.ts          # Daily hours + tracking state
│       ├── locationStore.ts          # Geofences + entry/exit
│       ├── syncStore.ts              # Supabase sync
│       ├── invoiceStore.ts           # Invoice + client management
│       ├── businessProfileStore.ts   # Business profile
│       ├── authStore.ts              # Authentication
│       └── settingsStore.ts          # User preferences
├── docs/
│   ├── PIPELINE.md
│   ├── DATA_SYSTEM.md
│   ├── BACKGROUND_SYSTEM.md
│   └── REPORT_SYSTEM.md
├── plugins/                          # Expo config plugins
├── supabase/migrations/
├── app.json
├── eas.json
└── CLAUDE.md                         # AI dev context
```

## Database Schema

### SQLite Tables (Local)

**daily_hours** — Primary data store (1 record per user per day)
| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| user_id | UUID | FK auth.users |
| date | TEXT | YYYY-MM-DD |
| total_minutes | INTEGER | Total worked minutes |
| break_minutes | INTEGER | Break time |
| location_name | TEXT | Location name |
| source | TEXT | 'manual' or 'geofence' |
| first_entry | TEXT | First clock-in timestamp |
| last_exit | TEXT | Last clock-out timestamp |

**locations** — Geofence zones
| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| user_id | UUID | FK auth.users |
| name | TEXT | Location name |
| latitude | REAL | Latitude |
| longitude | REAL | Longitude |
| radius | INTEGER | Meters (default 100) |
| color | TEXT | Hex color |
| status | TEXT | 'active' / 'deleted' |

**invoices** — Generated invoices
| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| user_id | UUID | FK auth.users |
| invoice_number | TEXT | e.g. INV-0001 |
| type | TEXT | 'hourly' / 'products_services' |
| client_name | TEXT | Client name |
| status | TEXT | 'pending' / 'paid' / 'cancelled' |
| subtotal, tax_rate, tax_amount, total | REAL | Financial fields |
| due_date | TEXT | Payment due date |
| pdf_uri | TEXT | Generated PDF path |

**invoice_items** — Line items for products/services invoices

**clients** — Saved clients for autofill (name, email, phone, address)

**business_profile** — Company info for invoices (name, logo, GST, address)

**active_tracking** — Singleton for current geofence session

**location_audit** — GPS proof trail for entry/exit events

### Supabase Sync
- **Bi-directional**: `daily_hours`, `locations` (as `app_timekeeper_geofences`)
- **Upload only**: `location_audit`
- **Local only**: `analytics_daily`, `error_log`

## Invoice System

Two invoice types with 3-step modal wizards:

**Hourly Invoice**: Select date range -> Pick client + due date -> Review summary -> Generate PDF

**Products/Services Invoice**: Add line items -> Pick client + due date + tax -> Review -> Generate PDF

PDFs are generated from HTML templates via `expo-print` and shared via `expo-sharing`.

## Security

- **SSL Pinning**: JS-level fetch interceptor validates all request domains. Only Supabase, Google Maps, Sentry, and Expo hosts allowed. Blocks unauthorized hosts in production.
- **Sentry PII Sanitization**: GPS coords, financial data, client names, emails, and phone numbers are scrubbed before sending to Sentry.
- **`__DEV__` Guards**: Sensitive data (dollar amounts, client names) only logged in development mode.
- **Auth Monitoring**: Failed login attempts logged to Sentry for brute-force detection.
- **App Attestation**: Device integrity verification.
- **Supabase RLS**: Row-level security on all tables.

## Build

```bash
# EAS Build (production)
eas build --platform android
eas build --platform ios

# Local dev build
npx expo run:android
npx expo run:ios
```

Current version: **1.8.0** (iOS build 37, Android build 33)

## Required Permissions

### Android
- ACCESS_FINE_LOCATION / ACCESS_COARSE_LOCATION
- ACCESS_BACKGROUND_LOCATION
- FOREGROUND_SERVICE / FOREGROUND_SERVICE_LOCATION

### iOS
- NSLocationWhenInUseUsageDescription
- NSLocationAlwaysAndWhenInUseUsageDescription
- UIBackgroundModes: location

## Troubleshooting

### Geofencing not detecting entry/exit
1. Check "Always" permission for location
2. Disable battery optimization for the app
3. Check radius is large enough (min 50m)

### Sync not working
1. Check internet connection
2. Verify Supabase env variables in `.env`
3. Check `app/logs.tsx` debug viewer

### TypeScript errors
```bash
npm run typecheck    # tsc --noEmit
```

## Contributing

1. Run `npm run typecheck` before each push
2. Test on dev build (not Expo Go — native modules required)
3. Use descriptive commits: `feat:`, `fix:`, `docs:`, `refactor:`
4. Use `[skip ci]` for docs/WIP commits

## License

MIT - OnSite Club

---

*Last updated: April 2026*
