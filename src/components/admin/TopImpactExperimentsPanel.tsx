/**
 * Top Impact Experiments Panel — Part 6.
 *
 * Read-only summary of the strongest active variant per funnel stage:
 *   • LP → Quiz Start
 *   • Quiz Completion
 *   • Lead
 *   • Booking
 *
 * Reads the existing `ab_slot_weights` cache (populated by `useAbWeights`)
 * and the registered MOS CRO slots. Does NOT modify Winner Engine logic
 * or recompute weights — purely a viewer.
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { MOS_CRO_SLOTS } from "@/lib/mos-cro-slots";

interface SlotWeightRow {
  slot: string;
  variant: string;
  weight: number | null;
  stage?: string | null;
}

const STAGE_LABELS: Record<string, string> = {
  lp_to_quiz: "LP → Quiz Start",
  quiz_completion: "Quiz Completion",
  lead: "Lead",
  booking: "Booking",
};

// Map each slot to the funnel stage it primarily influences.
const SLOT_STAGE_MAP: Record<string, keyof typeof STAGE_LABELS> = {
  mos_lp_first_win: "lp_to_quiz",
  mos_lp_micro_trust: "lp_to_quiz",
  mos_lp_risk_reducer: "lp_to_quiz",
  mos_lp_cta_style: "lp_to_quiz",
  mos_lp_sticky_cta: "lp_to_quiz",
  mos_quiz_entry_mode: "quiz_completion",
  mos_q1_visual: "quiz_completion",
  mos_progress_system: "quiz_completion",
  mos_completion_booster: "quiz_completion",
  mos_lead_commitment_line: "lead",
};

interface TopRow {
  stage: string;
  slot: string;
  variant: string;
  weight: number;
}

export function TopImpactExperimentsPanel() {
  const [rows, setRows] = useState<TopRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const slotNames = MOS_CRO_SLOTS.map((s) => s.slot);
        const { data } = await supabase
          .from("ab_slot_weights" as never)
          .select("slot,variant,weight")
          .in("slot", slotNames as never);
        if (cancelled) return;
        const byStage = new Map<string, TopRow>();
        for (const row of (data as SlotWeightRow[] | null) ?? []) {
          const stageKey = SLOT_STAGE_MAP[row.slot];
          if (!stageKey) continue;
          const w = typeof row.weight === "number" ? row.weight : 0;
          const current = byStage.get(stageKey);
          if (!current || w > current.weight) {
            byStage.set(stageKey, {
              stage: stageKey,
              slot: row.slot,
              variant: row.variant,
              weight: w,
            });
          }
        }
        setRows(Array.from(byStage.values()));
      } catch {
        /* swallow */
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section className="rounded-md border border-border bg-card p-5">
      <header className="mb-4 flex items-baseline justify-between gap-3">
        <h2 className="font-serif text-lg font-medium text-foreground">
          Top Impact Experiments
        </h2>
        <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
          Read-only · Winner Engine unchanged
        </span>
      </header>
      {loading ? (
        <p className="text-xs text-muted-foreground">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          Noch keine Gewinner — Slots sind frisch registriert.
        </p>
      ) : (
        <ul className="divide-y divide-border/40">
          {(["lp_to_quiz", "quiz_completion", "lead", "booking"] as const).map(
            (stage) => {
              const row = rows.find((r) => r.stage === stage);
              return (
                <li
                  key={stage}
                  className="flex items-center justify-between gap-4 py-3 text-sm"
                >
                  <span className="text-muted-foreground">
                    {STAGE_LABELS[stage]}
                  </span>
                  {row ? (
                    <span className="font-mono text-xs text-foreground">
                      {row.slot} · <strong>{row.variant}</strong> ·{" "}
                      {(row.weight * 100).toFixed(0)}%
                    </span>
                  ) : (
                    <span className="font-mono text-xs text-muted-foreground/70">
                      — kein Signal
                    </span>
                  )}
                </li>
              );
            },
          )}
        </ul>
      )}
      <footer className="mt-4 text-[10px] uppercase tracking-widest text-muted-foreground/70">
        Slots registered: {MOS_CRO_SLOTS.length}
      </footer>
    </section>
  );
}

export default TopImpactExperimentsPanel;
