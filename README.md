# OnSite Timekeeper

📍 Mobile time tracking app based on geofencing. Workers register work locations, and the app automatically detects entry/exit via GPS, recording hours worked in an offline-first architecture.

## Features

- ✅ **Automatic Geofencing** - detects entry/exit from work locations
- ✅ **Offline-first** - works without internet, syncs later
- ✅ **Notification-based UI** - action buttons directly in notification bar
- ✅ **3 ways to add locations** - current GPS, address search, map tap
- ✅ **Calendar View** - week/month view with session details
- ✅ **Export Reports** - share via WhatsApp, Email, or save as file
- ✅ **Auto-Report Reminders** - weekly/bi-weekly/monthly notifications
- ✅ **Favorite Contact** - one-tap send to supervisor
- ✅ **Day Detail Modal** - view, select, and batch export sessions
- ✅ **DevMonitor** - debug console for development

## Stack

| Layer | Technology |
|-------|------------|
| **Mobile** | React Native + Expo (SDK 52) |
| **Navigation** | Expo Router (file-based) |
| **State** | Zustand |
| **Local Database** | SQLite (expo-sqlite) |
| **Cloud Database** | Supabase (PostgreSQL) |
| **Auth** | Supabase Auth |
| **Maps** | react-native-maps (Google Maps) |
| **Geofencing** | expo-location + expo-task-manager |
| **Notifications** | expo-notifications |

## Setup

### 1. Clone and install

```bash
git clone https://github.com/your-username/onsite-timekeeper.git
cd onsite-timekeeper
npm install
```

### 2. Configure Supabase

1. Create a project at [Supabase](https://supabase.com)
2. Go to **SQL Editor** and run `supabase/migrations/001_create_tables.sql`
3. Go to **Authentication > Providers** and enable **Email**
4. Copy credentials from **Settings > API**

### 3. Configure environment variables

Create a `.env` file at root:

```env
EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIs...
```

### 4. Run the app

```bash
# Development
npx expo start

# Android
npx expo run:android

# iOS
npx expo run:ios
```

## Available Scripts

```bash
npm start          # Start Expo
npm run android    # Open on Android
npm run ios        # Open on iOS
npm run web        # Open in browser

# Validation (run before push)
npx tsc --noEmit   # Check TypeScript errors
npx expo-doctor    # Check Expo configuration
```

## CI/CD Pipeline

The project uses GitHub Actions for automatic validation and APK build.

```
Push/Manual → Checks (typecheck + doctor) → Build APK → Download
                    ~2 min                    ~12 min
```

**How to use:**
1. Go to **Actions** on GitHub
2. Select **"Build Android APK"**
3. Click **"Run workflow"**
4. Download APK from **Artifacts**

**Skip CI for docs/WIP commits:**
```bash
git commit -m "docs: update readme [skip ci]"
```

📖 [Full Pipeline Documentation](docs/PIPELINE.md)

## Project Structure

```
onsite-timekeeper/
├── app/                          # Expo Router (screens)
│   ├── (auth)/                   # Auth screens
│   │   ├── _layout.tsx
│   │   ├── login.tsx
│   │   └── register.tsx
│   ├── (tabs)/                   # Main tabs
│   │   ├── _layout.tsx
│   │   ├── index.tsx             # Home/Dashboard
│   │   ├── map.tsx               # Map + manage locations
│   │   └── settings.tsx          # Settings + Auto-Report
│   ├── _layout.tsx               # Root layout + notification handler
│   └── index.tsx
├── src/
│   ├── components/
│   │   ├── DevMonitor.tsx        # Debug console
│   │   ├── ErrorBoundary.tsx     # Error handling
│   │   └── ui/
│   │       └── Button.tsx
│   ├── constants/
│   │   └── colors.ts
│   ├── lib/
│   │   ├── backgroundTasks.ts    # TaskManager
│   │   ├── database.ts           # SQLite CRUD
│   │   ├── geocoding.ts          # Nominatim API
│   │   ├── location.ts           # GPS + Geofencing
│   │   ├── logger.ts             # Structured logging
│   │   ├── notifications.ts      # Expo Notifications + Report Reminders
│   │   ├── reports.ts            # Report text generation
│   │   ├── supabase.ts           # Supabase client
│   │   └── sync.ts               # Sync engine
│   ├── screens/
│   │   └── home/
│   │       ├── index.tsx         # Home screen UI
│   │       ├── hooks.ts          # Home logic + export handlers
│   │       ├── styles.ts         # Home styles
│   │       └── helpers.ts        # Date utilities
│   └── stores/
│       ├── authStore.ts          # Authentication state
│       ├── locationStore.ts      # Locations + geofencing
│       ├── recordStore.ts        # Work sessions (records)
│       ├── settingsStore.ts      # User preferences + Auto-Report
│       ├── syncStore.ts          # Sync orchestration
│       └── workSessionStore.ts   # Active session UI state
├── docs/
│   ├── PIPELINE.md               # CI/CD documentation
│   ├── DATA_ARCHITECTURE.md      # Database schema docs
│   ├── BACKGROUND_SYSTEM.md      # Geofencing docs
│   └── REPORT_SYSTEM.md          # Report system docs
├── supabase/
│   └── migrations/
│       └── 001_create_tables.sql
├── .github/
│   └── workflows/
│       └── build.yml             # GitHub Actions
├── app.json
├── eas.json
├── package.json
└── tsconfig.json
```

## Geofencing Flow

```
┌─────────────┐     ┌──────────────────────────┐     ┌─────────────────┐
│   ENTRY     │────▶│  Notification (X min)    │────▶│  Auto-start     │
│  (geofence) │     │  [▶️ Start] [😴 Skip]    │     │  (on timeout)   │
└─────────────┘     └──────────────────────────┘     └─────────────────┘

┌─────────────┐     ┌──────────────────────────┐     ┌─────────────────┐
│   EXIT      │────▶│  Notification (X sec)    │────▶│  Auto-stop      │
│  (geofence) │     │  [✔ OK] [⏸️ Pause]       │     │  (on timeout)   │
└─────────────┘     └──────────────────────────┘     └─────────────────┘

┌─────────────┐     ┌──────────────────────────┐     ┌─────────────────┐
│   RETURN    │────▶│  Notification (X min)    │────▶│  Auto-resume    │
│  (paused)   │     │  [▶️ Resume] [⏹️ Stop]   │     │  (on timeout)   │
└─────────────┘     └──────────────────────────┘     └─────────────────┘
```

**Timer values configurable in Settings:**
- Entry timeout: 1-10 minutes
- Exit timeout: 10-60 seconds
- Return timeout: 1-10 minutes
- Pause limit: 15-60 minutes

## Report System

### Export Methods

| Method | Description |
|--------|-------------|
| **Share** | Opens system share sheet (WhatsApp, Telegram, etc.) |
| **File** | Creates `.txt` file for download |
| **Favorite** | Direct send to configured WhatsApp/Email contact |

### Auto-Report Reminder

Configure in **Settings > Auto-Report**:
- Set favorite contact (WhatsApp or Email)
- Enable reminder (Weekly/Bi-weekly/Monthly)
- Choose day and time (e.g., Friday 18:00)

When triggered, notification appears with **[Send Now]** and **[Later]** buttons.

📖 [Full Report System Documentation](docs/REPORT_SYSTEM.md)

## Sync Architecture

```
┌──────────────┐          ┌──────────────┐
│   SQLite     │◀────────▶│   Supabase   │
│   (local)    │   Sync   │   (cloud)    │
│              │          │              │
│  - locations │          │  - locations │
│  - records   │          │  - records   │
│  - analytics │          │  - analytics │
└──────────────┘          └──────────────┘
       │
       │ Source of Truth
       ▼
┌──────────────┐
│   Zustand    │
│   (state)    │
└──────────────┘
       │
       ▼
┌──────────────┐
│     UI       │
└──────────────┘
```

**Sync triggers:**
- App initialization (if online)
- After creating location
- After finishing session
- Manual sync button
- Midnight cleanup

📖 [Full Data Architecture Documentation](docs/DATA_ARCHITECTURE.md)

## Database Schema

### locations
| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| user_id | UUID | FK → auth.users |
| name | TEXT | Location name |
| latitude | REAL | Latitude |
| longitude | REAL | Longitude |
| radius | INTEGER | Radius in meters (default: 100) |
| color | TEXT | Hex color (default: #3B82F6) |
| status | TEXT | 'active' \| 'deleted' \| 'pending_delete' |
| created_at | TEXT | Creation timestamp |
| synced_at | TEXT | Last sync timestamp |

### records
| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| user_id | UUID | FK → auth.users |
| location_id | UUID | FK → locations |
| location_name | TEXT | Location name (cached) |
| entry_at | TEXT | Entry timestamp |
| exit_at | TEXT | Exit timestamp (null = active) |
| pause_minutes | INTEGER | Total break time |
| type | TEXT | 'automatic' \| 'manual' |
| manually_edited | INTEGER | If adjusted by user |
| edit_reason | TEXT | Reason for adjustment |

## DevMonitor

Floating button (🔧) available in development:

- **Logs**: Real-time with level filters
- **Stats**: Table counts, sync status
- **Actions**: Force sync, purge deleted, reset database

## Required Permissions

### Android
- ACCESS_FINE_LOCATION
- ACCESS_COARSE_LOCATION
- ACCESS_BACKGROUND_LOCATION
- FOREGROUND_SERVICE
- FOREGROUND_SERVICE_LOCATION

### iOS
- NSLocationWhenInUseUsageDescription
- NSLocationAlwaysAndWhenInUseUsageDescription
- UIBackgroundModes: location

## Build

```bash
# EAS Build (production)
npx eas build --platform android
npx eas build --platform ios

# Local build
npx expo run:android --variant release
npx expo run:ios --configuration Release

# Via GitHub Actions (recommended)
# Go to Actions > Build Android APK > Run workflow
```

## Troubleshooting

### Geofencing not detecting entry/exit
1. Check "Always" permission for location
2. Disable battery optimization for the app
3. Check if radius is large enough (min 50m)

### Sync not working
1. Check internet connection
2. Verify Supabase environment variables
3. Use DevMonitor to see error logs

### TypeScript errors on build
1. Run `npx tsc --noEmit` locally
2. Fix listed errors
3. Push again

### Logger category error
Valid categories: `boot`, `database`, `session`, `geofence`, `notification`, `sync`, `record`

## Documentation

| Document | Description |
|----------|-------------|
| [PIPELINE.md](docs/PIPELINE.md) | CI/CD workflow and validation |
| [DATA_ARCHITECTURE.md](docs/DATA_ARCHITECTURE.md) | Database schema and sync |
| [BACKGROUND_SYSTEM.md](docs/BACKGROUND_SYSTEM.md) | Geofencing and background tasks |
| [REPORT_SYSTEM.md](docs/REPORT_SYSTEM.md) | Report generation and sharing |

## Contributing

1. Run `npx tsc --noEmit` before each push
2. Test on Expo Go / dev build
3. Use descriptive commits (feat/fix/docs/refactor)
4. Use `[skip ci]` for docs/WIP commits

## License

MIT © OnSite Club

---

*Last updated: January 2025*
