import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { useAttendanceSettings } from "@/hooks/useAttendanceSettings";
import { TRIGGERS, CHANNELS } from "@/lib/canonical-attendance";
import { ShieldAlert, Phone, MessageSquare, History } from "lucide-react";
import { useLanguage } from "@/i18n/LanguageContext";

type Tpl = { id: string; trigger: string; channel: string; language: string; subject: string | null; body: string; enabled: boolean; scope: string };
type Job = { id: string; trigger: string; channel: string; status: string; scheduled_for: string; last_error: string | null };
type Log = { id: string; channel: string; status: string; to_number: string | null; created_at: string; error_message: string | null };

export default function SmartAttendanceSettings() {
  const { tx } = useLanguage();
  const { data: settings, loading, save } = useAttendanceSettings("global");
  const [templates, setTemplates] = useState<Tpl[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [logs, setLogs] = useState<Log[]>([]);

  const loadAll = async () => {
    const [t, j, l] = await Promise.all([
      (supabase.from as any)("attendance_templates").select("*").eq("scope", "global").order("trigger"),
      (supabase.from as any)("attendance_jobs").select("*").order("scheduled_for", { ascending: false }).limit(50),
      supabase.from("twilio_message_logs").select("*").eq("source", "attendance").order("created_at", { ascending: false }).limit(50),
    ]);
    setTemplates((t.data as any) ?? []);
    setJobs((j.data as any) ?? []);
    setLogs((l.data as any) ?? []);
  };
  useEffect(() => { loadAll(); }, []);

  if (loading) return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;

  const addTemplate = async () => {
    await (supabase.from as any)("attendance_templates").insert({
      scope: "global", trigger: "t_minus_24h", channel: "whatsapp", language: "de",
      body: "Hi {{name}}, dein Termin ist morgen um {{starts_at}}. Bitte bestätige kurz mit JA.",
    } as any);
    loadAll();
  };

  const updateTpl = async (id: string, patch: Partial<Tpl>) => {
    await (supabase.from as any)("attendance_templates").update(patch).eq("id", id);
    loadAll();
  };

  return (
    <div className="container mx-auto p-6 max-w-6xl space-y-6">
      <header className="flex items-start justify-between">
        <div>
          <h1 className="font-serif text-3xl">Smart Attendance Settings</h1>
          <p className="text-sm text-muted-foreground mt-1">{tx(
            "Layer 27 · Globale Steuerung. Pro-Operator-Overrides unter /performance/attendance.",
            "Layer 27 · Global controls. Per-operator overrides under /performance/attendance.",
          )}</p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <Badge variant={settings?.smart_attendance_enabled ? "default" : "outline"}>
            {settings?.smart_attendance_enabled ? "ENABLED" : "DISABLED"}
          </Badge>
          <Badge variant={settings?.test_mode ? "secondary" : "destructive"}>
            {settings?.test_mode ? "TEST MODE" : "LIVE"}
          </Badge>
        </div>
      </header>

      {!settings?.smart_attendance_enabled && (
        <Card className="p-4 border-amber-300 bg-amber-50/40 flex gap-3">
          <ShieldAlert className="h-5 w-5 text-amber-600 shrink-0" />
          <div className="text-sm">{tx(
            "Smart Attendance ist global deaktiviert. Bestehende Booking-/Reminder-Flows laufen unverändert weiter.",
            "Smart Attendance is globally OFF. Existing booking/reminder flows run unchanged.",
          )}</div>
        </Card>
      )}

      <Tabs defaultValue="settings">
        <TabsList>
          <TabsTrigger value="settings">{tx("Einstellungen", "Settings")}</TabsTrigger>
          <TabsTrigger value="templates">{tx("Templates", "Templates")} ({templates.length})</TabsTrigger>
          <TabsTrigger value="jobs">{tx("Jobs", "Jobs")} ({jobs.length})</TabsTrigger>
          <TabsTrigger value="logs">{tx("Twilio-Logs", "Twilio Logs")} ({logs.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="settings" className="space-y-4">
          <Card className="p-5 space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <Label>Smart Attendance enabled (global)</Label>
                <p className="text-xs text-muted-foreground">{tx(
                  "Master-Switch. OFF = nichts ändert sich am bestehenden System.",
                  "Master switch. OFF = nothing changes vs the current system.",
                )}</p>
              </div>
              <Switch checked={!!settings?.smart_attendance_enabled}
                onCheckedChange={(v) => save({ smart_attendance_enabled: v })} />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <Label>Test mode</Label>
                <p className="text-xs text-muted-foreground">{tx(
                  "Logt simulierte Sends, ruft Twilio NICHT auf.",
                  "Logs simulated sends, never calls Twilio.",
                )}</p>
              </div>
              <Switch checked={!!settings?.test_mode} onCheckedChange={(v) => save({ test_mode: v })} />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <Label>Voice confirmation</Label>
                <p className="text-xs text-muted-foreground">Twilio Voice for high-value leads (provider TBD)</p>
              </div>
              <Switch checked={!!settings?.voice_confirmation_enabled}
                onCheckedChange={(v) => save({ voice_confirmation_enabled: v })} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Allowed hours start</Label>
                <Input type="number" min={0} max={23} value={settings?.allowed_hours_start ?? 9}
                  onChange={(e) => save({ allowed_hours_start: Number(e.target.value) })} />
              </div>
              <div>
                <Label>Allowed hours end</Label>
                <Input type="number" min={1} max={24} value={settings?.allowed_hours_end ?? 19}
                  onChange={(e) => save({ allowed_hours_end: Number(e.target.value) })} />
              </div>
              <div>
                <Label>Twilio FROM (SMS)</Label>
                <Input placeholder="+49…" value={settings?.twilio_from_number ?? ""}
                  onChange={(e) => save({ twilio_from_number: e.target.value })} />
              </div>
              <div>
                <Label>Twilio FROM (WhatsApp)</Label>
                <Input placeholder="+49…" value={settings?.twilio_whatsapp_from ?? ""}
                  onChange={(e) => save({ twilio_whatsapp_from: e.target.value })} />
              </div>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="templates" className="space-y-3">
          <div className="flex justify-end">
            <Button onClick={addTemplate} variant="outline">+ Template</Button>
          </div>
          {templates.length === 0 && <Card className="p-6 text-sm text-muted-foreground">No templates yet.</Card>}
          {templates.map((t) => (
            <Card key={t.id} className="p-4 space-y-3">
              <div className="flex flex-wrap gap-2 items-center">
                <Select value={t.trigger} onValueChange={(v) => updateTpl(t.id, { trigger: v })}>
                  <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TRIGGERS.map((trg) => <SelectItem key={trg} value={trg}>{trg}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={t.channel} onValueChange={(v) => updateTpl(t.id, { channel: v })}>
                  <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CHANNELS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={t.language} onValueChange={(v) => updateTpl(t.id, { language: v })}>
                  <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="de">DE</SelectItem><SelectItem value="en">EN</SelectItem>
                  </SelectContent>
                </Select>
                <Switch checked={t.enabled} onCheckedChange={(v) => updateTpl(t.id, { enabled: v })} />
                <Button size="sm" variant="ghost" className="ml-auto text-destructive"
                  onClick={async () => { await (supabase.from as any)("attendance_templates").delete().eq("id", t.id); loadAll(); }}>
                  Delete
                </Button>
              </div>
              <Textarea rows={3} value={t.body} onChange={(e) => updateTpl(t.id, { body: e.target.value })} />
              <p className="text-xs text-muted-foreground">Vars: {`{{name}}`} · {`{{starts_at}}`}</p>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="jobs">
          <Card className="p-4">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-muted-foreground"><th>Trigger</th><th>Channel</th><th>Status</th><th>Scheduled</th><th>Error</th></tr></thead>
              <tbody>
                {jobs.map((j) => (
                  <tr key={j.id} className="border-t">
                    <td className="py-1">{j.trigger}</td><td>{j.channel}</td>
                    <td><Badge variant="outline">{j.status}</Badge></td>
                    <td>{new Date(j.scheduled_for).toLocaleString()}</td>
                    <td className="text-destructive text-xs">{j.last_error}</td>
                  </tr>
                ))}
                {jobs.length === 0 && <tr><td colSpan={5} className="py-6 text-center text-muted-foreground">No jobs.</td></tr>}
              </tbody>
            </table>
          </Card>
        </TabsContent>

        <TabsContent value="logs">
          <Card className="p-4">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-muted-foreground"><th>When</th><th>Channel</th><th>To</th><th>Status</th><th>Error</th></tr></thead>
              <tbody>
                {logs.map((l) => (
                  <tr key={l.id} className="border-t">
                    <td className="py-1">{new Date(l.created_at).toLocaleString()}</td>
                    <td>{l.channel}</td><td>{l.to_number}</td>
                    <td><Badge variant="outline">{l.status}</Badge></td>
                    <td className="text-destructive text-xs">{l.error_message}</td>
                  </tr>
                ))}
                {logs.length === 0 && <tr><td colSpan={5} className="py-6 text-center text-muted-foreground">No logs.</td></tr>}
              </tbody>
            </table>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
