import { useState, useMemo } from 'react';
import { Search, ArrowLeft, Info, User, MessageSquare, Filter, ChevronDown, ChevronRight } from 'lucide-react';
import type { ChatContact, DirectMessage } from '@/hooks/useDirectMessages';
import ChatThread from './ChatThread';
import { formatDistanceToNow } from 'date-fns';
import { de } from 'date-fns/locale';

interface Props {
  contacts: ChatContact[];
  messages: DirectMessage[];
  activeContactId: string | null;
  setActiveContactId: (id: string | null) => void;
  sendMessage: (content: string) => Promise<void>;
  unreadCount: number;
  loadingContacts: boolean;
  isAdmin?: boolean;
  chatFilter?: string | null;
  setChatFilter?: (f: string | null) => void;
  isMuted?: boolean;
  mutedUntil?: string | null;
  threads?: any[];
  hasMoreMessages?: boolean;
  loadMoreMessages?: () => void;
  loadingMoreMessages?: boolean;
  myLevel?: number;
}

const SEGMENT_FILTERS = [
  { key: 'all', label: 'Alle', icon: Filter },
  { key: 'active_chats', label: 'Aktive Chats', icon: MessageSquare },
  { key: 'my_level', label: 'Mein Level', icon: User },
];

const STAGE_LABELS: Record<string, string> = {
  prospect: 'Bewerber', applicant: 'Bewerber', opener: 'Trainee', trainee: 'Trainee',
  setter: 'Setter', associate_setter: 'Setter', associate: 'Setter',
  senior_associate: 'Sr. Setter', senior_setter: 'Sr. Setter',
  junior_manager: 'Jr. Closer', manager: 'Closer', senior_manager: 'Sr. Closer',
  director: 'Director', partner: 'Partner',
};

const LEVEL_BADGE_COLORS: Record<number, string> = {
  0: 'bg-muted-foreground/20 text-muted-foreground',
  1: 'bg-blue-500/15 text-blue-600', 2: 'bg-emerald-500/15 text-emerald-600',
  3: 'bg-emerald-600/15 text-emerald-700', 4: 'bg-amber-500/15 text-amber-600',
  5: 'bg-orange-500/15 text-orange-600', 6: 'bg-red-500/15 text-red-600',
  7: 'bg-purple-500/15 text-purple-600', 8: 'bg-primary/15 text-primary',
};

const LEVEL_GROUPS = [
  { key: 'opener', label: 'L1 — Opener', levels: [0, 1] },
  { key: 'setter', label: 'L2–L3 — Setter Team', levels: [2, 3] },
  { key: 'closer', label: 'L4–L7 — Closer Team', levels: [4, 5, 6, 7] },
  { key: 'partner', label: 'L8 — Partner / Inner Circle', levels: [8] },
];

export default function ChatPanel({
  contacts, messages, activeContactId, setActiveContactId,
  sendMessage, loadingContacts, isAdmin,
  isMuted, mutedUntil, threads, hasMoreMessages, loadMoreMessages, loadingMoreMessages,
  myLevel: myLevelProp,
}: Props) {
  const [search, setSearch] = useState('');
  const [segment, setSegment] = useState<string>('all');
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

  const myLevel = myLevelProp ?? 0;

  const toggleGroup = (key: string) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  // Segment filtering
  const segmented = useMemo(() => {
    if (segment === 'active_chats') {
      return contacts.filter((c) => c.thread_open || c.last_message_at);
    }
    if (segment === 'my_level') {
      return contacts.filter((c) => Math.abs(c.level - myLevel) <= 1);
    }
    return contacts;
  }, [contacts, segment, myLevel]);

  // Search across all users
  const filtered = useMemo(() => {
    if (!search.trim()) return segmented;
    const q = search.toLowerCase();
    return segmented.filter((c) => {
      const roleLabel = STAGE_LABELS[c.business_stage]?.toLowerCase() || '';
      return (
        c.full_name.toLowerCase().includes(q) ||
        (c.email && c.email.toLowerCase().includes(q)) ||
        c.business_stage.toLowerCase().includes(q) ||
        roleLabel.includes(q)
      );
    });
  }, [segmented, search]);

  // Group contacts by level
  const groupedContacts = useMemo(() => {
    return LEVEL_GROUPS.map(g => ({
      ...g,
      contacts: filtered.filter(c => g.levels.includes(c.level)),
    })).filter(g => g.contacts.length > 0);
  }, [filtered]);

  const activeContact = contacts.find((c) => c.id === activeContactId);

  const senderProfiles = useMemo(() => {
    const map = new Map<string, { full_name: string; avatar_url: string | null; business_stage: string }>();
    contacts.forEach((c) => {
      map.set(c.id, { full_name: c.full_name, avatar_url: c.avatar_url, business_stage: c.business_stage });
    });
    return map;
  }, [contacts]);

  // Thread view
  if (activeContactId && activeContact) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border bg-muted/30">
          <button onClick={() => setActiveContactId(null)} className="p-1 rounded hover:bg-muted transition-colors text-muted-foreground">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <div className="relative shrink-0">
              {activeContact.avatar_url ? (
                <img src={activeContact.avatar_url} alt={activeContact.full_name} className="h-7 w-7 rounded-full object-cover" />
              ) : (
                <div className="h-7 w-7 rounded-full bg-primary/20 flex items-center justify-center text-xs font-semibold text-primary">
                  {activeContact.full_name.charAt(0).toUpperCase()}
                </div>
              )}
              <span className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-card ${activeContact.is_online ? 'bg-emerald-500' : 'bg-muted-foreground/30'}`} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <p className="text-sm font-medium text-foreground truncate">{activeContact.full_name}</p>
                <span className={`text-[9px] font-medium px-1.5 py-0.5 rounded-full ${LEVEL_BADGE_COLORS[activeContact.level] || LEVEL_BADGE_COLORS[0]}`}>
                  L{activeContact.level}
                </span>
              </div>
              <p className="text-[10px] text-muted-foreground">
                {activeContact.is_online
                  ? `${STAGE_LABELS[activeContact.business_stage] || activeContact.business_stage} · Online`
                  : activeContact.last_active
                  ? `${STAGE_LABELS[activeContact.business_stage] || activeContact.business_stage} · ${formatDistanceToNow(new Date(activeContact.last_active), { addSuffix: true, locale: de })}`
                  : STAGE_LABELS[activeContact.business_stage] || activeContact.business_stage}
              </p>
            </div>
          </div>
        </div>

        <ChatThread
          messages={messages}
          sendMessage={sendMessage}
          activeContactId={activeContactId}
          activeContact={activeContact}
          senderProfiles={senderProfiles}
          isMuted={isMuted}
          mutedUntil={mutedUntil}
          hasMoreMessages={hasMoreMessages}
          loadMoreMessages={loadMoreMessages}
          loadingMoreMessages={loadingMoreMessages}
        />
      </div>
    );
  }

  // Contact list view with level grouping
  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-2.5 border-b border-border bg-muted/30">
        <h3 className="text-sm font-semibold text-foreground mb-2">Nachrichten</h3>
        <div className="flex gap-1 mb-2">
          {SEGMENT_FILTERS.map((sf) => {
            const Icon = sf.icon;
            return (
              <button
                key={sf.key}
                onClick={() => setSegment(sf.key)}
                className={`flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-medium transition-colors ${
                  segment === sf.key
                    ? 'bg-primary/10 text-primary border border-primary/20'
                    : 'text-muted-foreground hover:text-foreground border border-transparent'
                }`}
              >
                <Icon className="h-3 w-3" />
                {sf.label}
              </button>
            );
          })}
        </div>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            type="text"
            placeholder="Name, Email oder Rolle suchen…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-md border border-border bg-background py-1.5 pl-8 pr-3 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {loadingContacts ? (
          <div className="flex items-center justify-center h-32 text-xs text-muted-foreground">Laden…</div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 px-4 text-center gap-2">
            <Info className="h-4 w-4 text-muted-foreground" />
            <p className="text-xs text-muted-foreground leading-relaxed">
              {search.trim()
                ? 'Keine Treffer gefunden.'
                : segment === 'active_chats'
                ? 'Noch keine aktiven Chats. Starte eine Unterhaltung über „Alle".'
                : 'Noch keine Mitglieder verfügbar.'}
            </p>
          </div>
        ) : (
          groupedContacts.map((group) => (
            <div key={group.key}>
              <button
                onClick={() => toggleGroup(group.key)}
                className="flex items-center gap-1.5 w-full px-3 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider bg-muted/20 hover:bg-muted/40 transition-colors border-b border-border/30"
              >
                {collapsedGroups.has(group.key)
                  ? <ChevronRight className="h-3 w-3" />
                  : <ChevronDown className="h-3 w-3" />}
                {group.label}
                <span className="ml-auto text-[9px] font-normal normal-case">{group.contacts.length}</span>
              </button>
              {!collapsedGroups.has(group.key) && group.contacts.map((contact) => (
                <button
                  key={contact.id}
                  onClick={() => setActiveContactId(contact.id)}
                  className="flex items-center gap-2.5 w-full px-3 py-2.5 hover:bg-muted/50 transition-colors text-left border-b border-border/50 last:border-0"
                >
                  <div className="relative shrink-0">
                    {contact.avatar_url ? (
                      <img src={contact.avatar_url} alt={contact.full_name} className="h-9 w-9 rounded-full object-cover" />
                    ) : (
                      <div className="h-9 w-9 rounded-full bg-primary/20 flex items-center justify-center text-xs font-semibold text-primary">
                        {contact.full_name.charAt(0).toUpperCase()}
                      </div>
                    )}
                    <span className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-card ${contact.is_online ? 'bg-emerald-500' : 'bg-muted-foreground/30'}`} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <p className="text-sm font-medium truncate text-foreground">{contact.full_name}</p>
                      <span className={`text-[9px] font-medium px-1.5 py-0.5 rounded-full shrink-0 ${LEVEL_BADGE_COLORS[contact.level] || LEVEL_BADGE_COLORS[0]}`}>
                        L{contact.level}
                      </span>
                      {contact.unread_count > 0 && (
                        <span className="ml-auto flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[9px] font-bold text-primary-foreground shrink-0">
                          {contact.unread_count > 9 ? '9+' : contact.unread_count}
                        </span>
                      )}
                    </div>
                    {contact.last_message_content ? (
                      <p className={`text-[11px] truncate mt-0.5 ${contact.unread_count > 0 ? 'text-foreground font-medium' : 'text-muted-foreground'}`}>
                        {contact.last_message_content.length > 50
                          ? contact.last_message_content.slice(0, 50) + '…'
                          : contact.last_message_content}
                      </p>
                    ) : (
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        {STAGE_LABELS[contact.business_stage] || contact.business_stage}
                      </p>
                    )}
                    <div className="flex items-center gap-1 mt-0.5">
                      <span className="text-[9px] text-muted-foreground">
                        {STAGE_LABELS[contact.business_stage] || contact.business_stage}
                      </span>
                      {contact.last_message_at && (
                        <>
                          <span className="text-[9px] text-muted-foreground">·</span>
                          <span className="text-[9px] text-muted-foreground">
                            {formatDistanceToNow(new Date(contact.last_message_at), { addSuffix: true, locale: de })}
                          </span>
                        </>
                      )}
                      {contact.is_online && (
                        <>
                          <span className="text-[9px] text-muted-foreground">·</span>
                          <span className="text-[9px] text-emerald-600 font-medium">Online</span>
                        </>
                      )}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
