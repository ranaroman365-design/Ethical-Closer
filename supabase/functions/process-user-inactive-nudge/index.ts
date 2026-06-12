/**
 * Retention Nudge — etc.user_inactive_48h (EMAIL-FIRST)
 *
 * Finds members whose `community_user_metrics.last_active_at` is older than
 * 48h (and ≤14d, to skip long-dormant accounts) and enqueues a canonical
 * `outbound_event` with the full personalization payload required by the
 * GHL retention email:
 *
 *   • email             (contact identity)
 *   • first_name        (greeting token)
 *   • current_level     ("L1 · Trainee (Opener)" etc.)
 *   • magic_link        (one-click dashboard login, 24h TTL)
 *   • dashboard_url     (post-login destination)
 *
 * The dispatcher (process-outbound-events) maps the event to the
 * `etc_user_inactive_48h` GHL tag and pushes the rich context into a contact
 * note so the email template can render personalized copy.
 *
 * Idempotency: a one-row-per-user `nudge_state` is stored on the metrics row
 * via `last_inactive_nudge_at` (added below) so we never double-fire inside
 * the same 7-day window.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// L0–L8 stage labels — matches src/components/members/CareerPath.tsx STAGE_LABELS.
const STAGE_LABELS: Record<string, string> = {
  prospect: "L0 · Bewerber",
  opener: "L1 · Trainee (Opener)",
  setter: "L2 · Associate Setter",
  associate_setter: "L2 · Associate Setter",
  senior_associate: "L3 · Senior Setter",
  senior_setter: "L3 · Senior Setter",
  junior_manager: "L4 · Junior Closer",
  manager: "L5 · Managing Closer",
  senior_manager: "L6 · Senior Closer",
  director: "L7 · Director",
  partner: "L8 · Partner",
};

const SITE_URL =
  Deno.env.get("PUBLIC_SITE_URL") ?? "https://ethical-closing.lovable.app";
const DASHBOARD_PATH = "/members/dashboard";

const INACTIVE_MIN_HOURS = 48;
const INACTIVE_MAX_DAYS = 14;
const RENUDGE_COOLDOWN_DAYS = 7;
const BATCH_SIZE = 200;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const now = Date.now();
    const inactiveSince = new Date(now - INACTIVE_MIN_HOURS * 3600_000).toISOString();
    const notTooOld = new Date(now - INACTIVE_MAX_DAYS * 86400_000).toISOString();
    const cooldown = new Date(now - RENUDGE_COOLDOWN_DAYS * 86400_000).toISOString();

    // Pull candidates: inactive 48h–14d, no nudge in cooldown window.
    const { data: metrics, error: metricsErr } = await supabase
      .from("community_user_metrics")
      .select("user_id, last_active_at, last_inactive_nudge_at")
      .lte("last_active_at", inactiveSince)
      .gte("last_active_at", notTooOld)
      .or(
        `last_inactive_nudge_at.is.null,last_inactive_nudge_at.lte.${cooldown}`,
      )
      .limit(BATCH_SIZE);

    if (metricsErr) throw metricsErr;
    if (!metrics || metrics.length === 0) {
      return json({ ok: true, processed: 0, reason: "no_candidates" });
    }

    const userIds = metrics.map((m) => m.user_id);

    // Resolve profile + email in one round-trip.
    const { data: profiles, error: profErr } = await supabase
      .from("profiles")
      .select("id, full_name, email, business_stage")
      .in("id", userIds);
    if (profErr) throw profErr;

    const profileById = new Map(
      (profiles ?? []).map((p: any) => [p.id, p]),
    );

    const results: Array<{ user_id: string; status: string; reason?: string }> = [];

    for (const m of metrics) {
      const prof = profileById.get(m.user_id);
      if (!prof?.email) {
        results.push({ user_id: m.user_id, status: "skipped", reason: "no_email" });
        continue;
      }

      const email = String(prof.email).toLowerCase().trim();
      const fullName = (prof.full_name ?? "").trim();
      const firstName = fullName.split(/\s+/)[0] || "Member";
      const stage = prof.business_stage ?? "opener";
      const currentLevel = STAGE_LABELS[stage] ?? stage;

      // Generate a magic link (24h TTL) that lands the user directly on
      // their dashboard. Non-fatal: the email still ships if this fails;
      // the template falls back to the bare dashboard URL.
      let magicLink: string | null = null;
      try {
        const { data: magic, error: magicErr } = await supabase.auth.admin
          .generateLink({
            type: "magiclink",
            email,
            options: { redirectTo: `${SITE_URL}${DASHBOARD_PATH}` },
          });
        if (!magicErr && magic?.properties?.action_link) {
          magicLink = magic.properties.action_link;
        }
      } catch (_e) {
        // swallow — link is a nice-to-have, not required
      }

      const payload = {
        email,
        first_name: firstName,
        full_name: fullName || firstName,
        current_level: currentLevel,
        business_stage: stage,
        magic_link: magicLink,
        dashboard_url: `${SITE_URL}${DASHBOARD_PATH}`,
        // Surface a small structured block the GHL email can iterate on.
        email_context: {
          first_name: firstName,
          current_level: currentLevel,
          magic_link: magicLink,
          inactive_since: m.last_active_at,
        },
      };

      const { error: insErr } = await supabase
        .from("outbound_events")
        .insert({
          event_name: "etc.user_inactive_48h",
          entity_type: "user",
          entity_id: m.user_id,
          email,
          destination: "ghl",
          payload,
          status: "pending",
        });

      if (insErr) {
        results.push({ user_id: m.user_id, status: "failed", reason: insErr.message });
        continue;
      }

      // Mark cooldown so the next sweep skips this user for 7 days.
      await supabase
        .from("community_user_metrics")
        .update({ last_inactive_nudge_at: new Date().toISOString() })
        .eq("user_id", m.user_id);

      results.push({ user_id: m.user_id, status: "queued" });
    }

    await supabase.from("audit_logs").insert({
      action: "etc_user_inactive_48h_sweep",
      source_type: "system",
      note: `Queued ${results.filter((r) => r.status === "queued").length} retention nudges`,
      after_state: {
        candidates: metrics.length,
        queued: results.filter((r) => r.status === "queued").length,
        skipped: results.filter((r) => r.status === "skipped").length,
        failed: results.filter((r) => r.status === "failed").length,
      },
    });

    return json({ ok: true, processed: results.length, results });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown";
    console.error("[user-inactive-nudge] error:", msg);
    return json({ ok: false, error: msg }, 500);
  }
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
