import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface EventRow {
  id: string;
  level: string | null;
  message_type: string | null;
  template_key: string | null;
  event_type: string;
  channel: string | null;
  created_at: string;
}

export default function PerformanceLevelMessaging() {
  const [events, setEvents] = useState<EventRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("level_message_events")
        .select("id, level, message_type, template_key, event_type, channel, created_at")
        .order("created_at", { ascending: false })
        .limit(100);
      setEvents(data ?? []);
      setLoading(false);
    })();
  }, []);

  return (
    <div className="container mx-auto p-8 space-y-6">
      <div>
        <h1 className="text-3xl font-serif text-foreground">Level Messaging</h1>
        <p className="text-muted-foreground">Layer 30 — Activity in deinem Funnel</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent Events</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-muted-foreground">Lade…</p>
          ) : events.length === 0 ? (
            <p className="text-muted-foreground">
              Keine Events. Das System ist noch in Phase 1 (silent foundation).
            </p>
          ) : (
            <div className="space-y-2">
              {events.map((e) => (
                <div key={e.id} className="flex items-center justify-between p-3 border rounded-lg">
                  <div>
                    <div className="font-medium text-sm">{e.template_key ?? "—"}</div>
                    <div className="text-xs text-muted-foreground">
                      {e.level} · {e.message_type} · {e.channel ?? "—"}
                    </div>
                  </div>
                  <div className="text-right">
                    <Badge variant="outline">{e.event_type}</Badge>
                    <div className="text-xs text-muted-foreground mt-1">
                      {new Date(e.created_at).toLocaleString()}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
