import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const paypalClientId = Deno.env.get("PAYPAL_CLIENT_ID");
  const paypalSecret = Deno.env.get("PAYPAL_CLIENT_SECRET");
  if (!paypalClientId || !paypalSecret) {
    return new Response(JSON.stringify({ error: "PayPal not configured" }), {
      status: 503,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const { orderId, token } = await req.json();

    const mode = Deno.env.get("PAYPAL_MODE") === "live" ? "live" : "sandbox";
    const baseUrl = mode === "live"
      ? "https://api-m.paypal.com"
      : "https://api-m.sandbox.paypal.com";

    const authRes = await fetch(`${baseUrl}/v1/oauth2/token`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${btoa(`${paypalClientId}:${paypalSecret}`)}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "grant_type=client_credentials",
    });
    const { access_token } = await authRes.json();

    const captureRes = await fetch(
      `${baseUrl}/v2/checkout/orders/${orderId}/capture`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${access_token}`,
          "Content-Type": "application/json",
        },
      }
    );
    const capture = await captureRes.json();

    if (capture.status !== "COMPLETED") {
      return new Response(JSON.stringify({ success: false }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Update payment_links + lead
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: link } = await supabase
      .from("payment_links")
      .update({ status: "paid", session_id: orderId })
      .eq("token", token)
      .select("lead_id")
      .single();

    if (link?.lead_id) {
      await supabase
        .from("leads")
        .update({ status: "closed_won", closed_at: new Date().toISOString() })
        .eq("id", link.lead_id);
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("paypal-capture-order error:", err);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
