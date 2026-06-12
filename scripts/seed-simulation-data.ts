#!/usr/bin/env -S npx tsx
/**
 * Seed Simulation Data Script
 * ===========================
 * Creates a reproducible set of simulation leads across the full funnel:
 *   30 Leads → 20 Quiz → 15 Booked → 12 Showed → 6 Closed Won → 3 Started
 *
 * Usage:
 *   VITE_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npx tsx scripts/seed-simulation-data.ts
 *
 * Or inside Lovable sandbox:
 *   bun run scripts/seed-simulation-data.ts
 *
 * All data is marked is_simulation=true with a unique batch ID for easy cleanup.
 */

import { createClient } from "@supabase/supabase-js";

// ── Config ──
const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
const SERVICE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
  "";

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("❌ Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const sb = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const BATCH_ID = `seed_sim_${Date.now()}`;
const NOW = new Date();
const DAY = 86_400_000;

// Simulation operator (Daniel L6)
const OPERATOR_ID = "04e91d76-de42-414d-a41f-3fe28d9df085";
// Simulation setter (Anna)
const SETTER_ID = "81beb75b-371e-458e-9286-af519049dfd6";
// Simulation closer (Oleg)
const CLOSER_ID = "a5c3e973-a66a-4582-80fd-6b4e43e8ad64";

function ago(days: number): string {
  return new Date(NOW.getTime() - days * DAY).toISOString();
}

function uuid(): string {
  return crypto.randomUUID();
}

// ── Funnel Distribution ──
// 30 leads total. Stage assignment:
//  - 10 leads stay at "new" (no quiz)
//  -  5 quiz but no booking
//  -  3 booked but no show
//  -  6 showed but no close
//  -  3 closed_won but not started
//  -  3 closed_won + started
const PRODUCTS = [1600, 4400, 7200];

interface LeadRow {
  id: string;
  name: string;
  email: string;
  phone: string;
  source: string;
  stage: string;
  is_simulation: boolean;
  simulation_batch_id: string;
  created_at: string;
  setter_id: string;
  assigned_operator_id: string;
  lead_level: string;
  quiz_score: number | null;
  quiz_result: string | null;
  has_booking: boolean;
  booking_status: string;
  lead_status: string;
  outcome: string | null;
  closed_at: string | null;
  deal_value: number;
  conversion_state: string;
}

interface ApptRow {
  id: string;
  lead_id: string;
  call_type: string;
  appointment_status: string;
  starts_at: string;
  ends_at: string;
  setter_id: string;
  closer_id: string | null;
  assigned_operator_id: string;
  attendance_flag: boolean;
  call_status: string;
  outcome: string | null;
  booking_source: string;
}

interface CallRow {
  id: string;
  user_id: string;
  lead_id: string;
  call_type: string;
  result: string;
  revenue: number;
  is_simulation: boolean;
  simulation_batch_id: string;
  booked_at: string;
  showed_at: string | null;
  closed_at: string | null;
  status: string;
}

const leads: LeadRow[] = [];
const appointments: ApptRow[] = [];
const calls: CallRow[] = [];

let idx = 0;
function makeLead(stage: string, extras: Partial<LeadRow> = {}): LeadRow {
  idx++;
  const lead: LeadRow = {
    id: uuid(),
    name: `Sim Lead ${idx}`,
    email: `sim-lead-${idx}-${BATCH_ID}@test.local`,
    phone: `+4917600000${String(idx).padStart(2, "0")}`,
    source: "simulation",
    stage,
    is_simulation: true,
    simulation_batch_id: BATCH_ID,
    created_at: ago(20 - Math.floor(idx / 2)),
    setter_id: SETTER_ID,
    assigned_operator_id: OPERATOR_ID,
    lead_level: "L0",
    quiz_score: null,
    quiz_result: null,
    has_booking: false,
    booking_status: "none",
    lead_status: "interessent",
    outcome: null,
    closed_at: null,
    deal_value: 0,
    conversion_state: "new_lead",
    funnel_source: "external_inbound",
    ...extras,
  };
  leads.push(lead);
  return lead;
}

// ── 10 new leads (no quiz) ──
for (let i = 0; i < 10; i++) makeLead("new");

// ── 5 quiz-only (no booking) ──
for (let i = 0; i < 5; i++)
  makeLead("quiz_completed", {
    quiz_score: 60 + Math.floor(Math.random() * 30),
    quiz_result: "closer",
    lead_status: "qualifiziert",
    conversion_state: "engaged",
  });

// ── 3 booked (no show) ──
for (let i = 0; i < 3; i++) {
  const lead = makeLead("booked", {
    quiz_score: 75,
    quiz_result: "closer",
    has_booking: true,
    booking_status: "booked",
    lead_status: "gebucht",
    conversion_state: "booked",
  });
  const apptId = uuid();
  const startsAt = ago(5 - i);
  appointments.push({
    id: apptId,
    lead_id: lead.id,
    call_type: "standard",
    appointment_status: "no_show",
    starts_at: startsAt,
    ends_at: new Date(new Date(startsAt).getTime() + 30 * 60_000).toISOString(),
    setter_id: SETTER_ID,
    closer_id: CLOSER_ID,
    assigned_operator_id: OPERATOR_ID,
    attendance_flag: false,
    call_status: "no_show",
    outcome: null,
    booking_source: "simulation",
  });
}

// ── 6 showed (no close) ──
for (let i = 0; i < 6; i++) {
  const lead = makeLead("showed", {
    quiz_score: 80,
    quiz_result: "closer",
    has_booking: true,
    booking_status: "completed",
    lead_status: "gezeigt",
    conversion_state: "showed",
  });
  const apptId = uuid();
  const startsAt = ago(8 - i);
  appointments.push({
    id: apptId,
    lead_id: lead.id,
    call_type: "standard",
    appointment_status: "completed",
    starts_at: startsAt,
    ends_at: new Date(new Date(startsAt).getTime() + 45 * 60_000).toISOString(),
    setter_id: SETTER_ID,
    closer_id: CLOSER_ID,
    assigned_operator_id: OPERATOR_ID,
    attendance_flag: true,
    call_status: "completed",
    outcome: "attended",
    booking_source: "simulation",
  });
  calls.push({
    id: uuid(),
    user_id: CLOSER_ID,
    lead_id: lead.id,
    call_type: "closer",
    result: "no_decision",
    revenue: 0,
    is_simulation: true,
    simulation_batch_id: BATCH_ID,
    booked_at: startsAt,
    showed_at: startsAt,
    closed_at: null,
    status: "analyzed",
  });
}

// ── 3 closed_won (not started) ──
for (let i = 0; i < 3; i++) {
  const product = PRODUCTS[i % PRODUCTS.length];
  const startsAt = ago(12 - i);
  const lead = makeLead("closed_won", {
    quiz_score: 90,
    quiz_result: "closer",
    has_booking: true,
    booking_status: "completed",
    lead_status: "gewonnen",
    deal_value: product,
    outcome: "won",
    closed_at: ago(10 - i),
    conversion_state: "closed_won",
  });
  const apptId = uuid();
  appointments.push({
    id: apptId,
    lead_id: lead.id,
    call_type: "priority",
    appointment_status: "completed",
    starts_at: startsAt,
    ends_at: new Date(new Date(startsAt).getTime() + 60 * 60_000).toISOString(),
    setter_id: SETTER_ID,
    closer_id: CLOSER_ID,
    assigned_operator_id: OPERATOR_ID,
    attendance_flag: true,
    call_status: "completed",
    outcome: "attended",
    booking_source: "simulation",
  });
  calls.push({
    id: uuid(),
    user_id: CLOSER_ID,
    lead_id: lead.id,
    call_type: "closer",
    result: "won",
    revenue: product,
    is_simulation: true,
    simulation_batch_id: BATCH_ID,
    booked_at: startsAt,
    showed_at: startsAt,
    closed_at: ago(10 - i),
    status: "analyzed",
  });
}

// ── 3 closed_won + started ──
for (let i = 0; i < 3; i++) {
  const product = PRODUCTS[i % PRODUCTS.length];
  const startsAt = ago(15 - i);
  const lead = makeLead("started", {
    quiz_score: 95,
    quiz_result: "closer",
    has_booking: true,
    booking_status: "completed",
    lead_status: "gestartet",
    lead_level: "L1",
    deal_value: product,
    outcome: "won",
    closed_at: ago(13 - i),
    conversion_state: "closed_won",
    stage: "started",
  });
  const apptId = uuid();
  appointments.push({
    id: apptId,
    lead_id: lead.id,
    call_type: "priority",
    appointment_status: "completed",
    starts_at: startsAt,
    ends_at: new Date(new Date(startsAt).getTime() + 60 * 60_000).toISOString(),
    setter_id: SETTER_ID,
    closer_id: CLOSER_ID,
    assigned_operator_id: OPERATOR_ID,
    attendance_flag: true,
    call_status: "completed",
    outcome: "attended",
    booking_source: "simulation",
  });
  calls.push({
    id: uuid(),
    user_id: CLOSER_ID,
    lead_id: lead.id,
    call_type: "closer",
    result: "won",
    revenue: product,
    is_simulation: true,
    simulation_batch_id: BATCH_ID,
    booked_at: startsAt,
    showed_at: startsAt,
    closed_at: ago(13 - i),
    status: "analyzed",
  });
}

// ── Execute ──
async function run() {
  console.log(`\n🌱 Seeding batch: ${BATCH_ID}`);
  console.log(`   30 leads · 15 appointments · 12 calls\n`);

  // 1. Insert leads
  const { error: leadsErr } = await sb.from("leads").insert(leads);
  if (leadsErr) {
    console.error("❌ Leads insert failed:", leadsErr.message);
    process.exit(1);
  }
  console.log("✅ 30 leads inserted");

  // 2. Insert appointments
  const { error: apptsErr } = await sb.from("appointments").insert(appointments);
  if (apptsErr) {
    console.error("❌ Appointments insert failed:", apptsErr.message);
    process.exit(1);
  }
  console.log(`✅ ${appointments.length} appointments inserted`);

  // 3. Insert calls
  const { error: callsErr } = await sb.from("calls").insert(calls);
  if (callsErr) {
    console.error("❌ Calls insert failed:", callsErr.message);
    process.exit(1);
  }
  console.log(`✅ ${calls.length} calls inserted`);

  // ── KPI Verification ──
  console.log("\n📊 KPI Verification:");

  const { data: totalLeads } = await sb
    .from("leads")
    .select("id", { count: "exact", head: true })
    .eq("simulation_batch_id", BATCH_ID);

  const { count: leadCount } = await sb
    .from("leads")
    .select("*", { count: "exact", head: true })
    .eq("simulation_batch_id", BATCH_ID);

  const { count: quizCount } = await sb
    .from("leads")
    .select("*", { count: "exact", head: true })
    .eq("simulation_batch_id", BATCH_ID)
    .not("quiz_score", "is", null);

  const { count: bookedCount } = await sb
    .from("leads")
    .select("*", { count: "exact", head: true })
    .eq("simulation_batch_id", BATCH_ID)
    .eq("has_booking", true);

  const { count: showedCount } = await sb
    .from("appointments")
    .select("*", { count: "exact", head: true })
    .in(
      "lead_id",
      leads.filter((l) => l.has_booking).map((l) => l.id)
    )
    .eq("attendance_flag", true);

  const { count: closedWonCount } = await sb
    .from("leads")
    .select("*", { count: "exact", head: true })
    .eq("simulation_batch_id", BATCH_ID)
    .eq("outcome", "won");

  const { count: startedCount } = await sb
    .from("leads")
    .select("*", { count: "exact", head: true })
    .eq("simulation_batch_id", BATCH_ID)
    .eq("stage", "started");

  const { data: revenueData } = await sb
    .from("calls")
    .select("revenue")
    .eq("simulation_batch_id", BATCH_ID)
    .eq("result", "won");

  const totalRevenue = (revenueData ?? []).reduce(
    (s, r) => s + Number(r.revenue ?? 0),
    0
  );

  const expected = {
    leads: 30,
    quiz: 20,
    booked: 15,
    showed: 12,
    closed_won: 6,
    started: 3,
  };

  const actual = {
    leads: leadCount ?? 0,
    quiz: quizCount ?? 0,
    booked: bookedCount ?? 0,
    showed: showedCount ?? 0,
    closed_won: closedWonCount ?? 0,
    started: startedCount ?? 0,
  };

  const table = [
    ["Metric", "Expected", "Actual", "Status"],
    ["Leads", expected.leads, actual.leads, actual.leads === expected.leads ? "✅" : "❌"],
    ["Quiz completed", expected.quiz, actual.quiz, actual.quiz === expected.quiz ? "✅" : "❌"],
    ["Booked", expected.booked, actual.booked, actual.booked === expected.booked ? "✅" : "❌"],
    ["Showed", expected.showed, actual.showed, actual.showed === expected.showed ? "✅" : "❌"],
    ["Closed Won", expected.closed_won, actual.closed_won, actual.closed_won === expected.closed_won ? "✅" : "❌"],
    ["Started", expected.started, actual.started, actual.started === expected.started ? "✅" : "❌"],
  ];

  console.log("");
  for (const row of table) {
    console.log(`  ${String(row[0]).padEnd(16)} ${String(row[1]).padEnd(10)} ${String(row[2]).padEnd(10)} ${row[3]}`);
  }

  console.log(`\n  💰 Total simulation revenue: €${totalRevenue.toLocaleString("de-DE")}`);

  const allPass = Object.keys(expected).every(
    (k) => actual[k as keyof typeof actual] === expected[k as keyof typeof expected]
  );

  if (allPass) {
    console.log("\n🎉 All KPIs verified! Funnel integrity intact.\n");
  } else {
    console.log("\n⚠️  Some KPIs don't match — check above.\n");
    process.exit(1);
  }

  console.log(`🧹 To clean up: DELETE FROM leads WHERE simulation_batch_id = '${BATCH_ID}';`);
  console.log(`   Calls/appointments cascade or filter by batch.\n`);
}

run().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
