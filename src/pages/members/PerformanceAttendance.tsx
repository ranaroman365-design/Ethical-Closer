import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useAttendanceSettings } from "@/hooks/useAttendanceSettings";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TRIGGERS, CHANNELS } from "@/lib/canonical-attendance";
import { useLanguage } from "@/i18n/LanguageContext";
import { getLevelForStage } from "@/lib/kpi-config";
import AccessDenied from "@/components/members/AccessDenied";

export default function PerformanceAttendance() {
  const { user, profile, isAdmin, isOwner } = useAuth();
  const { tx } = useLanguage();
  const stage = (profile as any)?.business_stage ?? "opener";
  const level = isAdmin || isOwner ? 6 : getLevelForStage(stage);
  const operatorId = user?.id ?? null;

  const { data: globalS } = useAttendanceSettings("global");
  const { data: opS, save: saveOp } = useAttendanceSettings("operator", operatorId);

  const [tpls, setTpls] = useState<any[]>([]);
  const [stats, setStats] = useState<{ confirmed: number; no_show: number; recovered: number; total: number }>({
    confirmed: 0, no_show: 0, recovered: 0, total: 0,
  });

  useEffect(() => {
    if (!operatorId || level < 6) return;
    (async () => {
      const { data } = await (supabase.from as any)("attendance_templates").select("*")
        .eq("scope", "operator").eq("operator_id", operatorId);
      setTpls((data as any) ?? []);
      const { data: rows } = await supabase.from("appointment_attendance_status").select("status")
        .eq("operator_id", operatorId);
      const total = (rows as any[])?.length ?? 0;
      setStats({
        total,
        confirmed: (rows as any[])?.filter((r) => r.status === "confirmed").length ?? 0,
        no_show: (rows as any[])?.filter((r) => r.status === "no_show").length ?? 0,
        recovered: (rows as any[])?.filter((r) => r.status === "recovered").length ?? 0,
      });
    })();
  }, [operatorId, level]);

  if (level < 6) return <AccessDenied />;

  const addTpl = async () => {
    await (supabase.from as any)("attendance_templates").insert({
      scope: "operator", operator_id: operatorId,
      trigger: "t_minus_24h", channel: "whatsapp", language: "de",
      body: "Hi {{name}}, dein Termin morgen {{starts_at}}.",
    } as any);
    const { data } = await (supabase.from as any)("attendance_templates").select("*")
      .eq("scope", "operator").eq("operator_id", operatorId);
    setTpls((data as any) ?? []);
  };

  return (
    <div className="container mx-auto p-6 max-w-5xl space-y-6">
      <header className="flex items-start justify-between">
        <div>
          <h1 className="font-serif text-3xl">Smart Attendance · {tx("Mein Funnel", "My Funnel")}</h1>
          <p className="text-sm text-muted-foreground mt-1">{tx(
            "Personalisiere deine Erinnerungen. Master-Switch liegt beim Admin.",
            "Customize your reminders. Master switch is admin-controlled.",
          )}</p>
        </div>
        <Badge variant={globalS?.smart_attendance_enabled ? "default" : "outline"}>
          global: {globalS?.smart_attendance_enabled ? "ON" : "OFF"}
        </Badge>
      </header>

      <div className="grid grid-cols-4 gap-3">
        <Card className="p-4"><div className="text-xs text-muted-foreground">Total</div><div className="text-2xl font-serif">{stats.total}</div></Card>
        <Card className="p-4"><div className="text-xs text-muted-foreground">Confirmed</div><div className="text-2xl font-serif">{stats.confirmed}</div></Card>
        <Card className="p-4"><div className="text-xs text-muted-foreground">No-show</div><div className="text-2xl font-serif">{stats.no_show}</div></Card>
        <Card className="p-4"><div className="text-xs text-muted-foreground">Recovered</div><div className="text-2xl font-serif">{stats.recovered}</div></Card>
      </div>

      <Card className="p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <Label>{tx("Smart Attendance für mich aktivieren", "Enable Smart Attendance for me")}</Label>
            <p className="text-xs text-muted-foreground">{tx(
              "Funktioniert nur, wenn der globale Master-Switch ON ist.",
              "Only effective when the global master switch is ON.",
            )}</p>
          </div>
          <Switch checked={!!opS?.smart_attendance_enabled}
            onCheckedChange={(v) => saveOp({ smart_attendance_enabled: v, scope: "operator", operator_id: operatorId } as any)} />
        </div>
        <div className="flex items-center justify-between">
          <div><Label>Test mode</Label></div>
          <Switch checked={opS?.test_mode !== false}
            onCheckedChange={(v) => saveOp({ test_mode: v, scope: "operator", operator_id: operatorId } as any)} />
        </div>
      </Card>

      <Card className="p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-serif text-xl">{tx("Meine Templates", "My Templates")}</h2>
          <Button variant="outline" onClick={addTpl}>+ Template</Button>
        </div>
        {tpls.length === 0 && <p className="text-sm text-muted-foreground">{tx(
          "Keine eigenen Templates. Globale Templates werden verwendet.",
          "No personal templates. Global templates will be used.",
        )}</p>}
        {tpls.map((t) => (
          <Card key={t.id} className="p-3 space-y-2">
            <div className="flex gap-2 flex-wrap">
              <Select value={t.trigger} onValueChange={async (v) => { await (supabase.from as any)("attendance_templates").update({ trigger: v }).eq("id", t.id); }}>
                <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
                <SelectContent>{TRIGGERS.map(x => <SelectItem key={x} value={x}>{x}</SelectItem>)}</SelectContent>
              </Select>
              <Select value={t.channel} onValueChange={async (v) => { await (supabase.from as any)("attendance_templates").update({ channel: v }).eq("id", t.id); }}>
                <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                <SelectContent>{CHANNELS.map(x => <SelectItem key={x} value={x}>{x}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <Textarea defaultValue={t.body} onBlur={async (e) => { await (supabase.from as any)("attendance_templates").update({ body: e.target.value }).eq("id", t.id); }} />
          </Card>
        ))}
      </Card>
    </div>
  );
}
