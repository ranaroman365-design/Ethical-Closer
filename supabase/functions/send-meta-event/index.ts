// Meta Conversions API (CAPI) — minimal server-side mirror.
// Mirrors browser Pixel events 1:1 via shared event_id for deduplication.
// Never throws to caller; never blocks funnel.
//
// Security: META_CAPI_ACCESS_TOKEN never leaves the server. Only Pixel ID
// (public) is exposed to the browser. Email/phone/name are SHA-256 hashed
// before transmission per Meta's PII policy.
import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.95.0/cors";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";

const META_PIXEL_ID = Deno.env.get("META_PIXEL_ID");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const adminClient =
  SUPABASE_URL && SERVICE_ROLE ? createClient(SUPABASE_URL, SERVICE_ROLE) : null;

/** Fire-and-forget QA log (PII-safe). Never blocks Meta call. */
async function logMetaQa(args: {
  event_name: string;
  event_id: string | null;
  status: number;
  fbtrace_id?: string | null;
  events_received?: number | null;
  error_message?: string | null;
  cd?: Record<string, unknown> | null;
}) {
  if (!adminClient) return;
  try {
    const cd = args.cd ?? {};
    await adminClient.rpc("log_meta_event_server", {
      _event_name: args.event_name,
      _event_id: args.event_id,
      _meta_status: args.status,
      _meta_fbtrace_id: args.fbtrace_id ?? null,
      _meta_events_received: args.events_received ?? null,
      _error_message: args.error_message ?? null,
      _lead_id: typeof cd.lead_id === "string" ? cd.lead_id : null,
      _session_id: typeof cd.session_id === "string" ? cd.session_id : null,
      _appointment_id: typeof cd.appointment_id === "string" ? cd.appointment_id : null,
      _origin_key: typeof cd.origin_key === "string" ? cd.origin_key : null,
      _operator_email: typeof cd.operator_email === "string" ? cd.operator_email : null,
    });
  } catch (_e) {
    /* never throw */
  }
}

// ──────────────────────────────────────────────────────────────────
// CAPI Failure Alerting
// Fires when Meta returns non-2xx, when our request throws, or when
// credentials are missing. Deduped per (event_name, status_bucket)
// for ALERT_DEDUP_WINDOW_MIN to avoid alert storms.
// Channels: escalation_alerts row (always) + Slack webhook (if secret set).
// ──────────────────────────────────────────────────────────────────
const ALERT_DEDUP_WINDOW_MIN = 10;
const SLACK_WEBHOOK_URL = Deno.env.get("META_ALERT_SLACK_WEBHOOK") ?? "";

function statusBucket(status: number | null): string {
  if (status == null) return "exception";
  if (status === 0) return "network";
  if (status === 400) return "400_bad_request";
  if (status === 401 || status === 403) return "auth";
  if (status === 429) return "rate_limit";
  if (status >= 500) return "5xx";
  if (status >= 400) return "4xx";
  return `ok_${status}`;
}

async function dispatchCapiAlert(args: {
  event_name: string;
  event_id: string | null;
  status: number | null;
  fbtrace_id?: string | null;
  error_message: string;
  meta_payload?: unknown;
}) {
  if (!adminClient) return;
  const bucket = statusBucket(args.status);
  const alertKey = `meta_capi:${args.event_name}:${bucket}`;
  const cutoff = new Date(Date.now() - ALERT_DEDUP_WINDOW_MIN * 60_000).toISOString();

  try {
    // Dedup: skip if a recent alert already exists in window.
    const { data: existing } = await adminClient
      .from("meta_capi_alert_dedup")
      .select("alert_key, last_alerted_at, count_since")
      .eq("alert_key", alertKey)
      .maybeSingle();

    if (existing && existing.last_alerted_at > cutoff) {
      // Bump counter only.
      await adminClient
        .from("meta_capi_alert_dedup")
        .update({ count_since: (existing.count_since ?? 1) + 1 })
        .eq("alert_key", alertKey);
      return;
    }

    const severity =
      bucket === "auth" || bucket === "5xx" || bucket === "exception" ? "critical" : "warning";
    const title = `Meta CAPI failure: ${args.event_name} [${bucket}]`;
    const description = [
      `event_name: ${args.event_name}`,
      `event_id: ${args.event_id ?? "—"}`,
      `status: ${args.status ?? "exception"}`,
      args.fbtrace_id ? `fbtrace_id: ${args.fbtrace_id}` : null,
      `error: ${args.error_message}`,
    ].filter(Boolean).join("\n");

    // 1) Persist as escalation alert (visible to L6+ admins).
    await adminClient.from("escalation_alerts").insert({
      alert_type: "meta_capi_failure",
      severity,
      target_role: "admin",
      title,
      description,
      source_type: "edge_function",
      source_entity_type: "send-meta-event",
      metadata: {
        event_name: args.event_name,
        event_id: args.event_id,
        status: args.status,
        bucket,
        fbtrace_id: args.fbtrace_id ?? null,
        error_message: args.error_message,
        meta_payload: args.meta_payload ?? null,
      },
      status: "open",
    });

    // 2) Reset / refresh dedup row.
    await adminClient
      .from("meta_capi_alert_dedup")
      .upsert({ alert_key: alertKey, last_alerted_at: new Date().toISOString(), count_since: 1 });

    // 3) Optional Slack webhook (fire-and-forget).
    if (SLACK_WEBHOOK_URL) {
      const text = `🚨 *${title}*\n\`\`\`${description}\`\`\``;
      fetch(SLACK_WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      }).catch(() => { /* never throw */ });
    }
  } catch (e) {
    console.error("[send-meta-event] dispatchCapiAlert failed", e);
  }
}

// Primary secret name per spec; fall back to legacy name for backward compat.
const META_CAPI_ACCESS_TOKEN =
  Deno.env.get("META_CAPI_ACCESS_TOKEN") ?? Deno.env.get("META_ACCESS_TOKEN");
const META_API_VERSION = Deno.env.get("META_API_VERSION") ?? "v20.0";
const TEST_EVENT_CODE = Deno.env.get("META_TEST_EVENT_CODE"); // optional, for Events Manager Test Events

type AllowedEvent =
  | "PageView"
  | "ViewContent"
  | "Lead"
  | "CompleteRegistration"
  | "Schedule"
  | "Purchase"
  | "InitiateCheckout"
  // Custom events (sent via 'custom' but Meta accepts arbitrary names)
  | "ApplyCtaClick"
  | "QuizStarted"
  | "QuizCompleted"
  | "BookingStarted"
  | "BookingCreated"
  | "LowLeadResultView"
  | "ApplicantAccessProvisioned"
  | "ApplicantAccessProvisioningFailed"
  | "QualifiedShow"
  | "OfferMade"
  | "HighQualityLead";

const ALLOWED: AllowedEvent[] = [
  "PageView",
  "ViewContent",
  "Lead",
  "CompleteRegistration",
  "Schedule",
  "Purchase",
  "InitiateCheckout",
  "ApplyCtaClick",
  "QuizStarted",
  "QuizCompleted",
  "BookingStarted",
  "BookingCreated",
  "LowLeadResultView",
  "ApplicantAccessProvisioned",
  "ApplicantAccessProvisioningFailed",
  "QualifiedShow",
  "OfferMade",
  "HighQualityLead",
];

async function sha256(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function clientIpFrom(req: Request): string | undefined {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("cf-connecting-ip") ?? req.headers.get("x-real-ip") ?? undefined;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    if (!META_PIXEL_ID || !META_CAPI_ACCESS_TOKEN) {
      console.warn("[send-meta-event] missing META_PIXEL_ID or META_CAPI_ACCESS_TOKEN");
      await dispatchCapiAlert({
        event_name: "config",
        event_id: null,
        status: null,
        error_message: "META_PIXEL_ID or META_CAPI_ACCESS_TOKEN not configured",
      });
      return new Response(
        JSON.stringify({ success: false, error: "META credentials not configured" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }, // never block funnel
      );
    }

    const body = await req.json().catch(() => ({}));
    const {
      event_name,
      event_id,
      // user data (raw — hashed below; never logged or stored)
      email,
      phone,
      first_name,
      last_name,
      // pre-hashed if caller already did it (preferred)
      em,
      ph,
      fn,
      ln,
      // browser identifiers
      fbp,
      fbc,
      // monetary
      value,
      currency,
      // context
      event_source_url,
      client_user_agent,
      // optional override; otherwise derived from request headers
      client_ip_address,
      // freeform custom_data passthrough (lead_id, session_id, quiz_score, lead_quality, funnel_step, appointment_id, etc.)
      custom_data,
    } = body ?? {};

    if (!event_name || !ALLOWED.includes(event_name as AllowedEvent)) {
      console.warn("[send-meta-event] invalid event_name", event_name);
      await logMetaQa({
        event_name: String(event_name ?? "unknown"),
        event_id: typeof event_id === "string" ? event_id : null,
        status: 400,
        error_message: "invalid event_name",
        cd: (custom_data && typeof custom_data === "object") ? custom_data as Record<string, unknown> : null,
      });
      return new Response(JSON.stringify({ success: false, error: "invalid event_name" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!event_id || typeof event_id !== "string") {
      console.warn("[send-meta-event] missing event_id");
      await logMetaQa({
        event_name: String(event_name),
        event_id: null,
        status: 400,
        error_message: "event_id required",
        cd: (custom_data && typeof custom_data === "object") ? custom_data as Record<string, unknown> : null,
      });
      return new Response(JSON.stringify({ success: false, error: "event_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const user_data: Record<string, unknown> = {};

    // Hash PII server-side. Never echo raw values back.
    if (typeof em === "string") user_data.em = em;
    else if (typeof email === "string" && email.includes("@")) {
      user_data.em = await sha256(email.trim().toLowerCase());
    }

    if (typeof ph === "string") user_data.ph = ph;
    else if (typeof phone === "string" && phone.length >= 5) {
      // Meta wants digits only, no leading + or spaces
      user_data.ph = await sha256(phone.replace(/[^\d]/g, ""));
    }

    if (typeof fn === "string") user_data.fn = fn;
    else if (typeof first_name === "string" && first_name.length > 0) {
      user_data.fn = await sha256(first_name.trim().toLowerCase());
    }

    if (typeof ln === "string") user_data.ln = ln;
    else if (typeof last_name === "string" && last_name.length > 0) {
      user_data.ln = await sha256(last_name.trim().toLowerCase());
    }

    if (fbp) user_data.fbp = fbp;
    if (fbc) user_data.fbc = fbc;
    if (client_user_agent) user_data.client_user_agent = client_user_agent;

    const ip = client_ip_address ?? clientIpFrom(req);
    if (ip) user_data.client_ip_address = ip;

    // Build custom_data — only include defined fields per spec.
    const cd: Record<string, unknown> = {};
    if (custom_data && typeof custom_data === "object") {
      for (const [k, v] of Object.entries(custom_data)) {
        if (v !== undefined && v !== null && v !== "") cd[k] = v;
      }
    }
    cd.currency = (typeof currency === "string" && currency) || cd.currency || "EUR";
    if (typeof value === "number") cd.value = value;
    else if (cd.value === undefined) cd.value = 0;

    const eventData: Record<string, unknown> = {
      event_name,
      event_time: Math.floor(Date.now() / 1000),
      event_id,
      action_source: "website",
      user_data,
      custom_data: cd,
    };
    if (event_source_url) eventData.event_source_url = event_source_url;

    const payload: Record<string, unknown> = { data: [eventData] };
    if (TEST_EVENT_CODE) payload.test_event_code = TEST_EVENT_CODE;

    // Graph API v20.0 per spec
    const url =
      `https://graph.facebook.com/${META_API_VERSION}/${META_PIXEL_ID}/events?access_token=${META_CAPI_ACCESS_TOKEN}`;

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const json = await res.json().catch(() => ({}));

    // Debug logging — event metadata only, no PII.
    console.log("[send-meta-event]", {
      event_name,
      event_id,
      status: res.status,
      meta_received: (json as { events_received?: number })?.events_received,
      fbtrace_id: (json as { fbtrace_id?: string })?.fbtrace_id,
    });

    const fbtraceId = (json as { fbtrace_id?: string })?.fbtrace_id ?? null;
    const eventsReceived = (json as { events_received?: number })?.events_received ?? null;
    const cdForLog = (custom_data && typeof custom_data === "object")
      ? custom_data as Record<string, unknown>
      : null;

    if (!res.ok) {
      console.error("[send-meta-event] meta error", res.status, json);
      const errMsg = typeof (json as { error?: { message?: string } })?.error?.message === "string"
        ? (json as { error: { message: string } }).error.message
        : `meta_status_${res.status}`;
      await logMetaQa({
        event_name: String(event_name),
        event_id,
        status: res.status,
        fbtrace_id: fbtraceId,
        events_received: eventsReceived,
        error_message: errMsg,
        cd: cdForLog,
      });
      await dispatchCapiAlert({
        event_name: String(event_name),
        event_id,
        status: res.status,
        fbtrace_id: fbtraceId,
        error_message: errMsg,
        meta_payload: json,
      });
      return new Response(JSON.stringify({ success: false, status: res.status, meta: json }), {
        status: 200, // never block funnel
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    await logMetaQa({
      event_name: String(event_name),
      event_id,
      status: res.status,
      fbtrace_id: fbtraceId,
      events_received: eventsReceived,
      cd: cdForLog,
    });

    return new Response(JSON.stringify({ success: true, meta: json }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[send-meta-event] exception", err);
    await dispatchCapiAlert({
      event_name: "exception",
      event_id: null,
      status: null,
      error_message: String(err),
    });
    return new Response(JSON.stringify({ success: false, error: String(err) }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
