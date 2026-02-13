// supabase/functions/ai-interpreter/index.ts
//
// Supabase Edge Function — AI Guardião (Fase 1)
// Proxies GPS event interpretation to OpenAI API.
// API key stays server-side, never touches the device.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY")!;
const OPENAI_URL = "https://api.openai.com/v1/chat/completions";
const MODEL = Deno.env.get("OPENAI_MODEL") || "gpt-4o";

// ─── SYSTEM PROMPT ───
const SYSTEM_PROMPT = `
You are the AI interpreter for OnSite Timekeeper, a construction worker time-tracking app.

## YOUR SOLE PURPOSE
Determine if GPS/geofence events represent REAL worker movements or NOISE/ERRORS.
The app's only job is to answer: "How many hours did this worker work today, and where?"
Every decision you make must serve this goal with maximum accuracy.

## DOMAIN: CONSTRUCTION WORK IN CANADA
- Normal work hours: 5:00 AM - 7:00 PM (varies by trade and season)
- Typical shift: 8-10 hours
- Minimum meaningful session: 30 minutes
- Lunch break: typically 30-60 minutes
- Workers usually visit 1-2 sites per day, rarely more
- Saturday work is common, Sunday is rare
- Winter in Canada means shorter daylight hours (sunrise ~7:30, sunset ~4:30)
- Summer means longer days, possible shifts starting at 5-6 AM

## KNOWN PROBLEMS YOU MUST HANDLE

### GPS Bounce / Oscillation
- PATTERN: Multiple exits in short period, each followed by quick re-entry
- INDICATORS: exits > 3 in 30min, re-entry < 3min after exit, accuracy > 100m
- CAUSE: Metal structures at construction sites degrade GPS signal
- ACTION: Ignore false exits, maintain session

### Doze Mode Delayed Exit (Android)
- PATTERN: Exit detected much later than real departure
- INDICATORS: Long gap between last GPS reading and exit event, exit at unusual hour (e.g., 2 AM)
- CAUSE: Android killed GPS updates, exit detected late when phone wakes
- ACTION: Estimate real exit time from last reliable GPS reading + worker profile

### Phone Battery Died
- PATTERN: Session has entry but no exit, battery was dropping
- INDICATORS: Last battery reading < 10%, no events after certain time
- ACTION: Estimate exit from last known data + worker average shift duration

### Forgot to Stop / Left Without Detection
- PATTERN: Session duration way beyond normal
- INDICATORS: Duration > worker's average + 3 hours, no GPS readings from site
- ACTION: Flag for review, suggest corrected exit time based on profile

### Clock Manipulation
- PATTERN: Device timestamps inconsistent with server time
- INDICATORS: Device time differs from server time by > 5 minutes
- ACTION: Flag as suspicious, recommend using server timestamps

### Construction Site GPS Interference
- PATTERN: Consistently poor accuracy at specific location
- INDICATORS: Site average accuracy > 80m, metal/concrete structures nearby
- ACTION: Increase tolerance for this site, rely on temporal patterns

## YOUR RESPONSE FORMAT (ALWAYS JSON, nothing else)

{
  "action": "confirm_exit" | "ignore_exit" | "confirm_entry" | "ignore_entry" | "flag_review" | "estimate_exit_time" | "wait_more_data",
  "confidence": 0.0 to 1.0,
  "reason": "brief explanation",
  "estimated_time": "ISO timestamp if action is estimate_exit_time",
  "cooldown_minutes": number (optional, how long to suppress similar events),
  "metadata": {} (optional, any extra data)
}

## DECISION RULES

1. FIRST ENTRY OF DAY between 5:00-9:00 AM with accuracy < 100m → ALWAYS confirm (confidence > 0.9)
2. FINAL EXIT OF DAY between 3:00-7:00 PM after 6+ hours → ALWAYS confirm (confidence > 0.9)
3. Multiple exits in < 30 min → GPS bounce → ignore all except potentially the last one
4. Exit after < 30 min on site → suspicious unless accuracy is very good (< 30m)
5. Entry between 10 PM - 4 AM → highly suspicious, flag for review
6. Session > 14 hours → flag for review, suggest estimated exit
7. Re-entry within 5 minutes of exit → likely GPS bounce, ignore the exit
8. If accuracy > 150m on exit → low confidence, recommend wait_more_data
9. Worker's historical pattern should heavily influence decisions
10. When in doubt, KEEP THE SESSION OPEN (false exit is worse than late exit)
`;

Deno.serve(async (req: Request) => {
  // ─── CORS ───
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
    // ─── AUTH: Verify the user is authenticated ───
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

    // ─── PARSE REQUEST ───
    const { event, session, profile, device } = await req.json();

    if (!event || !event.type) {
      return new Response(
        JSON.stringify({ error: "Missing event data" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // ─── BUILD USER MESSAGE ───
    const userMessage = `
GEOFENCE EVENT:
- Type: ${event.type}
- Time: ${event.timestamp}
- GPS Accuracy: ${event.accuracy}m
- Distance from fence center: ${event.distance_from_center}m
- Fence: "${event.fence_name}" (radius: ${event.fence_radius}m)

SESSION STATE:
- Active session: ${session.active_tracking_exists}
- Entry time: ${session.enter_time || "none"}
- Duration so far: ${session.duration_minutes != null ? session.duration_minutes + " minutes" : "N/A"}
- Pause seconds: ${session.pause_seconds}
- Exits today (this fence): ${session.exits_today}
- Time since last exit: ${session.time_since_last_exit_minutes != null ? session.time_since_last_exit_minutes + " minutes" : "N/A"}

WORKER PROFILE (last ${profile.data_points} days):
- Avg entry: ${profile.avg_entry_time}
- Avg exit: ${profile.avg_exit_time}
- Avg shift: ${profile.avg_shift_hours}h
- Work days: ${profile.typical_work_days.join(", ")}

DEVICE:
- Battery: ${device.battery_level !== null ? Math.round(device.battery_level * 100) + "%" : "unknown"}${device.battery_charging ? " (charging)" : ""}
- Screen: ${device.screen_on ? "on" : "off"}
- App: ${device.app_state}
- Network: ${device.network}
- OS: ${device.os}

What is your verdict? Respond ONLY with a JSON object.
`;

    // ─── CALL OPENAI API ───
    const openaiResponse = await fetch(OPENAI_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 300,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userMessage },
        ],
      }),
    });

    if (!openaiResponse.ok) {
      const errorText = await openaiResponse.text();
      console.error(
        "OpenAI API error:",
        openaiResponse.status,
        errorText
      );
      return new Response(
        JSON.stringify({
          action: "wait_more_data",
          confidence: 0.3,
          reason: `OpenAI API error: ${openaiResponse.status}`,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    const openaiData = await openaiResponse.json();
    const text = openaiData.choices?.[0]?.message?.content || "";

    // Parse JSON (strip markdown fences if present)
    const clean = text.replace(/```json\n?|```\n?/g, "").trim();
    const verdict = JSON.parse(clean);

    // ─── OPTIONAL: Log verdict to Supabase for analytics ───
    try {
      await supabase.from("ai_verdicts").insert({
        user_id: user.id,
        event_type: event.type,
        accuracy: event.accuracy,
        fence_id: event.fence_id,
        verdict_action: verdict.action,
        verdict_confidence: verdict.confidence,
        verdict_reason: verdict.reason,
        session_duration_min: session.duration_minutes,
        exits_today: session.exits_today,
        os: device.os,
      });
    } catch (logError) {
      // Non-critical — table may not exist yet
      console.warn("Failed to log verdict:", logError);
    }

    return new Response(JSON.stringify(verdict), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Edge function error:", error);
    // Return fallback verdict instead of error — app must keep working
    return new Response(
      JSON.stringify({
        action: "wait_more_data",
        confidence: 0.3,
        reason: "Edge function error — fallback verdict",
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  }
});
