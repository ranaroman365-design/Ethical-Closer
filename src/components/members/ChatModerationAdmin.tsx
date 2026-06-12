import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Trash2, MessageCircle, RefreshCw, Flag, CheckCircle, VolumeX, Volume2, Users, FileText, Clock, BarChart3 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';

interface DMRow {
  id: string;
  sender_id: string;
  receiver_id: string;
  content: string;
  created_at: string;
  deleted_at: string | null;
  deleted_by: string | null;
}

interface FlaggedRow {
  id: string;
  message_id: string;
  sender_id: string;
  receiver_id: string;
  content: string;
  flagged_word: string | null;
  flag_reason: string;
  status: string;
  created_at: string;
  admin_notes: string | null;
}

interface ProfileInfo {
  name: string;
  email: string;
  muted: boolean;
  stage: string;
  avatar_url: string | null;
}

interface UserStats {
  id: string;
  name: string;
  email: string;
  stage: string;
  muted: boolean;
  avatar_url: string | null;
  sent: number;
  received: number;
  flagged: number;
  active_chats: number;
  last_activity: string | null;
  pattern: string;
}

interface ThreadInfo {
  id: string;
  user_a: string;
  user_b: string;
  opened_by: string;
  opened_at: string;
  has_messages: boolean;
}

interface CommunityStats {
  community_type: string;
  total_posts: number;
  gif_only_posts: number;
  auto_wins: number;
  short_posts: number;
  top_posters: { id: string; count: number }[];
}

interface CommunityUserStats {
  id: string;
  name: string;
  stage: string;
  total_posts: number;
  replies: number;
  short_posts: number;
  gif_only: number;
  flagged: number;
}

export default function ChatModerationAdmin() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [messages, setMessages] = useState<DMRow[]>([]);
  const [flagged, setFlagged] = useState<FlaggedRow[]>([]);
  const [profiles, setProfiles] = useState<Record<string, ProfileInfo>>({});
  const [userStats, setUserStats] = useState<UserStats[]>([]);
  const [threadInfos, setThreadInfos] = useState<ThreadInfo[]>([]);
  const [communityStats, setCommunityStats] = useState<CommunityStats[]>([]);
  const [communityUserStats, setCommunityUserStats] = useState<CommunityUserStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingNote, setEditingNote] = useState<string | null>(null);
  const [noteText, setNoteText] = useState('');

  const load = async () => {
    setLoading(true);

    const [msgsRes, flaggedRes, threadsRes, profilesRes, communityRes] = await Promise.all([
      supabase.from('direct_messages')
        .select('id, sender_id, receiver_id, content, created_at, deleted_at, deleted_by')
        .order('created_at', { ascending: false }).limit(100),
      supabase.from('flagged_messages' as any).select('*').order('created_at', { ascending: false }).limit(50),
      supabase.from('chat_threads').select('*').order('opened_at', { ascending: false }).limit(50),
      supabase.from('profiles').select('id, full_name, email, business_stage, is_chat_muted, avatar_url'),
      supabase.from('community_messages').select('id, user_id, community_type, message_type, content, attachment_type, reply_to, created_at').order('created_at', { ascending: false }).limit(300),
    ]);

    const msgs = (msgsRes.data as DMRow[]) ?? [];
    const flags = (flaggedRes.data as any as FlaggedRow[]) ?? [];
    const threads = (threadsRes.data as any[]) ?? [];
    const profs = (profilesRes.data as any[]) ?? [];
    const communityMsgs = (communityRes.data as any[]) ?? [];

    setMessages(msgs);
    setFlagged(flags);

    // Build profile map
    const profMap: Record<string, ProfileInfo> = {};
    profs.forEach((p) => {
      profMap[p.id] = {
        name: p.full_name || p.email || p.id.slice(0, 8),
        email: p.email || '',
        muted: p.is_chat_muted ?? false,
        stage: p.business_stage || 'opener',
        avatar_url: p.avatar_url,
      };
    });
    setProfiles(profMap);

    // Build DM user stats
    const statsMap = new Map<string, { sent: number; received: number; flagged: number; chats: Set<string>; lastAct: string | null }>();
    const ensureUser = (id: string) => {
      if (!statsMap.has(id)) statsMap.set(id, { sent: 0, received: 0, flagged: 0, chats: new Set(), lastAct: null });
    };

    msgs.forEach((m) => {
      ensureUser(m.sender_id);
      ensureUser(m.receiver_id);
      const s = statsMap.get(m.sender_id)!;
      s.sent++;
      s.chats.add(m.receiver_id);
      if (!s.lastAct || m.created_at > s.lastAct) s.lastAct = m.created_at;
      const r = statsMap.get(m.receiver_id)!;
      r.received++;
      r.chats.add(m.sender_id);
      if (!r.lastAct || m.created_at > r.lastAct) r.lastAct = m.created_at;
    });

    flags.forEach((f) => {
      ensureUser(f.sender_id);
      statsMap.get(f.sender_id)!.flagged++;
    });

    const userStatsArr: UserStats[] = Array.from(statsMap.entries()).map(([id, s]) => {
      const prof = profMap[id];
      let pattern = 'unauffällig';
      if (s.flagged >= 3) pattern = 'häufig geflaggt';
      else if (s.sent > 50) pattern = 'sehr aktiv';
      else if (s.sent > 20 && s.sent / Math.max(1, s.received) > 3) pattern = 'viele Kurz-Nachrichten';

      return {
        id,
        name: prof?.name || id.slice(0, 8),
        email: prof?.email || '',
        stage: prof?.stage || 'opener',
        muted: prof?.muted ?? false,
        avatar_url: prof?.avatar_url || null,
        sent: s.sent,
        received: s.received,
        flagged: s.flagged,
        active_chats: s.chats.size,
        last_activity: s.lastAct,
        pattern,
      };
    }).sort((a, b) => (b.last_activity || '').localeCompare(a.last_activity || ''));

    setUserStats(userStatsArr);

    // Build thread info
    const threadMsgCheck = new Set<string>();
    msgs.forEach(m => {
      threadMsgCheck.add(`${m.sender_id}_${m.receiver_id}`);
      threadMsgCheck.add(`${m.receiver_id}_${m.sender_id}`);
    });

    setThreadInfos(threads.map((t: any) => ({
      id: t.id,
      user_a: t.user_a,
      user_b: t.user_b,
      opened_by: t.opened_by,
      opened_at: t.opened_at,
      has_messages: threadMsgCheck.has(`${t.user_a}_${t.user_b}`) || threadMsgCheck.has(`${t.user_b}_${t.user_a}`),
    })));

    // Build community stats
    const typeMap = new Map<string, { total: number; gifOnly: number; autoWins: number; shortPosts: number; posters: Map<string, number> }>();
    communityMsgs.forEach((m: any) => {
      const ct = m.community_type || 'trainee';
      if (!typeMap.has(ct)) typeMap.set(ct, { total: 0, gifOnly: 0, autoWins: 0, shortPosts: 0, posters: new Map() });
      const s = typeMap.get(ct)!;
      s.total++;
      if (m.message_type === 'gif' || m.attachment_type === 'gif') s.gifOnly++;
      if (m.message_type === 'win' || m.message_type === 'milestone' || m.message_type === 'level_up') s.autoWins++;
      if (m.message_type === 'chat' && m.content && m.content.length < 15) s.shortPosts++;
      s.posters.set(m.user_id, (s.posters.get(m.user_id) || 0) + 1);
    });

    const cStats: CommunityStats[] = Array.from(typeMap.entries()).map(([ct, s]) => ({
      community_type: ct,
      total_posts: s.total,
      gif_only_posts: s.gifOnly,
      auto_wins: s.autoWins,
      short_posts: s.shortPosts,
      top_posters: Array.from(s.posters.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([id, count]) => ({ id, count })),
    }));
    setCommunityStats(cStats);

    // Build community per-user stats
    const cuMap = new Map<string, { total: number; replies: number; short: number; gifOnly: number; flagged: number }>();
    communityMsgs.forEach((m: any) => {
      if (!cuMap.has(m.user_id)) cuMap.set(m.user_id, { total: 0, replies: 0, short: 0, gifOnly: 0, flagged: 0 });
      const s = cuMap.get(m.user_id)!;
      s.total++;
      if (m.reply_to) s.replies++;
      if (m.message_type === 'chat' && m.content && m.content.length < 15) s.short++;
      if (m.message_type === 'gif' || m.attachment_type === 'gif') s.gifOnly++;
    });

    // Add flagged community messages
    flags.forEach(f => {
      if (cuMap.has(f.sender_id)) {
        cuMap.get(f.sender_id)!.flagged++;
      }
    });

    const cuStats: CommunityUserStats[] = Array.from(cuMap.entries()).map(([id, s]) => ({
      id,
      name: profMap[id]?.name || id.slice(0, 8),
      stage: profMap[id]?.stage || 'opener',
      total_posts: s.total,
      replies: s.replies,
      short_posts: s.short,
      gif_only: s.gifOnly,
      flagged: s.flagged,
    })).sort((a, b) => b.total_posts - a.total_posts);

    setCommunityUserStats(cuStats);

    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleDelete = async (msgId: string) => {
    const { error } = await supabase
      .from('direct_messages')
      .update({ deleted_at: new Date().toISOString(), deleted_by: user?.id } as any)
      .eq('id', msgId);
    if (!error) {
      setMessages(prev => prev.map(m => m.id === msgId ? { ...m, deleted_at: new Date().toISOString() } : m));
      toast({ title: 'Nachricht gelöscht' });
    }
  };

  const handleToggleMute = async (userId: string) => {
    const current = profiles[userId]?.muted ?? false;
    const { error } = await supabase
      .from('profiles')
      .update({
        is_chat_muted: !current,
        chat_muted_until: !current ? new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() : null,
      } as any)
      .eq('id', userId);
    if (!error) {
      setProfiles(prev => ({ ...prev, [userId]: { ...prev[userId], muted: !current } }));
      setUserStats(prev => prev.map(u => u.id === userId ? { ...u, muted: !current } : u));
      toast({ title: !current ? 'User gemutet (24h)' : 'Mute aufgehoben' });
    }
  };

  const handleFlagAction = async (flagId: string, action: string) => {
    const { error } = await supabase
      .from('flagged_messages' as any)
      .update({ status: action, reviewed_by: user?.id, reviewed_at: new Date().toISOString() } as any)
      .eq('id', flagId);
    if (!error) {
      setFlagged(prev => prev.map(f => f.id === flagId ? { ...f, status: action } : f));
      toast({ title: action === 'approved' ? 'Freigegeben' : action === 'reviewed' ? 'Geprüft' : 'Gelöscht' });
    }
  };

  const handleSaveNote = async (flagId: string) => {
    const { error } = await supabase
      .from('flagged_messages' as any)
      .update({ admin_notes: noteText } as any)
      .eq('id', flagId);
    if (!error) {
      setFlagged(prev => prev.map(f => f.id === flagId ? { ...f, admin_notes: noteText } : f));
      setEditingNote(null);
      setNoteText('');
      toast({ title: 'Notiz gespeichert' });
    }
  };

  const getName = (id: string) => profiles[id]?.name || id.slice(0, 8);

  const PATTERN_COLORS: Record<string, string> = {
    'unauffällig': 'text-muted-foreground',
    'sehr aktiv': 'text-blue-600',
    'häufig geflaggt': 'text-destructive',
    'viele Kurz-Nachrichten': 'text-amber-600',
  };

  const COMMUNITY_LABELS: Record<string, string> = {
    trainee: 'Trainee Community',
    closer: 'Closer Community',
    manager: 'Leadership Community',
  };

  if (loading) return <div className="py-8 text-center text-sm text-muted-foreground">Laden…</div>;

  const openFlagged = flagged.filter(f => f.status === 'open');

  return (
    <Tabs defaultValue="overview" className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <TabsList>
          <TabsTrigger value="overview" className="text-xs"><Users className="mr-1 h-3 w-3" />Übersicht</TabsTrigger>
          <TabsTrigger value="flagged" className="text-xs"><Flag className="mr-1 h-3 w-3" />Flagged ({openFlagged.length})</TabsTrigger>
          <TabsTrigger value="messages" className="text-xs"><MessageCircle className="mr-1 h-3 w-3" />Nachrichten</TabsTrigger>
          <TabsTrigger value="threads" className="text-xs"><FileText className="mr-1 h-3 w-3" />Threads</TabsTrigger>
          <TabsTrigger value="community" className="text-xs"><BarChart3 className="mr-1 h-3 w-3" />Community</TabsTrigger>
        </TabsList>
        <Button variant="outline" size="sm" className="text-xs" onClick={load}><RefreshCw className="mr-1 h-3 w-3" />Aktualisieren</Button>
      </div>

      {/* USER OVERVIEW TAB */}
      <TabsContent value="overview">
        <div className="space-y-2">
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">User-Kommunikationsübersicht (DM)</h4>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border text-muted-foreground">
                  <th className="text-left py-2 px-2 font-medium">User</th>
                  <th className="text-center py-2 px-2 font-medium">Gesendet</th>
                  <th className="text-center py-2 px-2 font-medium">Empfangen</th>
                  <th className="text-center py-2 px-2 font-medium">Flagged</th>
                  <th className="text-center py-2 px-2 font-medium">Chats</th>
                  <th className="text-center py-2 px-2 font-medium">Letzte Aktivität</th>
                  <th className="text-center py-2 px-2 font-medium">Muster</th>
                  <th className="text-center py-2 px-2 font-medium">Status</th>
                  <th className="text-right py-2 px-2 font-medium">Aktion</th>
                </tr>
              </thead>
              <tbody>
                {userStats.map((u) => (
                  <tr key={u.id} className="border-b border-border/30 hover:bg-muted/30 transition-colors">
                    <td className="py-2 px-2">
                      <div className="flex items-center gap-2">
                        {u.avatar_url ? (
                          <img src={u.avatar_url} className="h-6 w-6 rounded-full object-cover" alt="" />
                        ) : (
                          <div className="h-6 w-6 rounded-full bg-primary/20 flex items-center justify-center text-[10px] font-semibold text-primary">
                            {u.name.charAt(0).toUpperCase()}
                          </div>
                        )}
                        <div>
                          <p className="font-medium text-foreground">{u.name}</p>
                          <p className="text-[10px] text-muted-foreground">{u.stage}</p>
                        </div>
                      </div>
                    </td>
                    <td className="text-center py-2 px-2 text-foreground">{u.sent}</td>
                    <td className="text-center py-2 px-2 text-foreground">{u.received}</td>
                    <td className="text-center py-2 px-2">
                      <span className={u.flagged > 0 ? 'text-destructive font-medium' : 'text-muted-foreground'}>{u.flagged}</span>
                    </td>
                    <td className="text-center py-2 px-2 text-foreground">{u.active_chats}</td>
                    <td className="text-center py-2 px-2 text-muted-foreground">
                      {u.last_activity ? new Date(u.last_activity).toLocaleDateString('de-DE') : '–'}
                    </td>
                    <td className="text-center py-2 px-2">
                      <span className={`text-[10px] font-medium ${PATTERN_COLORS[u.pattern] || 'text-muted-foreground'}`}>{u.pattern}</span>
                    </td>
                    <td className="text-center py-2 px-2">
                      {u.muted && (
                        <Badge variant="outline" className="text-[9px] border-destructive/30 text-destructive">
                          <VolumeX className="h-2.5 w-2.5 mr-0.5" />Gemutet
                        </Badge>
                      )}
                    </td>
                    <td className="text-right py-2 px-2">
                      <Button variant="ghost" size="sm" className="h-6 text-[10px]" onClick={() => handleToggleMute(u.id)}>
                        {u.muted ? <Volume2 className="h-3 w-3" /> : <VolumeX className="h-3 w-3" />}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </TabsContent>

      {/* FLAGGED TAB */}
      <TabsContent value="flagged">
        <div className="space-y-2">
          {flagged.length === 0 && <p className="text-center text-sm text-muted-foreground py-8">Keine geflaggten Nachrichten.</p>}
          {flagged.map(flag => (
            <div key={flag.id} className={`rounded-xl border p-4 ${flag.status === 'open' ? 'border-destructive/30 bg-destructive/5' : 'border-border/40 bg-card opacity-70'}`}>
              <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                <Flag className="h-3.5 w-3.5 text-destructive shrink-0" />
                <span className="text-[11px] font-medium text-foreground">{getName(flag.sender_id)}</span>
                <span className="text-[10px] text-muted-foreground">→</span>
                <span className="text-[11px] font-medium text-foreground">{getName(flag.receiver_id)}</span>
                <span className="text-[10px] text-muted-foreground ml-auto">{new Date(flag.created_at).toLocaleString('de-DE')}</span>
                <Badge variant="outline" className={`text-[9px] ${
                  flag.status === 'open' ? 'text-destructive border-destructive/30'
                  : flag.status === 'approved' ? 'text-emerald-600 border-emerald-500/30'
                  : flag.status === 'reviewed' ? 'text-blue-600 border-blue-500/30'
                  : 'text-muted-foreground'
                }`}>
                  {flag.status === 'open' ? 'Offen' : flag.status === 'approved' ? 'Freigegeben' : flag.status === 'reviewed' ? 'Geprüft' : 'Gelöscht'}
                </Badge>
              </div>
              <p className="text-[13px] text-foreground leading-relaxed mb-1">{flag.content}</p>
              {flag.flagged_word && (
                <p className="text-[10px] text-destructive mb-1">Erkanntes Wort: <span className="font-medium">{flag.flagged_word}</span></p>
              )}
              {flag.admin_notes && editingNote !== flag.id && (
                <div className="flex items-start gap-1.5 mt-1 mb-1 p-2 rounded bg-muted/50 border border-border/30">
                  <FileText className="h-3 w-3 text-muted-foreground shrink-0 mt-0.5" />
                  <p className="text-[10px] text-muted-foreground">{flag.admin_notes}</p>
                </div>
              )}
              {editingNote === flag.id && (
                <div className="mt-1 mb-1 flex gap-1.5">
                  <input
                    type="text"
                    value={noteText}
                    onChange={(e) => setNoteText(e.target.value)}
                    placeholder="Interne Notiz (nur für Admin)…"
                    className="flex-1 rounded-md border border-border bg-background px-2 py-1 text-[11px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                  <Button variant="outline" size="sm" className="h-6 text-[10px]" onClick={() => handleSaveNote(flag.id)}>Speichern</Button>
                  <Button variant="ghost" size="sm" className="h-6 text-[10px]" onClick={() => { setEditingNote(null); setNoteText(''); }}>Abbruch</Button>
                </div>
              )}
              <div className="mt-2 flex gap-2 justify-end flex-wrap">
                {flag.status === 'open' && (
                  <>
                    <Button variant="ghost" size="sm" className="text-[10px] h-6 text-blue-600 hover:text-blue-700" onClick={() => handleFlagAction(flag.id, 'reviewed')}>
                      <CheckCircle className="mr-1 h-3 w-3" />Geprüft
                    </Button>
                    <Button variant="ghost" size="sm" className="text-[10px] h-6 text-emerald-600 hover:text-emerald-700" onClick={() => handleFlagAction(flag.id, 'approved')}>
                      <CheckCircle className="mr-1 h-3 w-3" />Freigeben
                    </Button>
                    <Button variant="ghost" size="sm" className="text-[10px] h-6 text-destructive hover:text-destructive" onClick={() => handleFlagAction(flag.id, 'deleted')}>
                      <Trash2 className="mr-1 h-3 w-3" />Löschen
                    </Button>
                  </>
                )}
                <Button variant="ghost" size="sm" className="text-[10px] h-6" onClick={() => { setEditingNote(flag.id); setNoteText(flag.admin_notes || ''); }}>
                  <FileText className="mr-1 h-3 w-3" />Notiz
                </Button>
                <Button variant="ghost" size="sm" className="text-[10px] h-6 text-amber-600 hover:text-amber-700" onClick={() => handleToggleMute(flag.sender_id)}>
                  <VolumeX className="mr-1 h-3 w-3" />{profiles[flag.sender_id]?.muted ? 'Unmute' : 'Muten'}
                </Button>
              </div>
            </div>
          ))}
        </div>
      </TabsContent>

      {/* MESSAGES TAB */}
      <TabsContent value="messages">
        <div className="space-y-2">
          {messages.length === 0 && <p className="text-center text-sm text-muted-foreground py-8">Keine Nachrichten.</p>}
          {messages.slice(0, 50).map(msg => (
            <div key={msg.id} className={`rounded-xl border bg-card p-4 ${msg.deleted_at ? 'border-destructive/20 opacity-60' : 'border-border/40'}`}>
              <div className="flex items-center gap-2 mb-1.5">
                <MessageCircle className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-[11px] font-medium text-foreground">{getName(msg.sender_id)}</span>
                {profiles[msg.sender_id]?.muted && <Badge variant="outline" className="text-[9px] border-destructive/30 text-destructive"><VolumeX className="h-2.5 w-2.5 mr-0.5" />Gemutet</Badge>}
                <span className="text-[10px] text-muted-foreground">→</span>
                <span className="text-[11px] font-medium text-foreground">{getName(msg.receiver_id)}</span>
                <span className="text-[10px] text-muted-foreground ml-auto">{new Date(msg.created_at).toLocaleString('de-DE')}</span>
                {msg.deleted_at && <Badge variant="outline" className="text-[9px] text-destructive border-destructive/30">Gelöscht</Badge>}
              </div>
              <p className="text-[13px] text-foreground leading-relaxed">{msg.content}</p>
              <div className="mt-2 flex gap-2 justify-end">
                {!msg.deleted_at && (
                  <Button variant="ghost" size="sm" className="text-[10px] h-6 text-destructive hover:text-destructive" onClick={() => handleDelete(msg.id)}>
                    <Trash2 className="mr-1 h-3 w-3" />Löschen
                  </Button>
                )}
                <Button variant="ghost" size="sm" className="text-[10px] h-6" onClick={() => handleToggleMute(msg.sender_id)}>
                  {profiles[msg.sender_id]?.muted ? <><Volume2 className="mr-1 h-3 w-3" />Unmute</> : <><VolumeX className="mr-1 h-3 w-3" />Muten</>}
                </Button>
              </div>
            </div>
          ))}
        </div>
      </TabsContent>

      {/* THREADS TAB */}
      <TabsContent value="threads">
        <div className="space-y-2">
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Thread-Nachvollziehbarkeit</h4>
          {threadInfos.length === 0 && <p className="text-center text-sm text-muted-foreground py-8">Keine Threads.</p>}
          {threadInfos.map(t => (
            <div key={t.id} className="rounded-xl border border-border/40 bg-card p-3 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 text-[11px]">
                  <span className="font-medium text-foreground">{getName(t.user_a)}</span>
                  <span className="text-muted-foreground">↔</span>
                  <span className="font-medium text-foreground">{getName(t.user_b)}</span>
                </div>
                <div className="flex items-center gap-2 mt-0.5 text-[10px] text-muted-foreground">
                  <Clock className="h-3 w-3" />
                  <span>Eröffnet von <span className="font-medium text-foreground">{getName(t.opened_by)}</span></span>
                  <span>·</span>
                  <span>{new Date(t.opened_at).toLocaleDateString('de-DE')}</span>
                </div>
              </div>
              <Badge variant="outline" className={`text-[9px] ${t.has_messages ? 'text-emerald-600 border-emerald-500/30' : 'text-muted-foreground'}`}>
                {t.has_messages ? 'Aktiv' : 'Keine Nachrichten'}
              </Badge>
            </div>
          ))}
        </div>
      </TabsContent>

      {/* COMMUNITY TAB */}
      <TabsContent value="community">
        <div className="space-y-6">
          {/* Per-community overview */}
          <div>
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Community-Übersicht</h4>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {communityStats.map(cs => (
                <div key={cs.community_type} className="rounded-xl border border-border/40 bg-card p-4">
                  <h5 className="text-[13px] font-semibold text-foreground mb-3">{COMMUNITY_LABELS[cs.community_type] || cs.community_type}</h5>
                  <div className="space-y-1.5 text-[11px]">
                    <div className="flex justify-between"><span className="text-muted-foreground">Beiträge gesamt</span><span className="font-medium text-foreground">{cs.total_posts}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">GIF-only</span><span className="font-medium text-foreground">{cs.gif_only_posts}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Auto-Wins</span><span className="font-medium text-foreground">{cs.auto_wins}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Kurz-Posts (&lt;15 Zeichen)</span><span className="font-medium text-foreground">{cs.short_posts}</span></div>
                  </div>
                  {cs.top_posters.length > 0 && (
                    <div className="mt-3 pt-2 border-t border-border/30">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">Top Poster</p>
                      {cs.top_posters.map(tp => (
                        <div key={tp.id} className="flex justify-between text-[10px]">
                          <span className="text-foreground">{getName(tp.id)}</span>
                          <span className="text-muted-foreground">{tp.count} Posts</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Per-user community stats */}
          <div>
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Community-User-Aktivität</h4>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border text-muted-foreground">
                    <th className="text-left py-2 px-2 font-medium">User</th>
                    <th className="text-center py-2 px-2 font-medium">Posts</th>
                    <th className="text-center py-2 px-2 font-medium">Antworten</th>
                    <th className="text-center py-2 px-2 font-medium">Kurz</th>
                    <th className="text-center py-2 px-2 font-medium">GIF-only</th>
                    <th className="text-center py-2 px-2 font-medium">Flagged</th>
                  </tr>
                </thead>
                <tbody>
                  {communityUserStats.slice(0, 30).map(cu => (
                    <tr key={cu.id} className="border-b border-border/30 hover:bg-muted/30 transition-colors">
                      <td className="py-2 px-2">
                        <p className="font-medium text-foreground">{cu.name}</p>
                        <p className="text-[10px] text-muted-foreground">{cu.stage}</p>
                      </td>
                      <td className="text-center py-2 px-2 text-foreground">{cu.total_posts}</td>
                      <td className="text-center py-2 px-2 text-foreground">{cu.replies}</td>
                      <td className="text-center py-2 px-2">
                        <span className={cu.short_posts > 5 ? 'text-amber-600 font-medium' : 'text-muted-foreground'}>{cu.short_posts}</span>
                      </td>
                      <td className="text-center py-2 px-2 text-foreground">{cu.gif_only}</td>
                      <td className="text-center py-2 px-2">
                        <span className={cu.flagged > 0 ? 'text-destructive font-medium' : 'text-muted-foreground'}>{cu.flagged}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </TabsContent>
    </Tabs>
  );
}
