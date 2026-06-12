import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

/** Respond with JSON */
function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/** Log integrity violation */
async function logIntegrity(callId: string, issue: string) {
  await supabase.from("data_integrity_logs").insert({
    table_name: "calls",
    record_id: callId,
    violation_type: "state_engine",
    details: { issue },
  });
}

// ─── ACTION: create_call ───
async function createCall(body: Record<string, unknown>) {
  const { lead_id, opener_id } = body;
  if (!lead_id) return json({ error: "lead_id required" }, 400);

  const { data, error } = await supabase
    .from("calls")
    .insert({
      user_id: opener_id || lead_id, // user_id is required by schema
      status: "created",
      call_type: "sales",
      funnel_stage: "created",
      offer_type: "standard",
      opener_id,
    })
    .select("id")
    .single();

  if (error) return json({ error: error.message }, 500);
  return json({ call_id: data.id });
}

// ─── ACTION: book_call ───
async function bookCall(body: Record<string, unknown>) {
  const { call_id, setter_id, scheduled_for } = body;
  if (!call_id) return json({ error: "call_id required" }, 400);

  const { data: call } = await supabase
    .from("calls")
    .select("id, booked_at")
    .eq("id", call_id)
    .single();

  if (!call) return json({ error: "Call not found" }, 404);
  if (call.booked_at) {
    await logIntegrity(call_id as string, "Attempted to book already-booked call");
    return json({ error: "Call already booked" }, 409);
  }

  const updates: Record<string, unknown> = {
    booked_at: new Date().toISOString(),
    status: "booked",
  };
  if (setter_id) updates.setter_id = setter_id;
  if (scheduled_for) updates.scheduled_for = scheduled_for;

  const { error } = await supabase.from("calls").update(updates).eq("id", call_id);
  if (error) return json({ error: error.message }, 500);
  return json({ success: true });
}

// ─── ACTION: mark_showed ───
async function markShowed(body: Record<string, unknown>) {
  const { call_id } = body;
  if (!call_id) return json({ error: "call_id required" }, 400);

  const { data: call } = await supabase
    .from("calls")
    .select("id, booked_at, showed_at")
    .eq("id", call_id)
    .single();

  if (!call) return json({ error: "Call not found" }, 404);
  if (!call.booked_at) {
    await logIntegrity(call_id as string, "Attempted showed without booked");
    return json({ error: "Cannot mark showed: call not booked" }, 422);
  }
  if (call.showed_at) {
    return json({ error: "Already marked as showed" }, 409);
  }

  const { error } = await supabase
    .from("calls")
    .update({ showed_at: new Date().toISOString(), status: "showed" })
    .eq("id", call_id);

  if (error) return json({ error: error.message }, 500);
  return json({ success: true });
}

// ─── ACTION: mark_no_show ───
async function markNoShow(body: Record<string, unknown>) {
  const { call_id } = body;
  if (!call_id) return json({ error: "call_id required" }, 400);

  const { data: call } = await supabase
    .from("calls")
    .select("id, booked_at, showed_at")
    .eq("id", call_id)
    .single();

  if (!call) return json({ error: "Call not found" }, 404);
  if (!call.booked_at) {
    await logIntegrity(call_id as string, "Attempted no_show without booked");
    return json({ error: "Cannot mark no_show: call not booked" }, 422);
  }
  if (call.showed_at) {
    await logIntegrity(call_id as string, "Attempted no_show but already showed");
    return json({ error: "Cannot mark no_show: already showed" }, 409);
  }

  const nowIso = new Date().toISOString();

  const { error } = await supabase
    .from("calls")
    .update({ no_show_at: nowIso, status: "no_show" })
    .eq("id", call_id);

  if (error) return json({ error: error.message }, 500);

  // ─── V6.1: emit canonical no_show event so the dispatcher fires the
  // `no_show` tag in GHL (no stage move per spec). Lookup the lead by the
  // call's user_id → most recent lead email, so the dispatcher can resolve
  // identity. Failure here must NOT block the call status update.
  try {
    const { data: callRow } = await supabase
      .from("calls")
      .select("user_id")
      .eq("id", call_id)
      .maybeSingle();

    let leadId: string | null = null;
    let leadEmail: string | null = null;
    if (callRow?.user_id) {
      const { data: lead } = await supabase
        .from("leads")
        .select("id, email")
        .eq("user_id", callRow.user_id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      leadId = (lead as any)?.id ?? null;
      leadEmail = (lead as any)?.email ?? null;
    }

    await supabase.from("outbound_events").insert({
      event_name: "no_show",
      entity_type: "lead",
      entity_id: leadId,
      email: leadEmail,
      payload: {
        source: "call_engine.mark_no_show",
        call_id,
        detected_at: nowIso,
      },
      status: "pending",
    } as never);
  } catch (e) {
    console.error("[call-engine] failed to emit no_show event:", e);
  }

  return json({ success: true });
}

// ─── ACTION: close_call ───
async function closeCall(body: Record<string, unknown>) {
  const { call_id, outcome, revenue } = body;
  if (!call_id) return json({ error: "call_id required" }, 400);
  if (!outcome || !["won", "lost"].includes(outcome as string))
    return json({ error: "outcome must be 'won' or 'lost'" }, 400);

  const { data: call } = await supabase
    .from("calls")
    .select("id, showed_at, closed_at, user_id")
    .eq("id", call_id)
    .single();

  if (!call) return json({ error: "Call not found" }, 404);
  if (!call.showed_at) {
    await logIntegrity(call_id as string, "Attempted close without showed");
    return json({ error: "Cannot close: call not showed" }, 422);
  }
  if (call.closed_at) {
    return json({ error: "Call already closed" }, 409);
  }

  if (outcome === "won" && (!revenue || Number(revenue) <= 0)) {
    return json({ error: "Revenue must be > 0 for won deals" }, 400);
  }

  const status = outcome === "won" ? "closed_won" : "closed_lost";
  const { error } = await supabase
    .from("calls")
    .update({
      closed_at: new Date().toISOString(),
      result: outcome,
      revenue: outcome === "won" ? Number(revenue) : 0,
      status,
      deal_size: outcome === "won" ? Number(revenue) : null,
    })
    .eq("id", call_id);

  if (error) return json({ error: error.message }, 500);

  // If won → distribute commissions + recalc KPIs
  if (outcome === "won") {
    await supabase.rpc("distribute_commissions", { p_call_id: call_id });

    // Recalc KPI snapshots for all involved users
    const { data: fullCall } = await supabase
      .from("calls")
      .select("user_id, opener_id, setter_id")
      .eq("id", call_id)
      .single();

    if (fullCall) {
      const userIds = new Set(
        [fullCall.user_id, fullCall.opener_id, fullCall.setter_id].filter(Boolean)
      );
      for (const uid of userIds) {
        await supabase.rpc("recalc_user_kpi_snapshot", { p_user_id: uid });
      }
    }
  }

  // Also evaluate promotion after close
  if (call.user_id) {
    await supabase.rpc("evaluate_user_for_promotion", { p_user_id: call.user_id });
  }

  return json({ success: true, status });
}

// ─── ACTION: evaluate_promotion ───
async function evaluatePromotion(body: Record<string, unknown>) {
  const { user_id } = body;
  if (!user_id) return json({ error: "user_id required" }, 400);

  const { data, error } = await supabase.rpc("evaluate_user_for_promotion", { p_user_id: user_id });
  if (error) return json({ error: error.message }, 500);
  return json(data);
}

// ─── ACTION: promote_user ───
async function promoteUser(body: Record<string, unknown>) {
  const { user_id, admin_id } = body;
  if (!user_id) return json({ error: "user_id required" }, 400);

  const { data, error } = await supabase.rpc("promote_user", { p_user_id: user_id, p_admin_id: admin_id || null });
  if (error) return json({ error: error.message }, 500);
  return json(data);
}

// ─── ACTION: generate_forecast ───
async function generateForecast(body: Record<string, unknown>) {
  const { pipeline_id, user_id, window: fw } = body;
  const { data, error } = await supabase.rpc("generate_revenue_forecast", {
    p_pipeline_id: pipeline_id || null,
    p_user_id: user_id || null,
    p_window: (fw as string) || "30d",
  });
  if (error) return json({ error: error.message }, 500);
  return json({ forecast_id: data });
}

// ─── ROUTER ───
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { action, ...body } = await req.json();

    switch (action) {
      case "create_call":
        return await createCall(body);
      case "book_call":
        return await bookCall(body);
      case "mark_showed":
        return await markShowed(body);
      case "mark_no_show":
        return await markNoShow(body);
      case "close_call":
        return await closeCall(body);
      case "evaluate_promotion":
        return await evaluatePromotion(body);
      case "promote_user":
        return await promoteUser(body);
      case "generate_forecast":
        return await generateForecast(body);
      default:
        return json({ error: `Unknown action: ${action}` }, 400);
    }
  } catch (e) {
    console.error("[call-engine] Error:", e);
    return json({ error: "Internal server error" }, 500);
  }
});
