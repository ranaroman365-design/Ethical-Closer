// Aggregates real-call patterns into call_pattern_summary every 6h.
// Idempotent — uses pattern_key uniqueness via upsert.
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

    // Pull joined real-call data
    const { data: rows, error } = await sb
      .from("calls")
      .select(`
        id, objection_type, funnel_stage, result, is_simulation,
        call_outcomes!inner ( outcome ),
        call_analysis ( overall_score )
      `)
      .eq("is_simulation", false)
      .not("call_outcomes", "is", null);

    if (error) throw error;
    if (!rows || rows.length === 0) {
      await sb.from("automation_log").insert({
        job_name: "aggregate-call-patterns",
        status: "skipped",
        metrics: { reason: "no_data", scanned: 0, patterns_created: 0 },
      });
      return new Response(JSON.stringify({ skipped: true, reason: "no data", patterns_created: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Aggregate in memory
    type Bucket = { wins: number; total: number; scoreSum: number; scoreCount: number };
    const buckets = new Map<string, Bucket & { objection_type: string|null; phase: string|null; outcome: string }>();

    for (const r of rows as any[]) {
      const oc = Array.isArray(r.call_outcomes) ? r.call_outcomes[0]?.outcome : r.call_outcomes?.outcome;
      if (!oc) continue;
      const phase = r.funnel_stage ?? null;
      const obj = r.objection_type ?? null;
      const key = `${obj ?? "_"}|${phase ?? "_"}|${oc}`;
      const score = Array.isArray(r.call_analysis) ? r.call_analysis[0]?.overall_score : r.call_analysis?.overall_score;

      const existing = buckets.get(key) ?? { wins: 0, total: 0, scoreSum: 0, scoreCount: 0, objection_type: obj, phase, outcome: oc };
      existing.total += 1;
      if (oc === "won") existing.wins += 1;
      if (typeof score === "number") { existing.scoreSum += score; existing.scoreCount += 1; }
      buckets.set(key, existing);
    }

    // Filter sample_size >= 3, build upsert rows
    const upserts = Array.from(buckets.values())
      .filter(b => b.total >= 3)
      .map(b => ({
        objection_type: b.objection_type,
        phase: b.phase,
        outcome: b.outcome,
        win_rate: b.total > 0 ? Number((b.wins / b.total).toFixed(4)) : 0,
        avg_score: b.scoreCount > 0 ? Number((b.scoreSum / b.scoreCount).toFixed(2)) : null,
        sample_size: b.total,
        updated_at: new Date().toISOString(),
      }));

    if (upserts.length === 0) {
      await sb.from("automation_log").insert({
        job_name: "aggregate-call-patterns",
        status: "skipped",
        metrics: { reason: "below_sample_threshold", scanned: rows.length, patterns_created: 0 },
      });
      return new Response(JSON.stringify({ skipped: true, reason: "no patterns >= sample_size 3", scanned: rows.length, patterns_created: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { error: upErr } = await sb
      .from("call_pattern_summary")
      .upsert(upserts, { onConflict: "pattern_key" });
    if (upErr) throw upErr;

    await sb.from("automation_log").insert({
      job_name: "aggregate-call-patterns",
      status: "success",
      metrics: { scanned: rows.length, patterns_created: upserts.length },
    });

    return new Response(JSON.stringify({ success: true, patterns_created: upserts.length, scanned: rows.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("aggregate-call-patterns error:", e);
    try {
      const sb2 = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
      await sb2.from("automation_log").insert({
        job_name: "aggregate-call-patterns",
        status: "error",
        error: e instanceof Error ? e.message : "Unknown error",
        metrics: { patterns_created: 0 },
      });
    } catch {}
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
