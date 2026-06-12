// Layer 31 — Message Library: render & log (Phase 1 stub).
// Picks variant by weight, renders body, logs to send_log. Does NOT actually send.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface RenderBody {
  template_key: string;
  variables?: Record<string, string>;
  language?: "de" | "en";
  user_id?: string;
  lead_id?: string;
  scope_operator_id?: string;
}

function pickVariant<T extends { variant_key: string; variant_weight: number }>(
  variants: T[],
): T | null {
  const active = variants.filter((v) => v.variant_weight > 0);
  if (active.length === 0) return null;
  const total = active.reduce((s, v) => s + v.variant_weight, 0);
  let acc = 0;
  const target = Math.random() * total;
  for (const v of active) {
    acc += v.variant_weight;
    if (target <= acc) return v;
  }
  return active[active.length - 1];
}

function render(body: string, vars: Record<string, string>): string {
  return body.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? `{{${k}}}`);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = (await req.json()) as RenderBody;
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: variants, error } = await supabase
      .from("message_library")
      .select("template_key, variant_key, variant_weight, channel, phase, trigger_event, subject_de, subject_en, body_de, body_en")
      .eq("template_key", body.template_key)
      .eq("active", true);

    if (error) throw error;
    if (!variants || variants.length === 0) {
      return new Response(JSON.stringify({ ok: false, error: "no_template" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const chosen = pickVariant(variants);
    if (!chosen) {
      return new Response(JSON.stringify({ ok: false, error: "no_active_variant" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const lang = body.language ?? "de";
    const vars = body.variables ?? {};
    const rendered = {
      template_key: chosen.template_key,
      variant_key: chosen.variant_key,
      channel: chosen.channel,
      subject: render((lang === "de" ? chosen.subject_de : chosen.subject_en) ?? "", vars),
      body: render(lang === "de" ? chosen.body_de : chosen.body_en, vars),
    };

    // Check global enabled
    const { data: settings } = await supabase
      .from("message_library_settings")
      .select("enabled")
      .eq("scope", "global")
      .maybeSingle();
    const status = settings?.enabled ? "sent_stub" : "rendered";

    await supabase.from("message_library_send_log").insert({
      user_id: body.user_id ?? null,
      lead_id: body.lead_id ?? null,
      template_key: chosen.template_key,
      variant_key: chosen.variant_key,
      phase: chosen.phase,
      trigger_event: chosen.trigger_event,
      channel: chosen.channel,
      scope_operator_id: body.scope_operator_id ?? null,
      status,
      variables: vars,
    });

    return new Response(JSON.stringify({ ok: true, rendered, status }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
