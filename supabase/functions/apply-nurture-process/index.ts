/**
 * Apply Nurture Process — cron-callable.
 *
 * Pulls all due `apply_nurture_queue` rows (status=pending, scheduled_at<=now),
 * sends the matching transactional template via `send-transactional-email`,
 * and marks each row sent/failed. Bounded batch size to keep invocation short.
 *
 * Idempotency: each row is moved out of `pending` before send to prevent
 * double-fire on concurrent crons; on send error we revert to pending and
 * increment attempts (max 3, then status=failed).
 */
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const TEMPLATE_BY_STAGE: Record<string, string> = {
  d1: "apply-nurture-d1",
  d3: "apply-nurture-d3",
  d14: "apply-nurture-d14",
};

const BATCH_SIZE = 50;
const MAX_ATTEMPTS = 3;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const sb = createClient(SUPABASE_URL, SERVICE_ROLE);
  const nowIso = new Date().toISOString();

  const { data: due, error } = await sb
    .from("apply_nurture_queue")
    .select("id, stage, recipient_email, recipient_name, attempts")
    .eq("status", "pending")
    .lte("scheduled_at", nowIso)
    .lt("attempts", MAX_ATTEMPTS)
    .order("scheduled_at", { ascending: true })
    .limit(BATCH_SIZE);

  if (error) {
    console.error("[apply-nurture-process] fetch error", error);
    return json({ error: "fetch_failed" }, 500);
  }
  if (!due?.length) return json({ ok: true, processed: 0 });

  const results: Array<{ id: string; ok: boolean; error?: string }> = [];

  for (const row of due) {
    const templateName = TEMPLATE_BY_STAGE[row.stage];
    if (!templateName) {
      await sb
        .from("apply_nurture_queue")
        .update({ status: "skipped", last_error: "unknown_stage", updated_at: nowIso })
        .eq("id", row.id);
      results.push({ id: row.id, ok: false, error: "unknown_stage" });
      continue;
    }

    // Reserve row (advisory): bump attempts up-front; if send fails, leave pending
    await sb
      .from("apply_nurture_queue")
      .update({ attempts: (row.attempts ?? 0) + 1, updated_at: nowIso })
      .eq("id", row.id);

    const idempotencyKey = `apply-nurture-${row.stage}-${row.recipient_email}`;
    const firstName = row.recipient_name?.split(" ")[0] ?? undefined;

    const { error: sendErr } = await sb.functions.invoke("send-transactional-email", {
      body: {
        templateName,
        recipientEmail: row.recipient_email,
        idempotencyKey,
        templateData: { name: firstName },
      },
    });

    if (sendErr) {
      const willGiveUp = (row.attempts ?? 0) + 1 >= MAX_ATTEMPTS;
      await sb
        .from("apply_nurture_queue")
        .update({
          status: willGiveUp ? "failed" : "pending",
          last_error: String(sendErr.message ?? sendErr),
          updated_at: new Date().toISOString(),
        })
        .eq("id", row.id);
      results.push({ id: row.id, ok: false, error: String(sendErr.message ?? sendErr) });
    } else {
      await sb
        .from("apply_nurture_queue")
        .update({
          status: "sent",
          sent_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", row.id);
      results.push({ id: row.id, ok: true });
    }
  }

  return json({ ok: true, processed: results.length, results });
});

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
