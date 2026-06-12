// /members/admin/alert-settings — L6+ Senior Closer WhatsApp alert opt-in
// Self-managed: WA number, event toggles, quiet hours.
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useUserLevel } from "@/hooks/useUserLevel";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { Loader2, MessageCircle, Shield } from "lucide-react";
import AccessDenied from "@/components/members/AccessDenied";

type EventKey = "HOT_LEAD" | "BOOKED_CALL" | "NO_SHOW" | "HIGH_VALUE_LEAD";

const EVENTS: Array<{ key: EventKey; label: string; desc: string }> = [
  { key: "HOT_LEAD",        label: "🔥 Hot Lead",        desc: "Score reaches the hot threshold (default 14)." },
  { key: "BOOKED_CALL",     label: "📅 Booked Call",     desc: "A new call is booked." },
  { key: "NO_SHOW",         label: "⚠️ No-Show",         desc: "An appointment is marked as no-show." },
  { key: "HIGH_VALUE_LEAD", label: "💎 High-Value Lead", desc: "Premium-tier lead (score ≥ 16). Bypasses quiet hours." },
];

export default function AlertSettings() {
  const { user } = useAuth();
  const { level, loading: levelLoading } = useUserLevel();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  const [phone, setPhone] = useState("");
  const [active, setActive] = useState(true);
  const [enabled, setEnabled] = useState<Set<EventKey>>(
    new Set(EVENTS.map((e) => e.key)),
  );
  const [quietStart, setQuietStart] = useState<number | "">("");
  const [quietEnd, setQuietEnd] = useState<number | "">("");
  const [waFromConfigured, setWaFromConfigured] = useState<boolean | null>(null);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const [{ data: rec }, { data: settings }] = await Promise.all([
        supabase
          .from("admin_alert_recipients")
          .select("*")
          .eq("user_id", user.id)
          .maybeSingle(),
        supabase
          .from("attendance_settings")
          .select("twilio_whatsapp_from, whatsapp_alerts_enabled")
          .eq("scope", "global")
          .maybeSingle(),
      ]);
      if (rec) {
        setPhone(rec.whatsapp_e164 ?? "");
        setActive(rec.active ?? true);
        setEnabled(new Set((rec.events_enabled ?? []) as EventKey[]));
        setQuietStart(rec.quiet_hours_start ?? "");
        setQuietEnd(rec.quiet_hours_end ?? "");
      }
      setWaFromConfigured(Boolean(settings?.twilio_whatsapp_from));
      setLoading(false);
    })();
  }, [user]);

  if (levelLoading || loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (level < 6) {
    return <AccessDenied requiredLevel="L6" />;
  }

  const toggleEvent = (k: EventKey) => {
    setEnabled((prev) => {
      const next = new Set(prev);
      next.has(k) ? next.delete(k) : next.add(k);
      return next;
    });
  };

  const validate = (): string | null => {
    if (!/^\+[1-9]\d{6,14}$/.test(phone.trim())) return "WhatsApp number must be in E.164 format (e.g. +491701234567).";
    if ((quietStart === "") !== (quietEnd === "")) return "Set both quiet-hour start and end, or leave both empty.";
    if (quietStart !== "" && (quietStart < 0 || quietStart > 23)) return "Quiet hour start must be 0–23.";
    if (quietEnd !== "" && (quietEnd < 0 || quietEnd > 23)) return "Quiet hour end must be 0–23.";
    if (enabled.size === 0) return "Enable at least one event.";
    return null;
  };

  const onSave = async () => {
    if (!user) return;
    const err = validate();
    if (err) { toast.error(err); return; }
    setSaving(true);
    const payload = {
      user_id: user.id,
      whatsapp_e164: phone.trim(),
      active,
      events_enabled: Array.from(enabled),
      quiet_hours_start: quietStart === "" ? null : Number(quietStart),
      quiet_hours_end:   quietEnd   === "" ? null : Number(quietEnd),
      timezone: "Europe/Berlin",
    };
    const { error } = await supabase
      .from("admin_alert_recipients")
      .upsert(payload, { onConflict: "user_id" });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Alert settings saved.");
  };

  const onTest = async () => {
    if (!user) return;
    const err = validate();
    if (err) { toast.error(err); return; }
    setTesting(true);
    // pick a recent lead to use as context (read-only); fall back to placeholder
    const { data: lead } = await supabase
      .from("leads").select("id").order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (!lead?.id) {
      setTesting(false);
      toast.error("No lead available to use as test context.");
      return;
    }
    const { data, error } = await supabase.functions.invoke("emit-admin-alert", {
      body: { event_type: "HOT_LEAD", lead_id: lead.id, payload: { score: 99, test: true } },
    });
    setTesting(false);
    if (error) { toast.error(error.message); return; }
    if ((data as any)?.skipped) toast.info(`Test skipped: ${(data as any).skipped}`);
    else toast.success("Test alert dispatched. Check your WhatsApp in a few seconds.");
  };

  return (
    <div className="container max-w-2xl space-y-6 py-8">
      <header className="space-y-2">
        <div className="flex items-center gap-2">
          <MessageCircle className="h-5 w-5 text-primary" />
          <h1 className="font-serif text-3xl">WhatsApp Alerts</h1>
          <Badge variant="outline">L6+</Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          Real-time mobile alerts for high-value lead events. Reply to messages to take action without opening the dashboard.
        </p>
      </header>

      {waFromConfigured === false && (
        <Card className="border-amber-500/50 bg-amber-50/50 dark:bg-amber-950/10">
          <CardContent className="flex gap-3 p-4 text-sm">
            <Shield className="h-4 w-4 mt-0.5 text-amber-600" />
            <div>
              <strong>Twilio WhatsApp sender not configured.</strong> An admin must set the WhatsApp from-number in Smart Attendance settings before alerts will deliver.
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Your WhatsApp</CardTitle>
          <CardDescription>E.164 format, including country code.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="phone">WhatsApp number</Label>
            <Input
              id="phone"
              placeholder="+491701234567"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </div>
          <div className="flex items-center justify-between rounded-md border px-3 py-2">
            <div>
              <div className="text-sm font-medium">Receive alerts</div>
              <div className="text-xs text-muted-foreground">Master switch — pause without losing your settings.</div>
            </div>
            <Switch checked={active} onCheckedChange={setActive} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Events</CardTitle>
          <CardDescription>Choose which events trigger a message. Less is more.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {EVENTS.map((ev) => (
            <div key={ev.key} className="flex items-start justify-between gap-4 rounded-md border px-3 py-3">
              <div className="space-y-1">
                <div className="text-sm font-medium">{ev.label}</div>
                <div className="text-xs text-muted-foreground">{ev.desc}</div>
              </div>
              <Switch
                checked={enabled.has(ev.key)}
                onCheckedChange={() => toggleEvent(ev.key)}
              />
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Quiet hours</CardTitle>
          <CardDescription>
            Suppress non-urgent alerts during these hours (Europe/Berlin). HIGH_VALUE and NO_SHOW always go through.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="qs">Start hour (0–23)</Label>
            <Input
              id="qs" type="number" min={0} max={23} placeholder="e.g. 22"
              value={quietStart}
              onChange={(e) => setQuietStart(e.target.value === "" ? "" : Number(e.target.value))}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="qe">End hour (0–23)</Label>
            <Input
              id="qe" type="number" min={0} max={23} placeholder="e.g. 7"
              value={quietEnd}
              onChange={(e) => setQuietEnd(e.target.value === "" ? "" : Number(e.target.value))}
            />
          </div>
        </CardContent>
      </Card>

      <Separator />

      <div className="flex flex-wrap gap-3">
        <Button onClick={onSave} disabled={saving}>
          {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Save settings
        </Button>
        <Button variant="outline" onClick={onTest} disabled={testing}>
          {testing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Send test alert
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">
        Twilio webhook URL for inbound replies:{" "}
        <code className="text-[10px]">
          {`${(import.meta.env.VITE_SUPABASE_URL ?? "").replace(/\/$/, "")}/functions/v1/twilio-inbound-webhook`}
        </code>
      </p>
    </div>
  );
}
