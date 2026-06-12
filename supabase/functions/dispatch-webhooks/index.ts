import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface WebhookEndpoint {
  id: string;
  url: string;
  secret: string | null;
  events: string[];
  active: boolean;
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

    // Fetch pending/retrying outbound events that are due
    const { data: pendingEvents } = await supabase
      .from("outbound_events")
      .select("*")
      .in("status", ["pending", "retrying"])
      .or("next_retry_at.is.null,next_retry_at.lte." + new Date().toISOString())
      .order("created_at", { ascending: true })
      .limit(50);

    if (!pendingEvents || pendingEvents.length === 0) {
      return new Response(
        JSON.stringify({ success: true, processed: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch active webhook endpoints
    const { data: allEndpoints } = await supabase
      .from("webhook_endpoints")
      .select("*")
      .eq("active", true);

    const endpoints = (allEndpoints as WebhookEndpoint[]) ?? [];
    let totalDispatched = 0;

    for (const event of pendingEvents) {
      const eventName = event.event_name;
      const retryCount = event.retry_count ?? 0;

      // Find matching endpoints
      const matchingEndpoints = endpoints.filter((ep) =>
        ep.events?.includes(eventName)
      );

      if (matchingEndpoints.length === 0) {
        // No endpoints for this event — mark as processed
        await supabase
          .from("outbound_events")
          .update({ status: "processed" } as any)
          .eq("id", event.id);
        continue;
      }

      let allSuccess = true;

      for (const endpoint of matchingEndpoints) {
        const webhookPayload = {
          event_id: event.id,
          event_name: eventName,
          email: event.email || null,
          timestamp: new Date().toISOString(),
          ...(event.payload || {}),
        };

        const headers: Record<string, string> = {
          "Content-Type": "application/json",
        };
        if (endpoint.secret) {
          headers["X-Webhook-Secret"] = endpoint.secret;
        }

        let success = false;
        let errorMsg = "";

        try {
          const resp = await fetch(endpoint.url, {
            method: "POST",
            headers,
            body: JSON.stringify(webhookPayload),
          });
          if (resp.ok) {
            success = true;
          } else {
            errorMsg = `HTTP ${resp.status}: ${resp.statusText}`;
          }
        } catch (e) {
          errorMsg = `Network error: ${(e as Error).message}`;
        }

        if (!success) {
          allSuccess = false;

          // Exponential backoff based on retry_count
          if (retryCount >= 3) {
            // Move to DLQ — permanently failed
            await supabase.from("webhook_dlq").insert({
              original_event_id: event.id,
              endpoint: endpoint.url,
              payload: webhookPayload,
              error: errorMsg,
              failed_at: new Date().toISOString(),
              dismissed: false,
            } as any);

            await supabase
              .from("outbound_events")
              .update({ status: "dead" } as any)
              .eq("id", event.id);
          } else {
            // Schedule retry with exponential backoff
            const delayMinutes = retryCount === 0 ? 1 : retryCount === 1 ? 5 : 30;
            const nextRetry = new Date(
              Date.now() + delayMinutes * 60 * 1000
            ).toISOString();

            await supabase
              .from("outbound_events")
              .update({
                status: "retrying",
                retry_count: retryCount + 1,
                next_retry_at: nextRetry,
              } as any)
              .eq("id", event.id);
          }
        }
      }

      if (allSuccess) {
        await supabase
          .from("outbound_events")
          .update({ status: "processed" } as any)
          .eq("id", event.id);
        totalDispatched++;
      }
    }

    // Log summary
    await supabase.from("event_logs").insert({
      event_name: "webhook_dispatch_batch",
      payload: {
        total_events: pendingEvents.length,
        dispatched: totalDispatched,
      },
      status: "processed",
    });

    return new Response(
      JSON.stringify({
        success: true,
        processed: pendingEvents.length,
        dispatched: totalDispatched,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
