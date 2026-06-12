/**
 * Process Outbound Events → GHL REST API (ETC V6.1)
 *
 * Direct REST API transport using Private Integration Token (PIT).
 * No webhook hop. GHL = dumb mirror per V6.1.
 *
 * Per event:
 *   1. POST /contacts/upsert        → create/update contact + custom fields
 *   2. POST /contacts/{id}/tags     → apply V6.1 tag (triggers tag-based workflow)
 *   3. POST /opportunities (upsert) → move pipeline stage (only when mapping.stage != null)
 *
 * Auth: Authorization: Bearer ${GHL_PRIVATE_INTEGRATION_TOKEN}
 *       Version: 2021-07-28
 *
 * Token never logged. Token never returned to client.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { PRODUCT_PREFIX } from "../_shared/product-config.ts";
import {
  GHL_EVENT_MAP,
  GHL_PIPELINE_ID,
  GHL_API_BASE_URL,
  GHL_API_VERSION,
  GHL_CUSTOM_FIELD_IDS,
  INTERNAL_STAGE_TO_EVENT,
  resolveStageLabel,
  resolveStageId,
  resolveTagId,
} from "../_shared/ghl-config.ts";
// V6.1 contract lock — throws at cold start if spec drifts (14 stages / 17 tags / 12 fields).
import "../_shared/ghl-v61-spec.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const MAX_RETRIES = 3;
const BATCH_SIZE = 50;

const V61_CANONICAL_EVENTS = new Set(Object.keys(GHL_EVENT_MAP));

// ─── Phase 2.1: Canonicalized Events Skip-List (Layer 53) ────────────────────
// These events now route through dispatch-communication (canonical dedup path).
// Any writes to outbound_events for these event_names are auto-skipped to
// prevent duplicate messaging via GHL workflows.
const CANONICALIZED_EVENTS = new Set([
  // Appointment reminders → dispatch-appointment-reminders → dispatch-communication
  "appointment.reminder_24h",
  "appointment.reminder_2h",
  "appointment.reminder_10m",
  // Retargeting → retargeting-no-booking/sync-retargeting-audiences → dispatch-communication
  "retargeting.sms_2h",
  "retargeting.email_24h",
  "retargeting.sms_48h",
  "retargeting.email_72h",
]);

// ─── Revenue Acceleration event → GHL tag map (Day 1 Layer) ─────────────────
// These events are NOT V6.1 canonical pipeline events. They are triggers that
// fire dedicated GHL workflows (SMS / email / internal alert) via tag application.
// All mapped events follow the "tag-only" pattern (no pipeline stage move).
const REVENUE_ACCEL_TAG_MAP: Record<string, string> = {
  // No-booking retargeting (lead-side, pre-booking)
  "retargeting.sms_2h": "etc_retarget_sms_2h",
  "retargeting.email_24h": "etc_retarget_email_24h",
  "retargeting.sms_48h": "etc_retarget_sms_48h",
  "retargeting.email_72h": "etc_retarget_email_72h",
  // Appointment reminders
  "appointment.reminder_24h": "etc_appt_reminder_24h",
  "appointment.reminder_2h": "etc_appt_reminder_2h",
  "appointment.reminder_10m": "etc_appt_reminder_10m",
  // Payment recovery
  "payment.recover_sms": "etc_payment_recover_sms",
  "payment.recover_closer_notify": "etc_payment_recover_closer_notify",
  // Audience sync
  "audience.sync.no_booking": "etc_audience_no_booking",
  "audience.sync.no_show": "etc_audience_no_show",
  // Retention nudges (member-side, post-signup, EMAIL-FIRST)
  "etc.user_inactive_48h": "etc_user_inactive_48h",
  "etc.no_booking_24h": "etc_no_booking_24h",
};
const REVENUE_ACCEL_EVENTS = new Set(Object.keys(REVENUE_ACCEL_TAG_MAP));

// Events that carry rich personalization context (magic_link, first_name,
// current_level, quiz data) which must be mirrored into a GHL contact note so
// downstream email templates can render personalized copy.
const RICH_CONTEXT_EVENTS = new Set<string>([
  "etc.user_inactive_48h",
  "etc.no_booking_24h",
  "retargeting.email_24h", // legacy alias of no_booking_24h
]);

// ─── Resolve canonical V6.1 event name ───────────────────────────────────────
function resolveV61EventName(event: Record<string, any>): string | null {
  const internalStage =
    event.payload?.metadata?.new_stage ?? event.payload?.new_stage;
  if (internalStage && INTERNAL_STAGE_TO_EVENT[internalStage]) {
    return INTERNAL_STAGE_TO_EVENT[internalStage];
  }
  if (V61_CANONICAL_EVENTS.has(event.event_name)) return event.event_name;
  return null;
}

// ─── Build the GHL contact upsert body ───────────────────────────────────────
// Pulls canonical name/phone/quiz from the leads table (or profiles for user events)
// so we never depend on whoever enqueued the event remembering to include them.
function buildContactBody(
  v61EventName: string,
  event: Record<string, any>,
  mapping: { tag: string | null; workflow: string; stage: string | null },
  locationId: string,
  enrichment: {
    name?: string | null;
    phone?: string | null;
    quiz_score?: number | null;
    quiz_result?: string | null;
    quiz_funnel_source?: string | null;
    qualification_bucket?: string | null;
    qualification_path?: string | null;
  },
) {
  const meta = event.payload?.metadata ?? {};
  const payload = event.payload ?? {};
  const email = (event.email as string).toLowerCase().trim();

  // Name resolution priority: leads.name > metadata.lead_name > metadata.full_name
  const fullName: string | undefined =
    enrichment.name ??
    meta.lead_name ??
    meta.full_name ??
    payload.full_name ??
    undefined;

  // Phone resolution priority: leads.phone > metadata.phone
  const phone: string | undefined =
    enrichment.phone ?? meta.phone ?? payload.phone ?? undefined;

  const stageLabel = resolveStageLabel(mapping.stage);

  const cf: { id: string; field_value: string | number }[] = [];
  const push = (id: string | undefined, val: unknown) => {
    if (!id) return;
    if (val === undefined || val === null || val === "") return;
    cf.push({ id, field_value: val as string | number });
  };

  push(GHL_CUSTOM_FIELD_IDS.product_type, PRODUCT_PREFIX);
  push(GHL_CUSTOM_FIELD_IDS.user_state, meta.user_state ?? payload.user_state);
  push(GHL_CUSTOM_FIELD_IDS.intent_level, meta.intent_level ?? enrichment.qualification_bucket);
  push(GHL_CUSTOM_FIELD_IDS.engagement_level, meta.engagement_level);
  push(GHL_CUSTOM_FIELD_IDS.last_action, v61EventName);
  push(GHL_CUSTOM_FIELD_IDS.last_action_date, new Date().toISOString());
  push(GHL_CUSTOM_FIELD_IDS.setter_id, meta.setter_id ?? payload.setter_id);
  push(GHL_CUSTOM_FIELD_IDS.closer_id, meta.closer_id ?? payload.closer_id);
  push(GHL_CUSTOM_FIELD_IDS.lead_level, meta.lead_level ?? payload.lead_level);
  push(GHL_CUSTOM_FIELD_IDS.deal_value, meta.deal_value ?? payload.deal_value);
  push(GHL_CUSTOM_FIELD_IDS.lead_id, event.entity_id);
  push(GHL_CUSTOM_FIELD_IDS.stage, stageLabel);

  // Split name (best-effort)
  let firstName: string | undefined;
  let lastName: string | undefined;
  if (fullName) {
    const parts = fullName.trim().split(/\s+/);
    firstName = parts[0];
    lastName = parts.length > 1 ? parts.slice(1).join(" ") : undefined;
  }

  return {
    locationId,
    email,
    firstName,
    lastName,
    name: fullName,
    phone,
    customFields: cf,
    source: PRODUCT_PREFIX,
  };
}

// ─── Enrich event with canonical lead data ───────────────────────────────────
async function enrichFromLead(
  supabase: any,
  event: Record<string, any>,
): Promise<{
  name?: string | null;
  phone?: string | null;
  quiz_score?: number | null;
  quiz_result?: string | null;
  quiz_funnel_source?: string | null;
  qualification_bucket?: string | null;
  qualification_path?: string | null;
}> {
  const empty = {};
  if (!event.entity_id) return empty;

  if (event.entity_type === "lead") {
    const { data } = await supabase
      .from("leads")
      .select("name, phone, quiz_score, quiz_result, quiz_funnel_source, qualification_bucket, qualification_path")
      .eq("id", event.entity_id)
      .maybeSingle();
    return (data as any) ?? empty;
  }

  // For user/profile events, fall back to lookup by email on the most recent lead
  if (event.email) {
    const { data } = await supabase
      .from("leads")
      .select("name, phone, quiz_score, quiz_result, quiz_funnel_source, qualification_bucket, qualification_path")
      .eq("email", event.email)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    return (data as any) ?? empty;
  }

  return empty;
}

// ─── GHL REST helpers ────────────────────────────────────────────────────────
async function ghlFetch(
  path: string,
  init: RequestInit,
  token: string,
): Promise<Response> {
  return await fetch(`${GHL_API_BASE_URL}${path}`, {
    ...init,
    headers: {
      ...(init.headers ?? {}),
      Authorization: `Bearer ${token}`,
      Version: GHL_API_VERSION,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
  });
}

async function upsertContact(
  body: ReturnType<typeof buildContactBody>,
  token: string,
): Promise<{ ok: true; contactId: string } | { ok: false; error: string }> {
  const resp = await ghlFetch("/contacts/upsert", {
    method: "POST",
    body: JSON.stringify(body),
  }, token);
  const text = await resp.text();
  if (!resp.ok) return { ok: false, error: `upsert ${resp.status}: ${text}` };
  try {
    const json = JSON.parse(text);
    const id = json?.contact?.id ?? json?.id ?? json?.new_contact_id;
    if (!id) return { ok: false, error: `upsert no id in response` };
    return { ok: true, contactId: id };
  } catch {
    return { ok: false, error: `upsert non-JSON response` };
  }
}

async function applyTag(
  contactId: string,
  tagName: string | null,
  token: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!tagName) return { ok: true };
  const resp = await ghlFetch(`/contacts/${contactId}/tags`, {
    method: "POST",
    body: JSON.stringify({ tags: [tagName] }),
  }, token);
  if (resp.ok) return { ok: true };
  const text = await resp.text();
  return { ok: false, error: `tag ${resp.status}: ${text}` };
}

/**
 * Push a structured note onto the GHL contact so email/SMS workflows can
 * render personalized copy (first_name, current_level, magic_link, quiz
 * details). Non-fatal: a failed note never blocks the tag dispatch.
 */
async function pushContactNote(
  contactId: string,
  body: string,
  token: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const resp = await ghlFetch(`/contacts/${contactId}/notes`, {
      method: "POST",
      body: JSON.stringify({ body }),
    }, token);
    if (resp.ok) return { ok: true };
    const text = await resp.text();
    return { ok: false, error: `note ${resp.status}: ${text}` };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

function formatContextNote(eventName: string, payload: Record<string, any>): string {
  const ctx = payload?.email_context ?? payload?.personalization ?? {};
  const lines = [
    `[${eventName}] retention nudge context`,
    payload?.first_name ? `first_name: ${payload.first_name}` : null,
    payload?.current_level ? `current_level: ${payload.current_level}` : null,
    payload?.magic_link ? `magic_link: ${payload.magic_link}` : null,
    payload?.quiz_score != null ? `quiz_score: ${payload.quiz_score}` : null,
    payload?.quiz_result ? `quiz_result: ${payload.quiz_result}` : null,
    payload?.qualification_bucket ? `qualification_bucket: ${payload.qualification_bucket}` : null,
    payload?.quiz_funnel_source ? `quiz_funnel_source: ${payload.quiz_funnel_source}` : null,
    payload?.dashboard_url ? `dashboard_url: ${payload.dashboard_url}` : null,
    Object.keys(ctx).length ? `extra: ${JSON.stringify(ctx)}` : null,
  ].filter(Boolean);
  return lines.join("\n");
}

async function upsertOpportunity(args: {
  contactId: string;
  pipelineId: string;
  pipelineStageId: string;
  locationId: string;
  name: string;
  monetaryValue?: number;
  token: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const { token, ...body } = args;
  const resp = await ghlFetch("/opportunities/upsert", {
    method: "POST",
    body: JSON.stringify({
      pipelineId: body.pipelineId,
      locationId: body.locationId,
      pipelineStageId: body.pipelineStageId,
      contactId: body.contactId,
      name: body.name,
      status: "open",
      monetaryValue: body.monetaryValue,
    }),
  }, token);
  if (resp.ok) return { ok: true };
  const text = await resp.text();
  return { ok: false, error: `opp ${resp.status}: ${text}` };
}

// ─── Main handler ────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const token = Deno.env.get("GHL_PRIVATE_INTEGRATION_TOKEN");
    const locationId =
      Deno.env.get("GHL_LOCATION_ID") ?? // env override
      "Rjc9TYscI3xmUh9732K1";

    if (!token) {
      return json({ error: "GHL_PRIVATE_INTEGRATION_TOKEN not configured" }, 503);
    }

    // Allow caller to request replay of failed/skipped events
    let replay = false;
    try {
      const body = await req.json();
      replay = body?.replay === true;
    } catch {
      /* no body */
    }

    // Reset failed/skipped events back to pending if replay requested
    if (replay) {
      await supabase
        .from("outbound_events")
        .update({
          status: "pending",
          retry_count: 0,
          last_error: null,
          processed_at: null,
        })
        .in("status", ["failed", "skipped", "skipped_no_destination"]);
    }

    const { data: events, error: fetchErr } = await supabase
      .from("outbound_events")
      .select("*")
      .eq("status", "pending")
      .order("created_at", { ascending: true })
      .limit(BATCH_SIZE);

    if (fetchErr) throw fetchErr;
    if (!events || events.length === 0) {
      return json({ success: true, processed: 0 });
    }

    const results: { id: string; status: string; event_name?: string; error?: string }[] = [];

    for (const event of events) {
      await supabase
        .from("outbound_events")
        .update({ status: "processing" })
        .eq("id", event.id);

      // ── Phase 2.1: Skip canonicalized events (now routed via dispatch-communication) ──
      if (CANONICALIZED_EVENTS.has(event.event_name)) {
        await supabase
          .from("outbound_events")
          .update({
            status: "skipped",
            processed_at: new Date().toISOString(),
            last_error: "canonical_path_active: routed via dispatch-communication, GHL skip enforced",
          })
          .eq("id", event.id);
        results.push({ id: event.id, status: "skipped_canonical", event_name: event.event_name });
        continue;
      }

      // ── Revenue Acceleration route (tag-only GHL workflow trigger) ─────
      if (REVENUE_ACCEL_EVENTS.has(event.event_name)) {
        const tagName = REVENUE_ACCEL_TAG_MAP[event.event_name];
        const isInternal = event.destination === "internal";

        // Internal closer notify: log only, do NOT push to GHL
        if (isInternal) {
          await supabase
            .from("outbound_events")
            .update({
              status: "sent",
              processed_at: new Date().toISOString(),
              last_error: null,
            })
            .eq("id", event.id);
          results.push({ id: event.id, status: "sent", event_name: event.event_name });
          continue;
        }

        if (!event.email) {
          await supabase
            .from("outbound_events")
            .update({
              status: "failed",
              last_error: "Missing email — required for GHL contact identity",
              processed_at: new Date().toISOString(),
            })
            .eq("id", event.id);
          results.push({ id: event.id, status: "failed", event_name: event.event_name, error: "missing email" });
          continue;
        }

        const enrichment = await enrichFromLead(supabase, event);
        const fakeMapping = { tag: tagName, workflow: tagName, stage: null as string | null };
        const contactBody = buildContactBody(event.event_name, event, fakeMapping, locationId, enrichment);

        let raSuccess = false;
        let raLastError = "";
        let raContactId: string | null = null;
        for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
          try {
            const upsert = await upsertContact(contactBody, token);
            if (!upsert.ok) {
              raLastError = upsert.error;
            } else {
              raContactId = upsert.contactId;
              const tagRes = await applyTag(upsert.contactId, tagName, token);
              if (tagRes.ok) { raSuccess = true; break; }
              raLastError = tagRes.error;
            }
          } catch (e) {
            raLastError = (e as Error).message;
          }
          if (attempt < MAX_RETRIES - 1) {
            await new Promise((r) => setTimeout(r, [1000, 5000][attempt] ?? 5000));
          }
        }

        // Email-First retention nudges: surface rich context (magic link,
        // first name, level, quiz score) to GHL via a contact note. Non-fatal.
        if (raSuccess && raContactId && RICH_CONTEXT_EVENTS.has(event.event_name)) {
          const note = formatContextNote(event.event_name, event.payload ?? {});
          if (note.length > 0) {
            await pushContactNote(raContactId, note, token).catch(() => {});
          }
        }

        const nowIso = new Date().toISOString();
        if (raSuccess) {
          await supabase.from("outbound_events").update({
            status: "sent", processed_at: nowIso, last_error: null,
          }).eq("id", event.id);
          results.push({ id: event.id, status: "sent", event_name: event.event_name });
        } else {
          const newRetry = (event.retry_count || 0) + 1;
          const finalStatus = newRetry >= MAX_RETRIES ? "failed" : "pending";
          await supabase.from("outbound_events").update({
            status: finalStatus, retry_count: newRetry, last_error: raLastError, processed_at: nowIso,
          }).eq("id", event.id);
          results.push({ id: event.id, status: finalStatus, event_name: event.event_name, error: raLastError });
        }
        continue;
      }

      const v61EventName = resolveV61EventName(event);
      if (!v61EventName) {
        await supabase
          .from("outbound_events")
          .update({
            status: "skipped",
            last_error: `Non-V6.1 event (no mapping): ${event.event_name}`,
            processed_at: new Date().toISOString(),
          })
          .eq("id", event.id);
        results.push({ id: event.id, status: "skipped", event_name: event.event_name });
        continue;
      }

      if (!event.email) {
        await supabase
          .from("outbound_events")
          .update({
            status: "failed",
            last_error: "Missing email — V6.1 requires email for contact identity",
            processed_at: new Date().toISOString(),
          })
          .eq("id", event.id);
        results.push({ id: event.id, status: "failed", event_name: v61EventName, error: "missing email" });
        continue;
      }

      const mapping = GHL_EVENT_MAP[v61EventName];
      const enrichment = await enrichFromLead(supabase, event);
      const contactBody = buildContactBody(v61EventName, event, mapping, locationId, enrichment);

      let success = false;
      let lastError = "";

      for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        try {
          // 1. Upsert contact
          const upsert = await upsertContact(contactBody, token);
          if (!upsert.ok) {
            lastError = upsert.error;
          } else {
            const contactId = upsert.contactId;

            // 2. Apply tag (triggers V6.1 tag workflows in GHL)
            const tagRes = await applyTag(contactId, mapping.tag, token);
            if (!tagRes.ok) {
              lastError = tagRes.error;
            } else {
              // 3. Move pipeline stage (only if spec allows)
              if (mapping.stage) {
                const stageId = resolveStageId(mapping.stage);
                if (stageId) {
                  const oppName =
                    contactBody.name ?? contactBody.email ?? `Lead ${event.entity_id}`;
                  const monetaryValue =
                    event.payload?.metadata?.deal_value ??
                    event.payload?.deal_value ??
                    undefined;
                  const opp = await upsertOpportunity({
                    contactId,
                    pipelineId: GHL_PIPELINE_ID,
                    pipelineStageId: stageId,
                    locationId,
                    name: oppName,
                    monetaryValue: typeof monetaryValue === "number" ? monetaryValue : undefined,
                    token,
                  });
                  if (!opp.ok) {
                    // Stage move failed but tag applied — non-fatal, log & continue
                    lastError = `tagged_ok but ${opp.error}`;
                  }
                }
              }

              // Persist ghl_contact_id on profile (non-blocking, by setter/closer)
              if (event.entity_type === "lead") {
                const userId =
                  event.payload?.metadata?.setter_id ||
                  event.payload?.metadata?.closer_id;
                if (userId) {
                  await supabase
                    .from("profiles")
                    .update({ ghl_contact_id: contactId })
                    .eq("id", userId)
                    .is("ghl_contact_id", null);
                }
              }

              success = true;
              break;
            }
          }
        } catch (e) {
          lastError = (e as Error).message;
        }

        if (attempt < MAX_RETRIES - 1) {
          await new Promise((r) => setTimeout(r, [1000, 5000][attempt] ?? 5000));
        }
      }

      const now = new Date().toISOString();
      if (success) {
        await supabase
          .from("outbound_events")
          .update({
            status: "sent",
            processed_at: now,
            last_error: lastError || null,
          })
          .eq("id", event.id);
        results.push({ id: event.id, status: "sent", event_name: v61EventName });
      } else {
        const newRetry = (event.retry_count || 0) + 1;
        const finalStatus = newRetry >= MAX_RETRIES ? "failed" : "pending";

        if (finalStatus === "failed") {
          await supabase
            .from("webhook_dlq")
            .insert({
              source_table: "outbound_events",
              source_id: event.id,
              event_name: v61EventName,
              payload: contactBody,
              error_message: lastError,
              retry_count: newRetry,
            })
            .then(() => {}, () => {});
        }

        await supabase
          .from("outbound_events")
          .update({
            status: finalStatus,
            retry_count: newRetry,
            last_error: lastError,
            processed_at: now,
          })
          .eq("id", event.id);
        results.push({ id: event.id, status: finalStatus, event_name: v61EventName, error: lastError });
      }
    }

    await supabase.from("audit_logs").insert({
      action: `${PRODUCT_PREFIX}_ghl_outbound_batch`,
      source_type: "system",
      note: `Dispatched ${results.length} events via GHL REST API`,
      after_state: {
        sent: results.filter((r) => r.status === "sent").length,
        failed: results.filter((r) => r.status === "failed").length,
        skipped: results.filter((r) => r.status === "skipped").length,
        pending_retry: results.filter((r) => r.status === "pending").length,
      },
    });

    return json({ success: true, processed: results.length, results });
  } catch (error) {
    console.error("Outbound dispatch error:", (error as Error).message);
    return json({ error: (error as Error).message }, 500);
  }
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
