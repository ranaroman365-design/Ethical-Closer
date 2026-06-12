import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const {
      user_id,
      display_name,
      headline,
      location,
      experience_years,
      languages,
      industries,
      avg_deal_size,
      closing_rate,
      user_type_role,
    } = body;

    if (!user_id || !display_name) {
      return new Response(JSON.stringify({ error: "user_id and display_name are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Verify user exists in auth.users
    const { data: authUser, error: authErr } = await supabaseAdmin.auth.admin.getUserById(user_id);
    if (authErr || !authUser?.user) {
      return new Response(JSON.stringify({ error: "Invalid user_id" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Upsert closer_profiles (idempotent)
    const { error: cpErr } = await supabaseAdmin.from("closer_profiles").upsert(
      {
        user_id,
        display_name,
        headline: headline || null,
        location: location || null,
        experience_years: experience_years ?? 0,
        languages: languages ?? [],
        industries: industries ?? [],
        avg_deal_size: avg_deal_size || null,
        closing_rate: closing_rate || null,
      },
      { onConflict: "user_id" },
    );

    if (cpErr) {
      console.error("closer_profiles upsert error:", cpErr);
      return new Response(JSON.stringify({ error: cpErr.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Upsert the_close_user_types if role provided
    if (user_type_role) {
      const { error: utErr } = await supabaseAdmin.from("the_close_user_types").upsert(
        {
          user_id,
          role: user_type_role,
          subscription_tier: "bronze",
          status: "active",
        },
        { onConflict: "user_id" },
      );
      if (utErr) {
        console.error("the_close_user_types upsert error:", utErr);
      }
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("create-closer-profile error:", err);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
