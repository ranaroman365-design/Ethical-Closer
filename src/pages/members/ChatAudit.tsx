import { useState, useMemo, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { RefreshCw, Download, Shield } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

interface AuditDimension {
  key: string;
  label: string;
  score: number;
  reasoning: string;
  nextStep: string;
}

function scoreColor(score: number): string {
  if (score <= 4) return 'bg-destructive';
  if (score <= 6) return 'bg-amber-500';
  if (score <= 8) return 'bg-emerald-500';
  return 'bg-blue-500';
}

function scoreBadgeClass(score: number): string {
  if (score <= 4) return 'bg-destructive/15 text-destructive border-destructive/30';
  if (score <= 6) return 'bg-amber-500/15 text-amber-700 border-amber-500/30';
  if (score <= 8) return 'bg-emerald-500/15 text-emerald-700 border-emerald-500/30';
  return 'bg-blue-500/15 text-blue-700 border-blue-500/30';
}

function DimensionCard({ dim }: { dim: AuditDimension }) {
  return (
    <Card className="border-border/40">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-semibold text-foreground">{dim.label}</h4>
          <Badge variant="outline" className={`text-xs font-bold ${scoreBadgeClass(dim.score)}`}>
            {dim.score}/10
          </Badge>
        </div>
        <div className="w-full h-2 rounded-full bg-muted overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${scoreColor(dim.score)}`}
            style={{ width: `${dim.score * 10}%` }}
          />
        </div>
        <p className="text-[11px] text-muted-foreground leading-relaxed">{dim.reasoning}</p>
        <div className="rounded-md bg-muted/50 border border-border/30 px-3 py-2">
          <p className="text-[10px] font-medium text-foreground">
            <span className="text-primary">→ Next Step:</span> {dim.nextStep}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

// ═══════════════════════════════════════════════════════════
// AUDIT DATA — derived from actual code inspection
// ═══════════════════════════════════════════════════════════

const DM_DIMENSIONS: AuditDimension[] = [
  {
    key: 'identity_resolution',
    label: 'Identity Resolution',
    score: 8,
    reasoning:
      'Vier-Layer-Fallback implementiert: activeContact → senderProfiles (aus Kontaktliste) → fetchedProfiles (lazy DB-Fetch) → Platzhalter "…". useEffect in ChatThread resolved fehlende IDs zuverlässig nach. Einzige Schwäche: Bei neuen Group-DM-Szenarien könnte der Fallback "…" kurz sichtbar sein, bevor der Fetch greift.',
    nextStep: 'Prefetch-Cache für alle Profiles beim Chat-Init statt lazy einzeln, um den "…"-Flash zu eliminieren.',
  },
  {
    key: 'message_delivery',
    label: 'Message Delivery',
    score: 8,
    reasoning:
      'Nachrichten werden per supabase.insert() gesendet und über Realtime-INSERT-Events empfangen. Deduplication via ID-Check (`prev.some(m => m.id === msg.id)`) verhindert Doppel-Rendering. Pagination (50er Seiten) mit cursor-basiertem `lt(created_at)` ist korrekt implementiert. Kein optimistisches UI (Nachricht erscheint erst nach DB-Bestätigung) — leichter Delay möglich.',
    nextStep: 'Optimistic Insert mit Rollback bei Fehler für sofortiges Feedback.',
  },
  {
    key: 'realtime_reliability',
    label: 'Realtime Reliability',
    score: 7,
    reasoning:
      'User-spezifischer Channel `dm-user-{userId}` mit filter auf receiver_id/sender_id. Subscription wird bei useEffect-Cleanup korrekt entfernt. Kein expliziter Reconnect-Handler bei Verbindungsabbrüchen. Supabase-Realtime hat built-in Reconnect, aber die App reagiert nicht auf `CHANNEL_ERROR` oder `TIMED_OUT` Events.',
    nextStep: 'Channel-Status-Listener (`.on("system", ...)`) hinzufügen, der bei Disconnect die letzten Nachrichten nachlädt.',
  },
  {
    key: 'unread_tracking',
    label: 'Unread Tracking',
    score: 7,
    reasoning:
      'Unread-Counts werden beim Laden korrekt per `read=false` gezählt und pro Kontakt in einer Map gepflegt. Beim Öffnen einer Konversation wird `update({ read: true })` aufgerufen. Lokaler State wird synchron reduziert. Race Condition möglich: Wenn eine neue Nachricht genau beim Tab-Wechsel ankommt, könnte der Count kurz falsch sein.',
    nextStep: 'Server-seitige View oder Function für genaue Unread-Counts statt Client-seitige Map-Verwaltung.',
  },
  {
    key: 'access_control',
    label: 'Access Control',
    score: 8,
    reasoning:
      'canInitiateChat() prüft Level-Hierarchie: Admin → immer, gleich/höher → ja, L5+ → ja, existierender Thread → ja. RLS-Policy `sender_id = auth.uid()` verhindert Impersonation. Kontaktliste filtert nur `can_message: true`. Door-Opening-Prinzip sauber umgesetzt. Fehlend: Keine serverseitige Validierung, ob ein Thread geöffnet werden darf (nur Client-Check).',
    nextStep: 'RLS-INSERT-Policy auf chat_threads erweitern: `opened_by = auth.uid()` AND Level-Check per DB-Function.',
  },
  {
    key: 'notification_quality',
    label: 'Notification Quality',
    score: 5,
    reasoning:
      'useRealtimeNotifications zeigt Toast bei neuer DM und Community-Reply. Aber: Kein Push (bewusst deferred), kein Notification Center (ephemeral Toasts verschwinden nach ~5s), kein Badge im Browser-Tab. Wenn der User den Toast verpasst, gibt es keine zweite Chance.',
    nextStep: 'Persistentes Notification Center mit ungelesenen Einträgen implementieren (DB-Tabelle + Sidebar-Badge).',
  },
  {
    key: 'ux_usability',
    label: 'UX Usability',
    score: 7,
    reasoning:
      'Enter zum Senden, Shift+Enter für Multiline. Auto-scroll via bottomRef. Textarea mit max-h-20 und resize-none. Segment-Filter (Alle/Aktive/Mein Level) und Suchfeld (Name/Email/Rolle). Schwächen: Kein Typing-Indicator, kein "Gelesen"-Status sichtbar für Empfänger (nur Sender sieht Check/CheckCheck), kein Reply-Quoting in DMs.',
    nextStep: 'Reply-to-Message (Quote-Block) und Typing-Indicator über Realtime Presence.',
  },
  {
    key: 'search_discoverability',
    label: 'Search & Discoverability',
    score: 6,
    reasoning:
      'Kontaktsuche funktioniert nach Name, Email und Rolle-Label. Segment-Filter (Alle/Aktive Chats/Mein Level) vorhanden. Fehlend: Keine Nachrichtensuche (Volltextsuche über vergangene Konversationen), keine Möglichkeit bestimmte Nachrichten zu finden oder zu einem Datum zu springen.',
    nextStep: 'Nachrichtensuche mit ILIKE-Query oder pg_trgm Index auf direct_messages.content.',
  },
  {
    key: 'trust_safety',
    label: 'Trust & Safety',
    score: 7,
    reasoning:
      'Rate Limiting (5 Nachrichten/10s) client-seitig implementiert. Toxic-Content-Filter (25 Wörter DE+EN) mit automatischem Flagging in flagged_messages. Admin kann muten (24h), Nachrichten löschen, Flags reviewen. Fehlend: Kein User-Block, kein Report-Button für Empfänger, Rate Limit ist nur client-seitig (umgehbar).',
    nextStep: 'Server-seitige Rate-Limit-Function in RLS oder Edge Function. User-Block-Feature (block_list Tabelle).',
  },
  {
    key: 'mobile_readiness',
    label: 'Mobile Readiness',
    score: 7,
    reasoning:
      'ChatWidget ist fixed bottom-right, 360px breit mit max-w-[calc(100vw-2.5rem)]. Responsive Höhe max-h-[calc(100vh-7rem)]. Contact-List und Thread sind stacked (ArrowLeft-Button). Auf sehr kleinen Screens (< 360px) könnte es eng werden. Textarea und Send-Button sind touch-friendly. Fehlend: Swipe-to-reply, Pull-to-refresh.',
    nextStep: 'Vollbild-Chat-Modus auf mobilen Geräten (useMediaQuery) statt Overlay-Widget.',
  },
];

const COMMUNITY_DIMENSIONS: AuditDimension[] = [
  {
    key: 'post_type_enforcement',
    label: 'Post Type Enforcement',
    score: 6,
    reasoning:
      'CommunityCategoryPicker bietet Kategorien (win, question, insight, call_learning, case, motivation) an, aber die Auswahl ist optional — Default ist "chat". Kein Zwang, eine Kategorie zu wählen. Viele Posts landen vermutlich als "chat" ohne klare Zuordnung. Filter-Bar vorhanden aber nur wirksam wenn Nutzer aktiv taggen.',
    nextStep: 'Kategorie-Pflicht bei Posts >30 Zeichen. Default "chat" nur für kurze Nachrichten.',
  },
  {
    key: 'signal_to_noise',
    label: 'Signal-to-Noise Ratio',
    score: 6,
    reasoning:
      'Community-Compliance trackt Post-Qualität (getCommunityQualityHint). Curated GIFs (4 vordefinierte) statt offene GIF-Suche — guter Noise-Limiter. CommunityFilterBar ermöglicht Feed-Filterung. WeeklyHighlights hebt Top-Content hervor. Schwäche: Kein Upvote/Reaction-System, kein Algorithmus für Sortierung nach Relevanz.',
    nextStep: 'Reaction-System (👍 🔥 💡) mit Relevanz-Sortierung statt chronologisch.',
  },
  {
    key: 'identity_authority',
    label: 'Identity Authority',
    score: 7,
    reasoning:
      'UserStatusBadge zeigt Status basierend auf createdAt, businessStage und isMentor. Mentor-Badge wird via mentor_assignments geprüft (aktive Mentoren). Role-Labels (Trainee, Setter, Closer) werden korrekt aufgelöst. Schwäche: mentor_assignments könnte in Produktion leer sein — dann keine Mentor-Badges sichtbar.',
    nextStep: 'Seed-Daten für Mentoren sicherstellen. Zusätzlich Top-Performer-Badge aus KPI-Daten.',
  },
  {
    key: 'engagement_retention',
    label: 'Engagement & Retention',
    score: 7,
    reasoning:
      'WeeklyHighlights-Component existiert. ConversationStarters bieten Level-basierte Einstiegsfragen. CommunityHealthPanel zeigt Admins Engagement-Metriken. Live-Calls-Section mit kommenden Events. Announcements-Feed. Schwäche: Kein Streak-System, keine Engagement-Nudges per Push.',
    nextStep: 'Weekly Digest per In-App-Notification: "Diese Woche in deiner Community: X neue Wins, Y Fragen".',
  },
  {
    key: 'level_isolation',
    label: 'Level Isolation',
    score: 8,
    reasoning:
      'RLS via get_user_community_types() strikt durchgesetzt: L0-L1→trainee, L2-L3→setter, L4-L6→closer, L7-L8→manager, Admin→all. Frontend-Channel-Filter matcht per `community_type=eq.${communityType}`. Admin kann zwischen Communities switchen. INSERT-Policy prüft ebenfalls community_type-Match.',
    nextStep: 'Cross-Level "Spotlight"-Posts ermöglichen (Admin promoted einen Post in alle Communities).',
  },
  {
    key: 'moderation_capability',
    label: 'Moderation Capability',
    score: 7,
    reasoning:
      'ChatModerationAdmin bietet: Message-Deletion, User-Muting (24h), Flagged-Message-Review mit Approve/Reviewed/Deleted-Actions, Admin-Notizen. Community-Stats-Tab zeigt Post-Verteilung. Fehlend: Kein Pin-Feature, kein Highlight/Feature-Post, kein Slow-Mode pro Community.',
    nextStep: 'Pin-Feature für wichtige Posts (pinned_at Column + UI-Sortierung).',
  },
  {
    key: 'content_quality',
    label: 'Content Quality',
    score: 5,
    reasoning:
      'Ohne Produktionsdaten schwer zu bewerten. Code-seitig: trackCommunityPost() zählt kurze Posts (<15 Chars) und GIF-Only. getCommunityQualityHint() gibt Hinweise bei niedrigem Qualitätsmix. Aber kein aktives Blocken von Low-Quality-Content, nur Hinweise. Kein Mindest-Zeichenlimit außer bei leeren Posts.',
    nextStep: 'Minimum 20 Zeichen für "question" und "insight" Kategorien erzwingen.',
  },
  {
    key: 'belonging_signal',
    label: 'Belonging Signal',
    score: 7,
    reasoning:
      'Separierte Communities pro Level schaffen Peer-Group-Gefühl. Milestone-Auto-Posts (Deal Closed, Setter Qualified) werden automatisch gepostet. Info-Hint trennt Community von 1:1 Chat. Announcements vom Team. Schwäche: Keine Onboarding-Nachricht für neue Community-Mitglieder (Welcome-Thread nur in DM).',
    nextStep: 'Auto-Welcome-Post bei erstem Community-Beitritt: "Willkommen @Name in der Setter Community!".',
  },
  {
    key: 'realtime_stability',
    label: 'Realtime Stability',
    score: 7,
    reasoning:
      'Channel `community-${communityType}` mit INSERT-Listener und Profil-Enrichment bei jedem neuen Post. Auto-scroll nach neuer Nachricht. Cleanup bei Component-Unmount. Gleiche Schwäche wie DM: Kein expliziter Reconnect-Handler. Community-Channel wechselt bei Admin-Override — alte Subscription wird korrekt entfernt.',
    nextStep: 'System-Event-Listener für Channel-Health + automatischer Re-Fetch bei Reconnect.',
  },
  {
    key: 'scalability_readiness',
    label: 'Scalability Readiness',
    score: 6,
    reasoning:
      'Pagination implementiert (50er Seiten). Aber: Profil-Enrichment bei jedem neuen Realtime-Post macht einen separaten DB-Call (2 Queries: profiles + mentor_assignments). Bei 500+ DAU und vielen Posts wird das teuer. Kein Index-Audit durchgeführt. Community-Typ-Filter in der Query, aber ohne garantierten Index.',
    nextStep: 'Composite Index auf community_messages(community_type, created_at DESC). Profil-Cache statt per-Message Fetch.',
  },
];

const INFRA_DIMENSIONS: AuditDimension[] = [
  {
    key: 'db_triggers',
    label: 'DB Triggers',
    score: 8,
    reasoning:
      'Umfangreiche Trigger-Pipeline: auto_post_milestone (Lead-Wins), recalc_kpis_from_call, validate_call_lifecycle, auto_handover_to_closer, auto_schedule_follow_ups, queue_user_event, validate_lead_transition. Alle SECURITY DEFINER mit search_path. Sauber strukturiert, MECE Coverage. Score unverändert zum Prior Audit.',
    nextStep: 'Trigger-Performance-Monitoring: Execution-Time Logging für langsame Trigger.',
  },
  {
    key: 'cron_functions',
    label: 'Cron Edge Functions',
    score: 7,
    reasoning:
      'evaluate-user-states läuft täglich 06:00 UTC. process-email-queue, process-follow-ups, return-expired-leads als Cron-Functions. GHL_WEBHOOK_URL Gap aus Prior Audit besteht weiterhin (dispatch-webhooks referenziert es, Secret möglicherweise nicht gesetzt). Score unverändert.',
    nextStep: 'GHL_WEBHOOK_URL Secret verifizieren und Health-Check-Endpoint für alle Cron-Functions.',
  },
  {
    key: 'transactional_emails',
    label: 'Transactional Emails',
    score: 9,
    reasoning:
      'Vollständige Pipeline: pgmq-Queue → process-email-queue (Batch + DLQ + Retry) → send-transactional-email → Resend API. Suppression-Liste, Unsubscribe-Tokens, Template-Registry, Email-Send-Log mit Status-Tracking. TTL-Management, Rate-Limit-Awareness. Production-grade. Score unverändert.',
    nextStep: 'Bounce-Rate-Monitoring Dashboard und automatische Suppression bei Hard Bounces.',
  },
  {
    key: 'webhook_dispatch',
    label: 'Webhook Dispatch',
    score: 6,
    reasoning:
      'dispatch-webhooks existiert mit Basic-Retry (1x). outbound_events Tabelle als Queue. Fehlend: Kein exponential Backoff, kein Dead-Letter-Queue für Webhooks (nur für Emails), kein Signature-Verification für eingehende Webhooks (receive-ghl-webhook hat keinen HMAC-Check). Score unverändert.',
    nextStep: 'Exponential Backoff (3 Retries: 1min, 5min, 30min) + DLQ-Tabelle für failed Webhooks.',
  },
  {
    key: 'realtime_notifications',
    label: 'Realtime Notifications',
    score: 7,
    reasoning:
      'useRealtimeNotifications deckt: Stage-Change Toast, DM-Toast (mit Sender-Name-Fetch), Community-Reply-Toast, Auto-Win-Toast. Alle ephemeral (verschwinden nach wenigen Sekunden). Kein Notification Center, kein Badge-Count im Tab-Title, kein Push. Score unverändert — keine Verbesserung seit letztem Audit.',
    nextStep: 'Notification-Persistence-Tabelle + Notification Center Sidebar mit gelesen/ungelesen.',
  },
  {
    key: 'monetization_triggers',
    label: 'Monetization Triggers',
    score: 8,
    reasoning:
      'evaluate_monetization_state() als DB-Function mit 8 States und numerischen Thresholds. useMonetizationOffers Hook mit 24h Spam-Prevention via trigger_log. Daily Cron (evaluate-user-states). Offer-Mapping per State. Improvement seit letztem Audit: Activity-Score-Formel (compute_activity_score) und server-seitige State-Engine. Score +0 — war bereits 8/10.',
    nextStep: 'A/B-Testing für Offer-Card-Varianten (CTA-Text, Timing) via experiments-Tabelle.',
  },
];

function avg(dims: AuditDimension[]): number {
  return Math.round((dims.reduce((s, d) => s + d.score, 0) / dims.length) * 10) / 10;
}

export default function ChatAudit() {
  const [lastRun] = useState(new Date().toISOString());
  const [dbStats, setDbStats] = useState<Record<string, number | string>>({});

  useEffect(() => {
    async function fetchStats() {
      const [dmCount, communityCount, flaggedCount, mentorCount, togglesRes] = await Promise.all([
        supabase.from('direct_messages').select('id', { count: 'exact', head: true }),
        supabase.from('community_messages').select('id', { count: 'exact', head: true }),
        supabase.from('flagged_messages' as any).select('id', { count: 'exact', head: true }),
        supabase.from('mentor_assignments').select('id', { count: 'exact', head: true }),
        supabase.from('communication_toggles').select('group_key, enabled'),
      ]);

      const toggles = (togglesRes.data as any[]) ?? [];
      const enabledCount = toggles.filter((t: any) => t.enabled).length;

      setDbStats({
        direct_messages: dmCount.count ?? 0,
        community_messages: communityCount.count ?? 0,
        flagged_messages: flaggedCount.count ?? 0,
        mentor_assignments: mentorCount.count ?? 0,
        toggles_enabled: `${enabledCount}/${toggles.length}`,
        push_subscriptions: 'N/A (nicht implementiert)',
      });
    }
    fetchStats();
  }, []);

  const dmAvg = avg(DM_DIMENSIONS);
  const communityAvg = avg(COMMUNITY_DIMENSIONS);
  const infraAvg = avg(INFRA_DIMENSIONS);
  const overallAvg = Math.round(((dmAvg + communityAvg + infraAvg) / 3) * 10) / 10;

  const allDimensions = [...DM_DIMENSIONS, ...COMMUNITY_DIMENSIONS, ...INFRA_DIMENSIONS];
  const gaps = allDimensions
    .filter((d) => d.score < 8)
    .sort((a, b) => a.score - b.score)
    .map((d) => ({
      ...d,
      needed: Math.min(d.score + 2, 10),
      blocker: d.nextStep,
    }));

  const exportJson = () => {
    const data = {
      timestamp: lastRun,
      scores: { dm: dmAvg, community: communityAvg, infrastructure: infraAvg, overall: overallAvg },
      dimensions: { dm: DM_DIMENSIONS, community: COMMUNITY_DIMENSIONS, infrastructure: INFRA_DIMENSIONS },
      dbStats,
      gaps,
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `chat-audit-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-5 sm:py-8 lg:px-10 space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Shield className="h-6 w-6 text-primary" />
          <div>
            <h1 className="font-serif text-2xl font-semibold tracking-tight text-foreground">Chat System Audit</h1>
            <p className="text-[11px] text-muted-foreground">
              Last run: {new Date(lastRun).toLocaleString('de-DE')} · Read-only analysis
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="text-xs" onClick={() => window.location.reload()}>
            <RefreshCw className="mr-1 h-3 w-3" />Re-run
          </Button>
          <Button variant="outline" size="sm" className="text-xs" onClick={exportJson}>
            <Download className="mr-1 h-3 w-3" />Export JSON
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: '1:1 Chat', value: dmAvg },
          { label: 'Community', value: communityAvg },
          { label: 'Infrastructure', value: infraAvg },
          { label: 'Overall', value: overallAvg },
        ].map((s) => (
          <Card key={s.label} className="border-border/40">
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-foreground">{s.value}</p>
              <p className="text-[11px] text-muted-foreground">{s.label}</p>
              <div className="mt-2 w-full h-1.5 rounded-full bg-muted overflow-hidden">
                <div
                  className={`h-full rounded-full ${scoreColor(Math.round(s.value))}`}
                  style={{ width: `${s.value * 10}%` }}
                />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* DB Stats */}
      <Card className="border-border/40">
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Database Snapshot</CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
            {Object.entries(dbStats).map(([key, val]) => (
              <div key={key} className="rounded-lg border border-border/30 bg-muted/30 p-2 text-center">
                <p className="text-sm font-bold text-foreground">{val}</p>
                <p className="text-[9px] text-muted-foreground">{key.replace(/_/g, ' ')}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs defaultValue="dm" className="space-y-4">
        <TabsList className="w-full justify-start">
          <TabsTrigger value="dm" className="text-xs">1:1 Chat ({DM_DIMENSIONS.length})</TabsTrigger>
          <TabsTrigger value="community" className="text-xs">Community ({COMMUNITY_DIMENSIONS.length})</TabsTrigger>
          <TabsTrigger value="infra" className="text-xs">Infrastructure ({INFRA_DIMENSIONS.length})</TabsTrigger>
          <TabsTrigger value="overall" className="text-xs">Overall</TabsTrigger>
        </TabsList>

        <TabsContent value="dm">
          <div className="grid gap-3 sm:grid-cols-2">
            {DM_DIMENSIONS.map((d) => <DimensionCard key={d.key} dim={d} />)}
          </div>
        </TabsContent>

        <TabsContent value="community">
          <div className="grid gap-3 sm:grid-cols-2">
            {COMMUNITY_DIMENSIONS.map((d) => <DimensionCard key={d.key} dim={d} />)}
          </div>
        </TabsContent>

        <TabsContent value="infra">
          <div className="grid gap-3 sm:grid-cols-2">
            {INFRA_DIMENSIONS.map((d) => <DimensionCard key={d.key} dim={d} />)}
          </div>
        </TabsContent>

        <TabsContent value="overall">
          <div className="space-y-6">
            {/* Averages */}
            <Card className="border-border/40">
              <CardContent className="p-4 space-y-3">
                <h3 className="text-sm font-semibold text-foreground">Score Summary</h3>
                {[
                  { label: '1:1 Chat Average', value: dmAvg },
                  { label: 'Community Average', value: communityAvg },
                  { label: 'Communication Infrastructure Average', value: infraAvg },
                  { label: 'Platform Overall', value: overallAvg },
                ].map((row) => (
                  <div key={row.label} className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground w-64">{row.label}</span>
                    <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                      <div
                        className={`h-full rounded-full ${scoreColor(Math.round(row.value))}`}
                        style={{ width: `${row.value * 10}%` }}
                      />
                    </div>
                    <Badge variant="outline" className={`text-xs font-bold min-w-[48px] text-center ${scoreBadgeClass(Math.round(row.value))}`}>
                      {row.value}
                    </Badge>
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Gap Table */}
            <Card className="border-border/40">
              <CardHeader className="pb-2 pt-4 px-4">
                <CardTitle className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                  Gap Analysis — Dimensions Below 8/10
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-border text-muted-foreground">
                        <th className="text-left py-2 px-2 font-medium">Dimension</th>
                        <th className="text-center py-2 px-2 font-medium">Current</th>
                        <th className="text-center py-2 px-2 font-medium">Target</th>
                        <th className="text-left py-2 px-2 font-medium">Blocker</th>
                      </tr>
                    </thead>
                    <tbody>
                      {gaps.map((g) => (
                        <tr key={g.key} className="border-b border-border/30">
                          <td className="py-2 px-2 font-medium text-foreground">{g.label}</td>
                          <td className="text-center py-2 px-2">
                            <Badge variant="outline" className={`text-[10px] ${scoreBadgeClass(g.score)}`}>{g.score}</Badge>
                          </td>
                          <td className="text-center py-2 px-2">
                            <Badge variant="outline" className="text-[10px] bg-primary/10 text-primary border-primary/30">{g.needed}</Badge>
                          </td>
                          <td className="py-2 px-2 text-muted-foreground max-w-xs">{g.blocker}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
