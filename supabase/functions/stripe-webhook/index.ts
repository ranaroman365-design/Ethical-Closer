import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, stripe-signature",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
  if (!stripeKey) {
    return new Response("Stripe not configured", { status: 503 });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    const body = await req.text();
    const event = JSON.parse(body);
    const eventId = event.id as string;

    // Idempotency
    const { data: existing } = await supabase
      .from("processed_events")
      .select("event_key")
      .eq("event_key", `stripe_${eventId}`)
      .maybeSingle();

    if (existing) {
      return new Response(JSON.stringify({ status: "already_processed" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let result: unknown = null;

    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        if (session.payment_status === "paid") {
          const { data } = await supabase.rpc("record_payment_revenue", {
            p_session_id: session.id,
            p_stripe_payment_intent: session.payment_intent || null,
          });
          result = data;
          console.log("[stripe-webhook] Revenue recorded:", JSON.stringify(data));
        }
        break;
      }

      case "checkout.session.async_payment_succeeded": {
        const session = event.data.object;
        const { data } = await supabase.rpc("record_payment_revenue", {
          p_session_id: session.id,
          p_stripe_payment_intent: session.payment_intent || null,
        });
        result = data;
        console.log("[stripe-webhook] Async payment revenue recorded:", JSON.stringify(data));
        break;
      }

      case "checkout.session.expired": {
        const session = event.data.object;
        const { data: expiredLink } = await supabase
          .from("payment_links")
          .update({ status: "expired" })
          .eq("session_id", session.id)
          .eq("status", "pending")
          .select("id")
          .maybeSingle();

        if (expiredLink) {
          await supabase.from("payment_events").insert({
            payment_link_id: expiredLink.id,
            event_type: "expired",
            stripe_event_id: eventId,
            status: "processed",
            payload: { session_id: session.id },
          });
        }
        result = { expired: expiredLink?.id };
        console.log("[stripe-webhook] Session expired:", session.id);
        break;
      }

      case "charge.refunded": {
        const charge = event.data.object;
        const paymentIntent = charge.payment_intent;

        // Try to find via payment_intent_id first (faster)
        const { data: directLink } = await supabase
          .from("payment_links")
          .select("session_id")
          .eq("payment_intent_id", paymentIntent)
          .maybeSingle();

        let sessionId = directLink?.session_id;

        // Fallback: lookup via Stripe API
        if (!sessionId) {
          const piRes = await fetch(
            `https://api.stripe.com/v1/checkout/sessions?payment_intent=${paymentIntent}&limit=1`,
            { headers: { Authorization: `Bearer ${stripeKey}` } }
          );
          const piData = await piRes.json();
          sessionId = piData.data?.[0]?.id;
        }

        if (sessionId) {
          const { data } = await supabase.rpc("reverse_payment_revenue", {
            p_session_id: sessionId,
            p_reason: "refund",
          });
          result = data;
          console.log("[stripe-webhook] Refund processed:", JSON.stringify(data));
        } else {
          console.warn("[stripe-webhook] No session found for refund PI:", paymentIntent);
        }
        break;
      }

      case "charge.dispute.created": {
        const dispute = event.data.object;
        const paymentIntent = dispute.payment_intent;

        const { data: directLink } = await supabase
          .from("payment_links")
          .select("session_id")
          .eq("payment_intent_id", paymentIntent)
          .maybeSingle();

        let sessionId = directLink?.session_id;

        if (!sessionId) {
          const piRes = await fetch(
            `https://api.stripe.com/v1/checkout/sessions?payment_intent=${paymentIntent}&limit=1`,
            { headers: { Authorization: `Bearer ${stripeKey}` } }
          );
          const piData = await piRes.json();
          sessionId = piData.data?.[0]?.id;
        }

        if (sessionId) {
          const { data } = await supabase.rpc("reverse_payment_revenue", {
            p_session_id: sessionId,
            p_reason: "dispute",
          });
          result = data;
          console.log("[stripe-webhook] Dispute processed:", JSON.stringify(data));
        } else {
          console.warn("[stripe-webhook] No session found for dispute PI:", paymentIntent);
        }
        break;
      }

      case "charge.failed": {
        const charge = event.data.object;
        const paymentIntent = charge.payment_intent;

        const { data: directLink } = await supabase
          .from("payment_links")
          .select("id, session_id")
          .eq("payment_intent_id", paymentIntent)
          .maybeSingle();

        let failedLinkId = directLink?.id;

        if (!failedLinkId) {
          const piRes = await fetch(
            `https://api.stripe.com/v1/checkout/sessions?payment_intent=${paymentIntent}&limit=1`,
            { headers: { Authorization: `Bearer ${stripeKey}` } }
          );
          const piData = await piRes.json();
          const sid = piData.data?.[0]?.id;
          if (sid) {
            const { data: failedLink } = await supabase
              .from("payment_links")
              .select("id")
              .eq("session_id", sid)
              .maybeSingle();
            failedLinkId = failedLink?.id;
          }
        }

        if (failedLinkId) {
          await supabase
            .from("payment_links")
            .update({ status: "failed" })
            .eq("id", failedLinkId);

          await supabase.from("payment_events").insert({
            payment_link_id: failedLinkId,
            event_type: "failed",
            stripe_event_id: eventId,
            status: "processed",
            payload: { payment_intent: paymentIntent, failure_message: charge.failure_message },
          });
        }
        result = { failed: true };
        console.log("[stripe-webhook] Charge failed:", paymentIntent);
        break;
      }

      default:
        console.log(`[stripe-webhook] Unhandled event type: ${event.type}`);
    }

    // Mark processed
    await supabase.from("processed_events").insert({
      event_key: `stripe_${eventId}`,
      event_type: event.type,
      source_table: 'stripe',
      processed_at: new Date().toISOString(),
    });

    return new Response(
      JSON.stringify({ received: true, type: event.type, result }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[stripe-webhook] Error:", err);
    return new Response(JSON.stringify({ error: "Webhook processing failed" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
