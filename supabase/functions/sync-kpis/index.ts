import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { user_id, kpis, source } = await req.json();

    if (!user_id || !kpis) {
      return new Response(
        JSON.stringify({ error: "user_id and kpis required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Map GHL fields to member_kpis columns
    const updatePayload: Record<string, any> = { updated_at: new Date().toISOString() };

    const fieldMap: Record<string, string> = {
      close_rate: "closing_rate",
      closing_rate: "closing_rate",
      calls_per_week: "calls_per_week",
      calls_handled: "calls_handled",
      show_rate: "show_rate",
      follow_up_rate: "follow_up_rate",
      crm_hygiene_score: "crm_hygiene_score",
      revenue_closed: "revenue_closed",
      revenue_per_call: "revenue_per_call",
      qualification_accuracy: "qualification_accuracy",
      objection_resolution_rate: "objection_resolution_rate",
    };

    for (const [ghlKey, value] of Object.entries(kpis)) {
      const dbKey = fieldMap[ghlKey] || ghlKey;
      if (dbKey in fieldMap || Object.values(fieldMap).includes(dbKey)) {
        updatePayload[dbKey] = Number(value) || 0;
      }
    }

    // Upsert KPIs
    const { data: existing } = await supabase
      .from("member_kpis")
      .select("id")
      .eq("user_id", user_id)
      .maybeSingle();

    if (existing) {
      const { error } = await supabase
        .from("member_kpis")
        .update(updatePayload)
        .eq("user_id", user_id);
      if (error) throw error;
    } else {
      const { error } = await supabase
        .from("member_kpis")
        .insert({ user_id, ...updatePayload });
      if (error) throw error;
    }

    // Check placement readiness after KPI update
    const { data: kpiData } = await supabase
      .from("member_kpis")
      .select("*")
      .eq("user_id", user_id)
      .single();

    const PLACEMENT_GATE = {
      closing_rate: 25,
      calls_per_week: 15,
      show_rate: 70,
      follow_up_rate: 100,
      crm_hygiene_score: 100,
    };

    const allMet = Object.entries(PLACEMENT_GATE).every(
      ([key, target]) => (kpiData?.[key] ?? 0) >= target
    );

    if (allMet) {
      await supabase
        .from("profiles")
        .update({ placement_ready: true, updated_at: new Date().toISOString() })
        .eq("id", user_id);
    }

    // Audit log
    await supabase.from("audit_logs").insert({
      action: "kpi_sync",
      target_user_id: user_id,
      source_type: source || "ghl_webhook",
      after_state: updatePayload,
      note: `KPI sync from ${source || "GHL"}: ${Object.keys(updatePayload).filter(k => k !== "updated_at").join(", ")}`,
    });

    return new Response(
      JSON.stringify({
        success: true,
        placement_ready: allMet,
        updated_fields: Object.keys(updatePayload).filter(k => k !== "updated_at"),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
