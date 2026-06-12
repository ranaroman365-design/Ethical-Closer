// Cron-driven worker: processes pending transcriptions + pending analyses + outcome fallbacks
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, serviceKey);

    const result = {
      transcriptions_triggered: 0,
      analyses_triggered: 0,
      outcomes_fallback: 0,
      errors: [] as string[],
    };

    // ── 1) Process pending transcriptions ──────────────────────
    const { data: pendingTranscriptions } = await sb
      .from("pending_call_transcriptions")
      .select("call_id, status, attempts")
      .eq("status", "pending")
      .lt("attempts", 3)
      .is("processed_at", null)
      .limit(10);

    for (const row of pendingTranscriptions || []) {
      try {
        // Get file_url from call
        const { data: call } = await sb
          .from("calls")
          .select("id, file_url, transcript")
          .eq("id", row.call_id)
          .maybeSingle();

        if (!call) continue;
        if (call.transcript && String(call.transcript).length > 50) {
          // Already transcribed
          await sb
            .from("pending_call_transcriptions")
            .update({ status: "completed", processed_at: new Date().toISOString() })
            .eq("call_id", row.call_id);
          continue;
        }
        if (!call.file_url) {
          await sb
            .from("pending_call_transcriptions")
            .update({ status: "waiting_for_audio", attempts: (row.attempts || 0) + 1 })
            .eq("call_id", row.call_id);
          continue;
        }

        const invokeRes = await fetch(`${supabaseUrl}/functions/v1/transcribe-call`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${serviceKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ call_id: row.call_id, file_path: call.file_url }),
        });

        if (!invokeRes.ok) {
          const t = await invokeRes.text();
          await sb
            .from("pending_call_transcriptions")
            .update({
              attempts: (row.attempts || 0) + 1,
              last_error: `${invokeRes.status}: ${t.slice(0, 200)}`,
            })
            .eq("call_id", row.call_id);
          result.errors.push(`transcribe ${row.call_id}: ${invokeRes.status}`);
          continue;
        }
        await invokeRes.text(); // consume body
        await sb
          .from("pending_call_transcriptions")
          .update({ status: "completed", processed_at: new Date().toISOString() })
          .eq("call_id", row.call_id);
        result.transcriptions_triggered++;
      } catch (e) {
        result.errors.push(`transcribe ${row.call_id}: ${e instanceof Error ? e.message : "err"}`);
      }
    }

    // ── 2) Process pending analyses ───────────────────────────
    const { data: pending } = await sb
      .from("pending_call_analyses")
      .select("call_id, attempts")
      .is("processed_at", null)
      .lt("attempts", 3)
      .limit(20);

    for (const row of pending || []) {
      try {
        const invokeRes = await fetch(`${supabaseUrl}/functions/v1/analyze-call`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${serviceKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ call_id: row.call_id }),
        });
        if (!invokeRes.ok) {
          const t = await invokeRes.text();
          await sb.from("pending_call_analyses").update({
            attempts: (row.attempts || 0) + 1,
            last_error: `${invokeRes.status}: ${t.slice(0, 200)}`,
          }).eq("call_id", row.call_id);
          result.errors.push(`analyze ${row.call_id}: ${invokeRes.status}`);
          continue;
        }
        await invokeRes.text(); // consume body
        await sb.from("pending_call_analyses").update({
          processed_at: new Date().toISOString(),
        }).eq("call_id", row.call_id);
        result.analyses_triggered++;
      } catch (e) {
        result.errors.push(`analyze ${row.call_id}: ${e instanceof Error ? e.message : "err"}`);
      }
    }

    // ── 3) Process outcome fallbacks (24h grace expired) ──────
    const { data: due } = await sb
      .from("scheduled_outcome_fallback")
      .select("call_id")
      .is("resolved_at", null)
      .lte("due_at", new Date().toISOString())
      .limit(50);

    for (const row of due || []) {
      const { data: call } = await sb
        .from("calls")
        .select("id, user_id, result, status")
        .eq("id", row.call_id)
        .maybeSingle();
      if (!call) continue;

      if (call.result && call.result !== "") {
        await sb.from("scheduled_outcome_fallback").update({
          resolved_at: new Date().toISOString(),
        }).eq("call_id", row.call_id);
        continue;
      }

      const { data: existingOutcome } = await sb
        .from("call_outcomes")
        .select("id")
        .eq("call_id", row.call_id)
        .maybeSingle();
      if (!existingOutcome) {
        await sb.from("call_outcomes").insert({
          call_id: row.call_id,
          user_id: call.user_id,
          outcome: "unknown",
          comment: "system_fallback: no outcome recorded within 24h grace",
        });
      }
      await sb.from("calls").update({ result: "unknown" }).eq("id", row.call_id).is("result", null);
      await sb.from("scheduled_outcome_fallback").update({
        resolved_at: new Date().toISOString(),
      }).eq("call_id", row.call_id);
      result.outcomes_fallback++;
    }

    // Log
    try {
      await sb.from("automation_log").insert({
        job_name: "process-pending-analyses",
        status: result.errors.length > 0 ? "partial" : "success",
        metrics: result,
      });
    } catch { /* ignore log failure */ }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("process-pending-analyses error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
