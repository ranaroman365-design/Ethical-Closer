import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Copy, Check, ExternalLink, Webhook, Phone, Video } from 'lucide-react';
import { toast } from 'sonner';

const PROJECT_ID = import.meta.env.VITE_SUPABASE_PROJECT_ID;
const FN_BASE = `https://${PROJECT_ID}.supabase.co/functions/v1`;

const RECEIVE_URL = `${FN_BASE}/receive-call-recording`;
const TWILIO_URL = `${FN_BASE}/twilio-recording-webhook`;
const ZOOM_URL = `${FN_BASE}/zoom-recording-webhook`;

function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  const onCopy = async () => {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    toast.success(`${label} kopiert`);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <div className="space-y-1">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
      <div className="flex items-center gap-2">
        <code className="flex-1 truncate rounded-md border border-border/60 bg-muted/40 px-2 py-1.5 font-mono text-xs">
          {value}
        </code>
        <Button type="button" size="sm" variant="outline" className="h-8" onClick={onCopy}>
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
        </Button>
      </div>
    </div>
  );
}

export default function RecordingIntegration() {
  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 md:p-8">
      <header className="space-y-2">
        <div className="flex items-center gap-2">
          <Webhook className="h-5 w-5 text-muted-foreground" />
          <h1 className="text-2xl font-semibold tracking-tight">Recording Integration</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Verbinde externe Aufnahme-Systeme (Twilio, Zoom, eigene VoIP) mit dem ETC Learning Loop.
          Sobald ein Call beendet ist, wird das Transkript automatisch erzeugt, analysiert und in
          Skript-Verbesserungen überführt.
        </p>
      </header>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold">
            <Webhook className="h-4 w-4" /> Generischer Endpoint
            <Badge variant="secondary" className="ml-2 text-[10px]">JSON</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <CopyField label="Webhook-URL" value={RECEIVE_URL} />
          <div className="space-y-1">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Erwartetes Payload</p>
            <pre className="overflow-x-auto rounded-md border border-border/60 bg-muted/40 p-3 font-mono text-xs">
{`{
  "call_id": "uuid-eines-bestehenden-calls",
  "audio_url": "https://provider.example.com/recording.mp3"
}`}
            </pre>
          </div>
          <div className="space-y-1">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Authentifizierung (optional, empfohlen)</p>
            <p className="text-xs text-muted-foreground">
              Setze den Header <code className="rounded bg-muted px-1 py-0.5 font-mono text-[11px]">X-Webhook-Secret</code>{' '}
              auf den Wert des Backend-Secrets <code className="rounded bg-muted px-1 py-0.5 font-mono text-[11px]">RECORDING_WEBHOOK_SECRET</code>.
              Wenn das Secret nicht gesetzt ist, ist der Endpoint offen — nur in geschützten Netzwerken nutzen.
            </p>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="twilio" className="space-y-4">
        <TabsList>
          <TabsTrigger value="twilio" className="gap-1.5"><Phone className="h-3.5 w-3.5" /> Twilio</TabsTrigger>
          <TabsTrigger value="zoom" className="gap-1.5"><Video className="h-3.5 w-3.5" /> Zoom</TabsTrigger>
        </TabsList>

        <TabsContent value="twilio">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold">Twilio – Recording StatusCallback</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <CopyField label="Twilio Webhook-URL" value={TWILIO_URL} />

              <div className="space-y-2">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Voraussetzung – Call-Matching</p>
                <p className="text-xs text-muted-foreground">
                  Damit eingehende Aufnahmen zum richtigen Call zugeordnet werden, muss bei der
                  Call-Erstellung in deinem Telefon-Workflow gespeichert werden:
                </p>
                <pre className="overflow-x-auto rounded-md border border-border/60 bg-muted/40 p-3 font-mono text-xs">
{`UPDATE calls
SET provider = 'twilio',
    provider_call_id = '<Twilio CallSid>'
WHERE id = '<unsere call.id>';`}
                </pre>
              </div>

              <ol className="list-decimal space-y-2 pl-5 text-xs text-muted-foreground">
                <li>
                  Öffne die Twilio Console →{' '}
                  <a href="https://console.twilio.com/" target="_blank" rel="noreferrer" className="text-primary inline-flex items-center gap-0.5">
                    console.twilio.com <ExternalLink className="h-3 w-3" />
                  </a>
                </li>
                <li>Wähle die Telefonnummer oder TwiML-App, die Calls aufzeichnet.</li>
                <li>
                  Im TwiML <code className="rounded bg-muted px-1 py-0.5 font-mono">{'<Record>'}</code>:
                  <br />
                  <code className="mt-1 block rounded bg-muted px-2 py-1 font-mono text-[11px]">
                    recordingStatusCallback="{TWILIO_URL}"
                    <br />
                    recordingStatusCallbackEvent="completed"
                    <br />
                    recordingStatusCallbackMethod="POST"
                  </code>
                </li>
                <li>
                  Setze in deinem Backend den Header{' '}
                  <code className="rounded bg-muted px-1 py-0.5 font-mono">X-Webhook-Secret</code> beim Forward
                  (z. B. via Twilio Functions oder einem eigenen Proxy), oder verwende den Endpoint ohne Secret in einer geschlossenen Umgebung.
                </li>
                <li>
                  Aktiviere in den Twilio-Einstellungen <strong>Geo Permissions</strong> nur für DACH und{' '}
                  <strong>SMS Pumping Protection</strong>, falls SMS verwendet wird.
                </li>
              </ol>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="zoom">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold">Zoom – Cloud Recording Webhook</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <CopyField label="Zoom Webhook-URL" value={ZOOM_URL} />

              <div className="space-y-2">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Voraussetzung – Call-Matching</p>
                <p className="text-xs text-muted-foreground">
                  Speichere die Zoom-Meeting-UUID bei Call-Erstellung:
                </p>
                <pre className="overflow-x-auto rounded-md border border-border/60 bg-muted/40 p-3 font-mono text-xs">
{`UPDATE calls
SET provider = 'zoom',
    provider_call_id = '<meeting uuid>'
WHERE id = '<unsere call.id>';`}
                </pre>
              </div>

              <ol className="list-decimal space-y-2 pl-5 text-xs text-muted-foreground">
                <li>
                  Öffne den{' '}
                  <a href="https://marketplace.zoom.us/" target="_blank" rel="noreferrer" className="text-primary inline-flex items-center gap-0.5">
                    Zoom App Marketplace <ExternalLink className="h-3 w-3" />
                  </a>{' '}
                  und erstelle eine <strong>Server-to-Server OAuth App</strong>.
                </li>
                <li>
                  Aktiviere im Tab „Feature → Event Subscriptions“ das Event{' '}
                  <code className="rounded bg-muted px-1 py-0.5 font-mono">recording.completed</code>.
                </li>
                <li>
                  Trage als <strong>Event notification endpoint URL</strong> die obenstehende URL ein.
                </li>
                <li>
                  Klicke „Validate“ — Zoom sendet ein <code className="rounded bg-muted px-1 py-0.5 font-mono">endpoint.url_validation</code>{' '}
                  Event, das automatisch mit dem Backend-Secret <code className="rounded bg-muted px-1 py-0.5 font-mono">ZOOM_WEBHOOK_SECRET_TOKEN</code>{' '}
                  signiert beantwortet wird.
                </li>
                <li>
                  Setze zusätzlich den Header <code className="rounded bg-muted px-1 py-0.5 font-mono">X-Webhook-Secret</code> über einen Zoom-Proxy oder
                  vertraue auf das Verification Token (empfohlen: beides).
                </li>
              </ol>

              <div className="rounded-md border border-border/60 bg-muted/30 p-3">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Erforderliche Secrets im Backend</p>
                <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                  <li>• <code className="rounded bg-muted px-1 py-0.5 font-mono">RECORDING_WEBHOOK_SECRET</code> – geteiltes Secret für alle Webhooks</li>
                  <li>• <code className="rounded bg-muted px-1 py-0.5 font-mono">ZOOM_WEBHOOK_SECRET_TOKEN</code> – Zoom Verification Token aus dem Marketplace</li>
                </ul>
                <p className="mt-2 text-[11px] text-muted-foreground/80">
                  Konfiguration: Lovable Cloud → Edge Functions → Secrets.
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold">Loop-Validierung</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-xs text-muted-foreground">
          <p>Sobald ein Webhook eintrifft, läuft folgender Pfad automatisch:</p>
          <ol className="list-decimal space-y-1 pl-5">
            <li>Webhook empfangen → Aufnahme in Bucket <code className="rounded bg-muted px-1 py-0.5 font-mono">call-recordings</code></li>
            <li><code className="rounded bg-muted px-1 py-0.5 font-mono">transcribe-call</code> erzeugt Transkript</li>
            <li>DB-Trigger füllt <code className="rounded bg-muted px-1 py-0.5 font-mono">pending_call_analyses</code></li>
            <li>Cron <code className="rounded bg-muted px-1 py-0.5 font-mono">process-pending-analyses</code> → <code className="rounded bg-muted px-1 py-0.5 font-mono">analyze-call</code></li>
            <li><code className="rounded bg-muted px-1 py-0.5 font-mono">aggregate-call-patterns</code> → <code className="rounded bg-muted px-1 py-0.5 font-mono">update-scripts-from-patterns</code></li>
          </ol>
        </CardContent>
      </Card>
    </div>
  );
}
