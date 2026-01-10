# 📊 OnSite Timekeeper - Report System Documentation

> **CLAUDE: Before making ANY changes to reports, request these files:**
> ```
> src/lib/reports.ts
> src/screens/home/hooks.ts
> src/stores/settingsStore.ts
> src/lib/notifications.ts
> app/_layout.tsx
> ```
> **Do NOT guess or assume - always verify current implementation first.**

---

## 📋 Table of Contents

1. [Overview](#overview)
2. [Data Flow](#data-flow)
3. [Report Generation](#report-generation)
4. [Report Sharing Methods](#report-sharing-methods)
5. [Auto-Report System](#auto-report-system)
6. [File Structure](#file-structure)
7. [Database Schema](#database-schema)
8. [Customization Points](#customization-points)

---

## Overview

The OnSite Timekeeper report system generates time tracking reports from work sessions stored in SQLite. Reports can be:

- **Manually triggered** by the user via export buttons
- **Automatically prompted** via scheduled notifications (Report Reminder)

### Key Features

| Feature | Description |
|---------|-------------|
| Text Reports | Plain text format, shareable via any app |
| File Export | `.txt` file saved to device |
| Favorite Contact | One-tap send to WhatsApp or Email |
| Report Reminder | Weekly/bi-weekly/monthly notification |
| Session Selection | Export specific sessions or date ranges |

---

## Data Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                        DATA SOURCES                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  SQLite Database (records table)                                │
│  ├── id                                                         │
│  ├── user_id                                                    │
│  ├── location_id                                                │
│  ├── location_name                                              │
│  ├── entry_at (ISO timestamp)                                   │
│  ├── exit_at (ISO timestamp)                                    │
│  ├── pause_minutes                                              │
│  ├── type ('automatic' | 'manual')                              │
│  └── manually_edited                                            │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      DATA RETRIEVAL                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  recordStore.getSessionsByPeriod(startDate, endDate)            │
│  └── Returns: ComputedSession[]                                 │
│      ├── id, location_id, location_name                         │
│      ├── entry_at, exit_at                                      │
│      ├── duration_minutes (calculated)                          │
│      ├── pause_minutes                                          │
│      └── status ('active' | 'finished')                         │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    REPORT GENERATION                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  src/lib/reports.ts                                             │
│  ├── generateSessionReport(session, userName?)                  │
│  │   └── Single session report                                  │
│  │                                                              │
│  └── generateCompleteReport(sessions[], userName?)              │
│      └── Multi-session report with totals                       │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      DISTRIBUTION                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Share API ──────────► Any app (WhatsApp, Telegram, etc.)       │
│  File System ────────► .txt file download                       │
│  Linking (WhatsApp) ─► Direct to specific contact               │
│  Linking (Email) ────► Mail composer with pre-filled body       │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Report Generation

### Location: `src/lib/reports.ts`

### Functions

#### `generateSessionReport(session, userName?)`

Generates a report for a **single session**.

```typescript
function generateSessionReport(
  session: ComputedSession,
  userName?: string
): string
```

**Output Example:**
```
📋 WORK RECORD
══════════════════════════

👤 Employee: John Doe
📍 Location: Office Downtown
📅 Date: Wed, Jan 08, 2025

⏰ Entry: 08:02 AM
⏰ Exit: 05:45 PM
☕ Break: 30 min

⏱️ Total: 9h 13min

──────────────────────────
Generated by OnSite Timekeeper
```

#### `generateCompleteReport(sessions[], userName?)`

Generates a report for **multiple sessions** with daily breakdown and totals.

```typescript
function generateCompleteReport(
  sessions: ComputedSession[],
  userName?: string
): string
```

**Output Example:**
```
📊 HOURS REPORT
══════════════════════════════════════

👤 Employee: John Doe
📅 Period: Jan 05 - Jan 11, 2025

──────────────────────────────────────
📅 DAILY BREAKDOWN
──────────────────────────────────────

Monday, Jan 06
  📍 Office Downtown
     08:00 → 17:30 (☕ 30min)
     ▸ 9h 00min

Tuesday, Jan 07
  📍 Office Downtown
     08:15 → 18:00 (☕ 45min)
     ▸ 9h 00min

  📍 Client Site
     19:00 → 21:00
     ▸ 2h 00min

──────────────────────────────────────
📈 SUMMARY
──────────────────────────────────────

Total Sessions: 3
Total Hours: 20h 00min

──────────────────────────────────────
Generated by OnSite Timekeeper
```

### Report Content Structure

| Section | Content |
|---------|---------|
| Header | App name, employee name, period |
| Daily Breakdown | Grouped by date, shows each session |
| Session Line | Location, entry → exit, break, duration |
| Summary | Total sessions, total hours |
| Footer | "Generated by OnSite Timekeeper" |

---

## Report Sharing Methods

### 1. Share API (General)

**Trigger:** "💬 Share" button in export modal

**File:** `src/screens/home/hooks.ts` → `exportAsText()`

```typescript
await Share.share({ 
  message: report, 
  title: 'Time Report' 
});
```

Opens system share sheet - user chooses destination app.

---

### 2. File Export

**Trigger:** "📄 File" button in export modal

**File:** `src/screens/home/hooks.ts` → `exportAsFile()`

```typescript
const fileName = `report_${date}.txt`;
const filePath = `${FileSystem.cacheDirectory}${fileName}`;
await FileSystem.writeAsStringAsync(filePath, report);
await Sharing.shareAsync(filePath, { mimeType: 'text/plain' });
```

Creates `.txt` file and opens share dialog for saving.

---

### 3. Favorite Contact (WhatsApp)

**Trigger:** "📱 [Contact Name]" button in export modal

**File:** `src/screens/home/hooks.ts` → `sendToFavorite()`

```typescript
const phone = favoriteContact.value.replace(/\D/g, '');
const url = `whatsapp://send?phone=${phone}&text=${encodeURIComponent(report)}`;
await Linking.openURL(url);
```

Opens WhatsApp with:
- Pre-selected contact (by phone number)
- Pre-filled message (report text)
- User just taps "Send"

---

### 4. Favorite Contact (Email)

**Trigger:** "📧 [Contact Name]" button in export modal

**File:** `src/screens/home/hooks.ts` → `sendToFavorite()`

```typescript
const url = `mailto:${email}?subject=${subject}&body=${encodeURIComponent(report)}`;
await Linking.openURL(url);
```

Opens default email app with:
- To: favorite email
- Subject: "Time Report - OnSite Timekeeper"
- Body: report text

---

## Auto-Report System

### Overview

The auto-report system sends periodic notifications reminding the user to export their time report. It does NOT send automatically (WhatsApp limitation) - it prompts the user.

### Configuration

**Location:** Settings > Auto-Report

```typescript
interface FavoriteContact {
  type: 'whatsapp' | 'email';
  value: string;       // phone or email
  name?: string;       // display label
}

interface ReportReminder {
  enabled: boolean;
  frequency: 'weekly' | 'biweekly' | 'monthly';
  dayOfWeek: number;   // 0-6 (Sun-Sat)
  hour: number;        // 0-23
  minute: number;      // 0-59
}
```

### Notification Flow

```
┌─────────────────────────────────────────────────────────────────┐
│  STEP 1: Schedule (on app boot or settings change)             │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  app/_layout.tsx (bootstrap)                                    │
│  └── scheduleReportReminder(config)                            │
│      └── Calculates next trigger date                          │
│      └── Schedules notification with expo-notifications        │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  STEP 2: Notification Arrives (e.g., Friday 18:00)             │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ 📊 Report Ready                                         │   │
│  │ Your weekly report is ready to send                     │   │
│  │                                                         │   │
│  │ [📤 Send Now]              [⏰ Later]                   │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
                              │
              ┌───────────────┴───────────────┐
              ▼                               ▼
┌──────────────────────────┐    ┌──────────────────────────┐
│  [Send Now] clicked      │    │  [Later] clicked         │
├──────────────────────────┤    ├──────────────────────────┤
│                          │    │                          │
│  app/_layout.tsx         │    │  scheduleRemindLater()   │
│  └── handleNotification  │    │  └── +1 hour reminder    │
│      Response()          │    │                          │
│      │                   │    │                          │
│      ├── Set pending     │    └──────────────────────────┘
│      │   export flag     │
│      │                   │
│      ├── router.push('/') 
│      │                   │
│      └── Reschedule next │
│          week's reminder │
│                          │
└──────────────────────────┘
              │
              ▼
┌─────────────────────────────────────────────────────────────────┐
│  STEP 3: Home Screen Handles Pending Export                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  src/screens/home/hooks.ts                                      │
│  └── useEffect detects pendingReportExport.trigger = true      │
│      └── handlePendingExport()                                 │
│          ├── Fetch sessions for period                         │
│          ├── Calculate total hours                             │
│          ├── Show Alert with export options                    │
│          └── Clear pending flag                                │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ 📊 Weekly Report                                        │   │
│  │ 42h 30min worked                                        │   │
│  │ Jan 05 - Jan 11                                         │   │
│  │ 12 session(s)                                           │   │
│  │                                                         │   │
│  │ [📱 Send to Supervisor]                                 │   │
│  │ [💬 Share]                                              │   │
│  │ [📄 Save File]                                          │   │
│  │ [Cancel]                                                │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## File Structure

### Core Files

```
src/
├── lib/
│   ├── reports.ts              # 📄 Report text generation
│   ├── notifications.ts        # 🔔 Notification scheduling
│   └── database.ts             # 💾 Session queries (ComputedSession type)
│
├── stores/
│   ├── settingsStore.ts        # ⚙️ FavoriteContact, ReportReminder, pendingExport
│   └── recordStore.ts          # 📝 getSessionsByPeriod()
│
├── screens/
│   └── home/
│       ├── hooks.ts            # 🎣 Export handlers, pending export logic
│       ├── index.tsx           # 📱 UI (export buttons, day modal)
│       └── helpers.ts          # 📅 Date utilities (getWeekStart, etc.)
│
app/
├── _layout.tsx                 # 🚀 Notification response listener
└── (tabs)/
    └── settings.tsx            # ⚙️ Auto-Report configuration UI
```

### File Responsibilities

| File | Responsibility |
|------|----------------|
| `reports.ts` | Text formatting and report structure |
| `notifications.ts` | Schedule/cancel reminders, notification categories |
| `settingsStore.ts` | Store favorite contact, reminder config, pending flag |
| `recordStore.ts` | Fetch sessions from database |
| `hooks.ts` | Export logic, sharing, pending export handler |
| `_layout.tsx` | Listen for notification responses |
| `settings.tsx` | UI for configuring auto-report |

---

## Database Schema

### records table

```sql
CREATE TABLE records (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  location_id TEXT NOT NULL,
  location_name TEXT NOT NULL,
  entry_at TEXT NOT NULL,        -- ISO timestamp
  exit_at TEXT,                  -- ISO timestamp (null if active)
  pause_minutes INTEGER DEFAULT 0,
  type TEXT DEFAULT 'automatic', -- 'automatic' | 'manual'
  manually_edited INTEGER DEFAULT 0,
  edit_reason TEXT,
  synced_at TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
```

### ComputedSession type

```typescript
interface ComputedSession {
  id: string;
  user_id: string;
  location_id: string;
  location_name: string;
  entry_at: string;
  exit_at: string | null;
  pause_minutes: number;
  type: 'automatic' | 'manual';
  manually_edited: number;
  duration_minutes: number;  // Calculated: exit - entry
  status: 'active' | 'finished';
}
```

---

## Customization Points

### To Change Report Text Format

1. Edit `src/lib/reports.ts`
2. Modify `generateCompleteReport()` or `generateSessionReport()`
3. Report structure is pure string concatenation

### To Add New Export Method

1. Edit `src/screens/home/hooks.ts`
2. Add new function (e.g., `exportAsPDF()`)
3. Add option to Alert in `handleExport()` and `handleExportFromModal()`

### To Change Notification Content

1. Edit `src/lib/notifications.ts`
2. Modify `scheduleReportReminder()` content fields

### To Add Report Fields

1. Update `src/lib/database.ts` → `ComputedSession` type
2. Update SQL query in `getSessionsByPeriod()`
3. Update `src/lib/reports.ts` to include new field

### To Change Reminder Frequencies

1. Edit `src/stores/settingsStore.ts` → `ReportReminder` type
2. Edit `src/lib/notifications.ts` → `getNextReminderDate()`
3. Edit `app/(tabs)/settings.tsx` → frequency selector UI

---

## Quick Reference

### Export Entry Points

| Trigger | Location | Function |
|---------|----------|----------|
| Day modal export button | `hooks.ts` | `handleExportFromModal()` |
| Calendar export button | `hooks.ts` | `handleExport()` |
| Notification [Send Now] | `_layout.tsx` → `hooks.ts` | `handlePendingExport()` |

### Key State Variables

| Variable | Store | Purpose |
|----------|-------|---------|
| `favoriteContact` | settingsStore | WhatsApp/Email recipient |
| `reportReminder` | settingsStore | Reminder schedule config |
| `pendingReportExport` | settingsStore | Flag for notification-triggered export |

---

## Troubleshooting

### Report not showing correct hours

1. Check `pause_minutes` is being subtracted
2. Verify `duration_minutes` calculation in database.ts
3. Check date range in `getSessionsByPeriod()`

### Notification not appearing

1. Check `reportReminder.enabled` is true
2. Verify notification permissions granted
3. Check `scheduleReportReminder()` is called on boot

### WhatsApp not opening

1. Phone number must include country code (no +)
2. WhatsApp must be installed
3. Check `Linking.canOpenURL()` result

---

*Last updated: January 2025*
*OnSite Timekeeper v2*
