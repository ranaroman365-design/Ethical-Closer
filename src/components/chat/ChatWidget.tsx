import { useState, useEffect } from 'react';
import { MessageCircle, X } from 'lucide-react';
import { useDirectMessages } from '@/hooks/useDirectMessages';
import ChatPanel from './ChatPanel';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export default function ChatWidget() {
  const [open, setOpen] = useState(false);
  const dm = useDirectMessages();
  const { user } = useAuth();
  const [isMuted, setIsMuted] = useState(false);
  const [mutedUntil, setMutedUntil] = useState<string | null>(null);

  // Check mute status
  useEffect(() => {
    if (!user) return;
    supabase
      .from('profiles')
      .select('is_chat_muted, chat_muted_until')
      .eq('id', user.id)
      .single()
      .then(({ data }) => {
        if (data) {
          const muted = (data as any).is_chat_muted ?? false;
          const until = (data as any).chat_muted_until ?? null;
          // Auto-unmute if expired
          if (muted && until && new Date(until) <= new Date()) {
            setIsMuted(false);
          } else {
            setIsMuted(muted);
            setMutedUntil(until);
          }
        }
      });
  }, [user]);

  return (
    <>
      <button
        onClick={() => setOpen((o) => !o)}
        className="fixed bottom-5 right-5 z-50 flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg hover:opacity-90 transition-opacity"
        aria-label="Chat öffnen"
      >
        {open ? (
          <X className="h-5 w-5" />
        ) : (
          <>
            <MessageCircle className="h-5 w-5" />
            {dm.unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
                {dm.unreadCount > 9 ? '9+' : dm.unreadCount}
              </span>
            )}
          </>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className="fixed bottom-20 right-5 z-50 w-[360px] max-w-[calc(100vw-2.5rem)] h-[500px] max-h-[calc(100vh-7rem)] rounded-xl border border-border bg-card shadow-2xl overflow-hidden flex flex-col"
          >
            {/* Connection status banner */}
            {dm.connectionStatus !== 'connected' && (
              <div className="px-3 py-1.5 bg-amber-500/15 border-b border-amber-500/20 flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                <span className="text-[10px] text-amber-700 dark:text-amber-400">
                  Verbindung unterbrochen — wird wiederhergestellt...
                </span>
              </div>
            )}
            <ChatPanel
              {...dm}
              isAdmin={dm.isAdmin}
              chatFilter={dm.chatFilter}
              setChatFilter={dm.setChatFilter}
              isMuted={isMuted}
              mutedUntil={mutedUntil}
              threads={dm.threads}
              hasMoreMessages={dm.hasMoreMessages}
              loadMoreMessages={dm.loadMoreMessages}
              loadingMoreMessages={dm.loadingMoreMessages}
              myLevel={dm.myLevel}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
