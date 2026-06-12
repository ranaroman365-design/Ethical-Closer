// Layer 30 — Level Messaging: simulate (admin/L6 dry-run preview).
// Returns the resolved template body without enqueuing or sending.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface SimulateBody {
  level: string;
  message_type: string;
  trigger_event: string;
  variables?: Record<string, string>;
  language?: "de" | "en";
}

function render(body: string, vars: Record<string, string>): string {
  return body.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? `{{${k}}}`);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = (await req.json()) as SimulateBody;
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: tpl } = await supabase
      .from("level_message_templates")
      .select("template_key, channel, subject_de, subject_en, body_de, body_en")
      .eq("level", body.level)
      .eq("message_type", body.message_type)
      .eq("trigger_event", body.trigger_event)
      .eq("active", true)
      .maybeSingle();

    if (!tpl) {
      return new Response(
        JSON.stringify({ ok: false, error: "no_template_found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const lang = body.language ?? "de";
    const vars = body.variables ?? {};
    const rendered = {
      template_key: tpl.template_key,
      channel: tpl.channel,
      subject: render((lang === "de" ? tpl.subject_de : tpl.subject_en) ?? "", vars),
      body: render(lang === "de" ? tpl.body_de : tpl.body_en, vars),
    };

    return new Response(JSON.stringify({ ok: true, rendered }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
