import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Bot, MessageSquare, Users, TrendingUp, RefreshCw, Zap, ArrowRightLeft, AlertTriangle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/i18n/LanguageContext";

const actionTypeIcons: Record<string, string> = {
  message_sent: "💬",
  task_created: "📋",
  channel_switch: "🔄",
  escalation: "⚠️",
  handoff: "🤝",
  status_change: "📊",
  rebooking_offer: "📅",
};

const handoffStatusColors: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800",
  accepted: "bg-blue-100 text-blue-800",
  completed: "bg-green-100 text-green-800",
  expired: "bg-gray-100 text-gray-800",
};

export default function AIOperatorDashboard() {
  const { toast } = useToast();
  const { lang } = useLanguage();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("overview");

  // Load config
  const { data: config } = useQuery({
    queryKey: ["ai-operator-config"],
    queryFn: async () => {
      const { data, error } = await supabase.from("ai_operator_config").select("*").limit(1);
      if (error) throw error;
      return data?.[0];
    },
  });

  // Load recent actions
  const { data: actions, isLoading: loadingActions } = useQuery({
    queryKey: ["ai-operator-actions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ai_operator_actions")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data;
    },
  });

  // Load handoffs
  const { data: handoffs } = useQuery({
    queryKey: ["ai-operator-handoffs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ai_operator_handoffs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data;
    },
  });

  // Load metrics
  const { data: metrics } = useQuery({
    queryKey: ["ai-operator-metrics"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ai_operator_metrics")
        .select("*")
        .order("date", { ascending: false })
        .limit(30);
      if (error) throw error;
      return data;
    },
  });

  // Toggle active
  const toggleActive = useMutation({
    mutationFn: async (active: boolean) => {
      if (!config?.id) return;
      const { error } = await supabase
        .from("ai_operator_config")
        .update({ is_active: active })
        .eq("id", config.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ai-operator-config"] });
      toast({ title: config?.is_active ? "AI Operator deaktiviert" : "AI Operator aktiviert" });
    },
  });

  // Run batch scan
  const runScan = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("ai-operator", {
        body: {},
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      toast({ title: "Scan abgeschlossen", description: JSON.stringify(data?.results || {}) });
      queryClient.invalidateQueries({ queryKey: ["ai-operator-actions"] });
      queryClient.invalidateQueries({ queryKey: ["ai-operator-handoffs"] });
    },
    onError: (err) => {
      toast({ title: "Fehler", description: String(err), variant: "destructive" });
    },
  });

  const totalActions = actions?.length ?? 0;
  const messagesSent = actions?.filter((a: any) => a.action_type === "message_sent").length ?? 0;
  const handoffCount = handoffs?.filter((h: any) => h.status === "pending").length ?? 0;
  const successRate = totalActions > 0
    ? Math.round((actions?.filter((a: any) => a.success).length ?? 0) / totalActions * 100)
    : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Bot className="h-6 w-6" />
            AI Operator System
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            {lang === "de"
              ? "AI ersetzt nicht Menschen. AI eliminiert Ineffizienz."
              : "AI doesn't replace people. AI eliminates inefficiency."}
          </p>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">
              {config?.is_active ? "Aktiv" : "Inaktiv"}
            </span>
            <Switch
              checked={config?.is_active ?? false}
              onCheckedChange={(checked) => toggleActive.mutate(checked)}
            />
          </div>
          <Button onClick={() => runScan.mutate()} disabled={runScan.isPending || !config?.is_active}>
            <RefreshCw className={`h-4 w-4 mr-2 ${runScan.isPending ? "animate-spin" : ""}`} />
            Batch Scan
          </Button>
        </div>
      </div>

      {/* Status Banner */}
      {!config?.is_active && (
        <Card className="border-yellow-300 bg-yellow-50">
          <CardContent className="pt-4 flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 text-yellow-600" />
            <p className="text-sm text-yellow-800">
              AI Operator ist deaktiviert. Aktiviere ihn, um automatische Lead-Bearbeitung zu starten.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <Zap className="h-8 w-8 text-blue-500" />
              <div>
                <p className="text-2xl font-bold">{totalActions}</p>
                <p className="text-sm text-muted-foreground">Aktionen (gesamt)</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <MessageSquare className="h-8 w-8 text-green-500" />
              <div>
                <p className="text-2xl font-bold">{messagesSent}</p>
                <p className="text-sm text-muted-foreground">Nachrichten gesendet</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <ArrowRightLeft className="h-8 w-8 text-orange-500" />
              <div>
                <p className="text-2xl font-bold">{handoffCount}</p>
                <p className="text-sm text-muted-foreground">Offene Handoffs</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <TrendingUp className="h-8 w-8 text-emerald-500" />
              <div>
                <p className="text-2xl font-bold">{successRate}%</p>
                <p className="text-sm text-muted-foreground">Erfolgsrate</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="overview">Aktionen</TabsTrigger>
          <TabsTrigger value="handoffs">Handoffs {handoffCount > 0 && `(${handoffCount})`}</TabsTrigger>
          <TabsTrigger value="metrics">KPIs</TabsTrigger>
          <TabsTrigger value="config">Konfiguration</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <Card>
            <CardHeader>
              <CardTitle>Letzte AI-Aktionen</CardTitle>
            </CardHeader>
            <CardContent>
              {loadingActions ? (
                <p className="text-muted-foreground">Laden...</p>
              ) : !actions?.length ? (
                <p className="text-muted-foreground text-center py-8">
                  Noch keine Aktionen. Aktiviere den AI Operator und starte einen Batch Scan.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Event</TableHead>
                      <TableHead>Aktion</TableHead>
                      <TableHead>Kanal</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Entscheidung</TableHead>
                      <TableHead>Zeit</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {actions.map((a: any) => (
                      <TableRow key={a.id}>
                        <TableCell>
                          <Badge variant="outline">{a.event_type}</Badge>
                        </TableCell>
                        <TableCell>
                          <span className="flex items-center gap-1">
                            {actionTypeIcons[a.action_type] ?? "⚡"}
                            {a.action_type}
                          </span>
                        </TableCell>
                        <TableCell>{a.channel ?? "—"}</TableCell>
                        <TableCell>
                          <Badge variant={a.success ? "default" : "destructive"}>
                            {a.success ? "✓" : "✗"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs max-w-[250px] truncate">
                          {a.decision_reasoning ?? "—"}
                        </TableCell>
                        <TableCell className="text-sm">
                          {new Date(a.created_at).toLocaleString("de-DE")}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="handoffs">
          <Card>
            <CardHeader>
              <CardTitle>Human Handoffs</CardTitle>
            </CardHeader>
            <CardContent>
              {!handoffs?.length ? (
                <p className="text-muted-foreground text-center py-8">Keine Handoffs.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Lead</TableHead>
                      <TableHead>Grund</TableHead>
                      <TableHead>AI Summary</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Erstellt</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {handoffs.map((h: any) => (
                      <TableRow key={h.id}>
                        <TableCell className="font-mono text-xs">{h.lead_id?.slice(0, 8)}…</TableCell>
                        <TableCell>
                          <Badge variant="outline">{h.reason}</Badge>
                        </TableCell>
                        <TableCell className="text-xs max-w-[300px] truncate">
                          {h.ai_summary ?? "—"}
                        </TableCell>
                        <TableCell>
                          <Badge className={handoffStatusColors[h.status] ?? ""}>
                            {h.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm">
                          {new Date(h.created_at).toLocaleString("de-DE")}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="metrics">
          <Card>
            <CardHeader>
              <CardTitle>AI Operator KPIs</CardTitle>
            </CardHeader>
            <CardContent>
              {!metrics?.length ? (
                <p className="text-muted-foreground text-center py-8">
                  Noch keine Metriken. KPIs werden nach dem ersten aktiven Tag berechnet.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Datum</TableHead>
                      <TableHead>Leads</TableHead>
                      <TableHead>Nachrichten</TableHead>
                      <TableHead>Bookings</TableHead>
                      <TableHead>Handoffs</TableHead>
                      <TableHead>Response %</TableHead>
                      <TableHead>Booking %</TableHead>
                      <TableHead>Show %</TableHead>
                      <TableHead>Close %</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {metrics.map((m: any) => (
                      <TableRow key={m.id}>
                        <TableCell>{m.date}</TableCell>
                        <TableCell>{m.leads_processed}</TableCell>
                        <TableCell>{m.messages_sent}</TableCell>
                        <TableCell>{m.bookings_created}</TableCell>
                        <TableCell>{m.handoffs_triggered}</TableCell>
                        <TableCell>{m.response_rate}%</TableCell>
                        <TableCell>{m.booking_rate}%</TableCell>
                        <TableCell>{m.show_rate}%</TableCell>
                        <TableCell>{m.conversion_rate}%</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="config">
          <Card>
            <CardHeader>
              <CardTitle>AI Operator Konfiguration</CardTitle>
            </CardHeader>
            <CardContent>
              {config ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-4 border rounded-lg">
                      <p className="text-sm font-medium text-muted-foreground">Erstkontakt Delay</p>
                      <p className="text-xl font-bold">{config.auto_contact_delay_seconds}s</p>
                      <p className="text-xs text-muted-foreground">= {Math.round(config.auto_contact_delay_seconds / 60)} Minuten</p>
                    </div>
                    <div className="p-4 border rounded-lg">
                      <p className="text-sm font-medium text-muted-foreground">Kanal-Priorität</p>
                      <div className="flex gap-1 mt-1">
                        {(config.channels_priority as string[])?.map((ch: string, i: number) => (
                          <Badge key={ch} variant="secondary">
                            {i + 1}. {ch}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="p-4 border rounded-lg">
                    <p className="text-sm font-medium text-muted-foreground mb-2">Safety Rules</p>
                    <div className="flex flex-wrap gap-2">
                      {Object.entries(config.safety_rules as Record<string, unknown>).map(([key, val]) => (
                        <Badge key={key} variant={val ? "default" : "destructive"}>
                          {key}: {String(val)}
                        </Badge>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-4 border rounded-lg">
                      <p className="text-sm font-medium text-muted-foreground mb-2">No-Show Sequence</p>
                      {(config.noshow_sequence as any[])?.map((step: any, i: number) => (
                        <p key={i} className="text-xs">
                          +{step.delay_minutes}min → {step.action} ({step.channel})
                        </p>
                      ))}
                    </div>
                    <div className="p-4 border rounded-lg">
                      <p className="text-sm font-medium text-muted-foreground mb-2">No-Close Sequence</p>
                      {(config.noclose_sequence as any[])?.map((step: any, i: number) => (
                        <p key={i} className="text-xs">
                          +{step.delay_hours}h → {step.action} {step.content_type ? `(${step.content_type})` : ""}
                        </p>
                      ))}
                    </div>
                  </div>

                  <div className="p-4 border rounded-lg">
                    <p className="text-sm font-medium text-muted-foreground mb-2">Handoff Triggers</p>
                    <div className="flex flex-wrap gap-2">
                      {Object.entries(config.handoff_triggers as Record<string, boolean>).map(([key, active]) => (
                        <Badge key={key} variant={active ? "default" : "outline"}>
                          {key}: {active ? "✓" : "✗"}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-muted-foreground">Konfiguration wird geladen...</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
