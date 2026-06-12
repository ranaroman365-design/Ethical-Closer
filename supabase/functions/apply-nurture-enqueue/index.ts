/**
 * Apply Nurture Enqueue — Item 4 of Apply v2 audit.
 *
 * Inserts 3 scheduled emails (T+1d / T+3d / T+14d) for a low-bucket
 * `/apply` quiz lead into `apply_nurture_queue`. Idempotent via the
 * (recipient_email, stage) unique constraint — safe to call repeatedly.
 *
 * Auth: deployed with verify_jwt = false (anon callable from quiz page).
 * The function does NOT echo back data and uses service role to insert,
 * so it cannot be used to read existing rows.
 */
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

interface Body {
  lead_id?: string | null;
  email: string;
  name?: string | null;
  bucket?: string | null;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = (await req.json()) as Body;
    if (!body?.email || !EMAIL_RE.test(body.email)) {
      return new Response(JSON.stringify({ error: "invalid_email" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const sb = createClient(SUPABASE_URL, SERVICE_ROLE);
    const now = Date.now();
    const day = 24 * 60 * 60 * 1000;

    const rows = [
      { stage: "d1", scheduled_at: new Date(now + 1 * day).toISOString() },
      { stage: "d3", scheduled_at: new Date(now + 3 * day).toISOString() },
      { stage: "d14", scheduled_at: new Date(now + 14 * day).toISOString() },
    ].map((r) => ({
      ...r,
      lead_id: body.lead_id ?? null,
      recipient_email: body.email,
      recipient_name: body.name ?? null,
      bucket: body.bucket ?? "low",
      funnel: "apply",
      status: "pending",
    }));

    const { error } = await sb
      .from("apply_nurture_queue")
      .upsert(rows, { onConflict: "recipient_email,stage", ignoreDuplicates: true });

    if (error) {
      console.error("[apply-nurture-enqueue]", error);
      return new Response(JSON.stringify({ error: "enqueue_failed" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ ok: true, enqueued: rows.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[apply-nurture-enqueue] fatal", err);
    return new Response(JSON.stringify({ error: "bad_request" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
