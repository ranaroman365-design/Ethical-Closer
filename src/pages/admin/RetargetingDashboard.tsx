import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertCircle, MessageCircle, Calendar, CheckCircle2, XCircle, Download } from "lucide-react";
import {
  buildMetaCustomAudienceCsv,
  buildGoogleCustomerMatchCsv,
  buildUtmEnrichmentCsv,
  downloadCsv,
  type AudienceLead,
} from "@/lib/audience-export";
import { toast } from "sonner";
import { computeRetargetingScore, type ScoreResult } from "@/lib/retargeting-score";

type LeadOrigin = {
  lead_id: string;
  origin_source: string | null;
  origin_campaign: string | null;
  origin_adset: string | null;
  origin_ad: string | null;
  origin_content: string | null;
  origin_medium: string | null;
  origin_term: string | null;
  landing_url: string | null;
  referrer_url: string | null;
  fbclid: string | null;
  gclid: string | null;
};

type Lead = {
  id: string;
  created_at: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  stage: string | null;
  lead_status: string | null;
  has_booking: boolean | null;
  booking_status: string | null;
  no_show_flag: boolean | null;
  outcome: string | null;
  closed_at: string | null;
  deal_value: number | null;
  appointment_date: string | null;
  source_funnel: string | null;
  funnel_source: string | null;
  lead_quality: string | null;
  lead_score: number | null;
  last_reminder_sent_at: string | null;
  reminder_count: number | null;
  retargeting_state: string | null;
  do_not_contact: boolean | null;
  suppression_reason: string | null;
};

type Segment = "no_booking" | "no_show" | "booked" | "closed_won" | "closed_lost";

const SEG_META: Record<Segment, { label: string; color: string; icon: any; cadence: string }> = {
  no_booking: { label: "Ohne Booking", color: "bg-amber-500/10 text-amber-700 border-amber-200", icon: AlertCircle, cadence: "P1 WA 5min → P2 Email 24h → P3 SMS 72h" },
  no_show:    { label: "No-Show",      color: "bg-red-500/10 text-red-700 border-red-200",       icon: XCircle,     cadence: "Reschedule WA 5min → Voice 24h → Email 72h" },
  booked:     { label: "Gebucht",      color: "bg-blue-500/10 text-blue-700 border-blue-200",    icon: Calendar,    cadence: "Confirm WA T-24h → Reminder T-2h" },
  closed_won: { label: "Closed Won",   color: "bg-emerald-500/10 text-emerald-700 border-emerald-200", icon: CheckCircle2, cadence: "Onboarding · keine Retargeting-Kadenz" },
  closed_lost:{ label: "Closed Lost",  color: "bg-slate-500/10 text-slate-700 border-slate-200", icon: XCircle,     cadence: "Reactivation T+21d (nur opted-in)" },
};

function segmentOf(l: Lead): Segment {
  if (l.outcome === "won" || l.closed_at && (l.deal_value ?? 0) > 0) return "closed_won";
  if (l.outcome === "lost") return "closed_lost";
  if (l.no_show_flag) return "no_show";
  if (l.has_booking && l.booking_status !== "cancelled") return "booked";
  return "no_booking";
}

const fmtEur = (n: number) => new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);
const fmtDate = (s: string | null) => s ? new Date(s).toLocaleDateString("de-DE") : "—";

export default function RetargetingDashboard() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [origins, setOrigins] = useState<Map<string, LeadOrigin>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from("real_leads_view" as any)
        .select("id,created_at,name,email,phone,stage,lead_status,has_booking,booking_status,no_show_flag,outcome,closed_at,deal_value,appointment_date,source_funnel,funnel_source,lead_quality,lead_score,last_reminder_sent_at,reminder_count,retargeting_state,do_not_contact,suppression_reason")
        .order("created_at", { ascending: false })
        .limit(2000);
      if (error) { setError(error.message); setLoading(false); return; }
      const ls = (data ?? []) as unknown as Lead[];
      setLeads(ls);

      // Fetch UTM/first-touch enrichment for these leads
      const ids = ls.map((l) => l.id);
      if (ids.length) {
        const { data: og } = await supabase
          .from("lead_origins" as any)
          .select("lead_id,origin_source,origin_campaign,origin_adset,origin_ad,origin_content,origin_medium,origin_term,landing_url,referrer_url,fbclid,gclid")
          .in("lead_id", ids);
        const map = new Map<string, LeadOrigin>();
        for (const r of (og ?? []) as unknown as LeadOrigin[]) map.set(r.lead_id, r);
        setOrigins(map);
      }
      setLoading(false);
    })();
  }, []);

  const segments = useMemo(() => {
    const g: Record<Segment, Lead[]> = { no_booking: [], no_show: [], booked: [], closed_won: [], closed_lost: [] };
    for (const l of leads) g[segmentOf(l)].push(l);
    return g;
  }, [leads]);

  // Per-lead retargeting score (attribution + quiz + stage + booking history).
  const scores = useMemo(() => {
    const m = new Map<string, ScoreResult>();
    for (const l of leads) {
      const o = origins.get(l.id);
      const seg = segmentOf(l);
      m.set(l.id, computeRetargetingScore({
        lead_quality: l.lead_quality, lead_score: l.lead_score,
        source_funnel: l.source_funnel, funnel_source: l.funnel_source, stage: l.stage,
        has_booking: l.has_booking, booking_status: l.booking_status,
        no_show_flag: l.no_show_flag, reminder_count: l.reminder_count,
        last_reminder_sent_at: l.last_reminder_sent_at,
        created_at: l.created_at, deal_value: l.deal_value,
        origin_source: o?.origin_source, origin_medium: o?.origin_medium,
        origin_campaign: o?.origin_campaign, fbclid: o?.fbclid, gclid: o?.gclid,
        do_not_contact: l.do_not_contact,
      }, seg));
    }
    return m;
  }, [leads, origins]);

  // Sort segments by score (desc) so priority leads bubble up.
  const sortedSegments = useMemo(() => {
    const g: Record<Segment, Lead[]> = { no_booking: [], no_show: [], booked: [], closed_won: [], closed_lost: [] };
    (Object.keys(segments) as Segment[]).forEach(s => {
      g[s] = [...segments[s]].sort((a, b) => (scores.get(b.id)?.score ?? 0) - (scores.get(a.id)?.score ?? 0));
    });
    return g;
  }, [segments, scores]);

  const kpis = useMemo(() => {
    const total = leads.length;
    const contactable = leads.filter(l => !l.do_not_contact).length;
    const won = segments.closed_won;
    const revenue = won.reduce((s, l) => s + (Number(l.deal_value) || 0), 0);
    const bookedRate = total ? ((segments.booked.length + segments.no_show.length + won.length + segments.closed_lost.length) / total) * 100 : 0;
    const noShowRate = (segments.no_show.length + segments.booked.length) ? (segments.no_show.length / (segments.no_show.length + segments.booked.length + won.length + segments.closed_lost.length)) * 100 : 0;
    const closeRate = (won.length + segments.closed_lost.length) ? (won.length / (won.length + segments.closed_lost.length)) * 100 : 0;
    const reachOut7d = leads.filter(l => l.last_reminder_sent_at && (Date.now() - new Date(l.last_reminder_sent_at).getTime()) < 7 * 864e5).length;
    const recoverable = segments.no_booking.filter(l => !l.do_not_contact && (Date.now() - new Date(l.created_at).getTime()) < 30 * 864e5).length
                      + segments.no_show.filter(l => !l.do_not_contact).length;
    const highPriority = leads.filter(l => scores.get(l.id)?.priority === "HIGH").length;
    return { total, contactable, revenue, bookedRate, noShowRate, closeRate, reachOut7d, recoverable, highPriority };
  }, [leads, segments, scores]);

  // Build audience payload for a segment (joins leads + lead_origins).
  const buildAudience = (segLeads: Lead[]): AudienceLead[] =>
    segLeads.map((l) => {
      const o = origins.get(l.id);
      return {
        id: l.id,
        name: l.name, email: l.email, phone: l.phone,
        do_not_contact: l.do_not_contact,
        origin_source: o?.origin_source, origin_campaign: o?.origin_campaign,
        origin_adset: o?.origin_adset, origin_ad: o?.origin_ad,
        origin_content: o?.origin_content, origin_medium: o?.origin_medium,
        origin_term: o?.origin_term,
        landing_url: o?.landing_url, referrer_url: o?.referrer_url,
        fbclid: o?.fbclid, gclid: o?.gclid,
      };
    });

  const exportAudience = async (segKey: Segment | "all", platform: "meta" | "google" | "utm") => {
    setExporting(true);
    try {
      const segLeads = segKey === "all" ? leads : segments[segKey];
      const audience = buildAudience(segLeads);
      const stamp = new Date().toISOString().slice(0, 10);
      const base = `etc_retargeting_${segKey}_${stamp}`;
      const eligible = audience.filter(a => !a.do_not_contact && (a.email || a.phone)).length;
      if (platform === "meta") {
        downloadCsv(`${base}_meta_custom_audience.csv`, await buildMetaCustomAudienceCsv(audience));
        toast.success(`Meta CSV: ${eligible} Kontakte (SHA-256)`);
      } else if (platform === "google") {
        downloadCsv(`${base}_google_customer_match.csv`, await buildGoogleCustomerMatchCsv(audience));
        toast.success(`Google CSV: ${eligible} Kontakte (SHA-256)`);
      } else {
        downloadCsv(`${base}_utm_enrichment.csv`, buildUtmEnrichmentCsv(audience));
        toast.success(`UTM-Enrichment: ${audience.length} Leads (intern)`);
      }
    } catch (e: any) {
      toast.error(`Export fehlgeschlagen: ${e?.message ?? e}`);
    } finally {
      setExporting(false);
    }
  };

  if (loading) return <div className="p-6 space-y-4"><Skeleton className="h-32 w-full" /><Skeleton className="h-96 w-full" /></div>;
  if (error) return <div className="p-6 text-destructive">Fehler: {error}</div>;

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <header className="space-y-1">
        <h1 className="text-3xl font-serif">Retargeting Dashboard</h1>
        <p className="text-sm text-muted-foreground">Automatische Segmentierung aller Leads · Quelle: real_leads_view (ohne Simulationen)</p>
      </header>

      <Card>
        <CardContent className="p-4 flex items-center justify-between flex-wrap gap-3">
          <div>
            <div className="text-sm font-medium">Audience-Export → Ad-Plattformen</div>
            <div className="text-xs text-muted-foreground">Meta &amp; Google: PII SHA-256 gehasht (upload-ready). UTM: intern für Analytics &amp; Offline-Conversions. DNC ausgeschlossen.</div>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button size="sm" variant="outline" disabled={exporting} onClick={() => exportAudience("all", "meta")}><Download className="h-3.5 w-3.5 mr-1.5" />Meta · alle</Button>
            <Button size="sm" variant="outline" disabled={exporting} onClick={() => exportAudience("all", "google")}><Download className="h-3.5 w-3.5 mr-1.5" />Google · alle</Button>
            <Button size="sm" variant="outline" disabled={exporting} onClick={() => exportAudience("all", "utm")}><Download className="h-3.5 w-3.5 mr-1.5" />UTM · alle</Button>
          </div>
        </CardContent>
      </Card>

      {/* KPI row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard label="Leads gesamt" value={kpis.total.toString()} sub={`${kpis.contactable} kontaktierbar`} />
        <KpiCard label="Buchungsquote" value={`${kpis.bookedRate.toFixed(1)}%`} sub="aller Leads" />
        <KpiCard label="No-Show Rate" value={`${kpis.noShowRate.toFixed(1)}%`} sub="von Booked" tone={kpis.noShowRate > 30 ? "warn" : "ok"} />
        <KpiCard label="Close Rate" value={`${kpis.closeRate.toFixed(1)}%`} sub="Won / (Won+Lost)" />
        <KpiCard label="Recovery Pool" value={kpis.recoverable.toString()} sub="reaktivierbar (30d)" tone="warn" />
        <KpiCard label="Revenue (Won)" value={fmtEur(kpis.revenue)} sub="gesamter Pool" tone="ok" />
        <KpiCard label="High-Priority" value={kpis.highPriority.toString()} sub="Score ≥ 70" tone="ok" />
        <KpiCard label="DNC / Suppressed" value={leads.filter(l => l.do_not_contact).length.toString()} sub="ausgeschlossen" />
      </div>

      {/* Segment overview */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {(Object.keys(SEG_META) as Segment[]).map(s => {
          const meta = SEG_META[s];
          const Icon = meta.icon;
          const high = segments[s].filter(l => scores.get(l.id)?.priority === "HIGH").length;
          return (
            <Card key={s} className="border">
              <CardContent className="p-4 space-y-1">
                <div className="flex items-center gap-2"><Icon className="h-4 w-4 text-muted-foreground" /><span className="text-xs text-muted-foreground">{meta.label}</span></div>
                <div className="text-2xl font-semibold">{segments[s].length}</div>
                <div className="text-[11px] text-emerald-600">{high} HIGH-Priorität</div>
                <div className="text-[10px] text-muted-foreground leading-tight">{meta.cadence}</div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Segmented tables */}
      <Tabs defaultValue="no_booking" className="w-full">
        <TabsList className="grid grid-cols-5 w-full">
          {(Object.keys(SEG_META) as Segment[]).map(s => (
            <TabsTrigger key={s} value={s}>{SEG_META[s].label} ({segments[s].length})</TabsTrigger>
          ))}
        </TabsList>
        {(Object.keys(SEG_META) as Segment[]).map(s => (
          <TabsContent key={s} value={s}>
            <SegmentTable segment={s} leads={sortedSegments[s]} scores={scores} onExport={(p) => exportAudience(s, p)} exporting={exporting} />
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}

function KpiCard({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "ok" | "warn" }) {
  const toneCls = tone === "ok" ? "text-emerald-600" : tone === "warn" ? "text-amber-600" : "text-foreground";
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className={`text-2xl font-semibold mt-1 ${toneCls}`}>{value}</div>
        {sub && <div className="text-[11px] text-muted-foreground mt-0.5">{sub}</div>}
      </CardContent>
    </Card>
  );
}

function SegmentTable({ segment, leads, scores, onExport, exporting }: { segment: Segment; leads: Lead[]; scores: Map<string, ScoreResult>; onExport: (p: "meta" | "google" | "utm") => void; exporting: boolean }) {
  const meta = SEG_META[segment];
  if (!leads.length) return <Card className="mt-4"><CardContent className="p-8 text-center text-muted-foreground text-sm">Keine Leads in diesem Segment.</CardContent></Card>;
  return (
    <Card className="mt-4">
      <CardHeader className="pb-2 flex flex-row items-center justify-between gap-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Badge variant="outline" className={meta.color}>{meta.label}</Badge>
          <span className="text-xs text-muted-foreground font-normal">Empfohlene Kadenz: {meta.cadence}</span>
        </CardTitle>
        <div className="flex gap-1.5">
          <Button size="sm" variant="ghost" disabled={exporting} onClick={() => onExport("meta")} className="h-7 text-xs"><Download className="h-3 w-3 mr-1" />Meta</Button>
          <Button size="sm" variant="ghost" disabled={exporting} onClick={() => onExport("google")} className="h-7 text-xs"><Download className="h-3 w-3 mr-1" />Google</Button>
          <Button size="sm" variant="ghost" disabled={exporting} onClick={() => onExport("utm")} className="h-7 text-xs"><Download className="h-3 w-3 mr-1" />UTM</Button>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="max-h-[600px] overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Priorität</TableHead>
                <TableHead>Lead</TableHead>
                <TableHead>Erstellt</TableHead>
                <TableHead>Funnel</TableHead>
                <TableHead>Quality</TableHead>
                <TableHead>Stage</TableHead>
                <TableHead>Termin</TableHead>
                <TableHead>Touches</TableHead>
                <TableHead className="text-right">Wert</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {leads.slice(0, 200).map(l => {
                const sc = scores.get(l.id);
                const tone = sc?.priority === "HIGH" ? "bg-emerald-500/10 text-emerald-700 border-emerald-200"
                           : sc?.priority === "MED"  ? "bg-amber-500/10 text-amber-700 border-amber-200"
                           : "bg-slate-500/10 text-slate-600 border-slate-200";
                return (
                <TableRow key={l.id} className={l.do_not_contact ? "opacity-50" : ""}>
                  <TableCell>
                    <Badge variant="outline" className={`${tone} text-[10px]`} title={sc?.reasons.join(" · ")}>
                      {sc?.priority ?? "—"} · {sc?.score ?? 0}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-medium">
                    <div>{l.name || "—"}</div>
                    <div className="text-[11px] text-muted-foreground">{l.email}</div>
                  </TableCell>
                  <TableCell className="text-xs">{fmtDate(l.created_at)}</TableCell>
                  <TableCell className="text-xs">{l.source_funnel || l.funnel_source || "—"}</TableCell>
                  <TableCell><Badge variant="outline" className="text-[10px]">{l.lead_quality || "—"}</Badge></TableCell>
                  <TableCell className="text-xs">{l.stage || "—"}</TableCell>
                  <TableCell className="text-xs">{fmtDate(l.appointment_date)}</TableCell>
                  <TableCell className="text-xs">
                    <span className="inline-flex items-center gap-1"><MessageCircle className="h-3 w-3" />{l.reminder_count ?? 0}</span>
                  </TableCell>
                  <TableCell className="text-right text-xs">{l.deal_value ? fmtEur(Number(l.deal_value)) : "—"}</TableCell>
                </TableRow>
                );
              })}
            </TableBody>
          </Table>
          {leads.length > 200 && <div className="p-3 text-center text-xs text-muted-foreground">Zeige 200 von {leads.length}</div>}
        </div>
      </CardContent>
    </Card>
  );
}
