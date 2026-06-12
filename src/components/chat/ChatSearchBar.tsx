import { useState } from 'react';
import { Search, X, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useLanguage } from '@/i18n/LanguageContext';
import { formatDistanceToNow } from 'date-fns';
import { de as deLocale } from 'date-fns/locale';

interface SearchResult {
  id: string;
  content: string;
  created_at: string;
  sender_name?: string;
  sender_id?: string;
  receiver_id?: string;
  user_id?: string;
  community_type?: string;
  post_category?: string;
}

interface Props {
  mode: 'dm' | 'community';
  communityType?: string;
  onResultClick?: (result: SearchResult) => void;
}

export default function ChatSearchBar({ mode, communityType, onResultClick }: Props) {
  const { user } = useAuth();
  const { lang } = useLanguage();
  const [expanded, setExpanded] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const t = (de: string, en: string) => lang === 'de' ? de : en;

  const search = async (q: string) => {
    if (!q.trim() || !user) {
      setResults([]);
      return;
    }
    setLoading(true);
    try {
      if (mode === 'dm') {
        const { data } = await supabase
          .from('direct_messages')
          .select('id, content, created_at, sender_id, receiver_id')
          .or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`)
          .ilike('content', `%${q}%`)
          .is('deleted_at', null)
          .order('created_at', { ascending: false })
          .limit(20);

        if (data) {
          // Enrich with sender names
          const userIds = [...new Set(data.map((m: any) => m.sender_id))];
          const { data: profiles } = await supabase
            .from('profiles')
            .select('id, full_name')
            .in('id', userIds);
          const nameMap = new Map((profiles ?? []).map((p: any) => [p.id, p.full_name]));

          setResults(data.map((m: any) => ({
            ...m,
            sender_name: nameMap.get(m.sender_id) || t('Unbekannt', 'Unknown'),
          })));
        }
      } else {
        const { data } = await supabase
          .from('community_messages')
          .select('id, content, created_at, user_id, community_type, post_category')
          .eq('community_type', communityType || 'trainee')
          .ilike('content', `%${q}%`)
          .order('created_at', { ascending: false })
          .limit(20);

        if (data) {
          const userIds = [...new Set(data.map((m: any) => m.user_id))];
          const { data: profiles } = await supabase
            .from('profiles')
            .select('id, full_name')
            .in('id', userIds);
          const nameMap = new Map((profiles ?? []).map((p: any) => [p.id, p.full_name]));

          setResults(data.map((m: any) => ({
            ...m,
            sender_name: nameMap.get(m.user_id) || t('Anonym', 'Anonymous'),
          })));
        }
      }
    } finally {
      setLoading(false);
    }
  };

  const handleInput = (val: string) => {
    setQuery(val);
    if (val.length >= 2) {
      const timeout = setTimeout(() => search(val), 300);
      return () => clearTimeout(timeout);
    } else {
      setResults([]);
    }
  };

  const close = () => {
    setExpanded(false);
    setQuery('');
    setResults([]);
  };

  if (!expanded) {
    return (
      <button
        onClick={() => setExpanded(true)}
        className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors"
        title={t('Suchen', 'Search')}
      >
        <Search className="h-3.5 w-3.5" />
      </button>
    );
  }

  return (
    <div className="relative">
      <div className="flex items-center gap-1.5 rounded-lg border border-border/50 bg-muted/10 px-2 py-1">
        <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        <input
          autoFocus
          value={query}
          onChange={e => handleInput(e.target.value)}
          placeholder={t('Nachrichten durchsuchen…', 'Search messages…')}
          className="flex-1 bg-transparent text-xs text-foreground placeholder:text-muted-foreground/50 outline-none min-w-[120px]"
        />
        {loading && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
        <button onClick={close} className="text-muted-foreground hover:text-foreground">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {results.length > 0 && (
        <div className="absolute left-0 right-0 top-full mt-1 z-50 max-h-64 overflow-y-auto rounded-lg border border-border/50 bg-card shadow-lg">
          {results.map(r => (
            <button
              key={r.id}
              onClick={() => { onResultClick?.(r); close(); }}
              className="flex w-full flex-col gap-0.5 px-3 py-2 text-left hover:bg-muted/20 transition-colors border-b border-border/10 last:border-0"
            >
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-semibold text-foreground/80">
                  {r.sender_name}
                </span>
                <span className="text-[9px] text-muted-foreground/50">
                  {formatDistanceToNow(new Date(r.created_at), {
                    addSuffix: true,
                    locale: lang === 'de' ? deLocale : undefined,
                  })}
                </span>
              </div>
              <p className="text-[10px] text-muted-foreground line-clamp-2">
                {highlightQuery(r.content, query)}
              </p>
            </button>
          ))}
        </div>
      )}

      {query.length >= 2 && !loading && results.length === 0 && (
        <div className="absolute left-0 right-0 top-full mt-1 z-50 rounded-lg border border-border/50 bg-card shadow-lg p-4 text-center">
          <p className="text-xs text-muted-foreground">{t('Keine Ergebnisse', 'No results')}</p>
        </div>
      )}
    </div>
  );
}

function highlightQuery(text: string, query: string): string {
  // Simple truncation around the match
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return text.slice(0, 80);
  const start = Math.max(0, idx - 20);
  const end = Math.min(text.length, idx + query.length + 40);
  return (start > 0 ? '…' : '') + text.slice(start, end) + (end < text.length ? '…' : '');
}
