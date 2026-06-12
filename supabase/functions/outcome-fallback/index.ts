// Soft-fallback: if a call has been completed > 24h and has no outcome,
// insert outcome=unknown / source=system_fallback. Idempotent.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // 48h fallback window (matches DB enforce_call_outcome_before_completion trigger)
    const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();

    // Find completed real calls older than 48h with NO outcome row yet
    const { data: candidates, error } = await sb
      .from("calls")
      .select("id, user_id, created_at, status, is_simulation, call_outcomes(id)")
      .eq("is_simulation", false)
      .in("status", ["completed", "closed"])
      .lt("created_at", cutoff)
      .limit(500);

    if (error) throw error;

    const missing = (candidates ?? []).filter((c: any) =>
      !c.call_outcomes || (Array.isArray(c.call_outcomes) && c.call_outcomes.length === 0)
    );

    if (missing.length === 0) {
      return new Response(JSON.stringify({ success: true, fallback_inserted: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const rows = missing.map((c: any) => ({
      call_id: c.id,
      user_id: c.user_id,
      outcome: "unknown",
      comment: "system_fallback: no outcome recorded within 24h",
    }));

    // Use upsert on call_id to stay idempotent across retries
    const { error: insErr, count } = await sb
      .from("call_outcomes")
      .upsert(rows, { onConflict: "call_id", ignoreDuplicates: true, count: "exact" });

    if (insErr) throw insErr;

    return new Response(JSON.stringify({ success: true, fallback_inserted: count ?? rows.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("outcome-fallback error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
