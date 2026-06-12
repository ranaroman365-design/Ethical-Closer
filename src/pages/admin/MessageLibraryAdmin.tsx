import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { MESSAGE_PHASES, MESSAGE_TRIGGERS } from "@/lib/canonical-message-library";

interface Template {
  id: string;
  template_key: string;
  phase: string;
  trigger_event: string;
  channel: string;
  variant_key: string;
  variant_weight: number;
  active: boolean;
  scope: string;
}

interface Settings {
  id: string;
  enabled: boolean;
  test_mode: boolean;
  birthday_cron_enabled: boolean;
}

export default function MessageLibraryAdmin() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterPhase, setFilterPhase] = useState<string>("");
  const [previewKey, setPreviewKey] = useState("birthday_message");
  const [previewVars, setPreviewVars] = useState('{"first_name":"Alex","next_action":"/dashboard"}');
  const [previewResult, setPreviewResult] = useState("");

  async function load() {
    setLoading(true);
    const { data: s } = await supabase
      .from("message_library_settings")
      .select("id, enabled, test_mode, birthday_cron_enabled")
      .eq("scope", "global")
      .maybeSingle();
    setSettings(s);

    const { data: t } = await supabase
      .from("message_library")
      .select("id, template_key, phase, trigger_event, channel, variant_key, variant_weight, active, scope")
      .order("phase").order("template_key").order("variant_key");
    setTemplates(t ?? []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function update(key: "enabled" | "test_mode" | "birthday_cron_enabled", value: boolean) {
    if (!settings) return;
    const patch: Partial<Settings> = { [key]: value };
    const { error } = await supabase
      .from("message_library_settings")
      .update(patch)
      .eq("id", settings.id);
    if (error) return toast.error(error.message);
    toast.success("Aktualisiert");
    load();
  }

  async function preview() {
    let vars: Record<string, string> = {};
    try { vars = JSON.parse(previewVars); } catch { return toast.error("Ungültiges JSON"); }
    const { data, error } = await supabase.functions.invoke("message-library-render", {
      body: { template_key: previewKey, variables: vars, language: "de" },
    });
    if (error) return toast.error(error.message);
    setPreviewResult(JSON.stringify(data, null, 2));
  }

  const filtered = filterPhase
    ? templates.filter((t) => t.phase === filterPhase)
    : templates;

  return (
    <div className="container mx-auto p-8 space-y-6">
      <div>
        <h1 className="text-3xl font-serif text-foreground">Message Library — Layer 31</h1>
        <p className="text-muted-foreground">
          Unified registry · A/B-ready · Birthday + alle Lifecycle-Messages
        </p>
      </div>

      <Card>
        <CardHeader><CardTitle>Globale Steuerung</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {loading || !settings ? <p className="text-muted-foreground">Lade…</p> : (
            <>
              <div className="flex items-center justify-between">
                <div>
                  <Label>System aktiv</Label>
                  <p className="text-sm text-muted-foreground">
                    Wenn deaktiviert: render-only, keine echten Sends.
                  </p>
                </div>
                <Switch checked={settings.enabled} onCheckedChange={(v) => update("enabled", v)} />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <Label>Birthday Cron aktiv</Label>
                  <p className="text-sm text-muted-foreground">
                    Täglicher Scan auf opt-in Geburtstage.
                  </p>
                </div>
                <Switch checked={settings.birthday_cron_enabled} onCheckedChange={(v) => update("birthday_cron_enabled", v)} />
              </div>
              <div className="flex gap-2">
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
        <CardHeader><CardTitle>Preview & A/B Test</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>template_key</Label>
              <Input value={previewKey} onChange={(e) => setPreviewKey(e.target.value)} />
            </div>
            <div>
              <Label>variables (JSON)</Label>
              <Input value={previewVars} onChange={(e) => setPreviewVars(e.target.value)} />
            </div>
          </div>
          <Button onClick={preview}>Variant ziehen + rendern</Button>
          {previewResult && (
            <Textarea readOnly value={previewResult} className="font-mono text-xs h-56" />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Templates ({filtered.length})</CardTitle>
          <div className="flex flex-wrap gap-2 mt-2">
            <Button size="sm" variant={filterPhase === "" ? "default" : "outline"} onClick={() => setFilterPhase("")}>Alle</Button>
            {MESSAGE_PHASES.map((p) => (
              <Button key={p} size="sm" variant={filterPhase === p ? "default" : "outline"} onClick={() => setFilterPhase(p)}>
                {p}
              </Button>
            ))}
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {filtered.map((t) => (
              <div key={t.id} className="flex items-center justify-between p-3 border rounded-lg">
                <div>
                  <div className="font-medium">
                    {t.template_key} <span className="text-xs text-muted-foreground">[{t.variant_key} · {t.variant_weight}%]</span>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {t.phase} · {t.trigger_event} · {t.channel} · {t.scope}
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
