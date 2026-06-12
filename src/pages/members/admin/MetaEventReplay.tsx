import { useEffect, useMemo, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { ArrowLeft, RefreshCw, Repeat } from "lucide-react";

type EventLog = {
  id: string;
  event_name: string;
  event_id: string | null;
  source: "browser" | "server" | "both" | "unknown";
  lead_id: string | null;
  session_id: string | null;
  appointment_id: string | null;
  origin_key: string | null;
  meta_response_status: number | null;
  meta_fbtrace_id: string | null;
  error_message: string | null;
  created_at: string;
};

const sourceVariant = (s: EventLog["source"]) => {
  switch (s) {
    case "browser":
      return "secondary" as const;
    case "server":
      return "default" as const;
    case "both":
      return "default" as const;
    default:
      return "outline" as const;
  }
};

export default function MetaEventReplay() {
  const [logs, setLogs] = useState<EventLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");
  const [replayingId, setReplayingId] = useState<string | null>(null);
  const [manualEventId, setManualEventId] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("meta_event_logs")
      .select(
        "id,event_name,event_id,source,lead_id,session_id,appointment_id,origin_key,meta_response_status,meta_fbtrace_id,error_message,created_at",
      )
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) {
      toast.error(`Failed to load logs: ${error.message}`);
    } else {
      setLogs((data ?? []) as EventLog[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const replay = useCallback(
    async (eventId: string | null) => {
      if (!eventId) {
        toast.error("This row has no event_id to replay.");
        return;
      }
      setReplayingId(eventId);
      const { error } = await supabase.rpc("log_meta_event_replay", {
        _event_id: eventId,
        _note: "manual QA replay from admin page",
      });
      setReplayingId(null);
      if (error) {
        toast.error(`Replay failed: ${error.message}`);
        return;
      }
      toast.success(`QA replay logged for ${eventId.slice(0, 32)}…`);
      void load();
    },
    [load],
  );

  const filtered = useMemo(() => {
    if (!filter.trim()) return logs;
    const q = filter.trim().toLowerCase();
    return logs.filter(
      (l) =>
        l.event_name.toLowerCase().includes(q) ||
        (l.event_id ?? "").toLowerCase().includes(q) ||
        (l.origin_key ?? "").toLowerCase().includes(q) ||
        (l.session_id ?? "").toLowerCase().includes(q),
    );
  }, [logs, filter]);

  return (
    <div className="container max-w-7xl py-8 space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Button asChild variant="ghost" size="sm">
              <Link to="/members/admin/meta-events">
                <ArrowLeft className="h-4 w-4 mr-1" /> Meta Events
              </Link>
            </Button>
          </div>
          <h1 className="text-2xl font-semibold">Event Replay (Debug)</h1>
          <p className="text-sm text-muted-foreground">
            Last 50 funnel events. Replay re-logs a QA entry against an
            existing event_id. It does <span className="font-medium">not</span>{" "}
            call Meta.
          </p>
        </div>
        <Button onClick={() => void load()} variant="outline" size="sm">
          <RefreshCw className="h-4 w-4 mr-1" /> Refresh
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Manual replay by event_id</CardTitle>
        </CardHeader>
        <CardContent className="flex gap-2 flex-wrap">
          <Input
            value={manualEventId}
            onChange={(e) => setManualEventId(e.target.value)}
            placeholder="paste event_id (e.g. Lead_<lead_id>_<ts>)"
            className="max-w-xl"
          />
          <Button
            onClick={() => void replay(manualEventId.trim() || null)}
            disabled={!manualEventId.trim() || replayingId === manualEventId.trim()}
          >
            <Repeat className="h-4 w-4 mr-1" /> Replay QA log
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <CardTitle className="text-base">Recent events</CardTitle>
          <Input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter by name, id, origin…"
            className="max-w-xs"
          />
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              Loading…
            </p>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              No events found.
            </p>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="whitespace-nowrap">Time</TableHead>
                    <TableHead>Event</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead>event_id</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Origin / Session</TableHead>
                    <TableHead className="text-right">Replay</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((l) => {
                    const ts = new Date(l.created_at);
                    const isReplay = l.error_message?.startsWith("[replay]");
                    return (
                      <TableRow key={l.id}>
                        <TableCell className="text-xs whitespace-nowrap text-muted-foreground">
                          {ts.toLocaleTimeString()}
                          <div className="text-[10px]">
                            {ts.toLocaleDateString()}
                          </div>
                        </TableCell>
                        <TableCell className="font-medium">
                          {l.event_name}
                          {isReplay && (
                            <Badge variant="outline" className="ml-2 text-[10px]">
                              replay
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant={sourceVariant(l.source)}>
                            {l.source}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-mono text-xs max-w-[260px] truncate">
                          {l.event_id ?? (
                            <span className="text-muted-foreground italic">
                              missing
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-xs">
                          {l.meta_response_status ? (
                            <span
                              className={
                                l.meta_response_status >= 200 &&
                                l.meta_response_status < 300
                                  ? "text-emerald-600"
                                  : "text-destructive"
                              }
                            >
                              {l.meta_response_status}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                          {l.error_message && !isReplay && (
                            <div className="text-[10px] text-destructive truncate max-w-[180px]">
                              {l.error_message}
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {l.origin_key ?? "—"}
                          <div className="font-mono text-[10px] truncate max-w-[180px]">
                            {l.session_id ?? l.lead_id ?? ""}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={!l.event_id || replayingId === l.event_id}
                            onClick={() => void replay(l.event_id)}
                          >
                            <Repeat className="h-3 w-3 mr-1" />
                            Replay
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
