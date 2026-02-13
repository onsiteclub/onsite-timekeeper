// supabase/functions/ai-secretary/index.ts
//
// Supabase Edge Function — AI Secretário (Fase 2)
// Cleans up daily_hours data and generates structured reports.
// Uses OpenAI GPT-4o for data analysis.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY")!;
const OPENAI_URL = "https://api.openai.com/v1/chat/completions";
const MODEL = Deno.env.get("OPENAI_MODEL") || "gpt-4o";

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
        "Access-Control-Allow-Headers":
          "authorization, x-client-info, apikey, content-type",
      },
    });
  }

  try {
    // ─── AUTH ───
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization" }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      );
    }

    // ─── PARSE ───
    const { mode, daily_hours, profile } = await req.json();

    if (!mode || !daily_hours || !Array.isArray(daily_hours)) {
      return new Response(
        JSON.stringify({ error: "Missing mode or daily_hours" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
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

${
  mode === "daily"
    ? "Analyze this single day. If anomalies found, return corrected values. If day looks normal, return original values unchanged with empty corrections array."
    : "Analyze this period. Generate a complete report with summary, daily breakdown, flags, and weekly totals. Correct anomalies as needed."
}

Respond ONLY with a JSON object.
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
        max_tokens: mode === "daily" ? 500 : 2000,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SECRETARY_PROMPT },
          { role: "user", content: userMessage },
        ],
      }),
    });

    if (!openaiResponse.ok) {
      console.error("OpenAI error:", openaiResponse.status);
      return new Response(
        JSON.stringify({ error: "AI service unavailable", fallback: true }),
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
    console.error("Edge function error:", error);
    return new Response(
      JSON.stringify({ error: "Processing failed", fallback: true }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  }
});
