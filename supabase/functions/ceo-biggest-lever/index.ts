import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id);
    const isAdmin = (roles ?? []).some((r: { role: string }) => r.role === "admin" || r.role === "owner");
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: "forbidden" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { snapshot } = await req.json();
    if (!snapshot) {
      return new Response(JSON.stringify({ error: "snapshot required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ===== Heuristic: identify biggest lever =====
    // Pull biggest_leak from bottleneck output, compute revenue impact.
    const bottleneck = snapshot.bottleneck ?? {};
    const revenue30d = Number(snapshot.revenue?.last_30d ?? 0);
    const biggestLeak: string | null = bottleneck.biggest_leak ?? null;

    // Map stage → current rate & threshold (from existing perf_bottleneck_detection contract)
    const stageMap: Record<string, { current: number; threshold: number; label: string }> = {
      booking: { current: Number(bottleneck.booking_rate ?? 0), threshold: 15, label: "Booking Rate" },
      show:    { current: Number(bottleneck.show_rate ?? 0),    threshold: 60, label: "Show Rate" },
      closing: { current: Number(bottleneck.closing_rate ?? 0), threshold: 20, label: "Close Rate" },
    };

    let heuristic: { stage: string; lift_pct: number; revenue_impact: number; current: number; target: number; label: string } | null = null;
    if (biggestLeak && stageMap[biggestLeak]) {
      const s = stageMap[biggestLeak];
      const liftPct = s.threshold - s.current;
      // Revenue impact ≈ revenue30d * (target/current - 1), capped
      const ratio = s.current > 0 ? (s.threshold / s.current) - 1 : 0.5;
      heuristic = {
        stage: biggestLeak,
        label: s.label,
        current: s.current,
        target: s.threshold,
        lift_pct: Math.round(liftPct * 10) / 10,
        revenue_impact: Math.round(revenue30d * Math.max(0, Math.min(ratio, 1.5))),
      };
    }

    // ===== AI narrative =====
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    let narrative = "";
    if (LOVABLE_API_KEY && heuristic) {
      const prompt = `You are a sales operations advisor. Output ONE concise sentence (max 28 words) telling the CEO the single highest-leverage action right now. Be direct, no fluff, no hedging.

Context:
- Weakest funnel stage: ${heuristic.label} at ${heuristic.current}% (target ${heuristic.target}%)
- Revenue last 30d: €${Math.round(revenue30d)}
- Estimated revenue lift if fixed: €${heuristic.revenue_impact}
- MoM growth: ${snapshot.revenue?.mom_growth_pct ?? 0}%
- Open pipeline: ${snapshot.forecast?.open_appointments ?? 0} appointments

Return ONLY the sentence.`;

      try {
        const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${LOVABLE_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "google/gemini-3-flash-preview",
            messages: [{ role: "user", content: prompt }],
          }),
        });
        if (aiResp.ok) {
          const j = await aiResp.json();
          narrative = j?.choices?.[0]?.message?.content?.trim() ?? "";
        } else if (aiResp.status === 429) {
          narrative = "AI rate-limited — retry shortly.";
        } else if (aiResp.status === 402) {
          narrative = "AI credits exhausted — top up workspace usage.";
        }
      } catch (e) {
        console.error("AI gateway error", e);
      }
    }

    if (!narrative && heuristic) {
      narrative = `Fix ${heuristic.label}: lift from ${heuristic.current}% to ${heuristic.target}% to unlock ~€${heuristic.revenue_impact}.`;
    } else if (!narrative) {
      narrative = "All funnel stages above threshold — focus on volume, not conversion.";
    }

    return new Response(JSON.stringify({ heuristic, narrative }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("ceo-biggest-lever error", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "unknown" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
