import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  LEVEL_MESSAGE_LEVELS,
  LEVEL_MESSAGE_TYPES,
  LEVEL_MESSAGE_TRIGGERS,
} from "@/lib/canonical-level-messaging";

interface Template {
  id: string;
  template_key: string;
  level: string;
  message_type: string;
  trigger_event: string;
  channel: string;
  active: boolean;
  body_de: string;
}

interface GlobalSettings {
  id: string;
  enabled: boolean;
  test_mode: boolean;
}

export default function LevelMessagingAdmin() {
  const [settings, setSettings] = useState<GlobalSettings | null>(null);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [simLevel, setSimLevel] = useState("L1");
  const [simType, setSimType] = useState("onboarding");
  const [simTrigger, setSimTrigger] = useState("level_entered");
  const [simResult, setSimResult] = useState<string>("");

  async function load() {
    setLoading(true);
    const { data: s } = await supabase
      .from("level_messaging_settings")
      .select("id, enabled, test_mode")
      .eq("scope", "global")
      .maybeSingle();
    setSettings(s);

    const { data: t } = await supabase
      .from("level_message_templates")
      .select("id, template_key, level, message_type, trigger_event, channel, active, body_de")
      .order("level")
      .order("message_type");
    setTemplates(t ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function toggleEnabled(value: boolean) {
    if (!settings) return;
    const { error } = await supabase
      .from("level_messaging_settings")
      .update({ enabled: value })
      .eq("id", settings.id);
    if (error) return toast.error(error.message);
    toast.success(value ? "System aktiviert" : "System deaktiviert");
    load();
  }

  async function simulate() {
    const { data, error } = await supabase.functions.invoke("level-messaging-simulate", {
      body: {
        level: simLevel,
        message_type: simType,
        trigger_event: simTrigger,
        variables: { first_name: "Alex", next_action: "Open dashboard", booking_link: "—" },
        language: "de",
      },
    });
    if (error) return toast.error(error.message);
    setSimResult(JSON.stringify(data, null, 2));
  }

  return (
    <div className="container mx-auto p-8 space-y-6">
      <div>
        <h1 className="text-3xl font-serif text-foreground">Level Messaging — Layer 30</h1>
        <p className="text-muted-foreground">L0–L8 Onboarding · Progress · Promotion · Warning</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Globale Steuerung</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading || !settings ? (
            <p className="text-muted-foreground">Lade…</p>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <div>
                  <Label>System aktiv</Label>
                  <p className="text-sm text-muted-foreground">
                    Wenn deaktiviert: keine Jobs werden eingereiht, keine Nachrichten versendet.
                  </p>
                </div>
                <Switch checked={settings.enabled} onCheckedChange={toggleEnabled} />
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={settings.test_mode ? "secondary" : "default"}>
                  {settings.test_mode ? "Test Mode" : "Live"}
                </Badge>
                <Badge variant="outline">Phase 1 — Foundation</Badge>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Template Simulator</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label>Level</Label>
              <Select value={simLevel} onValueChange={setSimLevel}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {LEVEL_MESSAGE_LEVELS.map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Typ</Label>
              <Select value={simType} onValueChange={setSimType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {LEVEL_MESSAGE_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Trigger</Label>
              <Select value={simTrigger} onValueChange={setSimTrigger}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {LEVEL_MESSAGE_TRIGGERS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <Button onClick={simulate}>Vorschau rendern</Button>
          {simResult && <Textarea readOnly value={simResult} className="font-mono text-xs h-48" />}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Templates ({templates.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {templates.map((t) => (
              <div key={t.id} className="flex items-center justify-between p-3 border rounded-lg">
                <div>
                  <div className="font-medium">{t.template_key}</div>
                  <div className="text-xs text-muted-foreground">
                    {t.level} · {t.message_type} · {t.trigger_event} · {t.channel}
                  </div>
                </div>
                <Badge variant={t.active ? "default" : "secondary"}>
                  {t.active ? "active" : "inactive"}
                </Badge>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
