import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Loader2, RefreshCw, ShieldCheck, ShieldAlert } from "lucide-react";
import { toast } from "sonner";

type Report = {
  tests: Record<string, any>;
  counts: { operators_l6_plus: number; eligible_directors: number };
  blockers: string[];
  verdict: "READY" | "NOT READY";
  generated_at: string;
};

type OperatorRow = {
  operator_id: string;
  operator_name: string | null;
  operator_email: string | null;
  operator_level: number | null;
};

type DirectorOption = {
  id: string;
  full_name: string | null;
  email: string | null;
  current_level: number;
};

type TeamRow = {
  director_owner_id: string | null;
  director_owner_name: string | null;
  director_owner_email: string | null;
  traffic_owner: string | null;
  traffic_owner_name: string | null;
  traffic_owner_email: string | null;
  traffic_owner_level: number | null;
  leads: number;
  bookings: number;
  shows: number;
  deals: number;
  revenue: number;
  booking_rate: number | null;
  close_rate: number | null;
  revenue_per_lead: number | null;
};

type OpV2Row = TeamRow & {
  funnel_source: string | null;
  show_rate: number | null;
};

const TEST_LABELS: Record<string, string> = {
  test1_invalid_owner_fk: "TEST 1 — Invalid Owner FK",
  test2_level_violation: "TEST 2 — Level Violation (< L6)",
  test3_admin_leak: "TEST 3 — Admin Leak",
  test4_operators_without_director: "TEST 4 — Operators without Director",
  test5_completeness_score: "TEST 5 — Completeness Score",
  test6_directors_with_operators: "TEST 6 — Team Visibility",
  test7_traceable_lead_sample: "TEST 7 — Traceable Lead",
};

function testStatus(key: string, value: any): { ok: boolean; label: string } {
  if (key === "test5_completeness_score") {
    const n = Number(value ?? 0);
    return { ok: n >= 0.8, label: n.toFixed(4) };
  }
  if (key === "test6_directors_with_operators") {
    const n = Number(value ?? 0);
    return { ok: n >= 1, label: String(n) };
  }
  if (key === "test7_traceable_lead_sample") {
    return { ok: value != null, label: value ? "ok" : "no sample" };
  }
  const n = Number(value ?? 0);
  return { ok: n === 0, label: String(n) };
}

export default function OrsGovernance() {
  const [report, setReport] = useState<Report | null>(null);
  const [missing, setMissing] = useState<OperatorRow[]>([]);
  const [directors, setDirectors] = useState<DirectorOption[]>([]);
  const [team, setTeam] = useState<TeamRow[]>([]);
  const [perf, setPerf] = useState<OpV2Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [assigning, setAssigning] = useState<string | null>(null);
  const [pickedDirector, setPickedDirector] = useState<Record<string, string>>({});

  const load = async () => {
    setLoading(true);
    try {
      const [r, m, d, t, p] = await Promise.all([
        (supabase.rpc as any)("ors_validation_report"),
        (supabase.rpc as any)("ors_operator_directors_missing"),
        (supabase.rpc as any)("traffic_owner_eligible_list"),
        (supabase as any).from("operator_team_performance").select("*").limit(200),
        (supabase as any).from("operator_performance_v2").select("*").limit(200),
      ]);
      if (!r.error) setReport(r.data as Report);
      if (!m.error) setMissing((m.data as OperatorRow[]) ?? []);
      if (!d.error) {
        const all = (d.data as any[]) ?? [];
        setDirectors(all.filter((x) => Number(x.current_level) >= 7));
      }
      if (!t.error) setTeam((t.data as TeamRow[]) ?? []);
      if (!p.error) setPerf((p.data as OpV2Row[]) ?? []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const assignDirector = async (operatorId: string) => {
    const dirId = pickedDirector[operatorId];
    if (!dirId) { toast.error("Bitte einen Director auswählen"); return; }
    setAssigning(operatorId);
    try {
      const { error } = await (supabase.rpc as any)("set_operator_director", {
        _operator: operatorId,
        _director: dirId,
      });
      if (error) throw error;
      toast.success("Director zugewiesen");
      await load();
    } catch (e: any) {
      toast.error(e?.message ?? "Zuweisung fehlgeschlagen");
    } finally {
      setAssigning(null);
    }
  };

  const verdict = report?.verdict;

  return (
    <div className="container max-w-7xl py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">ORS Governance</h1>
          <p className="text-sm text-muted-foreground">
            Operator Revenue System — Owner / Director-Hierarchie und Validierung. Read-only mit Ausnahme der expliziten Director-Zuweisung.
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={load} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Aktualisieren
        </Button>
      </div>

      {/* Verdict */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            {verdict === "READY" ? (
              <><ShieldCheck className="h-5 w-5 text-emerald-600" /> Verdict</>
            ) : (
              <><ShieldAlert className="h-5 w-5 text-destructive" /> Verdict</>
            )}
            {verdict && (
              <Badge variant={verdict === "READY" ? "default" : "destructive"}>{verdict}</Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {report && (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="rounded border p-2">
                  <div className="text-xs text-muted-foreground">Operatoren (L≥6)</div>
                  <div className="text-lg font-semibold">{report.counts.operators_l6_plus}</div>
                </div>
                <div className="rounded border p-2">
                  <div className="text-xs text-muted-foreground">Eligible Directors</div>
                  <div className="text-lg font-semibold">{report.counts.eligible_directors}</div>
                </div>
                <div className="rounded border p-2">
                  <div className="text-xs text-muted-foreground">Completeness</div>
                  <div className="text-lg font-semibold">{Number(report.tests.test5_completeness_score ?? 0).toFixed(4)}</div>
                </div>
                <div className="rounded border p-2">
                  <div className="text-xs text-muted-foreground">Blockers</div>
                  <div className="text-lg font-semibold">{report.blockers.length}</div>
                </div>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Test</TableHead>
                    <TableHead>Wert</TableHead>
                    <TableHead className="text-right">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {Object.entries(report.tests).map(([k, v]) => {
                    const s = testStatus(k, v);
                    return (
                      <TableRow key={k}>
                        <TableCell className="text-sm">{TEST_LABELS[k] ?? k}</TableCell>
                        <TableCell className="font-mono text-xs">
                          {k === "test7_traceable_lead_sample" && v
                            ? `${(v as any).lead_id} → ${(v as any).traffic_owner} → ${(v as any).director_owner_id} (€${Number((v as any).deal_value ?? 0).toFixed(2)})`
                            : s.label}
                        </TableCell>
                        <TableCell className="text-right">
                          <Badge variant={s.ok ? "default" : "destructive"} className="text-[10px]">
                            {s.ok ? "PASS" : "FAIL"}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </>
          )}
        </CardContent>
      </Card>

      {/* Operators missing director */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">
            Operatoren ohne Director ({missing.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Operator</TableHead>
                <TableHead>Email</TableHead>
                <TableHead className="text-right">Level</TableHead>
                <TableHead>Director zuweisen</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {missing.length === 0 ? (
                <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-6">Alle Operatoren haben einen Director.</TableCell></TableRow>
              ) : missing.map((op) => (
                <TableRow key={op.operator_id}>
                  <TableCell className="text-sm">{op.operator_name || "—"}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{op.operator_email}</TableCell>
                  <TableCell className="text-right text-xs">L{op.operator_level}</TableCell>
                  <TableCell>
                    <Select
                      value={pickedDirector[op.operator_id] ?? ""}
                      onValueChange={(v) => setPickedDirector((s) => ({ ...s, [op.operator_id]: v }))}
                    >
                      <SelectTrigger className="h-8 w-64">
                        <SelectValue placeholder="Director wählen…" />
                      </SelectTrigger>
                      <SelectContent>
                        {directors.filter((d) => d.id !== op.operator_id).map((d) => (
                          <SelectItem key={d.id} value={d.id}>
                            {d.full_name || d.email} (L{d.current_level})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <Button
                      size="sm"
                      onClick={() => assignDirector(op.operator_id)}
                      disabled={assigning === op.operator_id || !pickedDirector[op.operator_id]}
                    >
                      {assigning === op.operator_id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Zuweisen"}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Team performance */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Team Performance (Director → Operator)</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Director</TableHead>
                <TableHead>Operator</TableHead>
                <TableHead className="text-right">Leads</TableHead>
                <TableHead className="text-right">Bookings</TableHead>
                <TableHead className="text-right">Shows</TableHead>
                <TableHead className="text-right">Deals</TableHead>
                <TableHead className="text-right">Revenue</TableHead>
                <TableHead className="text-right">€ / Lead</TableHead>
                <TableHead className="text-right">Booking%</TableHead>
                <TableHead className="text-right">Close%</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {team.length === 0 ? (
                <TableRow><TableCell colSpan={10} className="text-center text-muted-foreground py-6">Keine Team-Performance-Daten.</TableCell></TableRow>
              ) : team.map((r, i) => (
                <TableRow key={`${r.director_owner_id ?? "none"}-${r.traffic_owner ?? "none"}-${i}`}>
                  <TableCell className="text-xs">{r.director_owner_name || <span className="text-muted-foreground italic">— kein Director —</span>}</TableCell>
                  <TableCell className="text-xs">{r.traffic_owner_name || <span className="text-muted-foreground italic">— kein Owner —</span>}</TableCell>
                  <TableCell className="text-right text-xs">{Number(r.leads ?? 0).toLocaleString("de-DE")}</TableCell>
                  <TableCell className="text-right text-xs">{Number(r.bookings ?? 0).toLocaleString("de-DE")}</TableCell>
                  <TableCell className="text-right text-xs">{Number(r.shows ?? 0).toLocaleString("de-DE")}</TableCell>
                  <TableCell className="text-right text-xs">{Number(r.deals ?? 0).toLocaleString("de-DE")}</TableCell>
                  <TableCell className="text-right text-xs">€{Number(r.revenue ?? 0).toLocaleString("de-DE")}</TableCell>
                  <TableCell className="text-right text-xs">€{Number(r.revenue_per_lead ?? 0).toFixed(2)}</TableCell>
                  <TableCell className="text-right text-xs">{r.booking_rate != null ? `${(Number(r.booking_rate) * 100).toFixed(1)}%` : "—"}</TableCell>
                  <TableCell className="text-right text-xs">{r.close_rate != null ? `${(Number(r.close_rate) * 100).toFixed(1)}%` : "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Operator performance v2 */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Operator Performance (mit Owner- &amp; Director-Identität)</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Owner</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Lvl</TableHead>
                <TableHead>Director</TableHead>
                <TableHead>Funnel</TableHead>
                <TableHead className="text-right">Leads</TableHead>
                <TableHead className="text-right">Revenue</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {perf.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-6">—</TableCell></TableRow>
              ) : perf.map((r, i) => (
                <TableRow key={`${r.traffic_owner ?? "none"}-${r.funnel_source ?? "none"}-${i}`}>
                  <TableCell className="text-xs">{r.traffic_owner_name || <span className="text-muted-foreground italic">—</span>}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{r.traffic_owner_email}</TableCell>
                  <TableCell className="text-xs">{r.traffic_owner_level ? `L${r.traffic_owner_level}` : "—"}</TableCell>
                  <TableCell className="text-xs">{r.director_owner_name || <span className="text-muted-foreground italic">—</span>}</TableCell>
                  <TableCell className="text-xs font-mono">{r.funnel_source || "—"}</TableCell>
                  <TableCell className="text-right text-xs">{Number(r.leads ?? 0).toLocaleString("de-DE")}</TableCell>
                  <TableCell className="text-right text-xs">€{Number(r.revenue ?? 0).toLocaleString("de-DE")}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        Governance: Owner-Zuweisung erfolgt nur via Mapping (L≥6 / Owner / Partner-Admin). Director-Zuweisung nur via expliziten Klick (L≥7 oder Owner / Partner-Admin). Kein Admin-Fallback. Keine Auto-Promotion.
      </p>
    </div>
  );
}
