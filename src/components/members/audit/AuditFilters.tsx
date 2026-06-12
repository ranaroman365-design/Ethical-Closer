import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Search, X } from "lucide-react";
import { AUDIT_MODULES, CHANGE_TYPES, ACTOR_KINDS, RISK_LEVELS } from "@/lib/canonical-audit-versioning";

export interface AuditFilterState {
  search: string;
  module: string;
  changeType: string;
  actorKind: string;
  risk: string;
  scopeId: string;
  impact: "all" | "positive" | "negative";
}

export const DEFAULT_FILTERS: AuditFilterState = {
  search: "",
  module: "all",
  changeType: "all",
  actorKind: "all",
  risk: "all",
  scopeId: "",
  impact: "all",
};

interface Props {
  value: AuditFilterState;
  onChange: (next: AuditFilterState) => void;
  resultCount: number;
}

export function AuditFilters({ value, onChange, resultCount }: Props) {
  const set = <K extends keyof AuditFilterState>(k: K, v: AuditFilterState[K]) =>
    onChange({ ...value, [k]: v });

  const isDirty = JSON.stringify(value) !== JSON.stringify(DEFAULT_FILTERS);

  return (
    <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={value.search}
            onChange={(e) => set("search", e.target.value)}
            placeholder="Search reason, rule, ID…"
            className="pl-9 h-9"
          />
        </div>
        <span className="text-xs text-muted-foreground whitespace-nowrap">
          {resultCount} {resultCount === 1 ? "change" : "changes"}
        </span>
        {isDirty && (
          <Button variant="ghost" size="sm" onClick={() => onChange(DEFAULT_FILTERS)} className="gap-1">
            <X className="h-3.5 w-3.5" /> Reset
          </Button>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <FilterSelect
          label="Module"
          value={value.module}
          onChange={(v) => set("module", v)}
          options={[{ v: "all", l: "All" }, ...AUDIT_MODULES.map((m) => ({ v: m, l: m.replace(/_/g, " ") }))]}
        />
        <FilterSelect
          label="Change type"
          value={value.changeType}
          onChange={(v) => set("changeType", v)}
          options={[{ v: "all", l: "All" }, ...CHANGE_TYPES.map((c) => ({ v: c, l: c }))]}
        />
        <FilterSelect
          label="Actor"
          value={value.actorKind}
          onChange={(v) => set("actorKind", v)}
          options={[{ v: "all", l: "All" }, ...ACTOR_KINDS.map((c) => ({ v: c, l: c }))]}
        />
        <FilterSelect
          label="Risk"
          value={value.risk}
          onChange={(v) => set("risk", v)}
          options={[{ v: "all", l: "All" }, ...RISK_LEVELS.map((c) => ({ v: c, l: c }))]}
        />
        <FilterSelect
          label="Impact"
          value={value.impact}
          onChange={(v) => set("impact", v as AuditFilterState["impact"])}
          options={[
            { v: "all", l: "All" },
            { v: "positive", l: "Positive only" },
            { v: "negative", l: "Negative only" },
          ]}
        />
        <div className="space-y-1">
          <Label className="text-xs">Scope ID</Label>
          <Input
            value={value.scopeId}
            onChange={(e) => set("scopeId", e.target.value)}
            placeholder="funnel / operator id"
            className="h-9"
          />
        </div>
      </div>
    </div>
  );
}

function FilterSelect({
  label, value, onChange, options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { v: string; l: string }[];
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
        <SelectContent>
          {options.map((o) => <SelectItem key={o.v} value={o.v}>{o.l}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}
