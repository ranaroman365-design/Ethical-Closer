// Learning Loop — Ingest (Layer 42)
// Inputs: { source_type, source_id?, lead_id?, funnel_key?, content, category, level_relevance?, performance_metric?, confidence_score? }
// Anonymizes content, validates, inserts into learning_data_pool with status='pending'.
// Skips silently if engine disabled.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const PHONE_RE = /\+?\d[\d\s().-]{6,}\d/g;
const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const URL_RE = /https?:\/\/[^\s)]+/gi;
const IBAN_RE = /\b[A-Z]{2}\d{2}[A-Z0-9]{10,30}\b/g;
const HOUSE_NUM_RE =
  /\b\d{1,4}\s+[A-ZÄÖÜ][a-zäöüß]+(?:straße|str\.?|gasse|weg|platz|allee|ring)\b/gi;

function anonymize(raw: string, names: string[] = []) {
  if (!raw) return { text: "", scrubbed: [] as string[] };
  const scrubbed = new Set<string>();
  let out = String(raw);
  if (PHONE_RE.test(out)) { scrubbed.add("phone"); out = out.replace(PHONE_RE, "[phone]"); }
  if (EMAIL_RE.test(out)) { scrubbed.add("email"); out = out.replace(EMAIL_RE, "[email]"); }
  if (URL_RE.test(out)) { scrubbed.add("url"); out = out.replace(URL_RE, "[url]"); }
  if (IBAN_RE.test(out)) { scrubbed.add("iban"); out = out.replace(IBAN_RE, "[iban]"); }
  if (HOUSE_NUM_RE.test(out)) { scrubbed.add("address"); out = out.replace(HOUSE_NUM_RE, "[address]"); }
  for (const n of names) {
    if (!n || n.length < 2) continue;
    const re = new RegExp(`\\b${n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "gi");
    if (re.test(out)) { scrubbed.add("name"); out = out.replace(re, "[name]"); }
  }
  return { text: out.trim(), scrubbed: Array.from(scrubbed) };
}

function looksUnsafe(text: string) {
  return PHONE_RE.test(text) || EMAIL_RE.test(text) || IBAN_RE.test(text);
}

const VALID_CATEGORIES = new Set([
  "winning_phrase", "losing_phrase", "objection", "objection_handling",
  "best_message", "best_opening", "best_followup", "no_show_recovery",
  "close_reason", "lost_reason", "psychology_pattern", "personality_pattern",
  "state_pattern", "funnel_insight",
]);

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const {
      source_type, source_id, lead_id, funnel_key,
      content, category, level_relevance,
      performance_metric, confidence_score, insight_type, metadata,
    } = body;

    if (!source_type || !content || !category) {
      return new Response(JSON.stringify({ error: "missing_fields" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!VALID_CATEGORIES.has(category)) {
      return new Response(JSON.stringify({ error: "invalid_category" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: settings } = await sb
      .from("learning_loop_settings")
      .select("*")
      .eq("id", true)
      .maybeSingle();

    if (!settings?.enabled || !settings?.ingestion_enabled) {
      return new Response(
        JSON.stringify({ skipped: true, reason: "engine_disabled" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Pull lead PII to scrub
    let knownNames: string[] = [];
    let resolvedFunnel: string | null = funnel_key ?? null;
    if (lead_id) {
      const { data: lead } = await sb
        .from("leads")
        .select("name, source_funnel")
        .eq("id", lead_id)
        .maybeSingle();
      if (lead?.name) {
        knownNames.push(lead.name);
        const parts = String(lead.name).split(/\s+/).filter((p) => p.length >= 2);
        knownNames.push(...parts);
      }
      resolvedFunnel ??= lead?.source_funnel ?? null;
    }

    const { text: anonymized, scrubbed } = anonymize(String(content), knownNames);

    if (!anonymized || anonymized.length < 5) {
      return new Response(JSON.stringify({ error: "content_too_short_after_scrub" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (anonymized.length > 2000) {
      return new Response(JSON.stringify({ error: "content_too_long" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (looksUnsafe(anonymized)) {
      return new Response(JSON.stringify({ error: "pii_leak_after_scrub" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Auto-approval gate
    const conf = Number(confidence_score ?? 0.5);
    const autoApprove =
      !!settings.auto_approval_enabled &&
      conf >= Number(settings.auto_approval_min_confidence ?? 0.85);

    const { data: inserted, error } = await sb
      .from("learning_data_pool")
      .insert({
        source_type,
        source_id: source_id ?? null,
        funnel_key: resolvedFunnel,
        level_relevance: Math.max(1, Math.min(6, Number(level_relevance ?? 1))),
        category,
        insight_type: insight_type ?? null,
        anonymized_content: anonymized,
        scrubbed_fields: scrubbed,
        raw_reference_id: lead_id ?? null,
        performance_metric: performance_metric ?? null,
        confidence_score: conf,
        approval_status: autoApprove ? "approved" : "pending",
        approved_at: autoApprove ? new Date().toISOString() : null,
        metadata: metadata ?? {},
      })
      .select()
      .single();

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({ ok: true, entry: inserted, scrubbed }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("[learning-loop ingest] error", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "unknown" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
