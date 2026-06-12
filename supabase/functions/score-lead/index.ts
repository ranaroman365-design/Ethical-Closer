import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * AI Lead Scoring Engine
 * 
 * Weighted scoring model:
 * - Commitment (30%): quiz commitment answers + speed of booking
 * - Segment (20%): Income/Identity segments score higher
 * - Quiz Clarity (15%): quiz_score directly
 * - Behavior (15%): contact_count, actions taken
 * - Response Speed (10%): time from creation to first_action
 * - Funnel Source (10%): source quality weighting
 */

interface ScoringFactors {
  commitment: number;
  segment: number;
  quizClarity: number;
  behavior: number;
  responseSpeed: number;
  funnelSource: number;
}

function calculateScore(lead: any, quizData: any): { score: number; quality: string; factors: ScoringFactors } {
  const factors: ScoringFactors = {
    commitment: 0,
    segment: 0,
    quizClarity: 0,
    behavior: 0,
    responseSpeed: 0,
    funnelSource: 0,
  };

  // 1. Commitment (0-100) → weight 30%
  const quizScore = lead.quiz_score ?? 0;
  const hasAppointment = !!lead.appointment_date;
  factors.commitment = Math.min(
    (quizScore * 0.6) + (hasAppointment ? 40 : 0),
    100
  );

  // 2. Segment (0-100) → weight 20%
  const segmentScores: Record<string, number> = {
    identity: 95,
    income: 85,
    lifestyle: 60,
    freedom: 50,
    skill: 40,
  };
  const quizResult = (lead.quiz_result || '').toLowerCase();
  factors.segment = segmentScores[quizResult] ?? 30;

  // 3. Quiz Clarity (0-100) → weight 15%
  factors.quizClarity = Math.min(quizScore, 100);

  // 4. Behavior (0-100) → weight 15%
  const contactCount = lead.contact_count ?? 0;
  const hasActions = !!lead.first_action_at;
  factors.behavior = Math.min(
    (contactCount * 15) + (hasActions ? 30 : 0),
    100
  );

  // 5. Response Speed (0-100) → weight 10%
  if (lead.first_action_at && lead.created_at) {
    const createdAt = new Date(lead.created_at).getTime();
    const firstAction = new Date(lead.first_action_at).getTime();
    const hoursToAct = (firstAction - createdAt) / (1000 * 60 * 60);
    if (hoursToAct <= 1) factors.responseSpeed = 100;
    else if (hoursToAct <= 6) factors.responseSpeed = 80;
    else if (hoursToAct <= 24) factors.responseSpeed = 60;
    else if (hoursToAct <= 72) factors.responseSpeed = 30;
    else factors.responseSpeed = 10;
  } else {
    factors.responseSpeed = 20;
  }

  // 6. Funnel Source (0-100) → weight 10%
  const sourceScores: Record<string, number> = {
    bewerbung: 90,
    referral: 85,
    quiz: 70,
    webinar: 65,
    organic: 50,
    paid: 45,
    manual: 40,
  };
  factors.funnelSource = sourceScores[lead.source] ?? 30;

  // Weighted total
  let score = Math.round(
    factors.commitment * 0.30 +
    factors.segment * 0.20 +
    factors.quizClarity * 0.15 +
    factors.behavior * 0.15 +
    factors.responseSpeed * 0.10 +
    factors.funnelSource * 0.10
  );

  // ── Anti-waste adjustments ──
  const noShowCount = lead.no_show_count ?? 0;
  const rescheduleCount = lead.reschedule_count ?? 0;
  score = Math.max(0, score - (noShowCount * 15) - (Math.max(0, rescheduleCount - 1) * 10));

  // Qualification score boost (from quiz)
  const qualScore = lead.qualification_score ?? 0;
  if (qualScore >= 21) score = Math.min(100, score + 10);

  // Quality classification
  const quality = score >= 80 ? 'A' : score >= 60 ? 'B' : 'C';

  return { score, quality, factors };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const body = await req.json().catch(() => ({}));
    const leadId = body.lead_id;
    const batchMode = body.batch === true;

    const results: { lead_id: string; score: number; quality: string }[] = [];

    if (leadId) {
      // Score single lead
      const { data: lead } = await supabase
        .from("leads")
        .select("*")
        .eq("id", leadId)
        .single();

      if (!lead) {
        return new Response(JSON.stringify({ error: "Lead not found" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { score, quality, factors } = calculateScore(lead, null);

      await supabase
        .from("leads")
        .update({ lead_score: score, lead_quality: quality, scored_at: new Date().toISOString() })
        .eq("id", leadId);

      results.push({ lead_id: leadId, score, quality });

    } else if (batchMode) {
      // Score all unscored or stale leads
      const { data: leads } = await supabase
        .from("leads")
        .select("*")
        .or("scored_at.is.null,scored_at.lt." + new Date(Date.now() - 24 * 3600000).toISOString())
        .not("stage", "in", "(closed_won,closed_lost,cancelled,converted_to_L1)")
        .order("created_at", { ascending: false })
        .limit(100);

      if (leads) {
        for (const lead of leads) {
          const { score, quality } = calculateScore(lead, null);

          await supabase
            .from("leads")
            .update({ lead_score: score, lead_quality: quality, scored_at: new Date().toISOString() })
            .eq("id", lead.id);

          results.push({ lead_id: lead.id, score, quality });
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        scored: results.length,
        results,
        distribution: {
          A: results.filter(r => r.quality === 'A').length,
          B: results.filter(r => r.quality === 'B').length,
          C: results.filter(r => r.quality === 'C').length,
        },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[score-lead] Error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
