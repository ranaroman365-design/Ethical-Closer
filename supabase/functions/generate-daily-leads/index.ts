import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const FIRST_NAMES = [
  "Maximilian", "Sophie", "Alexander", "Emma", "Lukas", "Hannah", "Felix", "Laura",
  "Julian", "Lea", "Tobias", "Marie", "Sebastian", "Clara", "David", "Julia",
  "Moritz", "Katharina", "Florian", "Amelie", "Niklas", "Lena", "Marcel", "Sarah",
  "Elias", "Charlotte", "Tim", "Mia", "Leon", "Johanna",
];

const LAST_NAMES = [
  "Müller", "Schmidt", "Schneider", "Fischer", "Weber", "Meyer", "Wagner", "Becker",
  "Hoffmann", "Schulz", "Koch", "Bauer", "Richter", "Klein", "Wolf", "Schröder",
  "Neumann", "Schwarz", "Braun", "Zimmermann", "Krüger", "Hartmann", "Lange", "Werner",
  "Krause", "Lehmann", "Köhler", "Maier", "Huber", "Kaiser",
];

const SOURCES = ["website", "referral", "instagram", "linkedin", "cold_outreach", "webinar"];

function randomPick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomEmail(first: string, last: string): string {
  const domains = ["gmail.com", "web.de", "gmx.de", "outlook.de", "icloud.com"];
  return `${first.toLowerCase()}.${last.toLowerCase().replace(/[üöäß]/g, c => ({ü:'ue',ö:'oe',ä:'ae',ß:'ss'}[c] || c))}@${randomPick(domains)}`;
}

function randomPhone(): string {
  return `+49 1${Math.floor(50 + Math.random() * 30)} ${Math.floor(1000000 + Math.random() * 9000000)}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Get all setters (canonical + legacy aliases) and trainees
    const { data: associates, error: profileError } = await supabase
      .from("profiles")
      .select("id, full_name, business_stage")
      .in("business_stage", ["setter", "associate_setter", "senior_associate", "senior_setter", "opener"]);

    if (profileError) throw profileError;

    if (!associates || associates.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: "No associates found, no leads generated." }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const now = new Date();
    const timer24h = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();
    const createdLeads: { name: string; assigned_to: string }[] = [];

    // Cap daily lead generation to capacity (3 leads per active associate, max 15)
    const maxLeads = Math.min(associates.length * 3, 15);
    const leadsToGenerate = Math.min(maxLeads, 5);

    if (leadsToGenerate === 0) {
      return new Response(
        JSON.stringify({ success: true, message: "No capacity — skipping lead generation." }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    for (let i = 0; i < leadsToGenerate; i++) {
      const assignee = associates[i % associates.length];
      const firstName = randomPick(FIRST_NAMES);
      const lastName = randomPick(LAST_NAMES);
      const fullName = `${firstName} ${lastName}`;
      const source = randomPick(SOURCES);

      const { error: insertError } = await supabase.from("leads").insert({
        name: fullName,
        email: randomEmail(firstName, lastName),
        phone: randomPhone(),
        source,
        stage: "assigned_setter",
        owner_id: assignee.id,
        setter_id: assignee.id,
        owner_role: "setter",
        timer_expires_at: timer24h,
        contact_count: 0,
        qualification_checklist: {},
      });

      if (insertError) {
        console.error(`Failed to create lead for ${assignee.full_name}:`, insertError);
        continue;
      }

      createdLeads.push({ name: fullName, assigned_to: assignee.full_name || assignee.id });
    }

    // Audit log
    await supabase.from("audit_logs").insert({
      action: "daily_leads_generated",
      source_type: "cron",
      note: `Generated ${createdLeads.length} daily leads: ${createdLeads.map(l => `${l.name} → ${l.assigned_to}`).join(", ")}`,
    });

    return new Response(
      JSON.stringify({ success: true, generated: createdLeads.length, leads: createdLeads }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[generate-daily-leads] Error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
