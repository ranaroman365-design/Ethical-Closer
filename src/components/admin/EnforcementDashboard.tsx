import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertTriangle, CheckCircle, Shield, XCircle, RefreshCw, Ban } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/i18n/LanguageContext";

const statusColors: Record<string, string> = {
  open: "bg-yellow-100 text-yellow-800",
  escalated: "bg-red-100 text-red-800",
  resolved: "bg-green-100 text-green-800",
  overridden: "bg-blue-100 text-blue-800",
};

const blockTypeLabels: Record<string, string> = {
  no_new_leads: "Keine neuen Leads",
  access_restricted: "Zugriff eingeschränkt",
  review_required: "Review erforderlich",
};

export default function EnforcementDashboard() {
  const { toast } = useToast();
  const { lang: language } = useLanguage();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("violations");

  const { data: violations, isLoading: loadingViolations } = useQuery({
    queryKey: ["enforcement-violations"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("enforcement_violations")
        .select("*, enforcement_rules(title, rule_key, consequence)")
        .order("detected_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data;
    },
  });

  const { data: rules } = useQuery({
    queryKey: ["enforcement-rules"],
    queryFn: async () => {
      const { data, error } = await supabase.from("enforcement_rules").select("*").order("rule_key");
      if (error) throw error;
      return data;
    },
  });

  const { data: blocks } = useQuery({
    queryKey: ["operator-blocks"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("operator_blocks")
        .select("*")
        .eq("is_active", true)
        .order("blocked_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const runCheckMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("enforcement-check");
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      toast({ title: "Enforcement Check abgeschlossen", description: JSON.stringify(data?.results || {}) });
      queryClient.invalidateQueries({ queryKey: ["enforcement-violations"] });
      queryClient.invalidateQueries({ queryKey: ["operator-blocks"] });
    },
    onError: (err) => {
      toast({ title: "Fehler", description: String(err), variant: "destructive" });
    },
  });

  const resolveViolation = useMutation({
    mutationFn: async (violationId: string) => {
      const { error } = await supabase
        .from("enforcement_violations")
        .update({ status: "resolved", resolved_at: new Date().toISOString() })
        .eq("id", violationId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["enforcement-violations"] });
      toast({ title: "Violation resolved" });
    },
  });

  const openCount = violations?.filter((v: any) => v.status === "open").length ?? 0;
  const escalatedCount = violations?.filter((v: any) => v.status === "escalated").length ?? 0;
  const activeBlocks = blocks?.length ?? 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Shield className="h-6 w-6" />
            {language === "de" ? "Enforcement Dashboard" : "Enforcement Dashboard"}
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            {language === "de"
              ? "Execution wird erzwungen, nicht empfohlen."
              : "Execution is enforced, not recommended."}
          </p>
        </div>
        <Button onClick={() => runCheckMutation.mutate()} disabled={runCheckMutation.isPending}>
          <RefreshCw className={`h-4 w-4 mr-2 ${runCheckMutation.isPending ? "animate-spin" : ""}`} />
          {language === "de" ? "Check ausführen" : "Run Check"}
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <AlertTriangle className="h-8 w-8 text-yellow-500" />
              <div>
                <p className="text-2xl font-bold">{openCount}</p>
                <p className="text-sm text-muted-foreground">Offene Violations</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <XCircle className="h-8 w-8 text-red-500" />
              <div>
                <p className="text-2xl font-bold">{escalatedCount}</p>
                <p className="text-sm text-muted-foreground">Eskaliert</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <Ban className="h-8 w-8 text-red-600" />
              <div>
                <p className="text-2xl font-bold">{activeBlocks}</p>
                <p className="text-sm text-muted-foreground">Aktive Blocks</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <CheckCircle className="h-8 w-8 text-green-500" />
              <div>
                <p className="text-2xl font-bold">{rules?.filter((r: any) => r.is_active).length ?? 0}</p>
                <p className="text-sm text-muted-foreground">Aktive Regeln</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="violations">
            Violations {openCount + escalatedCount > 0 && `(${openCount + escalatedCount})`}
          </TabsTrigger>
          <TabsTrigger value="blocks">Blocks {activeBlocks > 0 && `(${activeBlocks})`}</TabsTrigger>
          <TabsTrigger value="rules">Regeln</TabsTrigger>
        </TabsList>

        <TabsContent value="violations">
          <Card>
            <CardHeader>
              <CardTitle>Aktive Violations</CardTitle>
            </CardHeader>
            <CardContent>
              {loadingViolations ? (
                <p className="text-muted-foreground">Laden...</p>
              ) : !violations?.length ? (
                <p className="text-muted-foreground text-center py-8">✅ Keine Violations — System läuft sauber.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Regel</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Eskalation</TableHead>
                      <TableHead>Erkannt</TableHead>
                      <TableHead>Kontext</TableHead>
                      <TableHead>Aktion</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {violations.map((v: any) => (
                      <TableRow key={v.id}>
                        <TableCell className="font-medium">
                          {(v.enforcement_rules as any)?.title ?? v.rule_id}
                        </TableCell>
                        <TableCell>
                          <Badge className={statusColors[v.status] ?? ""}>{v.status}</Badge>
                        </TableCell>
                        <TableCell>
                          <span className={v.escalation_level >= 3 ? "text-red-600 font-bold" : ""}>
                            Stufe {v.escalation_level}/3
                          </span>
                        </TableCell>
                        <TableCell className="text-sm">
                          {new Date(v.detected_at).toLocaleString("de-DE")}
                        </TableCell>
                        <TableCell className="text-xs max-w-[200px] truncate">
                          {(v.context as any)?.reason ?? "—"}
                        </TableCell>
                        <TableCell>
                          {v.status !== "resolved" && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => resolveViolation.mutate(v.id)}
                            >
                              Resolve
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="blocks">
          <Card>
            <CardHeader>
              <CardTitle>Aktive Operator Blocks</CardTitle>
            </CardHeader>
            <CardContent>
              {!blocks?.length ? (
                <p className="text-muted-foreground text-center py-8">Keine aktiven Blocks.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Operator</TableHead>
                      <TableHead>Block-Typ</TableHead>
                      <TableHead>Grund</TableHead>
                      <TableHead>Seit</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {blocks.map((b: any) => (
                      <TableRow key={b.id}>
                        <TableCell className="font-mono text-xs">{b.operator_id?.slice(0, 8)}…</TableCell>
                        <TableCell>
                          <Badge variant="destructive">
                            {blockTypeLabels[b.block_type] ?? b.block_type}
                          </Badge>
                        </TableCell>
                        <TableCell>{b.reason ?? "—"}</TableCell>
                        <TableCell>{new Date(b.blocked_at).toLocaleString("de-DE")}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="rules">
          <Card>
            <CardHeader>
              <CardTitle>Enforcement Regeln</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Regel</TableHead>
                    <TableHead>Typ</TableHead>
                    <TableHead>Schwelle</TableHead>
                    <TableHead>Konsequenz</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rules?.map((r: any) => (
                    <TableRow key={r.id}>
                      <TableCell>
                        <div>
                          <p className="font-medium">{r.title}</p>
                          <p className="text-xs text-muted-foreground">{r.description}</p>
                        </div>
                      </TableCell>
                      <TableCell><Badge variant="outline">{r.check_type}</Badge></TableCell>
                      <TableCell>{r.threshold_hours}h</TableCell>
                      <TableCell>
                        <Badge variant={r.consequence === "block" ? "destructive" : "secondary"}>
                          {r.consequence}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {r.is_active ? (
                          <CheckCircle className="h-4 w-4 text-green-500" />
                        ) : (
                          <XCircle className="h-4 w-4 text-muted-foreground" />
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
