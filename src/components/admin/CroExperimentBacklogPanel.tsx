/**
 * CroExperimentBacklogPanel — Phase 5 (display-only).
 * ----------------------------------------------------
 * Surfaces autonomous experiment proposals for human review.
 * Nothing here writes to the DB, registers an experiment, or modifies
 * any landing/funnel code. Approval = operator copies the proposal into
 * a migration + variant payload manually.
 */
import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Lightbulb, AlertTriangle, Copy } from "lucide-react";
import {
  CRO_EXPERIMENT_BACKLOG,
  lintBacklog,
  priorityOf,
  scoreProposal,
  type CroExperimentProposal,
  type CroPriority,
} from "@/lib/cro/experiment-backlog";

const RISK_TONE: Record<CroExperimentProposal["risk"], string> = {
  low: "bg-emerald-50 text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-200",
  medium: "bg-amber-50 text-amber-800 dark:bg-amber-950/30 dark:text-amber-200",
  high: "bg-red-50 text-red-800 dark:bg-red-950/30 dark:text-red-200",
};
const PRIO_TONE: Record<CroPriority, string> = {
  P0: "bg-primary text-primary-foreground",
  P1: "bg-secondary text-secondary-foreground",
  P2: "bg-muted text-muted-foreground",
};

export default function CroExperimentBacklogPanel() {
  const [filterPrio, setFilterPrio] = useState<CroPriority | "ALL">("ALL");
  const [approved, setApproved] = useState<Set<string>>(new Set());

  const ranked = useMemo(() => {
    return [...CRO_EXPERIMENT_BACKLOG]
      .map((p) => ({ p, score: scoreProposal(p), prio: priorityOf(p) }))
      .filter((r) => filterPrio === "ALL" || r.prio === filterPrio)
      .sort((a, b) => b.score - a.score);
  }, [filterPrio]);

  const lints = useMemo(() => lintBacklog(CRO_EXPERIMENT_BACKLOG), []);

  const toggleApproval = (id: string) =>
    setApproved((s) => {
      const next = new Set(s);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const copyProposal = async (p: CroExperimentProposal) => {
    const payload = {
      key: p.id,
      surface: p.surface,
      affected_files: p.affected_files,
      hypothesis: p.hypothesis,
      control: p.control,
      variants: p.variants,
    };
    try { await navigator.clipboard.writeText(JSON.stringify(payload, null, 2)); } catch { /* noop */ }
  };

  return (
    <Card className="p-6 space-y-5">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div className="flex items-start gap-2">
          <Lightbulb className="h-5 w-5 text-primary mt-0.5" />
          <div>
            <div className="font-medium">CRO Experiment Backlog — Vorschläge zur Freigabe</div>
            <div className="text-xs text-muted-foreground max-w-2xl">
              Auto-generierte Experiment-Ideen, sortiert nach
              <code className="mx-1">Traffic × Funnel-Position × Lift × Confidence ÷ Risk</code>.
              <b> Nichts wird automatisch gestartet</b> — Freigabe = manueller Migration-Eintrag mit Variant-Payload.
              Positionierung lockiert auf Trust · Control · Transparenz · Predictability · Risk-Reduction.
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {(["ALL", "P0", "P1", "P2"] as const).map((p) => (
            <Button
              key={p}
              size="sm"
              variant={filterPrio === p ? "default" : "outline"}
              onClick={() => setFilterPrio(p)}
            >
              {p}
            </Button>
          ))}
        </div>
      </div>

      {lints.length > 0 && (
        <div className="rounded-md border border-red-400/40 bg-red-50/40 dark:bg-red-950/20 p-3 text-xs text-red-900 dark:text-red-200 space-y-0.5">
          <div className="flex items-center gap-1.5 font-medium">
            <AlertTriangle className="h-3.5 w-3.5" /> Positionierungs-Lint
          </div>
          {lints.map((l, i) => <div key={i}>• {l}</div>)}
        </div>
      )}

      <div className="space-y-3">
        {ranked.map(({ p, score, prio }) => {
          const isApproved = approved.has(p.id);
          return (
            <div key={p.id} className="border border-border rounded-md p-3 space-y-2">
              <div className="flex items-start justify-between flex-wrap gap-2">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge className={`text-[10px] ${PRIO_TONE[prio]}`}>{prio}</Badge>
                    <Badge variant="outline" className="text-[10px]">{p.surface}</Badge>
                    <Badge variant="outline" className={`text-[10px] ${RISK_TONE[p.risk]}`}>
                      risk: {p.risk}
                    </Badge>
                    {p.themes.map((t) => (
                      <Badge key={t} variant="outline" className="text-[10px]">{t}</Badge>
                    ))}
                  </div>
                  <div className="font-medium text-sm">{p.hypothesis}</div>
                  <div className="text-[11px] text-muted-foreground">
                    Backlog-ID <code>{p.id}</code> · betroffen: {p.affected_files.join(", ")}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="outline" onClick={() => copyProposal(p)}>
                    <Copy className="h-3.5 w-3.5 mr-1" /> Payload
                  </Button>
                  <Button
                    size="sm"
                    variant={isApproved ? "default" : "outline"}
                    onClick={() => toggleApproval(p.id)}
                  >
                    {isApproved ? "✓ Für Migration markiert" : "Für Migration markieren"}
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-xs">
                <Metric label="Traffic-Anteil" value={`${(p.traffic_share * 100).toFixed(0)}%`} />
                <Metric label="Funnel-Pos." value={`${p.funnel_position}/5`} />
                <Metric label="Est. Lift" value={`+${p.est_lift_pct}%`} />
                <Metric label="Confidence" value={`${(p.confidence * 100).toFixed(0)}%`} />
                <Metric label="Score" value={score.toFixed(2)} bold />
              </div>

              <div className="rounded border border-border/60 bg-muted/30 p-2 text-xs space-y-1">
                <div><span className="text-muted-foreground">Control:</span> {p.control}</div>
                {p.variants.map((v, i) => (
                  <div key={i}>
                    <span className="text-muted-foreground">{v.label} ({v.theme}):</span> {v.copy}
                  </div>
                ))}
                {p.notes && (
                  <div className="text-[11px] text-amber-700 dark:text-amber-300 pt-1">
                    ⚠ {p.notes}
                  </div>
                )}
              </div>
            </div>
          );
        })}
        {ranked.length === 0 && (
          <div className="text-sm text-muted-foreground">Keine Vorschläge in diesem Filter.</div>
        )}
      </div>

      <div className="text-[11px] text-muted-foreground border-t border-border pt-3">
        Approval-Workflow: (1) <b>Payload kopieren</b> → (2) Migration anlegen
        (<code>ab_experiments</code> + <code>ab_variants</code>) → (3) Komponenten-Wiring via
        <code className="mx-1">useCopyVariant</code> → (4) PR-Review → (5) Merge.
        Auto-Launch ist bewusst <b>deaktiviert</b>.
      </div>
    </Card>
  );
}

function Metric({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div>
      <div className="text-muted-foreground">{label}</div>
      <div className={`font-mono ${bold ? "font-semibold" : ""}`}>{value}</div>
    </div>
  );
}
