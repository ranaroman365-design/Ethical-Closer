// Simple, transparent retargeting score.
// Combines: attribution quality, funnel stage, quiz signals (lead_quality/lead_score),
// and booking history (had booking, no-show, touch fatigue). Per-segment weighting
// so the "right" leads bubble up in each retargeting audience.
//
// Score range: 0..100. Priority: HIGH >= 70, MED >= 40, else LOW.

export type Segment = "no_booking" | "no_show" | "booked" | "closed_won" | "closed_lost";

export type ScoreInput = {
  // Quiz / qualification
  lead_quality?: string | null;     // "high" | "mid" | "low" | ...
  lead_score?: number | null;       // existing 0..100 if present
  // Funnel
  source_funnel?: string | null;
  funnel_source?: string | null;
  stage?: string | null;
  // Booking history
  has_booking?: boolean | null;
  booking_status?: string | null;
  no_show_flag?: boolean | null;
  reminder_count?: number | null;
  last_reminder_sent_at?: string | null;
  created_at?: string | null;
  deal_value?: number | null;
  // Attribution
  origin_source?: string | null;    // facebook, google, organic, direct...
  origin_medium?: string | null;    // cpc, paid, organic, referral...
  origin_campaign?: string | null;
  fbclid?: string | null;
  gclid?: string | null;
  // Compliance
  do_not_contact?: boolean | null;
};

export type ScoreResult = {
  score: number;
  priority: "HIGH" | "MED" | "LOW";
  reasons: string[];
};

const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n));

function attributionPoints(i: ScoreInput): { pts: number; why?: string } {
  const src = (i.origin_source || "").toLowerCase();
  const med = (i.origin_medium || "").toLowerCase();
  if (i.fbclid || i.gclid || med === "cpc" || med === "paid" || src === "facebook" || src === "google" || src === "instagram" || src === "tiktok") {
    return { pts: 18, why: "Paid traffic (re-addressable)" };
  }
  if (src === "organic" || med === "organic") return { pts: 10, why: "Organic" };
  if (src === "referral" || med === "referral") return { pts: 8, why: "Referral" };
  if (src === "direct" || med === "direct") return { pts: 4, why: "Direct" };
  return { pts: 6 }; // unknown → neutral
}

function qualityPoints(i: ScoreInput): { pts: number; why?: string } {
  // Trust explicit lead_score (0..100) if present, scaled to 0..30
  if (typeof i.lead_score === "number" && i.lead_score >= 0) {
    return { pts: Math.round((clamp(i.lead_score) / 100) * 30), why: `Lead-Score ${i.lead_score}` };
  }
  const q = (i.lead_quality || "").toLowerCase();
  if (q === "high" || q === "hot")  return { pts: 28, why: "Quiz: high" };
  if (q === "mid"  || q === "warm") return { pts: 18, why: "Quiz: mid" };
  if (q === "low"  || q === "cold") return { pts: 6,  why: "Quiz: low" };
  return { pts: 12 };
}

function stagePoints(i: ScoreInput, seg: Segment): { pts: number; why?: string } {
  const stage = (i.stage || "").toLowerCase();
  // Further down funnel ⇒ higher reactivation value
  const map: Record<string, number> = {
    quiz: 4, quiz_completed: 8, qualified: 12,
    booked: 16, confirmed: 18,
    showed: 20, offer: 22, negotiation: 24, closed: 26,
  };
  let pts = map[stage] ?? 10;
  // Segment-specific tweaks
  if (seg === "no_show" && (stage === "booked" || stage === "confirmed")) pts += 4;
  if (seg === "closed_lost" && pts < 14) pts = 14; // still worth a reactivation try
  return { pts: clamp(pts, 0, 28), why: stage ? `Stage: ${stage}` : undefined };
}

function bookingHistoryPoints(i: ScoreInput, seg: Segment): { pts: number; why?: string } {
  let pts = 0;
  const why: string[] = [];
  if (i.has_booking) { pts += 8; why.push("hat gebucht"); }
  if (i.no_show_flag && seg === "no_show") { pts += 10; why.push("No-Show recover"); }
  // Touch fatigue: too many reminders without conversion → lower priority
  const n = i.reminder_count ?? 0;
  if (n >= 5) { pts -= 12; why.push("Touch-Fatigue"); }
  else if (n >= 3) { pts -= 6; }
  // Recency boost for no_booking: fresh leads convert better
  if (seg === "no_booking" && i.created_at) {
    const days = (Date.now() - new Date(i.created_at).getTime()) / 864e5;
    if (days < 3) { pts += 8; why.push("frisch <3d"); }
    else if (days < 14) { pts += 4; }
    else if (days > 60) { pts -= 6; }
  }
  // Won leads not for retargeting → flatten
  if (seg === "closed_won") pts = Math.min(pts, 5);
  return { pts, why: why.join(" · ") || undefined };
}

export function computeRetargetingScore(i: ScoreInput, seg: Segment): ScoreResult {
  if (i.do_not_contact) {
    return { score: 0, priority: "LOW", reasons: ["DNC / suppressed"] };
  }
  const a = attributionPoints(i);
  const q = qualityPoints(i);
  const s = stagePoints(i, seg);
  const b = bookingHistoryPoints(i, seg);
  const raw = a.pts + q.pts + s.pts + b.pts; // up to ~100
  const score = clamp(Math.round(raw));
  const priority: ScoreResult["priority"] = score >= 70 ? "HIGH" : score >= 40 ? "MED" : "LOW";
  const reasons = [a.why, q.why, s.why, b.why].filter(Boolean) as string[];
  return { score, priority, reasons };
}
