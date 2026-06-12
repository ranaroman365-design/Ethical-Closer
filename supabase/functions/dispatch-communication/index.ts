// Layer 48 — Communication OS Orchestrator
// Single entry point for all outbound messages.
// Steps: route → dedup-check → send primary → on hard-fail send fallback → log.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Channel = "whatsapp" | "sms" | "push" | "email";

interface DispatchRequest {
  event_key: string;
  user_id?: string | null;
  lead_id?: string | null;
  recipient_email?: string | null;
  recipient_phone?: string | null;
  has_push_token?: boolean;
  template_key?: string;
  variant_key?: string;
  payload?: Record<string, unknown>;
  force?: boolean;
  email_provider?: 'lovable' | 'external' | 'auto';
}

// TOUCHPOINT_MATRIX — self-contained copy of src/lib/communication-os.ts
const MATRIX: Record<string, { phase: string; purpose: string; primary: Channel; fallback: Channel | null }> = {
  quiz_completed_hot:      { phase: "lead_entry",    purpose: "action",        primary: "whatsapp", fallback: "sms" },
  email_capture:           { phase: "lead_entry",    purpose: "documentation", primary: "email",    fallback: null  },
  quiz_abandoned:          { phase: "lead_entry",    purpose: "attention",     primary: "push",     fallback: null  },
  booking_started:         { phase: "booking",       purpose: "attention",     primary: "push",     fallback: null  },
  booking_completed_email: { phase: "booking",       purpose: "documentation", primary: "email",    fallback: null  },
  booking_completed_wa:    { phase: "booking",       purpose: "action",        primary: "whatsapp", fallback: "sms" },
  booking_no_show_book:    { phase: "booking",       purpose: "action",        primary: "whatsapp", fallback: "sms" },
  pre_call_24h:            { phase: "pre_call",      purpose: "reinforcement", primary: "whatsapp", fallback: "sms" },
  pre_call_3h:             { phase: "pre_call",      purpose: "reinforcement", primary: "whatsapp", fallback: "sms" },
  pre_call_30m:            { phase: "pre_call",      purpose: "action",        primary: "whatsapp", fallback: "sms" },
  call_no_show_recovery:   { phase: "call",          purpose: "action",        primary: "whatsapp", fallback: "sms" },
  no_show_immediate:       { phase: "call",          purpose: "action",        primary: "whatsapp", fallback: "sms" },
  no_show_2h_reminder:     { phase: "call",          purpose: "action",        primary: "whatsapp", fallback: "sms" },
  no_show_24h_followup:    { phase: "call",          purpose: "action",        primary: "whatsapp", fallback: "sms" },
  post_call_qualified:     { phase: "post_call",     purpose: "action",        primary: "whatsapp", fallback: "sms" },
  post_call_not_qualified: { phase: "post_call",     purpose: "documentation", primary: "email",    fallback: null  },
  post_call_followup:      { phase: "post_call",     purpose: "action",        primary: "whatsapp", fallback: "sms" },
  onboarding_accepted:     { phase: "onboarding",    purpose: "documentation", primary: "email",    fallback: null  },
  onboarding_start:        { phase: "onboarding",    purpose: "action",        primary: "whatsapp", fallback: "sms" },
  onboarding_day_1:        { phase: "onboarding",    purpose: "attention",     primary: "push",     fallback: null  },
  level_start:             { phase: "talent_engine", purpose: "action",        primary: "whatsapp", fallback: null  },
  talent_feedback:         { phase: "talent_engine", purpose: "action",        primary: "whatsapp", fallback: null  },
  promotion_email:         { phase: "talent_engine", purpose: "documentation", primary: "email",    fallback: null  },
  promotion_wa:            { phase: "talent_engine", purpose: "reinforcement", primary: "whatsapp", fallback: null  },
  underperformance_alert:  { phase: "talent_engine", purpose: "action",        primary: "whatsapp", fallback: null  },
  mentoring_nudge:         { phase: "talent_engine", purpose: "attention",     primary: "push",     fallback: null  },
  hot_lead_alert_internal: { phase: "lead_entry",    purpose: "attention",     primary: "whatsapp", fallback: null  },
};

const TWILIO_GATEWAY = "https://connector-gateway.lovable.dev/twilio";
const E164_RE = /^\+[1-9]\d{6,14}$/;

function getFromNumber(channel: "whatsapp" | "sms"): { ok: boolean; from?: string; error?: string } {
  const envKey = channel === "whatsapp" ? "TWILIO_WHATSAPP_FROM" : "TWILIO_SMS_FROM";
  const raw = Deno.env.get(envKey);
  if (!raw || raw.trim() === "") {
    return { ok: false, error: `${envKey} ist nicht gesetzt.` };
  }
  const cleaned = raw.trim().replace("whatsapp:", "");
  if (!E164_RE.test(cleaned)) {
    return { ok: false, error: `${envKey} hat ungültiges Format (${raw}). Erwartet: +49...` };
  }
  return { ok: true, from: raw.trim() };
}

async function sendViaTwilioGateway(
  channel: "whatsapp" | "sms",
  toPhone: string,
  body: string,
): Promise<{ ok: boolean; error?: string; sid?: string }> {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  const TWILIO_API_KEY = Deno.env.get("TWILIO_API_KEY");

  if (!LOVABLE_API_KEY || !TWILIO_API_KEY) {
    // Fallback: try direct Twilio if connector gateway keys not available
    const TWILIO_AUTH = Deno.env.get("TWILIO_AUTH_TOKEN");
    const TWILIO_SID = Deno.env.get("TWILIO_ACCOUNT_SID");
    if (!TWILIO_AUTH || !TWILIO_SID) {
      return { ok: false, error: `twilio_credentials_missing (no gateway or direct creds)` };
    }
    const fromCheck = getFromNumber(channel);
    if (!fromCheck.ok) return { ok: false, error: fromCheck.error };
    const to = channel === "whatsapp" ? `whatsapp:${toPhone}` : toPhone;
    const from = channel === "whatsapp" ? `whatsapp:${fromCheck.from}` : fromCheck.from!;
    const auth = btoa(`${TWILIO_SID}:${TWILIO_AUTH}`);
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`, {
      method: "POST",
      headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ To: to, From: from, Body: body }),
    });
    if (!res.ok) {
      const txt = await res.text();
      return { ok: false, error: `twilio_direct_${res.status}: ${txt.slice(0, 200)}` };
    }
    const data = await res.json();
    return { ok: true, sid: data.sid };
  }

  // Use connector gateway (preferred)
  const fromCheck = getFromNumber(channel);
  if (!fromCheck.ok) return { ok: false, error: fromCheck.error };

  const to = channel === "whatsapp" ? `whatsapp:${toPhone}` : toPhone;
  const from = channel === "whatsapp" ? `whatsapp:${fromCheck.from}` : fromCheck.from!;

  const res = await fetch(`${TWILIO_GATEWAY}/Messages.json`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "X-Connection-Api-Key": TWILIO_API_KEY,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ To: to, From: from, Body: body }),
  });

  if (!res.ok) {
    const txt = await res.text();
    return { ok: false, error: `twilio_gw_${res.status}: ${txt.slice(0, 200)}` };
  }
  const data = await res.json();
  return { ok: true, sid: data.sid };
}

async function sendViaChannel(
  channel: Channel,
  address: string,
  payload: Record<string, unknown>,
  template_key: string | undefined,
  supabase: ReturnType<typeof createClient>,
  emailProvider: 'lovable' | 'external' | 'auto' = 'lovable',
): Promise<{ ok: boolean; error?: string; email_provider_used?: string }> {
  try {
    if (channel === "whatsapp" || channel === "sms") {
      const body = (payload.body as string) ?? (payload.text as string) ?? "";
      if (!body) return { ok: false, error: "empty_message_body" };
      const result = await sendViaTwilioGateway(channel, address, body);
      return { ok: result.ok, error: result.error };
    }

    if (channel === "email") {
      const resolvedProvider = emailProvider === 'auto' ? 'lovable' : emailProvider;
      if (resolvedProvider === 'lovable') {
        const { error } = await supabase.functions.invoke("send-transactional-email", {
          body: {
            templateName: template_key ?? "communication-os-generic",
            recipientEmail: address,
            idempotencyKey: (payload.idempotency_key as string) ?? `commos-${crypto.randomUUID()}`,
            templateData: payload,
          },
        });
        if (error) return { ok: false, error: `email_${error.message ?? "unknown"}`, email_provider_used: 'lovable' };
        return { ok: true, email_provider_used: 'lovable' };
      } else {
        return { ok: true, email_provider_used: 'external' };
      }
    }

    if (channel === "push") {
      const { error } = await supabase.functions.invoke("send-push-notification", {
        body: { user_id: address, title: payload.title ?? "ETC", body: payload.body ?? "", data: payload },
      });
      if (error) return { ok: false, error: `push_${error.message ?? "unknown"}` };
      return { ok: true };
    }

    return { ok: false, error: "unknown_channel" };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "send_exception" };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = (await req.json()) as DispatchRequest;
    if (!body.event_key) {
      return new Response(JSON.stringify({ error: "event_key required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const spec = MATRIX[body.event_key];
    if (!spec) {
      return new Response(JSON.stringify({ error: `unknown event_key: ${body.event_key}` }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const subject_id = body.user_id ?? body.lead_id ?? body.recipient_email ?? body.recipient_phone ?? "anon";
    const dedup_key = `${body.event_key}:${subject_id}`;

    // 1. Dedup check (24h window)
    if (!body.force) {
      const { error: dedupErr } = await supabase
        .from("communication_dedup")
        .insert({ dedup_key, event_key: body.event_key, subject_id, channel: spec.primary });
      if (dedupErr && dedupErr.code === "23505") {
        await supabase.from("communication_dispatch_log").insert({
          event_key: body.event_key, phase: spec.phase, purpose: spec.purpose,
          user_id: body.user_id ?? null, lead_id: body.lead_id ?? null,
          recipient: body.recipient_email ?? body.recipient_phone ?? null,
          primary_channel: spec.primary, fallback_channel: spec.fallback,
          fallback_used: false, status: "suppressed_dedup",
          template_key: body.template_key ?? null, variant_key: body.variant_key ?? null,
          payload: body.payload ?? {}, dedup_key,
        });
        return new Response(JSON.stringify({ status: "suppressed_dedup", dedup_key }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // 2. Resolve address for channel
    const resolveAddr = (ch: Channel): string | null => {
      if (ch === "email") return body.recipient_email ?? null;
      if (ch === "whatsapp" || ch === "sms") return body.recipient_phone ?? null;
      if (ch === "push") return body.user_id ?? null;
      return null;
    };

    const primaryAddr = resolveAddr(spec.primary);
    if (!primaryAddr) {
      const fbAddr = spec.fallback ? resolveAddr(spec.fallback) : null;
      if (!fbAddr) {
        await supabase.from("communication_dispatch_log").insert({
          event_key: body.event_key, phase: spec.phase, purpose: spec.purpose,
          user_id: body.user_id ?? null, lead_id: body.lead_id ?? null,
          recipient: null, primary_channel: spec.primary, fallback_channel: spec.fallback,
          fallback_used: false, status: "no_recipient",
          error_message: `no address for ${spec.primary}${spec.fallback ? ` or ${spec.fallback}` : ""}`,
          template_key: body.template_key ?? null, variant_key: body.variant_key ?? null,
          payload: body.payload ?? {}, dedup_key,
        });
        return new Response(JSON.stringify({ status: "no_recipient" }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // 3. Send primary
    let usedChannel: Channel = spec.primary;
    let usedAddr = primaryAddr ?? "";
    let fallback_used = false;
    const emailProv = body.email_provider ?? 'lovable';
    let result = primaryAddr
      ? await sendViaChannel(spec.primary, primaryAddr, body.payload ?? {}, body.template_key, supabase, emailProv)
      : { ok: false, error: "no_primary_address" };

    // 4. Hard-fail fallback
    if (!result.ok && spec.fallback) {
      const fbAddr = resolveAddr(spec.fallback);
      if (fbAddr) {
        fallback_used = true;
        usedChannel = spec.fallback;
        usedAddr = fbAddr;
        result = await sendViaChannel(spec.fallback, fbAddr, body.payload ?? {}, body.template_key, supabase, emailProv);
      }
    }

    // 5. Log to communication_dispatch_log
    await supabase.from("communication_dispatch_log").insert({
      event_key: body.event_key, phase: spec.phase, purpose: spec.purpose,
      user_id: body.user_id ?? null, lead_id: body.lead_id ?? null,
      recipient: usedAddr || null,
      primary_channel: spec.primary, fallback_channel: spec.fallback,
      fallback_used, status: result.ok ? "sent" : "failed",
      error_message: result.error ?? null,
      template_key: body.template_key ?? null, variant_key: body.variant_key ?? null,
      payload: body.payload ?? {}, dedup_key,
    });

    return new Response(JSON.stringify({
      status: result.ok ? "sent" : "failed",
      channel: usedChannel, fallback_used, error: result.error,
    }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "internal" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
