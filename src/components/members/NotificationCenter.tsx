import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useLanguage } from '@/i18n/LanguageContext';
import { Bell, Check, ExternalLink } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { de as deLocale } from 'date-fns/locale';
import { cn } from '@/lib/utils';

interface Notification {
  id: string;
  recipient_id: string;
  type: string;
  title: string;
  message: string;
  link_path: string | null;
  is_read: boolean;
  created_at: string;
  metadata: Record<string, unknown> | null;
}

export default function NotificationCenter() {
  const { user } = useAuth();
  const { lang } = useLanguage();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const t = (de: string, en: string) => lang === 'de' ? de : en;

  const loadNotifications = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from('notifications')
      .select('*')
      .eq('recipient_id', user.id)
      .order('created_at', { ascending: false })
      .limit(20);
    if (data) {
      setNotifications(data as Notification[]);
      setUnreadCount((data as Notification[]).filter(n => !n.is_read).length);
    }
  }, [user]);

  useEffect(() => {
    loadNotifications();
  }, [loadNotifications]);

  // Realtime subscription for new notifications
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`notifications-${user.id}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'notifications',
        filter: `recipient_id=eq.${user.id}`,
      }, (payload) => {
        const newNotif = payload.new as Notification;
        setNotifications(prev => [newNotif, ...prev].slice(0, 20));
        setUnreadCount(prev => prev + 1);
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user]);

  const markAsRead = async (id: string) => {
    await supabase.from('notifications').update({ is_read: true } as any).eq('id', id);
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
    setUnreadCount(prev => Math.max(0, prev - 1));
  };

  const markAllRead = async () => {
    if (!user) return;
    await supabase.from('notifications').update({ is_read: true } as any)
      .eq('recipient_id', user.id).eq('is_read', false);
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
    setUnreadCount(0);
  };

  const handleClick = (n: Notification) => {
    if (!n.is_read) markAsRead(n.id);
    if (n.link_path) {
      navigate(n.link_path);
      setOpen(false);
    }
  };

  const today = new Date().toDateString();
  const todayNotifs = notifications.filter(n => new Date(n.created_at).toDateString() === today);
  const earlierNotifs = notifications.filter(n => new Date(n.created_at).toDateString() !== today);

  const TYPE_ICONS: Record<string, string> = {
    dm: '💬', community_reply: '💬', reply: '💬', mention: '@',
    stage_change: '🚀', level_up: '★', win: '🏆', like: '👏',
    milestone: '🎯', system: 'ℹ️', info: 'ℹ️',
  };

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="relative flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors"
        aria-label="Notifications"
      >
        <Bell className="h-4 w-4" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[9px] font-bold text-destructive-foreground">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <>
          {/* Backdrop */}
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          
          {/* Panel */}
          <div className="absolute right-0 top-10 z-50 w-80 max-h-[420px] overflow-hidden rounded-xl border border-border/60 bg-card shadow-xl">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-border/30 px-4 py-2.5">
              <h3 className="text-xs font-semibold text-foreground">
                {t('Benachrichtigungen', 'Notifications')}
              </h3>
              {unreadCount > 0 && (
                <button
                  onClick={markAllRead}
                  className="flex items-center gap-1 text-[10px] text-primary hover:text-primary/80 font-medium transition-colors"
                >
                  <Check className="h-3 w-3" />
                  {t('Alle gelesen', 'Mark all read')}
                </button>
              )}
            </div>

            {/* List */}
            <div className="overflow-y-auto max-h-[360px]">
              {notifications.length === 0 ? (
                <div className="py-10 text-center text-xs text-muted-foreground">
                  {t('Keine Benachrichtigungen', 'No notifications')}
                </div>
              ) : (
                <>
                  {todayNotifs.length > 0 && (
                    <div>
                      <p className="px-4 pt-2 pb-1 text-[9px] font-bold uppercase tracking-widest text-muted-foreground/60">
                        {t('Heute', 'Today')}
                      </p>
                      {todayNotifs.map(n => (
                        <NotifItem key={n.id} n={n} onClick={handleClick} icons={TYPE_ICONS} lang={lang} />
                      ))}
                    </div>
                  )}
                  {earlierNotifs.length > 0 && (
                    <div>
                      <p className="px-4 pt-2 pb-1 text-[9px] font-bold uppercase tracking-widest text-muted-foreground/60">
                        {t('Früher', 'Earlier')}
                      </p>
                      {earlierNotifs.map(n => (
                        <NotifItem key={n.id} n={n} onClick={handleClick} icons={TYPE_ICONS} lang={lang} />
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function NotifItem({ n, onClick, icons, lang }: {
  n: Notification;
  onClick: (n: Notification) => void;
  icons: Record<string, string>;
  lang: string;
}) {
  return (
    <button
      onClick={() => onClick(n)}
      className={cn(
        'flex w-full items-start gap-2.5 px-4 py-2.5 text-left transition-colors hover:bg-muted/20',
        !n.is_read && 'bg-primary/5'
      )}
    >
      <span className="mt-0.5 text-sm">{icons[n.type] || 'ℹ️'}</span>
      <div className="flex-1 min-w-0">
        <p className={cn('text-[11px] leading-tight', !n.is_read ? 'font-semibold text-foreground' : 'text-muted-foreground')}>
          {n.title}
        </p>
        {n.message && (
          <p className="text-[10px] text-muted-foreground/70 mt-0.5 line-clamp-2">{n.message}</p>
        )}
        <p className="text-[9px] text-muted-foreground/50 mt-0.5">
          {formatDistanceToNow(new Date(n.created_at), {
            addSuffix: true,
            locale: lang === 'de' ? deLocale : undefined,
          })}
        </p>
      </div>
      {!n.is_read && (
        <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" />
      )}
      {n.link_path && (
        <ExternalLink className="mt-1 h-3 w-3 shrink-0 text-muted-foreground/30" />
      )}
    </button>
  );
}
