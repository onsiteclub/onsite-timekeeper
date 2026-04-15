# OnSite Timekeeper - Claude Code Context

> **Auto-loaded by Claude Code** - This file provides persistent context for AI-assisted development

---

## Core Philosophy

**"Digital notepad for work hours"** - Zero friction time tracking with optional geofencing premium feature

**Freemium Model:**
- FREE: Manual time entry (Log screen focus)
- PAID: Auto geofencing (detect entry/exit automatically)

---

## Architecture

### Primary Data Store: daily_hours
```
daily_hours (1 record per day)
    |
    | GPS triggers via
    |
exitHandler <--- bgGeo (Transistorsoft) <--- OS geofence events
    |
    +--- active_tracking (singleton for current session)
```

### Key Concepts:
- **daily_hours**: User-facing consolidated view (what appears in UI/reports)
- **active_tracking**: Temporary singleton during geofence session (cleared on exit)
- **location_audit**: GPS proof trail for entry/exit events
- **exitHandler**: 60s cooldown for GPS exits, immediate for manual

### Dependency Chain
```
locationStore --> exitHandler --> daily_hours (SQLite)
      |                              |
      +-> dailyLogStore --> UI       +-> syncStore --> Supabase
```

**When modifying ANY of these, ALWAYS check impact on:**
1. `src/lib/exitHandler.ts` (geofence exit logic)
2. `src/lib/bgGeo.ts` (Transistorsoft integration)
3. `src/stores/dailyLogStore.ts` (UI state)
4. `src/stores/syncStore.ts` (Supabase sync)

### NEVER:
- Use records table (DELETED in V3)
- Use recordStore (DELETED in V3)
- Add PII (emails, exact coords, dollar amounts, client names) to production logs
- Create duplicate tracking/analytics systems
- Skip offline-first patterns in any new feature
- Use `toISOString().split('T')[0]` for dates (timezone bug — use `toLocalDateString()`)

---

## Screen Structure

```
+---------------------------------------------+
|  Log  |  Invoices  |  Locations  |          |
+---------------------------------------------+
reports.tsx  invoice.tsx   map.tsx
```

- **Log** (`reports.tsx`): Calendar + day detail modal + reports/export (home tab redirects here)
- **Invoices** (`invoice.tsx`): Invoice dashboard + creation wizards (hourly & products/services)
- **Locations** (`map.tsx`): Geofence map + location management
- **Hidden tabs**: `settings.tsx` (via header gear icon), `team.tsx` (future), `index.tsx` (redirects to reports)

### Additional Screens (not tabs)
- `app/business-profile.tsx` - Business profile setup (for invoices)
- `app/legal.tsx` - Terms/Privacy
- `app/logs.tsx` - Debug log viewer
- `app/(auth)/complete-profile.tsx` - Post-signup profile completion

---

## Database Schema

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

-- Invoicing
invoices:
  id, user_id, invoice_number, type ('hourly'|'products_services'),
  client_name, client_id, status ('pending'|'paid'|'cancelled'),
  subtotal, tax_rate, tax_amount, total, hourly_rate,
  period_start, period_end, due_date, notes, pdf_uri,
  created_at, updated_at, synced_at

invoice_items:
  id, invoice_id, description, quantity, unit_price, total, sort_order

clients:
  id, user_id, client_name, email, phone,
  address_street, address_city, address_province, address_postal_code,
  notes, created_at, updated_at

business_profile:
  id, user_id, business_name, owner_name, email, phone,
  address_street, address_city, address_province, address_postal_code,
  logo_uri, next_invoice_number, gst_number, created_at, updated_at

-- Analytics (local only)
analytics_daily: ...
error_log: ...
```

### Supabase Tables (Remote)
```
daily_hours               -> bi-directional sync
app_timekeeper_geofences  -> bi-directional sync (locations)
location_audit            -> upload only (proof trail)
analytics_daily           -> marked synced locally
error_log                 -> marked synced locally
```
NOTE: Supabase `daily_hours` does NOT have a `type` column (local SQLite does). Never include `type` in sync payloads.

---

## Invoice System

### Two Invoice Types
1. **Hourly** (`type: 'hourly'`): Picks date range from calendar -> calculates from daily_hours records -> generates PDF with daily breakdown
2. **Products/Services** (`type: 'products_services'`): Custom line items with description, quantity, unit price -> generates PDF

### Wizard Flows
**Hourly Invoice Wizard** (3-step modal):
- Step 1: Date range selection (custom Calendar component)
- Step 2: Client name/selection + due date picker (default today+30)
- Step 3: Summary (InvoiceSummaryCard) + generate button

**Services Wizard** (ServicesWizard.tsx - separate component):
- Step 1: Line items (description, qty, unit price)
- Step 2: Client + due date + tax
- Step 3: Summary + generate

### Key Invoice Files
- `app/(tabs)/invoice.tsx` - Dashboard + hourly wizard (large file ~2400 lines)
- `src/screens/invoice/ServicesWizard.tsx` - Products/services wizard
- `src/screens/invoice/InvoiceSummaryCard.tsx` - Reusable summary display
- `src/stores/invoiceStore.ts` - Invoice + client state management
- `src/lib/database/invoices.ts` - Invoice CRUD + aggregates
- `src/lib/database/clients.ts` - Client CRUD (save for autofill)
- `src/lib/invoicePdf.ts` - HTML template generation + PDF export
- `src/stores/businessProfileStore.ts` - Business profile + invoice numbering

### PDF Generation
- `src/lib/invoicePdf.ts` - Generates HTML templates, uses `expo-print` for PDF
- `src/lib/timesheetPdf.ts` - Timesheet/report PDF export
- Both support "Payment due by" with actual due_date or fallback +30 days

---

## Styles Organization

**Modular structure in `/src/screens/home/styles/`:**
```
/styles/
  index.ts           <- Re-exports everything
  shared.styles.ts   <- Header, badges, modals, cards
  home.styles.ts     <- Manual entry form, timer
  reports.styles.ts  <- Calendar, day modal, export
```
Note: `legacy.styles.ts` has been deleted.

---

## Observability & Security Stack

### Layer 1: Runtime Logging
**File:** `src/lib/logger.ts`
- In-memory only (max 500 logs)
- Categories: auth, gps, geofence, sync, session, ui, boot, database, dailyLog, invoice, voice
- **Privacy**: Auto-masks emails and coordinates
- **`__DEV__` pattern**: Sensitive data (client names, dollar amounts) only logged in dev mode

### Layer 2: SQLite Persistence
**Files:** `src/lib/database/`
```
daily.ts         -> Daily hours CRUD (user-facing data)
invoices.ts      -> Invoice + invoice_items CRUD
clients.ts       -> Client CRUD (invoice autofill)
businessProfile.ts -> Business profile CRUD
analytics.ts     -> Metrics/KPIs (analytics_daily table)
errors.ts        -> Structured errors (error_log table)
audit.ts         -> GPS proof (location_audit table)
```

### Layer 3: Sync
**File:** `src/stores/syncStore.ts`
- Bi-directional: locations, daily_hours
- Upload only: location_audit
- Local only: analytics_daily, error_log
- Triggers: midnight, app init, manual sync, after geofence exit

### Layer 4: Sentry (Remote Crash Reporting)
**File:** `src/lib/sentry.ts`
- PII sanitization in `beforeSend`: GPS coords, dollar amounts, client names, emails, phones
- Breadcrumb allowlist: navigation, ui.click, geofence, sync, invoice
- Security monitoring: SSL pinning blocks, auth failures logged via `captureMessage`
- `tracesSampleRate: 0.1` (10% of transactions)

### Layer 5: SSL Pinning
**File:** `src/lib/sslPinning.ts`
- JS-level domain validation for all fetch requests
- Allowlist: Supabase host, Google Maps, Sentry, Expo, Transistorsoft
- Blocks unauthorized hosts in production (allows in `__DEV__`)
- Reports blocks to Sentry for security monitoring
- Android `network_security_config.xml` via config plugin for native HTTPS enforcement

**NEVER create duplicate systems** - use existing layers above

---

## Tech Stack

### State Management (Zustand)
- `src/stores/dailyLogStore.ts` - Primary UI state (daily hours + tracking)
- `src/stores/locationStore.ts` - Geofences + entry/exit handlers
- `src/stores/syncStore.ts` - Supabase sync orchestration
- `src/stores/invoiceStore.ts` - Invoice dashboard + client management
- `src/stores/businessProfileStore.ts` - Business profile + invoice numbering
- `src/stores/authStore.ts` - Auth state + session management
- `src/stores/settingsStore.ts` - User preferences
- **NO Redux** - don't introduce it

### Storage
- **SQLite (expo-sqlite)** - Local persistence (source of truth)
- **Supabase** - Remote sync + auth

### Location Services
- **Transistorsoft BackgroundGeolocation** (`src/lib/bgGeo.ts`) - Geofencing + background tracking
- **expo-location** - Foreground GPS only
- See MEMORY.md for Transistorsoft SDK gotchas (enums, flat config, Kotlin version)

### AI System
- `src/lib/ai/voice.ts` - Voice command processing (Whisper STT -> GPT interpretation)
- `src/lib/ai/whisper.ts` - Whisper speech-to-text integration
- `src/lib/ai/interpreter.ts` - AI Guardian for geofence events (CONSULTANT role, never blocks exits)
- `src/lib/ai/secretary.ts` - AI time corrections
- `src/lib/ai/timekeeperSystemPrompt.ts` - System prompt for AI interactions
- Currently disabled in UI (TODO comment in _layout.tsx)

### Offline-First
- **ALWAYS** assume offline capability
- Sync to Supabase when online
- Local SQLite is source of truth

---

## Privacy & Compliance

### PII Rules
```typescript
// NEVER log exact coordinates in production
logger.info('gps', `Location acquired (${lat.toFixed(2)}, ${lon.toFixed(2)})`);

// NEVER log emails in production
logger.info('auth', `User ${maskEmail(user.email)} logged in`);

// Use __DEV__ guard for sensitive data
logger.info('invoice', `Invoice created: ${invoiceNumber}${__DEV__ ? ` - $${total}` : ''}`);
logger.info('invoice', `Client: ${__DEV__ ? clientName : 'client'}`);
```

### PII Categories (enforced in Sentry + logger)
- **GPS**: lat, lng, longitude, latitude, coord
- **Financial**: amount, total, subtotal, price, rate, cost
- **Identity**: client_name, name, phone, address, street, email

### Audit Trail
- GPS coordinates stored in `location_audit` (Supabase)
- Used for disputes/proof of entry-exit
- Encrypted at rest (Supabase RLS enabled)

---

## Reusable Components

### `/src/components/ui/` (barrel export via `index.ts`)
- `Button.tsx` - Standard button with variants
- `PressableOpacity.tsx` - Pressable with opacity feedback
- `AvatarCircle.tsx` - User avatar display
- `ErrorBox.tsx` - Error message display
- `HeaderRow.tsx` - Screen header with actions
- `SectionHeader.tsx` - Section titles
- `ModalOverlay.tsx` - Modal backdrop/container
- `PermissionModal.tsx` - Permission request modal
- `ToggleRow.tsx` - Settings toggle row
- `OfflineBanner.tsx` - Offline status indicator

### `/src/components/` (standalone)
- `Calendar.tsx` - Custom calendar for date/range selection (used in invoices + reports)
- `CollapsibleCard.tsx` - Expandable/collapsible card
- `ErrorBoundary.tsx` - React error boundary wrapper
- `PermissionBanner.tsx` - Permission status banner
- `VoiceCommandSheet.tsx` - Voice command bottom sheet (currently disabled)
- `FloatingMicButton.tsx` - Floating mic FAB (currently disabled)

### `/src/hooks/`
- `useAutoLogToggle.ts` - Auto-logging toggle logic
- `usePermissionStatus.ts` - Permission state management

---

## Utility Libraries

- `src/lib/format.ts` - Number/currency/duration formatting helpers
- `src/lib/constructionPresets.ts` - Construction industry presets (locations, rates)
- `src/lib/bootstrap.ts` - App initialization sequence
- `src/lib/notifications.ts` - Push notification handling
- `src/lib/appAttestation.ts` - App integrity verification
- `src/lib/geocoding.ts` - Reverse geocoding
- `src/lib/reports.ts` - Report generation helpers
- `src/lib/eventLog.ts` - Event logging utilities
- `src/lib/telemetry.ts` - Analytics telemetry
- `src/lib/constants.ts` - App-wide constants
- `src/lib/platform.ts` - Platform detection utilities

---

## Known Issues & Gotchas

### Timezone Bug (Critical)
- `new Date().toISOString().split('T')[0]` returns **UTC date**, not local date
- Use `toLocalDateString()` from `src/lib/database/core.ts` for YYYY-MM-DD
- Use `getToday()` from `core.ts` for canonical "today" string
- Use `getDateString()` from `daily.ts` for Date or string inputs

### Geofencing
- **Exit cooldown**: 60 seconds via exitHandler (prevents ping-pong)
- **Manual exit**: Immediate (no cooldown)
- **Bolinha Azul principle**: If blue dot is outside fence = user left. NEVER block exits
- **AI Guardian**: CONSULTANT role only — suggests but never blocks exits
- **Reconfigure window**: >= 5s (OS fires phantom events up to 20s after restart)
- `logGeofenceEvent()` must be called AFTER AI verdict (prevents phantom count)

### Transistorsoft SDK
- Named enum exports don't exist at runtime — use static getters
- Config is FLAT at runtime despite v5 types saying nested — use `as any`
- `expo prebuild --clean` wipes android/ — gradle fixes must go through app.json plugins

### Supabase Sync
- Local `daily_hours` has `type` column, Supabase does NOT — exclude from payloads
- Always verify column mapping between local SQLite and Supabase tables

### React Hooks
- Functions used as useEffect/useCallback dependencies MUST be memoized
- `useHomeScreen()` hook is shared between Home and Reports screens (separate instances)

---

## Coding Conventions

### TypeScript
- **Strict mode enabled** - no implicit any
- **Interface over Type** for object shapes
- **Type imports** separate from value imports

### File Naming
- **Components**: PascalCase (e.g., `Calendar.tsx`, `InvoiceSummaryCard.tsx`)
- **Utilities**: camelCase (e.g., `format.ts`, `invoicePdf.ts`)
- **Stores**: camelCase (e.g., `invoiceStore.ts`, `dailyLogStore.ts`)
- **Database**: camelCase (e.g., `invoices.ts`, `clients.ts`)

### Imports Order
```typescript
// 1. React/React Native
import React from 'react';
import { View } from 'react-native';

// 2. Third-party
import { create } from 'zustand';

// 3. Internal utilities/stores
import { logger } from '@/lib/logger';
import { useDailyLogStore } from '@/stores/dailyLogStore';

// 4. Relative imports
import { InvoiceSummaryCard } from './InvoiceSummaryCard';
```

---

## Key Files Reference

### Core State (Stores)
- `src/stores/dailyLogStore.ts` - Daily hours + tracking UI state
- `src/stores/locationStore.ts` - Geofences + entry/exit handlers
- `src/stores/syncStore.ts` - Supabase sync orchestration
- `src/stores/invoiceStore.ts` - Invoice + client management
- `src/stores/businessProfileStore.ts` - Business profile + numbering
- `src/stores/authStore.ts` - Auth + failed login Sentry logging
- `src/stores/settingsStore.ts` - User preferences

### Geofence Logic
- `src/lib/exitHandler.ts` - Exit confirmation + cooldown
- `src/lib/bgGeo.ts` - Transistorsoft BackgroundGeolocation integration
- `src/stores/locationStore.ts` - Geofence state management
- `src/lib/ai/interpreter.ts` - AI Guardian (consultant role)

### Database
- `src/lib/database/core.ts` - SQLite init + types + migrations + `toLocalDateString()`
- `src/lib/database/daily.ts` - daily_hours CRUD
- `src/lib/database/locations.ts` - Geofence CRUD
- `src/lib/database/invoices.ts` - Invoice + items CRUD
- `src/lib/database/clients.ts` - Client CRUD
- `src/lib/database/businessProfile.ts` - Business profile CRUD
- `src/lib/database/audit.ts` - GPS audit trail
- `src/lib/database/analytics.ts` - Metrics tracking
- `src/lib/database/errors.ts` - Error capture

### Security
- `src/lib/sslPinning.ts` - Fetch interceptor + domain validation
- `src/lib/sentry.ts` - Crash reporting + PII sanitization
- `src/lib/appAttestation.ts` - App integrity

### UI Hooks & Screens
- `src/screens/home/hooks.ts` - Main screen hook (shared by Log + Reports)
- `src/screens/home/helpers.ts` - Date/calendar utilities
- `src/screens/map/hooks.ts` - Map screen hook
- `src/screens/invoice/ServicesWizard.tsx` - Products/services invoice wizard
- `src/screens/invoice/InvoiceSummaryCard.tsx` - Invoice summary display

### Tabs
- `app/(tabs)/reports.tsx` - Log tab (calendar + reports)
- `app/(tabs)/invoice.tsx` - Invoices tab (dashboard + hourly wizard)
- `app/(tabs)/map.tsx` - Locations tab (geofence map)
- `app/(tabs)/settings.tsx` - Settings (hidden, accessed via gear icon)

---

## Related Files (Feature Impact)

**Geofencing changes:**
- `src/lib/exitHandler.ts`, `src/lib/bgGeo.ts`, `src/stores/locationStore.ts`
- `src/lib/ai/interpreter.ts` (AI Guardian)

**Daily hours/tracking:**
- `src/stores/dailyLogStore.ts`, `src/lib/database/daily.ts`, `src/screens/home/hooks.ts`

**Invoice changes:**
- `src/stores/invoiceStore.ts`, `src/lib/database/invoices.ts`, `src/lib/database/clients.ts`
- `src/lib/invoicePdf.ts`, `src/screens/invoice/InvoiceSummaryCard.tsx`
- `src/stores/businessProfileStore.ts`, `src/lib/database/businessProfile.ts`

**Sync changes:**
- `src/stores/syncStore.ts`
- `src/lib/database/` (getUnsynced*, markSynced*, upsertFromSync)

**Security changes:**
- `src/lib/sslPinning.ts`, `src/lib/sentry.ts`, `src/stores/authStore.ts`

---

*Last updated: 2026-04-14*
*Auto-loaded by Claude Code for context-aware development*
