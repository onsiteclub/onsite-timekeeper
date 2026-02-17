# FASE 3: IA Voz — Controle Remoto do App

> **Implementar DEPOIS das Fases 1 e 2 estarem funcionando.**
> **Pré-requisito: IA Guardião filtrando GPS + IA Secretário arrumando dados.**
> **Este documento é independente — tem tudo que o agente precisa.**

## CONTEXTO

O OnSite Timekeeper é um app React Native/Expo de rastreamento automático de horas de trabalho via geofencing.

```
Stack: React Native + Expo SDK 52+ / TypeScript / Zustand / SQLite / Supabase
```

As Fases 1 e 2 adicionaram IA Guardião (filtra GPS) e IA Secretário (arruma dados). Agora a **Fase 3** adiciona controle por voz — o worker fala e a IA executa. É o **controle remoto** do app inteiro.

### Arquivos relevantes:

| Arquivo | Papel |
|---------|-------|
| `src/lib/ai/interpreter.ts` | Fase 1. Tem `buildWorkerProfile()` que a voz reutiliza |
| `src/lib/ai/secretary.ts` | Fase 2. Tem `generateReport()` que a voz pode disparar |
| `src/lib/database/core.ts` | SQLite schema. Tabela `daily_hours` com colunas incluindo `is_manual_edit` (Fase 2) |
| `src/lib/exitHandler.ts` | `confirmExit()` — a voz pode disparar stop manual |
| `src/hooks/hooks.ts` | handlePause/handleResume/handleStop — a voz controla esses |
| `src/lib/supabase.ts` | Client Supabase já configurado |

## FILOSOFIA

O worker tá no canteiro com luvas, capacete, mãos sujas. Não vai ficar navegando telas. Aperta um botão, fala, e a IA executa. Sem confirmação, sem fricção.

**A voz é a fonte de maior prioridade** — é a intenção explícita do worker. Sobrepõe GPS, sobrepõe IA Secretário, sobrepõe tudo.

### Hierarquia de dados (prioridade):

```
1. VOZ do worker        → is_voice_edit = 1, is_manual_edit = 1
2. EDIÇÃO MANUAL (UI)   → is_manual_edit = 1
3. IA SECRETÁRIO         → ai_corrected = 1
4. IA GUARDIÃO           → filtro em tempo real
5. GPS BRUTO             → dado cru do device
```

## O QUE O WORKER PODE FAZER COM VOZ

### Corrigir dados (sobrepõe tudo):
- "Hoje eu saí às 4 da tarde" → altera end_time
- "Ontem eu não tirei almoço" → zera break_minutes
- "Sexta eu trabalhei meio dia só" → ajusta total
- "Apaga o dia de quarta, não fui trabalhar" → soft delete
- "Eu cheguei às 6 e meia hoje" → corrige start_time

### Comandos (executa ações):
- "Manda meu relatório da semana pro meu email" → generateReport() + email
- "Manda pro meu chefe" → gera PDF + envia pro contato salvo
- "Pausa" / "Volta" → handlePause/handleResume
- "Para o timer" → handleStop (manual exit)

### Consultas (lê SQLite, responde):
- "Quantas horas essa semana?" → soma e responde
- "Quanto trabalhei no Site Alpha esse mês?" → filtra e soma
- "Que horas eu cheguei hoje?" → lê active_tracking.enter_at

---

## O QUE PRECISA SER CRIADO

### 1. Migração SQLite

Adicionar no `core.ts`:

```typescript
// Migration: Add voice edit tracking to daily_hours
await db.execAsync(`
  ALTER TABLE daily_hours ADD COLUMN is_voice_edit INTEGER DEFAULT 0;
`);
```

### 2. Edge Function: `supabase/functions/ai-voice/index.ts`

```bash
supabase functions new ai-voice
```

```typescript
// supabase/functions/ai-voice/index.ts
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-4-20250514";

const VOICE_PROMPT = `
You are the Voice Assistant for OnSite Timekeeper, a construction worker's time-tracking app.

## YOUR ROLE
You interpret voice commands from construction workers and return structured actions for the app to execute. Workers speak casually, often in noisy environments, sometimes mixing English and Portuguese.

## LANGUAGE
Workers may speak in English or Portuguese (Brazilian). Understand both. Always respond in the same language the worker used.

## CONTEXT YOU RECEIVE
- Current app state (active session, current site, timer value)
- Recent daily_hours (last 7 days)
- Worker profile (avg times, sites)

## ACTIONS YOU CAN RETURN

### Data corrections (modify daily_hours)
{
  "action": "update_record",
  "date": "2026-02-12",
  "changes": {
    "end_time": "16:00",
    "break_minutes": 0,
    "start_time": "06:30",
    "total_minutes": 540
  },
  "reason": "Worker said: saí às 4 da tarde",
  "response_text": "Pronto, marquei sua saída às 16:00 hoje."
}

### Delete a day
{
  "action": "delete_record",
  "date": "2026-02-10",
  "reason": "Worker said: apaga quarta, não fui trabalhar",
  "response_text": "Dia 10 de fevereiro removido."
}

### Session control
{
  "action": "pause" | "resume" | "stop",
  "reason": "Worker said: pausa",
  "response_text": "Timer pausado."
}

### Send report
{
  "action": "send_report",
  "period": { "start": "2026-02-03", "end": "2026-02-09" },
  "destination": "email" | "boss" | "self",
  "reason": "Worker said: manda relatório da semana pro meu email",
  "response_text": "Gerando relatório de 3 a 9 de fevereiro. Vou mandar pro seu email."
}

### Query (read-only, just answer)
{
  "action": "query",
  "query_type": "hours_this_week" | "hours_today" | "hours_at_site" | "arrival_time" | "break_time",
  "result": "42h 30min",
  "response_text": "Essa semana você trabalhou 42 horas e 30 minutos."
}

### Navigate to screen
{
  "action": "navigate",
  "screen": "report" | "locations" | "settings" | "home",
  "params": { "startDate": "2026-02-01", "endDate": "2026-02-14" },
  "response_text": "Abrindo seu relatório."
}

### Unclear command
{
  "action": "clarify",
  "response_text": "Não entendi. Pode repetir?"
}

## IMPORTANT RULES

1. When worker corrects a time, ALWAYS recalculate total_minutes = (end - start) - break
2. When worker says "today", use the current date from app_state
3. When worker says "yesterday", calculate the date
4. When worker says "this week", calculate Monday-Sunday of current week
5. When worker mentions a day name ("sexta", "friday"), find the most recent occurrence
6. For "send to boss/chefe", use destination "boss" — the app handles the contact lookup
7. NEVER ask for confirmation on simple corrections. Just do it.
8. If worker says something ambiguous, do your best guess. Only use "clarify" if truly unintelligible.
9. Worker commands override everything — if worker says "I left at 4" but GPS says 6, worker wins.
10. Keep response_text SHORT and natural. Construction workers don't want essays.
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
    const { transcript, app_state, recent_days, profile } = await req.json();

    if (!transcript) {
      return new Response(JSON.stringify({ 
        action: "clarify", 
        response_text: "Não ouvi nada. Tenta de novo?" 
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    }

    // ─── BUILD MESSAGE ───
    const userMessage = `
VOICE TRANSCRIPT: "${transcript}"

CURRENT APP STATE:
- Date/Time now: ${app_state.now}
- Active session: ${app_state.has_active_session}
- Current site: ${app_state.current_site || "none"}
- Timer: ${app_state.timer || "not running"}
- Is paused: ${app_state.is_paused}

RECENT DAYS (last 7):
${JSON.stringify(recent_days || [], null, 2)}

WORKER PROFILE:
- Avg entry: ${profile.avg_entry_time}
- Avg exit: ${profile.avg_exit_time}
- Avg shift: ${profile.avg_shift_hours}h
- Work days: ${profile.typical_work_days?.join(", ")}

Return ONLY a JSON action object.
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
        max_tokens: 400,
        system: VOICE_PROMPT,
        messages: [{ role: "user", content: userMessage }],
      }),
    });

    if (!anthropicResponse.ok) {
      return new Response(JSON.stringify({
        action: "clarify",
        response_text: "Tô com problema de conexão. Tenta de novo em um minuto.",
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    }

    const anthropicData = await anthropicResponse.json();
    const text = anthropicData.content?.[0]?.text || "";
    const clean = text.replace(/```json\n?|```\n?/g, "").trim();
    const result = JSON.parse(clean);

    return new Response(JSON.stringify(result), {
      status: 200, headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Voice function error:", error);
    return new Response(JSON.stringify({
      action: "clarify",
      response_text: "Algo deu errado. Tenta de novo.",
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  }
});
```

### 3. Arquivo: `src/lib/ai/voice.ts`

```typescript
// src/lib/ai/voice.ts
import { supabase } from '../supabase';
import { logger } from '../logger';
import { getDb } from '../database/core';
import { buildWorkerProfile } from './interpreter'; // reusa da Fase 1

// ============================================================
// TYPES
// ============================================================

interface VoiceAction {
  action: 'update_record' | 'delete_record' | 'pause' | 'resume' | 'stop' | 'send_report' | 'query' | 'navigate' | 'clarify';
  date?: string;
  changes?: {
    start_time?: string;
    end_time?: string;
    break_minutes?: number;
    total_minutes?: number;
  };
  period?: { start: string; end: string };
  destination?: 'email' | 'boss' | 'self';
  query_type?: string;
  result?: string;
  screen?: string;
  params?: Record<string, any>;
  reason?: string;
  response_text: string;
}

interface AppState {
  now: string;
  has_active_session: boolean;
  current_site: string | null;
  timer: string | null;
  is_paused: boolean;
}

// ============================================================
// VOICE COMMAND PROCESSOR
// ============================================================

/**
 * Main entry point for voice commands.
 * 1. Gets transcript (passed from UI component)
 * 2. Builds app context
 * 3. Sends to Edge Function
 * 4. Executes returned action
 * 5. Returns response text for UI feedback
 */
export async function processVoiceCommand(
  transcript: string,
  userId: string,
  appState: AppState
): Promise<{ responseText: string; actionExecuted: string }> {
  const db = getDb();

  try {
    // Build context
    const profile = await buildWorkerProfile(userId);
    
    // Get last 7 days
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const recentDays = await db.getAllAsync(
      `SELECT date, location_name, start_time, end_time, total_minutes, break_minutes, 
              COALESCE(is_manual_edit, 0) as is_manual_edit,
              COALESCE(ai_corrected, 0) as ai_corrected
       FROM daily_hours 
       WHERE user_id = ? AND date >= ? AND deleted_at IS NULL
       ORDER BY date DESC`,
      [userId, sevenDaysAgo]
    );

    // Call Edge Function
    const { data, error } = await supabase.functions.invoke('ai-voice', {
      body: {
        transcript,
        app_state: appState,
        recent_days: recentDays,
        profile,
      },
    });

    if (error) {
      logger.error('voice', 'Edge function error', { error: error.message });
      return { responseText: 'Problema de conexão. Tenta de novo.', actionExecuted: 'error' };
    }

    const action = data as VoiceAction;

    // Execute the action
    await executeVoiceAction(action, userId, db);

    return { 
      responseText: action.response_text, 
      actionExecuted: action.action 
    };
  } catch (error) {
    logger.error('voice', 'Voice command failed', { error: String(error) });
    return { responseText: 'Algo deu errado. Tenta de novo.', actionExecuted: 'error' };
  }
}

// ============================================================
// ACTION EXECUTOR
// ============================================================

async function executeVoiceAction(
  action: VoiceAction, 
  userId: string, 
  db: any
): Promise<void> {
  switch (action.action) {
    case 'update_record': {
      if (!action.date || !action.changes) break;
      
      const sets: string[] = [];
      const values: any[] = [];
      
      if (action.changes.start_time) { sets.push('start_time = ?'); values.push(action.changes.start_time); }
      if (action.changes.end_time) { sets.push('end_time = ?'); values.push(action.changes.end_time); }
      if (action.changes.break_minutes !== undefined) { sets.push('break_minutes = ?'); values.push(action.changes.break_minutes); }
      if (action.changes.total_minutes) { sets.push('total_minutes = ?'); values.push(action.changes.total_minutes); }
      
      // Voice = highest priority — mark both flags
      sets.push('is_manual_edit = 1');
      sets.push('is_voice_edit = 1');
      sets.push("updated_at = datetime('now')");
      
      if (sets.length > 2) {
        values.push(userId, action.date);
        await db.runAsync(
          `UPDATE daily_hours SET ${sets.join(', ')} WHERE user_id = ? AND date = ? AND deleted_at IS NULL`,
          values
        );
        logger.info('voice', `✅ Updated ${action.date}: ${action.reason}`);
      }
      break;
    }

    case 'delete_record': {
      if (!action.date) break;
      await db.runAsync(
        `UPDATE daily_hours SET deleted_at = datetime('now') WHERE user_id = ? AND date = ? AND deleted_at IS NULL`,
        [userId, action.date]
      );
      logger.info('voice', `🗑️ Soft-deleted ${action.date}: ${action.reason}`);
      break;
    }

    case 'pause':
    case 'resume':
    case 'stop': {
      // These need to trigger UI actions via the component that hosts the mic button.
      // The voice module returns the action, the UI component executes it.
      // Implementation: the UI component checks actionExecuted and calls
      // handlePause/handleResume/handleStop accordingly.
      logger.info('voice', `⏯️ Session control: ${action.action}`);
      break;
    }

    case 'send_report': {
      // The UI component handles report generation and sending.
      // It reads action.period and action.destination from the return value.
      logger.info('voice', `📤 Send report: ${action.period?.start} to ${action.period?.end} → ${action.destination}`);
      break;
    }

    case 'query': {
      // Read-only — response_text already has the answer
      logger.info('voice', `🔍 Query: ${action.query_type} → ${action.result}`);
      break;
    }

    case 'navigate': {
      // UI component handles navigation
      logger.info('voice', `📱 Navigate to: ${action.screen}`);
      break;
    }

    case 'clarify': {
      // Nothing to execute — just show response_text
      break;
    }
  }
}
```

### 4. UI: Botão de Mic na Home Screen

O botão de microfone deve ficar acessível na tela principal. Sugestão: FAB (floating action button) no canto inferior, sempre visível.

```typescript
// Adicionar no componente Home (index.tsx ou equivalente)
// O botão precisa de:
// 1. Estado de gravação (idle → recording → processing → response)
// 2. Feedback visual (botão pulsa enquanto grava, spinner enquanto processa)
// 3. Mostrar response_text em toast/banner por 3-4 segundos
// 4. Após processVoiceCommand() retornar, checar actionExecuted:
//    - 'pause' → chamar handlePause()
//    - 'resume' → chamar handleResume()  
//    - 'stop' → chamar handleStop()
//    - 'navigate' → navigation.navigate(action.screen, action.params)
//    - 'send_report' → disparar fluxo de geração + envio de relatório
//    - 'update_record' / 'delete_record' → já executado no voice.ts, só mostrar feedback
//    - 'query' → mostrar response_text
//    - 'clarify' → mostrar response_text

// Props que o VoiceFAB precisa receber:
interface VoiceFABProps {
  userId: string;
  appState: AppState;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
  onNavigate: (screen: string, params?: Record<string, any>) => void;
  onReportRequested: (period: { start: string; end: string }, destination: string) => void;
}
```

### 5. Speech-to-Text

O agente deve implementar a transcrição de voz usando uma destas opções (em ordem de preferência):

**Opção A: `@react-native-voice/voice`** (on-device, grátis, funciona offline)
```bash
npm install @react-native-voice/voice
```

**Opção B: `expo-av` + Whisper API** (melhor accuracy, custo mínimo, precisa de rede)
```bash
npx expo install expo-av
# Grava áudio com expo-av, envia pra OpenAI Whisper API
```

**Opção C: Whisper via Supabase Edge Function** (centraliza tudo no Supabase)
- Grava com expo-av, envia base64 pra edge function, transcreve lá

A escolha depende do que já está instalado no projeto. A opção A é a mais simples.

---

## RESUMO — FASE 3

### Arquivos a CRIAR:
| Arquivo | Descrição |
|---------|-----------|
| `src/lib/ai/voice.ts` | processVoiceCommand() + executeVoiceAction() |
| `supabase/functions/ai-voice/index.ts` | Edge Function que interpreta comandos de voz |
| Componente VoiceFAB | Botão de mic com estados (idle/recording/processing/response) |

### Arquivos a EDITAR:
| Arquivo | O que mudar |
|---------|-------------|
| `src/lib/database/core.ts` | Migration: coluna `is_voice_edit` em `daily_hours` |
| Home screen (index.tsx) | Adicionar VoiceFAB com callbacks |

### Instalar:
```bash
npm install @react-native-voice/voice
# ou
npx expo install expo-av
```

### Deploy:
```bash
supabase functions deploy ai-voice
```
(Usa a mesma `ANTHROPIC_API_KEY` já configurada nas Fases 1 e 2)

### Como testar:
1. Deploy a Edge Function
2. Build com VoiceFAB
3. Fale "quantas horas essa semana?" → deve responder com soma
4. Fale "hoje eu saí às 4" → deve alterar end_time no daily_hours
5. Fale "pausa" → deve pausar o timer
6. Fale em português e inglês — ambos devem funcionar

### Custo estimado:
~$4/mês para 100 workers (poucos voice commands por dia, ~400 tokens cada).
