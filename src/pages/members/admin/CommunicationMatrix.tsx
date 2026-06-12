import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TOUCHPOINT_MATRIX, CHANNEL_ROLES, type CommChannel } from "@/lib/communication-os";
import { WHATSAPP_TEMPLATES, TONE_LABEL, renderWhatsAppTemplate } from "@/lib/whatsapp-message-library";
import HumanizerPanel from "@/components/admin/HumanizerPanel";
import ConversationTreePanel from "@/components/admin/ConversationTreePanel";
import ABTestPanel from "@/components/admin/ABTestPanel";
import OutcomeTagPanel from "@/components/admin/OutcomeTagPanel";
import VariableValidationPanel from "@/components/admin/VariableValidationPanel";
import ToneRetunePanel from "@/components/admin/ToneRetunePanel";
import ToneExperimentPanel from "@/components/admin/ToneExperimentPanel";

interface DispatchRow {
  id: string;
  event_key: string;
  phase: string;
  purpose: string;
  primary_channel: CommChannel;
  fallback_channel: CommChannel | null;
  fallback_used: boolean;
  status: string;
  error_message: string | null;
  recipient: string | null;
  dispatched_at: string;
  outcome: string | null;
}

const outcomeColor: Record<string, string> = {
  closed: "bg-emerald-100 text-emerald-900",
  showed: "bg-green-100 text-green-900",
  booked: "bg-teal-100 text-teal-900",
  rescheduled: "bg-amber-100 text-amber-900",
  replied: "bg-blue-100 text-blue-900",
  clicked: "bg-indigo-100 text-indigo-900",
  no_response: "bg-stone-200 text-stone-800",
  no_show: "bg-red-100 text-red-900",
  pending: "bg-yellow-50 text-yellow-800",
};

const channelColor: Record<CommChannel, string> = {
  whatsapp: "bg-green-100 text-green-900",
  sms: "bg-blue-100 text-blue-900",
  push: "bg-purple-100 text-purple-900",
  email: "bg-stone-100 text-stone-900",
};

const statusColor: Record<string, string> = {
  sent: "bg-green-100 text-green-900",
  failed: "bg-red-100 text-red-900",
  suppressed_dedup: "bg-yellow-100 text-yellow-900",
  no_recipient: "bg-orange-100 text-orange-900",
  queued: "bg-stone-100 text-stone-900",
};

export default function CommunicationMatrix() {
  const [logs, setLogs] = useState<DispatchRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from("communication_dispatch_log")
        .select("id,event_key,phase,purpose,primary_channel,fallback_channel,fallback_used,status,error_message,recipient,dispatched_at,outcome")
        .order("dispatched_at", { ascending: false })
        .limit(200);
      if (!error && data) setLogs(data as DispatchRow[]);
      setLoading(false);
    })();
  }, []);

  const channelHealth = useMemo(() => {
    const acc: Record<CommChannel, { sent: number; failed: number }> = {
      whatsapp: { sent: 0, failed: 0 },
      sms: { sent: 0, failed: 0 },
      push: { sent: 0, failed: 0 },
      email: { sent: 0, failed: 0 },
    };
    for (const r of logs) {
      const ch = r.fallback_used && r.fallback_channel ? r.fallback_channel : r.primary_channel;
      if (r.status === "sent") acc[ch].sent += 1;
      else if (r.status === "failed") acc[ch].failed += 1;
    }
    return acc;
  }, [logs]);

  const phases = useMemo(() => {
    const order = ["lead_entry", "booking", "pre_call", "call", "post_call", "onboarding", "talent_engine"];
    return order.map((p) => ({ phase: p, items: TOUCHPOINT_MATRIX.filter((t) => t.phase === p) }));
  }, []);

  return (
    <div className="container mx-auto px-4 py-8 space-y-8 bg-cream min-h-screen">
      <header>
        <p className="text-xs uppercase tracking-widest text-stone-500">Layer 48</p>
        <h1 className="font-serif text-4xl text-ink">Communication Operating System</h1>
        <p className="text-stone-600 mt-2">
          Jede Nachricht hat einen Kanal, einen Zweck und ein Log. WhatsApp = Action · SMS = Backup · Push = Attention · Email = Documentation.
        </p>
      </header>

      <section className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {(Object.keys(CHANNEL_ROLES) as CommChannel[]).map((ch) => (
          <Card key={ch}>
            <CardHeader className="pb-2">
              <CardTitle className="capitalize text-base flex items-center gap-2">
                <span className={`px-2 py-0.5 rounded text-xs ${channelColor[ch]}`}>{ch}</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-stone-500">{CHANNEL_ROLES[ch].role}</p>
              <p className="text-xs text-stone-400 mt-1">{CHANNEL_ROLES[ch].character}</p>
              <div className="mt-3 flex gap-3 text-sm">
                <span className="text-green-700">✓ {channelHealth[ch].sent}</span>
                <span className="text-red-700">✗ {channelHealth[ch].failed}</span>
              </div>
            </CardContent>
          </Card>
        ))}
      </section>

      <section className="space-y-4">
        <h2 className="font-serif text-2xl text-ink">Touchpoint Matrix</h2>
        {phases.map(({ phase, items }) => (
          <Card key={phase}>
            <CardHeader className="pb-2">
              <CardTitle className="capitalize text-sm text-stone-700">{phase.replace(/_/g, " ")}</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Event</TableHead>
                    <TableHead>Purpose</TableHead>
                    <TableHead>Primary</TableHead>
                    <TableHead>Fallback</TableHead>
                    <TableHead>Rationale</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((t) => (
                    <TableRow key={t.event_key}>
                      <TableCell className="font-mono text-xs">{t.event_key}</TableCell>
                      <TableCell><Badge variant="outline" className="capitalize">{t.purpose}</Badge></TableCell>
                      <TableCell><span className={`px-2 py-0.5 rounded text-xs ${channelColor[t.primary]}`}>{t.primary}</span></TableCell>
                      <TableCell>{t.fallback ? <span className={`px-2 py-0.5 rounded text-xs ${channelColor[t.fallback]}`}>{t.fallback}</span> : <span className="text-stone-400 text-xs">—</span>}</TableCell>
                      <TableCell className="text-xs text-stone-600">{t.rationale}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        ))}
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="font-serif text-2xl text-ink">WhatsApp Message Library</h2>
          <p className="text-sm text-stone-600 mt-1">
            15 canonical templates. WhatsApp = Action / Reaction. Sourced from <code className="text-xs">src/lib/whatsapp-message-library.ts</code> — never inline. Variables auto-rendered with sample values for preview.
          </p>
        </div>
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[60px]">#</TableHead>
                  <TableHead>Template</TableHead>
                  <TableHead>Tone</TableHead>
                  <TableHead>Variables</TableHead>
                  <TableHead className="min-w-[320px]">Preview (DE)</TableHead>
                  <TableHead className="min-w-[320px]">Preview (EN)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {WHATSAPP_TEMPLATES.map((t, i) => {
                  // Build sample vars so preview renders without "MISSING".
                  const sampleVars: Record<string, string> = {};
                  for (const v of t.variables) {
                    sampleVars[v] =
                      v === "name" ? "Alex" :
                      v === "score" ? "14" :
                      v === "income_goal" ? "10k/Monat" :
                      v === "time" ? "Mittwoch 15:00" :
                      v.endsWith("_link") || v === "link" ? "https://etc.de/x" :
                      `{${v}}`;
                  }
                  const de = renderWhatsAppTemplate(t.template_key, sampleVars, "de")?.body ?? "";
                  const en = renderWhatsAppTemplate(t.template_key, sampleVars, "en")?.body ?? "";
                  return (
                    <TableRow key={t.template_key} className="align-top">
                      <TableCell className="text-xs text-stone-500 pt-3">{i + 1}</TableCell>
                      <TableCell className="pt-3">
                        <div className="font-mono text-xs">{t.template_key}</div>
                        <div className="text-[10px] text-stone-500 mt-0.5">→ {t.event_key}</div>
                      </TableCell>
                      <TableCell className="pt-3">
                        <Badge variant="outline" className="text-xs">{TONE_LABEL[t.tone]}</Badge>
                      </TableCell>
                      <TableCell className="pt-3">
                        {t.variables.length === 0 ? (
                          <span className="text-xs text-stone-400">none</span>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {t.variables.map((v) => (
                              <code key={v} className="text-[10px] bg-stone-100 px-1.5 py-0.5 rounded">{v}</code>
                            ))}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="pt-3">
                        <pre className="text-xs whitespace-pre-wrap font-sans bg-stone-50 p-2 rounded border border-stone-200">{de}</pre>
                      </TableCell>
                      <TableCell className="pt-3">
                        <pre className="text-xs whitespace-pre-wrap font-sans bg-stone-50 p-2 rounded border border-stone-200">{en}</pre>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </section>

      <section className="space-y-3">
        <VariableValidationPanel />
      </section>

      <section className="space-y-3">
        <ToneRetunePanel />
      </section>

      <section className="space-y-3">
        <ToneExperimentPanel />
      </section>

      <section className="space-y-3">
        <HumanizerPanel />
      </section>

      <section className="space-y-3">
        <ConversationTreePanel />
      </section>

      <section className="space-y-3">
        <ABTestPanel />
      </section>

      <section className="space-y-3">
        <OutcomeTagPanel />
      </section>

      <section className="space-y-3">
        <h2 className="font-serif text-2xl text-ink">Live Dispatch Log <span className="text-xs text-stone-500">(letzte 200)</span></h2>
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            {loading ? (
              <p className="p-6 text-stone-500">Lade…</p>
            ) : logs.length === 0 ? (
              <p className="p-6 text-stone-500">Noch keine Sendungen geloggt.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Zeit</TableHead>
                    <TableHead>Event</TableHead>
                    <TableHead>Kanal</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Outcome</TableHead>
                    <TableHead>Empfänger</TableHead>
                    <TableHead>Fehler</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.map((r) => {
                    const ch = r.fallback_used && r.fallback_channel ? r.fallback_channel : r.primary_channel;
                    return (
                      <TableRow key={r.id}>
                        <TableCell className="text-xs whitespace-nowrap">{new Date(r.dispatched_at).toLocaleString()}</TableCell>
                        <TableCell className="font-mono text-xs">{r.event_key}</TableCell>
                        <TableCell>
                          <span className={`px-2 py-0.5 rounded text-xs ${channelColor[ch]}`}>{ch}</span>
                          {r.fallback_used && <span className="ml-1 text-[10px] text-orange-700">(fb)</span>}
                        </TableCell>
                        <TableCell><span className={`px-2 py-0.5 rounded text-xs ${statusColor[r.status] ?? ""}`}>{r.status}</span></TableCell>
                        <TableCell>
                          {r.outcome ? (
                            <span className={`px-2 py-0.5 rounded text-xs ${outcomeColor[r.outcome] ?? "bg-stone-100 text-stone-700"}`}>{r.outcome}</span>
                          ) : (
                            <span className="text-stone-400 text-xs">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-xs">{r.recipient ?? "—"}</TableCell>
                        <TableCell className="text-xs text-red-700 max-w-xs truncate">{r.error_message ?? ""}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
