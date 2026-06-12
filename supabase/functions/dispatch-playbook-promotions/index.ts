// Edge function: dispatch-playbook-promotions
// Drains `playbook_promotion_outbox`, creates a 24h magic-token per row,
// invokes `send-transactional-email` with template `lp-playbook-guide`,
// and marks the row sent/failed.
//
// Triggered by pg_cron (every 5 min) or manually.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const APP_BASE = Deno.env.get("PUBLIC_APP_URL") ?? "https://ethical-closing.lovable.app";

const FUNCTIONS_BASE = `${SUPABASE_URL}/functions/v1`;
const REDEEM_BASE = `${FUNCTIONS_BASE}/playbook-magic-redeem`;
const IN_APP_URL = `${APP_BASE}/members/playbooks/auszahlungspolitik`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

  const { data: pending, error } = await admin
    .from("playbook_promotion_outbox")
    .select("id, user_id, playbook_key, trigger_level")
    .eq("status", "pending")
    .order("enqueued_at", { ascending: true })
    .limit(50);

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const results: any[] = [];

  for (const row of pending ?? []) {
    try {
      // Resolve recipient email + name
      const { data: prof } = await admin
        .from("profiles")
        .select("id, email, full_name, first_name")
        .eq("id", row.user_id)
        .maybeSingle();

      const email = (prof as any)?.email as string | undefined;
      if (!email) {
        await admin.from("playbook_promotion_outbox").update({
          status: "skipped",
          error_message: "no_email_on_profile",
          sent_at: new Date().toISOString(),
        }).eq("id", row.id);
        results.push({ id: row.id, status: "skipped" });
        continue;
      }

      const firstName =
        (prof as any)?.first_name ||
        ((prof as any)?.full_name ? String((prof as any).full_name).split(" ")[0] : undefined);

      // Mint magic token (24h, one-shot)
      const { data: tokenData, error: tErr } = await admin.rpc(
        "create_playbook_magic_token",
        {
          _playbook_key: row.playbook_key,
          _recipient_email: email,
          _user_id: row.user_id,
          _lead_id: null,
          _version: null,
          _source: "l3_promotion_email",
          _ttl_hours: 24,
        },
      );
      if (tErr || !tokenData) throw new Error(`token_mint_failed:${tErr?.message ?? "no_token"}`);

      const downloadUrl = `${REDEEM_BASE}?token=${encodeURIComponent(String(tokenData))}`;

      // Send via existing transactional pipeline
      const sendRes = await fetch(`${FUNCTIONS_BASE}/send-transactional-email`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${SERVICE_ROLE}`,
          apikey: SERVICE_ROLE,
        },
        body: JSON.stringify({
          templateName: "lp-playbook-guide",
          recipientEmail: email,
          idempotencyKey: `playbook-guide-${row.user_id}-${row.playbook_key}-${row.trigger_level}`,
          templateData: {
            name: firstName,
            downloadUrl,
            inAppUrl: IN_APP_URL,
          },
        }),
      });

      if (!sendRes.ok) {
        const txt = await sendRes.text();
        throw new Error(`send_failed:${sendRes.status}:${txt.slice(0, 200)}`);
      }

      await admin.from("playbook_promotion_outbox").update({
        status: "sent",
        sent_at: new Date().toISOString(),
        error_message: null,
      }).eq("id", row.id);

      results.push({ id: row.id, status: "sent" });
    } catch (e) {
      await admin.from("playbook_promotion_outbox").update({
        status: "failed",
        error_message: String((e as Error).message ?? e).slice(0, 500),
      }).eq("id", row.id);
      results.push({ id: row.id, status: "failed", error: String((e as Error).message ?? e) });
    }
  }

  return new Response(JSON.stringify({ processed: results.length, results }), {
    status: 200, headers: { ...cors, "Content-Type": "application/json" },
  });
});
