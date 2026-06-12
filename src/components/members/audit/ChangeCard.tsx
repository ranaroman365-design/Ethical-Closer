import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, ChevronRight, RotateCcw, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { DiffView } from "./DiffView";

export interface ChangeCardData {
  change_id: string;
  changed_by_kind: string;
  changed_by?: string | null;
  change_type: string;
  scope_type: string;
  scope_id: string | null;
  module: string;
  reason: string;
  reversible: boolean;
  risk_level: string | null;
  rollback_reference_id: string | null;
  created_at: string;
  previous_state?: unknown;
  new_state?: unknown;
  before_metric?: Record<string, unknown> | null;
  after_metric?: Record<string, unknown> | null;
  expected_impact?: string | null;
  rule_triggered?: string | null;
  sample_size?: number | null;
}

interface Props {
  change: ChangeCardData;
  onRollback?: (changeId: string, reason: string) => Promise<void> | void;
  canRollback?: boolean;
  busy?: boolean;
}

function pickMetric(m: Record<string, unknown> | null | undefined): { label: string; value: number } | null {
  if (!m) return null;
  const preferred = ["conversion", "conversion_rate", "reply_rate", "show_rate", "close_rate", "bookings", "revenue", "value"];
  for (const k of preferred) {
    if (typeof m[k] === "number") return { label: k.replace(/_/g, " "), value: m[k] as number };
  }
  const first = Object.entries(m).find(([, v]) => typeof v === "number");
  return first ? { label: first[0].replace(/_/g, " "), value: first[1] as number } : null;
}

function isPercentLike(label: string) {
  return /rate|conversion|show|close|reply|ctr/i.test(label);
}

function formatValue(label: string, v: number) {
  return isPercentLike(label) ? `${v.toFixed(1)}%` : v.toLocaleString();
}

export function ChangeCard({ change, onRollback, canRollback = false, busy = false }: Props) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");

  const before = useMemo(() => pickMetric(change.before_metric), [change.before_metric]);
  const after = useMemo(() => pickMetric(change.after_metric), [change.after_metric]);

  const delta = useMemo(() => {
    if (!before || !after || before.label !== after.label) return null;
    const diff = after.value - before.value;
    const pct = before.value === 0 ? null : (diff / Math.abs(before.value)) * 100;
    return { diff, pct };
  }, [before, after]);

  const trendIcon =
    delta && delta.diff > 0 ? <TrendingUp className="h-4 w-4" /> :
    delta && delta.diff < 0 ? <TrendingDown className="h-4 w-4" /> :
    <Minus className="h-4 w-4" />;

  const trendClass =
    delta && delta.diff > 0 ? "text-emerald-600 dark:text-emerald-400" :
    delta && delta.diff < 0 ? "text-rose-600 dark:text-rose-400" :
    "text-muted-foreground";

  const isRollback = !!change.rollback_reference_id;

  return (
    <div className="border border-border rounded-2xl bg-card hover:shadow-sm transition-shadow">
      <Collapsible open={open} onOpenChange={setOpen}>
        <div className="p-4 space-y-3">
          {/* Header row */}
          <div className="flex items-start gap-3 flex-wrap">
            <div className="flex items-center gap-2 flex-wrap flex-1 min-w-0">
              <Badge variant="outline" className="font-mono text-[10px]">
                #{change.change_id.slice(0, 8)}
              </Badge>
              <Badge variant="outline" className="text-xs">{change.module.replace(/_/g, " ")}</Badge>
              <Badge className="text-xs">{change.change_type}</Badge>
              <Badge variant="secondary" className="text-xs">{change.changed_by_kind}</Badge>
              {change.risk_level && (
                <Badge
                  variant="outline"
                  className={`text-xs ${
                    change.risk_level === "high" ? "border-rose-500 text-rose-600" :
                    change.risk_level === "medium" ? "border-amber-500 text-amber-600" : ""
                  }`}
                >
                  risk: {change.risk_level}
                </Badge>
              )}
              {isRollback && <Badge variant="outline" className="text-xs">↶ rollback</Badge>}
              {!change.reversible && <Badge variant="destructive" className="text-xs">non-reversible</Badge>}
            </div>
            <span className="text-xs text-muted-foreground whitespace-nowrap">
              {new Date(change.created_at).toLocaleString()}
            </span>
          </div>

          {/* Reason */}
          <p className="text-sm text-foreground leading-relaxed">{change.reason}</p>

          {/* Impact strip */}
          {(before || after || change.expected_impact) && (
            <div className="flex items-center gap-4 flex-wrap rounded-xl bg-muted/40 px-3 py-2">
              {before && (
                <div className="text-xs">
                  <div className="text-muted-foreground">Before</div>
                  <div className="font-medium">{formatValue(before.label, before.value)}</div>
                </div>
              )}
              {after && (
                <div className="text-xs">
                  <div className="text-muted-foreground">After</div>
                  <div className="font-medium">{formatValue(after.label, after.value)}</div>
                </div>
              )}
              {delta && (
                <div className={`flex items-center gap-1 text-xs font-medium ${trendClass}`}>
                  {trendIcon}
                  {delta.diff > 0 ? "+" : ""}
                  {isPercentLike(before?.label ?? "") ? `${delta.diff.toFixed(1)}pp` : delta.diff.toLocaleString()}
                  {delta.pct !== null && (
                    <span className="opacity-80">({delta.pct > 0 ? "+" : ""}{delta.pct.toFixed(1)}%)</span>
                  )}
                </div>
              )}
              {change.expected_impact && !delta && (
                <div className="text-xs text-muted-foreground italic">
                  Expected: {change.expected_impact}
                </div>
              )}
              {change.sample_size != null && (
                <div className="text-xs text-muted-foreground ml-auto">n = {change.sample_size}</div>
              )}
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center gap-2">
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="gap-1">
                {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                {open ? "Hide details" : "View details"}
              </Button>
            </CollapsibleTrigger>
            <span className="text-xs text-muted-foreground ml-auto">
              {change.scope_type}{change.scope_id ? `:${change.scope_id.slice(0, 8)}` : ""}
            </span>
          </div>

          <CollapsibleContent className="space-y-3 pt-2">
            <DiffView before={change.previous_state} after={change.new_state} />

            {(change.rule_triggered || change.changed_by) && (
              <div className="text-xs text-muted-foreground space-y-1">
                {change.rule_triggered && <div>Rule: <span className="font-mono">{change.rule_triggered}</span></div>}
                {change.changed_by && <div>By: <span className="font-mono">{change.changed_by}</span></div>}
                <div>Full ID: <span className="font-mono">{change.change_id}</span></div>
              </div>
            )}

            {canRollback && change.reversible && !isRollback && onRollback && (
              <div className="flex gap-2 items-end pt-2 border-t border-border">
                <div className="flex-1">
                  <Label className="text-xs">Rollback reason</Label>
                  <Input
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="Why revert this change?"
                    className="h-9"
                  />
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy || !reason.trim()}
                  onClick={async () => {
                    await onRollback(change.change_id, reason.trim());
                    setReason("");
                  }}
                >
                  <RotateCcw className="h-3.5 w-3.5 mr-1" />
                  Rollback
                </Button>
              </div>
            )}
          </CollapsibleContent>
        </div>
      </Collapsible>
    </div>
  );
}
