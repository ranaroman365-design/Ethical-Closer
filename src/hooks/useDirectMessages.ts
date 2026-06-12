import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

export interface ChatContact {
  id: string;
  full_name: string;
  email: string | null;
  business_stage: string;
  avatar_url: string | null;
  last_active: string | null;
  is_online: boolean;
  level: number;
  can_message: boolean;
  thread_open: boolean;
  last_message_content: string | null;
  last_message_at: string | null;
  unread_count: number;
}

export interface DirectMessage {
  id: string;
  sender_id: string;
  receiver_id: string;
  content: string;
  read: boolean;
  created_at: string;
}

const STAGE_LEVEL: Record<string, number> = {
  prospect: 0, applicant: 0, opener: 1, trainee: 1,
  setter: 2, associate_setter: 2, associate: 2,
  senior_associate: 3, senior_setter: 3,
  junior_manager: 4, manager: 5, senior_manager: 6,
  director: 7, partner: 8,
};

const STAGE_TO_GROUP: Record<string, string> = {
  prospect: 'trainee', applicant: 'trainee', opener: 'trainee', trainee: 'trainee',
  setter: 'setter', associate_setter: 'setter', associate: 'setter',
  senior_associate: 'setter', senior_setter: 'setter',
  junior_manager: 'closer', manager: 'closer', senior_manager: 'closer', director: 'closer',
  partner: 'inner_circle',
};

export function getStageLevel(stage: string): number {
  return STAGE_LEVEL[stage] ?? 0;
}

export function getStageGroup(stage: string): string {
  return STAGE_TO_GROUP[stage] ?? 'trainee';
}

function isRecentlyActive(updatedAt: string | null): boolean {
  if (!updatedAt) return false;
  return Date.now() - new Date(updatedAt).getTime() < 5 * 60 * 1000;
}

// All users can message all users — no restrictions
function canInitiateChat(): boolean {
  return true;
}

interface ChatThread {
  id: string;
  user_a: string;
  user_b: string;
  opened_by: string;
  opened_at: string;
  is_open: boolean;
}

const MESSAGE_PAGE_SIZE = 50;

export function useDirectMessages() {
  const { user, profile, isAdmin } = useAuth();
  const [allProfiles, setAllProfiles] = useState<any[]>([]);
  const [threads, setThreads] = useState<ChatThread[]>([]);
  const [messages, setMessages] = useState<DirectMessage[]>([]);
  const [activeContactId, setActiveContactId] = useState<string | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loadingContacts, setLoadingContacts] = useState(true);
  const [hasMoreMessages, setHasMoreMessages] = useState(false);
  const [loadingMoreMessages, setLoadingMoreMessages] = useState(false);
  const [chatFilter, setChatFilter] = useState<string | null>(null);
  const [contactMessages, setContactMessages] = useState<Map<string, { content: string; created_at: string; unread: number }>>(new Map());
  const [connectionStatus, setConnectionStatus] = useState<'connected' | 'disconnected' | 'reconnecting'>('connected');

  // Track last activity timestamp for throttled online pings
  const lastActivityRef = useRef<number>(Date.now());
  const lastPingRef = useRef<number>(0);

  const myLevel = profile ? getStageLevel(profile.business_stage) : 0;

  // Load profiles, threads, and recent messages
  useEffect(() => {
    if (!user || !profile) return;

    const load = async () => {
      setLoadingContacts(true);

      try {
        const [profilesRes, threadsRes] = await Promise.all([
          supabase
            .from('profiles')
            .select('id, full_name, email, business_stage, avatar_url, updated_at')
            .neq('id', user.id)
            .order('full_name'),
          supabase
            .from('chat_threads')
            .select('*')
            .or(`user_a.eq.${user.id},user_b.eq.${user.id}`),
        ]);

        setAllProfiles(profilesRes.data || []);
        setThreads((threadsRes.data as ChatThread[]) || []);

        // Load last message per conversation + unread counts
        const [sentRes, receivedRes, unreadRes] = await Promise.all([
          supabase
            .from('direct_messages')
            .select('receiver_id, content, created_at')
            .eq('sender_id', user.id)
            .is('deleted_at', null)
            .order('created_at', { ascending: false })
            .limit(200),
          supabase
            .from('direct_messages')
            .select('sender_id, content, created_at')
            .eq('receiver_id', user.id)
            .is('deleted_at', null)
            .order('created_at', { ascending: false })
            .limit(200),
          supabase
            .from('direct_messages')
            .select('sender_id')
            .eq('receiver_id', user.id)
            .eq('read', false)
            .is('deleted_at', null),
        ]);

        const msgMap = new Map<string, { content: string; created_at: string; unread: number }>();

        // Count unreads per sender
        const unreadCounts = new Map<string, number>();
        (unreadRes.data || []).forEach((m: any) => {
          unreadCounts.set(m.sender_id, (unreadCounts.get(m.sender_id) || 0) + 1);
        });

        // Total unread
        let totalUnread = 0;
        unreadCounts.forEach(v => totalUnread += v);
        setUnreadCount(totalUnread);

        // Process sent messages
        (sentRes.data || []).forEach((m: any) => {
          const contactId = m.receiver_id;
          if (!msgMap.has(contactId) || new Date(m.created_at) > new Date(msgMap.get(contactId)!.created_at)) {
            msgMap.set(contactId, { content: m.content, created_at: m.created_at, unread: unreadCounts.get(contactId) || 0 });
          }
        });

        // Process received messages
        (receivedRes.data || []).forEach((m: any) => {
          const contactId = m.sender_id;
          const existing = msgMap.get(contactId);
          if (!existing || new Date(m.created_at) > new Date(existing.created_at)) {
            msgMap.set(contactId, { content: m.content, created_at: m.created_at, unread: unreadCounts.get(contactId) || 0 });
          } else if (existing) {
            existing.unread = unreadCounts.get(contactId) || 0;
          }
        });

        setContactMessages(msgMap);
      } catch (err) {
        console.error('[Chat] Failed to load contacts:', err);
      } finally {
        setLoadingContacts(false);
      }
    };
    load();
  }, [user, profile]);

  // Build contacts with last message data
  const contacts: ChatContact[] = useMemo(() => {
    if (!user || !profile) return [];

    // L0 restriction: only show assigned setter
    const isL0 = myLevel === 0 && !isAdmin;

    return allProfiles
      .filter((p) => {
        if (!isL0) return true;
        // For L0, only show profiles that have a thread with this user
        // or are the assigned setter (we check thread existence as proxy)
        const hasThread = threads.some(
          (t) => (t.user_a === user.id && t.user_b === p.id) || (t.user_b === user.id && t.user_a === p.id)
        );
        return hasThread;
      })
      .map((p) => {
        const theirLevel = getStageLevel(p.business_stage);
        const thread = threads.find(
          (t) => (t.user_a === user.id && t.user_b === p.id) || (t.user_b === user.id && t.user_a === p.id)
        );
        const threadOpen = !!thread?.is_open;
        const canMsg = canInitiateChat();
        const msgData = contactMessages.get(p.id);

        return {
          id: p.id,
          full_name: p.full_name || 'Unbekannt',
          email: p.email || null,
          business_stage: p.business_stage || 'opener',
          avatar_url: p.avatar_url,
          last_active: p.updated_at,
          is_online: isRecentlyActive(p.updated_at),
          level: theirLevel,
          can_message: canMsg,
          thread_open: threadOpen,
          last_message_content: msgData?.content || null,
          last_message_at: msgData?.created_at || null,
          unread_count: msgData?.unread || 0,
        };
      });
  }, [allProfiles, threads, user, profile, myLevel, isAdmin, contactMessages]);

  // Sort: unread first, then recent activity, then rest
  const sortedContacts = useMemo(() => {
    return [...contacts].sort((a, b) => {
      if (a.unread_count > 0 && b.unread_count === 0) return -1;
      if (b.unread_count > 0 && a.unread_count === 0) return 1;
      if (a.last_message_at && b.last_message_at) {
        return new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime();
      }
      if (a.last_message_at) return -1;
      if (b.last_message_at) return 1;
      return a.full_name.localeCompare(b.full_name);
    });
  }, [contacts]);

  // Apply admin chat filter
  const filteredContacts = useMemo(() => {
    if (!chatFilter) return sortedContacts;
    const filterStages =
      chatFilter === 'trainee' ? ['opener', 'trainee', 'prospect', 'applicant']
      : chatFilter === 'setter' ? ['setter', 'associate_setter', 'associate', 'senior_associate', 'senior_setter']
      : chatFilter === 'closer' ? ['junior_manager', 'manager', 'senior_manager', 'director']
      : chatFilter === 'inner_circle' ? ['partner']
      : [];
    if (filterStages.length === 0) return sortedContacts;
    return sortedContacts.filter((c) => filterStages.includes(c.business_stage));
  }, [sortedContacts, chatFilter]);

  // Activity-based online ping (every 3 min, only on user activity)
  useEffect(() => {
    if (!user) return;

    const handleActivity = () => {
      lastActivityRef.current = Date.now();
    };

    // Track user activity
    window.addEventListener('mousemove', handleActivity, { passive: true });
    window.addEventListener('keydown', handleActivity, { passive: true });
    window.addEventListener('click', handleActivity, { passive: true });
    window.addEventListener('touchstart', handleActivity, { passive: true });

    // Ping interval: check every 60s, but only write if active and 3min since last ping
    const PING_INTERVAL = 60_000;
    const MIN_PING_GAP = 180_000; // 3 minutes

    const doPing = () => {
      const now = Date.now();
      const timeSinceActivity = now - lastActivityRef.current;
      const timeSincePing = now - lastPingRef.current;

      // Only ping if user was active in last 5 min AND at least 3 min since last ping
      if (timeSinceActivity < 300_000 && timeSincePing >= MIN_PING_GAP) {
        lastPingRef.current = now;
        supabase.from('profiles').update({ updated_at: new Date().toISOString() }).eq('id', user.id).then();
      }
    };

    // Initial ping
    lastPingRef.current = Date.now();
    supabase.from('profiles').update({ updated_at: new Date().toISOString() }).eq('id', user.id).then();

    const interval = setInterval(doPing, PING_INTERVAL);
    return () => {
      clearInterval(interval);
      window.removeEventListener('mousemove', handleActivity);
      window.removeEventListener('keydown', handleActivity);
      window.removeEventListener('click', handleActivity);
      window.removeEventListener('touchstart', handleActivity);
    };
  }, [user]);

  // Load messages for active conversation (paginated)
  useEffect(() => {
    if (!user || !activeContactId) {
      setMessages([]);
      setHasMoreMessages(false);
      return;
    }

    const load = async () => {
      try {
        const { data } = await supabase
          .from('direct_messages')
          .select('*')
          .is('deleted_at', null)
          .or(
            `and(sender_id.eq.${user.id},receiver_id.eq.${activeContactId}),and(sender_id.eq.${activeContactId},receiver_id.eq.${user.id})`
          )
          .order('created_at', { ascending: false })
          .limit(MESSAGE_PAGE_SIZE);

        const msgs = ((data as DirectMessage[]) || []).reverse();
        setMessages(msgs);
        setHasMoreMessages((data?.length || 0) >= MESSAGE_PAGE_SIZE);

        // Mark as read + update seen status
        await supabase
          .from('direct_messages')
          .update({ read: true, status: 'seen', seen_at: new Date().toISOString() } as any)
          .eq('sender_id', activeContactId)
          .eq('receiver_id', user.id)
          .eq('read', false);

        // Update unread locally
        setContactMessages((prev) => {
          const next = new Map(prev);
          const existing = next.get(activeContactId);
          if (existing && existing.unread > 0) {
            setUnreadCount((c) => Math.max(0, c - existing.unread));
            next.set(activeContactId, { ...existing, unread: 0 });
          }
          return next;
        });
      } catch (err) {
        console.error('[Chat] Failed to load messages:', err);
      }
    };
    load();
  }, [user, activeContactId]);

  // Load older messages (scroll-up pagination)
  const loadMoreMessages = useCallback(async () => {
    if (!user || !activeContactId || loadingMoreMessages || !hasMoreMessages) return;

    setLoadingMoreMessages(true);
    try {
      const oldestMsg = messages[0];
      if (!oldestMsg) return;

      const { data } = await supabase
        .from('direct_messages')
        .select('*')
        .is('deleted_at', null)
        .or(
          `and(sender_id.eq.${user.id},receiver_id.eq.${activeContactId}),and(sender_id.eq.${activeContactId},receiver_id.eq.${user.id})`
        )
        .lt('created_at', oldestMsg.created_at)
        .order('created_at', { ascending: false })
        .limit(MESSAGE_PAGE_SIZE);

      const olderMsgs = ((data as DirectMessage[]) || []).reverse();
      if (olderMsgs.length > 0) {
        setMessages((prev) => [...olderMsgs, ...prev]);
      }
      setHasMoreMessages(olderMsgs.length >= MESSAGE_PAGE_SIZE);
    } catch (err) {
      console.error('[Chat] Failed to load more messages:', err);
    } finally {
      setLoadingMoreMessages(false);
    }
  }, [user, activeContactId, messages, loadingMoreMessages, hasMoreMessages]);

  // Refetch latest messages on reconnect
  const refetchLatestMessages = useCallback(async () => {
    if (!user || !activeContactId) return;
    const { data } = await supabase
      .from('direct_messages')
      .select('*')
      .is('deleted_at', null)
      .or(
        `and(sender_id.eq.${user.id},receiver_id.eq.${activeContactId}),and(sender_id.eq.${activeContactId},receiver_id.eq.${user.id})`
      )
      .order('created_at', { ascending: false })
      .limit(20);
    if (data && data.length > 0) {
      const msgs = ((data as DirectMessage[]) || []).reverse();
      setMessages((prev) => {
        const existingIds = new Set(prev.map((m) => m.id));
        const newMsgs = msgs.filter((m) => !existingIds.has(m.id));
        return newMsgs.length > 0 ? [...prev, ...newMsgs] : prev;
      });
    }
  }, [user, activeContactId]);

  // User-specific realtime channel
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel(`dm-user-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'direct_messages',
          filter: `receiver_id=eq.${user.id}`,
        },
        (payload) => {
          const msg = payload.new as DirectMessage;
          const isActiveConversation = msg.sender_id === activeContactId;

          if (isActiveConversation) {
            setMessages((prev) => [...prev, msg]);
            supabase.from('direct_messages').update({ read: true }).eq('id', msg.id).then();
          } else {
            setUnreadCount((c) => c + 1);
          }

          setContactMessages((prev) => {
            const next = new Map(prev);
            const existing = next.get(msg.sender_id);
            const newUnread = isActiveConversation ? 0 : (existing?.unread || 0) + 1;
            next.set(msg.sender_id, { content: msg.content, created_at: msg.created_at, unread: newUnread });
            return next;
          });
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'direct_messages',
          filter: `sender_id=eq.${user.id}`,
        },
        (payload) => {
          const msg = payload.new as DirectMessage;
          const isActiveConversation = msg.receiver_id === activeContactId;

          if (isActiveConversation) {
            setMessages((prev) => {
              if (prev.some(m => m.id === msg.id)) return prev;
              return [...prev, msg];
            });
          }

          setContactMessages((prev) => {
            const next = new Map(prev);
            const existing = next.get(msg.receiver_id);
            next.set(msg.receiver_id, {
              content: msg.content,
              created_at: msg.created_at,
              unread: existing?.unread || 0,
            });
            return next;
          });
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'direct_messages',
          filter: `sender_id=eq.${user.id}`,
        },
        (payload) => {
          const updated = payload.new as DirectMessage;
          setMessages((prev) =>
            prev.map((m) => (m.id === updated.id ? { ...m, read: updated.read } : m))
          );
        }
      )
      .on('system' as any, {} as any, async (status: string) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          setConnectionStatus('reconnecting');
          await refetchLatestMessages();
        }
        if (status === 'SUBSCRIBED') {
          setConnectionStatus('connected');
        }
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          setConnectionStatus('connected');
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          setConnectionStatus('disconnected');
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, activeContactId, refetchLatestMessages]);

  // Send message
  const sendMessage = useCallback(
    async (content: string) => {
      if (!user || !activeContactId || !content.trim() || !profile) return;

      try {
        const existingThread = threads.find(
          (t) =>
            (t.user_a === user.id && t.user_b === activeContactId) ||
            (t.user_b === user.id && t.user_a === activeContactId)
        );

        if (!existingThread) {
          const [a, b] = user.id < activeContactId
            ? [user.id, activeContactId]
            : [activeContactId, user.id];

          const { data: newThread } = await supabase
            .from('chat_threads')
            .insert({ user_a: a, user_b: b, opened_by: user.id })
            .select()
            .single();

          if (newThread) {
            setThreads((prev) => [...prev, newThread as ChatThread]);
          }
        }

        await supabase.from('direct_messages').insert({
          sender_id: user.id,
          receiver_id: activeContactId,
          content: content.trim(),
        });
      } catch (err) {
        console.error('[Chat] Failed to send message:', err);
      }
    },
    [user, activeContactId, profile, threads]
  );

  return {
    contacts: filteredContacts,
    allContacts: contacts,
    messages,
    activeContactId,
    setActiveContactId,
    sendMessage,
    unreadCount,
    loadingContacts,
    chatFilter,
    setChatFilter,
    isAdmin,
    threads,
    hasMoreMessages,
    loadMoreMessages,
    loadingMoreMessages,
    myLevel,
    connectionStatus,
  };
}
