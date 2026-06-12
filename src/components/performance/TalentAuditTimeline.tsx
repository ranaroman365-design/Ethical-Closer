/**
 * Talent Audit Timeline — Chronological log of all Talent Flow changes.
 * Shows score computations, flag changes, action updates, and diagnostic shifts.
 *
 * Canon: Layer 47 · Talent Engine · Visualization
 */
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Loader2, Search, Clock, Flag, CheckCircle2, AlertTriangle,
  Activity, TrendingUp, RefreshCw, Filter,
} from "lucide-react";
import { useLanguage } from "@/i18n/LanguageContext";

const T = {
  ink: "#1A1A1A", muted: "#9A9590", gold: "#C6A96B",
  danger: "#B04A3A", success: "#7A9E7E", border: "#E8E2D9",
} as const;

interface AuditEntry {
  id: string;
  user_id: string;
  event_type: string;
  event_key: string | null;
  old_value: Record<string, any> | null;
  new_value: Record<string, any> | null;
  triggered_by: string | null;
  note: string | null;
  created_at: string;
  full_name?: string;
}

const EVENT_META: Record<string, { icon: typeof Flag; color: string; de: string; en: string }> = {
  score_computed:     { icon: TrendingUp,    color: T.gold,    de: "Score berechnet",    en: "Score computed" },
  flag_created:       { icon: AlertTriangle, color: T.danger,  de: "Flag erstellt",      en: "Flag created" },
  flag_resolved:      { icon: CheckCircle2,  color: T.success, de: "Flag gelöst",        en: "Flag resolved" },
  action_created:     { icon: Activity,      color: T.gold,    de: "Aktion erstellt",    en: "Action created" },
  action_updated:     { icon: Activity,      color: T.muted,   de: "Aktion aktualisiert",en: "Action updated" },
  action_resolved:    { icon: CheckCircle2,  color: T.success, de: "Aktion abgeschlossen",en: "Action resolved" },
  diagnostic_changed: { icon: Flag,          color: T.gold,    de: "Diagnose geändert",  en: "Diagnostic changed" },
};

const fmtDT = (d: string) => new Date(d).toLocaleString("de-DE", {
  day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit",
});

function jsonSummary(obj: Record<string, any> | null): string {
  if (!obj) return "—";
  return Object.entries(obj)
    .filter(([, v]) => v != null)
    .map(([k, v]) => `${k}: ${typeof v === "number" ? v.toFixed?.(1) ?? v : v}`)
    .join(" · ");
}

export default function TalentAuditTimeline({ userId }: { userId?: string }) {
  const { lang } = useLanguage();
  const t = (de: string, en: string) => lang === "de" ? de : en;

  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [limit, setLimit] = useState(50);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      let q = supabase
        .from("talent_audit_log" as any)
        .select("*")
        .order("created_at", { ascending: false })
        .limit(limit);

      if (userId) q = q.eq("user_id", userId);
      if (typeFilter !== "all") q = q.eq("event_type", typeFilter);

      const { data, error } = await q;
      if (error) throw error;

      // Enrich with profile names
      const ids = [...new Set((data || []).map((e: any) => e.user_id))];
      let nameMap: Record<string, string> = {};
      if (ids.length > 0) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, full_name")
          .in("id", ids);
        if (profiles) {
          nameMap = Object.fromEntries(profiles.map((p: any) => [p.id, p.full_name || p.id.slice(0, 8)]));
        }
      }

      setEntries(
        (data || []).map((e: any) => ({ ...e, full_name: nameMap[e.user_id] || e.user_id?.slice(0, 8) }))
      );
    } catch (e) {
      console.error("[TalentAuditTimeline] load failed", e);
    } finally {
      setLoading(false);
    }
  }, [userId, typeFilter, limit]);

  useEffect(() => { load(); }, [load]);

  const filtered = search
    ? entries.filter((e) => {
        const s = search.toLowerCase();
        return (
          e.full_name?.toLowerCase().includes(s) ||
          e.event_type.includes(s) ||
          e.event_key?.toLowerCase().includes(s) ||
          e.note?.toLowerCase().includes(s)
        );
      })
    : entries;

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder={t("Suchen…", "Search…")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-8 text-xs"
          />
        </div>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-[160px] h-8 text-xs">
            <Filter className="h-3 w-3 mr-1" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("Alle Typen", "All types")}</SelectItem>
            {Object.entries(EVENT_META).map(([key, meta]) => (
              <SelectItem key={key} value={key}>
                {lang === "de" ? meta.de : meta.en}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" className="h-8 text-xs gap-1" onClick={load} disabled={loading}>
          <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
          {t("Aktualisieren", "Refresh")}
        </Button>
      </div>

      <div className="text-[10px] text-muted-foreground">
        {loading ? t("Lade…", "Loading…") : `${filtered.length} ${t("Einträge", "entries")}`}
      </div>

      {/* Timeline */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      )}

      {!loading && filtered.length === 0 && (
        <div className="text-center py-12 text-sm text-muted-foreground">
          {t("Keine Audit-Einträge gefunden.", "No audit entries found.")}
        </div>
      )}

      {!loading && filtered.length > 0 && (
        <div className="relative border-l-2 ml-3 space-y-0" style={{ borderColor: T.border }}>
          {filtered.map((entry) => {
            const meta = EVENT_META[entry.event_type] || EVENT_META.diagnostic_changed;
            const Icon = meta.icon;

            return (
              <div key={entry.id} className="relative pl-6 pb-4 group">
                {/* Dot */}
                <div
                  className="absolute -left-[9px] top-1 h-4 w-4 rounded-full border-2 bg-background flex items-center justify-center"
                  style={{ borderColor: meta.color }}
                >
                  <Icon size={9} style={{ color: meta.color }} />
                </div>

                {/* Content */}
                <div className="rounded-xl border bg-card p-3 hover:shadow-sm transition-shadow">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-semibold" style={{ color: T.ink }}>
                      {entry.full_name}
                    </span>
                    <Badge variant="outline" className="text-[9px] font-normal" style={{ borderColor: meta.color, color: meta.color }}>
                      {lang === "de" ? meta.de : meta.en}
                    </Badge>
                    {entry.event_key && (
                      <span className="text-[10px] text-muted-foreground font-mono">{entry.event_key}</span>
                    )}
                    <span className="ml-auto text-[10px] text-muted-foreground flex items-center gap-1">
                      <Clock size={10} /> {fmtDT(entry.created_at)}
                    </span>
                  </div>

                  {/* Details */}
                  <div className="mt-1.5 space-y-0.5">
                    {entry.note && (
                      <div className="text-xs" style={{ color: T.ink }}>{entry.note}</div>
                    )}
                    {entry.old_value && Object.keys(entry.old_value).length > 0 && (
                      <div className="text-[10px] text-muted-foreground">
                        <span className="font-medium">{t("Vorher", "Before")}:</span> {jsonSummary(entry.old_value)}
                      </div>
                    )}
                    {entry.new_value && Object.keys(entry.new_value).length > 0 && (
                      <div className="text-[10px]" style={{ color: T.ink }}>
                        <span className="font-medium">{t("Nachher", "After")}:</span> {jsonSummary(entry.new_value)}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Load more */}
      {!loading && filtered.length >= limit && (
        <div className="text-center">
          <Button
            variant="outline"
            size="sm"
            className="text-xs"
            onClick={() => setLimit((l) => l + 50)}
          >
            {t("Mehr laden", "Load more")}
          </Button>
        </div>
      )}
    </div>
  );
}
