import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Sparkles, Users, GraduationCap, Clock, CheckCircle2, RefreshCw, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/i18n/LanguageContext";

type Track = "ai" | "peer" | "mentor";
type Status = "open" | "assigned" | "answered" | "expired";

interface FeedbackRequest {
  id: string;
  practice_call_id: string | null;
  requester_id: string;
  assignee_id: string | null;
  track: Track;
  status: Status;
  level_at_request: number | null;
  expires_at: string;
  created_at: string;
}

interface FeedbackResponse {
  id: string;
  request_id: string;
  responder_id: string | null;
  track: Track;
  strengths: string | null;
  improvements: string | null;
  next_action: string | null;
  scorecard: any;
  created_at: string;
}

const TRACK_META: Record<Track, { icon: any; label: string; color: string }> = {
  ai: { icon: Sparkles, label: "AI Coach", color: "text-violet-500" },
  peer: { icon: Users, label: "Peer", color: "text-amber-500" },
  mentor: { icon: GraduationCap, label: "Mentor", color: "text-primary" },
};

export default function FeedbackHub() {
  const { user } = useAuth();
  const { lang } = useLanguage();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [myRequests, setMyRequests] = useState<FeedbackRequest[]>([]);
  const [assignedToMe, setAssignedToMe] = useState<FeedbackRequest[]>([]);
  const [responses, setResponses] = useState<Record<string, FeedbackResponse[]>>({});
  const [requesting, setRequesting] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, { strengths: string; improvements: string; next_action: string }>>({});

  const T = (de: string, en: string) => (lang === "en" ? en : de);

  const load = async () => {
    if (!user) return;
    setLoading(true);
    const [mine, assigned] = await Promise.all([
      supabase.from("feedback_requests").select("*").eq("requester_id", user.id).order("created_at", { ascending: false }).limit(50),
      supabase.from("feedback_requests").select("*").eq("assignee_id", user.id).neq("status", "answered").order("created_at", { ascending: false }).limit(50),
    ]);
    const reqs = [...(mine.data ?? []), ...(assigned.data ?? [])] as FeedbackRequest[];
    const ids = reqs.map(r => r.id);
    if (ids.length) {
      const { data: resps } = await supabase.from("feedback_responses").select("*").in("request_id", ids);
      const byReq: Record<string, FeedbackResponse[]> = {};
      for (const r of (resps as FeedbackResponse[] | null) ?? []) {
        (byReq[r.request_id] ||= []).push(r);
      }
      setResponses(byReq);
    } else {
      setResponses({});
    }
    setMyRequests((mine.data ?? []) as FeedbackRequest[]);
    setAssignedToMe((assigned.data ?? []) as FeedbackRequest[]);
    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [user?.id]);

  const requestFeedback = async () => {
    if (!user) return;
    setRequesting(true);
    try {
      // Find latest practice call (optional)
      const { data: latest } = await supabase
        .from("practice_calls")
        .select("id")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      const { data: routed, error } = await supabase.rpc("route_feedback_request", {
        p_practice_call_id: latest?.id ?? null,
        p_context: { source: "feedback_hub" },
      });
      if (error) throw error;

      const aiId = (routed as any)?.ai_request_id;
      if (aiId) {
        // Trigger AI generation immediately
        await supabase.functions.invoke("ai-feedback", { body: { request_id: aiId } });
      }

      const peerCount = (routed as any)?.peer_count ?? 0;
      const mentorOk = (routed as any)?.mentor_assigned;
      toast({
        title: T("Feedback angefragt", "Feedback requested"),
        description: T(
          `AI-Feedback erstellt · ${peerCount} Peer(s) · Mentor: ${mentorOk ? "ja" : "nicht verfügbar"}`,
          `AI feedback created · ${peerCount} peer(s) · Mentor: ${mentorOk ? "yes" : "unavailable"}`,
        ),
      });
      await load();
    } catch (e: any) {
      toast({ title: "Error", description: e.message ?? String(e), variant: "destructive" });
    } finally {
      setRequesting(false);
    }
  };

  const submitPeerResponse = async (req: FeedbackRequest) => {
    if (!user) return;
    const d = drafts[req.id];
    if (!d?.strengths || !d?.improvements || !d?.next_action) {
      toast({ title: T("Bitte alle 3 Felder ausfüllen", "Please fill all 3 fields"), variant: "destructive" });
      return;
    }
    const elapsed = Math.round((Date.now() - new Date(req.created_at).getTime()) / 1000);
    const { error } = await supabase.from("feedback_responses").insert({
      request_id: req.id,
      responder_id: user.id,
      track: req.track,
      strengths: d.strengths,
      improvements: d.improvements,
      next_action: d.next_action,
      response_time_seconds: elapsed,
    });
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    await supabase.from("feedback_requests").update({ status: "answered" }).eq("id", req.id);
    toast({ title: T("Feedback gesendet", "Feedback sent") });
    setDrafts(prev => { const n = { ...prev }; delete n[req.id]; return n; });
    await load();
  };

  return (
    <div className="mx-auto max-w-5xl space-y-8 p-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl text-foreground">{T("Feedback Engine", "Feedback Engine")}</h1>
          <p className="mt-2 text-sm text-muted-foreground max-w-2xl">
            {T(
              "Drei Spuren statt einer Pyramide: AI Coach (immer verfügbar), Peer Reviews (gleiches Level) und Mentor (wenn verfügbar). Mindestens AI-Feedback in unter 60 Sekunden — garantiert.",
              "Three tracks instead of one pyramid: AI Coach (always on), Peer reviews (same level), and Mentor (if available). AI feedback in under 60 seconds — guaranteed.",
            )}
          </p>
        </div>
        <Button onClick={requestFeedback} disabled={requesting} className="gap-2">
          <Send className="h-4 w-4" />
          {requesting ? T("Wird angefragt …", "Requesting …") : T("Feedback anfragen", "Request feedback")}
        </Button>
      </header>

      {/* Track legend */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {(Object.keys(TRACK_META) as Track[]).map(t => {
          const M = TRACK_META[t];
          const Icon = M.icon;
          return (
            <div key={t} className="rounded-xl border border-border/40 bg-card p-4">
              <div className={`flex items-center gap-2 ${M.color}`}>
                <Icon className="h-4 w-4" />
                <span className="text-xs font-semibold uppercase tracking-widest">{M.label}</span>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                {t === "ai" && T("Sofortiges Feedback in <60s. Strukturiert, ehrlich, premium.", "Instant feedback in <60s. Structured, honest, premium.")}
                {t === "peer" && T("Bis zu 2 Peers auf deinem Level liefern Reviews innerhalb 24h.", "Up to 2 peers at your level deliver reviews within 24h.")}
                {t === "mentor" && T("Mentor (Level+1) liefert tieferes Feedback wenn Kapazität frei ist.", "Mentor (level+1) delivers deeper feedback when capacity is open.")}
              </p>
            </div>
          );
        })}
      </div>

      {/* My requests */}
      <section className="space-y-3">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          {T("Meine Anfragen", "My requests")}
        </h2>
        {loading ? (
          <div className="text-sm text-muted-foreground">…</div>
        ) : myRequests.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border/50 p-8 text-center text-sm text-muted-foreground">
            {T('Noch keine Anfragen. Klicke oben auf „Feedback anfragen".', 'No requests yet. Click "Request feedback" above.')}
          </div>
        ) : (
          <div className="space-y-3">
            {myRequests.map(r => {
              const M = TRACK_META[r.track];
              const Icon = M.icon;
              const resps = responses[r.id] ?? [];
              return (
                <div key={r.id} className="rounded-xl border border-border/40 bg-card p-4">
                  <div className="flex items-center justify-between">
                    <div className={`flex items-center gap-2 ${M.color}`}>
                      <Icon className="h-4 w-4" />
                      <span className="text-xs font-semibold">{M.label}</span>
                      <span className="text-[10px] text-muted-foreground">
                        · {new Date(r.created_at).toLocaleString()}
                      </span>
                    </div>
                    <span className={`text-[10px] px-2 py-0.5 rounded ${r.status === "answered" ? "bg-emerald-500/10 text-emerald-600" : "bg-muted text-muted-foreground"}`}>
                      {r.status === "answered" ? <CheckCircle2 className="inline h-3 w-3 mr-1" /> : <Clock className="inline h-3 w-3 mr-1" />}
                      {r.status}
                    </span>
                  </div>
                  {resps.map(resp => (
                    <div key={resp.id} className="mt-3 space-y-2 rounded-lg bg-background/60 p-3 text-sm">
                      {resp.strengths && <div><b className="text-emerald-600">{T("Stärken", "Strengths")}:</b> <span className="whitespace-pre-line">{resp.strengths}</span></div>}
                      {resp.improvements && <div><b className="text-amber-600">{T("Verbesserungen", "Improvements")}:</b> <span className="whitespace-pre-line">{resp.improvements}</span></div>}
                      {resp.next_action && <div><b className="text-primary">{T("Next Action", "Next action")}:</b> {resp.next_action}</div>}
                      {resp.scorecard?.score != null && (
                        <div className="text-xs text-muted-foreground">Score: {resp.scorecard.score}/100</div>
                      )}
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Assigned to me */}
      <section className="space-y-3">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
          {T("An mich zugewiesen (gib zurück)", "Assigned to me (give back)")}
          <Button variant="ghost" size="sm" onClick={load} className="h-6 px-2"><RefreshCw className="h-3 w-3" /></Button>
        </h2>
        {assignedToMe.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border/50 p-6 text-center text-xs text-muted-foreground">
            {T("Aktuell keine offenen Reviews für dich.", "No open reviews for you right now.")}
          </div>
        ) : (
          <div className="space-y-3">
            {assignedToMe.map(r => {
              const d = drafts[r.id] ?? { strengths: "", improvements: "", next_action: "" };
              return (
                <div key={r.id} className="rounded-xl border border-border/40 bg-card p-4 space-y-2">
                  <div className="text-xs text-muted-foreground">
                    {TRACK_META[r.track].label} · Level {r.level_at_request ?? 0} · {new Date(r.created_at).toLocaleString()}
                  </div>
                  <Textarea placeholder={T("3 Stärken (je 1 Satz)", "3 strengths (one sentence each)")} value={d.strengths} onChange={e => setDrafts(p => ({ ...p, [r.id]: { ...d, strengths: e.target.value } }))} />
                  <Textarea placeholder={T("3 Verbesserungen mit Wie", "3 improvements with How")} value={d.improvements} onChange={e => setDrafts(p => ({ ...p, [r.id]: { ...d, improvements: e.target.value } }))} />
                  <Textarea placeholder={T("Genau 1 Next Action", "Exactly 1 next action")} value={d.next_action} onChange={e => setDrafts(p => ({ ...p, [r.id]: { ...d, next_action: e.target.value } }))} />
                  <Button size="sm" onClick={() => submitPeerResponse(r)} className="gap-2">
                    <Send className="h-3 w-3" /> {T("Senden", "Send")}
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
