# Auditoria Arquitetural — OnSite Timekeeper v1

**Auditor:** Claude (Mobile Architect / Technical Auditor)
**Data:** 20 de fevereiro de 2026
**Escopo:** Estrutura completa do app, SDK de geolocalização, estado, persistência, sync
**Base de código:** `onsite-timekeeper@main` (commit 558370c)

---

## Sumário Executivo

O OnSite Timekeeper v1 é um app React Native/Expo de controle de horas com geofencing automático via Transistorsoft SDK. A arquitetura é **funcional mas frágil**: o happy path funciona, mas edge cases (crash, midnight crossing, events duplicados, headless mode) revelam falhas de design que vão desde perda silenciosa de dados até sessões fantasma. O app mistura responsabilidades em "god files" (1.107 linhas no locationStore, 1.612 no hook principal), usa estado in-memory para fluxos críticos (`pendingExits` Map), não tem transações SQLite, e tem código órfão que confunde quem mantém.

**Veredicto: 6 defeitos Critical, 4 High, 5 Medium.** O app funciona para o caso comum (enter/exit limpo, app em foreground) mas NÃO é production-hardened para background execution, crash recovery, e concorrência de eventos.

---

## 1. INVENTÁRIO DO PROJETO

### 1.1 Tree Classificado por Camadas

```
onsite-timekeeper/
│
├── app/                          ← NAVIGATION + SCREENS (Expo Router)
│   ├── _layout.tsx               ← Root Layout (356 LOC) — bootstrap + auth guard
│   ├── index.tsx                 ← Entry redirect
│   ├── legal.tsx                 ← Legal content (Privacy/Terms)
│   ├── logs.tsx                  ← Debug logs viewer
│   ├── (auth)/                   ← Auth flow screens
│   │   ├── _layout.tsx
│   │   ├── login.tsx
│   │   ├── register.tsx
│   │   └── complete-profile.tsx
│   └── (tabs)/                   ← Main tab screens
│       ├── _layout.tsx
│       ├── index.tsx             ← Home (manual entry + timer)
│       ├── reports.tsx           ← Reports (calendar + export)
│       ├── map.tsx               ← Locations (geofence management)
│       ├── settings.tsx          ← Settings
│       └── team.tsx              ← Team sharing
│
├── src/
│   ├── components/               ← UI COMPONENTS
│   │   ├── AnimatedRing.tsx
│   │   ├── BatteryOptimizationModal.tsx
│   │   ├── ErrorBoundary.tsx
│   │   ├── FloatingMicButton.tsx
│   │   ├── LocationDisclosureModal.tsx
│   │   ├── PermissionBanner.tsx
│   │   ├── ShareModal.tsx
│   │   ├── VoiceCommandSheet.tsx
│   │   ├── auth/                 ← Auth components
│   │   ├── sharing/              ← QR code components
│   │   └── ui/                   ← Base UI (Button)
│   │
│   ├── stores/                   ← STATE MANAGEMENT (Zustand)
│   │   ├── authStore.ts          ← Auth state (484 LOC)
│   │   ├── dailyLogStore.ts      ← Daily hours UI state (486 LOC)
│   │   ├── locationStore.ts      ← Geofence state (1,107 LOC) ⚠️ GOD FILE
│   │   ├── syncStore.ts          ← Supabase sync (713 LOC)
│   │   ├── settingsStore.ts      ← User preferences (295 LOC)
│   │   ├── sessionHandlers.ts    ← ORPHAN: thin wrappers never called (102 LOC)
│   │   └── sessionHelpers.ts     ← ORPHAN: dynamic require resolver (30 LOC)
│   │
│   ├── lib/                      ← SERVICES + ENGINE
│   │   ├── bgGeo.ts              ← SDK WRAPPER: Transistorsoft (580 LOC)
│   │   ├── exitHandler.ts        ← ENGINE: entry/exit/cooldown/midnight (588 LOC)
│   │   ├── bootstrap.ts          ← LIFECYCLE: singleton listener init (134 LOC)
│   │   ├── backgroundHelpers.ts  ← SDK SUPPORT: userId cache, fences cache
│   │   ├── eventLog.ts           ← OBSERVABILITY: geofence event logger
│   │   ├── location.ts           ← GPS: expo-location wrapper
│   │   ├── notifications.ts      ← NOTIFICATIONS: entry/exit/guard alerts
│   │   ├── logger.ts             ← LOGGING: in-memory ring buffer (500 entries)
│   │   ├── sentry.ts             ← CRASH REPORTING
│   │   ├── supabase.ts           ← API CLIENT: Supabase config
│   │   ├── reports.ts            ← BUSINESS: report generation
│   │   ├── timesheetPdf.ts       ← BUSINESS: PDF export
│   │   ├── geocoding.ts          ← UTIL: reverse geocoding
│   │   ├── telemetry.ts          ← ANALYTICS: event tracking
│   │   ├── constants.ts          ← CONFIG: app constants
│   │   ├── platform.ts           ← UTIL: platform detection
│   │   ├── accessGrants.ts       ← FEATURE: team sharing access
│   │   ├── ai/                   ← AI FEATURES
│   │   │   ├── interpreter.ts    ← AI Guardian (consultant mode)
│   │   │   ├── secretary.ts      ← AI Secretário (auto-cleanup)
│   │   │   ├── voice.ts          ← Voice commands
│   │   │   ├── whisper.ts        ← Speech-to-text
│   │   │   └── timekeeperSystemPrompt.ts
│   │   └── database/             ← PERSISTENCE (SQLite)
│   │       ├── core.ts           ← DB init + helpers + migrations
│   │       ├── daily.ts          ← daily_hours CRUD
│   │       ├── locations.ts      ← locations CRUD
│   │       ├── audit.ts          ← GPS audit trail CRUD
│   │       ├── analytics.ts      ← Metrics tracking CRUD
│   │       ├── errors.ts         ← Error capture CRUD
│   │       ├── debug.ts          ← Debug queries
│   │       └── index.ts          ← Re-exports
│   │
│   ├── screens/                  ← SCREEN-SPECIFIC LOGIC
│   │   ├── home/
│   │   │   ├── hooks.ts          ← GOD HOOK (1,612 LOC) ⚠️
│   │   │   ├── helpers.ts        ← Pure date/calendar utils (195 LOC) ✅
│   │   │   └── styles/           ← Modular styles
│   │   └── map/
│   │       ├── hooks.ts          ← Map hook (371 LOC) ✅
│   │       ├── constants.ts
│   │       ├── RadiusSlider.tsx
│   │       ├── SearchBox.tsx
│   │       └── styles.ts
│   │
│   ├── constants/                ← CONFIG
│   │   └── colors.ts
│   └── hooks/                    ← SHARED HOOKS
│       ├── usePermissionStatus.ts
│       └── usePermissionStatus.web.ts
│
├── supabase/                     ← BACKEND
│   ├── migrations/
│   └── functions/                ← Edge functions
│
└── [config files]                ← app.json, eas.json, etc.
```

### 1.2 Responsabilidades Misturadas

| Arquivo | Problema |
|---------|----------|
| [locationStore.ts](src/stores/locationStore.ts) | **1,107 LOC**. Mistura: estado UI, lógica de permissão, SDK management, GPS injection, audit trail, feature tracking, sync triggers. É store + service + engine. |
| [hooks.ts](src/screens/home/hooks.ts) | **1,612 LOC**. É hook + controller + DB layer. Chama SQLite diretamente (bypass do store), gerencia 40+ useState, 13+ useEffect, 25+ callbacks. |
| [exitHandler.ts](src/lib/exitHandler.ts) | Mistura: persistência (SQLite CRUD), lógica de negócio (cooldown/midnight split), notificações, sync trigger, e AI integration. É o "engine" do app mas sem isolamento. |
| [_layout.tsx](app/_layout.tsx) | Root layout faz bootstrap, auth guard, notification handling, battery modal, disclosure modal. São 5+ responsabilidades em 1 componente. |

---

## 2. MAPA DE DEPENDÊNCIAS (ACOPLAMENTO)

### 2.1 Grafo de Dependências

```
                    ┌─────────────┐
                    │  _layout.tsx │ (Bootstrap Orchestrator)
                    └──────┬──────┘
                           │ initializes
              ┌────────────┼────────────┐
              ▼            ▼            ▼
        ┌──────────┐ ┌──────────┐ ┌──────────┐
        │authStore │ │dailyLog  │ │syncStore │
        └────┬─────┘ │Store     │ └────┬─────┘
             │       └────┬─────┘      │
             │            │            │
             ▼            ▼            ▼
        ┌──────────────────────────────────┐
        │        locationStore             │ (God Store)
        │  imports: authStore, syncStore,  │
        │  dailyLogStore, settingsStore,   │
        │  exitHandler, bgGeo, location,   │
        │  database/*, backgroundHelpers   │
        └─────────────┬───────────────────┘
                      │
              ┌───────┼───────┐
              ▼       ▼       ▼
        ┌─────────┐ ┌─────┐ ┌──────────┐
        │bgGeo.ts │ │exit  │ │database/*│
        │(SDK)    │ │Handler│ │(SQLite)  │
        └────┬────┘ └──┬───┘ └──────────┘
             │         │
             ▼         ▼
        ┌─────────────────────┐
        │ bootstrap.ts        │
        │ (singleton wiring)  │
        └─────────────────────┘
```

### 2.2 Imports Cruzados Problemáticos

| De → Para | Tipo | Risco |
|-----------|------|-------|
| [exitHandler.ts:12](src/lib/exitHandler.ts#L12) → `syncStore` | Engine → Store | Engine deveria ser puro. Sync deveria ser disparado pelo caller. |
| [exitHandler.ts:13](src/lib/exitHandler.ts#L13) → `dailyLogStore` | Engine → Store | Idem. UI reload misturado com lógica de negócio. |
| [exitHandler.ts:18](src/lib/exitHandler.ts#L18) → `settingsStore` | Engine → Store | Config deveria ser passada como parâmetro. |
| [exitHandler.ts:15](src/lib/exitHandler.ts#L15) → `authStore` | Engine → Store | userId deveria ser parâmetro do caller. |
| [syncStore.ts](src/stores/syncStore.ts) → `locationStore` (dynamic require) | Store → Store | Acoplamento circular via `require()`. |
| [syncStore.ts](src/stores/syncStore.ts) → `dailyLogStore` (dynamic require) | Store → Store | Idem. |
| [locationStore.ts:70](src/stores/locationStore.ts#L70) → `dailyLogStore` | Store → Store | Cross-store mutation (deleteLocation → reloadToday). |
| [hooks.ts](src/screens/home/hooks.ts) → `database/daily` | UI → DB direto | Bypassa o store layer. DB deveria ser acessado só via store. |

### 2.3 God Files

| Arquivo | LOC | Razão |
|---------|-----|-------|
| [locationStore.ts](src/stores/locationStore.ts) | 1,107 | Estado + permissões + SDK control + GPS injection + audit + sync trigger + 17 actions |
| [hooks.ts](src/screens/home/hooks.ts) | 1,612 | Timer + calendar + modals + manual entry + export + 40 state vars + 13 effects |
| [syncStore.ts](src/stores/syncStore.ts) | 713 | Upload/download de 5+ tabelas + midnight check + network listener + cleanup |
| [bgGeo.ts](src/lib/bgGeo.ts) | 580 | Config + listeners + headless + mode switching + battery + logs + cleanup |

---

## 3. FLUXO REAL DO APP (EVENTOS E ESTADO)

### 3.1 Sequência de Boot

```
_layout.tsx useEffect (runs once)
  │
  ├─ 1. initSentry()
  ├─ 2. initDatabase()                          ← SQLite tables + migrations
  ├─ 3. settingsStore.loadSettings()             ← AsyncStorage → Zustand
  ├─ 4. requestNotificationPermission()
  ├─ 5. configureNotificationCategories()
  ├─ 6. initializeListeners()                    ← bootstrap.ts
  │     ├─ bgGeoConfigure()                      ← SDK ready() + setConfig()
  │     │   ├─ onGeofence() listener registered  ← Module scope
  │     │   ├─ onHeartbeat() listener registered ← Module scope
  │     │   └─ registerHeadlessTask()            ← Module scope
  │     ├─ setGeofenceHandler()                  ← Routes events → locationStore
  │     └─ AppState.addEventListener()           ← Foreground/background
  │
  ├─ 7. authStore.initialize()                   ← Supabase session check
  │
  └─ 8. IF authenticated:
       ├─ checkProfile()
       ├─ initializeStores()
       │   ├─ dailyLogStore.initialize()         ← Load today + week
       │   ├─ locationStore.initialize()          ← Permissions + fences + AUTO-START
       │   │   ├─ requestPermissions()
       │   │   ├─ reloadLocations()
       │   │   ├─ getCurrentLocation()           ← Boot GPS check
       │   │   ├─ getActiveTrackingState()       ← Crash recovery
       │   │   ├─ recoverSessionGuard()          ← Resume 10h/16h timer
       │   │   └─ startMonitoring()              ← Auto-start geofencing
       │   │       ├─ addGeofences()
       │   │       ├─ bgGeoStart()
       │   │       └─ Post-start GPS injection   ← If inside fence, inject ENTER
       │   └─ syncStore.initialize()
       │       ├─ NetInfo listener
       │       └─ setInterval (midnight check, every 60s)
       └─ onUserLogin()                          ← Set background userId
```

### 3.2 Fluxo Enter/Exit Completo

```
SDK fires geofence event (OS level)
  │
  ▼ [1/6] bgGeo.ts onGeofence()
  │  ├─ Parse action → 'enter'/'exit'
  │  ├─ Extract SDK timestamp
  │  └─ Call geofenceHandler() or lazyInitAndDeliver()
  │
  ▼ [2/6] bootstrap.ts handleGeofenceEvent()
  │  └─ Route to locationStore.handleGeofenceEvent()
  │
  ▼ [3/6] locationStore.ts handleGeofenceEvent()
  │  ├─ Update currentFenceId state
  │  ├─ Lookup location by ID (SQLite)
  │  ├─ Get current GPS for audit
  │  ├─ trackGeofenceTrigger() (analytics)
  │  ├─ logGeofenceEvent() (geofence_events table)
  │  └─ Call exitHandler
  │
  ▼ [4/6] exitHandler.ts onGeofenceEnter() / onGeofenceExit()
  │
  │  ENTER:
  │  ├─ Cancel pending exit (re-entry during cooldown) → return
  │  ├─ If already tracking same location → return
  │  ├─ If tracking different location → confirmExit() old one
  │  ├─ setActiveTracking() → SQLite INSERT OR REPLACE
  │  ├─ switchToActiveMode() (distanceFilter=10m)
  │  ├─ startSessionGuard() (10h/16h safety net)
  │  ├─ Check first_entry → upsertDailyHours()
  │  ├─ showArrivalNotification()
  │  └─ dailyLogStore.reloadToday() + startTracking()
  │
  │  EXIT:
  │  ├─ Verify active_tracking matches location → return if not
  │  ├─ Cancel existing pending exit
  │  └─ Schedule confirmExit() in 30s (cooldown)
  │      └─ pendingExits.set() ← IN-MEMORY MAP ⚠️
  │
  ▼ [5/6] confirmExit() (after 30s cooldown)
  │  ├─ cancelSessionGuard()
  │  ├─ Guard: stale exit check
  │  ├─ Read pause_seconds from active_tracking
  │  ├─ Calculate duration (exit - entry - pause)
  │  ├─ clearActiveTracking() → SQLite DELETE
  │  ├─ switchToIdleMode() (distanceFilter=200m)
  │  ├─ Apply exit adjustment (-N minutes)
  │  ├─ splitSessionAtMidnights() → per-day segments
  │  ├─ For each segment: upsertDailyHours()
  │  ├─ showEndOfDayNotification()
  │  └─ AI secretary cleanup (async, non-blocking)
  │
  ▼ [6/6] UI Update + Sync
     ├─ dailyLogStore.reloadToday()
     ├─ dailyLogStore.resetTracking()
     └─ syncStore.syncNow() (non-blocking)
```

### 3.3 Riscos de Concorrência e Race Conditions

#### RISK #1: `pendingExits` é in-memory — perde no crash
**Arquivo:** [exitHandler.ts:40](src/lib/exitHandler.ts#L40)
```typescript
const pendingExits = new Map<string, PendingExit>();
```
Se o app morrer durante os 30s de cooldown, o `pendingExits` se perde. Na reinicialização, `active_tracking` ainda existe (sessão parece ativa), mas o exit nunca é confirmado. O `recoverSessionGuard()` eventualmente acaba com a sessão em 16h, mas as horas do dia ficam infladas.

#### RISK #2: Heartbeat counter não é thread-safe
**Arquivo:** [bgGeo.ts:38](src/lib/bgGeo.ts#L38)
```typescript
let heartbeatOutsideCount = 0; // Module-level, no mutex
```
O `onHeartbeat` é async. Se dois heartbeats chegarem quase simultâneos (GPS lento), o counter pode ser resetado antes de atingir 2, ou atingir 2 prematuramente.

#### RISK #3: `confirmExit()` sem mutex
**Arquivo:** [exitHandler.ts:422](src/lib/exitHandler.ts#L422)
Se o usuário estiver em duas geofences sobrepostas e sair de ambas simultaneamente, dois `confirmExit()` podem rodar em paralelo. Ambos leem `getActiveTracking()`, ambos tentam `clearActiveTracking()` e `upsertDailyHours()` — contention no SQLite.

#### RISK #4: Post-restart injection via setTimeout(5s)
**Arquivo:** [locationStore.ts:805](src/stores/locationStore.ts#L805)
```typescript
setTimeout(async () => {
  // Check GPS and inject ENTER or EXIT
}, 5000);
```
Hardcoded 5s delay. Se o GPS demorar mais que 5s (indoor, cold start), o check falha silenciosamente. Se a latência for 0.5s, o check pode rodar antes do SDK processar o evento natural — criando duplicação.

#### RISK #5: Listeners registrados em module scope
**Arquivo:** [bgGeo.ts:106](src/lib/bgGeo.ts#L106), [bgGeo.ts:140](src/lib/bgGeo.ts#L140), [bgGeo.ts:541](src/lib/bgGeo.ts#L541)
`onGeofence()`, `onHeartbeat()`, e `registerHeadlessTask()` são registrados dentro de `configure()` e em module scope. Se `configure()` for chamado 2x (improvável mas possível via `forceReinitialize()`), os listeners duplicam. A flag `isConfigured` protege, mas `cleanup()` seta `isConfigured = false`, permitindo re-registro.

---

## 4. PERSISTÊNCIA E RECUPERAÇÃO

### 4.1 O que é persistido vs in-memory

| Dado | Onde | Persiste no crash? |
|------|------|--------------------|
| `active_tracking` (sessão ativa) | SQLite | ✅ Sim |
| `pendingExits` (cooldown de 30s) | JS Map in-memory | ❌ **NÃO** |
| `sessionGuardTimer` (10h/16h) | setTimeout | ❌ NÃO (recuperado via `recoverSessionGuard`) |
| `heartbeatOutsideCount` | Module variable | ❌ NÃO |
| `daily_hours` | SQLite | ✅ Sim |
| `locations` | SQLite | ✅ Sim |
| `isMonitoring` | AsyncStorage | ✅ Sim |
| `geofenceHandler` reference | Module variable | ❌ NÃO (re-set via `lazyInitAndDeliver`) |

### 4.2 Cenários de Crash Recovery

| Cenário | Resultado | Dados perdidos? |
|---------|-----------|-----------------|
| Crash durante tracking (foreground) | `active_tracking` sobrevive. `recoverSessionGuard()` retoma timer. SDK detecta re-entry via `geofenceInitialTriggerEntry: true`. | ❌ OK |
| Crash durante cooldown de 30s | `pendingExits` perdido. `active_tracking` ainda existe. Sessão continua indefinidamente até session guard (10h). | ⚠️ Horas infladas |
| Crash durante `confirmExit()` | `clearActiveTracking()` já executou mas `upsertDailyHours()` não. Sessão perdida. | ❌ **Horas perdidas** |
| App killed, SDK fires EXIT via headless | `lazyInitAndDeliver()` tenta bootstrap completo. Se falhar, evento PERDIDO permanentemente. | ❌ **Event lost** |
| Midnight crossing durante sessão | `splitSessionAtMidnights()` split no exit. Se exit nunca chegar (crash), todo o tempo fica no dia de entrada. | ⚠️ Horas no dia errado |

### 4.3 Event Queue

**NÃO EXISTE** fila persistente de eventos. O fluxo é fire-and-forget:
- SDK → handler → SQLite (sincrono, sem queue)
- Se qualquer step falhar, o evento é perdido para sempre
- Headless events dependem de `lazyInitAndDeliver()` que pode falhar sem retry

### 4.4 Idempotência

| Operação | Idempotente? | Risco |
|----------|--------------|-------|
| `setActiveTracking()` | ✅ (INSERT OR REPLACE) | Seguro |
| `upsertDailyHours()` | ⚠️ Parcial | Se chamado com mesmos params, OK. Com params diferentes, sobrescreve. |
| `addMinutesToDay()` | ❌ **NÃO** | `total_minutes += X`. Chamado 2x = 2X. |
| `trackMetric()` | ❌ **NÃO** | Incremento cumulativo. |
| `markDailyHoursSynced()` | ✅ | Idempotente (SET synced_at=now). |

---

## 5. CONFIG DO SDK (RISCOS)

### 5.1 Configuração Completa

**Arquivo:** [bgGeo.ts:65-91](src/lib/bgGeo.ts#L65-L91)

| Config | Valor | Avaliação |
|--------|-------|-----------|
| `debug` | `false` | ✅ OK (produção) |
| `locationAuthorizationRequest` | `'Always'` | ✅ Necessário para background |
| `desiredAccuracy` | `DesiredAccuracy.High` | ⚠️ **Alto consumo de bateria**. OK durante ACTIVE mode, mas também se aplica durante IDLE. |
| `distanceFilter` | `50` (config base) | ⚠️ **Suspeito**: Valor inicial 50m, mas imediatamente sobrescrito por `startGeofences()` para 200m ou `switchToActiveMode()` para 10m. Redundante. |
| `geofenceProximityRadius` | `1000` | ✅ OK (acorda SDK quando dentro de 1km de um fence) |
| `geofenceInitialTriggerEntry` | `true` | ✅ Crítico: dispara ENTER se já estiver dentro ao ligar |
| `geofenceModeHighAccuracy` | `true` | ✅ OK (usa GPS real para eventos de geofence) |
| `stopOnTerminate` | `false` | ✅ Crítico: SDK continua após app morrer |
| `startOnBoot` | `true` | ✅ Crítico: SDK inicia no boot do device |
| `enableHeadless` | `true` | ✅ Crítico: processa eventos com app killed |
| `preventSuspend` | `true` | ⚠️ **Bomba de bateria no iOS**. Mantém o app vivo indefinidamente. OK para Android com foreground service, mas iOS pode throttle. |
| `heartbeatInterval` | `60` | ⚠️ **Suspeito**: 60s = 1440 heartbeats/dia. Cada um dispara GPS + cálculo de distância. Bateria impactada. Sugestão: 120-300s. |
| `foregroundService` | `true` | ✅ OK (Android persistent notification) |
| `autoSync` | `false` | ✅ OK (app controla sync) |
| `logLevel` | `LOG_LEVEL_ERROR` | ✅ OK para produção (reduz I/O) |
| `logMaxDays` | `1` | ⚠️ **Pouco**: 1 dia de log SDK. Para debug de issues reportados 2-3 dias depois, insuficiente. Sugestão: 3-5. |

### 5.2 Mode Switching

| Modo | distanceFilter | stationaryRadius | stopTimeout | Quando |
|------|---------------|-------------------|-------------|--------|
| IDLE | 200m | 150m | 15s | Após exit / boot sem sessão |
| ACTIVE | 10m | 25m | 5s | Após entry (sessão ativa) |

**Risco:** `switchToActiveMode()` e `switchToIdleMode()` chamam `setConfig()` mas NÃO verificam se o SDK está enabled. Se o SDK estiver stopped, `setConfig()` silenciosamente não faz nada — próximo `start()` usará config stale.

### 5.3 Minimum Radius

**Arquivo:** [bgGeo.ts:283](src/lib/bgGeo.ts#L283)
```typescript
radius: Math.max(loc.radius, 150), // min 150m for reasonable accuracy
```
Bom: enforce mínimo de 150m no nível do SDK.
Mas: [locationStore.ts:74](src/stores/locationStore.ts#L74) define `MIN_RADIUS = 150` separadamente. **Duplicação de constante** — se um mudar, o outro fica inconsistente.

---

## 6. DEFEITOS EVIDENTES (LISTA PRIORITÁRIA)

### [Critical] — Quebra produção / perde horas / sessão fantasma

| # | Defeito | Arquivo:Linha | Impacto |
|---|---------|--------------|---------|
| C1 | **`pendingExits` in-memory perde no crash** | [exitHandler.ts:40](src/lib/exitHandler.ts#L40) | App crasha durante 30s cooldown → sessão nunca fecha → horas infladas até session guard (10h). Usuário não sabe que o timer ficou rodando. |
| C2 | **`confirmExit()` sem transação** — `clearActiveTracking()` antes de `upsertDailyHours()` | [exitHandler.ts:453-487](src/lib/exitHandler.ts#L453) | Crash entre linhas 453 e 487: `active_tracking` deletado, mas `daily_hours` não atualizado. **Horas trabalhadas perdidas silenciosamente.** |
| C3 | **Headless events sem retry** — `lazyInitAndDeliver()` falha = event LOST** | [bgGeo.ts:234-252](src/lib/bgGeo.ts#L234-L252) | App killed, SDK fires EXIT, bootstrap falha (auth not ready) → evento descartado para sempre. Nenhum retry, nenhum log persistente. |
| C4 | **`syncStore` interval leak** — `midnightCheckInterval` nunca é limpo | [syncStore.ts](src/stores/syncStore.ts) | Cada chamada de `initialize()` cria novo `setInterval(60s)`. Se `initialize()` rodar 2x (login→logout→login), 2 intervals rodam em paralelo. Memory leak + CPU waste. |
| C5 | **`addMinutesToDay()` não é idempotente** — exit event duplicado = horas duplicadas | [daily.ts](src/lib/database/daily.ts) | Se SDK disparar 2 EXIT events (bounce), `confirmExit()` roda 2x: `total_minutes += duration` 2 vezes. O cooldown de 30s ajuda, mas não previne bounce do heartbeat watchdog. |
| C6 | **`confirmExit()` sem mutex** — 2 exits simultâneos corrompem `daily_hours`** | [exitHandler.ts:422](src/lib/exitHandler.ts#L422) | Geofences sobrepostas: 2 EXIT events no mesmo segundo → 2 `confirmExit()` em paralelo → SQLite lock contention ou data corruption. |

### [High] — Drena bateria / falha em background / logs insuficientes

| # | Defeito | Arquivo:Linha | Impacto |
|---|---------|--------------|---------|
| H1 | **`preventSuspend: true` drena bateria no iOS** | [bgGeo.ts:78](src/lib/bgGeo.ts#L78) | iOS throttle foreground activity → batteryDrain → user desinstala. Android OK com foreground service. |
| H2 | **`heartbeatInterval: 60` é agressivo demais** | [bgGeo.ts:79](src/lib/bgGeo.ts#L79) | 1440 GPS samples/dia + Haversine calc = bateria desnecessária. 120-300s seria suficiente para watchdog. |
| H3 | **`heartbeatOutsideCount` race condition** | [bgGeo.ts:38](src/lib/bgGeo.ts#L38) | Heartbeats sobrepostos (GPS async) podem resetar counter prematuramente. EXIT nunca injetado, ou injetado prematuramente. |
| H4 | **`logMaxDays: 1` insuficiente para debug** | [bgGeo.ts:90](src/lib/bgGeo.ts#L90) | Usuário reporta bug na segunda-feira, logs do SDK do domingo já foram apagados. Mínimo: 3 dias. |

### [Medium] — Manutenção impossível / risco de regressão

| # | Defeito | Arquivo:Linha | Impacto |
|---|---------|--------------|---------|
| M1 | **God Hook de 1,612 linhas** | [hooks.ts](src/screens/home/hooks.ts) | 40+ state vars, 13+ effects, 25+ callbacks. Impossível testar unitariamente. Qualquer mudança no calendar pode quebrar o timer. |
| M2 | **Código órfão `sessionHandlers.ts` + `sessionHelpers.ts`** | [sessionHandlers.ts](src/stores/sessionHandlers.ts) | 132 LOC de código nunca chamado. Confunde quem mantém. `sessionHelpers.ts` usa `require()` dinâmico para evitar circular dependency. |
| M3 | **hooks.ts chama SQLite diretamente** (bypass do store) | [hooks.ts](src/screens/home/hooks.ts) | `getDailyHoursByPeriod()`, `upsertDailyHours()`, `deleteDailyHours()` chamados direto. Inconsistente com padrão store → DB. |
| M4 | **`syncStore` usa dynamic `require()` para outros stores** | [syncStore.ts](src/stores/syncStore.ts) | `require('./locationStore')` e `require('./dailyLogStore')` dentro de actions. Frágil, não-tipado, quebra com ESM. |
| M5 | **Database migrations sem versionamento** — `try/catch ALTER TABLE` | [core.ts](src/lib/database/core.ts) | Não há tabela de schema_version. Migrations usam `try { ALTER TABLE } catch { /* already exists */ }`. Se migration falhar por outro motivo, erro é engolido silenciosamente. |

### [Low] — Organização / naming / limpeza

| # | Defeito | Arquivo | Impacto |
|---|---------|---------|---------|
| L1 | `distanciaMinimaLocais` — alias deprecated mantido | [settingsStore.ts](src/stores/settingsStore.ts) | Confusão: 2 nomes para mesma config. |
| L2 | `MIN_RADIUS = 150` duplicado em 2 arquivos | [locationStore.ts:74](src/stores/locationStore.ts#L74), [bgGeo.ts:283](src/lib/bgGeo.ts#L283) | Divergência se só um for atualizado. |
| L3 | `WorkLocation` type alias desnecessário | [locationStore.ts:111](src/stores/locationStore.ts#L111) | `export type WorkLocation = LocationDB` — backward compat que polui namespace. |
| L4 | `calculateDistanceMeters()` duplicado | [locationStore.ts:89](src/stores/locationStore.ts#L89) vs `backgroundHelpers.ts` | 2 implementações de Haversine. |
| L5 | `vercel.json` na raiz de um app mobile | Raiz | Provavelmente do site, não do app. Confuso. |

---

## 7. PLANO DE REFATORAÇÃO

### (A) Hotfixes Imediatos (1-2 dias)

| # | Ação | Arquivos | Estratégia | Risco |
|---|------|----------|------------|-------|
| A1 | **Persistir `pendingExits` em SQLite** | `exitHandler.ts` | Criar tabela `pending_exits (id, location_id, location_name, exit_time, created_at)`. No crash recovery, ler e re-schedule os timeouts. | Baixo — tabela nova, não mexe em existentes. |
| A2 | **Transação em `confirmExit()`** | `exitHandler.ts` | Wrap lines 441-487 em `db.withTransactionSync(() => { ... })`. Se `upsertDailyHours` falhar, `clearActiveTracking` é rolled back. | Médio — precisa testar que `withTransactionSync` funciona com o expo-sqlite sync API. |
| A3 | **Fix interval leak no `syncStore`** | `syncStore.ts` | Na `initialize()`, verificar e limpar `midnightCheckInterval` existente antes de criar novo. | Baixo — change de 3 linhas. |
| A4 | **Aumentar `logMaxDays` para 3** | `bgGeo.ts:90` | Mudar `logMaxDays: 1` → `logMaxDays: 3`. | Zero risco. |
| A5 | **Deletar código órfão** | `sessionHandlers.ts`, `sessionHelpers.ts` | Remover os 2 arquivos e quaisquer imports residuais. Verificar que nada os importa (grep). | Baixo — verificar com grep. |

### (B) Refatoração Controlada (1-2 semanas)

| # | Ação | Arquivos | Estratégia | Risco |
|---|------|----------|------------|-------|
| B1 | **Extrair exitHandler puro** (sem stores) | `exitHandler.ts` | exitHandler recebe `userId`, `settings`, `callbacks` como parâmetros. Stores chamariam: `confirmExit({ userId, onComplete: () => { reloadToday(); syncNow(); } })`. Elimina todos os imports de stores. | Médio — muitos callers. Fazer incrementalmente. |
| B2 | **Adicionar mutex a `confirmExit()`** | `exitHandler.ts` | Usar promise lock: `let exitLock: Promise<void> = Promise.resolve()`. Cada `confirmExit` encadeia na lock. | Baixo — pattern simples. |
| B3 | **Split do God Hook** | `hooks.ts` | Extrair: `useTimer()`, `useCalendar()`, `useManualEntry()`, `useExport()`, `useSessionSelection()`. Hook principal compõe os sub-hooks. | Alto — muitas dependências internas. Precisa de testes. |
| B4 | **Mover DB calls do hooks para dailyLogStore** | `hooks.ts`, `dailyLogStore.ts` | `getDailyHoursByPeriod()` → `dailyLogStore.getLogsByPeriod()`. `deleteDailyHoursById()` → `dailyLogStore.deleteDayLogById()`. | Médio — verificar todos os callers. |
| B5 | **Substituir dynamic requires** | `syncStore.ts` | Na `initialize()`, receber referências dos stores como parâmetros ou usar event emitter: `syncStore.on('downloadComplete', () => locationStore.reload())`. | Médio — muda API de init. |
| B6 | **Schema version tracking** | `core.ts` | Criar tabela `schema_versions (version INT, applied_at TEXT)`. Rodar migrations sequencialmente por versão. | Baixo — additive. |
| B7 | **Reduzir heartbeatInterval** | `bgGeo.ts` | `heartbeatInterval: 60` → `180`. Reduz GPS polls de 1440/dia para 480/dia. Watchdog ainda funciona (detect em 6 min ao invés de 2 min). | Baixo — trade-off aceitável. |

### (C) Migração para Arquitetura v2 (sem travar entrega)

| # | Ação | Descrição | Estratégia |
|---|------|-----------|------------|
| C1 | **Event Queue persistente** | Criar camada `EventBus` que persiste eventos em SQLite antes de processar. Se handler falhar, evento fica na fila para retry. | Criar `src/engine/eventQueue.ts` com tabela `event_queue`. Novo handler wraps o existente. Feature flag para rollout. |
| C2 | **Engine Layer separada** | Extrair toda lógica de negócio para `src/engine/`: `trackingEngine.ts`, `syncEngine.ts`, `geofenceEngine.ts`. Stores viram thin wrappers de estado. | Incremental: mover 1 fluxo por vez. Primeiro o tracking (é o mais crítico). |
| C3 | **Split do locationStore** | Quebrar em: `useGeofenceStore` (fences CRUD), `useMonitoringStore` (SDK control), `useTrackingStore` (active session). | Criar stores novos, manter locationStore como facade que re-exporta. Deprecate gradualmente. |
| C4 | **Test harness** | Criar testes para exitHandler, confirmExit, splitSessionAtMidnights. Mock do SDK e SQLite. | Usar jest + sqlite-memory. Priorizar fluxos de confirmExit e crash recovery. |

---

## Nota Final: Se Eu Fosse o Tech Lead

**Eu bloquearia o release por 3 razões:**

1. **C2 — Crash durante `confirmExit()` perde horas trabalhadas silenciosamente.** O usuário trabalha 8h, o app crasha no momento errado, e `daily_hours` não é atualizado. Não há retry, não há log. O usuário descobre na sexta quando vê o timesheet com 0h num dia que trabalhou. **Isso é perda de dados em produção.** A fix é uma transação SQLite — 1 hora de trabalho.

2. **C1 — `pendingExits` in-memory faz sessões fantasma.** Já vi esse padrão causar billing disputes: "O app diz que eu trabalhei 14h nesse dia, mas eu só trabalhei 8h." O timer fica rodando porque o exit cooldown se perdeu no crash. Session guard mitiga em 10h, mas até lá o dano está feito.

3. **C3 — Headless event loss é irrecuperável.** O SDK dispara EXIT, o app tenta bootstrap, falha (auth not ready, network down), e o evento é perdido **para sempre**. Sem fila, sem retry, sem log persistente. Para um app que promete tracking automático, isso invalida a proposta de valor core.

**Todas as 3 têm fix de baixo risco (transação, tabela nova, fila simples) e não exigem reescrita. São hotfixes de 1-2 dias que protegem integridade de dados.**

---

*Relatório gerado em 20/02/2026 por auditoria automatizada do codebase `onsite-timekeeper@main`.*
