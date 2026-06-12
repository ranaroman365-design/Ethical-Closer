// At-Risk Payment Recovery
// Two phases:
//   PHASE A (instant)  → SMS to lead with retry link  (event: payment.recover_sms)
//   PHASE B (+10 min)  → Notify assigned closer for manual follow-up (event: payment.recover_closer_notify)
//
// Triggered every cron tick. Reads leads with payment_status='at_risk' and
// uses leads.payment_recovery_state JSONB to stay idempotent.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const RETRY_LINK = Deno.env.get("PUBLIC_PAYMENT_RETRY_LINK") ?? "https://ethicalcloser.de/checkout";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const now = Date.now();
    const cutoff48h = new Date(now - 48 * 3600_000).toISOString();

    const { data: leads, error } = await supabase
      .from("leads")
      .select("id, email, phone, name, payment_status, payment_recovery_state, closer_id, updated_at")
      .eq("payment_status", "at_risk")
      .gte("updated_at", cutoff48h)
      .limit(200);
    if (error) throw error;

    const out: Array<{ lead: string; action: string }> = [];

    for (const l of leads ?? []) {
      const state = (l.payment_recovery_state ?? {}) as Record<string, string>;

      // PHASE A — instant SMS
      if (!state.sms_instant) {
        // Find this lead's most recent open payment link to build a personalised
        // recovery URL that lands on the dedicated /checkout/recover page.
        const { data: linkRows } = await supabase
          .from("payment_links")
          .select("token")
          .eq("lead_id", l.id)
          .in("status", ["pending", "opened", "failed"])
          .order("created_at", { ascending: false })
          .limit(1);
        const recoveryUrl = linkRows?.[0]?.token
          ? `${RETRY_LINK.replace(/\/$/, "")}/recover/${linkRows[0].token}`.replace("/checkout/recover", "/checkout/recover")
          : RETRY_LINK;

        await supabase.from("outbound_events").insert({
          event_name: "payment.recover_sms",
          entity_type: "lead",
          entity_id: l.id,
          email: l.email,
          destination: "ghl",
          payload: {
            email: l.email, phone: l.phone, name: l.name,
            channel: "sms",
            body:
              "Deine Zahlung ist nicht durchgegangen – meist liegt’s an der Bank, nicht an dir.\n\n" +
              "Schließe sicher mit Apple Pay ab (10 Min reserviert):\n" + recoveryUrl + "\n\n" +
              "Wenn’s ein Problem gibt, melden wir uns sofort.",
            retry_link: recoveryUrl,
          },
          status: "pending",
        });
        await supabase.from("leads")
          .update({ payment_recovery_state: { ...state, sms_instant: new Date().toISOString() } })
          .eq("id", l.id);
        out.push({ lead: l.id, action: "sms_instant" });
        continue;
      }

      // PHASE B — +10 min closer notification
      const sentAt = new Date(state.sms_instant).getTime();
      if (now - sentAt >= 10 * 60_000 && !state.closer_notified) {
        await supabase.from("outbound_events").insert({
          event_name: "payment.recover_closer_notify",
          entity_type: "lead",
          entity_id: l.id,
          email: l.email,
          destination: "internal",
          payload: {
            closer_user_id: l.closer_id,
            lead_email: l.email,
            lead_phone: l.phone,
            lead_name: l.name,
            script:
              "Hey, ich sehe deine Zahlung ist nicht durchgegangen — soll ich dir helfen, das jetzt abzuschließen?",
          },
          status: "pending",
        });
        await supabase.from("leads")
          .update({ payment_recovery_state: { ...state, closer_notified: new Date().toISOString() } })
          .eq("id", l.id);
        out.push({ lead: l.id, action: "closer_notified" });
      }
    }

    return new Response(JSON.stringify({ ok: true, processed: out.length, results: out }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown";
    return new Response(JSON.stringify({ ok: false, error: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
