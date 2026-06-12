import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  try {
    // 1. Get all users with level >= 2
    const { data: levelUsers } = await supabase
      .from("user_level_status")
      .select("user_id, current_level")
      .gte("current_level", 2);

    let checked = 0;
    let demoted = 0;

    for (const u of levelUsers ?? []) {
      // Run eligibility check
      const { data } = await supabase.rpc("check_mentor_eligibility", {
        p_user_id: u.user_id,
      });

      checked++;

      // If was eligible but now isn't, reassign mentees
      if (data && !data.eligible) {
        const { data: activeAssigns } = await supabase
          .from("mentor_assignments")
          .select("id")
          .eq("mentor_id", u.user_id)
          .eq("active", true);

        if (activeAssigns && activeAssigns.length > 0) {
          await supabase.rpc("reassign_mentees_from_mentor", {
            p_mentor_id: u.user_id,
          });
          demoted++;
        }
      }
    }

    // 2. Auto-assign mentors for users without one
    const { data: allAssignments } = await supabase
      .from("mentor_assignments")
      .select("mentee_id")
      .eq("active", true);

    const assignedMenteeIds = new Set(
      (allAssignments ?? []).map((a: any) => a.mentee_id)
    );

    const { data: allUsers } = await supabase
      .from("user_level_status")
      .select("user_id, current_level")
      .gte("current_level", 0)
      .lte("current_level", 6);

    let autoAssigned = 0;
    for (const u of allUsers ?? []) {
      if (!assignedMenteeIds.has(u.user_id)) {
        const { data } = await supabase.rpc("assign_mentor_auto", {
          p_mentee_id: u.user_id,
        });
        if (data?.status === "assigned") autoAssigned++;
      }
    }

    return new Response(
      JSON.stringify({
        checked,
        demoted,
        auto_assigned: autoAssigned,
        timestamp: new Date().toISOString(),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
