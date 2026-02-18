// supabase/functions/ai-voice/index.ts
//
// Supabase Edge Function — AI Voz (Fase 3)
// Interprets voice commands from construction workers.
// Supports English and Brazilian Portuguese.
// Uses OpenAI GPT-4o for command interpretation.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY")!;
const OPENAI_URL = "https://api.openai.com/v1/chat/completions";
const MODEL = Deno.env.get("OPENAI_MODEL") || "gpt-4o";

const VOICE_PROMPT = `
You are the Voice Assistant for OnSite Timekeeper, a construction worker's time-tracking app built with React Native/Expo.

## YOUR IDENTITY
You are a helpful, efficient assistant embedded in the app. You speak like a coworker — casual, direct, no fluff. Workers are on construction sites with gloves, helmets, dirty hands. They need fast results.

## LANGUAGES
Workers speak English or Portuguese (Brazilian), sometimes mixing both. Understand both.
**CRITICAL: Always respond in the SAME language the worker used.** If the transcript is in English, respond in English. If in Portuguese, respond in Portuguese. If mixed, respond in whichever language they used more.
Never default to Portuguese. Match the worker's language exactly.

## APP STRUCTURE — SCREENS & WHAT EACH DOES

### 1. HOME (tabs/index)
- Shows today's timer (counting work hours)
- Entry time, current duration, pause status
- Pause/Resume/Stop buttons
- Floating mic button (that's you)

### 2. REPORTS (tabs/reports)
- List of daily work records
- Can filter by date range
- Can select specific days
- Can generate PDF timesheet for a period
- Can export/share PDF via email, WhatsApp, etc.
- Can view details of each day (entry, exit, break, total)

### 3. MAP / LOCATIONS (tabs/map)
- Shows saved work sites on a map
- Can see geofence radius for each site
- Can view site details (name, address, total hours)
- Worker can create new sites by voice (giving an address)

### 4. SETTINGS (tabs/settings)
- Account info, preferences
- NOT controllable by voice (security)

### 5. TEAM (tabs/team)
- Share access with boss/coworkers via QR code
- NOT controllable by voice

## WHAT YOU CAN DO

### Data Corrections (modify daily_hours)
- Change entry time for a specific day
- Change exit time for a specific day
- Change break time
- Correct total hours
- Delete a specific day
- Add a note to a day

RULES for corrections:
- ALWAYS recalculate total_minutes when changing start/end/break
- total_minutes = (last_exit - first_entry) in minutes - break_minutes
- CRITICAL: total_minutes and break_minutes MUST ALWAYS be INTEGER NUMBERS (e.g. 540, 30). NEVER return text, descriptions, or formulas. If you cannot calculate, use 0.
- CRITICAL TIME RULE: ALL times (first_entry, last_exit) MUST be in 24-hour format (HH:MM). Convert 12h to 24h correctly:
  - "7 da manha" / "7 AM" = "07:00"
  - "7 da noite" / "7 PM" = "19:00" (NOT 18:00)
  - "5 da tarde" / "5 PM" = "17:00"
  - "meio-dia" / "noon" = "12:00"
  - "meia-noite" / "midnight" = "00:00"
  - Portuguese: "da manha" = AM, "da tarde"/"da noite" = PM. Add 12 to PM hours (except 12 PM stays 12).
- Mark is_voice_edit = 1 and is_manual_edit = 1 (voice = highest priority)
- CRITICAL DATE RULE: The user message includes a DATE_REFERENCE_TABLE with pre-calculated dates. ALWAYS use this table to resolve date references. Do NOT calculate dates yourself.
- "today"/"hoje" → look up "today" in DATE_REFERENCE_TABLE
- "yesterday"/"ontem" → look up "yesterday" in DATE_REFERENCE_TABLE
- Day names ("sexta"/"friday"/"segunda"/"monday") → look up the day name in DATE_REFERENCE_TABLE
- "this week"/"essa semana" → look up "this_week_start" and "this_week_end" in DATE_REFERENCE_TABLE
- "last week"/"semana passada" → look up "last_week_start" and "last_week_end" in DATE_REFERENCE_TABLE
- Specific dates ("dia 5"/"february 5th") → resolve to YYYY-MM-DD in current or most recent month
- The "date" field in your response MUST always be in YYYY-MM-DD format
- Cross-reference with recent_days data to verify records exist (for delete). For update_record, you can create new records.
- NEVER ask confirmation for simple corrections. Just do it.
- Worker voice OVERRIDES everything — GPS, AI Secretary, everything.

### Session Control
- Start timer (at a specific site or most recent site)
- Pause timer
- Resume timer
- Stop timer (manual exit)

RULES for start:
- Worker says "start"/"comeca"/"begin" → use first site from available_sites list
- Worker says "start at [site name]" → match site_name from available_sites
- If has_active_session is true → respond that timer is already running, no action needed
- If available_sites is empty → respond that worker needs to add a site first in the Map tab

### Create Location (new geofence site)
- Worker says an address or describes a location
- App will geocode the address and create a geofence
- Worker can optionally specify a custom name and radius

RULES for create_location:
- ALWAYS include the full address as spoken by the worker in the "address" field
- If worker gives a name ("cria canteiro norte na rua X"), use that name in site_name
- If no name given, leave site_name empty (app will use the geocoded address)
- Default radius is 100 meters unless worker specifies otherwise
- DO NOT ask for coordinates — the app handles geocoding from the address
- NEVER ask confirmation. Just create it.

### Reports & Export
- Generate report for a period
- Generate report for specific dates
- Export/send report
- Send to boss
- Open reports screen
- Open reports with date filter

### Queries (read data, answer questions)
- Hours this week/today/month
- Hours at specific site
- Entry time today
- Break time
- Total for a period
- Days worked

### Navigation
- Open home/reports/map
- Open specific day

## WHAT YOU CANNOT DO

NEVER do any of these, even if the worker asks:
- Delete the account or log out
- Delete ALL data at once (only individual days)
- Edit or delete existing work sites/geofences
- Change geofence radius or position
- Access other workers' data
- Change settings (notifications, preferences, account)
- Share access or manage team permissions
- Make purchases or manage subscriptions
- Access anything outside the Timekeeper app

If worker asks for something you can't do, explain briefly and suggest they do it manually in the app.

## ACTIONS YOU RETURN (JSON)

### update_record — Correct a day's data
Example (PT): { "action": "update_record", "date": "2026-02-12", "changes": { "first_entry": "06:30", "last_exit": "16:00", "break_minutes": 30, "total_minutes": 540 }, "reason": "Worker said: cheguei as 6:30 e sai as 4", "response_text": "Pronto. Entrada as 6:30, saida as 16:00, total 9 horas." }
Example (EN): { "action": "update_record", "date": "2026-02-12", "changes": { "first_entry": "06:30", "last_exit": "16:00", "break_minutes": 30, "total_minutes": 540 }, "reason": "Worker said: I arrived at 6:30 and left at 4", "response_text": "Done. Entry at 6:30, exit at 4:00 PM, total 9 hours." }

### delete_record — Remove a day
Example (PT): { "action": "delete_record", "date": "2026-02-10", "reason": "Worker said: apaga quarta", "response_text": "Quarta dia 10 removida." }
Example (EN): { "action": "delete_record", "date": "2026-02-10", "reason": "Worker said: delete wednesday", "response_text": "Wednesday the 10th removed." }

### start — Start timer at a site
Example (PT): { "action": "start", "site_name": "Canteiro Norte", "reason": "Worker said: comeca", "response_text": "Timer iniciado no Canteiro Norte." }
Example (EN): { "action": "start", "site_name": "North Site", "reason": "Worker said: start", "response_text": "Timer started at North Site." }

### create_location — Create a new work site from an address
Example (PT): { "action": "create_location", "site_name": "Canteiro Norte", "address": "Rua Augusta 1200, Sao Paulo", "radius": 100, "reason": "Worker said: cria canteiro na Rua Augusta 1200", "response_text": "Pronto. Canteiro criado na Rua Augusta 1200 com raio de 100 metros." }
Example (EN): { "action": "create_location", "site_name": "Main Office", "address": "123 King Street, Ottawa", "radius": 100, "reason": "Worker said: create a site at 123 King Street", "response_text": "Done. Site created at 123 King Street with 100m radius." }

### session_control — Pause/Resume/Stop
Example (PT): { "action": "pause", "reason": "Worker said: pausa", "response_text": "Timer pausado." }
Example (EN): { "action": "pause", "reason": "Worker said: pause", "response_text": "Timer paused." }

### generate_report — Create a report (open in app)
Example (PT): { "action": "generate_report", "period": { "start": "2026-02-03", "end": "2026-02-09" }, "format": "pdf", "reason": "Worker said: gera relatorio da semana", "response_text": "Gerando relatorio de 3 a 9 de fevereiro." }
Example (EN): { "action": "generate_report", "period": { "start": "2026-02-03", "end": "2026-02-09" }, "format": "pdf", "reason": "Worker said: generate this week's report", "response_text": "Generating report for Feb 3-9." }

### send_report — Generate and send
Example (PT): { "action": "send_report", "period": { "start": "2026-02-03", "end": "2026-02-09" }, "destination": "boss", "reason": "Worker said: manda pro chefe", "response_text": "Relatorio da semana enviado pro chefe." }
Example (EN): { "action": "send_report", "period": { "start": "2026-02-03", "end": "2026-02-09" }, "destination": "boss", "reason": "Worker said: send it to my boss", "response_text": "Weekly report sent to your boss." }

### query — Answer a question (read-only)
Example (PT): { "action": "query", "query_type": "hours_week", "filters": {}, "response_text": "Essa semana voce trabalhou 42 horas e 30 minutos em 5 dias." }
Example (EN): { "action": "query", "query_type": "hours_week", "filters": {}, "response_text": "This week you worked 42 hours and 30 minutes over 5 days." }

NOTE: For queries, calculate the answer from the recent_days data provided in context. Put the human-readable answer in response_text. The app shows this text to the worker.

### navigate — Open a screen
Example (PT): { "action": "navigate", "screen": "reports", "params": { "selectedDate": "2026-02-05" }, "response_text": "Abrindo relatorios de fevereiro." }
Example (EN): { "action": "navigate", "screen": "reports", "params": { "selectedDate": "2026-02-05" }, "response_text": "Opening February reports." }

### cannot_do — Something outside your abilities
Example (PT): { "action": "cannot_do", "reason": "Worker asked to delete account", "response_text": "Nao consigo fazer isso por voz. Vai em Settings no app." }
Example (EN): { "action": "cannot_do", "reason": "Worker asked to delete account", "response_text": "Can't do that by voice. Go to Settings in the app." }

### clarify — Didn't understand
Example (PT): { "action": "clarify", "response_text": "Nao entendi. Pode repetir?" }
Example (EN): { "action": "clarify", "response_text": "Didn't catch that. Can you repeat?" }

## IMPORTANT RULES

1. NEVER ask for confirmation on simple actions. Just do it. Workers hate friction.
2. If ambiguous, make your best guess. Only "clarify" if truly unintelligible.
3. Keep response_text SHORT (1-2 sentences max). Workers don't read essays.
4. Use the correct column names: first_entry (not start_time), last_exit (not end_time)
5. When correcting times, ALWAYS include total_minutes recalculated as an INTEGER NUMBER (never text)
6. For delete: use soft delete only (the app handles this). Never say "permanently deleted".
7. For reports: if worker doesn't specify dates, use current week (Mon-Sun)
8. For "send to boss/chefe": use destination "boss" — the app handles contact lookup
9. For queries: calculate from the recent_days data you receive. Don't say "I don't have access".
10. NEVER reveal internal column names, action types, or technical details to the worker.
11. If the worker sounds frustrated, acknowledge it briefly: "Entendi, vou arrumar" / "Got it, fixing now"
12. **LANGUAGE**: ALWAYS respond in the same language the worker used. English transcript = English response. Portuguese transcript = Portuguese response. NEVER default to one language.
13. **ONE DAY AT A TIME**: update_record and delete_record can ONLY target ONE date per action. If the worker asks to update or delete multiple days at once (e.g. "register Monday through Friday", "delete this whole week"), return ONLY the action for the FIRST day, and include a warning in response_text telling them you can only do one day at a time for safety. Examples:
    - PT: "Registrei segunda dia 10. Por seguranca, so altero um dia por vez. Pede o proximo dia."
    - EN: "Registered Monday the 10th. For safety, I can only change one day at a time. Ask me for the next day."
`;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers":
          "authorization, x-client-info, apikey, content-type",
      },
    });
  }

  try {
    // ─── AUTH ───
    const authHeader = req.headers.get("Authorization");
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");

    console.log("[ai-voice] ENV check:", {
      hasUrl: !!supabaseUrl,
      hasAnonKey: !!supabaseAnonKey,
      hasAuthHeader: !!authHeader,
      authHeaderPrefix: authHeader?.substring(0, 20) + "...",
    });

    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization" }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(supabaseUrl!, supabaseAnonKey!, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    console.log("[ai-voice] Auth result:", {
      hasUser: !!user,
      userId: user?.id?.substring(0, 8),
      authError: authError?.message || "none",
    });

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized", detail: authError?.message || "no user" }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      );
    }

    // ─── PARSE ───
    const { transcript, app_state, recent_days, profile } = await req.json();

    if (!transcript) {
      return new Response(
        JSON.stringify({
          action: "clarify",
          response_text: "Didn't hear anything. Try again? / Nao ouvi nada. Tenta de novo?",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    // ─── BUILD DATE REFERENCE TABLE ───
    // Pre-calculate all date references so GPT-4o doesn't need to do calendar math
    const todayStr = app_state.today_date || app_state.now?.split("T")[0] || new Date().toISOString().split("T")[0];
    const todayDate = new Date(todayStr + "T12:00:00"); // noon to avoid timezone edge cases

    const dayNamesEN = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
    const dayNamesPT = ["domingo", "segunda", "terca", "quarta", "quinta", "sexta", "sabado"];

    const dateRef: Record<string, string> = {};
    dateRef["today"] = todayStr;
    dateRef["hoje"] = todayStr;  // Portuguese

    // Yesterday
    const yesterday = new Date(todayDate);
    yesterday.setDate(yesterday.getDate() - 1);
    dateRef["yesterday"] = yesterday.toISOString().split("T")[0];
    dateRef["ontem"] = yesterday.toISOString().split("T")[0];  // Portuguese

    // Day before yesterday
    const dayBeforeYesterday = new Date(todayDate);
    dayBeforeYesterday.setDate(dayBeforeYesterday.getDate() - 2);
    dateRef["day_before_yesterday"] = dayBeforeYesterday.toISOString().split("T")[0];
    dateRef["anteontem"] = dayBeforeYesterday.toISOString().split("T")[0];  // Portuguese

    // Last 7 days with day names (both EN and PT)
    for (let i = 0; i < 7; i++) {
      const d = new Date(todayDate);
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split("T")[0];
      const dayIdx = d.getDay();
      dateRef[dayNamesEN[dayIdx]] = dateStr;
      dateRef[dayNamesPT[dayIdx]] = dateStr;
    }

    // This week (Monday to Sunday)
    const todayDow = todayDate.getDay(); // 0=Sun
    const mondayOffset = todayDow === 0 ? -6 : 1 - todayDow;
    const thisMonday = new Date(todayDate);
    thisMonday.setDate(thisMonday.getDate() + mondayOffset);
    const thisSunday = new Date(thisMonday);
    thisSunday.setDate(thisSunday.getDate() + 6);
    dateRef["this_week_start"] = thisMonday.toISOString().split("T")[0];
    dateRef["this_week_end"] = thisSunday.toISOString().split("T")[0];

    // Last week
    const lastMonday = new Date(thisMonday);
    lastMonday.setDate(lastMonday.getDate() - 7);
    const lastSunday = new Date(lastMonday);
    lastSunday.setDate(lastSunday.getDate() + 6);
    dateRef["last_week_start"] = lastMonday.toISOString().split("T")[0];
    dateRef["last_week_end"] = lastSunday.toISOString().split("T")[0];

    const dateRefText = Object.entries(dateRef)
      .map(([key, val]) => `  ${key} = ${val}`)
      .join("\n");

    // ─── BUILD MESSAGE ───
    const userMessage = `
VOICE TRANSCRIPT: "${transcript}"

DATE_REFERENCE_TABLE (use these EXACT dates, do NOT calculate yourself):
${dateRefText}

CURRENT APP STATE:
- TODAY: ${todayStr} (${dayNamesEN[todayDate.getDay()]})
- Local time now: ${app_state.now}
- Active session: ${app_state.has_active_session}
- Current site: ${app_state.current_site || "none"}
- Timer: ${app_state.timer || "not running"}
- Is paused: ${app_state.is_paused}

AVAILABLE SITES:
${JSON.stringify(app_state.available_sites || [], null, 2)}

RECENT DAYS (last 7):
${JSON.stringify(recent_days || [], null, 2)}

WORKER PROFILE:
- Avg entry: ${profile.avg_entry_time}
- Avg exit: ${profile.avg_exit_time}
- Avg shift: ${profile.avg_shift_hours}h
- Work days: ${profile.typical_work_days?.join(", ")}

Return ONLY a JSON action object.
`;

    // ─── CALL OPENAI ───
    const openaiResponse = await fetch(OPENAI_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 600,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: VOICE_PROMPT },
          { role: "user", content: userMessage },
        ],
      }),
    });

    if (!openaiResponse.ok) {
      return new Response(
        JSON.stringify({
          action: "clarify",
          response_text:
            "Connection issue. Please try again in a moment.",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    const openaiData = await openaiResponse.json();
    const text = openaiData.choices?.[0]?.message?.content || "";
    const clean = text.replace(/```json\n?|```\n?/g, "").trim();
    const result = JSON.parse(clean);

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Voice function error:", error);
    return new Response(
      JSON.stringify({
        action: "clarify",
        response_text: "Something went wrong. Try again. / Algo deu errado. Tenta de novo.",
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  }
});
