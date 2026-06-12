// ETC — External Brand Booking Receiver (MBF bridge)
// STRICT scope: validate + land lead + appointment into existing ETC pipeline.
// No routing rewrite, no commission changes, no dashboard changes.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  let payload: any;
  try { payload = await req.json(); } catch { return json(400, { error: "invalid_json" }); }

  // ─── 1. Validation ───
  const source_system = typeof payload?.source_system === "string" ? payload.source_system.trim() : "";
  if (!source_system) return json(400, { error: "source_system_required" });

  const brand = typeof payload?.brand === "string" ? payload.brand.trim() : "";
  const ctxPath = typeof payload?.context?.page_path === "string" ? payload.context.page_path.trim() : "";
  const entry_route = (typeof payload?.entry_route === "string" ? payload.entry_route.trim() : "") || ctxPath;

  const contact = payload?.contact ?? {};
  const email = typeof contact?.email === "string" ? contact.email.trim().toLowerCase() : "";
  const name = typeof contact?.name === "string" ? contact.name.trim() : "";
  const phone = typeof contact?.phone === "string" ? contact.phone.trim() : "";
  if (!email || !EMAIL_RE.test(email)) return json(400, { error: "contact_email_required" });

  const hasBooking = payload?.booking && typeof payload.booking === "object";
  const booking = payload?.booking ?? {};
  const starts_at = typeof booking?.starts_at === "string" ? booking.starts_at : "";
  let ends_at = typeof booking?.ends_at === "string" ? booking.ends_at : "";
  if (hasBooking) {
    if (!starts_at || isNaN(Date.parse(starts_at))) return json(400, { error: "booking_starts_at_required" });
    if (!ends_at || isNaN(Date.parse(ends_at))) {
      // Default 30 min slot if ends_at missing
      ends_at = new Date(Date.parse(starts_at) + 30 * 60_000).toISOString();
    }
  }

  // Short, indexable source tag mirrored into existing fields.
  const sourceTag = source_system.toLowerCase() === "mbf" ? "mbf" : source_system.toLowerCase().slice(0, 32);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // ─── 2. Resolve or upsert lead ───
  let leadId: string | null = null;
  {
    const { data: existing } = await supabase
      .from("leads")
      .select("id")
      .eq("email", email)
      .order("updated_at", { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle();
    if (existing?.id) leadId = existing.id;
  }

  if (!leadId) {
    const { data: upserted, error: upErr } = await supabase.rpc("upsert_funnel_lead" as never, {
      p_name: name || email.split("@")[0],
      p_email: email,
      p_phone: phone || null,
      p_funnel_source: sourceTag,
      p_quiz_answers: {},
      p_session_id: null,
      p_traffic_owner: null,
      p_referral_code: null,
    } as never);
    if (upErr || !(upserted as any)?.lead_id) {
      console.error("[receive-external-booking] upsert_funnel_lead failed", upErr);
      return json(500, { error: "lead_upsert_failed", detail: upErr?.message ?? null });
    }
    leadId = (upserted as any).lead_id as string;
  }

  // Resolve canonical brand_id (multi-brand revenue OS — Phase C)
  let brandId: string | null = null;
  try {
    const { data: brandResolved } = await supabase.rpc(
      "resolve_brand_from_source" as never,
      { _source_system: source_system } as never,
    );
    brandId = (brandResolved as string | null) ?? null;
  } catch (e) {
    console.warn("[receive-external-booking] resolve_brand_from_source failed", e);
  }

  // Mirror canonical attribution fields (additive, no overwrite of foreign data)
  const leadUpdate: Record<string, unknown> = {
    source: sourceTag,
    metadata: payload,
  };
  if (brandId) leadUpdate.origin_brand_id = brandId;
  if (entry_route) {
    leadUpdate.source_funnel = entry_route;
    leadUpdate.origin_funnel = entry_route;
  }
  if (typeof payload?.offer === "string") leadUpdate.origin_offer = payload.offer;
  if (typeof payload?.quiz?.result === "string") leadUpdate.origin_quiz = payload.quiz.result;
  if (name) leadUpdate.name = name;
  if (phone) leadUpdate.phone = phone;

  const { error: leadUpdErr } = await supabase
    .from("leads")
    .update(leadUpdate as never)
    .eq("id", leadId);
  if (leadUpdErr) {
    console.warn("[receive-external-booking] lead metadata update failed (non-blocking)", leadUpdErr);
  }

  // If no booking object — lead-only mode (still PASS per spec)
  if (!hasBooking) {
    return json(200, {
      ok: true,
      success: true,
      lead_id: leadId,
      appointment_id: null,
      owner_id: null,
      source: sourceTag,
      entry_route: entry_route || null,
    });
  }

  // ─── 3. Reuse active appointment if any (no duplicate) ───
  const ACTIVE = ["booked", "confirmed", "pending_confirmation", "pending_payment"];
  const { data: activeApt } = await supabase
    .from("appointments")
    .select("id, starts_at, ends_at, appointment_status")
    .eq("lead_id", leadId)
    .in("appointment_status", ACTIVE)
    .order("starts_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (activeApt?.id) {
    // Mirror MBF metadata onto the existing appointment without touching ownership.
    await supabase
      .from("appointments")
      .update({
        booking_source: sourceTag,
        origin_source: entry_route || null,
        metadata: payload,
      } as never)
      .eq("id", activeApt.id);
    return json(200, {
      ok: true,
      success: true,
      reused: true,
      lead_id: leadId,
      appointment_id: activeApt.id,
      owner_id: null,
      source: sourceTag,
      booking_source: sourceTag,
      entry_route: entry_route || null,
    });
  }

  // ─── 4. Insert appointment (existing triggers handle owner/routing) ───
  const aptInsert: Record<string, unknown> = {
    lead_id: leadId,
    call_type: "standard",
    appointment_status: "booked",
    starts_at,
    ends_at,
    booking_source: sourceTag,
    origin_source: entry_route || null,
    booking_timezone: typeof booking?.timezone === "string" ? booking.timezone : "Europe/Berlin",
    metadata: payload,
  };

  const { data: inserted, error: aptErr } = await supabase
    .from("appointments")
    .insert(aptInsert as never)
    .select("id, current_owner_id, current_owner_role")
    .single();

  if (aptErr || !inserted?.id) {
    console.error("[receive-external-booking] appointment insert failed", aptErr);
    return json(500, { error: "appointment_insert_failed", detail: aptErr?.message ?? null });
  }

  // Link booking back to lead (best-effort; existing sync trigger may already do this)
  await supabase
    .from("leads")
    .update({ has_booking: true, booking_id: inserted.id } as never)
    .eq("id", leadId);

  // ─── 5. Ensure owner is set on the appointment (minimal bridge) ───
  // If existing routing triggers didn't populate current_owner_id, derive from lead.
  let ownerId = inserted.current_owner_id as string | null;
  let ownerRole = inserted.current_owner_role as string | null;
  if (!ownerId) {
    const { data: leadOwners } = await supabase
      .from("leads")
      .select("setter_id, closer_id, assigned_operator_id, owner_id")
      .eq("id", leadId)
      .maybeSingle();
    const l: any = leadOwners ?? {};
    if (l.setter_id) { ownerId = l.setter_id; ownerRole = "setter"; }
    else if (l.closer_id) { ownerId = l.closer_id; ownerRole = "closer"; }
    else if (l.assigned_operator_id) { ownerId = l.assigned_operator_id; ownerRole = "operator"; }
    else if (l.owner_id) { ownerId = l.owner_id; ownerRole = ownerRole ?? "setter"; }
    if (ownerId) {
      await supabase
        .from("appointments")
        .update({ current_owner_id: ownerId, current_owner_role: ownerRole } as never)
        .eq("id", inserted.id);
    }
  }

  return json(200, {
    ok: true,
    success: true,
    reused: false,
    lead_id: leadId,
    appointment_id: inserted.id,
    owner_id: ownerId,
    source: sourceTag,
    booking_source: sourceTag,
    entry_route: entry_route || null,
    current_owner_id: ownerId,
    current_owner_role: ownerRole,
  });
});
