// Layer 31 — Birthday cron (Phase 1 stub).
// Daily scan of profiles.birthday matching today (month+day).
// Only enqueues for users with birthday_message_opt_in=true.
// Stub mode: logs intent, does not actually send.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Check global cron enabled
    const { data: settings } = await supabase
      .from("message_library_settings")
      .select("enabled, birthday_cron_enabled, test_mode")
      .eq("scope", "global")
      .maybeSingle();

    if (!settings?.birthday_cron_enabled) {
      return new Response(
        JSON.stringify({ ok: true, processed: 0, reason: "cron_disabled" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const today = new Date();
    const mm = String(today.getMonth() + 1).padStart(2, "0");
    const dd = String(today.getDate()).padStart(2, "0");

    // Find opted-in profiles whose birthday is today (any year)
    const { data: profiles } = await supabase
      .from("profiles")
      .select("user_id, first_name, birthday")
      .eq("birthday_message_opt_in", true)
      .not("birthday", "is", null);

    const todayMatches = (profiles ?? []).filter((p) => {
      if (!p.birthday) return false;
      const [, m, d] = String(p.birthday).split("-");
      return m === mm && d === dd;
    });

    let processed = 0;
    for (const p of todayMatches) {
      // Invoke render endpoint per user (stub-mode logs only)
      await supabase.functions.invoke("message-library-render", {
        body: {
          template_key: "birthday_message",
          user_id: p.user_id,
          variables: {
            first_name: p.first_name ?? "",
            next_action: "/members/dashboard",
          },
          language: "de",
        },
      });
      processed += 1;
    }

    return new Response(
      JSON.stringify({ ok: true, processed, scanned: profiles?.length ?? 0 }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
