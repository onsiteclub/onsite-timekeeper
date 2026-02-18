// supabase/functions/ai-whisper/index.ts
//
// Supabase Edge Function — OpenAI Whisper Transcription
// Receives audio (base64) from the client and returns transcribed text.
// Uses OpenAI Whisper API for multilingual speech-to-text.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY")!;
const OPENAI_WHISPER_URL = "https://api.openai.com/v1/audio/transcriptions";
const WHISPER_MODEL = "whisper-1";

Deno.serve(async (req: Request) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
      },
    });
  }

  try {
    // Auth check
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const authHeader = req.headers.get("Authorization");

    console.log("[ai-whisper] ENV check:", {
      hasUrl: !!supabaseUrl,
      hasAnonKey: !!supabaseAnonKey,
      hasAuthHeader: !!authHeader,
      authHeaderPrefix: authHeader?.substring(0, 20) + "...",
    });

    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(supabaseUrl!, supabaseAnonKey!, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    console.log("[ai-whisper] Auth result:", {
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

    // Parse request body
    const { audio_base64, mime_type } = await req.json();

    if (!audio_base64) {
      return new Response(
        JSON.stringify({ error: "Missing audio_base64 field" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Decode base64 audio to binary
    const binaryString = atob(audio_base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    // Determine file extension from MIME type
    const ext = mime_type?.includes("wav") ? "wav"
      : mime_type?.includes("mp4") || mime_type?.includes("m4a") ? "m4a"
      : mime_type?.includes("webm") ? "webm"
      : "m4a"; // default for iOS/Android

    // Build multipart form data for OpenAI API
    const formData = new FormData();
    formData.append("file", new Blob([bytes], { type: mime_type || "audio/m4a" }), `audio.${ext}`);
    formData.append("model", WHISPER_MODEL);
    // No language specified — Whisper auto-detects the language

    // Call OpenAI Whisper API
    const whisperResponse = await fetch(OPENAI_WHISPER_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
      },
      body: formData,
    });

    if (!whisperResponse.ok) {
      const errorBody = await whisperResponse.text();
      console.error("Whisper API error:", whisperResponse.status, errorBody);
      return new Response(
        JSON.stringify({ error: "Transcription failed", details: errorBody }),
        { status: 502, headers: { "Content-Type": "application/json" } }
      );
    }

    const result = await whisperResponse.json();

    return new Response(
      JSON.stringify({ transcript: result.text }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  } catch (err) {
    console.error("ai-whisper error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error", details: String(err) }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});
