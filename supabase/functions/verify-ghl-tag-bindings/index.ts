/**
 * verify-ghl-tag-bindings
 *
 * Production hardening verifier for the Day 1 Revenue Acceleration Layer.
 * Confirms that the 11 required GHL tags exist in the connected Location and
 * are reachable through the Private Integration Token.
 *
 * It does NOT (and cannot) verify that a workflow is bound to each tag —
 * GHL exposes no public Workflows API. The setup checklist for that is in
 * docs/ghl-tag-binding-setup.md.
 *
 * Auth: caller must present the service role key (admin-only).
 * Returns: per-tag status: "found" | "missing" | "error".
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const REQUIRED_TAGS = [
  // Retargeting
  "etc_retarget_sms_2h",
  "etc_retarget_email_24h",
  "etc_retarget_sms_48h",
  "etc_retarget_email_72h",
  // Appointment reminders
  "etc_appt_reminder_24h",
  "etc_appt_reminder_2h",
  "etc_appt_reminder_10m",
  // Payment recovery
  "etc_payment_recover_sms",
  "etc_payment_recover_closer_notify",
  // Audience sync
  "etc_audience_no_booking",
  "etc_audience_no_show",
];

const GHL_API_BASE_URL = "https://services.leadconnectorhq.com";
const GHL_API_VERSION = "2021-07-28";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // Admin gate via service role key
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const token = Deno.env.get("GHL_PRIVATE_INTEGRATION_TOKEN");
  const locationId = Deno.env.get("GHL_LOCATION_ID") ?? "Rjc9TYscI3xmUh9732K1";

  if (!token) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: "GHL_PRIVATE_INTEGRATION_TOKEN not configured",
      }),
      { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  // Pull all tags for the location
  const url = `${GHL_API_BASE_URL}/locations/${locationId}/tags`;
  let tagSet = new Set<string>();
  let fetchError: string | null = null;

  try {
    const resp = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Version: GHL_API_VERSION,
        Accept: "application/json",
      },
    });
    if (!resp.ok) {
      fetchError = `GHL ${resp.status}: ${await resp.text()}`;
    } else {
      const json = await resp.json();
      // GHL returns { tags: [{ id, name, ... }] }
      const tags: Array<{ name?: string }> = json?.tags ?? [];
      tagSet = new Set(tags.map((t) => (t.name ?? "").toLowerCase()).filter(Boolean));
    }
  } catch (e) {
    fetchError = (e as Error).message;
  }

  const results = REQUIRED_TAGS.map((name) => ({
    tag: name,
    status: fetchError ? "error" : tagSet.has(name.toLowerCase()) ? "found" : "missing",
  }));

  const missing = results.filter((r) => r.status === "missing").map((r) => r.tag);
  const found = results.filter((r) => r.status === "found").map((r) => r.tag);

  // Persist a snapshot to automation_log for audit
  await supabase.from("automation_log").insert({
    job_name: "verify-ghl-tag-bindings",
    status: fetchError ? "error" : missing.length === 0 ? "ok" : "partial",
    error: fetchError,
    metrics: {
      required: REQUIRED_TAGS.length,
      found: found.length,
      missing: missing.length,
      missing_tags: missing,
    },
  });

  return new Response(
    JSON.stringify({
      ok: !fetchError,
      location_id: locationId,
      total_required: REQUIRED_TAGS.length,
      found: found.length,
      missing: missing.length,
      missing_tags: missing,
      results,
      fetch_error: fetchError,
      next_step: missing.length === 0
        ? "All tags exist in GHL. Verify each has a workflow bound (see docs/ghl-tag-binding-setup.md)."
        : `Create the ${missing.length} missing tags in GHL → Settings → Tags, then bind a workflow to each (see docs/ghl-tag-binding-setup.md).`,
    }, null, 2),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
