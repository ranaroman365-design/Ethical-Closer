/**
 * Stage Leads Drilldown — Lead-level table for each Cash Conversion Chain stage.
 * Replaces old aggregate-only StageDrilldown with full lead inspection.
 *
 * Canon: Layer 47 · Revenue Engine · Visualization
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Loader2, Search, ArrowUpDown, ChevronLeft, Phone, Mail, Calendar,
  User, TrendingDown, TrendingUp, Clock, MessageSquare, ArrowRight,
  CheckCircle2, XCircle, AlertTriangle, Eye,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/i18n/LanguageContext";
import LeadDetailPanel from "./LeadDetailPanel";
import { WhatsAppButton } from "@/components/leads/WhatsAppButton";

// ─── Types ──────────────────────────────────────────
export interface StageMetricSummary {
  label: string;
  volume: number;
  conversionToNext: number | null;
  dropToNext: number | null;
  weakness: "good" | "medium" | "weak";
  problem: string;
}

interface StageLead {
  lead_id: string;
  name: string;
  email: string | null;
  phone: string | null;
  source: string | null;
  funnel_id: string | null;
  current_stage: string | null;
  created_at: string;
  lead_score: number | null;
  quiz_status: string | null;
  has_booking: boolean;
  appointment_at: string | null;
  setter_id: string | null;
  setter_name: string | null;
  closer_id: string | null;
  closer_name: string | null;
  attendance_status: string | null;
  call_outcome: string | null;
  revenue_status: string | null;
  deal_value: number | null;
  payment_status: string | null;
  heat: string | null;
  /** Optional opt-in flag if RPC surfaces it. When explicitly false, WhatsApp action is hidden. */
  whatsapp_opt_in?: boolean | null;
}

type SortKey = "created_at" | "appointment_at" | "deal_value" | "name";

// ─── Design Tokens ──────────────────────────────────
const T = {
  bg: "#F8F5F0", card: "#FFFFFF", border: "#E8E2D9", ink: "#1A1A1A",
  secondary: "#6A6A6A", muted: "#9A9590", gold: "#C6A96B",
  danger: "#B04A3A", success: "#7A9E7E",
} as const;

const fmtDate = (d: string | null) => d ? new Date(d).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "2-digit" }) : "—";
const fmtDateTime = (d: string | null) => d ? new Date(d).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—";

function HeatDot({ heat }: { heat: string | null }) {
  // Canonical heat colors — no inline classification
  const color = heat === "hot" ? T.danger : heat === "warm" ? T.gold : T.muted;
  return <span className="inline-block w-2 h-2 rounded-full" style={{ background: color }} />;
}

function StatusBadge({ status, label }: { status: string | null; label?: string }) {
  if (!status) return null;
  const styles: Record<string, string> = {
    showed: "bg-emerald-100 text-emerald-800",
    no_show: "bg-red-100 text-red-800",
    pending: "bg-amber-100 text-amber-800",
    closed: "bg-emerald-100 text-emerald-800",
    lost: "bg-red-100 text-red-800",
    paid: "bg-emerald-100 text-emerald-800",
    won: "bg-emerald-100 text-emerald-800",
    completed: "bg-blue-100 text-blue-800",
  };
  return (
    <span className={cn("px-1.5 py-0.5 rounded text-[10px] font-medium", styles[status] || "bg-muted/30 text-muted-foreground")}>
      {label || status}
    </span>
  );
}

// ─── Main Component ──────────────────────────────────
export default function StageLeadsDrilldown({
  open,
  onClose,
  stageKey,
  metric,
  windowDays,
  funnel,
  source,
  operatorId,
  levelFilter,
  userId,
}: {
  open: boolean;
  onClose: () => void;
  stageKey: string;
  metric: StageMetricSummary;
  windowDays: number;
  funnel?: string | null;
  source?: string | null;
  operatorId?: string | null;
  levelFilter?: number | null;
  userId?: string | null;
}) {
  const { lang } = useLanguage();
  const t = (de: string, en: string) => lang === "de" ? de : en;

  const PAGE_SIZE = 50;
  const [loading, setLoading] = useState(false);
  const [leads, setLeads] = useState<(StageLead & { total_count?: number })[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(0);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [sortBy, setSortBy] = useState<SortKey>("created_at");
  const [sortAsc, setSortAsc] = useState(false);
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);

  // Debounced search — 250ms delay
  const handleSearchChange = useCallback((value: string) => {
    setSearchInput(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setSearch(value), 250);
  }, []);

  useEffect(() => () => { if (debounceRef.current) clearTimeout(debounceRef.current); }, []);

  // Reset page when filters change
  useEffect(() => { setPage(0); }, [stageKey, funnel, source, operatorId, levelFilter, userId]);

  const load = useCallback(async () => {
    if (!open || !stageKey) return;
    setLoading(true);
    try {
      const args: Record<string, any> = {
        p_stage_key: stageKey,
        p_time_range: windowDays,
        p_limit: PAGE_SIZE,
        p_offset: page * PAGE_SIZE,
      };
      if (funnel && funnel !== "all" && funnel !== "__all") args.p_funnel = funnel;
      if (source && source !== "all" && source !== "__all") args.p_source = source;
      if (operatorId && operatorId !== "__all") args.p_operator_id = operatorId;
      if (levelFilter !== null && levelFilter !== undefined) args.p_level_filter = levelFilter;
      if (userId) args.p_user_id = userId;

      const { data, error } = await supabase.rpc("get_performance_stage_leads" as any, args);
      if (error) throw error;
      const rows = (data as unknown as (StageLead & { total_count?: number })[]) || [];
      setTotalCount(rows.length > 0 ? Number(rows[0].total_count ?? rows.length) : 0);
      setLeads(rows);
    } catch (e) {
      console.error("[StageLeadsDrilldown] load failed", e);
    } finally {
      setLoading(false);
    }
  }, [open, stageKey, windowDays, funnel, source, operatorId, levelFilter, userId, page]);

  useEffect(() => { load(); }, [load]);

  // Filter + Sort
  const filtered = useMemo(() => {
    let result = [...leads];
    if (search) {
      const s = search.toLowerCase();
      result = result.filter(l =>
        l.name?.toLowerCase().includes(s) ||
        l.email?.toLowerCase().includes(s) ||
        l.phone?.includes(s)
      );
    }
    result.sort((a, b) => {
      let av: any, bv: any;
      switch (sortBy) {
        case "name": av = a.name?.toLowerCase() || ""; bv = b.name?.toLowerCase() || ""; break;
        case "appointment_at": av = a.appointment_at || ""; bv = b.appointment_at || ""; break;
        case "deal_value": av = a.deal_value || 0; bv = b.deal_value || 0; break;
        default: av = a.created_at || ""; bv = b.created_at || "";
      }
      if (av < bv) return sortAsc ? -1 : 1;
      if (av > bv) return sortAsc ? 1 : -1;
      return 0;
    });
    return result;
  }, [leads, search, sortBy, sortAsc]);

  const toggleSort = (key: SortKey) => {
    if (sortBy === key) setSortAsc(!sortAsc);
    else { setSortBy(key); setSortAsc(false); }
  };

  // Lead detail panel
  if (selectedLeadId) {
    return (
      <Sheet open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
        <SheetContent className="w-full sm:max-w-2xl overflow-y-auto p-0">
          <div className="sticky top-0 z-10 bg-background border-b px-4 py-3 flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => setSelectedLeadId(null)} className="gap-1.5">
              <ChevronLeft size={14} /> {t("Zurück", "Back")}
            </Button>
            <span className="text-sm font-medium text-muted-foreground">{metric.label}</span>
          </div>
          <div className="p-4">
            <LeadDetailPanel leadId={selectedLeadId} />
          </div>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent className="w-full sm:max-w-2xl overflow-y-auto p-0">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-background border-b px-4 py-4 space-y-3">
          <SheetHeader className="p-0">
            <SheetTitle className="font-serif text-lg flex items-center gap-2">
              {metric.label}
              <Badge className={cn(
                "text-[10px]",
                metric.weakness === "weak" && "bg-destructive text-destructive-foreground",
                metric.weakness === "medium" && "bg-amber-500/15 text-amber-700",
                metric.weakness === "good" && "bg-emerald-100 text-emerald-800",
              )}>
                {metric.weakness}
              </Badge>
            </SheetTitle>
          </SheetHeader>

          {/* Stage Summary KPIs */}
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-lg border p-2.5 text-center">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Volume (Server)</div>
              <div className="text-base font-serif mt-0.5 tabular-nums">{totalCount}</div>
            </div>
            <div className="rounded-lg border p-2.5 text-center">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Conversion</div>
              <div className="text-base font-serif mt-0.5 tabular-nums">
                {metric.conversionToNext !== null ? `${metric.conversionToNext.toFixed(1)}%` : "—"}
              </div>
            </div>
            <div className="rounded-lg border p-2.5 text-center">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Drop-Off</div>
              <div className="text-base font-serif mt-0.5 tabular-nums" style={{ color: (metric.dropToNext ?? 0) > 40 ? T.danger : T.ink }}>
                {metric.dropToNext !== null ? `${metric.dropToNext.toFixed(1)}%` : "—"}
              </div>
            </div>
          </div>

          {metric.weakness !== "good" && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-2.5 text-xs flex items-start gap-2">
              <TrendingDown className="h-3.5 w-3.5 text-destructive mt-0.5 shrink-0" />
              <div>{metric.problem}</div>
            </div>
          )}

          {/* Search + Sort */}
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder={t("Lead suchen…", "Search lead…")}
                value={searchInput}
                onChange={(e) => handleSearchChange(e.target.value)}
                className="pl-8 h-8 text-xs"
              />
            </div>
            <Select value={sortBy} onValueChange={(v) => { setSortBy(v as SortKey); setSortAsc(false); }}>
              <SelectTrigger className="w-[120px] h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="created_at">{t("Erstellt", "Created")}</SelectItem>
                <SelectItem value="appointment_at">{t("Termin", "Appointment")}</SelectItem>
                <SelectItem value="deal_value">{t("Umsatz", "Revenue")}</SelectItem>
                <SelectItem value="name">{t("Name", "Name")}</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setSortAsc(!sortAsc)}>
              <ArrowUpDown size={14} />
            </Button>
          </div>

          <div className="text-[10px] text-muted-foreground tabular-nums">
            {loading
              ? t("Lade…", "Loading…")
              : search
                ? `${filtered.length} / ${leads.length} ${t("Leads", "Leads")}`
                : `${leads.length} ${t("Leads", "Leads")}`}
          </div>
        </div>

        {/* Lead List */}
        <div className="px-4 py-2 space-y-1.5">
          {loading && (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          )}

          {!loading && filtered.length === 0 && (
            <div className="text-center py-16 text-sm text-muted-foreground">
              {t("Keine Leads in dieser Stage.", "No leads in this stage.")}
            </div>
          )}

          {!loading && filtered.map((lead) => (
            <div
              key={lead.lead_id}
              role="button"
              tabIndex={0}
              onClick={() => setSelectedLeadId(lead.lead_id)}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSelectedLeadId(lead.lead_id); } }}
              className="w-full text-left rounded-xl border bg-card p-3 hover:border-primary/30 hover:shadow-sm transition-all group cursor-pointer"
            >
              {/* Row 1: Name + Heat + Stage + Quick WA */}
              <div className="flex items-center gap-2">
                <HeatDot heat={lead.heat} />
                <span className="font-medium text-sm truncate flex-1">{lead.name || "—"}</span>
                {lead.attendance_status && <StatusBadge status={lead.attendance_status} />}
                {lead.revenue_status && <StatusBadge status={lead.revenue_status} />}
                {/* Quick WhatsApp action — respects opt-in (hidden when explicitly false) */}
                {lead.whatsapp_opt_in !== false && lead.phone && (
                  <span onClick={(e) => e.stopPropagation()}>
                    <WhatsAppButton
                      phone={lead.phone}
                      leadId={lead.lead_id}
                      leadName={lead.name}
                      leadSource={lead.source}
                      funnelPath={lead.current_stage ?? stageKey}
                      sourceComponent="performance-row"
                      compact
                    />
                  </span>
                )}
                <ChevronLeft size={14} className="text-muted-foreground rotate-180 opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>

              {/* Row 2: Email + Source + Date */}
              <div className="mt-1.5 flex items-center gap-3 text-[11px] text-muted-foreground flex-wrap">
                {lead.email && (
                  <span className="flex items-center gap-1 truncate max-w-[180px]">
                    <Mail size={10} /> {lead.email}
                  </span>
                )}
                {lead.source && (
                  <span className="flex items-center gap-1">
                    <Eye size={10} /> {lead.source}
                  </span>
                )}
                <span className="flex items-center gap-1">
                  <Clock size={10} /> {fmtDate(lead.created_at)}
                </span>
              </div>

              {/* Row 3: Setter/Closer + Appointment + Deal */}
              <div className="mt-1.5 flex items-center gap-3 text-[11px] text-muted-foreground flex-wrap">
                {lead.setter_name && (
                  <span className="flex items-center gap-1">
                    <User size={10} /> S: {lead.setter_name}
                  </span>
                )}
                {lead.closer_name && (
                  <span className="flex items-center gap-1">
                    <Phone size={10} /> C: {lead.closer_name}
                  </span>
                )}
                {lead.appointment_at && (
                  <span className="flex items-center gap-1">
                    <Calendar size={10} /> {fmtDateTime(lead.appointment_at)}
                  </span>
                )}
                {lead.deal_value != null && lead.deal_value > 0 && (
                  <span className="font-medium" style={{ color: T.gold }}>
                    €{Math.round(lead.deal_value).toLocaleString("de-DE")}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Pagination */}
        {totalCount > PAGE_SIZE && (
          <div className="sticky bottom-0 bg-background border-t px-4 py-3 flex items-center justify-between">
            <span className="text-xs text-muted-foreground tabular-nums">
              {t("Seite", "Page")} {page + 1} / {Math.ceil(totalCount / PAGE_SIZE)} · {totalCount} {t("Leads", "leads")}
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page === 0}
                onClick={() => setPage(p => Math.max(0, p - 1))}
              >
                {t("Zurück", "Prev")}
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={(page + 1) * PAGE_SIZE >= totalCount}
                onClick={() => setPage(p => p + 1)}
              >
                {t("Weiter", "Next")}
              </Button>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
