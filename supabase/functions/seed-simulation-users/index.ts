import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(supabaseUrl, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

  const BATCH = "sim_l6_greenlight_v2";
  const SIM_UNIT_ID = "b2000000-0000-0000-0000-000000000001";
  const errors: string[] = [];

  // Get our sim users
  const danielId = "04e91d76-de42-414d-a41f-3fe28d9df085";
  const annaId = "81beb75b-371e-458e-9286-af519049dfd6";
  const tomId = "835f9e2e-cff1-48a8-9c8c-eda714cd1001";
  const olegId = "a5c3e973-a66a-4582-80fd-6b4e43e8ad64";

  // Setup director_id
  for (const mid of [annaId, tomId, olegId]) {
    const { error } = await admin.from("profiles").update({ director_id: danielId }).eq("id", mid);
    if (error) errors.push(`director_id ${mid}: ${error.message}`);
  }

  // Ensure operator unit
  const { error: uErr } = await admin.from("operator_units").upsert({
    id: SIM_UNIT_ID,
    operator_id: danielId,
    unit_name: "Daniel Sim Unit",
    funnel_path: "/qualify",
    status: "active",
    status_label: "scale",
    max_team_size: 8,
  }, { onConflict: "id" });
  if (uErr) errors.push(`unit: ${uErr.message}`);

  // Ensure team members
  for (const [mid, role] of [[danielId, "operator"], [annaId, "setter"], [tomId, "setter"], [olegId, "closer"]] as const) {
    const { data: ex } = await admin.from("operator_team_members").select("id").eq("unit_id", SIM_UNIT_ID).eq("member_id", mid).maybeSingle();
    if (!ex) {
      const { error } = await admin.from("operator_team_members").insert({ unit_id: SIM_UNIT_ID, member_id: mid, team_role: role, active: true });
      if (error) errors.push(`team ${mid}: ${error.message}`);
    }
  }

  // Clean old sim data
  await admin.from("calls").delete().eq("is_simulation", true).eq("simulation_batch_id" as any, BATCH);
  await admin.from("appointments").delete().in("lead_id", (await admin.from("leads").select("id").eq("simulation_batch_id", BATCH)).data?.map((l: any) => l.id) || []);
  await admin.from("leads").delete().eq("simulation_batch_id", BATCH);

  // Seed leads
  const setters = [annaId, tomId];
  const closers = [danielId, olegId];
  const leadNames = [
    "Max Müller", "Lisa Schmidt", "Jan Weber", "Sophie Fischer", "Lukas Wagner",
    "Emma Becker", "Finn Hoffmann", "Mia Schulz", "Leon Koch", "Hannah Richter",
    "Paul Schäfer", "Laura Bauer", "Tim Wolf", "Clara Braun", "David Zimmermann",
    "Julia Klein", "Moritz Lang", "Lena Schwarz", "Felix Schmitt", "Marie Krüger",
    "Noah Hartmann", "Emilia Werner", "Elias Schmid", "Charlotte Meier", "Jonas Friedrich",
    "Amelie Huber", "Ben Maier", "Sophia Berger", "Julian Kaiser", "Anna Keller",
  ];

  type LeadSpec = { stage: string; outcome: string | null; hasBooking: boolean; showed: boolean; closed: boolean };
  const specs: LeadSpec[] = [
    // 4 new leads
    ...Array(4).fill({ stage: "new", outcome: null, hasBooking: false, showed: false, closed: false }),
    // 5 qualified
    ...Array(5).fill({ stage: "qualified", outcome: null, hasBooking: false, showed: false, closed: false }),
    // 3 booked not showed
    ...Array(3).fill({ stage: "booked", outcome: null, hasBooking: true, showed: false, closed: false }),
    // 3 showed no close
    ...Array(3).fill({ stage: "showed", outcome: "no_close", hasBooking: true, showed: true, closed: false }),
    // 6 closed won
    ...Array(6).fill({ stage: "closed_won", outcome: "won", hasBooking: true, showed: true, closed: true }),
    // 3 follow up
    ...Array(3).fill({ stage: "showed", outcome: "follow_up", hasBooking: true, showed: true, closed: false }),
    // 6 booked confirmed
    ...Array(6).fill({ stage: "booked", outcome: null, hasBooking: true, showed: false, closed: false }),
  ];

  const insertedLeads: string[] = [];

  for (let i = 0; i < 30; i++) {
    const s = specs[i];
    const daysAgo = Math.floor(Math.random() * 25) + 1;
    const createdAt = new Date(Date.now() - daysAgo * 86400000).toISOString();
    const setterId = setters[i % setters.length];
    const closerId = closers[i % closers.length];
    const dealValue = s.closed ? (i % 2 === 0 ? 4400 : 7200) : null;
    const leadId = crypto.randomUUID();

    const { error: lErr } = await admin.from("leads").insert({
      id: leadId,
      name: leadNames[i],
      email: `sim.${leadNames[i].toLowerCase().replace(/\s/g, ".").replace(/ü/g,"ue").replace(/ä/g,"ae").replace(/ö/g,"oe")}@example.com`,
      phone: `+491${String(7000000 + i).padStart(7, "0")}`,
      source: ["funnel_apply", "quiz", "referral", "website"][i % 4],
      funnel_source: ["apply_direct", "qualify_filter", "high_income_angle", "webinar_entry"][i % 4],
      stage: s.stage,
      owner_id: closerId,
      setter_id: setterId,
      closer_id: s.showed || s.closed ? closerId : null,
      has_booking: s.hasBooking,
      deal_value: dealValue,
      is_simulation: true,
      simulation_batch_id: BATCH,
      unit_id: SIM_UNIT_ID,
      assigned_operator_id: danielId,
      lead_score: Math.floor(Math.random() * 60) + 40,
      lead_quality: s.closed ? "hot" : s.showed ? "warm" : "cold",
      quiz_score: s.stage !== "new" ? Math.floor(Math.random() * 30) + 70 : null,
      no_show_flag: s.hasBooking && !s.showed && i < 14,
      total_calls_booked: s.hasBooking ? 1 : 0,
      total_calls_attended: s.showed ? 1 : 0,
      outcome: s.outcome,
      payment_status: s.closed ? "paid" : "none",
      created_at: createdAt,
    });
    if (lErr) {
      errors.push(`lead ${i} ${leadNames[i]}: ${lErr.message}`);
      continue;
    }
    insertedLeads.push(leadId);

    if (s.hasBooking) {
      const apptStart = new Date(Date.now() - (daysAgo - 1) * 86400000 + 36000000).toISOString();
      const apptEnd = new Date(Date.now() - (daysAgo - 1) * 86400000 + 39600000).toISOString();
      const { error: aErr } = await admin.from("appointments").insert({
        lead_id: leadId,
        call_type: "standard",
        appointment_status: s.showed || s.closed ? "completed" : "confirmed",
        starts_at: apptStart,
        ends_at: apptEnd,
        setter_id: setterId,
        closer_id: s.showed || s.closed ? closerId : null,
        assigned_operator_id: danielId,
        attendance_flag: s.showed || s.closed ? true : (i < 14 ? false : null),
        outcome: s.closed ? "won" : s.showed ? (s.outcome || "follow_up") : null,
      });
      if (aErr) errors.push(`appt ${i}: ${aErr.message}`);
    }

    if (s.closed && closerId) {
      const { error: cErr } = await admin.from("calls").insert({
        lead_id: leadId,
        user_id: closerId,
        result: "won",
        revenue: dealValue ? dealValue * 100 : null,
        deal_size: dealValue ? dealValue * 100 : null,
        is_simulation: true,
      });
      if (cErr) errors.push(`call ${i}: ${cErr.message}`);
    }
  }

  // Seed funnel_metrics_daily
  for (let d = 0; d < 30; d++) {
    const date = new Date(Date.now() - d * 86400000).toISOString().slice(0, 10);
    const leadsCreated = Math.floor(Math.random() * 3) + 1;
    const bookings = Math.max(0, leadsCreated - Math.floor(Math.random() * 2));
    const shows = Math.max(0, bookings - Math.floor(Math.random() * 2));
    const closes = d % 5 === 0 ? Math.min(shows, 1) : 0;

    const { error: fErr } = await admin.from("funnel_metrics_daily").upsert({
      metric_date: date,
      origin: "simulation",
      funnel_key: "sim_greenlight",
      leads_created: leadsCreated,
      bookings_created: bookings,
      shows_count: shows,
      closes_count: closes,
      revenue_cents: closes * 440000,
    }, { onConflict: "metric_date,origin,funnel_key" });
    if (fErr) errors.push(`fmd ${date}: ${fErr.message}`);
  }

  return new Response(JSON.stringify({ 
    ok: errors.length === 0, 
    leads_inserted: insertedLeads.length,
    errors: errors.slice(0, 20),
  }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
