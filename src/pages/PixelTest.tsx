/**
 * Meta Pixel Test Funnel
 * ──────────────────────────────────────────────────────────────────
 * Internal-only QA page. Trigger PageView + each Conversion event
 * deliberately and verify against the Meta Events Manager + the
 * built-in Pixel Debug Panel.
 *
 * Open: /pixel-test?pixel_debug=1
 */

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { trackPixelEvent, type CanonicalPixelEvent } from "@/lib/meta-pixel";
import { enablePixelDebug } from "@/lib/pixel-debug-store";
import { buildEventId } from "@/lib/meta-capi";
import {
  getCapiDebugEntries,
  subscribeCapiDebug,
  type CapiDebugEntry,
} from "@/lib/capi-debug-store";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";

type EventDef = {
  key: CanonicalPixelEvent;
  meta: string;
  group: "page" | "lead" | "booking" | "purchase" | "other";
  description: string;
  params?: Record<string, unknown>;
};

const EVENTS: EventDef[] = [
  { key: "LP_VIEW",            meta: "PageView",             group: "page",     description: "Standard PageView (LP)" },
  { key: "ROUTE_VIEW",         meta: "PageView",             group: "page",     description: "SPA ROUTE_VIEW (deduped per path)", params: { path: "/pixel-test/sub" } },
  { key: "APPLY_VIEW",         meta: "ViewContent",          group: "page",     description: "Bewerbungsformular sichtbar" },
  { key: "QUIZ_STARTED",       meta: "QuizStarted (custom)", group: "lead",     description: "Quiz wurde gestartet" },
  { key: "QUIZ_COMPLETED",     meta: "QuizCompleted (custom)", group: "lead",     description: "Quiz abgeschlossen" },
  { key: "LEAD_CAPTURED",      meta: "Lead",                 group: "lead",     description: "Lead-Daten erfasst (CAPI mirror)" },
  { key: "HIGH_QUALITY_LEAD",  meta: "HighQualityLead (custom)", group: "lead", description: "Lead-Score ≥ Threshold" },
  { key: "BOOKING_STARTED",    meta: "BookingStarted (custom)", group: "booking", description: "Slot-Auswahl geöffnet" },
  { key: "BOOKING_CREATED",    meta: "BookingCreated (custom)", group: "booking", description: "Termin in DB erzeugt" },
  { key: "BOOKING_CONFIRMED",  meta: "Schedule",             group: "booking",  description: "Termin bestätigt (CAPI mirror)" },
  { key: "BOOKED",             meta: "Schedule",             group: "booking",  description: "Alias zu BOOKING_CONFIRMED" },
  { key: "SHOWED_UP",          meta: "QualifiedShow (custom)", group: "other",  description: "Lead ist erschienen" },
  { key: "OFFER_MADE",         meta: "OfferMade (custom)",   group: "other",    description: "Angebot wurde unterbreitet" },
  { key: "FASTLANE_PAYMENT_COMPLETED", meta: "Purchase",     group: "purchase", description: "Fastlane Zahlung erfolgreich" },
  { key: "CLOSED_WON",         meta: "Purchase",             group: "purchase", description: "Closed Won (CAPI mirror)" },
];

const GROUP_LABEL: Record<EventDef["group"], string> = {
  page: "Page",
  lead: "Lead",
  booking: "Booking",
  purchase: "Purchase",
  other: "Funnel",
};

export default function PixelTest() {
  const [email, setEmail] = useState("qa+pixel@ethicalcloser.de");
  const [phone, setPhone] = useState("+4917612345678");
  const [value, setValue] = useState<number>(7200);
  const [leadId] = useState(() => `qa_lead_${Date.now()}`);
  const [appointmentId] = useState(() => `qa_appt_${Date.now()}`);
  type LogEntry = {
    ts: string;
    tsMs: number;
    event: CanonicalPixelEvent;
    meta: string;
    event_id: string;
    capiExpected: boolean;
  };
  const [log, setLog] = useState<LogEntry[]>([]);
  // Tick once per second so stale-pending detection re-evaluates.
  const [, setNowTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setNowTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);

  // Auto-enable debug panel on this page so QA always sees it.
  useEffect(() => {
    enablePixelDebug();
  }, []);

  // Live subscription to the CAPI debug store — re-renders whenever a
  // pending entry is patched with status / fbtrace_id.
  const capiEntries = useSyncExternalStore(
    subscribeCapiDebug,
    getCapiDebugEntries,
    getCapiDebugEntries,
  );
  const capiByEventId = useMemo(() => {
    const m = new Map<string, CapiDebugEntry>();
    for (const e of capiEntries) m.set(e.event_id, e);
    return m;
  }, [capiEntries]);

  const grouped = useMemo(() => {
    const m: Record<string, EventDef[]> = {};
    for (const e of EVENTS) (m[e.group] ||= []).push(e);
    return m;
  }, []);

  function fire(def: EventDef) {
    // Pre-build event_id so we can correlate Browser ↔ CAPI in the log.
    const entityId =
      (def.params?.lead_id as string | undefined) ?? leadId;
    const event_id = buildEventId(def.meta.split(" ")[0], entityId);

    const params: Record<string, unknown> = {
      ...(def.params ?? {}),
      event_id,
      lead_id: leadId,
      appointment_id: appointmentId,
      email,
      phone,
      value,
      currency: "EUR",
      content_name: `qa:${def.key}`,
      origin_key: "pixel_test",
    };
    trackPixelEvent(def.key, params);
    const metaName = def.meta.split(" ")[0];
    const capiExpected =
      !def.meta.includes("custom") && metaName !== "PageView";
    const now = Date.now();
    setLog((prev) =>
      [
        {
          ts: new Date(now).toLocaleTimeString(),
          tsMs: now,
          event: def.key,
          meta: def.meta,
          event_id,
          capiExpected,
        },
        ...prev,
      ].slice(0, 50),
    );
  }

  function fireAll() {
    EVENTS.forEach((e, i) => setTimeout(() => fire(e), i * 350));
  }

  return (
    <div className="min-h-screen bg-background text-foreground p-6 md:p-10">
      <div className="max-w-5xl mx-auto space-y-6">
        <header className="space-y-2">
          <h1 className="text-3xl font-serif">Meta Pixel — Test Funnel</h1>
          <p className="text-sm text-muted-foreground">
            Interne QA-Seite. Jeder Button feuert <b>Browser-Pixel + CAPI</b> mit
            geteilter <code>event_id</code>. Verifizierung: Meta Events Manager
            ▸ Test Events, oder das eingeblendete <b>Pixel Debug Panel</b> rechts unten.
          </p>
          <div className="text-xs text-muted-foreground">
            Lead-ID: <code>{leadId}</code> · Appointment-ID: <code>{appointmentId}</code>
          </div>
        </header>

        <Card className="p-4 grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email (PII → CAPI hash)</Label>
            <Input id="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="phone">Phone</Label>
            <Input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="value">Value (EUR)</Label>
            <Input
              id="value"
              type="number"
              value={value}
              onChange={(e) => setValue(Number(e.target.value) || 0)}
            />
          </div>
        </Card>

        <div className="flex gap-2">
          <Button onClick={fireAll} variant="default">
            🔥 Alle Events nacheinander feuern
          </Button>
          <Button onClick={() => setLog([])} variant="outline">
            Log leeren
          </Button>
        </div>

        {Object.entries(grouped).map(([group, defs]) => (
          <Card key={group} className="p-4 space-y-3">
            <h2 className="text-lg font-semibold">{GROUP_LABEL[group as EventDef["group"]]}</h2>
            <Separator />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {defs.map((def) => (
                <div
                  key={def.key}
                  className="flex items-center justify-between gap-3 p-2 rounded-md border border-border"
                >
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{def.key}</div>
                    <div className="text-xs text-muted-foreground truncate">
                      → {def.meta} · {def.description}
                    </div>
                  </div>
                  <Button size="sm" onClick={() => fire(def)}>
                    Fire
                  </Button>
                </div>
              ))}
            </div>
          </Card>
        ))}

        <Card className="p-4">
          <h2 className="text-lg font-semibold mb-2">Trigger Log · Browser × CAPI</h2>
          {log.length === 0 ? (
            <p className="text-sm text-muted-foreground">Noch keine Events ausgelöst.</p>
          ) : (
            <div className="overflow-auto max-h-96 border border-border rounded-md">
              <table className="w-full text-xs font-mono">
                <thead className="bg-muted/50 sticky top-0">
                  <tr className="text-left">
                    <th className="px-2 py-1.5">Zeit</th>
                    <th className="px-2 py-1.5">Event</th>
                    <th className="px-2 py-1.5">event_id (Pixel ↔ CAPI)</th>
                    <th className="px-2 py-1.5">CAPI</th>
                    <th className="px-2 py-1.5">fbtrace_id</th>
                  </tr>
                </thead>
                <tbody>
                  {log.map((l, i) => {
                    const capi = capiByEventId.get(l.event_id);
                    const ageMs = Date.now() - l.tsMs;
                    // Correlation problems:
                    // 1) CAPI expected but no entry exists at all (after grace period)
                    // 2) Entry exists but stuck in "pending" too long (>5s)
                    // 3) Entry ok/error but missing fbtrace_id (Meta did not return one)
                    // 4) Entry status === "error"
                    const missingCapi = l.capiExpected && !capi && ageMs > 3000;
                    const stalePending =
                      l.capiExpected && capi?.status === "pending" && ageMs > 5000;
                    const missingTrace =
                      l.capiExpected &&
                      capi &&
                      capi.status !== "pending" &&
                      !capi.fbtrace_id;
                    const isError = capi?.status === "error";
                    const broken = missingCapi || stalePending || missingTrace || isError;

                    const statusColor =
                      capi?.status === "ok" ? "default" :
                      capi?.status === "error" ? "destructive" :
                      capi?.status === "pending" ? "secondary" :
                      "outline";
                    const statusLabel = missingCapi
                      ? "no CAPI"
                      : stalePending
                        ? "stale pending"
                        : capi
                          ? capi.status === "ok" ? `${capi.http_status ?? 200} OK`
                            : capi.status === "error" ? `ERR ${capi.http_status ?? ""}`
                            : "pending…"
                          : "—";
                    const rowClass = broken
                      ? "bg-destructive/10 border-l-2 border-l-destructive"
                      : "";
                    return (
                      <tr
                        key={i}
                        className={`border-t border-border align-top ${rowClass}`}
                        title={
                          broken
                            ? missingCapi
                              ? "CAPI mirror expected but no entry recorded"
                              : stalePending
                                ? "CAPI request still pending after 5s"
                                : missingTrace
                                  ? "CAPI responded without fbtrace_id"
                                  : "CAPI returned an error"
                            : undefined
                        }
                      >
                        <td className="px-2 py-1.5 text-muted-foreground whitespace-nowrap">{l.ts}</td>
                        <td className="px-2 py-1.5 whitespace-nowrap">
                          <div className="flex items-center gap-1.5">
                            {broken && <span aria-hidden className="text-destructive">⚠</span>}
                            <span>{l.event}</span>
                          </div>
                          <div className="text-muted-foreground">→ {l.meta}</div>
                        </td>
                        <td className="px-2 py-1.5 break-all max-w-[280px]">
                          <code className="text-[10px]">{l.event_id}</code>
                        </td>
                        <td className="px-2 py-1.5 whitespace-nowrap">
                          <Badge variant={statusColor as never}>{statusLabel}</Badge>
                        </td>
                        <td className="px-2 py-1.5 break-all max-w-[260px]">
                          {capi?.fbtrace_id ? (
                            <code className="text-[10px]">{capi.fbtrace_id}</code>
                          ) : capi?.error ? (
                            <span className="text-destructive text-[10px]">{capi.error}</span>
                          ) : missingTrace ? (
                            <span className="text-destructive text-[10px]">missing fbtrace_id</span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <p className="text-[10px] text-muted-foreground mt-2">
            Pixel-Only-Events (z. B. PageView, Custom Events) erscheinen ohne CAPI-Status —
            nur Standard-Events (Lead, Schedule, Purchase, …) werden gespiegelt.
          </p>
        </Card>

        <p className="text-xs text-muted-foreground">
          Hinweis: Pixel/CAPI feuern nur, wenn Cookie-Consent erteilt wurde
          (<code>window.__metaPixelActivated__ === true</code>). Ohne Consent siehst
          du Events ausschließlich im Debug-Panel.
        </p>
      </div>
    </div>
  );
}
