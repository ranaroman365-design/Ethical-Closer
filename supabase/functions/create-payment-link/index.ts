import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, stripe-signature",
};

const DEAL_CONFIG: Record<string, { label: string; amount: number; installments: number | null; installmentAmount: number | null }> = {
  starter_one_time:    { label: 'Starter – Einmalzahlung',     amount: 160000, installments: null, installmentAmount: null },
  starter_split_3:     { label: 'Starter – 3 Raten',           amount: 168000, installments: 3,    installmentAmount: 56000 },
  closer_one_time:     { label: 'Closer – Einmalzahlung',      amount: 440000, installments: null, installmentAmount: null },
  closer_split_3:      { label: 'Closer – 3 Raten',            amount: 462000, installments: 3,    installmentAmount: 154000 },
  highticket_one_time: { label: 'High-Ticket – Einmalzahlung', amount: 730000, installments: null, installmentAmount: null },
  highticket_split_3:  { label: 'High-Ticket – 3 Raten',       amount: 766500, installments: 3,    installmentAmount: 255500 },
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
  if (!stripeKey) {
    return new Response(JSON.stringify({ error: "Stripe not configured" }), {
      status: 503,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const { leadId, closerId, dealType, secondaryMethod, firstName, email, offerTitle, appointmentId } = await req.json();
    const normalizedLeadId = typeof leadId === "string" ? leadId.trim() : "";

    const config = DEAL_CONFIG[dealType];
    if (!config) {
      return new Response(JSON.stringify({ error: "Invalid dealType" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!closerId || !email) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Lead-ID Pflicht: Deals brauchen eine Lead-Zuordnung
    if (!normalizedLeadId) {
      return new Response(JSON.stringify({ error: "lead_id_required", message: "Kein Payment Link ohne Lead-Zuordnung erlaubt." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Level Gate: nur L4+ oder admin darf Payment Links erstellen
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Check admin role OR product_key indicating closer+ access
    const { data: closerProfile } = await supabase
      .from("profiles")
      .select("product_key")
      .eq("id", closerId)
      .maybeSingle();

    const { data: adminRole } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", closerId)
      .in("role", ["admin", "administrator"])
      .maybeSingle();

    const isAdmin = !!adminRole;
    const productKey = closerProfile?.product_key ?? '';
    // closer/highticket product_key implies L4+, admin always passes
    const hasAccess = isAdmin || ['closer', 'highticket', 'etc'].includes(productKey);

    if (!hasAccess) {
      return new Response(JSON.stringify({ error: "level_gate", message: "Payment Links nur ab L4 (Closer) erlaubt." }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const appUrl = Deno.env.get("APP_URL") || "https://ethicalcloser.de";

    let resolvedLeadId: string | null = null;
    if (normalizedLeadId && UUID_PATTERN.test(normalizedLeadId)) {
      const { data: existingLead, error: leadLookupError } = await supabase
        .from("leads")
        .select("id")
        .eq("id", normalizedLeadId)
        .maybeSingle();

      if (leadLookupError) {
        console.error("Lead lookup error:", leadLookupError);
        return new Response(JSON.stringify({ error: "Failed to validate lead" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      resolvedLeadId = existingLead?.id ?? null;
    }

    const isInstallment = config.installments !== null;
    const paymentType = isInstallment ? `split_${config.installments}` : 'one_time';

    // Klarna nur bei one_time verfügbar
    const useKlarna = secondaryMethod === 'klarna' && !isInstallment;

    const stripeParams: Record<string, string> = {
      mode: isInstallment ? "subscription" : "payment",
      "line_items[0][price_data][currency]": "eur",
      "line_items[0][price_data][unit_amount]": String(isInstallment ? config.installmentAmount : config.amount),
      "line_items[0][price_data][product_data][name]": offerTitle || config.label,
      "line_items[0][quantity]": "1",
      customer_email: email,
      "metadata[closer_id]": closerId,
      "metadata[deal_type]": dealType,
      success_url: `${appUrl}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/checkout/cancelled?session_id={CHECKOUT_SESSION_ID}`,
      expires_at: String(Math.floor(Date.now() / 1000) + 2700),
    };

    if (resolvedLeadId) {
      stripeParams["metadata[lead_id]"] = resolvedLeadId;
    }

    if (isInstallment) {
      stripeParams["line_items[0][price_data][recurring][interval]"] = "month";
      stripeParams["line_items[0][price_data][recurring][interval_count]"] = "1";
    }

    if (useKlarna) {
      stripeParams["payment_method_types[0]"] = "card";
      stripeParams["payment_method_types[1]"] = "klarna";
      stripeParams["locale"] = "de";
    }

    const stripeResponse = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${stripeKey}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams(stripeParams),
    });

    if (!stripeResponse.ok) {
      const err = await stripeResponse.text();
      console.error("Stripe error:", err);
      return new Response(JSON.stringify({ error: "Stripe session creation failed" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const session = await stripeResponse.json();

    // Insert payment link + mark sent_at
    const { data: link, error: insertError } = await supabase
      .from("payment_links")
      .insert({
        lead_id: resolvedLeadId,
        closer_id: closerId,
        deal_type: dealType,
        payment_type: paymentType,
        secondary_method: secondaryMethod || 'stripe',
        amount: config.amount,
        installment_amount: config.installmentAmount,
        installment_count: config.installments,
        currency: "EUR",
        offer_title: offerTitle || config.label,
        first_name: firstName,
        email,
        session_id: session.id,
        payment_url: session.url,
        sent_at: new Date().toISOString(),
        ...(appointmentId ? { appointment_id: appointmentId } : {}),
      })
      .select("token")
      .single();

    if (insertError) {
      console.error("Insert error:", insertError);
      return new Response(JSON.stringify({ error: "Failed to save payment link" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({
        token: link.token,
        paymentUrl: `${appUrl}/checkout/${link.token}`,
        stripeUrl: session.url,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("create-payment-link error:", err);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
