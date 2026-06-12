import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Loader2, Plus, Trash2, Send, Calendar } from "lucide-react";

interface Drop {
  id: string;
  title: string;
  content: string;
  drop_type: string | null;
  format: string;
  scheduled_for: string;
  scheduled_time: string | null;
  published: boolean;
  published_at: string | null;
  author_type: string;
  priority: number;
}

const DROP_TYPES = ["insight", "question", "win", "drop", "founder", "social", "reflection", "inner_voice"];

export default function AdminHeartbeatPage() {
  const { isLoading, isAdmin, user } = useAuth();
  const [drops, setDrops] = useState<Drop[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);

  // New drop form
  const [nTitle, setNTitle] = useState("");
  const [nContent, setNContent] = useState("");
  const [nType, setNType] = useState("insight");
  const [nDate, setNDate] = useState(new Date().toISOString().slice(0, 10));

  useEffect(() => {
    if (!isAdmin) return;
    load();
  }, [isAdmin]);

  async function load() {
    setLoading(true);
    const since = new Date();
    since.setDate(since.getDate() - 7);
    const { data } = await supabase
      .from("community_drops")
      .select("*")
      .gte("scheduled_for", since.toISOString().slice(0, 10))
      .order("scheduled_for", { ascending: true })
      .limit(60);
    setDrops((data as Drop[]) ?? []);
    setLoading(false);
  }

  async function createDrop() {
    if (!nTitle.trim() || !nContent.trim()) {
      toast.error("Titel & Inhalt erforderlich");
      return;
    }
    const scheduledTime = new Date(nDate);
    scheduledTime.setHours(9, 0, 0, 0);
    const { error } = await supabase.from("community_drops").insert({
      title: nTitle,
      content: nContent,
      format: nType,
      drop_type: nType,
      scheduled_for: nDate,
      scheduled_time: scheduledTime.toISOString(),
      weekday: scheduledTime.getDay(),
      published: false,
      author_type: "system",
      priority: 5,
    } as never);
    if (error) return toast.error(error.message);
    toast.success("Drop erstellt");
    setNTitle(""); setNContent("");
    load();
  }

  async function publishNow(id: string) {
    const { error } = await supabase
      .from("community_drops")
      .update({ published: true, published_at: new Date().toISOString() })
      .eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Veröffentlicht");
    load();
  }

  async function deleteDrop(id: string) {
    if (!confirm("Wirklich löschen?")) return;
    const { error } = await supabase.from("community_drops").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Gelöscht");
    load();
  }

  async function runScheduler() {
    setRunning(true);
    try {
      const { data, error } = await supabase.functions.invoke("community-drop-scheduler");
      if (error) throw error;
      toast.success(`Scheduler: ${data?.metrics?.published ?? 0} veröffentlicht`);
      load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setRunning(false);
    }
  }

  if (isLoading) {
    return <div className="flex h-screen items-center justify-center bg-background"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  }
  if (!user) return <Navigate to="/members/login" replace />;
  if (!isAdmin) return <Navigate to="/community" replace />;

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-6xl mx-auto px-6 py-10">
        <header className="mb-8 flex items-end justify-between flex-wrap gap-4">
          <div>
            <div className="text-[11px] uppercase tracking-widest text-muted-foreground" style={{ fontFamily: "DM Mono, monospace" }}>
              ADMIN · HEARTBEAT
            </div>
            <h1 className="text-3xl mt-1" style={{ fontFamily: "Cormorant Garamond, serif" }}>
              Daily Content Calendar
            </h1>
          </div>
          <Button onClick={runScheduler} disabled={running} variant="outline">
            {running ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Send className="h-4 w-4 mr-2" />}
            Scheduler jetzt ausführen
          </Button>
        </header>

        {/* Create form */}
        <section className="rounded-xl border border-border bg-card p-5 mb-8">
          <div className="flex items-center gap-2 mb-4">
            <Plus className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-medium">Neuen Drop planen</h2>
          </div>
          <div className="grid md:grid-cols-2 gap-3">
            <Input placeholder="Titel" value={nTitle} onChange={(e) => setNTitle(e.target.value)} />
            <div className="flex gap-2">
              <select className="flex-1 h-10 px-3 rounded-md border border-input bg-background text-sm" value={nType} onChange={(e) => setNType(e.target.value)}>
                {DROP_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
              <Input type="date" value={nDate} onChange={(e) => setNDate(e.target.value)} className="w-44" />
            </div>
          </div>
          <Textarea className="mt-3" rows={4} placeholder="Inhalt (Markdown)" value={nContent} onChange={(e) => setNContent(e.target.value)} />
          <Button onClick={createDrop} className="mt-3">Drop erstellen</Button>
        </section>

        {/* Calendar list */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-medium">Kalender (letzte 7 + zukünftige Tage)</h2>
          </div>
          {loading ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <div className="space-y-2">
              {drops.map((d) => (
                <div key={d.id} className="flex items-center gap-3 rounded-lg border border-border bg-card p-3">
                  <div className="text-xs text-muted-foreground w-24 shrink-0" style={{ fontFamily: "DM Mono, monospace" }}>
                    {d.scheduled_for}
                  </div>
                  <Badge variant="outline" className="text-[10px] shrink-0">{d.drop_type ?? d.format}</Badge>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{d.title}</div>
                    <div className="text-xs text-muted-foreground truncate">{d.content.slice(0, 80)}</div>
                  </div>
                  {d.published ? (
                    <Badge className="text-[10px] bg-green-500/15 text-green-700 dark:text-green-400 border-green-500/30">Live</Badge>
                  ) : (
                    <Button size="sm" variant="ghost" onClick={() => publishNow(d.id)} className="h-7 text-xs">
                      Jetzt posten
                    </Button>
                  )}
                  <Button size="icon" variant="ghost" onClick={() => deleteDrop(d.id)} className="h-7 w-7">
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
