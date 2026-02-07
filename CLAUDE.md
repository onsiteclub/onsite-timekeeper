# OnSite Timekeeper - Claude Code Context

> **Auto-loaded by Claude Code** - This file provides persistent context for AI-assisted development

---

## 🎯 Core Philosophy

**"Digital notepad for work hours"** - Zero friction time tracking with optional geofencing premium feature

**Freemium Model:**
- 🆓 FREE: Manual time entry (Home screen focus)
- 💰 PAID: Auto geofencing (detect entry/exit automatically)

---

## 🏗️ V3 Architecture

### **Primary Data Store: daily_hours**
```
daily_hours (1 record per day)
    ↑
    │ GPS triggers via
    │
exitHandler ←─── geofenceLogic ←─── backgroundTasks
    │
    └─── active_tracking (singleton for current session)
```

### **Key Concepts:**
- **daily_hours**: User-facing consolidated view (what appears in UI/reports)
- **active_tracking**: Temporary singleton during geofence session (cleared on exit)
- **location_audit**: GPS proof trail for entry/exit events
- **exitHandler**: 60s cooldown for GPS exits, immediate for manual

### **Dependency Chain**
```
locationStore ──> exitHandler ──> daily_hours (SQLite)
      │                              │
      └──> dailyLogStore ──> UI     └──> syncStore ──> Supabase
```

**When modifying ANY of these, ALWAYS check impact on:**
1. `src/lib/exitHandler.ts` (geofence exit logic)
2. `src/lib/geofenceLogic.ts` (entry/exit triggers)
3. `src/stores/dailyLogStore.ts` (UI state)
4. `src/stores/syncStore.ts` (Supabase sync)

### **NEVER:**
- ❌ Use records table (DELETED in V3)
- ❌ Use recordStore (DELETED in V3)
- ❌ Add PII (emails, exact coords) to logs (privacy compliance)
- ❌ Create duplicate tracking/analytics systems
- ❌ Skip offline-first patterns in any new feature

---

## 📱 Screen Structure

```
┌─────────────────────────────────────────────┐
│  🏠 Home  │  📊 Reports  │  📍 Locations  │
└─────────────────────────────────────────────┘
  index.tsx   reports.tsx      map.tsx
```

### Home Layout (v1.5) - 50/25/25 Split
- **50%**: Manual entry form (inline, centralized inputs, BIGGER fonts)
- **25%**: Quick location cards (horizontal scroll)
- **25%**: Active timer (vertical layout, buttons BELOW timer)

---

## 🗄️ Database Schema (V3)

### SQLite Tables (Local)
```sql
-- Primary data store (user-facing)
daily_hours:
  id, user_id, date, total_minutes, break_minutes,
  location_name, location_id, verified, source,
  first_entry, last_exit, notes, created_at, updated_at, synced_at

-- Geofence zones
locations:
  id, user_id, name, latitude, longitude, radius, color,
  status, deleted_at, last_seen_at, created_at, updated_at, synced_at

-- Current tracking session (singleton, cleared on exit)
active_tracking:
  id ('current'), location_id, location_name, enter_at, created_at

-- GPS proof trail
location_audit:
  id, user_id, session_id, event_type, location_id, location_name,
  latitude, longitude, accuracy, occurred_at, created_at, synced_at

-- Analytics (local only)
analytics_daily: ...
error_log: ...
```

### Supabase Tables (Remote)
```
daily_hours        → bi-directional sync
app_timekeeper_geofences → bi-directional sync (locations)
location_audit     → upload only (proof trail)
analytics_daily    → marked synced locally
error_log          → marked synced locally
```

---

## 🎨 Styles Organization (v2.5)

**Modular structure in `/src/screens/home/styles/`:**

```
/styles/
├── index.ts           ← Re-exports everything (backward compatible)
├── shared.styles.ts   ← Header, badges, modals, cards
├── home.styles.ts     ← fixedStyles v1.5, timer vertical
├── reports.styles.ts  ← Calendar, day modal, export
└── legacy.styles.ts   ← DEPRECATED - don't add new code here
```

---

## 👁️ Observability Stack (4 Layers)

### Layer 1: Runtime Logging
**File:** `src/lib/logger.ts`
- In-memory only (max 500 logs)
- Categories: auth, gps, geofence, sync, session, ui, boot, database, dailyLog
- **Privacy**: Auto-masks emails and coordinates
- **NOT persisted** - use for development/debugging only

### Layer 2: SQLite Persistence
**Files:** `src/lib/database/`
```
daily.ts      → Daily hours CRUD (user-facing data)
analytics.ts  → Metrics/KPIs (analytics_daily table)
errors.ts     → Structured errors (error_log table)
audit.ts      → GPS proof (location_audit table)
```

### Layer 3: Sync
**File:** `src/stores/syncStore.ts`
- Bi-directional: locations, daily_hours
- Upload only: location_audit
- Local only: analytics_daily, error_log
- Triggers: midnight, app init, manual sync, after geofence exit

### Layer 4: Remote Storage
**Supabase tables:**
- `daily_hours` - User work hours (bi-directional)
- `app_timekeeper_geofences` - Geofence locations (bi-directional)
- `location_audit` - GPS entry/exit proof

**NEVER create duplicate systems** - use existing layers above

---

## 🛠️ Tech Stack

### State Management
- **Zustand** for global state (dailyLogStore, locationStore, syncStore)
- **NO Redux** - don't introduce it

### Storage
- **SQLite (expo-sqlite)** - Local persistence (source of truth)
- **Supabase** - Remote sync + auth

### Location Services
- **expo-location** - GPS
- **expo-task-manager** - Background geofencing
- **Geofencing task:** `GEOFENCE_TASK_NAME`

### Offline-First
- **ALWAYS** assume offline capability
- Sync to Supabase when online
- Local SQLite is source of truth

---

## 🔒 Privacy & Compliance

### PII Rules
```typescript
// ❌ NEVER log exact coordinates
logger.info('gps', `Lat: ${lat}, Lon: ${lon}`);

// ✅ ALWAYS mask in logs
logger.info('gps', `Location acquired (${lat.toFixed(2)}, ${lon.toFixed(2)})`);

// ❌ NEVER log emails
logger.info('auth', `User ${user.email} logged in`);

// ✅ ALWAYS mask emails
logger.info('auth', `User ${maskEmail(user.email)} logged in`);
```

### Audit Trail
- GPS coordinates stored in `location_audit` (Supabase)
- Used for disputes/proof of entry-exit
- Encrypted at rest (Supabase RLS enabled)

---

## 🚨 Known Issues & Gotchas

### Geofencing (V3)
- **Exit cooldown**: 60 seconds via exitHandler (prevents ping-pong)
- **Manual exit**: Immediate (no cooldown)
- **Accuracy threshold**: Only trigger if accuracy < 50m

### Session State (V3)
- **Active session check**: Use `active_tracking` table (singleton)
- **No session IDs**: V3 uses daily_hours (1 record per day)
- **Timer state**: `dailyLogStore.tracking` for UI

### Background Tasks
- **Headless tasks**: Run when app is killed
- **Must be registered**: In `app.json` under `taskName`
- **Permissions**: Location always + background location

---

## 📋 Coding Conventions

### TypeScript
- **Strict mode enabled** - no implicit any
- **Interface over Type** for object shapes
- **Type imports** separate from value imports

### File Naming
- **Screens**: PascalCase (e.g., `HomeScreen.tsx`)
- **Components**: PascalCase (e.g., `LocationCard.tsx`)
- **Utilities**: camelCase (e.g., `formatDuration.ts`)
- **Stores**: camelCase (e.g., `dailyLogStore.ts`)

### Imports Order
```typescript
// 1. React/React Native
import React from 'react';
import { View } from 'react-native';

// 2. Third-party
import { create } from 'zustand';
import * as Location from 'expo-location';

// 3. Internal utilities/stores
import { logger } from '@/lib/logger';
import { useDailyLogStore } from '@/stores/dailyLogStore';

// 4. Relative imports
import { LocationCard } from './LocationCard';
import styles from './styles';
```

---

## 🗂️ Key Files Reference (V3)

### Core State
- `src/stores/dailyLogStore.ts` - Primary UI state (daily hours + tracking)
- `src/stores/locationStore.ts` - Geofences + entry/exit handlers
- `src/stores/syncStore.ts` - Supabase sync orchestration

### Geofence Logic
- `src/lib/exitHandler.ts` - Exit confirmation + cooldown
- `src/lib/geofenceLogic.ts` - Entry/exit processing
- `src/lib/backgroundTasks.ts` - Background task registration

### Database
- `src/lib/database/core.ts` - SQLite init + types
- `src/lib/database/daily.ts` - daily_hours CRUD
- `src/lib/database/locations.ts` - Geofence CRUD
- `src/lib/database/audit.ts` - GPS audit trail
- `src/lib/database/analytics.ts` - Metrics tracking
- `src/lib/database/errors.ts` - Error capture

### UI Hooks
- `src/screens/home/hooks.ts` - Main screen hook (exports LegacySession/ComputedSession)
- `src/screens/home/helpers.ts` - Date/calendar utilities

### Screens
- `app/(tabs)/index.tsx` - Home (manual entry)
- `app/(tabs)/reports.tsx` - Reports (calendar + chart)
- `app/(tabs)/map.tsx` - Locations

---

## 🎯 Current Status (V3)

### ✅ Completed
- V3 Architecture (daily_hours as primary store)
- Records table removed (cleanup complete)
- Bi-directional sync for daily_hours
- Exit handler with 60s cooldown
- Full observability stack (4 layers)
- Reports migrated to dailyLogStore

### 🚧 Deprecated (V3)
- ~~workSessionStore~~ → use dailyLogStore + locationStore
- ~~recordStore~~ → DELETED
- ~~records table~~ → DELETED
- ~~heartbeat/TTL system~~ → replaced by exitHandler cooldown

### 📋 Future
- Analytics dashboard (Supabase queries)
- Geofencing as paid feature unlock
- Multi-location per day support

---

## 💡 When Making Changes

### Before Coding
1. **Search codebase** for dependencies
2. **Check imports** in related files
3. **Verify store usage** in UI components
4. **Consider offline implications**

### While Coding
- **Use existing logger categories** (don't create new ones)
- **Follow privacy rules** (mask PII)
- **Maintain offline-first** pattern
- **Add telemetry** for new user actions

### After Coding
- **Test offline mode**
- **Check console logs** (no PII leaks)
- **Verify sync** to Supabase
- **Update this file** if architecture changes

---

## 🔗 Related Files

When working on specific features, also review:

**Geofencing changes:**
- `src/lib/exitHandler.ts`
- `src/lib/geofenceLogic.ts`
- `src/stores/locationStore.ts`
- `app.json` (task registration)

**Daily hours/tracking:**
- `src/stores/dailyLogStore.ts`
- `src/lib/database/daily.ts`
- `src/screens/home/hooks.ts`

**Sync changes:**
- `src/stores/syncStore.ts`
- `src/lib/database/` (getUnsynced*, markSynced*, upsertFromSync)

**UI changes:**
- Component file + `styles/` folder
- `src/screens/home/hooks.ts`
- Related store actions

---

*Last updated: 2026-02-04 (V3)*
*Auto-loaded by Claude Code for context-aware development*
