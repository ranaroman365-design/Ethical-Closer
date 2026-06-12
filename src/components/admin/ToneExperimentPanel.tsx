/**
 * Layer 48.9 UI — Tone Experiments
 *
 * Controlled A/B/C testing of tone hints (high_performer / uncertain /
 * slow_responder / neutral) for the SAME event_key. Lifecycle:
 *   draft → pending_approval → running → (paused) → completed
 * Only admins can create / submit / approve / reject / pause / complete.
 */
import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { WHATSAPP_TEMPLATES } from "@/lib/whatsapp-message-library";

type Arm = "high_performer" | "uncertain" | "slow_responder" | "neutral";
const ALL_ARMS: Arm[] = ["high_performer", "uncertain", "slow_responder", "neutral"];

type Status =
  | "draft" | "pending_approval" | "approved" | "running"
  | "paused" | "completed" | "rejected" | "archived";

interface Experiment {
  id: string;
  name: string;
  event_key: string;
  hypothesis: string | null;
  arms: string[];
  min_sample_per_arm: number;
  status: Status;
  winning_arm: string | null;
  submitted_at: string | null;
  approved_at: string | null;
  rejected_at: string | null;
  rejection_reason: string | null;
  started_at: string | null;
  paused_at: string | null;
  completed_at: string | null;
  created_at: string;
}

interface ResultRow {
  experiment_id: string;
  experiment_name: string;
  event_key: string;
  status: Status;
  arm: Arm;
  sends: number;
  engaged: number;
  booked: number;
  showed: number;
  closed: number;
  hard_rate_pct: number | null;
}

const STATUS_TONE: Record<Status, string> = {
  draft: "bg-stone-100 text-stone-700",
  pending_approval: "bg-amber-100 text-amber-800",
  approved: "bg-emerald-100 text-emerald-800",
  running: "bg-emerald-100 text-emerald-800",
  paused: "bg-stone-200 text-stone-700",
  completed: "bg-blue-100 text-blue-800",
  rejected: "bg-rose-100 text-rose-800",
  archived: "bg-stone-100 text-stone-500",
};

export default function ToneExperimentPanel() {
  const [experiments, setExperiments] = useState<Experiment[]>([]);
  const [results, setResults] = useState<ResultRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  // form state
  const [name, setName] = useState("Tone test · quiz_completed");
  const [eventKey, setEventKey] = useState<string>(WHATSAPP_TEMPLATES[1]?.event_key ?? "");
  const [hypothesis, setHypothesis] = useState(
    "High-performer tone outperforms uncertain on hard-conversion for high-score leads.",
  );
  const [selectedArms, setSelectedArms] = useState<Arm[]>(["high_performer", "uncertain", "neutral"]);
  const [minSample, setMinSample] = useState(30);
  const [creating, setCreating] = useState(false);

  const load = async () => {
    setLoading(true);
    const [{ data: exps }, { data: res }, { data: u }] = await Promise.all([
      supabase
        .from("tone_experiments")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50),
      supabase.from("v_tone_experiment_results").select("*"),
      supabase.auth.getUser(),
    ]);
    setExperiments((exps as Experiment[] | null) ?? []);
    setResults((res as ResultRow[] | null) ?? []);
    if (u?.user?.id) {
      const { data: roles } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", u.user.id);
      setIsAdmin((roles ?? []).some((r) => r.role === "admin"));
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const eventOptions = useMemo(
    () => Array.from(new Set(WHATSAPP_TEMPLATES.map((t) => t.event_key))),
    [],
  );

  const resultsByExp = useMemo(() => {
    const m = new Map<string, ResultRow[]>();
    for (const r of results) {
      const arr = m.get(r.experiment_id) ?? [];
      arr.push(r);
      m.set(r.experiment_id, arr);
    }
    return m;
  }, [results]);

  const create = async () => {
    if (selectedArms.length < 2) {
      toast.error("Pick at least 2 arms");
      return;
    }
    setCreating(true);
    const { error } = await supabase.from("tone_experiments").insert({
      name,
      event_key: eventKey,
      hypothesis,
      arms: selectedArms,
      min_sample_per_arm: minSample,
      status: "draft",
    });
    setCreating(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Draft experiment created");
    setName("Tone test · " + eventKey);
    await load();
  };

  const callRpc = async (
    fn:
      | "submit_tone_experiment_for_approval"
      | "approve_tone_experiment"
      | "reject_tone_experiment"
      | "pause_tone_experiment"
      | "complete_tone_experiment",
    id: string,
    extra?: Record<string, unknown>,
  ) => {
    const { error } = await supabase.rpc(fn as never, { _id: id, ...extra } as never);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Updated");
    await load();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-serif text-2xl text-ink">Tone Experiments</CardTitle>
        <p className="text-sm text-stone-600 mt-1">
          Layer 48.9 — Controlled experiments comparing tone hints (high_performer · uncertain ·
          slow_responder · neutral) for the same event. Admin must approve before any traffic
          is split. Hard-conversion (booked + showed + closed) decides the winner.
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Create form (admins only) */}
        {isAdmin ? (
          <div className="rounded-2xl border border-stone-200 p-4 space-y-3 bg-stone-50/40">
            <p className="text-xs uppercase tracking-wide text-stone-500">New experiment (draft)</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="text-xs uppercase tracking-wide text-stone-500">Name</label>
                <Input value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div>
                <label className="text-xs uppercase tracking-wide text-stone-500">Event key</label>
                <Select value={eventKey} onValueChange={setEventKey}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent className="max-h-72">
                    {eventOptions.map((ek) => (
                      <SelectItem key={ek} value={ek}>{ek}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="md:col-span-2">
                <label className="text-xs uppercase tracking-wide text-stone-500">Hypothesis</label>
                <Textarea rows={2} value={hypothesis} onChange={(e) => setHypothesis(e.target.value)} />
              </div>
              <div className="md:col-span-2">
                <label className="text-xs uppercase tracking-wide text-stone-500 block mb-2">
                  Arms (2–4)
                </label>
                <div className="flex flex-wrap gap-3">
                  {ALL_ARMS.map((a) => {
                    const checked = selectedArms.includes(a);
                    return (
                      <label
                        key={a}
                        className="flex items-center gap-2 text-sm border border-stone-200 rounded-lg px-3 py-1.5 bg-white"
                      >
                        <Checkbox
                          checked={checked}
                          onCheckedChange={(v) =>
                            setSelectedArms((prev) =>
                              v ? Array.from(new Set([...prev, a])) : prev.filter((x) => x !== a),
                            )
                          }
                        />
                        <span>{a}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
              <div>
                <label className="text-xs uppercase tracking-wide text-stone-500">
                  Min sample / arm
                </label>
                <Input
                  type="number"
                  min={10}
                  value={minSample}
                  onChange={(e) => setMinSample(Number(e.target.value) || 30)}
                />
              </div>
            </div>
            <div className="flex justify-end">
              <Button onClick={create} disabled={creating || !eventKey}>
                {creating ? "Creating…" : "Create draft"}
              </Button>
            </div>
            <p className="text-[11px] text-stone-500">
              Drafts don't split traffic. Submit for approval, then approve to start traffic
              assignment via <code>assign_tone_arm()</code>.
            </p>
          </div>
        ) : (
          <p className="text-xs text-stone-500">
            Read-only view — only admins can create or approve experiments.
          </p>
        )}

        {/* Experiments list */}
        <div>
          <p className="text-xs uppercase tracking-wide text-stone-500 mb-2">
            Experiments ({experiments.length})
          </p>
          {loading ? (
            <p className="text-sm text-stone-500">Loading…</p>
          ) : experiments.length === 0 ? (
            <p className="text-sm text-stone-500">No experiments yet.</p>
          ) : (
            <div className="space-y-3">
              {experiments.map((e) => {
                const rs = resultsByExp.get(e.id) ?? [];
                return (
                  <div key={e.id} className="border border-stone-200 rounded-2xl p-4">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="font-medium text-ink">{e.name}</p>
                        <p className="text-xs text-stone-500">
                          event: <code>{e.event_key}</code> · arms: {e.arms.join(", ")} · min/arm:{" "}
                          {e.min_sample_per_arm}
                        </p>
                        {e.hypothesis && (
                          <p className="text-xs text-stone-600 mt-1 italic">"{e.hypothesis}"</p>
                        )}
                        {e.status === "rejected" && e.rejection_reason && (
                          <p className="text-xs text-rose-700 mt-1">
                            Rejected: {e.rejection_reason}
                          </p>
                        )}
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        <Badge className={STATUS_TONE[e.status]} variant="secondary">
                          {e.status}
                        </Badge>
                        {e.winning_arm && (
                          <Badge variant="outline" className="text-[10px]">
                            winner: {e.winning_arm}
                          </Badge>
                        )}
                      </div>
                    </div>

                    {/* Results table */}
                    {rs.length > 0 && (
                      <Table className="mt-3">
                        <TableHeader>
                          <TableRow>
                            <TableHead>Arm</TableHead>
                            <TableHead className="text-right">Sends</TableHead>
                            <TableHead className="text-right">Engaged</TableHead>
                            <TableHead className="text-right">Booked</TableHead>
                            <TableHead className="text-right">Showed</TableHead>
                            <TableHead className="text-right">Closed</TableHead>
                            <TableHead className="text-right">Hard %</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {rs.map((r) => (
                            <TableRow key={r.arm}>
                              <TableCell className="text-sm">{r.arm}</TableCell>
                              <TableCell className="text-sm text-right">{r.sends}</TableCell>
                              <TableCell className="text-sm text-right">{r.engaged}</TableCell>
                              <TableCell className="text-sm text-right">{r.booked}</TableCell>
                              <TableCell className="text-sm text-right">{r.showed}</TableCell>
                              <TableCell className="text-sm text-right">{r.closed}</TableCell>
                              <TableCell className="text-sm text-right">
                                {r.hard_rate_pct ?? 0}%
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    )}

                    {/* Lifecycle controls */}
                    {isAdmin && (
                      <div className="flex flex-wrap gap-2 mt-3">
                        {(e.status === "draft" || e.status === "rejected") && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => callRpc("submit_tone_experiment_for_approval", e.id)}
                          >
                            Submit for approval
                          </Button>
                        )}
                        {e.status === "pending_approval" && (
                          <>
                            <Button
                              size="sm"
                              onClick={() => callRpc("approve_tone_experiment", e.id)}
                            >
                              Approve & start
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                const reason = prompt("Reason for rejection?") ?? null;
                                callRpc("reject_tone_experiment", e.id, { _reason: reason });
                              }}
                            >
                              Reject
                            </Button>
                          </>
                        )}
                        {e.status === "running" && (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => callRpc("pause_tone_experiment", e.id)}
                            >
                              Pause
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                const winner = prompt(
                                  "Declare winning arm (or leave empty):",
                                  "",
                                );
                                callRpc("complete_tone_experiment", e.id, {
                                  _winning_arm: winner || null,
                                });
                              }}
                            >
                              Complete
                            </Button>
                          </>
                        )}
                        {e.status === "paused" && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              const winner = prompt(
                                "Declare winning arm (or leave empty):",
                                "",
                              );
                              callRpc("complete_tone_experiment", e.id, {
                                _winning_arm: winner || null,
                              });
                            }}
                          >
                            Complete
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
