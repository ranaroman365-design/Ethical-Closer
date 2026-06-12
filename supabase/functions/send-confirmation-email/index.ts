import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const BodySchema = z.object({
  user_email: z.string().email(),
  user_name: z.string().min(1).max(255),
  product_key: z.string().min(1).max(50).default("etc"),
  appointment_time: z.string().min(1).optional(),
  /** Type of confirmation: 'appointment' (booking) or 'purchase' (payment). */
  type: z.enum(["appointment", "purchase"]).default("appointment"),
  /** Purchase-specific fields */
  program_name: z.string().max(120).optional(),
  program_duration_weeks: z.number().int().positive().max(104).optional(),
  start_condition: z.string().max(120).optional(),
  primary_domain: z.string().max(120).optional(),
});

/* ─────────────────────────────────────────────────────────────────
 * APPOINTMENT CONFIRMATION (existing flow — kept for backward compat)
 * ───────────────────────────────────────────────────────────────── */
function buildAppointmentEmailHtml(
  userName: string,
  appointmentTime: string,
  brandName: string,
  supportEmail: string
): string {
  return `<!DOCTYPE html>
<html lang="de">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f8f8f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:40px auto;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e5e5e0;">
    <tr>
      <td style="padding:32px 32px 24px;text-align:center;border-bottom:1px solid #f0f0ec;">
        <h1 style="margin:0;font-size:20px;font-weight:600;color:#1a1a1a;letter-spacing:-0.02em;">${brandName}</h1>
      </td>
    </tr>
    <tr>
      <td style="padding:32px;">
        <p style="margin:0 0 16px;font-size:15px;color:#1a1a1a;line-height:1.6;">
          Hallo <strong>${userName}</strong>,
        </p>
        <p style="margin:0 0 24px;font-size:15px;color:#444;line-height:1.6;">
          dein Termin ist bestätigt. Wir freuen uns auf das Gespräch mit dir.
        </p>
        <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8f8f6;border-radius:8px;border:1px solid #e5e5e0;">
          <tr>
            <td style="padding:20px 24px;">
              <p style="margin:0 0 4px;font-size:11px;text-transform:uppercase;letter-spacing:0.08em;color:#888;">Termin</p>
              <p style="margin:0;font-size:16px;font-weight:600;color:#1a1a1a;">${appointmentTime}</p>
            </td>
          </tr>
        </table>
        <p style="margin:24px 0 0;font-size:13px;color:#888;line-height:1.6;">
          Falls du Fragen hast, antworte direkt auf diese E-Mail oder schreibe an
          <a href="mailto:${supportEmail}" style="color:#b8860b;text-decoration:none;">${supportEmail}</a>.
        </p>
      </td>
    </tr>
    <tr>
      <td style="padding:16px 32px;text-align:center;border-top:1px solid #f0f0ec;">
        <p style="margin:0;font-size:11px;color:#aaa;">${brandName} · Terminbestätigung</p>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/* ─────────────────────────────────────────────────────────────────
 * PURCHASE CONFIRMATION — Legally defensible commitment agreement
 *
 * Structure (matches gold-standard requirements):
 *   • Confirmation of purchase
 *   • Program identity (name, duration, start condition, access expiry)
 *   • Refund clause (no refunds once started)
 *   • Withdrawal waiver acknowledgment
 *   • Education-only disclaimer
 *   • Legal links (Terms / Refund / Privacy)
 *
 * Tone: clear, neutral, non-aggressive, professional.
 * ───────────────────────────────────────────────────────────────── */
function buildPurchaseEmailHtml(opts: {
  userName: string;
  brandName: string;
  programName: string;
  durationWeeks: number;
  startCondition: string;
  supportEmail: string;
  primaryDomain: string;
}): string {
  const {
    userName,
    brandName,
    programName,
    durationWeeks,
    startCondition,
    supportEmail,
    primaryDomain,
  } = opts;

  const baseUrl = primaryDomain.startsWith("http")
    ? primaryDomain.replace(/\/+$/, "")
    : `https://${primaryDomain.replace(/\/+$/, "")}`;

  const termsUrl = `${baseUrl}/terms`;
  const refundUrl = `${baseUrl}/refund-policy`;
  const privacyUrl = `${baseUrl}/privacy`;
  const legalNoticeUrl = `${baseUrl}/legal-notice`;

  return `<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Your Enrollment in ${programName}</title>
</head>
<body style="margin:0;padding:0;background:#f8f8f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1a1a1a;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:40px auto;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e5e5e0;">

    <!-- Header -->
    <tr>
      <td style="padding:36px 36px 20px;text-align:center;border-bottom:1px solid #f0f0ec;">
        <p style="margin:0 0 6px;font-size:10px;text-transform:uppercase;letter-spacing:0.18em;color:#b8860b;">Coherence Labs LLC</p>
        <h1 style="margin:0;font-size:22px;font-weight:600;color:#1a1a1a;letter-spacing:-0.02em;">${brandName}</h1>
        <p style="margin:6px 0 0;font-size:12px;color:#888;">Your Enrollment in ${programName}</p>
      </td>
    </tr>

    <!-- Welcome -->
    <tr>
      <td style="padding:32px 36px 8px;">
        <p style="margin:0 0 14px;font-size:16px;line-height:1.6;font-weight:500;">
          Welcome to ${programName}, <strong>${userName}</strong>.
        </p>
        <p style="margin:0 0 24px;font-size:15px;line-height:1.65;color:#333;">
          This email confirms your enrollment in the program. Please keep it for your records — it forms part of your commitment agreement.
        </p>

        <!-- Program Details Card -->
        <p style="margin:0 0 8px;font-size:10px;text-transform:uppercase;letter-spacing:0.14em;color:#888;font-weight:600;">Program Details</p>
        <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8f8f6;border-radius:10px;border:1px solid #e5e5e0;margin:0 0 24px;">
          <tr>
            <td style="padding:18px 22px;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="padding:6px 0;font-size:13px;color:#666;width:40%;">Duration</td>
                  <td style="padding:6px 0;font-size:13px;color:#1a1a1a;font-weight:500;">${durationWeeks} weeks</td>
                </tr>
                <tr>
                  <td style="padding:6px 0;font-size:13px;color:#666;border-top:1px solid #ececea;">Access</td>
                  <td style="padding:6px 0;font-size:13px;color:#1a1a1a;font-weight:500;border-top:1px solid #ececea;">Time-limited · expires automatically after the program ends</td>
                </tr>
                <tr>
                  <td style="padding:6px 0;font-size:13px;color:#666;border-top:1px solid #ececea;">Start</td>
                  <td style="padding:6px 0;font-size:13px;color:#1a1a1a;font-weight:500;border-top:1px solid #ececea;">As communicated during onboarding</td>
                </tr>
              </table>
            </td>
          </tr>
        </table>

        <!-- Commitment frame -->
        <p style="margin:0 0 18px;font-size:14px;line-height:1.65;color:#333;">
          This program is a structured, commitment-based educational experience.
        </p>

        <!-- Agreement summary -->
        <p style="margin:0 0 8px;font-size:11px;text-transform:uppercase;letter-spacing:0.12em;color:#888;font-weight:600;">As agreed during your purchase</p>
        <table width="100%" cellpadding="0" cellspacing="0" style="background:#fafaf7;border-radius:8px;border:1px solid #ececea;margin:0 0 24px;">
          <tr>
            <td style="padding:14px 20px;">
              <ul style="margin:0;padding:0 0 0 18px;font-size:13px;line-height:1.8;color:#333;">
                <li>The program provides education and training only</li>
                <li>No specific results are guaranteed</li>
                <li>Refunds are not available once the program has started</li>
                <li>Payment plans remain binding regardless of participation</li>
              </ul>
            </td>
          </tr>
        </table>

        <!-- Withdrawal waiver acknowledgment -->
        <p style="margin:0 0 24px;font-size:13px;line-height:1.65;color:#555;">
          By completing your purchase, you confirmed your agreement to the Terms of Service and Refund Policy, as well as your waiver of withdrawal rights where applicable
          (Art. 16(m) Consumer Rights Directive 2011/83/EU).
        </p>

        <p style="margin:0 0 28px;font-size:14px;line-height:1.65;color:#1a1a1a;">
          We're looking forward to working with you.
        </p>

        <!-- Legal links -->
        <p style="margin:0 0 8px;font-size:11px;text-transform:uppercase;letter-spacing:0.12em;color:#888;">Legal documents</p>
        <p style="margin:0 0 24px;font-size:13px;line-height:1.8;color:#333;">
          <a href="${termsUrl}" style="color:#b8860b;text-decoration:none;">Terms of Service</a> &nbsp;·&nbsp;
          <a href="${refundUrl}" style="color:#b8860b;text-decoration:none;">Refund &amp; Cancellation Policy</a> &nbsp;·&nbsp;
          <a href="${privacyUrl}" style="color:#b8860b;text-decoration:none;">Privacy Policy</a> &nbsp;·&nbsp;
          <a href="${legalNoticeUrl}" style="color:#b8860b;text-decoration:none;">Legal Notice</a>
        </p>

        <!-- Support -->
        <p style="margin:0;font-size:13px;color:#777;line-height:1.6;">
          Questions? Reply to this email or write to
          <a href="mailto:${supportEmail}" style="color:#b8860b;text-decoration:none;">${supportEmail}</a>.
          We aim to respond within two business days.
        </p>
      </td>
    </tr>

    <!-- Footer -->
    <tr>
      <td style="padding:18px 36px;text-align:center;border-top:1px solid #f0f0ec;background:#fafaf7;">
        <p style="margin:0 0 4px;font-size:11px;color:#999;">
          Coherence Labs LLC · 1309 Coffeen Ave, Suite 1200, Sheridan, WY 82801, United States
        </p>
        <p style="margin:0;font-size:10px;color:#aaa;">
          This is a transactional confirmation of your purchase and constitutes part of your commitment agreement.
        </p>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const resendApiKey = Deno.env.get("RESEND_API_KEY");
  if (!resendApiKey) {
    console.error("[send-confirmation-email] RESEND_API_KEY not set");
    return new Response(JSON.stringify({ error: "email not configured" }), {
      status: 503,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let parsed;
  try {
    const body = await req.json();
    parsed = BodySchema.safeParse(body);
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (!parsed.success) {
    return new Response(JSON.stringify({ error: parsed.error.flatten().fieldErrors }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const {
    user_email,
    user_name,
    product_key,
    appointment_time,
    type,
    program_name,
    program_duration_weeks,
    start_condition,
    primary_domain,
  } = parsed.data;

  // Type-specific validation
  if (type === "appointment" && !appointment_time) {
    return new Response(
      JSON.stringify({ error: "appointment_time required for type=appointment" }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }

  // Fetch product config for branding
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  let brandName = "Ethical Top Closer";
  let supportEmail = "support@ethicalcloser.de";
  let resolvedProgramName = program_name || "Ethical Top Closer";
  let resolvedDuration = program_duration_weeks ?? 9;
  let resolvedStartCondition = start_condition || "immediate or scheduled start date";
  let resolvedDomain = primary_domain || "yourradiantway.com";

  const { data: configRow } = await supabase
    .from("product_config")
    .select("config")
    .eq("product_key", product_key)
    .maybeSingle();

  if (configRow?.config) {
    const cfg = configRow.config as Record<string, unknown>;
    const branding = cfg.branding as Record<string, unknown> | undefined;
    if (branding?.product_name) brandName = branding.product_name as string;
    if (branding?.support_email) supportEmail = branding.support_email as string;
    const program = cfg.program as Record<string, unknown> | undefined;
    if (program?.name && !program_name) resolvedProgramName = program.name as string;
    if (program?.duration_weeks && !program_duration_weeks) {
      resolvedDuration = program.duration_weeks as number;
    }
    if (program?.start_condition && !start_condition) {
      resolvedStartCondition = program.start_condition as string;
    }
    const legal = cfg.legal as Record<string, unknown> | undefined;
    if (legal?.primary_domain && !primary_domain) {
      resolvedDomain = legal.primary_domain as string;
    }
  }

  // Build email
  let subject: string;
  let html: string;

  if (type === "purchase") {
    subject = `Your Enrollment in ${resolvedProgramName}`;
    html = buildPurchaseEmailHtml({
      userName: user_name,
      brandName,
      programName: resolvedProgramName,
      durationWeeks: resolvedDuration,
      startCondition: resolvedStartCondition,
      supportEmail,
      primaryDomain: resolvedDomain,
    });
  } else {
    subject = `Dein Termin ist bestätigt — ${brandName}`;
    html = buildAppointmentEmailHtml(user_name, appointment_time!, brandName, supportEmail);
  }

  try {
    const resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: `${brandName} <noreply@ethicalcloser.de>`,
        to: [user_email],
        subject,
        html,
      }),
    });

    const resendBody = await resendRes.text();

    if (!resendRes.ok) {
      console.error("Resend API error:", resendBody);
      // Do NOT write audit log on failure
      return new Response(
        JSON.stringify({ error: "Email send failed", details: resendBody }),
        {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Audit log — only on success
    await supabase.from("audit_logs").insert({
      action:
        type === "purchase"
          ? "purchase_confirmation_email_sent"
          : "confirmation_email_sent",
      source_type: "resend",
      note: `${
        type === "purchase" ? "Purchase" : "Appointment"
      } confirmation email sent to ${user_email} for ${product_key}`,
      after_state: {
        email: user_email,
        product_key,
        type,
        ...(type === "purchase"
          ? {
              program_name: resolvedProgramName,
              program_duration_weeks: resolvedDuration,
              start_condition: resolvedStartCondition,
            }
          : { appointment_time }),
        resend_status: resendRes.status,
      },
    });

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Email send error:", err);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
