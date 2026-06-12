// Retargeting: No-Booking Reclaim System
// Trigger: quiz_completed AND no booking
// Canonical cadence (single active funnel):
//   T+5m  WA   ▸  T+2h SMS*  ▸  T+24h Email  ▸  T+48h SMS  ▸  T+72h Email
//   *SMS T+2h is SKIPPED when the T+5m WhatsApp was delivered AND the lead
//   engaged (replied / inbound) — avoids double-touch on the same channel
//   intent. Funnel-separation guard preserved.
// All sends routed via dispatch-communication (Phase 2 canon). No outbound_events.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type ActionKey = "wa_5m" | "sms_2h" | "email_24h" | "sms_48h" | "email_72h";

// Map quiz_result / qualification_bucket → human-readable program fit line.
function programFitLine(quizResult?: string | null, bucket?: string | null): string {
  const key = (quizResult || bucket || "").toLowerCase();
  if (key.includes("priority") || key.includes("a_player") || key === "a") {
    return "Du gehörst zu den Top-Profilen – Priority-Track empfohlen.";
  }
  if (key.includes("qualified") || key === "b") {
    return "Du bist qualifiziert für den Standard-Track.";
  }
  if (key.includes("starter") || key === "c") {
    return "Dein Profil passt in den Einstiegs-Track.";
  }
  return "Dein Profil passt zum Programm.";
}

// Derive a preferred-time hint from quiz_answers (best-effort, optional).
function preferredWindowLine(answers: any): string {
  const w = answers?.preferred_time || answers?.time_window || answers?.availability;
  if (typeof w === "string" && w.trim()) return `Bevorzugtes Zeitfenster: ${w.trim()}.`;
  return "";
}

// A/B variants per touchpoint. Goal: maximize booked-call rate.
// A = current "soft/identity" tone. B = "direct/scarcity/curiosity" tone.
type Variant = "A" | "B";
type Template = { channel: "sms" | "email" | "whatsapp"; subject?: string; body: string };

const TEMPLATES: Record<ActionKey, Record<Variant, Template>> = {
  wa_5m: {
    A: {
      channel: "whatsapp",
      body:
        "Hi {name}, kurz vom Ethical-Closer-Team 👋\n\n" +
        "Dein Quiz-Ergebnis: {quiz_outcome}. {program_fit}\n" +
        "{preferred_window}\n\n" +
        "Magst du dir jetzt deinen Slot sichern?\n{booking_link}",
    },
    B: {
      channel: "whatsapp",
      body:
        "{name}, dein Quiz ({quiz_outcome}) sieht stark aus – {program_fit}\n" +
        "Antworte mit deinem Wunschtermin oder buche direkt:\n{booking_link}",
    },
  },
  sms_2h: {
    A: {
      channel: "sms",
      body:
        "Hey {name}, kurzer Hinweis:\n\n" +
        "Quiz-Ergebnis: {quiz_outcome}. {program_fit}\n" +
        "{preferred_window}\n\n" +
        "Die meisten springen genau hier ab – die, die es nicht tun, sind die, die wirklich vorankommen.\n\n" +
        "Sichere dir deinen Call: {booking_link}",
    },
    B: {
      channel: "sms",
      body:
        "{name}, dein Quiz: {quiz_outcome}. {program_fit}\n" +
        "Slots schließen heute Abend. {preferred_window}\n\n" +
        "Jetzt 60-Sek-Buchung: {booking_link}",
    },
  },
  email_24h: {
    A: {
      channel: "email",
      subject: "{quiz_outcome} – aber du hast es nicht zu Ende gebracht",
      body:
        "Hey {name},\n\n" +
        "Dein Quiz-Ergebnis: {quiz_outcome}.\n" +
        "{program_fit}\n" +
        "{preferred_window}\n\n" +
        "• Du warst qualifiziert.\n" +
        "• Du hast es nicht zu Ende gebracht.\n" +
        "• Genau das ist der Grund, warum die meisten festhängen.\n\n" +
        "Wenn du es ernst meinst, hol dir jetzt deinen Slot:\n{booking_link}",
    },
    B: {
      channel: "email",
      subject: "{name}, 1 Frage zu deinem Quiz ({quiz_outcome})",
      body:
        "Hey {name},\n\n" +
        "Schnelle Frage: Was hat dich gestern gestoppt, deinen Call zu buchen?\n\n" +
        "Dein Profil ({quiz_outcome}) passt klar – {program_fit}\n" +
        "{preferred_window}\n\n" +
        "Wenn Timing das Thema war, hier sind die nächsten freien Slots:\n{booking_link}\n\n" +
        "Wenn etwas anderes – antworte einfach auf diese Mail.",
    },
  },
  sms_48h: {
    A: {
      channel: "sms",
      body:
        "Letzte Erinnerung – wir schließen diese Runde.\n\n" +
        "{program_fit} {preferred_window}\n\n" +
        "Wenn du es ernst meinst, nimm dir den Slot jetzt:\n{booking_link}",
    },
    B: {
      channel: "sms",
      body:
        "{name}, wir vergeben deinen Platz an den nächsten qualifizierten Bewerber.\n\n" +
        "Letzte Chance auf einen Slot diese Woche:\n{booking_link}",
    },
  },
  email_72h: {
    A: {
      channel: "email",
      subject: "Wir gehen weiter",
      body:
        "Hey {name},\n\n" +
        "Trotz deines Ergebnisses ({quiz_outcome}) wirst du aktuell nicht mehr priorisiert.\n" +
        "{program_fit}\n\n" +
        "Falls du es doch ernst meinst – das hier ist deine letzte Chance:\n{booking_link}",
    },
    B: {
      channel: "email",
      subject: "Schließen deine Akte ({quiz_outcome})",
      body:
        "Hey {name},\n\n" +
        "Wir archivieren heute deine Bewerbung.\n" +
        "Quiz: {quiz_outcome}. {program_fit}\n\n" +
        "Reaktivieren in 60 Sekunden:\n{booking_link}\n\n" +
        "Sonst gehen wir davon aus, dass das Timing nicht passt.",
    },
  },
};

// Deterministic A/B split by lead id + action so a lead always sees the same variant per touchpoint.
function pickVariant(leadId: string, action: ActionKey): Variant {
  let h = 2166136261;
  const s = `${leadId}:${action}`;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0) % 2 === 0 ? "A" : "B";
}

const BOOKING_LINK = Deno.env.get("PUBLIC_BOOKING_LINK") ?? "https://ethicalcloser.de/start/quiz";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const now = Date.now();
    const m5  = new Date(now -  5 * 60_000).toISOString();
    const h96 = new Date(now - 96 * 3600_000).toISOString();

    // Pull leads with quiz completed but no booking, within 5m-96h window.
    // SOP funnel-separation guard: skip leads in recovery / closed / exit states.
    // Extra fields: whatsapp_* signals to skip sms_2h after engaged WA touch.
    const { data: leads, error } = await supabase
      .from("leads")
      .select(
        "id, email, phone, name, quiz_completed_at, has_booking, retargeting_state, retargeting_ab_variants, quiz_result, quiz_score, quiz_funnel_source, quiz_answers, qualification_bucket, conversion_state, whatsapp_engaged, whatsapp_confirmed, whatsapp_last_inbound_at",
      )
      .not("quiz_completed_at", "is", null)
      .eq("has_booking", false)
      .gte("quiz_completed_at", h96)
      .lte("quiz_completed_at", m5)
      .not(
        "conversion_state",
        "in",
        "(recovery_active,rebooked,second_no_show,unresponsive,exit,closed_won,closed_lost)",
      )
      .limit(500);

    if (error) throw error;

    const results: Array<{ id: string; action: ActionKey; variant: Variant }> = [];
    // KPI block — populated as we walk leads.
    const kpi = {
      wa_5m_sent: 0,        // WA<5m sends issued this run
      wa_replies_total: 0,  // leads in window that ever replied on WA
      wa_reply_to_booked: 0,// leads who replied on WA AND booked
      sms_2h_skipped_wa_engaged: 0, // SOP-saving deflections
      recovery_revenue_eur: 0, // €  realized from leads that re-entered after a touch
    };

    for (const lead of leads ?? []) {
      const completedAt = new Date(lead.quiz_completed_at!).getTime();
      const ageMs = now - completedAt;
      const state = (lead.retargeting_state ?? {}) as Record<string, string>;
      const variants = ((lead as any).retargeting_ab_variants ?? {}) as Record<string, Variant>;

      const waEngaged =
        (lead as any).whatsapp_engaged === true ||
        (lead as any).whatsapp_confirmed === true ||
        !!(lead as any).whatsapp_last_inbound_at;
      if (waEngaged) kpi.wa_replies_total += 1;

      // Decide highest-priority action not yet sent.
      // Cadence: wa_5m → sms_2h* → email_24h → sms_48h → email_72h
      // *sms_2h is skipped when wa_5m was sent AND the lead engaged on WA.
      let action: ActionKey | null = null;
      if      (ageMs >= 72 * 3600_000 && !state.email_72h) action = "email_72h";
      else if (ageMs >= 48 * 3600_000 && !state.sms_48h)   action = "sms_48h";
      else if (ageMs >= 24 * 3600_000 && !state.email_24h) action = "email_24h";
      else if (ageMs >=  2 * 3600_000 && !state.sms_2h) {
        if (state.wa_5m && waEngaged) {
          // Mark sms_2h as skipped to keep the cadence cursor moving forward.
          kpi.sms_2h_skipped_wa_engaged += 1;
          await supabase
            .from("leads")
            .update({
              retargeting_state: { ...state, sms_2h: `skipped:wa_engaged:${new Date().toISOString()}` },
            })
            .eq("id", lead.id);
          continue;
        }
        action = "sms_2h";
      }
      else if (ageMs >= 5 * 60_000 && !state.wa_5m && (lead.phone ?? null)) {
        action = "wa_5m";
      }

      if (!action) continue;

      // Stable variant per (lead, action). Reuse if already assigned.
      const variant: Variant = (variants[action] as Variant) ?? pickVariant(lead.id, action);
      const tpl = TEMPLATES[action][variant];
      const name = (lead.name ?? "").split(" ")[0] || "";
      const quizOutcome = (lead as any).quiz_result || ((lead as any).quiz_score != null ? `Score ${(lead as any).quiz_score}` : "Qualifiziert");
      const fitLine = programFitLine((lead as any).quiz_result, (lead as any).qualification_bucket);
      const windowLine = preferredWindowLine((lead as any).quiz_answers);

      const personalize = (s: string) =>
        s.replaceAll("{name}", name)
         .replaceAll("{booking_link}", BOOKING_LINK)
         .replaceAll("{quiz_outcome}", quizOutcome)
         .replaceAll("{program_fit}", fitLine)
         .replaceAll("{preferred_window}", windowLine)
         .replace(/\n{3,}/g, "\n\n")
         .trim();

      // V6.1 retention nudge: 24h email is the canonical "no_booking_24h" touch.
      // Carry explicit quiz fields at the top of the payload so the GHL email
      // template can personalize without parsing nested objects.
      const isCanonical24hEmail = action === "email_24h";
      const eventName = isCanonical24hEmail ? "etc.no_booking_24h" : `retargeting.${action}`;

      // ═══ ROUTE THROUGH dispatch-communication FOR DEDUP (Phase 2) ═══
      const eventKey = isCanonical24hEmail ? "no_booking_24h" : `retargeting_${action}`;
      const body = personalize(tpl.body);
      const { error: dispatchErr } = await supabase.functions.invoke("dispatch-communication", {
        body: {
          event_key: eventKey,
          lead_id: lead.id,
          recipient_phone: lead.phone ?? null,
          recipient_email: lead.email ?? null,
          payload: {
            body,
            text: body,
            subject: tpl.subject ? personalize(tpl.subject) : undefined,
            channel: tpl.channel,
            booking_link: BOOKING_LINK,
            action,
            variant,
            ab_test: "no_booking_copy_v1",
            personalization: {
              quiz_outcome: quizOutcome,
              program_fit: fitLine,
              preferred_window: windowLine,
            },
          },
        },
      });

      if (dispatchErr) {
        console.error(`[retargeting-no-booking] dispatch failed for ${lead.id}/${action}`, dispatchErr);
        continue;
      }

      await supabase
        .from("leads")
        .update({
          retargeting_state: { ...state, [action]: new Date().toISOString() },
          retargeting_ab_variants: { ...variants, [action]: variant },
        })
        .eq("id", lead.id);

      // SOP Phase 4 — after the Day-5 exit message (72h email) move the lead
      // to UNRESPONSIVE so it leaves the standard SOP flow cleanly.
      // Uses the whitelist-checked helper; safely no-ops if state already exited.
      if (action === "email_72h") {
        await supabase.rpc("sop_apply_transition", {
          p_lead_id: lead.id,
          p_event: "lead_exited",
          p_meta: { source: "retargeting-no-booking", action: "email_72h", variant },
        });
      }

      if (action === "wa_5m") kpi.wa_5m_sent += 1;
      if (action !== "wa_5m" && waEngaged && (lead as any).has_booking === true) {
        kpi.wa_reply_to_booked += 1;
      }

      results.push({ id: lead.id, action, variant });
    }

    // Recovery revenue: sum of deal_value for leads that booked after first touch in window.
    try {
      const { data: rev } = await supabase
        .from("leads")
        .select("deal_value")
        .gte("quiz_completed_at", h96)
        .eq("has_booking", true)
        .not("retargeting_state", "is", null)
        .limit(500);
      kpi.recovery_revenue_eur = (rev ?? []).reduce(
        (sum: number, r: any) => sum + (Number(r.deal_value) || 0),
        0,
      );
    } catch (e) {
      console.warn("[retargeting-no-booking] recovery_revenue calc skipped", e);
    }

    return new Response(JSON.stringify({ ok: true, processed: results.length, results, kpi }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown";
    return new Response(JSON.stringify({ ok: false, error: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
