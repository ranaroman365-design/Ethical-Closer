import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useLanguage } from '@/i18n/LanguageContext';
import { useToast } from '@/hooks/use-toast';
import { AlertTriangle, RotateCcw, X, Loader2 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { de as deLocale } from 'date-fns/locale';

interface DlqItem {
  id: string;
  original_event_id: string | null;
  endpoint: string | null;
  payload: Record<string, unknown> | null;
  error: string | null;
  failed_at: string;
  retried_at: string | null;
  dismissed: boolean;
}

export default function WebhookDlqPanel() {
  const { isAdmin } = useAuth();
  const { lang } = useLanguage();
  const { toast } = useToast();
  const [items, setItems] = useState<DlqItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [retrying, setRetrying] = useState<string | null>(null);
  const t = (de: string, en: string) => lang === 'de' ? de : en;

  useEffect(() => {
    if (!isAdmin) return;
    loadDlq();
  }, [isAdmin]);

  async function loadDlq() {
    setLoading(true);
    const { data } = await supabase
      .from('webhook_dlq')
      .select('*')
      .eq('dismissed', false)
      .order('failed_at', { ascending: false })
      .limit(50);
    setItems((data as DlqItem[]) ?? []);
    setLoading(false);
  }

  async function retryItem(item: DlqItem) {
    setRetrying(item.id);
    try {
      // Re-insert as pending outbound event
      await supabase.from('outbound_events').insert({
        event_name: (item.payload as any)?.event_name || 'retry',
        entity_type: (item.payload as any)?.entity_type || 'unknown',
        entity_id: (item.payload as any)?.entity_id || null,
        email: (item.payload as any)?.email || null,
        payload: item.payload || {},
        status: 'pending',
        retry_count: 0,
      } as any);

      // Mark as retried
      await supabase.from('webhook_dlq').update({ retried_at: new Date().toISOString() } as any).eq('id', item.id);
      
      toast({ title: t('Event wird erneut versendet', 'Event queued for retry') });
      loadDlq();
    } catch {
      toast({ title: t('Fehler beim Retry', 'Retry failed'), variant: 'destructive' });
    }
    setRetrying(null);
  }

  async function dismissItem(id: string) {
    await supabase.from('webhook_dlq').update({ dismissed: true } as any).eq('id', id);
    setItems(prev => prev.filter(i => i.id !== id));
  }

  if (!isAdmin) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-destructive" />
          <h3 className="text-xs font-semibold text-foreground">
            Webhook Dead Letter Queue
          </h3>
        </div>
        <span className="text-[10px] text-muted-foreground">
          {items.length} {t('fehlgeschlagen', 'failed')}
        </span>
      </div>

      {loading ? (
        <div className="flex justify-center py-6">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-lg border border-border/20 bg-muted/5 p-4 text-center">
          <p className="text-xs text-muted-foreground">
            {t('Keine fehlgeschlagenen Events', 'No failed events')} ✓
          </p>
        </div>
      ) : (
        <div className="space-y-2 max-h-[300px] overflow-y-auto">
          {items.map(item => (
            <div key={item.id} className="rounded-lg border border-destructive/20 bg-destructive/5 p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-medium text-foreground truncate">
                    {(item.payload as any)?.event_name || 'Unknown Event'}
                  </p>
                  <p className="text-[10px] text-muted-foreground mt-0.5 truncate">
                    {item.error?.slice(0, 80)}
                  </p>
                  <p className="text-[9px] text-muted-foreground/50 mt-1">
                    {formatDistanceToNow(new Date(item.failed_at), {
                      addSuffix: true,
                      locale: lang === 'de' ? deLocale : undefined,
                    })}
                    {item.retried_at && ` · ${t('Retry versucht', 'Retried')}`}
                  </p>
                </div>
                <div className="flex gap-1 shrink-0">
                  <button
                    onClick={() => retryItem(item)}
                    disabled={retrying === item.id}
                    className="flex h-6 w-6 items-center justify-center rounded-md border border-border/40 bg-card text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors disabled:opacity-50"
                    title="Retry"
                  >
                    {retrying === item.id ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <RotateCcw className="h-3 w-3" />
                    )}
                  </button>
                  <button
                    onClick={() => dismissItem(item.id)}
                    className="flex h-6 w-6 items-center justify-center rounded-md border border-border/40 bg-card text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                    title="Dismiss"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
