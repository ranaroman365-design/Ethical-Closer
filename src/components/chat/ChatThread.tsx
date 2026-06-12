import { useState, useRef, useEffect, KeyboardEvent, useCallback } from 'react';
import { Send, Check, CheckCheck, MoreVertical, Trash2, AlertTriangle, VolumeX, Mic } from 'lucide-react';
import AudioRecorder from '@/components/audio/AudioRecorder';
import AudioPlayer from '@/components/audio/AudioPlayer';
import { useAuth } from '@/hooks/useAuth';
import type { DirectMessage, ChatContact } from '@/hooks/useDirectMessages';
import { getStageLevel } from '@/hooks/useDirectMessages';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { detectToxicContent, checkRateLimit } from '@/lib/chat-compliance';
import ConversationStarters from './ConversationStarters';
import WelcomeMessage from './WelcomeMessage';
import { useLanguage } from '@/i18n/LanguageContext';

const STAGE_LABELS: Record<string, string> = {
  prospect: 'Bewerber',
  applicant: 'Bewerber',
  opener: 'Trainee',
  trainee: 'Trainee',
  setter: 'Setter',
  associate_setter: 'Setter',
  associate: 'Setter',
  senior_associate: 'Sr. Setter',
  senior_setter: 'Sr. Setter',
  junior_manager: 'Jr. Closer',
  manager: 'Closer',
  senior_manager: 'Sr. Closer',
  director: 'Director',
  partner: 'Partner',
};

interface SenderInfo {
  name: string;
  stage: string;
  avatar: string | null;
}

interface Props {
  messages: DirectMessage[];
  sendMessage: (content: string) => Promise<void>;
  activeContactId: string;
  activeContact?: ChatContact;
  senderProfiles?: Map<string, { full_name: string; avatar_url: string | null; business_stage: string }>;
  isMuted?: boolean;
  mutedUntil?: string | null;
  hasMoreMessages?: boolean;
  loadMoreMessages?: () => void;
  loadingMoreMessages?: boolean;
}

export default function ChatThread({ messages, sendMessage, activeContact, senderProfiles, isMuted, mutedUntil, hasMoreMessages, loadMoreMessages, loadingMoreMessages }: Props) {
  const { user, profile, isAdmin } = useAuth();
  const { toast } = useToast();
  const { lang } = useLanguage();
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [menuOpen, setMenuOpen] = useState<string | null>(null);
  const [showAudioRecorder, setShowAudioRecorder] = useState(false);
  const [audioSignedUrls, setAudioSignedUrls] = useState<Map<string, string>>(new Map());
  const [deletedIds, setDeletedIds] = useState<Set<string>>(new Set());
  const [rateHint, setRateHint] = useState<string | null>(null);
  const [fetchedProfiles, setFetchedProfiles] = useState<Map<string, SenderInfo>>(new Map());
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const myLevel = profile ? getStageLevel(profile.business_stage) : 0;
  const showStarters = messages.length === 0 && !hasMoreMessages;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  // Fetch missing sender profiles from DB (identity fix)
  useEffect(() => {
    if (!user) return;
    const missingIds = new Set<string>();
    messages.forEach((msg) => {
      const id = msg.sender_id;
      if (id === user.id) return;
      if (activeContact && activeContact.id === id) return;
      if (senderProfiles?.has(id)) return;
      if (fetchedProfiles.has(id)) return;
      missingIds.add(id);
    });

    if (missingIds.size === 0) return;

    supabase
      .from('profiles')
      .select('id, full_name, avatar_url, business_stage')
      .in('id', Array.from(missingIds))
      .then(({ data }) => {
        if (!data || data.length === 0) return;
        setFetchedProfiles((prev) => {
          const next = new Map(prev);
          data.forEach((p: any) => {
            next.set(p.id, {
              name: p.full_name || 'Nutzer',
              stage: STAGE_LABELS[p.business_stage] || p.business_stage || '',
              avatar: p.avatar_url,
            });
          });
          return next;
        });
      });
  }, [messages, user, activeContact, senderProfiles, fetchedProfiles]);

  // Check if mute has expired
  const isCurrentlyMuted = isMuted && (!mutedUntil || new Date(mutedUntil) > new Date());

  // Resolve signed URLs for audio messages
  useEffect(() => {
    const audioMsgs = messages.filter((m: any) => m.audio_url && !audioSignedUrls.has(m.id));
    if (audioMsgs.length === 0) return;
    audioMsgs.forEach((m: any) => {
      supabase.storage.from('audio-messages').createSignedUrl(m.audio_url, 300).then(({ data }) => {
        if (data?.signedUrl) {
          setAudioSignedUrls(prev => new Map(prev).set(m.id, data.signedUrl));
        }
      });
    });
  }, [messages, audioSignedUrls]);

  const handleAudioSent = useCallback(async (filePath: string, duration: number) => {
    if (!activeContact) return;
    setShowAudioRecorder(false);
    // Send as a special message with audio_url
    const { error } = await supabase.from('direct_messages').insert({
      sender_id: user?.id,
      receiver_id: activeContact.id,
      content: '🎙️ Sprachnachricht',
      audio_url: filePath,
      audio_duration: duration,
    } as any);
    if (error) {
      toast({ title: 'Fehler', description: error.message, variant: 'destructive' });
    }
  }, [activeContact, user, toast]);

  const handleSend = async () => {
    if (!text.trim() || sending) return;

    if (isCurrentlyMuted) {
      toast({
        title: 'Chat eingeschränkt',
        description: 'Deine Chatfunktion ist derzeit vorübergehend eingeschränkt. Bitte wende dich bei Fragen an den Admin.',
        variant: 'destructive',
      });
      return;
    }

    const rate = checkRateLimit();
    if (rate.exceeded) {
      setRateHint(rate.hint);
      setTimeout(() => setRateHint(null), 5000);
      return;
    }

    const toxicMatch = detectToxicContent(text);
    if (toxicMatch) {
      // Insert into flagged_messages for admin review
      supabase.from('flagged_messages' as any).insert({
        message_id: crypto.randomUUID(),
        sender_id: user?.id,
        receiver_id: activeContact?.id || '',
        content: text.trim(),
        flagged_word: toxicMatch,
        flag_reason: 'toxic_content',
      } as any).then();

      toast({
        title: 'Hinweis',
        description: 'Bitte achte auf einen respektvollen Umgangston.',
        variant: 'destructive',
      });
      // Don't send the message
      return;
    }

    setSending(true);
    await sendMessage(text);
    setText('');
    setSending(false);
    setRateHint(null);
    textareaRef.current?.focus();
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleDelete = async (msgId: string) => {
    const { error } = await supabase
      .from('direct_messages')
      .update({ deleted_at: new Date().toISOString(), deleted_by: user?.id } as any)
      .eq('id', msgId);
    if (error) {
      toast({ title: 'Fehler', description: error.message, variant: 'destructive' });
    } else {
      setDeletedIds((prev) => new Set(prev).add(msgId));
      setMenuOpen(null);
    }
  };

  const visibleMessages = messages.filter((m) => !deletedIds.has(m.id) && !(m as any).deleted_at);

  const getSenderInfo = useCallback((senderId: string): SenderInfo => {
    if (senderId === user?.id) {
      return { name: 'Du', stage: '', avatar: null };
    }
    if (activeContact && activeContact.id === senderId) {
      return {
        name: activeContact.full_name || 'Nutzer',
        stage: STAGE_LABELS[activeContact.business_stage] || activeContact.business_stage,
        avatar: activeContact.avatar_url,
      };
    }
    if (senderProfiles?.has(senderId)) {
      const p = senderProfiles.get(senderId)!;
      return {
        name: p.full_name || 'Nutzer',
        stage: STAGE_LABELS[p.business_stage] || p.business_stage,
        avatar: p.avatar_url,
      };
    }
    // Fallback to dynamically fetched profiles
    if (fetchedProfiles.has(senderId)) {
      return fetchedProfiles.get(senderId)!;
    }
    // Last resort — will be resolved by useEffect above
    return { name: '…', stage: '', avatar: null };
  }, [user, activeContact, senderProfiles, fetchedProfiles]);

  return (
    <>
      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-2">
        {hasMoreMessages && (
          <div className="flex justify-center py-2">
            <button
              onClick={loadMoreMessages}
              disabled={loadingMoreMessages}
              className="text-[10px] font-medium text-primary hover:underline disabled:opacity-50"
            >
              {loadingMoreMessages ? 'Laden…' : 'Ältere Nachrichten laden'}
            </button>
          </div>
        )}
        {visibleMessages.length === 0 && !hasMoreMessages && (
          <div className="space-y-4 px-1 py-4">
            <WelcomeMessage level={myLevel} userName={profile?.full_name || ''} lang={lang} />
            <ConversationStarters level={myLevel} context="dm" lang={lang} onSelect={(t) => setText(t)} />
          </div>
        )}
        {visibleMessages.map((msg) => {
          const isMine = msg.sender_id === user?.id;
          const sender = getSenderInfo(msg.sender_id);

          return (
            <div key={msg.id} className={`group flex ${isMine ? 'justify-end' : 'justify-start'}`}>
              <div className="relative flex gap-1.5 max-w-[85%]">
                {!isMine && (
                  <div className="shrink-0 mt-1">
                    {sender.avatar ? (
                      <img src={sender.avatar} alt={sender.name} className="h-6 w-6 rounded-full object-cover" />
                    ) : (
                      <div className="h-6 w-6 rounded-full bg-primary/20 flex items-center justify-center text-[10px] font-semibold text-primary">
                        {sender.name.charAt(0).toUpperCase()}
                      </div>
                    )}
                  </div>
                )}

                <div>
                  {!isMine && (
                    <div className="flex items-center gap-1 mb-0.5 px-1">
                      <span className="text-[10px] font-medium text-foreground">{sender.name}</span>
                      {sender.stage && (
                        <span className="text-[9px] text-muted-foreground">· {sender.stage}</span>
                      )}
                    </div>
                  )}

                  <div className={`rounded-lg px-3 py-1.5 text-sm ${isMine ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground'}`}>
                    {(msg as any).audio_url ? (
                      <div className="min-w-[160px]">
                        {audioSignedUrls.has(msg.id) ? (
                          <AudioPlayer
                            src={audioSignedUrls.get(msg.id)!}
                            duration={(msg as any).audio_duration}
                            compact
                          />
                        ) : (
                          <span className="text-[10px] opacity-60">Audio wird geladen…</span>
                        )}
                      </div>
                    ) : (
                      <p className="whitespace-pre-wrap break-words">{msg.content}</p>
                    )}
                    <div className={`flex items-center gap-1 mt-0.5 ${isMine ? 'justify-end' : ''}`}>
                      <span className={`text-[9px] ${isMine ? 'text-primary-foreground/60' : 'text-muted-foreground'}`}>
                        {format(new Date(msg.created_at), 'HH:mm', { locale: de })}
                      </span>
                      {isMine && (() => {
                        const msgStatus = (msg as any).status || (msg.read ? 'seen' : 'sent');
                        if (msgStatus === 'seen') return <CheckCheck className="h-3 w-3 text-primary-foreground/80" />;
                        if (msgStatus === 'delivered') return <CheckCheck className="h-3 w-3 text-primary-foreground/40" />;
                        return <Check className="h-3 w-3 text-primary-foreground/40" />;
                      })()}
                    </div>
                  </div>
                </div>

                {isAdmin && (
                  <div className="absolute -right-6 top-0 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => setMenuOpen(menuOpen === msg.id ? null : msg.id)} className="p-1 rounded hover:bg-muted/50">
                      <MoreVertical className="h-3 w-3 text-muted-foreground" />
                    </button>
                    {menuOpen === msg.id && (
                      <div className="absolute right-0 top-6 z-50 rounded-md border border-border bg-card shadow-lg py-1 min-w-[120px]">
                        <button onClick={() => handleDelete(msg.id)} className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-destructive hover:bg-destructive/10 transition-colors">
                          <Trash2 className="h-3 w-3" /> Löschen
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {isCurrentlyMuted && (
        <div className="px-3 py-2 flex items-center gap-2 text-[11px] text-destructive bg-destructive/5 border-t border-destructive/20">
          <VolumeX className="h-3.5 w-3.5 shrink-0" />
          <span>Deine Chatfunktion ist derzeit vorübergehend eingeschränkt. Bitte wende dich bei Fragen an den Admin.</span>
        </div>
      )}
      {rateHint && (
        <div className="px-3 py-1.5 flex items-center gap-1.5 text-[11px] text-amber-600 bg-amber-500/10 border-t border-amber-500/20">
          <AlertTriangle className="h-3 w-3 shrink-0" />
          {rateHint}
        </div>
      )}
      <div className="px-3 py-2 border-t border-border bg-muted/20">
        {showAudioRecorder ? (
          <AudioRecorder
            onSent={handleAudioSent}
            onCancel={() => setShowAudioRecorder(false)}
            contextType="chat"
            contextId={activeContact?.id}
            targetUserId={activeContact?.id}
          />
        ) : (
          <div className="flex items-end gap-2">
            <button
              onClick={() => setShowAudioRecorder(true)}
              disabled={isCurrentlyMuted}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-muted hover:bg-muted/80 text-muted-foreground hover:text-foreground disabled:opacity-40 transition-colors"
              title="Sprachnachricht"
            >
              <Mic className="h-4 w-4" />
            </button>
            <textarea
              ref={textareaRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={isCurrentlyMuted ? 'Chat eingeschränkt…' : 'Nachricht schreiben…'}
              rows={1}
              disabled={isCurrentlyMuted}
              className="flex-1 resize-none rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring max-h-20 disabled:opacity-50 disabled:cursor-not-allowed"
            />
            <button
              onClick={handleSend}
              disabled={!text.trim() || sending || isCurrentlyMuted}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-40 transition-opacity"
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>
    </>
  );
}
