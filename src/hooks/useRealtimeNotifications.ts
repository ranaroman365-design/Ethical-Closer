import { useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

const STAGE_LABELS: Record<string, string> = {
  prospect: 'Bewerber', opener: 'Trainee', setter: 'Associate Setter',
  senior_associate: 'Senior Setter', junior_manager: 'Closer (Placement Track)',
  manager: 'Managing Closer', senior_manager: 'Senior Closer',
  director: 'Director', partner: 'Partner', admin: 'Admin',
};

async function persistNotification(userId: string, type: string, title: string, message: string, linkPath?: string) {
  try {
    await supabase.from('notifications').insert({
      recipient_id: userId,
      type,
      title,
      message,
      link_path: linkPath || null,
    } as any);
  } catch { /* non-critical */ }
}

export function useRealtimeNotifications(userId: string | undefined) {
  const { toast } = useToast();
  const prevStageRef = useRef<string | null>(null);

  useEffect(() => {
    if (!userId) return;

    supabase.from('profiles').select('business_stage').eq('id', userId).single()
      .then(({ data }) => { if (data) prevStageRef.current = data.business_stage; });

    const channel = supabase
      .channel('notifications')
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'profiles',
        filter: `id=eq.${userId}`,
      }, (payload) => {
        const newStage = payload.new?.business_stage;
        const oldStage = prevStageRef.current;
        if (newStage && oldStage && newStage !== oldStage) {
          const title = 'Neuer Karriereschritt';
          const desc = `Du bist jetzt ${STAGE_LABELS[newStage] || newStage}.`;
          toast({ title, description: desc });
          persistNotification(userId, 'stage_change', title, desc, '/members/path');
          prevStageRef.current = newStage;
        }
      })
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'direct_messages',
        filter: `receiver_id=eq.${userId}`,
      }, async (payload) => {
        const msg = payload.new as any;
        if (msg.sender_id === userId) return;
        const { data: sender } = await supabase
          .from('profiles')
          .select('full_name')
          .eq('id', msg.sender_id)
          .single();
        const name = sender?.full_name || 'Jemand';
        const title = `💬 Nachricht von ${name}`;
        const desc = msg.content?.slice(0, 60) + (msg.content?.length > 60 ? '…' : '');
        toast({ title, description: desc });
        persistNotification(userId, 'dm', title, desc, '/members/community');
      })
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'community_messages',
      }, (payload) => {
        const msg = payload.new as any;
        if (msg.reply_to && msg.user_id !== userId) {
          supabase
            .from('community_messages')
            .select('user_id')
            .eq('id', msg.reply_to)
            .single()
            .then(({ data }) => {
              if (data?.user_id === userId) {
                const t = 'Antwort auf deinen Beitrag';
                const d = msg.content?.slice(0, 60) + (msg.content?.length > 60 ? '…' : '');
                toast({ title: t, description: d });
                persistNotification(userId, 'community_reply', t, d, '/members/community');
              }
            });
        }
        const isAutoWin = msg.message_type === 'win' || msg.message_type === 'milestone' || msg.message_type === 'level_up';
        if (isAutoWin && msg.user_id === userId) {
          const t = '🏆 Neuer Erfolg!';
          const d = msg.content?.slice(0, 80) || 'Ein neuer Win wurde für dich gepostet.';
          toast({ title: t, description: d });
          persistNotification(userId, 'win', t, d, '/members/community');
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [userId, toast]);
}
