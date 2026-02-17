# FASE 2: IA Secretário — Arruma o Caderninho

> **Implementar DEPOIS da Fase 1 (IA Guardião) estar funcionando.**
> **Pré-requisito: tabela `daily_hours` já tem dados limpos vindos do Guardião.**
> **Este documento é independente — tem tudo que o agente precisa.**

## CONTEXTO

O OnSite Timekeeper é um app React Native/Expo de rastreamento automático de horas de trabalho via geofencing.

```
Stack: React Native + Expo SDK 52+ / TypeScript / Zustand / SQLite / Supabase
```

A **Fase 1** (já implementada) adicionou uma IA Guardião que filtra GPS ruído em tempo real. Os dados que chegam no `daily_hours` já são mais limpos. Agora a **Fase 2** adiciona uma IA Secretário que **arruma** esses dados — corrige anomalias, preenche lacunas, organiza para relatórios.

### Arquivos relevantes:

| Arquivo | Papel |
|---------|-------|
| `src/lib/exitHandler.ts` | `confirmExit()` salva dados no `daily_hours`. É onde o Secretário vai rodar após cada salvamento |
| `src/lib/database/core.ts` | SQLite schema. Tabela `daily_hours` com colunas: date, location_name, start_time, end_time, total_minutes, break_minutes |
| `src/lib/ai/interpreter.ts` | Já existe (Fase 1). Tem `buildWorkerProfile()` que o Secretário vai reutilizar |
| `src/lib/supabase.ts` | Client Supabase já configurado |

## FILOSOFIA

O Timekeeper é o **caderninho digital do peão**. A IA Guardião preenche automaticamente. A IA Secretário **arruma** — como um secretário que organiza a agenda do chefe sem perguntar cada detalhe.

**Regras fundamentais:**
- Dados no SQLite são **rascunho** — IA e worker editam livremente
- IA Secretário **pode alterar** dados no SQLite
- IA Secretário **NUNCA** toca em registros marcados `is_manual_edit = 1` (worker já revisou)
- Na exportação PDF, preview obrigatório antes de confirmar
- Toda alteração salva o valor original (pra undo)

## QUANDO A IA SECRETÁRIO RODA

### Momento 1: Fim do dia (automático, silencioso)

```
confirmExit() salva daily_hours com dados brutos
  → chama cleanupDay() logo em seguida (async, non-blocking)
  → IA analisa o dia:
      - Dia de 15h sem break? → corrige exit pro avg do worker
      - Faltou break? → adiciona 30min baseado no padrão
      - Entrada às 2AM? → corrige baseado no perfil
  → Salva correções direto no daily_hours
  → Guarda originais nas colunas original_*
  → Loga o que mudou em ai_corrections
```

### Momento 2: Gerar relatório (sob demanda)

```
Worker abre tela de relatório, seleciona período
  → App lê daily_hours do período do SQLite
  → Envia pra Edge Function ai-secretary
  → IA olha o conjunto todo e analisa padrões:
      - Overtime consistente?
      - Dias faltando?
      - Sites diferentes?
  → Retorna relatório estruturado com summary + flags
  → Worker revisa preview → confirma → exporta PDF
```

---

## O QUE PRECISA SER CRIADO

### 1. Migrações SQLite: novas colunas em `daily_hours` + tabela `ai_corrections`

Adicionar no `core.ts`, no bloco de migrations:

```typescript
// Migration: Add AI correction columns to daily_hours
await db.execAsync(`
  ALTER TABLE daily_hours ADD COLUMN ai_corrected INTEGER DEFAULT 0;
`);
await db.execAsync(`
  ALTER TABLE daily_hours ADD COLUMN ai_correction_reason TEXT;
`);
await db.execAsync(`
  ALTER TABLE daily_hours ADD COLUMN original_start_time TEXT;
`);
await db.execAsync(`
  ALTER TABLE daily_hours ADD COLUMN original_end_time TEXT;
`);
await db.execAsync(`
  ALTER TABLE daily_hours ADD COLUMN original_total_minutes INTEGER;
`);
await db.execAsync(`
  ALTER TABLE daily_hours ADD COLUMN is_manual_edit INTEGER DEFAULT 0;
`);

// Migration: AI corrections log (transparency)
await db.execAsync(`
  CREATE TABLE IF NOT EXISTS ai_corrections (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    date TEXT NOT NULL,
    field TEXT NOT NULL,
    original_value TEXT,
    corrected_value TEXT,
    reason TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_ai_corrections_user_date 
    ON ai_corrections(user_id, date);
`);
```

### 2. Arquivo: `src/lib/ai/secretary.ts`

```typescript
// src/lib/ai/secretary.ts
import { supabase } from '../supabase';
import { logger } from '../logger';
import { getDb } from '../database/core';
import { buildWorkerProfile } from './interpreter'; // reusa da Fase 1

// ============================================================
// TYPES
// ============================================================

interface DailyRecord {
  id: string;
  date: string;
  location_id: string;
  location_name: string;
  start_time: string;
  end_time: string;
  total_minutes: number;
  break_minutes: number;
  is_manual_edit: boolean;
}

interface Correction {
  field: string;
  from: string;
  to: string;
  reason: string;
}

interface DailyCleanupResult {
  mode: 'daily';
  date: string;
  original: { start: string; end: string; total_min: number; break_min: number };
  corrected: { start: string; end: string; total_min: number; break_min: number };
  corrections: Correction[];
  flags: Array<{ type: string; message: string }>;
  confidence: number;
}

interface ReportResult {
  mode: 'report';
  period: { start: string; end: string };
  summary: {
    total_worked_hours: number;
    total_break_hours: number;
    total_days: number;
    avg_per_day: number;
    overtime_hours: number;
    sites: string[];
  };
  daily: Array<{
    date: string;
    location: string;
    start: string;
    end: string;
    worked_hours: number;
    break_min: number;
    status: string;
    was_corrected: boolean;
    correction_note?: string;
  }>;
  flags: Array<{ date: string; type: string; message: string }>;
  weekly_totals: Array<{ week: string; hours: number; overtime: number }>;
}

// ============================================================
// DAILY CLEANUP (runs after each confirmExit)
// ============================================================

/**
 * Called automatically after confirmExit() saves daily_hours.
 * Sends today's record to IA Secretário for cleanup.
 * If corrections are made, updates SQLite directly.
 */
export async function cleanupDay(userId: string, date: string): Promise<void> {
  const db = getDb();

  try {
    // Read today's record
    const record = await db.getFirstAsync<DailyRecord>(
      `SELECT id, date, location_id, location_name, start_time, end_time, 
              total_minutes, break_minutes, 
              COALESCE(is_manual_edit, 0) as is_manual_edit
       FROM daily_hours 
       WHERE user_id = ? AND date = ? AND deleted_at IS NULL`,
      [userId, date]
    );

    if (!record) {
      logger.warn('secretary', `No record found for ${date}`);
      return;
    }

    // Don't touch manually edited records
    if (record.is_manual_edit) {
      logger.info('secretary', `Skipping ${date} — manually edited by worker`);
      return;
    }

    // Get worker profile (reuses buildWorkerProfile from Fase 1)
    const profile = await buildWorkerProfile(userId);

    // Call Edge Function
    const { data, error } = await supabase.functions.invoke('ai-secretary', {
      body: {
        mode: 'daily',
        daily_hours: [record],
        profile: {
          ...profile,
          avg_break_min: 30, // TODO: calculate from data
        },
      },
    });

    if (error || data?.fallback) {
      logger.warn('secretary', 'AI secretary unavailable, keeping original data');
      return;
    }

    const result = data as DailyCleanupResult;

    // If no corrections, nothing to do
    if (!result.corrections || result.corrections.length === 0) {
      logger.info('secretary', `${date} looks good — no corrections needed`);
      return;
    }

    // Apply corrections to SQLite
    logger.info('secretary', `Applying ${result.corrections.length} corrections to ${date}`);

    await db.runAsync(
      `UPDATE daily_hours SET 
        start_time = ?, 
        end_time = ?, 
        total_minutes = ?, 
        break_minutes = ?,
        ai_corrected = 1,
        ai_correction_reason = ?,
        original_start_time = start_time,
        original_end_time = end_time,
        original_total_minutes = total_minutes,
        updated_at = datetime('now')
       WHERE id = ?`,
      [
        result.corrected.start,
        result.corrected.end,
        result.corrected.total_min,
        result.corrected.break_min,
        result.corrections.map(c => c.reason).join('; '),
        record.id,
      ]
    );

    // Log corrections for transparency
    for (const correction of result.corrections) {
      await db.runAsync(
        `INSERT INTO ai_corrections (user_id, date, field, original_value, corrected_value, reason, created_at)
         VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`,
        [userId, date, correction.field, correction.from, correction.to, correction.reason]
      );
    }

    logger.info('secretary', `✅ ${date} cleaned up: ${result.corrections.map(c => c.field).join(', ')}`);
  } catch (error) {
    logger.error('secretary', 'Daily cleanup failed', { error: String(error) });
    // Non-critical — original data is preserved
  }
}

// ============================================================
// PERIOD REPORT (on demand)
// ============================================================

/**
 * Called when worker requests a report for a date range.
 * Returns structured report data ready for UI rendering.
 */
export async function generateReport(
  userId: string, 
  startDate: string, 
  endDate: string
): Promise<ReportResult | null> {
  const db = getDb();

  try {
    const records = await db.getAllAsync<DailyRecord>(
      `SELECT id, date, location_id, location_name, start_time, end_time,
              total_minutes, break_minutes,
              COALESCE(is_manual_edit, 0) as is_manual_edit
       FROM daily_hours
       WHERE user_id = ? AND date >= ? AND date <= ? AND deleted_at IS NULL
       ORDER BY date ASC`,
      [userId, startDate, endDate]
    );

    if (records.length === 0) {
      return null;
    }

    const profile = await buildWorkerProfile(userId);

    const { data, error } = await supabase.functions.invoke('ai-secretary', {
      body: {
        mode: 'report',
        daily_hours: records,
        profile: {
          ...profile,
          avg_break_min: 30,
        },
      },
    });

    if (error || data?.fallback) {
      logger.warn('secretary', 'AI secretary unavailable, generating basic report');
      return generateBasicReport(records, startDate, endDate);
    }

    return data as ReportResult;
  } catch (error) {
    logger.error('secretary', 'Report generation failed', { error: String(error) });
    return null;
  }
}

/**
 * Fallback report when AI is unavailable — just formats the raw data.
 */
function generateBasicReport(
  records: DailyRecord[], 
  startDate: string, 
  endDate: string
): ReportResult {
  const totalMin = records.reduce((sum, r) => sum + r.total_minutes, 0);
  const totalBreakMin = records.reduce((sum, r) => sum + r.break_minutes, 0);
  const sites = [...new Set(records.map(r => r.location_name))];

  return {
    mode: 'report',
    period: { start: startDate, end: endDate },
    summary: {
      total_worked_hours: Math.round(totalMin / 60 * 10) / 10,
      total_break_hours: Math.round(totalBreakMin / 60 * 10) / 10,
      total_days: records.length,
      avg_per_day: Math.round(totalMin / records.length / 60 * 10) / 10,
      overtime_hours: 0,
      sites,
    },
    daily: records.map(r => ({
      date: r.date,
      location: r.location_name,
      start: r.start_time,
      end: r.end_time,
      worked_hours: Math.round(r.total_minutes / 60 * 10) / 10,
      break_min: r.break_minutes,
      status: 'raw',
      was_corrected: false,
    })),
    flags: [],
    weekly_totals: [],
  };
}

// ============================================================
// UNDO CORRECTION (worker reverts AI change)
// ============================================================

/**
 * Worker disagrees with AI correction — revert to original values.
 */
export async function undoCorrection(userId: string, date: string): Promise<boolean> {
  const db = getDb();
  
  try {
    const record = await db.getFirstAsync<{
      id: string;
      original_start_time: string;
      original_end_time: string;
      original_total_minutes: number;
    }>(
      `SELECT id, original_start_time, original_end_time, original_total_minutes
       FROM daily_hours
       WHERE user_id = ? AND date = ? AND ai_corrected = 1 AND deleted_at IS NULL`,
      [userId, date]
    );

    if (!record || !record.original_start_time) {
      return false;
    }

    await db.runAsync(
      `UPDATE daily_hours SET
        start_time = original_start_time,
        end_time = original_end_time,
        total_minutes = original_total_minutes,
        ai_corrected = 0,
        is_manual_edit = 1,
        updated_at = datetime('now')
       WHERE id = ?`,
      [record.id]
    );

    logger.info('secretary', `↩️ Worker reverted AI correction for ${date}`);
    return true;
  } catch (error) {
    logger.error('secretary', 'Undo correction failed', { error: String(error) });
    return false;
  }
}
```

### 3. Edge Function: `supabase/functions/ai-secretary/index.ts`

```bash
supabase functions new ai-secretary
```

```typescript
// supabase/functions/ai-secretary/index.ts
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-4-20250514";

const SECRETARY_PROMPT = `
You are the Secretary AI for OnSite Timekeeper, a construction worker's digital logbook.

## YOUR ROLE
You organize and clean up the worker's daily hours data — like a secretary who tidies the boss's agenda without asking about every little thing.

## WHAT YOU DO
- Fix obvious anomalies (15h shift = probably missed exit)
- Add missing breaks based on worker's pattern
- Flag unusual days (half days, extreme overtime)
- Estimate corrected times when data is clearly wrong
- Organize data for clean reporting

## WHAT YOU NEVER DO
- Delete days entirely
- Change data that looks reasonable (even if unusual)
- Invent work days that don't exist in the data
- Override manual edits by the worker (marked with is_manual_edit: true)

## CONTEXT: CANADIAN CONSTRUCTION
- Standard day: 8-10 hours
- Lunch break: 30-60 min is normal, unpaid
- Overtime: after 8h/day or 44h/week (Ontario) varies by province
- Saturday: common (often time-and-a-half)
- Sunday: rare (often double time)
- Weather days: workers sometimes sent home early (winter)
- Travel between sites: counts as work in some trades

## INPUT
You receive an array of daily_hours records + the worker's 30-day profile.

## OUTPUT (ALWAYS JSON)

For single day cleanup:
{
  "mode": "daily",
  "date": "2026-02-06",
  "original": { "start": "07:05", "end": "22:30", "total_min": 925, "break_min": 30 },
  "corrected": { "start": "07:05", "end": "16:30", "total_min": 535, "break_min": 30 },
  "corrections": [
    {
      "field": "end_time",
      "from": "22:30",
      "to": "16:30",
      "reason": "Exit at 22:30 is anomalous. Worker's avg exit is 16:25. Likely missed GPS exit. Corrected to match profile."
    }
  ],
  "flags": [],
  "confidence": 0.85
}

For period report:
{
  "mode": "report",
  "period": { "start": "2026-02-03", "end": "2026-02-14" },
  "summary": {
    "total_worked_hours": 87.5,
    "total_break_hours": 4.2,
    "total_days": 10,
    "avg_per_day": 8.75,
    "overtime_hours": 7.5,
    "sites": ["Site Alpha", "Site Beta"]
  },
  "daily": [
    {
      "date": "2026-02-03",
      "location": "Site Alpha",
      "start": "07:02",
      "end": "16:45",
      "worked_hours": 8.72,
      "break_min": 30,
      "status": "normal",
      "was_corrected": false
    }
  ],
  "flags": [
    { "date": "2026-02-05", "type": "short_day", "message": "5h worked, no break recorded" }
  ],
  "weekly_totals": [
    { "week": "Feb 3-7", "hours": 43.5, "overtime": 0 }
  ]
}

## CORRECTION RULES (PRIORITY ORDER)

1. NEVER touch records where is_manual_edit = true (worker already reviewed)
2. Session > 14h without break → exit is wrong. Correct exit to worker's avg exit time. Mark as corrected.
3. Session > 12h with break → likely real overtime, but flag it. Don't correct.
4. No break on full day (>7h) → add break matching worker's avg break duration
5. Entry before 4:00 AM → likely clock/GPS error. Correct to worker's avg entry.
6. Exit after 10:00 PM → likely missed exit. Correct to worker's avg exit.
7. Session < 2h on a normal work day → flag as "early departure" but don't correct
8. Two sessions same day same site → merge if gap < 30min (GPS bounce caused split)
9. When correcting, ALWAYS log the original value and the reason
`;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
      },
    });
  }

  try {
    // ─── AUTH ───
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), {
        status: 401, headers: { "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { "Content-Type": "application/json" },
      });
    }

    // ─── PARSE ───
    const { mode, daily_hours, profile } = await req.json();

    if (!mode || !daily_hours || !Array.isArray(daily_hours)) {
      return new Response(JSON.stringify({ error: "Missing mode or daily_hours" }), {
        status: 400, headers: { "Content-Type": "application/json" },
      });
    }

    // ─── BUILD MESSAGE ───
    const userMessage = `
MODE: ${mode}

WORKER PROFILE (last ${profile.data_points} days):
- Avg entry: ${profile.avg_entry_time}
- Avg exit: ${profile.avg_exit_time}
- Avg shift: ${profile.avg_shift_hours}h
- Avg break: ${profile.avg_break_min || 30}min
- Work days: ${profile.typical_work_days.join(", ")}

DAILY HOURS DATA:
${JSON.stringify(daily_hours, null, 2)}

${mode === "daily" 
  ? "Analyze this single day. If anomalies found, return corrected values. If day looks normal, return original values unchanged with empty corrections array."
  : "Analyze this period. Generate a complete report with summary, daily breakdown, flags, and weekly totals. Correct anomalies as needed."
}

Respond ONLY with a JSON object.
`;

    // ─── CALL ANTHROPIC ───
    const anthropicResponse = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: mode === "daily" ? 500 : 2000,
        system: SECRETARY_PROMPT,
        messages: [{ role: "user", content: userMessage }],
      }),
    });

    if (!anthropicResponse.ok) {
      console.error("Anthropic error:", anthropicResponse.status);
      return new Response(
        JSON.stringify({ error: "AI service unavailable", fallback: true }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    const anthropicData = await anthropicResponse.json();
    const text = anthropicData.content?.[0]?.text || "";
    const clean = text.replace(/```json\n?|```\n?/g, "").trim();
    const result = JSON.parse(clean);

    return new Response(JSON.stringify(result), {
      status: 200, headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Edge function error:", error);
    return new Response(
      JSON.stringify({ error: "Processing failed", fallback: true }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  }
});
```

### 4. Integração: chamar `cleanupDay` após `confirmExit`

No `exitHandler.ts`, no final de `confirmExit()`, após o upsert do `daily_hours`:

```typescript
import { cleanupDay } from './ai/secretary';

// ... inside confirmExit(), after upsert daily_hours:

// IA Secretário: arruma o dia (async, non-blocking)
cleanupDay(userId, today).catch(err => {
  logger.warn('secretary', 'Cleanup failed, original data preserved', { error: String(err) });
});
```

---

## RESUMO — FASE 2

### Arquivos a CRIAR:
| Arquivo | Descrição |
|---------|-----------|
| `src/lib/ai/secretary.ts` | cleanupDay() + generateReport() + undoCorrection() |
| `supabase/functions/ai-secretary/index.ts` | Edge Function para análise e relatórios |

### Arquivos a EDITAR:
| Arquivo | O que mudar |
|---------|-------------|
| `src/lib/database/core.ts` | Migrations: colunas `ai_corrected`, `original_*`, `is_manual_edit` em `daily_hours` + tabela `ai_corrections` |
| `src/lib/exitHandler.ts` | Chamar `cleanupDay()` no final de `confirmExit()` |

### Deploy:
```bash
supabase functions deploy ai-secretary
```
(Usa a mesma `ANTHROPIC_API_KEY` já configurada na Fase 1)

### Dependências novas:
Nenhuma. Reutiliza `buildWorkerProfile()` da Fase 1 e `supabase.functions.invoke()` existente.

### Como testar:
1. Deploy a Edge Function
2. Trabalhe um dia normal — `confirmExit` roda, `cleanupDay` roda logo depois
3. Verifique `daily_hours`: se o dia foi normal, `ai_corrected` = 0
4. Force um dia anômalo (session > 14h) — verifique que `ai_corrected` = 1 e `original_end_time` tem o valor antigo
5. Teste `undoCorrection()` — deve restaurar originais
6. Teste `generateReport()` com um período de 1-2 semanas

### Custo estimado:
~$10/mês para 100 workers (1 call/dia/worker para cleanup + calls sob demanda para relatórios).
