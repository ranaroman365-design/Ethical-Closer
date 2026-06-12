// Upsell Engine — evaluates user state and creates targeted upsell offers.
// Rules:
//   closed_won >= 1            -> next-tier offer
//   total calls (closer) >= 5  -> closer-OS upgrade
//   level >= 7                 -> Inner Circle invite
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const OFFER_RULES = [
  { key: "next_tier_after_first_close", min_closed: 1, ttl_days: 14 },
  { key: "closer_os_upgrade",          min_calls:  5, ttl_days: 21 },
  { key: "inner_circle_invite",        min_level:  7, ttl_days: 30 },
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Pull active users with stats
    const { data: profiles, error } = await supabase
      .from("profiles")
      .select("id, current_level")
      .limit(2000);
    if (error) throw error;

    let created = 0;

    for (const p of profiles ?? []) {
      const userId = p.id;
      const level = (p as any).current_level ?? 0;

      // Counts
      const { count: closedWon } = await supabase
        .from("calls").select("id", { count: "exact", head: true })
        .eq("user_id", userId).eq("result", "closed_won");
      const { count: totalCalls } = await supabase
        .from("calls").select("id", { count: "exact", head: true })
        .eq("user_id", userId);

      for (const rule of OFFER_RULES) {
        const eligible =
          (rule.min_closed !== undefined && (closedWon ?? 0) >= rule.min_closed) ||
          (rule.min_calls  !== undefined && (totalCalls ?? 0) >= rule.min_calls)  ||
          (rule.min_level  !== undefined && level >= rule.min_level);
        if (!eligible) continue;

        // Check if already offered
        const { data: existing } = await supabase
          .from("upsell_offers")
          .select("id")
          .eq("user_id", userId)
          .eq("offer_key", rule.key)
          .limit(1)
          .maybeSingle();
        if (existing) continue;

        const expires = new Date(Date.now() + rule.ttl_days * 24 * 3600_000).toISOString();
        const { error: insErr } = await supabase.from("upsell_offers").insert({
          user_id: userId,
          offer_key: rule.key,
          expires_at: expires,
          claimed: false,
        });
        if (!insErr) created++;
      }
    }

    return new Response(JSON.stringify({ ok: true, offers_created: created }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown";
    return new Response(JSON.stringify({ ok: false, error: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
