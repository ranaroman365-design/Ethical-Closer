import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Legend, ResponsiveContainer } from "recharts";
import { MailCheck, MailX, MailWarning, AlertTriangle, Ban, Loader2, FileDown, FileText } from "lucide-react";
import { exportAuditCsv, exportAuditPdf } from "@/lib/email-audit-export";
import { toast } from "sonner";

/**
 * Admin dashboard: Email delivery dropoff.
 * Reads email_send_log, deduplicates per message_id (latest row wins),
 * and groups final outcomes into delivered vs each dropoff bucket.
 *
 * Route: /members/admin/email-delivery-dropoff
 */

type Row = {
  message_id: string;
  status: string;
  created_at: string;
};

type Bucket = "delivered" | "bounced" | "complained" | "unsubscribed" | "failed" | "pending";

const RANGES = [
  { key: "24h", label: "24 Stunden", days: 1 },
  { key: "7d", label: "7 Tage", days: 7 },
  { key: "30d", label: "30 Tage", days: 30 },
] as const;

const BUCKET_META: Record<Bucket, { label: string; chartColor: string; icon: React.ReactNode; badgeClass: string }> = {
  delivered:    { label: "Zugestellt",   chartColor: "hsl(var(--primary))",     icon: <MailCheck className="h-4 w-4" />,    badgeClass: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30" },
  bounced:      { label: "Bounced",      chartColor: "hsl(var(--destructive))", icon: <MailX className="h-4 w-4" />,        badgeClass: "bg-destructive/15 text-destructive border-destructive/30" },
  complained:   { label: "Spam",         chartColor: "hsl(var(--destructive))", icon: <AlertTriangle className="h-4 w-4" />,badgeClass: "bg-destructive/15 text-destructive border-destructive/30" },
  unsubscribed: { label: "Abgemeldet",   chartColor: "hsl(var(--muted-foreground))", icon: <Ban className="h-4 w-4" />,    badgeClass: "bg-amber-500/15 text-amber-600 border-amber-500/30" },
  failed:       { label: "Fehlgeschlagen", chartColor: "hsl(var(--destructive))", icon: <MailX className="h-4 w-4" />,      badgeClass: "bg-destructive/15 text-destructive border-destructive/30" },
  pending:      { label: "In Warteschlange", chartColor: "hsl(var(--muted-foreground))", icon: <Loader2 className="h-4 w-4" />, badgeClass: "bg-muted text-muted-foreground border-border" },
};

function statusToBucket(status: string): Bucket {
  switch (status) {
    case "delivered":
    case "sent":
      return "delivered";
    case "bounced":
      return "bounced";
    case "complained":
      return "complained";
    case "unsubscribed":
    case "suppressed":
      return "unsubscribed";
    case "failed":
    case "dlq":
      return "failed";
    default:
      return "pending";
  }
}

export default function EmailDeliveryDropoff() {
  const [rangeKey, setRangeKey] = useState<(typeof RANGES)[number]["key"]>("7d");
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  const range = RANGES.find((r) => r.key === rangeKey)!;

  useEffect(() => {
    setLoading(true);
    const since = new Date(Date.now() - range.days * 24 * 60 * 60 * 1000).toISOString();
    supabase
      .from("email_send_log")
      .select("message_id, status, created_at")
      .gte("created_at", since)
      .not("message_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(1000)
      .then(({ data }) => {
        setRows((data as Row[]) ?? []);
        setLoading(false);
      });
  }, [rangeKey, range.days]);

  const dedup = useMemo(() => {
    const seen = new Map<string, Row>();
    for (const r of rows) {
      if (!seen.has(r.message_id)) seen.set(r.message_id, r);
    }
    return Array.from(seen.values());
  }, [rows]);

  const counts = useMemo(() => {
    const c: Record<Bucket, number> = {
      delivered: 0, bounced: 0, complained: 0, unsubscribed: 0, failed: 0, pending: 0,
    };
    for (const r of dedup) c[statusToBucket(r.status)]++;
    return c;
  }, [dedup]);

  const total = dedup.length;
  const deliveredPct = total ? Math.round((counts.delivered / total) * 100) : 0;
  const dropoff = counts.bounced + counts.complained + counts.unsubscribed + counts.failed;
  const dropoffPct = total ? Math.round((dropoff / total) * 100) : 0;

  const trend = useMemo(() => {
    const groupByHour = range.days <= 1;
    const buckets = new Map<string, Record<Bucket, number> & { label: string }>();
    for (const r of dedup) {
      const d = new Date(r.created_at);
      const key = groupByHour
        ? `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}-${d.getHours()}`
        : `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      const label = groupByHour
        ? d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })
        : d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" });
      if (!buckets.has(key)) {
        buckets.set(key, { label, delivered: 0, bounced: 0, complained: 0, unsubscribed: 0, failed: 0, pending: 0 });
      }
      buckets.get(key)![statusToBucket(r.status)]++;
    }
    return Array.from(buckets.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, v]) => v);
  }, [dedup, range.days]);

  const chartConfig: ChartConfig = {
    delivered:    { label: BUCKET_META.delivered.label,    color: BUCKET_META.delivered.chartColor },
    bounced:      { label: BUCKET_META.bounced.label,      color: "hsl(0 72% 51%)" },
    complained:   { label: BUCKET_META.complained.label,   color: "hsl(15 85% 55%)" },
    unsubscribed: { label: BUCKET_META.unsubscribed.label, color: "hsl(38 92% 50%)" },
    failed:       { label: BUCKET_META.failed.label,       color: "hsl(348 83% 47%)" },
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Email Delivery Dropoff</h1>
          <p className="text-sm text-muted-foreground">
            Zugestellt vs. Bounced / Spam / Abgemeldet / Fehlgeschlagen — dedupliziert nach message_id.
          </p>
        </div>
        <div className="flex gap-2">
          {RANGES.map((r) => (
            <Button
              key={r.key}
              size="sm"
              variant={r.key === rangeKey ? "default" : "outline"}
              onClick={() => setRangeKey(r.key)}
            >
              {r.label}
            </Button>
          ))}
        </div>
      </header>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <StatCard label="Total" value={total} hint={loading ? "Lädt…" : `${range.label}`} />
        <StatCard
          label="Zugestellt"
          value={counts.delivered}
          hint={`${deliveredPct}%`}
          icon={BUCKET_META.delivered.icon}
          tone="ok"
        />
        <StatCard
          label="Bounced"
          value={counts.bounced}
          icon={BUCKET_META.bounced.icon}
          tone="fail"
        />
        <StatCard
          label="Spam"
          value={counts.complained}
          icon={BUCKET_META.complained.icon}
          tone="fail"
        />
        <StatCard
          label="Abgemeldet"
          value={counts.unsubscribed}
          icon={BUCKET_META.unsubscribed.icon}
          tone="warn"
        />
        <StatCard
          label="Fehlgeschlagen"
          value={counts.failed}
          icon={BUCKET_META.failed.icon}
          tone="fail"
        />
      </div>

      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
          <div className="flex items-center gap-3">
            <MailWarning className="h-5 w-5 text-amber-600" />
            <div>
              <div className="text-sm font-medium">Gesamt-Dropoff</div>
              <div className="text-xs text-muted-foreground">
                {dropoff} von {total} Mails ({dropoffPct}%) wurden nicht zugestellt
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {(["bounced", "complained", "unsubscribed", "failed"] as Bucket[]).map((b) => (
              <Badge key={b} variant="outline" className={BUCKET_META[b].badgeClass}>
                {BUCKET_META[b].label}: {counts[b]}
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>

      <AuditExportCard />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Verlauf — {range.label}</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Lädt…
            </div>
          ) : trend.length === 0 ? (
            <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
              Keine Mails im gewählten Zeitraum.
            </div>
          ) : (
            <ChartContainer config={chartConfig} className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trend} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} allowDecimals={false} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Area type="monotone" dataKey="delivered"    name="Zugestellt"   stackId="1" stroke="var(--color-delivered)"    fill="var(--color-delivered)"    fillOpacity={0.35} />
                  <Area type="monotone" dataKey="bounced"      name="Bounced"      stackId="1" stroke="var(--color-bounced)"      fill="var(--color-bounced)"      fillOpacity={0.5} />
                  <Area type="monotone" dataKey="complained"   name="Spam"         stackId="1" stroke="var(--color-complained)"   fill="var(--color-complained)"   fillOpacity={0.5} />
                  <Area type="monotone" dataKey="unsubscribed" name="Abgemeldet"   stackId="1" stroke="var(--color-unsubscribed)" fill="var(--color-unsubscribed)" fillOpacity={0.5} />
                  <Area type="monotone" dataKey="failed"       name="Fehlgeschlagen" stackId="1" stroke="var(--color-failed)"     fill="var(--color-failed)"       fillOpacity={0.5} />
                </AreaChart>
              </ResponsiveContainer>
            </ChartContainer>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({
  label, value, hint, icon, tone = "neutral",
}: {
  label: string;
  value: number;
  hint?: string;
  icon?: React.ReactNode;
  tone?: "ok" | "warn" | "fail" | "neutral";
}) {
  const toneClass =
    tone === "ok" ? "text-emerald-600" :
    tone === "warn" ? "text-amber-600" :
    tone === "fail" ? "text-destructive" :
    "text-foreground";
  return (
    <Card>
      <CardContent className="py-4">
        <div className="flex items-center justify-between">
          <span className="text-xs uppercase tracking-wide text-muted-foreground">{label}</span>
          {icon && <span className={toneClass}>{icon}</span>}
        </div>
        <div className={`mt-1 text-2xl font-semibold ${toneClass}`}>{value.toLocaleString("de-DE")}</div>
        {hint && <div className="mt-0.5 text-xs text-muted-foreground">{hint}</div>}
      </CardContent>
    </Card>
  );
}

/**
 * Audit Export — downloads a deduplicated email_send_log dump for the
 * last 7 or 30 days as CSV or PDF. Each row = one message_id with its
 * final delivery status and resolved-at timestamp.
 */
function AuditExportCard() {
  const [busy, setBusy] = useState<string | null>(null);

  async function run(kind: "csv" | "pdf", days: 7 | 30) {
    const key = `${kind}-${days}`;
    setBusy(key);
    try {
      const count = kind === "csv" ? await exportAuditCsv(days) : await exportAuditPdf(days);
      toast.success(`${count.toLocaleString("de-DE")} Zeilen exportiert`, {
        description: `Letzte ${days} Tage • ${kind.toUpperCase()}`,
      });
    } catch (e: any) {
      toast.error("Export fehlgeschlagen", { description: e?.message ?? String(e) });
    } finally {
      setBusy(null);
    }
  }

  const Btn = ({ kind, days, icon: Icon }: { kind: "csv" | "pdf"; days: 7 | 30; icon: typeof FileDown }) => {
    const key = `${kind}-${days}`;
    const isBusy = busy === key;
    return (
      <Button
        variant="outline"
        size="sm"
        disabled={busy !== null}
        onClick={() => run(kind, days)}
      >
        {isBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Icon className="mr-2 h-4 w-4" />}
        {kind.toUpperCase()} • {days}d
      </Button>
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Audit Export</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="mb-3 text-xs text-muted-foreground">
          Eine Zeile pro <code className="rounded bg-muted px-1 py-0.5">message_id</code> mit{" "}
          <code className="rounded bg-muted px-1 py-0.5">final_delivery_status</code> und{" "}
          <code className="rounded bg-muted px-1 py-0.5">delivery_resolved_at</code>.
          Dedupliziert (neuester Status pro Mail).
        </p>
        <div className="flex flex-wrap gap-2">
          <Btn kind="csv" days={7} icon={FileDown} />
          <Btn kind="csv" days={30} icon={FileDown} />
          <Btn kind="pdf" days={7} icon={FileText} />
          <Btn kind="pdf" days={30} icon={FileText} />
        </div>
      </CardContent>
    </Card>
  );
}
