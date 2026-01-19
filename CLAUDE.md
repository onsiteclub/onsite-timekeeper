# OnSite Timekeeper - Claude Code Context

> **Auto-loaded by Claude Code** - This file provides persistent context for AI-assisted development

---

## 🎯 Core Philosophy

**"Digital notepad for work hours"** - Zero friction time tracking with optional geofencing premium feature

**Freemium Model:**
- 🆓 FREE: Manual time entry (Home screen focus)
- 💰 PAID: Auto geofencing (detect entry/exit automatically)

---

## 🏗️ Critical Architecture Rules

### **GOLDEN RULE: Dependency Chain**
```
workSessionStore ──> backgroundTasks ──> geofencing ──> notifications
                 └──> syncStore ──> Supabase
```

**When modifying ANY of these, ALWAYS check impact on:**
1. `src/stores/workSessionStore/` (state management)
2. `src/services/backgroundTasks/` (geofencing logic)
3. `src/services/sync/` (Supabase sync)
4. Related UI components that consume the store

### **NEVER:**
- ❌ Modify workSessionStore without checking backgroundTasks usage
- ❌ Change geofence logic without checking session state impact
- ❌ Add PII (emails, exact coords) to logs (privacy compliance)
- ❌ Create duplicate tracking/analytics systems
- ❌ Skip offline-first patterns in any new feature

---

## 📱 Screen Structure (v1.1)

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

## 🎨 Styles Organization (v2.5)

**Modular structure in `/src/screens/home/styles/`:**

```
/styles/
├── index.ts           ← Re-exports everything (backward compatible)
├── shared.styles.ts   ← Header, badges, modals, cards (17KB)
├── home.styles.ts     ← fixedStyles v1.5, timer vertical (11KB)
├── reports.styles.ts  ← Calendar, day modal, export (14KB)
└── legacy.styles.ts   ← ⚠️ DEPRECATED - don't add new code here
```

**When adding new styles:**
- Put in appropriate module (shared/home/reports)
- Export from `index.ts`
- DON'T add to `legacy.styles.ts`

---

## 👁️ Observability Stack (4 Layers)

### Layer 1: Runtime Logging
**File:** `src/lib/logger.ts`
- In-memory only (max 500 logs)
- Categories: auth, gps, geofence, sync, session, ui, boot, heartbeat, ttl, etc.
- **Privacy**: Auto-masks emails and coordinates
- **NOT persisted** - use for development/debugging only

### Layer 2: SQLite Persistence
**Files:** `src/lib/database/`
```
analytics.ts  → Metrics/KPIs (analytics_daily table)
errors.ts     → Structured errors (error_log table)
audit.ts      → GPS proof (location_audit table)
```

### Layer 3: Sync
**File:** `src/stores/syncStore.ts`
- Uploads to Supabase: analytics_daily, error_log, location_audit
- Triggers: midnight, app init, manual sync, after important events

### Layer 4: Remote Storage
**Supabase tables:**
- `analytics_daily` - Aggregated metrics per day
- `error_log` - Structured errors for debugging
- `location_audit` - GPS entry/exit proof

**NEVER create duplicate systems** - use existing layers above

---

## 🛠️ Tech Stack

### State Management
- **Zustand** for global state (workSessionStore, syncStore)
- **NO Redux** - don't introduce it

### Storage
- **SQLite (expo-sqlite)** - Local persistence
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

### Geofencing
- **Ping-pong prevention**: Hysteresis system in place (don't remove)
- **TTL verification**: Background heartbeat checks pending actions
- **Accuracy threshold**: Only trigger if accuracy < 50m

### Session State
- **Initialization loops**: Fixed in v1.1 (don't reintroduce)
- **Active session check**: Use `workSessionStore.activeSession` (single source of truth)

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
- **Stores**: camelCase (e.g., `workSessionStore.ts`)

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
import { workSessionStore } from '@/stores/workSessionStore';

// 4. Relative imports
import { LocationCard } from './LocationCard';
import styles from './styles';
```

---

## 🗂️ Key Files Reference

### Core State
- `src/stores/workSessionStore/index.ts` - Main session state
- `src/stores/syncStore.ts` - Supabase sync orchestration

### Services
- `src/services/backgroundTasks/` - Geofencing logic
- `src/services/supabase/` - Database client
- `src/services/notifications/` - Push notifications

### Database
- `src/lib/database/analytics.ts` - Metrics tracking
- `src/lib/database/errors.ts` - Error capture
- `src/lib/database/audit.ts` - GPS audit trail

### Utilities
- `src/lib/logger.ts` - Runtime logging
- `src/lib/telemetry.ts` - UI tracking wrapper

### Screens
- `src/screens/home/index.tsx` - Main screen (manual entry)
- `src/screens/home/reports.tsx` - Reports tab
- `src/screens/home/map.tsx` - Locations tab

---

## 🎯 Current Status (v2.6)

### ✅ Completed
- Home UI v1.5 (50/25/25 layout)
- Reports UI v1.3 (calendar + bar chart)
- Styles modularization (v2.5)
- Full observability stack (4 layers)
- Geofencing with ping-pong prevention
- TTL system for pending actions

### 🚧 In Progress
- Notification tracking improvements
- PDF/Excel export reports

### 📋 Planned
- Analytics dashboard (Supabase queries)
- Geofencing as paid feature unlock

---

## 💡 When Making Changes

### Before Coding
1. **Search codebase** for dependencies: `grep -r "functionName"`
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
- `src/services/backgroundTasks/geofencing.ts`
- `src/stores/workSessionStore/actions.ts`
- `app.json` (task registration)

**Session management:**
- `src/stores/workSessionStore/index.ts`
- `src/lib/database/records.ts`
- `src/stores/syncStore.ts`

**UI changes:**
- Component file + `styles/` folder
- Parent screen state management
- Related store actions

---

*Last updated: 2025-01-13 (v2.6)*
*Auto-loaded by Claude Code for context-aware development*
