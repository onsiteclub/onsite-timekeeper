# OnSite Timekeeper - Arquitetura v3.0

> **IMPORTANTE:** Envie este arquivo ao Claude quando pedir alterações grandes.
>
> **Status:** v3.0 - Arquitetura completa atualizada (2026-01-19)

---

## 📱 Visão Geral

App de time tracking para construção/trades com modelo **Freemium**:

| Modo | Descrição | Tier |
|------|-----------|------|
| **Manual** | Registro de horas na Home (foco principal) | FREE |
| **Auto (Geofencing)** | Detecta entrada/saída automaticamente | PAGO |

**Filosofia:** App é um "bloco de notas para horas". Sem fricção. Geofencing é plus.

---

## 🗂️ Estrutura de Pastas Completa

```
/src
├── /app                      # Expo Router (navegação)
│   ├── _layout.tsx           # Root layout + boot sequence
│   ├── index.tsx             # Redirect inicial
│   ├── /(auth)/              # Stack de autenticação
│   │   ├── _layout.tsx
│   │   ├── login.tsx
│   │   └── register.tsx
│   └── /(tabs)/              # Tab navigator principal
│       ├── _layout.tsx
│       ├── index.tsx         # → Home
│       ├── reports.tsx       # → Reports
│       ├── map.tsx           # → Locations
│       └── settings.tsx      # → Settings
│
├── /components               # Componentes reutilizáveis
│   ├── ErrorBoundary.tsx     # Fallback para erros
│   ├── PermissionBanner.tsx  # Status de permissões
│   └── /ui
│       └── Button.tsx        # Botão base
│
├── /constants
│   └── colors.ts             # Paleta de cores
│
├── /hooks
│   └── usePermissionStatus.ts # Hook de permissões
│
├── /lib                      # Serviços e utilitários
│   ├── /database             # SQLite modules
│   │   ├── index.ts          # Re-exports
│   │   ├── core.ts           # DB instance + schema + helpers
│   │   ├── locations.ts      # CRUD locations
│   │   ├── records.ts        # CRUD records/sessions
│   │   ├── analytics.ts      # Métricas agregadas
│   │   ├── errors.ts         # Error logging + ping-pong
│   │   ├── audit.ts          # GPS audit trail
│   │   └── debug.ts          # Debug utilities
│   │
│   ├── backgroundTasks.ts    # Task definitions (GEOFENCE, HEARTBEAT)
│   ├── backgroundTypes.ts    # Task types + constants
│   ├── backgroundHelpers.ts  # User ID, skipped, ping-pong helpers
│   ├── taskCallbacks.ts      # Callback registry
│   ├── geofenceLogic.ts      # Event processing + queue
│   ├── heartbeatLogic.ts     # Adaptive heartbeat
│   ├── pendingTTL.ts         # TTL + heartbeat interval
│   ├── location.ts           # Location API wrapper
│   ├── logger.ts             # Runtime logging (memória)
│   ├── telemetry.ts          # UI tracking wrapper
│   ├── notifications.ts      # Push + categories + actions
│   ├── bootstrap.ts          # Singleton listener setup
│   ├── geocoding.ts          # Reverse geocoding
│   ├── reports.ts            # Report generation
│   ├── supabase.ts           # Supabase client
│   └── constants.ts          # Global constants
│
├── /screens
│   ├── /home
│   │   ├── index.tsx         # Home screen (50/25/25)
│   │   ├── reports.tsx       # Reports tab
│   │   ├── map.tsx           # Locations map
│   │   ├── settings.tsx      # Settings modal
│   │   ├── helpers.ts        # Date/calendar utils
│   │   ├── hooks.ts          # useHomeScreen (45KB)
│   │   └── /styles
│   │       ├── index.ts      # Re-exports
│   │       ├── shared.styles.ts
│   │       ├── home.styles.ts
│   │       ├── reports.styles.ts
│   │       └── legacy.styles.ts (DEPRECATED)
│   └── /map
│       ├── index.tsx
│       ├── hooks.ts
│       ├── SearchBox.tsx
│       ├── styles.ts
│       └── constants.ts
│
└── /stores                   # Zustand state management
    ├── authStore.ts          # Auth + user session
    ├── locationStore.ts      # Geofences + monitoring
    ├── recordStore.ts        # Work records CRUD
    ├── workSessionStore.ts   # Pending actions + pause
    ├── sessionHelpers.ts     # Types + boot gate
    ├── sessionHandlers.ts    # Enter/exit logic
    ├── sessionActions.ts     # User action handlers
    ├── settingsStore.ts      # Preferences
    └── syncStore.ts          # Supabase sync
```

---

## 📍 Navegação (Expo Router)

```
┌─────────────────────────────────────────────────────────────┐
│  🏠 Home  │  📊 Reports  │  📍 Locations  │  ⚙️ Settings   │
└─────────────────────────────────────────────────────────────┘
      │            │              │               │
      │            │              │               └→ settings.tsx
      │            │              └→ map.tsx (MapView + geofences)
      │            └→ reports.tsx (calendário + charts)
      └→ index.tsx (form + timer + location carousel)
```

### Boot Sequence (`_layout.tsx`)

```
1. authStore.initialize()     → Supabase session
2. initDatabase()             → SQLite tables
3. locationStore.initialize() → Permissions + locations
4. recordStore.initialize()   → Today sessions
5. workSessionStore.initialize() → Notifications
6. syncStore.initialize()     → Network + midnight sync
7. bootstrap.initializeListeners() → Callbacks singleton
```

---

## 🏠 HOME - Layout v2.1

```
┌─────────────────────────────────────────┐
│ OnSite Logo                    [user]   │  Header (5%)
├─────────────────────────────────────────┤
│ <─ [Site A] [Site B] [Site C] [+] ─>   │  Location carousel (8%)
├─────────────────────────────────────────┤
│ 📅 Wed, Jan 15                  [▼]    │
│ Entry    [ 15:45  🕐 ]                 │
│ Exit     [ 18:30  🕐 ]                 │
│ Break    [ 60 min  ▼]                  │
│ Total: 2h 45min                        │
│ [✓ Save Hours]                         │  Manual entry (22%)
├─────────────────────────────────────────┤
│                                         │
│           ● Site A                      │
│          00:35:16                       │
│                                         │  Timer (flex: 1, ~65%)
│          [⏸]  [⏹]                      │
│                                         │
└─────────────────────────────────────────┘
```

---

## 🗄️ STORES (Zustand)

### authStore.ts

```typescript
interface AuthState {
  session: Session | null
  user: User | null
  isLoading: boolean
  isInitialized: boolean
  error: string | null
}

// Actions
initialize(): Promise<void>
signIn(email, pwd): Promise<void>
signUp(email, pwd): Promise<void>
signOut(): Promise<void>
refreshSession(): Promise<void>

// Helpers
getUserId(): string | null
getUserEmail(): string | null
getUserName(): string | null
isAuthenticated(): boolean
```

### locationStore.ts

```typescript
interface LocationState {
  locations: LocationDB[]
  isLoading: boolean
  isMonitoring: boolean
  currentLocation: LocationCoords | null
  activeSession: RecordDB | null
  permissionStatus: 'granted' | 'denied' | 'restricted'
  currentFenceId: string | null
  lastGeofenceEvent: GeofenceEvent | null
}

// CRUD
addLocation(name, lat, lng, radius, color): Promise<string>
editLocation(id, updates): Promise<void>
deleteLocation(id): Promise<void>
reloadLocations(): Promise<void>

// Monitoring
startMonitoring(): Promise<void>
stopMonitoring(): Promise<void>
restartMonitoring(): Promise<void>
reconcileState(): Promise<void>

// Events
handleGeofenceEvent(event): Promise<void>
handleManualEntry(locationId): Promise<void>
handleManualExit(locationId): Promise<void>
skipLocationToday(locationId): void
refreshCurrentLocation(): Promise<void>
```

### recordStore.ts

```typescript
interface RecordState {
  isInitialized: boolean
  currentSession: ComputedSession | null
  todaySessions: ComputedSession[]
  todayStats: DayStats
  lastFinishedSession: ComputedSession | null
}

// Actions
registerEntry(locationId, locationName, coords?): Promise<string>
registerExit(locationId, coords?): Promise<void>
registerExitWithAdjustment(locationId, coords?, adjustmentMin?): Promise<void>
deleteRecord(id): Promise<void>
editRecord(id, updates): Promise<void>
createManualRecord(params): Promise<string>
reloadData(): Promise<void>

// Reports
getSessionsByPeriod(startDate, endDate): Promise<ComputedSession[]>
shareLastSession(): Promise<void>
shareReport(startDate, endDate): Promise<void>
```

### workSessionStore.ts

```typescript
interface WorkSessionState {
  isInitialized: boolean
  pendingAction: PendingAction | null
  pauseState: PauseState | null
  skippedToday: string[]
  lastProcessedEnterLocationId: string | null
}

interface PendingAction {
  type: 'enter' | 'exit' | 'return'
  locationId: string
  locationName: string
  notificationId: string
  timeoutId: ReturnType<typeof setTimeout>
  coords?: { latitude, longitude, accuracy? }
  startTime: number
}

interface PauseState {
  isPaused: boolean
  locationId: string
  locationName: string
  startTime: number
  timeoutId: ReturnType<typeof setTimeout> | null
}

// Geofence handlers
handleGeofenceEnter(locationId, locationName, coords?): Promise<void>
handleGeofenceExit(locationId, locationName, coords?): Promise<void>

// User actions (notification buttons)
actionStart(): Promise<void>      // Confirma entrada
actionSkipToday(): Promise<void>  // Skip local hoje
actionOk(): Promise<void>         // Confirma saída
actionPause(): Promise<void>      // Pausa sessão
actionResume(): Promise<void>     // Retoma pausa
actionStop(): Promise<void>       // Para sessão
actionSnooze(): Promise<void>     // Estende pausa

// Helpers
clearPending(): void
clearPause(): void
resetSkippedToday(): void
resetBootGate(): void
```

### syncStore.ts

```typescript
interface SyncState {
  isSyncing: boolean
  lastSyncAt: Date | null
  isOnline: boolean
  lastSyncStats: SyncStats | null
  syncEnabled: boolean
}

// Actions
syncNow(): Promise<SyncStats>
syncLocationsOnly(): Promise<void>
syncRecordsOnly(): Promise<void>
forceFullSync(): Promise<void>
runCleanup(): Promise<void>
toggleSync(): void
```

### settingsStore.ts

```typescript
interface SettingsState {
  // Timers
  entryTimeoutMinutes: number      // 5
  exitTimeoutSeconds: number       // 15
  returnTimeoutMinutes: number     // 5
  pauseLimitMinutes: number        // 30
  exitAdjustmentMinutes: number    // 10

  // Notifications
  notificationsEnabled: boolean
  soundEnabled: boolean
  vibrationEnabled: boolean

  // Auto-actions
  autoStartEnabled: boolean
  autoStopEnabled: boolean

  // Geofencing
  defaultRadius: number            // 100m
  minimumLocationDistance: number  // 200m

  // Debug
  devMonitorEnabled: boolean
}
```

---

## 👁️ OBSERVABILIDADE - 4 Camadas

### Camada 1: Runtime Logger (`logger.ts`)

```typescript
// Categorias (17 tipos)
type LogCategory =
  | 'auth' | 'gps' | 'geofence' | 'sync' | 'database'
  | 'notification' | 'session' | 'ui' | 'boot' | 'heartbeat'
  | 'record' | 'telemetry' | 'ttl' | 'pingpong'
  | 'permissions' | 'settings' | 'registro'

// API
logger.debug(category, message, metadata?)
logger.info(category, message, metadata?)
logger.warn(category, message, metadata?)
logger.error(category, message, metadata?)

// Listeners (DevMonitor)
addLogListener(callback): () => void
getStoredLogs(): LogEntry[]
getLogsByLevel(level): LogEntry[]
getLogsByCategory(category): LogEntry[]
exportLogsAsText(): string
clearLogs(): void

// Config
maxStoredLogs: 500
enableConsole: __DEV__
showSensitiveData: false  // Privacy
```

**Privacidade automática:**
- Emails: `c******@gmail.com`
- Coords: `[coord]`
- UserIds: `abc123...`

### Camada 2: Analytics (`database/analytics.ts`)

```typescript
// Métricas disponíveis
type AnalyticsField =
  // Business
  | 'sessions_count' | 'total_minutes' | 'manual_entries'
  | 'auto_entries' | 'locations_created' | 'locations_deleted'
  // Product
  | 'app_opens' | 'app_foreground_seconds'
  | 'notifications_shown' | 'notifications_actioned'
  // Debug
  | 'errors_count' | 'sync_attempts' | 'sync_failures' | 'geofence_triggers'

// Features trackadas
type FeatureName =
  | 'create_location' | 'edit_location' | 'delete_location'
  | 'manual_entry' | 'edit_record' | 'delete_record'
  | 'share_report' | 'export_report' | 'view_history'
  | 'sync_manual' | 'settings_changed' | 'notification_response'

// API
trackMetric(userId, field, increment?): Promise<void>
trackFeatureUsed(userId, feature): Promise<void>
trackGeofenceTrigger(userId, accuracy): Promise<void>
trackSessionMinutes(userId, minutes, isManual): Promise<void>

// Queries
getTodayAnalytics(userId): Promise<AnalyticsDailyDB | null>
getAnalyticsByPeriod(userId, start, end): Promise<AnalyticsDailyDB[]>
getAnalyticsForSync(userId): Promise<AnalyticsDailyDB[]>
getAnalyticsSummary(userId, start, end): Promise<AnalyticsSummary>
cleanOldAnalytics(daysToKeep?): Promise<number>
```

### Camada 2: Errors (`database/errors.ts`)

```typescript
// Tipos de erro (14)
type ErrorType =
  | 'sync_error' | 'database_error' | 'network_error'
  | 'geofence_error' | 'notification_error' | 'auth_error'
  | 'permission_error' | 'validation_error' | 'runtime_error'
  | 'pingpong_event' | 'pingpong_warning' | 'unknown_error'
  | 'foreground_service_killed'

// API
captureError(error, type, context?): Promise<string>
captureErrorAuto(error, context?): Promise<string>
captureSyncError(error, context?)
captureDatabaseError(error, context?)
captureNetworkError(error, context?)
captureGeofenceError(error, context?)

// Ping-Pong tracking
capturePingPongEvent(userId, data): Promise<string>
getPingPongEvents(userId?, limit?): PingPongEventData[]
getPingPongStats(userId?): { totalEvents, warnings, enters, exits, ... }

// Queries
getRecentErrors(userId, limit?): Promise<ErrorLogDB[]>
getErrorsByType(type, limit?): Promise<ErrorLogDB[]>
getErrorsForSync(limit?): Promise<ErrorLogDB[]>
cleanOldErrors(daysToKeep?): Promise<number>
```

### Camada 2: Audit (`database/audit.ts`)

```typescript
type AuditEventType = 'entry' | 'exit' | 'dispute' | 'correction'

// API
recordEntryAudit(userId, lat, lng, accuracy, locationId, locationName, sessionId): Promise<string>
recordExitAudit(userId, lat, lng, accuracy, locationId, locationName, sessionId): Promise<string>
recordDisputeAudit(userId, lat, lng, accuracy, sessionId, locationName): Promise<string>
recordCorrectionAudit(userId, sessionId, locationName): Promise<string>

// GPS Proof
getSessionProof(sessionId): Promise<SessionProof | null>
interface SessionProof {
  sessionId: string
  locationName: string
  entryAudit: LocationAuditDB | null
  exitAudit: LocationAuditDB | null
  hasGPSProof: boolean
  entryAccuracy: number | null
  exitAccuracy: number | null
}

// Queries
getSessionAudit(sessionId): Promise<LocationAuditDB[]>
getUserAudit(userId, limit?): Promise<LocationAuditDB[]>
getAuditByPeriod(userId, start, end): Promise<LocationAuditDB[]>
getAuditForSync(userId, limit?): Promise<LocationAuditDB[]>
cleanOldAudit(daysToKeep?): Promise<number>
```

### Camada 3: Telemetry Wrapper (`telemetry.ts`)

```typescript
// UI-friendly wrappers
trackManualSave({ locationId, durationMinutes, usedSuggestion, suggestionDelta? })
trackTabNavigation(from, to)
trackGeofenceSession(type: 'start' | 'end', locationId)
trackExport(format: 'pdf' | 'excel')
trackSessionEdit(sessionId)
trackSessionDelete(sessionId)
trackDayModalOpen(date)
trackShareReport()
```

### Camada 4: Supabase (Remote)

**Tabelas:**
- `analytics_daily` - Métricas agregadas por dia
- `error_log` - Erros estruturados
- `location_audit` - GPS proof de entry/exit

---

## 🚀 BACKGROUND TASKS

### Task Names

```typescript
// backgroundTypes.ts
export const GEOFENCE_TASK = 'onsite-geofence'
export const HEARTBEAT_TASK = 'onsite-heartbeat-task'
export const LOCATION_TASK = 'onsite-location-task'

// Constants
RECONFIGURE_DEBOUNCE_MS = 5000
EVENT_DEDUP_WINDOW_MS = 10000
MAX_QUEUE_SIZE = 20
MAX_QUEUE_AGE_MS = 30000
```

### Fluxo de Geofencing

```
┌─────────────────────────────────────────────────────────────────────┐
│                    GEOFENCING FLOW                                   │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  Native Geofence (iOS/Android)                                      │
│         ↓                                                            │
│  GEOFENCE_TASK (TaskManager.defineTask)                             │
│         ↓                                                            │
│  processGeofenceEvent() [geofenceLogic.ts]                         │
│    │                                                                 │
│    ├─ Deduplicação (10s window)                                    │
│    ├─ Queue durante reconfiguration                                 │
│    ├─ Log ping-pong event                                          │
│    └─ Callback → workSessionStore                                  │
│         ↓                                                            │
│  handleGeofenceEnter/Exit [sessionHandlers.ts]                     │
│    │                                                                 │
│    ├─ Verifica lastProcessedEnterLocationId                        │
│    ├─ Cria PendingAction + timeout                                 │
│    └─ Mostra notification                                          │
│         ↓                                                            │
│  User Action ou Timeout                                             │
│    │                                                                 │
│    ├─ actionStart() → registerEntry()                              │
│    ├─ actionOk() → registerExit()                                  │
│    └─ auto_start/auto_end → TTL expiration                        │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### Heartbeat Adaptivo

```typescript
// heartbeatLogic.ts
HEARTBEAT_INTERVALS = {
  NORMAL: 15 * 60,           // 15 min (idle)
  PENDING_ENTER: 2 * 60,     // 2 min (esperando auto-start)
  PENDING_EXIT: 1 * 60,      // 1 min (esperando auto-end)
  PENDING_RETURN: 2 * 60,    // 2 min (esperando resume)
  LOW_ACCURACY: 5 * 60,      // 5 min (GPS ruim)
  RECENT_TRANSITION: 5 * 60, // 5 min (transição recente)
}

// Funções
runHeartbeat(): Promise<void>
  - Obtém GPS (High accuracy)
  - Verifica TTL de pending actions
  - Valida consistência de fence
  - Detecta ping-pong
  - Adapta intervalo

recalculateHeartbeatInterval(): Promise<number>
maybeUpdateHeartbeatInterval(): Promise<void>
recordTransition(): Promise<void>
recordLowAccuracy(accuracy): Promise<void>
```

### Pending TTL

```typescript
// pendingTTL.ts
interface PersistedPendingAction {
  type: 'enter' | 'exit' | 'return'
  locationId: string
  locationName: string
  notificationId: string | null
  createdAt: number
  timeoutMs: number
  coords?: { latitude, longitude, accuracy? }
}

// Persistência (AsyncStorage)
savePendingAction(pending): Promise<void>
loadPendingAction(): Promise<PersistedPendingAction | null>
clearPendingAction(): Promise<void>
isPendingExpired(pending): boolean
getPendingTimeRemaining(pending): number

// TTL Check
checkAndProcessPendingTTL(checkInsideFence, getFreshGPS?): Promise<PendingTTLResult>

interface PendingTTLResult {
  action: 'auto_start' | 'auto_end' | 'auto_resume' | 'drop' | 'none'
  pending: PersistedPendingAction | null
  reason?: string
  freshGPS?: { latitude, longitude, accuracy, isInsideFence }
}
```

### Ping-Pong Prevention

```typescript
// backgroundHelpers.ts
interface PingPongEvent {
  timestamp: number
  type: 'enter' | 'exit' | 'check'
  fenceName: string
  fenceId: string
  distance: number
  radius: number
  effectiveRadius: number
  margin: number
  marginPercent: number
  isInside: boolean
  source: 'geofence' | 'heartbeat' | 'reconcile' | 'manual'
  gpsAccuracy?: number
}

logPingPongEvent(event): Promise<void>
getPingPongHistory(): PingPongEvent[]
getPingPongSummary(fenceId?): { totalEvents, enters, exits, isPingPonging, ... }
checkForPingPong(fenceId?): Promise<{ isPingPonging, recentEnters, recentExits }>

// Hysteresis check
checkInsideFence(lat, lng, userId, useHysteresis?, source?, gpsAccuracy?): Promise<{
  isInside: boolean
  fence: ActiveFence | null
  distance?: number
}>
```

---

## 🔄 SYNC SYSTEM

### Fluxo Completo

```
┌─────────────────────────────────────────────────────────────┐
│                       SYNC FLOW                              │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  TRIGGERS                                                    │
│  ├── 🌙 Midnight (diário 00:00-00:05)                       │
│  ├── 🚀 App init (se online)                                │
│  ├── 👆 Manual (usuário)                                    │
│  ├── 📶 Network reconect                                    │
│  └── ⚡ Evento importante (create location, end session)     │
│                                                              │
│                         ↓                                    │
│                                                              │
│  syncNow()                                                   │
│  │                                                           │
│  │  // UPLOAD (SQLite → Supabase)                           │
│  ├── 1. getLocationsForSync() → locations                   │
│  ├── 2. getRecordsForSync() → records                       │
│  ├── 3. getAnalyticsForSync() → analytics_daily             │
│  ├── 4. getErrorsForSync() → error_log                      │
│  └── 5. getAuditForSync() → location_audit                  │
│                                                              │
│  // Mark synced (synced_at = NOW)                           │
│  markLocationSynced(), markRecordSynced(), etc.             │
│                                                              │
│                         ↓                                    │
│                                                              │
│  CLEANUP (apenas synced)                                     │
│  ├── cleanOldAnalytics(30)  → Remove > 30 dias              │
│  ├── cleanOldErrors(14)     → Remove > 14 dias              │
│  └── cleanOldAudit(90)      → Remove > 90 dias              │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### Retenção Local

| Tabela | Retenção | Condição |
|--------|----------|----------|
| `analytics_daily` | 30 dias | Após sync |
| `error_log` | 14 dias | Após sync |
| `location_audit` | 90 dias | Após sync |
| `locations` | Indefinido | Sempre |
| `records` | Indefinido | Sempre |

---

## 🗃️ DATABASE (SQLite)

### Schema Completo

```sql
-- LOCATIONS (Geofences)
CREATE TABLE locations (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  latitude REAL NOT NULL,
  longitude REAL NOT NULL,
  radius INTEGER DEFAULT 100,
  color TEXT,
  status TEXT DEFAULT 'active',  -- active|deleted|pending_delete|syncing
  deleted_at TEXT,
  last_seen_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT,
  synced_at TEXT
);

-- RECORDS (Work Sessions)
CREATE TABLE records (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  location_id TEXT NOT NULL,
  location_name TEXT,
  entry_at TEXT NOT NULL,
  exit_at TEXT,                   -- NULL = sessão ativa
  type TEXT DEFAULT 'automatic',  -- automatic|manual
  manually_edited INTEGER DEFAULT 0,
  edit_reason TEXT,
  integrity_hash TEXT,
  color TEXT,
  device_id TEXT,
  pause_minutes INTEGER DEFAULT 0,
  created_at TEXT NOT NULL,
  synced_at TEXT
);

-- ANALYTICS (Métricas por dia)
CREATE TABLE analytics_daily (
  date TEXT NOT NULL,             -- YYYY-MM-DD
  user_id TEXT NOT NULL,
  -- Business
  sessions_count INTEGER DEFAULT 0,
  total_minutes INTEGER DEFAULT 0,
  manual_entries INTEGER DEFAULT 0,
  auto_entries INTEGER DEFAULT 0,
  locations_created INTEGER DEFAULT 0,
  locations_deleted INTEGER DEFAULT 0,
  -- Product
  app_opens INTEGER DEFAULT 0,
  app_foreground_seconds INTEGER DEFAULT 0,
  notifications_shown INTEGER DEFAULT 0,
  notifications_actioned INTEGER DEFAULT 0,
  features_used TEXT DEFAULT '[]',  -- JSON array
  -- Debug
  errors_count INTEGER DEFAULT 0,
  sync_attempts INTEGER DEFAULT 0,
  sync_failures INTEGER DEFAULT 0,
  geofence_triggers INTEGER DEFAULT 0,
  geofence_accuracy_sum REAL DEFAULT 0,
  geofence_accuracy_count INTEGER DEFAULT 0,
  -- Metadata
  app_version TEXT,
  os TEXT,
  device_model TEXT,
  -- Timestamps
  created_at TEXT NOT NULL,
  synced_at TEXT,
  PRIMARY KEY (date, user_id)
);

-- ERROR LOG
CREATE TABLE error_log (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  error_type TEXT NOT NULL,
  error_message TEXT NOT NULL,
  error_stack TEXT,
  error_context TEXT,             -- JSON
  app_version TEXT,
  os TEXT,
  os_version TEXT,
  device_model TEXT,
  occurred_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  synced_at TEXT
);

-- LOCATION AUDIT (GPS Proof)
CREATE TABLE location_audit (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  session_id TEXT,
  event_type TEXT NOT NULL,       -- entry|exit|dispute|correction
  location_id TEXT,
  location_name TEXT,
  latitude REAL NOT NULL,
  longitude REAL NOT NULL,
  accuracy REAL,
  occurred_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  synced_at TEXT
);
```

---

## 🔔 NOTIFICATIONS

### Categorias e Ações

```typescript
// notifications.ts

// Entry notification
- Buttons: [START] [SKIP_TODAY]
- Timeout: entryTimeoutMinutes (5 min)
- Auto-action: auto_start

// Exit notification
- Buttons: [OK] [PAUSE]
- Timeout: exitTimeoutSeconds (15 sec)
- Auto-action: auto_end + adjustment

// Return notification (during pause)
- Buttons: [RESUME] [STOP]
- Timeout: returnTimeoutMinutes (5 min)
- Auto-action: auto_resume

// Pause Expired
- Buttons: [SNOOZE] (+ force GPS check)
- Timeout: pauseLimitMinutes (30 min)

// API
requestNotificationPermission(): Promise<boolean>
configureNotificationCategories(): Promise<void>
showEntryNotification(locationName, minutesUntilStart): Promise<string>
showExitNotification(locationName, secondsUntilEnd): Promise<string>
showReturnNotification(locationName, minutesUntilResume): Promise<string>
showPauseAlarmNotification(locationName, timeRemaining): Promise<string>
addResponseListener(callback): () => void
cancelNotification(id): Promise<void>
```

---

## 🔐 PERMISSÕES (app.json)

### Android

```json
"permissions": [
  "ACCESS_NETWORK_STATE",
  "INTERNET",
  "ACCESS_COARSE_LOCATION",
  "ACCESS_FINE_LOCATION",
  "ACCESS_BACKGROUND_LOCATION",
  "FOREGROUND_SERVICE",
  "FOREGROUND_SERVICE_LOCATION",
  "RECEIVE_BOOT_COMPLETED",
  "VIBRATE",
  "WAKE_LOCK"
]
```

### iOS

```json
"infoPlist": {
  "NSLocationWhenInUseUsageDescription": "...",
  "NSLocationAlwaysAndWhenInUseUsageDescription": "...",
  "NSLocationAlwaysUsageDescription": "...",
  "UIBackgroundModes": [
    "location",
    "fetch",
    "remote-notification",
    "audio"
  ]
}
```

---

## 🔗 DEPENDENCY CHAIN (Golden Rule)

```
┌─────────────────────────────────────────────────────────────────────┐
│                     DEPENDENCY CHAIN                                 │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  workSessionStore (app state)                                       │
│      │                                                               │
│      ├→ recordStore (session CRUD)                                 │
│      │   └→ database/records.ts                                    │
│      │       └→ analytics tracking                                 │
│      │                                                               │
│      ├→ backgroundTasks (geofence setup)                           │
│      │   ├→ geofenceLogic (event processing)                      │
│      │   ├→ heartbeatLogic (periodic checks)                      │
│      │   └→ pendingTTL (TTL validation)                           │
│      │                                                               │
│      ├→ syncStore (Supabase)                                       │
│      │   └→ database (read unsynced)                               │
│      │                                                               │
│      └→ notifications (user prompts)                               │
│          └→ taskCallbacks (callback setup)                         │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘

⚠️ QUANDO MODIFICAR, SEMPRE VERIFICAR IMPACTO EM:
1. src/stores/workSessionStore.ts
2. src/lib/backgroundTasks.ts + geofenceLogic.ts + heartbeatLogic.ts
3. src/stores/syncStore.ts
4. Componentes UI que consomem os stores
```

---

## ⚠️ REGRAS DE CÓDIGO

### NUNCA

```
❌ Modificar workSessionStore sem checar backgroundTasks
❌ Alterar geofence logic sem checar session state
❌ Adicionar PII (emails, coords exatas) aos logs
❌ Criar sistemas duplicados de tracking/analytics
❌ Pular padrões offline-first em novas features
❌ Usar Redux (apenas Zustand)
```

### SEMPRE

```
✅ Usar logger.ts para runtime logs
✅ Usar database/analytics.ts para métricas persistentes
✅ Usar database/errors.ts para captura de erros
✅ Usar database/audit.ts para prova GPS
✅ Mascarar PII automaticamente
✅ Testar offline mode
✅ Verificar sync para Supabase
```

---

## 🎨 STYLES

### Estrutura Modular

```
/src/screens/home/styles/
├── index.ts           # Re-exports
├── shared.styles.ts   # Header, badges, modals, cards
├── home.styles.ts     # Timer, form layout (fixedStyles v1.5)
├── reports.styles.ts  # Calendar, day modal, export
└── legacy.styles.ts   # ⚠️ DEPRECATED - não adicionar código
```

### Importação

```typescript
import { sharedStyles, homeStyles, reportsStyles } from './styles'
```

---

## 📋 ROADMAP

```
v1.0 (concluído)
├── ✅ Geofencing básico
├── ✅ Auto start/stop
├── ✅ Notificações
├── ✅ TTL conectado

v1.1 (concluído)
├── ✅ Reorganização UI (Home + Reports)
├── ✅ Form manual inline
├── ✅ Refatoração styles

v2.0 (concluído)
├── ✅ UX v2.1 (Location Carousel)
├── ✅ Observabilidade completa (4 camadas)
├── ✅ Hysteresis + ping-pong prevention
├── ✅ Adaptive heartbeat
├── ✅ Boot gate + event queueing

v3.0 (próximo)
├── 📋 Relatórios PDF/Excel
├── 📋 Dashboard analytics (Supabase)
├── 📋 Geofencing como feature paga
```

---

## 📅 Changelog

| Data | Versão | Mudança |
|------|--------|---------|
| 2026-01-19 | **v3.0** | Documentação completa reescrita com todas as APIs |
| 2026-01-15 | v2.7 | UX v2.1: Location Carousel + Simplified Layout |
| 2025-01-13 | v2.6 | Documentação de Observabilidade + Supabase |
| 2025-01-13 | v2.5 | Refatoração styles em módulos |
| 2025-01-13 | v2.4 | UI v1.5: Timer vertical, inputs centralizados |
| 2025-01-12 | v2.3 | Fix ping-pong com histerese + vigilance |

---

*Última atualização: 2026-01-19 (v3.0 - Documentação completa)*
