import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Play, CheckCircle2, XCircle, AlertCircle } from "lucide-react";
import { toast } from "sonner";

type RunRow = {
  id: string;
  created_at: string;
  status: string;
  final_result: string | null;
  inputs: Record<string, unknown>;
  report: Record<string, unknown> | null;
  logs: Array<Record<string, unknown>> | null;
  artifacts: Record<string, unknown> | null;
  error_message: string | null;
};

const initialInputs = {
  number_of_test_users: 1,
  funnel_source: "meta" as "meta" | "google" | "direct",
  quiz_profile_type: "professional" as "starter" | "professional" | "elite",
  booking_type: "standard" as "standard" | "priority",
  setter_selection: "auto" as string,
  closer_selection: "auto" as string,
  payment_type: "skipped" as "test_success" | "test_failed" | "skipped",
  progression_target: "L1" as "L1" | "L2" | "L3" | "L4",
};

export default function GoLiveSimulation() {
  const [inputs, setInputs] = useState(initialInputs);
  const [running, setRunning] = useState(false);
  const [activeRun, setActiveRun] = useState<RunRow | null>(null);
  const [history, setHistory] = useState<RunRow[]>([]);

  async function loadHistory() {
    const { data, error } = await supabase
      .from("go_live_simulations" as never)
      .select("*")
      .order("created_at", { ascending: false })
      .limit(20);
    if (!error && data) setHistory(data as unknown as RunRow[]);
  }

  useEffect(() => {
    loadHistory();
  }, []);

  async function startSimulation() {
    setRunning(true);
    setActiveRun(null);
    try {
      const { data, error } = await supabase.functions.invoke("go-live-simulator", {
        body: { inputs },
      });
      if (error) throw error;
      const runId = (data as { runId?: string })?.runId;
      if (runId) {
        const { data: row } = await supabase
          .from("go_live_simulations" as never)
          .select("*")
          .eq("id", runId)
          .single();
        if (row) setActiveRun(row as unknown as RunRow);
      }
      toast.success("Simulation abgeschlossen");
      await loadHistory();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(`Simulation fehlgeschlagen: ${msg}`);
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="container mx-auto p-6 space-y-6 max-w-6xl">
      <div>
        <h1 className="text-3xl font-bold">Go-Live Simulation</h1>
        <p className="text-muted-foreground mt-1">
          End-to-End Funnel-Test mit synthetischen Bewerbern. Alle Daten werden mit
          <code className="mx-1 px-1 py-0.5 bg-muted rounded text-xs">is_simulation=true</code>
          markiert.
        </p>
      </div>

      {/* Inputs */}
      <Card>
        <CardHeader>
          <CardTitle>Simulation konfigurieren</CardTitle>
          <CardDescription>MVP-Slice: Phasen 1–7 (Landing → Quiz → Lead → Booking → Bewerberbereich)</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="users">Anzahl Test-User</Label>
            <Input
              id="users"
              type="number"
              min={1}
              max={20}
              value={inputs.number_of_test_users}
              onChange={(e) =>
                setInputs({ ...inputs, number_of_test_users: Number(e.target.value) })
              }
            />
          </div>
          <div className="space-y-2">
            <Label>Funnel Source</Label>
            <Select
              value={inputs.funnel_source}
              onValueChange={(v) => setInputs({ ...inputs, funnel_source: v as typeof inputs.funnel_source })}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="meta">Meta</SelectItem>
                <SelectItem value="google">Google</SelectItem>
                <SelectItem value="direct">Direct</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Quiz-Profil</Label>
            <Select
              value={inputs.quiz_profile_type}
              onValueChange={(v) => setInputs({ ...inputs, quiz_profile_type: v as typeof inputs.quiz_profile_type })}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="starter">Starter</SelectItem>
                <SelectItem value="professional">Professional</SelectItem>
                <SelectItem value="elite">Elite</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Booking-Typ</Label>
            <Select
              value={inputs.booking_type}
              onValueChange={(v) => setInputs({ ...inputs, booking_type: v as typeof inputs.booking_type })}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="standard">Standard</SelectItem>
                <SelectItem value="priority">Priority / Fastlane</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Setter-Zuweisung</Label>
            <Input
              value={inputs.setter_selection}
              onChange={(e) => setInputs({ ...inputs, setter_selection: e.target.value })}
              placeholder="auto oder user_id"
            />
          </div>
          <div className="space-y-2">
            <Label>Closer-Zuweisung</Label>
            <Input
              value={inputs.closer_selection}
              onChange={(e) => setInputs({ ...inputs, closer_selection: e.target.value })}
              placeholder="auto oder user_id"
            />
          </div>
          <div className="space-y-2">
            <Label>Payment</Label>
            <Select
              value={inputs.payment_type}
              onValueChange={(v) => setInputs({ ...inputs, payment_type: v as typeof inputs.payment_type })}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="skipped">Skipped (MVP)</SelectItem>
                <SelectItem value="test_success">Test Success (Phase 11)</SelectItem>
                <SelectItem value="test_failed">Test Failed (Phase 11)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Progression Target</Label>
            <Select
              value={inputs.progression_target}
              onValueChange={(v) => setInputs({ ...inputs, progression_target: v as typeof inputs.progression_target })}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="L1">L1</SelectItem>
                <SelectItem value="L2">L2</SelectItem>
                <SelectItem value="L3">L3</SelectItem>
                <SelectItem value="L4">L4</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="md:col-span-2">
            <Button onClick={startSimulation} disabled={running} size="lg" className="w-full md:w-auto">
              {running ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
              Simulation starten
            </Button>
            <p className="text-xs text-muted-foreground mt-2">
              Hinweis: Phasen 8–15 (Reminders, Setter-Outcome, Closer-Handover, Stripe, Onboarding, Level-Up) sind im MVP noch nicht aktiv.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Active run result */}
      {activeRun && <RunCard run={activeRun} title="Aktueller Lauf" />}

      {/* History */}
      <Card>
        <CardHeader>
          <CardTitle>Letzte Läufe</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {history.length === 0 && <p className="text-sm text-muted-foreground">Noch keine Läufe.</p>}
          {history.map((r) => (
            <RunSummaryRow key={r.id} run={r} />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function statusBadge(status: string, finalResult: string | null) {
  if (finalResult === "PASS") return <Badge className="bg-primary text-primary-foreground"><CheckCircle2 className="w-3 h-3 mr-1" />PASS</Badge>;
  if (finalResult === "FAIL") return <Badge variant="destructive"><XCircle className="w-3 h-3 mr-1" />FAIL</Badge>;
  if (status === "running") return <Badge variant="secondary"><Loader2 className="w-3 h-3 mr-1 animate-spin" />running</Badge>;
  return <Badge variant="outline"><AlertCircle className="w-3 h-3 mr-1" />{status}</Badge>;
}

function RunSummaryRow({ run }: { run: RunRow }) {
  const report = run.report ?? {};
  return (
    <div className="flex items-start justify-between border rounded-md p-3 gap-3">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          {statusBadge(run.status, run.final_result)}
          <code className="text-xs text-muted-foreground truncate">{run.id}</code>
        </div>
        <div className="text-xs text-muted-foreground mt-1">
          {new Date(run.created_at).toLocaleString("de-DE")} · users: {(run.inputs as { number_of_test_users?: number })?.number_of_test_users ?? "?"} · source: {(run.inputs as { funnel_source?: string })?.funnel_source ?? "?"}
        </div>
        {report && (
          <div className="text-xs mt-1">
            ✓ {(report as { completed_users?: number }).completed_users ?? 0} / {(report as { total_users?: number }).total_users ?? 0} angelegt · sichtbar: {(report as { visible_in_bewerberbereich?: number }).visible_in_bewerberbereich ?? 0} · Fehler: {(report as { errors?: number }).errors ?? 0}
          </div>
        )}
      </div>
    </div>
  );
}

function RunCard({ run, title }: { run: RunRow; title: string }) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle>{title}</CardTitle>
          {statusBadge(run.status, run.final_result)}
        </div>
        <CardDescription><code className="text-xs">{run.id}</code></CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {run.report && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            <Stat label="Users gesamt" value={(run.report as { total_users?: number }).total_users ?? 0} />
            <Stat label="Erfolgreich" value={(run.report as { completed_users?: number }).completed_users ?? 0} />
            <Stat label="Sichtbar" value={(run.report as { visible_in_bewerberbereich?: number }).visible_in_bewerberbereich ?? 0} />
            <Stat label="Fehler" value={(run.report as { errors?: number }).errors ?? 0} />
          </div>
        )}

        {run.artifacts && Array.isArray((run.artifacts as { users?: unknown[] }).users) && (
          <div>
            <h4 className="font-semibold text-sm mb-2">Test-User</h4>
            <div className="space-y-1 text-xs font-mono bg-muted p-3 rounded max-h-64 overflow-auto">
              {((run.artifacts as { users: Array<Record<string, unknown>> }).users).map((u, i) => (
                <div key={i}>
                  #{u.index as number} · {u.email as string} · lead {String(u.lead_id ?? "—").slice(0, 8)} · appt {String(u.appointment_id ?? "—").slice(0, 8)} · setter {String(u.setter_id ?? "—").slice(0, 8)} · {u.visibility_ok ? "✓ visible" : "× not visible"}
                </div>
              ))}
            </div>
          </div>
        )}

        {run.logs && (
          <div>
            <h4 className="font-semibold text-sm mb-2">Logs ({run.logs.length})</h4>
            <div className="space-y-1 text-xs font-mono bg-muted p-3 rounded max-h-80 overflow-auto">
              {run.logs.map((l, i) => {
                const level = (l.level as string) ?? "info";
                const color = level === "error" ? "text-destructive" : level === "warn" ? "text-amber-600" : "text-muted-foreground";
                return (
                  <div key={i} className={color}>
                    [{(l.phase as string) ?? "?"}{l.user_index ? ` u${l.user_index}` : ""}] {l.message as string}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {run.error_message && (
          <div className="text-sm text-destructive">{run.error_message}</div>
        )}
      </CardContent>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="border rounded p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-2xl font-bold">{value}</div>
    </div>
  );
}
