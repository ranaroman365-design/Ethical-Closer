import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/i18n/LanguageContext";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Database,
  Inbox,
  Cpu,
  MessageCircle,
  Smartphone,
  Bell,
  Mail,
  User,
  Monitor,
  ChevronDown,
  AlertTriangle,
  Loader2,
} from "lucide-react";

/**
 * SystemArchitectureView (Layer 45 visualization)
 * -------------------------------------------------
 * Live, read-only snapshot of the ETC Communication Canon.
 * Renders compact-by-default; expands into a full Supabase → Queues → Edge → Channels → Lead diagram.
 *
 * Pure read. Never sends. No mutations. RPC `system_architecture_status` enforces RLS.
 */

type Status = "active" | "inactive" | "error";

interface Snapshot {
  generated_at: string;
  funnels: {
    total: number;
    smart_attendance_enabled: number;
    ai_setter_enabled: number;
    lead_lifecycle_enabled: number;
    level_messaging_enabled: number;
  };
  channels: {
    whatsapp: { master_enabled: boolean; sent_24h: number; active_conversations_24h: number; description: string };
    sms: { master_enabled: boolean; sent_24h: number; description: string };
    push: { master_enabled: boolean; sent_24h: number; description: string };
    email: {
      master_enabled: boolean;
      sent_24h: number;
      failed_24h: number;
      pending: number;
      dlq_24h: number;
      description: string;
    };
  };
  queues: { email_pending: number; email_dlq_24h: number };
  edge: Record<string, { name: string }>;
  incidents: { email_failure_rate_high: boolean; email_dlq_present: boolean };
  recent_events: Array<{ source: string; module: string; change_type: string; scope_type: string; scope_id: string; created_at: string }>;
}

type NodeKey = "supabase" | "queues" | "edge" | "whatsapp" | "sms" | "push" | "email" | "lead" | "dashboard";

const STATUS_DOT: Record<Status, string> = {
  active: "bg-emerald-500 shadow-[0_0_0_3px_rgba(16,185,129,0.15)]",
  inactive: "bg-neutral-300",
  error: "bg-amber-500 shadow-[0_0_0_3px_rgba(245,158,11,0.18)]",
};

function StatusDot({ status }: { status: Status }) {
  return <span className={`inline-block h-1.5 w-1.5 rounded-full ${STATUS_DOT[status]}`} aria-label={status} />;
}

function deriveStatus(snap: Snapshot, key: NodeKey): Status {
  switch (key) {
    case "supabase":
      return "active";
    case "queues":
      return snap.queues.email_dlq_24h > 0 ? "error" : "active";
    case "edge":
      return "active";
    case "whatsapp": {
      const c = snap.channels.whatsapp;
      if (!c.master_enabled && c.sent_24h === 0) return "inactive";
      return "active";
    }
    case "sms": {
      const c = snap.channels.sms;
      return c.sent_24h > 0 ? "active" : c.master_enabled ? "active" : "inactive";
    }
    case "push": {
      const c = snap.channels.push;
      return c.master_enabled ? "active" : "inactive";
    }
    case "email": {
      if (snap.incidents.email_failure_rate_high || snap.incidents.email_dlq_present) return "error";
      return snap.channels.email.master_enabled ? "active" : "inactive";
    }
    case "lead":
    case "dashboard":
      return "active";
  }
}

interface NodeMeta {
  key: NodeKey;
  label: string;
  icon: React.ReactNode;
  tooltip: { de: string; en: string };
  role: { de: string; en: string };
}

const NODE_META: Record<NodeKey, NodeMeta> = {
  supabase: {
    key: "supabase",
    label: "Supabase",
    icon: <Database className="h-3.5 w-3.5" />,
    tooltip: { de: "Brain — Logik, State, Decisions.", en: "Brain — logic, state, decisions." },
    role: { de: "Source of Truth", en: "Source of Truth" },
  },
  queues: {
    key: "queues",
    label: "Queues",
    icon: <Inbox className="h-3.5 w-3.5" />,
    tooltip: { de: "Execution-Planung. Kein direkter Versand außerhalb der Queues.", en: "Execution planning. No direct sending outside queues." },
    role: { de: "Planning", en: "Planning" },
  },
  edge: {
    key: "edge",
    label: "Edge",
    icon: <Cpu className="h-3.5 w-3.5" />,
    tooltip: { de: "Processing-Layer. Validiert, rendert, sendet.", en: "Processing layer. Validates, renders, sends." },
    role: { de: "Processing", en: "Processing" },
  },
  whatsapp: {
    key: "whatsapp",
    label: "WhatsApp",
    icon: <MessageCircle className="h-3.5 w-3.5" />,
    tooltip: { de: "Primärer Conversion-Kanal. Booking, Follow-up, Reminder.", en: "Primary conversion channel. Booking, follow-up, reminders." },
    role: { de: "Conversion", en: "Conversion" },
  },
  sms: {
    key: "sms",
    label: "SMS",
    icon: <Smartphone className="h-3.5 w-3.5" />,
    tooltip: { de: "Conversion-Fallback. Kurz, zeitkritisch.", en: "Conversion fallback. Short, time-sensitive." },
    role: { de: "Conversion", en: "Conversion" },
  },
  push: {
    key: "push",
    label: "Push",
    icon: <Bell className="h-3.5 w-3.5" />,
    tooltip: { de: "Re-Engagement. Bringt User zurück zur Plattform.", en: "Re-engagement. Brings user back to platform." },
    role: { de: "Re-Engagement", en: "Re-engagement" },
  },
  email: {
    key: "email",
    label: "Email",
    icon: <Mail className="h-3.5 w-3.5" />,
    tooltip: { de: "Documentation Layer. Bestätigt Realität, verkauft nicht.", en: "Documentation layer. Confirms reality, never sells." },
    role: { de: "Documentation", en: "Documentation" },
  },
  lead: {
    key: "lead",
    label: "Lead",
    icon: <User className="h-3.5 w-3.5" />,
    tooltip: { de: "Lead-Erlebnis: WA für Action, Push für Return, Email für Bestätigung.", en: "Lead experience: WA drives action, Push returns, Email confirms." },
    role: { de: "Recipient", en: "Recipient" },
  },
  dashboard: {
    key: "dashboard",
    label: "Dashboard",
    icon: <Monitor className="h-3.5 w-3.5" />,
    tooltip: { de: "Control & Visibility only — sendet niemals direkt.", en: "Control & visibility only — never sends directly." },
    role: { de: "Control", en: "Control" },
  },
};

interface NodeProps {
  meta: NodeMeta;
  status: Status;
  meta2?: string;
  onClick: () => void;
}

function Node({ meta, status, meta2, onClick }: NodeProps) {
  const { lang } = useLanguage();
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={onClick}
            className="group flex w-full flex-col items-start gap-1.5 rounded-md border border-[#E5E5E5] bg-[#F7F7F7] px-3 py-2.5 text-left transition-all duration-150 hover:border-neutral-400 hover:bg-white hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-neutral-300"
          >
            <div className="flex w-full items-center justify-between">
              <span className="flex items-center gap-1.5 text-[11px] font-medium tracking-tight text-neutral-900">
                {meta.icon}
                {meta.label}
              </span>
              <StatusDot status={status} />
            </div>
            <span className="text-[10px] uppercase tracking-[0.12em] text-neutral-500">
              {meta.role[lang as "de" | "en"]}
            </span>
            {meta2 ? <span className="text-[10px] text-neutral-500">{meta2}</span> : null}
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-[220px] text-xs leading-relaxed">
          {meta.tooltip[lang as "de" | "en"]}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/* ---------- Connector pieces ---------- */

function HConnector({ active = true, delay = 0 }: { active?: boolean; delay?: number }) {
  return (
    <div className="relative mx-1 hidden h-px flex-1 self-center bg-border md:block" aria-hidden>
      {active ? (
        <span
          className="path-pulse-dot absolute top-1/2 h-1 w-1 -translate-y-1/2 rounded-full bg-accent"
          style={{ animationDelay: `${delay}s` }}
        />
      ) : null}
    </div>
  );
}

/* ============================================================ */

export function SystemArchitectureView() {
  const { lang } = useLanguage();
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [drawer, setDrawer] = useState<NodeKey | null>(null);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc("system_architecture_status" as any);
    if (!error && data) setSnap(data as unknown as Snapshot);
    setLoading(false);
  };

  useEffect(() => {
    load();
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, []);

  const incident = useMemo(() => {
    if (!snap) return null;
    if (snap.incidents.email_failure_rate_high)
      return lang === "de" ? "Hohe Email-Fehlerrate (24h)" : "High email failure rate (24h)";
    if (snap.incidents.email_dlq_present)
      return lang === "de" ? "Email-Dead-Letter-Einträge erkannt" : "Email dead-letter entries detected";
    return null;
  }, [snap, lang]);

  if (loading || !snap) {
    return (
      <Card className="flex h-32 items-center justify-center border-[#E5E5E5] bg-white">
        <Loader2 className="h-5 w-5 animate-spin text-neutral-400" />
      </Card>
    );
  }

  const s = (k: NodeKey) => deriveStatus(snap, k);

  return (
    <Card className="border-[#E5E5E5] bg-white p-5 lg:p-6">
      {/* Header */}
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-neutral-500">
            {lang === "de" ? "System · Live" : "System · Live"}
          </p>
          <h2 className="mt-1 font-serif text-lg font-light tracking-tight text-neutral-900">
            {lang === "de" ? "Kommunikations-Architektur" : "Communication Architecture"}
          </h2>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setExpanded((v) => !v)}
          className="gap-1.5 text-xs text-neutral-600 hover:text-neutral-900"
        >
          {expanded ? (lang === "de" ? "Kompakt" : "Compact") : (lang === "de" ? "System öffnen" : "Expand System")}
          <ChevronDown className={`h-3.5 w-3.5 transition-transform duration-200 ${expanded ? "rotate-180" : ""}`} />
        </Button>
      </div>

      {/* Incident banner */}
      {incident ? (
        <div className="mb-4 flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          <AlertTriangle className="h-3.5 w-3.5" />
          <span>{incident}</span>
        </div>
      ) : null}

      {/* COMPACT MODE — single horizontal flow */}
      {!expanded ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-stretch gap-2 md:flex-nowrap">
            <Node meta={NODE_META.supabase} status={s("supabase")} onClick={() => setDrawer("supabase")} />
            <HConnector delay={0} />
            <Node meta={NODE_META.queues} status={s("queues")} onClick={() => setDrawer("queues")} />
            <HConnector delay={0.6} />
            <Node meta={NODE_META.edge} status={s("edge")} onClick={() => setDrawer("edge")} />
            <HConnector delay={1.2} />
            <div className="hover-elevate flex min-w-0 flex-1 flex-col gap-1.5 rounded-md border border-border bg-muted/30 p-2">
              <span className="px-1 text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                {lang === "de" ? "Kanäle" : "Channels"}
              </span>
              <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
                {(["whatsapp", "sms", "push", "email"] as NodeKey[]).map((k) => (
                  <button
                    key={k}
                    onClick={() => setDrawer(k)}
                    className="flex items-center justify-between rounded border border-border bg-card px-2 py-1.5 text-[11px] transition-colors hover:border-foreground/40"
                  >
                    <span className="flex items-center gap-1.5">
                      {NODE_META[k].icon}
                      {NODE_META[k].label}
                    </span>
                    <StatusDot status={s(k)} />
                  </button>
                ))}
              </div>
            </div>
            <HConnector delay={1.8} />
            <Node meta={NODE_META.lead} status={s("lead")} onClick={() => setDrawer("lead")} />
          </div>

          <Legend />
        </div>
      ) : (
        /* EXPANDED MODE — vertical stack */
        <div className="space-y-3 animate-fade-in">
          <Row title={lang === "de" ? "1 · Brain" : "1 · Brain"}>
            <Node meta={NODE_META.supabase} status={s("supabase")} onClick={() => setDrawer("supabase")} />
          </Row>
          <Arrow />
          <Row title={lang === "de" ? "2 · Queues" : "2 · Queues"}>
            <Node
              meta={NODE_META.queues}
              status={s("queues")}
              meta2={`${snap.queues.email_pending} pending · ${snap.queues.email_dlq_24h} DLQ (24h)`}
              onClick={() => setDrawer("queues")}
            />
          </Row>
          <Arrow />
          <Row title={lang === "de" ? "3 · Edge Functions" : "3 · Edge Functions"}>
            <Node meta={NODE_META.edge} status={s("edge")} onClick={() => setDrawer("edge")} />
          </Row>
          <Arrow />
          <Row title={lang === "de" ? "4 · Kanäle" : "4 · Channels"}>
            <div className="grid w-full grid-cols-2 gap-2 lg:grid-cols-4">
              <Node
                meta={NODE_META.whatsapp}
                status={s("whatsapp")}
                meta2={`${snap.channels.whatsapp.sent_24h} sent · ${snap.channels.whatsapp.active_conversations_24h} convos (24h)`}
                onClick={() => setDrawer("whatsapp")}
              />
              <Node
                meta={NODE_META.sms}
                status={s("sms")}
                meta2={`${snap.channels.sms.sent_24h} sent (24h)`}
                onClick={() => setDrawer("sms")}
              />
              <Node
                meta={NODE_META.push}
                status={s("push")}
                meta2={`${snap.channels.push.sent_24h} sent (24h)`}
                onClick={() => setDrawer("push")}
              />
              <Node
                meta={NODE_META.email}
                status={s("email")}
                meta2={`${snap.channels.email.sent_24h} sent · ${snap.channels.email.failed_24h} failed`}
                onClick={() => setDrawer("email")}
              />
            </div>
          </Row>
          <Arrow />
          <Row title={lang === "de" ? "5 · Lead" : "5 · Lead"}>
            <Node meta={NODE_META.lead} status={s("lead")} onClick={() => setDrawer("lead")} />
          </Row>

          <div className="my-4 border-t border-dashed border-[#E5E5E5]" />

          <Row title={lang === "de" ? "Control-Layer (sendet nie)" : "Control layer (never sends)"}>
            <Node
              meta={NODE_META.dashboard}
              status={s("dashboard")}
              meta2={lang === "de" ? "Nur Steuerung & Sichtbarkeit" : "Control & visibility only"}
              onClick={() => setDrawer("dashboard")}
            />
          </Row>

          <Legend />
        </div>
      )}

      {/* Side drawer */}
      <Sheet open={!!drawer} onOpenChange={(o) => !o && setDrawer(null)}>
        <SheetContent side="right" className="w-full max-w-md overflow-y-auto">
          {drawer ? <DrawerBody nodeKey={drawer} snap={snap} /> : null}
        </SheetContent>
      </Sheet>
    </Card>
  );
}

/* ---------- Helper components ---------- */

function Row({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1.5 text-[10px] uppercase tracking-[0.14em] text-neutral-500">{title}</p>
      <div className="flex flex-wrap items-stretch gap-2">{children}</div>
    </div>
  );
}

function Arrow() {
  return (
    <div className="flex justify-center" aria-hidden>
      <span className="text-neutral-300">↓</span>
    </div>
  );
}

function Legend() {
  const { lang } = useLanguage();
  const items = [
    { dot: "bg-emerald-500", label: lang === "de" ? "Aktiv" : "Active" },
    { dot: "bg-neutral-300", label: lang === "de" ? "Inaktiv" : "Inactive" },
    { dot: "bg-amber-500", label: lang === "de" ? "Fehler" : "Error" },
  ];
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-[#E5E5E5] pt-3 text-[10px] uppercase tracking-[0.12em] text-neutral-500">
      {items.map((i) => (
        <span key={i.label} className="flex items-center gap-1.5">
          <span className={`h-1.5 w-1.5 rounded-full ${i.dot}`} />
          {i.label}
        </span>
      ))}
      <span className="ml-auto hidden md:inline">
        WA · SMS · Voice = {lang === "de" ? "Conversion" : "Conversion"} · Push = Re-engagement · Email ={" "}
        {lang === "de" ? "Documentation" : "Documentation"} · Dashboard = Control
      </span>
    </div>
  );
}

/* ---------- Side drawer body ---------- */

function DrawerBody({ nodeKey, snap }: { nodeKey: NodeKey; snap: Snapshot }) {
  const { lang } = useLanguage();
  const meta = NODE_META[nodeKey];
  const status = deriveStatus(snap, nodeKey);

  const bodyByNode: Record<NodeKey, React.ReactNode> = {
    supabase: (
      <Section title={lang === "de" ? "Letzte System-Events" : "Recent system events"}>
        {snap.recent_events.length === 0 ? (
          <Empty />
        ) : (
          <ul className="space-y-1.5 text-xs">
            {snap.recent_events.map((e, i) => (
              <li key={i} className="flex items-center justify-between gap-3 border-b border-[#E5E5E5] pb-1.5 last:border-0">
                <span className="truncate">
                  <span className="font-medium">{e.module}</span>
                  <span className="text-neutral-500"> · {e.change_type}</span>
                </span>
                <time className="shrink-0 text-[10px] text-neutral-400">
                  {new Date(e.created_at).toLocaleString(lang === "de" ? "de-DE" : "en-US", { dateStyle: "short", timeStyle: "short" })}
                </time>
              </li>
            ))}
          </ul>
        )}
      </Section>
    ),
    queues: (
      <Section title={lang === "de" ? "Queue-Aktivität" : "Queue activity"}>
        <KV k={lang === "de" ? "Email pending (60min)" : "Email pending (60min)"} v={snap.queues.email_pending} />
        <KV k={lang === "de" ? "Email DLQ (24h)" : "Email DLQ (24h)"} v={snap.queues.email_dlq_24h} tone={snap.queues.email_dlq_24h > 0 ? "warning" : "neutral"} />
        <p className="mt-3 text-[11px] leading-relaxed text-neutral-500">
          {lang === "de"
            ? "Hinweis: Communication-, Attendance- und Push-Queues laufen über PGMQ und werden nicht direkt aggregiert. Aktivität spiegelt sich in den Channel-Karten wider."
            : "Note: communication, attendance and push queues run on PGMQ and are not directly aggregated. Activity is reflected in the channel cards."}
        </p>
      </Section>
    ),
    edge: (
      <Section title={lang === "de" ? "Edge Functions" : "Edge Functions"}>
        <ul className="space-y-1.5 text-xs">
          <Li>process-attendance-jobs · process-outbound-events</Li>
          <Li>process-ai-setter-call-queue</Li>
          <Li>push-dispatch</Li>
          <Li>process-email-queue · email-documentation-dispatch</Li>
          <Li>handle-twilio-webhook · conversational-ai-respond</Li>
        </ul>
      </Section>
    ),
    whatsapp: (
      <Section title="WhatsApp">
        <KV k={lang === "de" ? "Master aktiv" : "Master enabled"} v={snap.channels.whatsapp.master_enabled ? "Yes" : "No"} />
        <KV k={lang === "de" ? "Nachrichten (24h)" : "Messages (24h)"} v={snap.channels.whatsapp.sent_24h} />
        <KV k={lang === "de" ? "Aktive Konversationen (24h)" : "Active conversations (24h)"} v={snap.channels.whatsapp.active_conversations_24h} />
      </Section>
    ),
    sms: (
      <Section title="SMS">
        <KV k={lang === "de" ? "Master aktiv" : "Master enabled"} v={snap.channels.sms.master_enabled ? "Yes" : "No"} />
        <KV k={lang === "de" ? "Sends (24h)" : "Sends (24h)"} v={snap.channels.sms.sent_24h} />
      </Section>
    ),
    push: (
      <Section title="Push">
        <KV k={lang === "de" ? "Master aktiv" : "Master enabled"} v={snap.channels.push.master_enabled ? "Yes" : "No"} />
        <KV k={lang === "de" ? "Sends (24h)" : "Sends (24h)"} v={snap.channels.push.sent_24h} />
      </Section>
    ),
    email: (
      <Section title="Email">
        <KV k={lang === "de" ? "Master aktiv" : "Master enabled"} v={snap.channels.email.master_enabled ? "Yes" : "No"} />
        <KV k={lang === "de" ? "Versendet (24h)" : "Sent (24h)"} v={snap.channels.email.sent_24h} />
        <KV k={lang === "de" ? "Fehlgeschlagen (24h)" : "Failed (24h)"} v={snap.channels.email.failed_24h} tone={snap.channels.email.failed_24h > 0 ? "warning" : "neutral"} />
        <KV k={lang === "de" ? "Pending (60min)" : "Pending (60min)"} v={snap.channels.email.pending} />
        <KV k={lang === "de" ? "DLQ (24h)" : "DLQ (24h)"} v={snap.channels.email.dlq_24h} tone={snap.channels.email.dlq_24h > 0 ? "warning" : "neutral"} />
      </Section>
    ),
    lead: (
      <Section title={lang === "de" ? "Lead-Erlebnis" : "Lead experience"}>
        <ul className="space-y-1.5 text-xs leading-relaxed text-neutral-700">
          <Li>{lang === "de" ? "WhatsApp / SMS / Voice — aktive Kommunikation" : "WhatsApp / SMS / Voice — active communication"}</Li>
          <Li>{lang === "de" ? "Push — Reminder & Rückkehr-Trigger" : "Push — reminders & return triggers"}</Li>
          <Li>{lang === "de" ? "Email — Bestätigungen & offizielle Updates" : "Email — confirmations & official updates"}</Li>
        </ul>
      </Section>
    ),
    dashboard: (
      <Section title={lang === "de" ? "Dashboard-Rolle" : "Dashboard role"}>
        <p className="text-xs leading-relaxed text-neutral-700">
          {lang === "de"
            ? "Steuerung & Sichtbarkeit. Zeigt Status, Logs und ermöglicht manuelle Konfiguration. Sendet niemals direkt Nachrichten."
            : "Control & visibility. Shows status, logs and enables manual configuration. Never sends messages directly."}
        </p>
      </Section>
    ),
  };

  return (
    <>
      <SheetHeader>
        <div className="flex items-center gap-2">
          {meta.icon}
          <SheetTitle className="font-serif text-lg font-light">{meta.label}</SheetTitle>
          <Badge variant="outline" className="ml-2 gap-1.5 text-[10px]">
            <StatusDot status={status} />
            {status}
          </Badge>
        </div>
        <SheetDescription className="text-xs leading-relaxed">
          {meta.tooltip[lang as "de" | "en"]}
        </SheetDescription>
      </SheetHeader>
      <div className="mt-4 space-y-5">{bodyByNode[nodeKey]}</div>
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.16em] text-neutral-500">{title}</p>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

function KV({ k, v, tone = "neutral" }: { k: string; v: React.ReactNode; tone?: "neutral" | "warning" }) {
  return (
    <div className="flex items-center justify-between border-b border-[#E5E5E5] py-1.5 text-xs last:border-0">
      <span className="text-neutral-500">{k}</span>
      <span className={`font-medium ${tone === "warning" ? "text-amber-700" : "text-neutral-900"}`}>{v}</span>
    </div>
  );
}

function Li({ children }: { children: React.ReactNode }) {
  return <li className="border-b border-[#E5E5E5] pb-1.5 last:border-0">{children}</li>;
}

function Empty() {
  const { lang } = useLanguage();
  return <p className="py-2 text-xs italic text-neutral-400">{lang === "de" ? "Keine Daten" : "No data"}</p>;
}

export default SystemArchitectureView;
