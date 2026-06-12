import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * Distribute partner commissions when a deal is closed.
 * Called after distribute_commissions for the direct seller.
 *
 * ─── REFERRAL LADDER CANONICALITY (Phase 4) ───
 * This edge function is the CANONICAL automated referral payout path.
 * It writes to public.commissions with role IN ('referrer', 'referrer_l2') and
 * source_type = 'indirect'. Triggered by the Stripe webhook on successful payment.
 *
 * The separate `public.referrals` table + ReferralsAdmin UI is a MANUAL admin reward
 * flow (one-off bonuses granted by admins via calc_referral_payout). It does NOT
 * write to commissions and does NOT overlap with this automated ladder.
 *
 * Input: { call_id, seller_user_id, revenue }
 * Logic:
 * 1. Check if seller has referred_by in profiles
 * 2. If yes, get partner_commission config from product_config
 * 3. Create indirect commission for level 1 referrer
 * 4. Optionally create level 2 commission if referrer also has referred_by
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  let body: { call_id: string; seller_user_id: string; revenue: number };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { call_id, seller_user_id, revenue } = body;
  if (!call_id || !seller_user_id || !revenue) {
    return new Response(JSON.stringify({ error: "Missing required fields" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    // Get seller profile with referred_by and product_key
    const { data: seller } = await supabase
      .from("profiles")
      .select("referred_by, product_key")
      .eq("id", seller_user_id)
      .single();

    if (!seller?.referred_by) {
      return new Response(JSON.stringify({ distributed: false, reason: "no_referrer" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get partner commission config
    const { data: configRow } = await supabase
      .from("product_config")
      .select("config")
      .eq("product_key", seller.product_key || "etc")
      .single();

    const config = configRow?.config as Record<string, any> | null;
    const partnerComm = config?.partner_commission || { level_1: 0.05, level_2: 0.02 };

    const commissions: Array<{ call_id: string; user_id: string; role: string; amount: number; source_type: string; level_depth: number }> = [];

    // Level 1: direct referrer
    const l1Amount = revenue * (partnerComm.level_1 || 0.05);
    if (l1Amount > 0) {
      commissions.push({
        call_id,
        user_id: seller.referred_by,
        role: "referrer",
        amount: Math.round(l1Amount * 100) / 100,
        source_type: "indirect",
        level_depth: 1,
      });
    }

    // Level 2: referrer's referrer
    if (partnerComm.level_2 && partnerComm.level_2 > 0) {
      const { data: l1Profile } = await supabase
        .from("profiles")
        .select("referred_by")
        .eq("id", seller.referred_by)
        .single();

      if (l1Profile?.referred_by) {
        const l2Amount = revenue * partnerComm.level_2;
        if (l2Amount > 0) {
          commissions.push({
            call_id,
            user_id: l1Profile.referred_by,
            role: "referrer_l2",
            amount: Math.round(l2Amount * 100) / 100,
            source_type: "indirect",
            level_depth: 2,
          });
        }
      }
    }

    // Insert commissions
    if (commissions.length > 0) {
      const { error } = await supabase.from("commissions").insert(commissions);
      if (error) {
        console.error("Insert commissions error:", error);
        throw error;
      }

      // Audit log
      await supabase.from("audit_logs").insert({
        action: "partner_commission_distributed",
        actor_id: seller_user_id,
        source_type: "system",
        note: `Partner commissions distributed for call ${call_id}: ${commissions.length} entries`,
        after_state: { call_id, commissions },
      });
    }

    return new Response(
      JSON.stringify({ distributed: true, entries: commissions.length }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Partner commission error:", err);
    return new Response(JSON.stringify({ error: "Processing error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
