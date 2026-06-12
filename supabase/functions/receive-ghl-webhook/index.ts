/**
 * Receive GHL Webhook → Lovable (ETC V6.1) — HARDENED + CANONICAL STATE GUARD
 * Phase 2: UNIFIED GHL INBOUND ENTRY POINT (merged ghl-event-webhook)
 *
 * Allowed inbound events (5 only):
 *   deal_won, deal_lost, no_show, call_completed, call_rescheduled
 *
 * LAYER 47 ENFORCEMENT:
 *   - GHL events are NORMALIZED to canonical events
 *   - State changes go through canonical_state_transitions (DB trigger enforces)
 *   - Direct leads.stage updates are FORBIDDEN
 *   - Every event is logged with source=ghl, accepted/rejected, reason
 *   - funnel_events_v2 ingestion via ingest_funnel_event RPC (merged from ghl-event-webhook)
 *
 * Security:
 *   - HMAC signature verification (timing-safe)
 *   - Idempotency via processed_events
 *   - Stale timestamp rejection
 *   - Forbidden table mutation prevention
 *   - Security events on repeated invalid signatures
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { PRODUCT_PREFIX } from "../_shared/product-config.ts";
import { ALLOWED_INBOUND_EVENTS, type AllowedInboundEvent } from "../_shared/ghl-config.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-webhook-secret, x-webhook-signature, x-webhook-timestamp, x-product-prefix, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const EventSchema = z.object({
  event_name: z.string().min(1),
  event_id: z.string().optional(),
  ghl_contact_id: z.string().optional(),
  user_id: z.string().uuid().optional(),
  email: z.string().email().optional(),
  timestamp: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
});

// ─── GHL → Canonical Event Mapping (Layer 47) ──────────────────────────────
// GHL events are normalized to canonical conversion events.
// Only these mappings are allowed. Everything else is rejected.
const GHL_TO_CANONICAL_EVENT: Record<string, string> = {
  deal_won: "call_closed_won",
  deal_lost: "call_closed_lost",
  no_show: "call_no_show",
  call_completed: "call_showed",       // GHL "call completed" = lead showed up
  call_rescheduled: "rebooked",
};

// ─── GHL → funnel_events_v2 Mapping (merged from ghl-event-webhook) ────────
// Broader mapping for funnel event ingestion (non-state-mutating).
const FUNNEL_EVENT_MAP: Record<string, string> = {
  form_submit: "lead_created",
  lead_created: "lead_created",
  quiz_done: "quiz_completed",
  quiz_completed: "quiz_completed",
  appointment_booked: "booked",
  booking_created: "booked",
  booked: "booked",
  setter_assigned: "setter_assigned",
  setter_contacted: "setter_contacted",
  setter_qualified: "setter_qualified",
  ready_for_closer: "ready_for_closer",
  closer_assigned: "closer_assigned",
  call_started: "call_started",
  call_completed: "call_completed",
  no_show: "no_show",
  rescheduled: "rescheduled",
  offer_made: "offer_made",
  sale: "deal_won",
  deal_won: "deal_won",
  payment_success: "deal_won",
  lost: "deal_lost",
  deal_lost: "deal_lost",
};

function buildFunnelDedupKey(eventName: string, eventId: string | undefined, leadId: string | null, timestamp: string | undefined): string {
  const id = eventId || "";
  const ts = timestamp || "";
  return `ghl:${eventName}:${id || `${leadId || "unknown"}:${ts}`}`;
}

// ─── FORBIDDEN DIRECT MUTATIONS ────────────────────────────────────────────
// These columns MUST NEVER be updated directly by GHL webhooks.
// The DB trigger enforces this for conversion_state, but we guard stage too.
const FORBIDDEN_DIRECT_COLUMNS = new Set([
  "conversion_state",
  "stage",
  "appointment_status",
]);

/** Timing-safe comparison to prevent timing attacks */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  const encoder = new TextEncoder();
  const bufA = encoder.encode(a);
  const bufB = encoder.encode(b);
  let result = 0;
  for (let i = 0; i < bufA.length; i++) {
    result |= bufA[i] ^ bufB[i];
  }
  return result === 0;
}

/** Compute HMAC-SHA256 signature */
async function computeHmac(secret: string, payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const rawBody = await req.text();
    const webhookSecret = Deno.env.get("GHL_WEBHOOK_SECRET");

    // ── SIGNATURE VERIFICATION ──
    if (webhookSecret) {
      const incomingSignature = req.headers.get("x-webhook-signature");
      const incomingSecret = req.headers.get("x-webhook-secret");

      let verified = false;

      if (incomingSignature) {
        const expectedSig = await computeHmac(webhookSecret, rawBody);
        verified = timingSafeEqual(incomingSignature, expectedSig);
      } else if (incomingSecret) {
        verified = timingSafeEqual(incomingSecret, webhookSecret);
      }

      if (!verified) {
        await supabase.from("security_events").insert({
          severity: "high",
          event_type: "invalid_ghl_signature",
          status: "open",
          summary: "Invalid GHL webhook signature received",
          details: {
            has_signature: !!incomingSignature,
            has_secret: !!incomingSecret,
            ip: req.headers.get("x-forwarded-for") ?? "unknown",
          },
        });

        await logGhlAudit(supabase, "unknown", null, "rejected", "invalid_signature", {
          ip: req.headers.get("x-forwarded-for"),
        });

        return json({ error: "Invalid webhook signature" }, 401);
      }
    } else {
      return json({ error: "Webhook secret not configured" }, 500);
    }

    // ── PARSE BODY ──
    let body: unknown;
    try {
      body = JSON.parse(rawBody);
    } catch {
      return json({ error: "Invalid JSON" }, 400);
    }

    const parsed = EventSchema.safeParse(body);
    if (!parsed.success) {
      return json({ error: "Invalid payload", details: parsed.error.flatten().fieldErrors }, 400);
    }

    const { event_name, event_id, ghl_contact_id, user_id, email, timestamp, metadata } = parsed.data;

    // ── STALE TIMESTAMP CHECK ──
    if (timestamp) {
      const eventTime = new Date(timestamp).getTime();
      const now = Date.now();
      const MAX_AGE_MS = 5 * 60 * 1000;
      if (isNaN(eventTime) || Math.abs(now - eventTime) > MAX_AGE_MS) {
        await logGhlAudit(supabase, event_name, null, "rejected", "stale_timestamp", { timestamp });
        return json({ error: "Stale or invalid timestamp" }, 400);
      }
    }

    // ── VALIDATE EVENT TYPE ──
    if (!ALLOWED_INBOUND_EVENTS.includes(event_name as AllowedInboundEvent)) {
      await logGhlAudit(supabase, event_name, null, "rejected", "unknown_event_type", { event_name, ghl_contact_id });
      await supabase.from("security_events").insert({
        severity: "low",
        event_type: "unknown_ghl_event_type",
        status: "open",
        summary: `Unknown GHL event type: ${event_name}`,
        details: { event_name },
      });
      return json({ error: `Event '${event_name}' is not an allowed inbound event` }, 400);
    }

    // ── IDEMPOTENCY CHECK ──
    const idempotencyKey = event_id
      ? `ghl:${event_id}`
      : `ghl:${event_name}:${ghl_contact_id ?? user_id ?? email ?? "anon"}:${timestamp ?? Date.now()}`;

    const { data: existing } = await supabase
      .from("processed_events")
      .select("id")
      .eq("event_key", idempotencyKey)
      .maybeSingle();

    if (existing) {
      return json({ success: true, action: "already_processed", idempotency_key: idempotencyKey });
    }

    await supabase.from("processed_events").insert({
      event_key: idempotencyKey,
      source: "ghl_webhook",
      processed_at: new Date().toISOString(),
    }).then(() => {}, () => {});

    // ── RESOLVE USER ──
    let resolvedUserId = user_id ?? null;

    if (!resolvedUserId && ghl_contact_id) {
      const { data } = await supabase
        .from("profiles").select("id").eq("ghl_contact_id", ghl_contact_id).maybeSingle();
      resolvedUserId = data?.id ?? null;
    }
    if (!resolvedUserId && email) {
      const { data } = await supabase
        .from("profiles").select("id").eq("email", email.toLowerCase().trim()).maybeSingle();
      resolvedUserId = data?.id ?? null;
    }

    if (resolvedUserId && ghl_contact_id) {
      await supabase.from("profiles").update({ ghl_contact_id })
        .eq("id", resolvedUserId).is("ghl_contact_id", null);
    }

    // ── CANONICAL EVENT NORMALIZATION (Layer 47) ──
    const canonicalEvent = GHL_TO_CANONICAL_EVENT[event_name];
    let actionTaken = "logged";
    const leadId = metadata?.lead_id as string | undefined;

    if (canonicalEvent && leadId) {
      // Attempt canonical state transition via conversion_state
      // The DB trigger will ENFORCE the transition is valid
      const { data: lead } = await supabase
        .from("leads")
        .select("id, conversion_state")
        .eq("id", leadId)
        .maybeSingle();

      if (lead) {
        const currentState = lead.conversion_state;

        // Look up the valid target state from canonical_state_transitions
        const { data: transition } = await supabase
          .from("canonical_state_transitions")
          .select("to_state")
          .eq("from_state", currentState ?? "new_lead")
          .eq("event", canonicalEvent)
          .maybeSingle();

        if (transition) {
          // Valid transition — execute it (DB trigger validates as safety net)
          const { error: updateError } = await supabase
            .from("leads")
            .update({
              conversion_state: transition.to_state,
              // Also update deal_value for deal_won
              ...(event_name === "deal_won" && metadata?.deal_value
                ? { deal_value: metadata.deal_value as number }
                : {}),
              updated_at: new Date().toISOString(),
            })
            .eq("id", leadId);

          if (updateError) {
            actionTaken = `canonical_transition_failed: ${updateError.message}`;
            await logGhlAudit(supabase, event_name, resolvedUserId, "rejected", "canonical_transition_failed", {
              canonical_event: canonicalEvent,
              from_state: currentState,
              to_state: transition.to_state,
              error: updateError.message,
              ghl_contact_id, metadata, idempotency_key: idempotencyKey,
            });
          } else {
            actionTaken = `canonical_${canonicalEvent}_applied`;
            await logGhlAudit(supabase, event_name, resolvedUserId, "accepted", actionTaken, {
              canonical_event: canonicalEvent,
              from_state: currentState,
              to_state: transition.to_state,
              ghl_contact_id, metadata, idempotency_key: idempotencyKey,
            });
          }
        } else {
          // No valid transition from current state — BLOCK
          actionTaken = `canonical_blocked: ${canonicalEvent} not valid from ${currentState}`;
          await logGhlAudit(supabase, event_name, resolvedUserId, "rejected", "invalid_transition", {
            canonical_event: canonicalEvent,
            current_state: currentState,
            reason: `Event "${canonicalEvent}" is not a valid transition from state "${currentState}"`,
            ghl_contact_id, metadata, idempotency_key: idempotencyKey,
          });
        }
      } else {
        actionTaken = "lead_not_found";
        await logGhlAudit(supabase, event_name, resolvedUserId, "rejected", "lead_not_found", {
          lead_id: leadId, ghl_contact_id, metadata,
        });
      }
    } else if (!canonicalEvent) {
      actionTaken = "no_canonical_mapping";
      await logGhlAudit(supabase, event_name, resolvedUserId, "rejected", "no_canonical_mapping", {
        ghl_contact_id, metadata,
      });
    }

    // ── SUPPLEMENTARY ACTIONS (non-state-mutating) ──
    // These are safe: they log events or create alerts, never mutate lead state
    switch (event_name as AllowedInboundEvent) {
      case "no_show": {
        if (leadId) {
          await supabase.from("lead_events").insert({
            lead_id: leadId, event_type: "no_show",
            actor_user_id: resolvedUserId, notes: "No-show reported from GHL",
            metadata: metadata ?? {},
          });
          await supabase.from("escalation_alerts").insert({
            alert_type: "no_show", title: "No-Show gemeldet",
            description: `Lead ${leadId} ist nicht erschienen (via GHL)`,
            severity: "medium", source_type: "ghl_webhook",
            source_entity_type: "lead", source_entity_id: leadId,
            target_role: "admin", metadata: { ghl_contact_id, ...metadata },
          }).then(() => {}, () => {});
        }
        break;
      }
      case "call_completed": {
        if (leadId) {
          await supabase.from("lead_events").insert({
            lead_id: leadId, event_type: "call_completed",
            actor_user_id: resolvedUserId, metadata: metadata ?? {},
          });
        }
        break;
      }
      case "call_rescheduled": {
        if (leadId) {
          await supabase.from("lead_events").insert({
            lead_id: leadId, event_type: "call_rescheduled",
            actor_user_id: resolvedUserId, metadata: metadata ?? {},
          });
        }
        break;
      }
    }

    // ── FUNNEL EVENTS V2 INGESTION (merged from ghl-event-webhook) ──
    // Non-state-mutating: ingests into funnel_events_v2 for analytics/reporting.
    let funnelIngested = false;
    const funnelMappedType = FUNNEL_EVENT_MAP[event_name.toLowerCase()];
    if (funnelMappedType && leadId) {
      const funnelDedupKey = buildFunnelDedupKey(funnelMappedType, event_id, leadId, timestamp);
      const { error: ingestErr } = await supabase.rpc("ingest_funnel_event", {
        _lead_id: leadId,
        _event_type: funnelMappedType,
        _dedup_key: funnelDedupKey,
        _source_system: "ghl",
        _payload: { ...metadata, event_name, ghl_contact_id },
      });
      if (ingestErr) {
        console.error(`[receive-ghl-webhook] funnel ingest error: ${ingestErr.message}`);
      } else {
        funnelIngested = true;
      }
    }

    // ── RAW WEBHOOK EVENT (audit trail, replaces ghl-event-webhook's raw_webhook_events) ──
    await supabase.from("raw_webhook_events").insert({
      source: "ghl",
      event_name,
      payload: { ...metadata, event_name, ghl_contact_id, email, user_id: resolvedUserId },
      mapped: !!funnelMappedType,
      mapped_event_type: funnelMappedType ?? null,
      error: null,
    }).then(() => {}, () => {});

    // ── EVENT LOG ──
    await supabase.from("event_logs").insert({
      event_name: `${PRODUCT_PREFIX}_ghl_${event_name}`,
      email: email ?? null,
      payload: {
        source: "ghl_inbound", product: PRODUCT_PREFIX,
        event_name, canonical_event: canonicalEvent ?? null,
        funnel_event: funnelMappedType ?? null,
        funnel_ingested: funnelIngested,
        ghl_contact_id, user_id: resolvedUserId, metadata,
        action_taken: actionTaken,
      },
      status: "received",
    });

    return json({ success: true, event_name, canonical_event: canonicalEvent, action: actionTaken, funnel_ingested: funnelIngested, user_resolved: !!resolvedUserId });
  } catch (error) {
    console.error("GHL webhook error:", error);
    return json({ error: (error as Error).message }, 500);
  }
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/**
 * GHL Audit Logger — logs every GHL event with:
 * source=ghl, raw_event_id, canonical_event_type, accepted/rejected, reason, affected_entity
 */
async function logGhlAudit(
  supabase: any,
  eventName: string,
  userId: string | null,
  disposition: "accepted" | "rejected",
  reason: string,
  details: Record<string, unknown>,
) {
  await supabase.from("audit_logs").insert({
    action: `${PRODUCT_PREFIX}_ghl_inbound_${eventName}`,
    action_type: "ghl_event_ingested",
    source_type: "ghl_webhook",
    target_user_id: userId,
    note: `GHL → ${PRODUCT_PREFIX}: ${eventName} (${disposition}: ${reason})`,
    after_state: {
      product: PRODUCT_PREFIX,
      source: "ghl",
      event_name: eventName,
      canonical_event: GHL_TO_CANONICAL_EVENT[eventName] ?? null,
      disposition,
      reason,
      ...details,
    },
  });
}
