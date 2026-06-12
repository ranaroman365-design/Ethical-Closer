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
import { useAiSetterSettings } from "@/hooks/useAttendanceSettings";
import { SCRIPT_BLOCKS } from "@/lib/canonical-ai-setter";
import { ShieldAlert } from "lucide-react";
import { useLanguage } from "@/i18n/LanguageContext";

type Script = { id: string; block: string; language: string; body: string; enabled: boolean; scope: string };
type QueueRow = { id: string; segment: string; status: string; scheduled_for: string; attempts: number };
type LogRow = { id: string; outcome: string; created_at: string; notes: string | null };

export default function AiSetterAdmin() {
  const { tx } = useLanguage();
  const { data: settings, loading, save } = useAiSetterSettings("global");
  const [scripts, setScripts] = useState<Script[]>([]);
  const [queue, setQueue] = useState<QueueRow[]>([]);
  const [logs, setLogs] = useState<LogRow[]>([]);

  const loadAll = async () => {
    const [s, q, l] = await Promise.all([
      supabase.from("ai_setter_scripts").select("*").eq("scope", "global").order("block"),
      supabase.from("ai_setter_call_queue").select("*").order("scheduled_for", { ascending: false }).limit(50),
      supabase.from("ai_setter_call_logs").select("*").order("created_at", { ascending: false }).limit(50),
    ]);
    setScripts((s.data as any) ?? []);
    setQueue((q.data as any) ?? []);
    setLogs((l.data as any) ?? []);
  };
  useEffect(() => { loadAll(); }, []);

  if (loading) return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;

  const addScript = async () => {
    await supabase.from("ai_setter_scripts").insert({
      scope: "global", block: "opener", language: "de",
      body: "Hi {{name}}, hier ist Anna von ETC. Hast du 60 Sekunden?",
    } as any);
    loadAll();
  };
  const updateScript = async (id: string, patch: Partial<Script>) => {
    await supabase.from("ai_setter_scripts").update(patch).eq("id", id);
    loadAll();
  };

  return (
    <div className="container mx-auto p-6 max-w-6xl space-y-6">
      <header className="flex items-start justify-between">
        <div>
          <h1 className="font-serif text-3xl">AI Setter Voice Agent</h1>
          <p className="text-sm text-muted-foreground mt-1">{tx(
            "Layer 28 · Globale Steuerung. Voice-Provider in v1.0 = Stub (keine echten Calls).",
            "Layer 28 · Global controls. Voice provider in v1.0 = stub (no real calls placed).",
          )}</p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <Badge variant={settings?.ai_setter_enabled ? "default" : "outline"}>
            {settings?.ai_setter_enabled ? "ENABLED" : "DISABLED"}
          </Badge>
          <Badge variant={settings?.test_mode ? "secondary" : "destructive"}>
            {settings?.test_mode ? "TEST MODE" : "LIVE"}
          </Badge>
          <Badge variant="outline">provider: {settings?.voice_provider ?? "stub"}</Badge>
        </div>
      </header>

      {settings?.voice_provider === "stub" && (
        <Card className="p-4 border-amber-300 bg-amber-50/40 flex gap-3">
          <ShieldAlert className="h-5 w-5 text-amber-600 shrink-0" />
          <div className="text-sm">{tx(
            "Voice-Provider ist 'stub'. Die Edge-Function ai-setter-place-call loggt 'sent_stub' und ruft niemanden an.",
            "Voice provider is 'stub'. The ai-setter-place-call edge function logs 'sent_stub' and never dials.",
          )}</div>
        </Card>
      )}

      <Tabs defaultValue="settings">
        <TabsList>
          <TabsTrigger value="settings">Settings</TabsTrigger>
          <TabsTrigger value="scripts">Scripts ({scripts.length})</TabsTrigger>
          <TabsTrigger value="queue">Queue ({queue.length})</TabsTrigger>
          <TabsTrigger value="logs">Call Logs ({logs.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="settings">
          <Card className="p-5 space-y-5">
            <div className="flex items-center justify-between">
              <div><Label>AI Setter enabled (global)</Label><p className="text-xs text-muted-foreground">Master switch. OFF = nothing changes.</p></div>
              <Switch checked={!!settings?.ai_setter_enabled} onCheckedChange={(v) => save({ ai_setter_enabled: v })} />
            </div>
            <div className="flex items-center justify-between">
              <div><Label>Test mode</Label><p className="text-xs text-muted-foreground">Logs simulated outcomes, never dials.</p></div>
              <Switch checked={!!settings?.test_mode} onCheckedChange={(v) => save({ test_mode: v })} />
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div><Label>Max attempts</Label>
                <Input type="number" min={1} max={10} value={settings?.max_attempts ?? 3} onChange={(e) => save({ max_attempts: Number(e.target.value) })} /></div>
              <div><Label>Window start</Label>
                <Input type="number" min={0} max={23} value={settings?.call_window_start_hour ?? 9} onChange={(e) => save({ call_window_start_hour: Number(e.target.value) })} /></div>
              <div><Label>Window end</Label>
                <Input type="number" min={1} max={24} value={settings?.call_window_end_hour ?? 19} onChange={(e) => save({ call_window_end_hour: Number(e.target.value) })} /></div>
            </div>
            <div>
              <Label>Voice provider</Label>
              <Select value={settings?.voice_provider ?? "stub"} onValueChange={(v) => save({ voice_provider: v as any })}>
                <SelectTrigger className="w-72"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="stub">stub (no dialing)</SelectItem>
                  <SelectItem value="twilio_voice">twilio_voice</SelectItem>
                  <SelectItem value="vapi">vapi</SelectItem>
                  <SelectItem value="retell">retell</SelectItem>
                  <SelectItem value="elevenlabs_twilio">elevenlabs + twilio</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">Switching off 'stub' requires wiring the provider in ai-setter-place-call.</p>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="scripts" className="space-y-3">
          <div className="flex justify-end"><Button onClick={addScript} variant="outline">+ Script Block</Button></div>
          {scripts.length === 0 && <Card className="p-6 text-sm text-muted-foreground">No scripts yet.</Card>}
          {scripts.map((s) => (
            <Card key={s.id} className="p-4 space-y-3">
              <div className="flex flex-wrap gap-2 items-center">
                <Select value={s.block} onValueChange={(v) => updateScript(s.id, { block: v })}>
                  <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
                  <SelectContent>{SCRIPT_BLOCKS.map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}</SelectContent>
                </Select>
                <Select value={s.language} onValueChange={(v) => updateScript(s.id, { language: v })}>
                  <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="de">DE</SelectItem><SelectItem value="en">EN</SelectItem></SelectContent>
                </Select>
                <Switch checked={s.enabled} onCheckedChange={(v) => updateScript(s.id, { enabled: v })} />
                <Button size="sm" variant="ghost" className="ml-auto text-destructive"
                  onClick={async () => { await supabase.from("ai_setter_scripts").delete().eq("id", s.id); loadAll(); }}>Delete</Button>
              </div>
              <Textarea rows={3} value={s.body} onChange={(e) => updateScript(s.id, { body: e.target.value })} />
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="queue">
          <Card className="p-4">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-muted-foreground"><th>Segment</th><th>Status</th><th>Scheduled</th><th>Attempts</th></tr></thead>
              <tbody>
                {queue.map((q) => (<tr key={q.id} className="border-t">
                  <td className="py-1">{q.segment}</td>
                  <td><Badge variant="outline">{q.status}</Badge></td>
                  <td>{new Date(q.scheduled_for).toLocaleString()}</td><td>{q.attempts}</td>
                </tr>))}
                {queue.length === 0 && <tr><td colSpan={4} className="py-6 text-center text-muted-foreground">Queue empty.</td></tr>}
              </tbody>
            </table>
          </Card>
        </TabsContent>

        <TabsContent value="logs">
          <Card className="p-4">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-muted-foreground"><th>When</th><th>Outcome</th><th>Notes</th></tr></thead>
              <tbody>
                {logs.map((l) => (<tr key={l.id} className="border-t">
                  <td className="py-1">{new Date(l.created_at).toLocaleString()}</td>
                  <td><Badge variant="outline">{l.outcome}</Badge></td>
                  <td className="text-xs text-muted-foreground">{l.notes}</td>
                </tr>))}
                {logs.length === 0 && <tr><td colSpan={3} className="py-6 text-center text-muted-foreground">No call logs.</td></tr>}
              </tbody>
            </table>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
