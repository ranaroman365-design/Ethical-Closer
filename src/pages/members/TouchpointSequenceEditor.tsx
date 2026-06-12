import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useLanguage } from "@/i18n/LanguageContext";
import { getLevelForStage } from "@/lib/kpi-config";
import AccessDenied from "@/components/members/AccessDenied";
import { Plus, Trash2, ArrowUp, ArrowDown, Loader2, Clock } from "lucide-react";
import { toast } from "@/hooks/use-toast";

type Sequence = {
  id: string;
  funnel_key: string;
  name: string;
  description: string | null;
  active: boolean;
};

type Step = {
  id: string;
  sequence_id: string;
  position: number;
  delay_minutes: number;
  channel: "email" | "sms" | "whatsapp" | "voice" | "in_app";
  template_key: string;
  active: boolean;
  notes: string | null;
};

const CHANNELS = ["email", "sms", "whatsapp", "voice", "in_app"] as const;

function formatDelay(minutes: number, lang: string) {
  if (minutes === 0) return lang === "de" ? "sofort" : "immediate";
  if (minutes < 60) return `+${minutes}m`;
  if (minutes < 1440) return `+${Math.round(minutes / 60)}h`;
  return `+${Math.round(minutes / 1440)}d`;
}

export default function TouchpointSequenceEditor() {
  const { user, profile, isAdmin, isOwner } = useAuth();
  const { lang } = useLanguage();
  const stage = (profile as any)?.business_stage ?? "opener";
  const level = isAdmin || isOwner ? 6 : getLevelForStage(stage);

  const [funnels, setFunnels] = useState<string[]>([]);
  const [funnelKey, setFunnelKey] = useState<string>("");
  const [sequences, setSequences] = useState<Sequence[]>([]);
  const [activeSeq, setActiveSeq] = useState<Sequence | null>(null);
  const [steps, setSteps] = useState<Step[]>([]);
  const [loading, setLoading] = useState(true);

  // load assigned funnels
  useEffect(() => {
    if (level < 6 || !user?.id) return;
    (async () => {
      if (isAdmin || isOwner) {
        const { data } = await supabase.from("per_funnel_feature_flags").select("funnel_key");
        setFunnels((data ?? []).map((r: any) => r.funnel_key));
      } else {
        const { data } = await supabase
          .from("operator_funnel_assignments")
          .select("funnel_key")
          .eq("operator_id", user.id);
        setFunnels((data ?? []).map((r: any) => r.funnel_key));
      }
    })();
  }, [user?.id, level, isAdmin, isOwner]);

  useEffect(() => {
    if (funnels.length > 0 && !funnelKey) setFunnelKey(funnels[0]);
  }, [funnels, funnelKey]);

  // load sequences for funnel
  const loadSequences = async () => {
    if (!funnelKey) return;
    setLoading(true);
    const { data } = await supabase
      .from("touchpoint_sequences")
      .select("*")
      .eq("funnel_key", funnelKey)
      .order("created_at", { ascending: false });
    setSequences((data as any) ?? []);
    setLoading(false);
  };
  useEffect(() => {
    loadSequences();
    setActiveSeq(null);
    setSteps([]);
  }, [funnelKey]);

  const loadSteps = async (seq: Sequence) => {
    const { data } = await supabase
      .from("touchpoint_sequence_steps")
      .select("*")
      .eq("sequence_id", seq.id)
      .order("position");
    setSteps((data as any) ?? []);
  };

  const selectSeq = async (seq: Sequence) => {
    setActiveSeq(seq);
    await loadSteps(seq);
  };

  const createSequence = async () => {
    const name = window.prompt(lang === "de" ? "Sequenz-Name:" : "Sequence name:");
    if (!name || !funnelKey) return;
    const { data, error } = await supabase
      .from("touchpoint_sequences")
      .insert({
        funnel_key: funnelKey,
        name,
        active: false,
        updated_by: user?.id,
      } as any)
      .select()
      .single();
    if (error) {
      toast({ variant: "destructive", title: error.message });
      return;
    }
    await loadSequences();
    if (data) selectSeq(data as any);
  };

  const toggleSeqActive = async (seq: Sequence, value: boolean) => {
    await supabase
      .from("touchpoint_sequences")
      .update({ active: value, updated_by: user?.id, updated_at: new Date().toISOString() } as any)
      .eq("id", seq.id);
    loadSequences();
    if (activeSeq?.id === seq.id) setActiveSeq({ ...seq, active: value });
  };

  const addStep = async () => {
    if (!activeSeq) return;
    const nextPos = (steps[steps.length - 1]?.position ?? 0) + 1;
    const lastDelay = steps[steps.length - 1]?.delay_minutes ?? 0;
    await supabase.from("touchpoint_sequence_steps").insert({
      sequence_id: activeSeq.id,
      position: nextPos,
      delay_minutes: lastDelay + 60,
      channel: "email",
      template_key: "lifecycle.placeholder",
      active: true,
    } as any);
    loadSteps(activeSeq);
  };

  const updateStep = async (id: string, patch: Partial<Step>) => {
    await supabase
      .from("touchpoint_sequence_steps")
      .update({ ...patch, updated_at: new Date().toISOString() } as any)
      .eq("id", id);
    if (activeSeq) loadSteps(activeSeq);
  };

  const deleteStep = async (id: string) => {
    await supabase.from("touchpoint_sequence_steps").delete().eq("id", id);
    if (activeSeq) loadSteps(activeSeq);
  };

  const moveStep = async (idx: number, dir: -1 | 1) => {
    const target = idx + dir;
    if (target < 0 || target >= steps.length) return;
    const a = steps[idx];
    const b = steps[target];
    // swap positions via two updates (unique constraint friendly: temp = -1)
    await supabase.from("touchpoint_sequence_steps").update({ position: -1 } as any).eq("id", a.id);
    await supabase.from("touchpoint_sequence_steps").update({ position: a.position } as any).eq("id", b.id);
    await supabase.from("touchpoint_sequence_steps").update({ position: b.position } as any).eq("id", a.id);
    if (activeSeq) loadSteps(activeSeq);
  };

  if (level < 6) return <AccessDenied />;

  return (
    <div className="space-y-8 p-6 lg:p-10">
      <header className="space-y-2 border-b pb-6">
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
          {lang === "de" ? "Editor · Layer 26" : "Editor · Layer 26"}
        </p>
        <h1 className="font-serif text-3xl font-light tracking-tight">
          {lang === "de" ? "Touchpoint-Sequenzen" : "Touchpoint Sequences"}
        </h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          {lang === "de"
            ? "Definiere die Reihenfolge, das Timing und den Kanal jeder vor-Booking-Nachricht. Pro Funnel."
            : "Define the order, timing and channel of every pre-booking touchpoint, per funnel."}
        </p>
      </header>

      {/* Funnel + sequence pickers */}
      <div className="grid gap-4 md:grid-cols-[260px_1fr]">
        <div className="space-y-3">
          <div>
            <Label className="text-xs">{lang === "de" ? "Funnel" : "Funnel"}</Label>
            <Select value={funnelKey} onValueChange={setFunnelKey}>
              <SelectTrigger className="mt-1">
                <SelectValue placeholder={lang === "de" ? "Funnel wählen" : "Select funnel"} />
              </SelectTrigger>
              <SelectContent>
                {funnels.map((f) => (
                  <SelectItem key={f} value={f}>
                    {f}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={createSequence} variant="outline" className="w-full" disabled={!funnelKey}>
            <Plus className="mr-2 h-4 w-4" />
            {lang === "de" ? "Neue Sequenz" : "New sequence"}
          </Button>
          <div className="space-y-1">
            {loading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
            {sequences.map((s) => (
              <button
                key={s.id}
                onClick={() => selectSeq(s)}
                className={`flex w-full items-center justify-between rounded-md border px-3 py-2 text-left text-sm transition ${
                  activeSeq?.id === s.id ? "border-primary bg-primary/5" : "hover:bg-muted/40"
                }`}
              >
                <span className="truncate">{s.name}</span>
                {s.active && <Badge variant="secondary">live</Badge>}
              </button>
            ))}
            {!loading && sequences.length === 0 && (
              <p className="text-xs text-muted-foreground">
                {lang === "de" ? "Noch keine Sequenzen." : "No sequences yet."}
              </p>
            )}
          </div>
        </div>

        {/* Editor */}
        <div className="min-h-[400px]">
          {!activeSeq && (
            <Card className="flex h-full items-center justify-center p-12 text-sm text-muted-foreground">
              {lang === "de" ? "Wähle oder erstelle eine Sequenz." : "Select or create a sequence."}
            </Card>
          )}
          {activeSeq && (
            <Card className="space-y-6 p-6">
              <div className="flex items-center justify-between border-b pb-4">
                <div>
                  <h2 className="font-serif text-xl">{activeSeq.name}</h2>
                  <p className="text-xs text-muted-foreground">{activeSeq.funnel_key}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Label htmlFor="seq-active" className="text-xs">
                    {lang === "de" ? "Live" : "Live"}
                  </Label>
                  <Switch
                    id="seq-active"
                    checked={activeSeq.active}
                    onCheckedChange={(v) => toggleSeqActive(activeSeq, v)}
                  />
                </div>
              </div>

              {/* Timeline */}
              <div className="space-y-3">
                {steps.map((step, idx) => (
                  <div
                    key={step.id}
                    className="grid grid-cols-12 items-center gap-2 rounded-lg border bg-muted/10 p-3"
                  >
                    <div className="col-span-12 flex items-center gap-2 sm:col-span-1">
                      <span className="font-mono text-xs text-muted-foreground">#{idx + 1}</span>
                    </div>
                    <div className="col-span-6 sm:col-span-2">
                      <Label className="text-[10px] uppercase tracking-wider">
                        <Clock className="mr-1 inline h-3 w-3" />
                        {lang === "de" ? "Verzögerung (min)" : "Delay (min)"}
                      </Label>
                      <Input
                        type="number"
                        min={0}
                        value={step.delay_minutes}
                        onChange={(e) =>
                          updateStep(step.id, { delay_minutes: parseInt(e.target.value || "0", 10) })
                        }
                        className="mt-1 h-8 text-sm"
                      />
                      <p className="mt-1 text-[10px] text-muted-foreground">
                        {formatDelay(step.delay_minutes, lang)}
                      </p>
                    </div>
                    <div className="col-span-6 sm:col-span-2">
                      <Label className="text-[10px] uppercase tracking-wider">
                        {lang === "de" ? "Kanal" : "Channel"}
                      </Label>
                      <Select
                        value={step.channel}
                        onValueChange={(v) => updateStep(step.id, { channel: v as any })}
                      >
                        <SelectTrigger className="mt-1 h-8">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {CHANNELS.map((c) => (
                            <SelectItem key={c} value={c}>
                              {c}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="col-span-12 sm:col-span-4">
                      <Label className="text-[10px] uppercase tracking-wider">
                        {lang === "de" ? "Template-Schlüssel" : "Template key"}
                      </Label>
                      <Input
                        value={step.template_key}
                        onChange={(e) => updateStep(step.id, { template_key: e.target.value })}
                        className="mt-1 h-8 font-mono text-xs"
                      />
                    </div>
                    <div className="col-span-12 flex items-center justify-end gap-1 sm:col-span-3">
                      <Switch
                        checked={step.active}
                        onCheckedChange={(v) => updateStep(step.id, { active: v })}
                      />
                      <Button size="icon" variant="ghost" onClick={() => moveStep(idx, -1)} disabled={idx === 0}>
                        <ArrowUp className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => moveStep(idx, 1)}
                        disabled={idx === steps.length - 1}
                      >
                        <ArrowDown className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="ghost" onClick={() => deleteStep(step.id)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                ))}
                <Button onClick={addStep} variant="outline" className="w-full">
                  <Plus className="mr-2 h-4 w-4" />
                  {lang === "de" ? "Touchpoint hinzufügen" : "Add touchpoint"}
                </Button>
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
