import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useAiSetterSettings } from "@/hooks/useAttendanceSettings";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SCRIPT_BLOCKS } from "@/lib/canonical-ai-setter";
import { useLanguage } from "@/i18n/LanguageContext";
import { getLevelForStage } from "@/lib/kpi-config";
import AccessDenied from "@/components/members/AccessDenied";

export default function PerformanceAiSetter() {
  const { user, profile, isAdmin, isOwner } = useAuth();
  const { tx } = useLanguage();
  const stage = (profile as any)?.business_stage ?? "opener";
  const level = isAdmin || isOwner ? 6 : getLevelForStage(stage);
  const operatorId = user?.id ?? null;

  const { data: globalS } = useAiSetterSettings("global");
  const { data: opS, save: saveOp } = useAiSetterSettings("operator", operatorId);

  const [scripts, setScripts] = useState<any[]>([]);
  const [logs, setLogs] = useState<any[]>([]);

  useEffect(() => {
    if (!operatorId || level < 6) return;
    (async () => {
      const { data: s } = await supabase.from("ai_setter_scripts").select("*")
        .eq("scope", "operator").eq("operator_id", operatorId);
      setScripts((s as any) ?? []);
      const { data: l } = await supabase.from("ai_setter_call_logs").select("*")
        .eq("operator_id", operatorId).order("created_at", { ascending: false }).limit(20);
      setLogs((l as any) ?? []);
    })();
  }, [operatorId, level]);

  if (level < 6) return <AccessDenied />;

  const addScript = async () => {
    await supabase.from("ai_setter_scripts").insert({
      scope: "operator", operator_id: operatorId, block: "opener", language: "de",
      body: "Hi {{name}}, hier ist Anna. Hast du 60 Sekunden?",
    } as any);
    const { data } = await supabase.from("ai_setter_scripts").select("*")
      .eq("scope", "operator").eq("operator_id", operatorId);
    setScripts((data as any) ?? []);
  };

  return (
    <div className="container mx-auto p-6 max-w-5xl space-y-6">
      <header className="flex items-start justify-between">
        <div>
          <h1 className="font-serif text-3xl">AI Setter · {tx("Mein Funnel", "My Funnel")}</h1>
          <p className="text-sm text-muted-foreground mt-1">{tx(
            "Eigene Skripte für deinen Funnel. Provider 'stub' = keine echten Calls.",
            "Personal scripts for your funnel. Provider 'stub' = no real calls placed.",
          )}</p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <Badge variant={globalS?.ai_setter_enabled ? "default" : "outline"}>global: {globalS?.ai_setter_enabled ? "ON" : "OFF"}</Badge>
          <Badge variant="outline">provider: {globalS?.voice_provider ?? "stub"}</Badge>
        </div>
      </header>

      <Card className="p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div><Label>{tx("AI Setter für mich aktivieren", "Enable AI Setter for me")}</Label>
            <p className="text-xs text-muted-foreground">{tx("Funktioniert nur wenn global ON.", "Only effective when global is ON.")}</p></div>
          <Switch checked={!!opS?.ai_setter_enabled}
            onCheckedChange={(v) => saveOp({ ai_setter_enabled: v, scope: "operator", operator_id: operatorId } as any)} />
        </div>
        <div className="flex items-center justify-between">
          <div><Label>Test mode</Label></div>
          <Switch checked={opS?.test_mode !== false}
            onCheckedChange={(v) => saveOp({ test_mode: v, scope: "operator", operator_id: operatorId } as any)} />
        </div>
      </Card>

      <Card className="p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-serif text-xl">{tx("Meine Skripte", "My Scripts")}</h2>
          <Button variant="outline" onClick={addScript}>+ Block</Button>
        </div>
        {scripts.length === 0 && <p className="text-sm text-muted-foreground">{tx(
          "Keine eigenen Skripte. Globale Skripte werden verwendet.",
          "No personal scripts. Global scripts will be used.",
        )}</p>}
        {scripts.map((s) => (
          <Card key={s.id} className="p-3 space-y-2">
            <Select value={s.block} onValueChange={async (v) => { await supabase.from("ai_setter_scripts").update({ block: v }).eq("id", s.id); }}>
              <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
              <SelectContent>{SCRIPT_BLOCKS.map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}</SelectContent>
            </Select>
            <Textarea defaultValue={s.body} onBlur={async (e) => { await supabase.from("ai_setter_scripts").update({ body: e.target.value }).eq("id", s.id); }} />
          </Card>
        ))}
      </Card>

      <Card className="p-4">
        <h2 className="font-serif text-xl mb-3">{tx("Letzte Calls", "Recent Calls")}</h2>
        <table className="w-full text-sm">
          <thead><tr className="text-left text-muted-foreground"><th>When</th><th>Outcome</th></tr></thead>
          <tbody>
            {logs.map((l) => (<tr key={l.id} className="border-t">
              <td className="py-1">{new Date(l.created_at).toLocaleString()}</td>
              <td><Badge variant="outline">{l.outcome}</Badge></td>
            </tr>))}
            {logs.length === 0 && <tr><td colSpan={2} className="py-6 text-center text-muted-foreground">No call logs.</td></tr>}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
