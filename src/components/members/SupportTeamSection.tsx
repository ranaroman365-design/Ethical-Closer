import { useState, useEffect, useCallback } from 'react';
import { MessageSquare, Info, Headphones, TrendingUp, Shield, Users, Target, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  TrendingUp, MessageSquare, Info, Headphones, Shield, Users, Target, Zap,
};

const CTA_ROUTES: Record<string, string> = {
  chat: '/members/community',
  learn: '/members/academy',
  support: '/members/help',
};

interface SectionData {
  section_title: string;
  section_subtitle: string;
  is_enabled: boolean;
}

interface CardData {
  id: string;
  title: string;
  description: string;
  cta_label: string;
  cta_action: string;
  icon_name: string;
  sort_order: number;
  is_enabled: boolean;
}

interface MemberData {
  id: string;
  name: string;
  role: string;
  initials: string;
  sort_order: number;
  is_enabled: boolean;
}

export default function SupportTeamSection() {
  const navigate = useNavigate();
  const [section, setSection] = useState<SectionData | null>(null);
  const [cards, setCards] = useState<CardData[]>([]);
  const [members, setMembers] = useState<MemberData[]>([]);
  const [loaded, setLoaded] = useState(false);

  const fetchData = useCallback(async () => {
    const [secRes, cardsRes, membersRes] = await Promise.all([
      supabase.from('support_team_section').select('section_title, section_subtitle, is_enabled').limit(1).single(),
      supabase.from('support_team_cards').select('*').eq('is_enabled', true).order('sort_order'),
      supabase.from('support_team_members').select('*').eq('is_enabled', true).order('sort_order'),
    ]);
    if (secRes.data) setSection(secRes.data as any);
    setCards((cardsRes.data as any[]) ?? []);
    setMembers((membersRes.data as any[]) ?? []);
    setLoaded(true);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleCta = (action: string) => {
    const route = CTA_ROUTES[action];
    if (route) navigate(route);
  };

  // Don't render if not loaded yet, section disabled, or no data
  if (!loaded) return null;
  if (!section || !section.is_enabled) return null;

  const enabledCards = cards.filter(c => c.is_enabled);

  return (
    <section className="rounded-2xl border border-border/40 bg-[hsl(var(--surface-sunken))] p-6 md:p-10">
      {/* Header */}
      <div className="mb-8">
        <h2 className="font-serif text-xl md:text-2xl font-semibold tracking-tight text-foreground">
          {section.section_title}
        </h2>
        <p className="mt-2 text-sm text-muted-foreground max-w-2xl leading-relaxed">
          {section.section_subtitle}
        </p>
      </div>

      {/* Role Cards */}
      {enabledCards.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2">
          {enabledCards.map((card) => {
            const IconComp = ICON_MAP[card.icon_name] || Info;
            return (
              <div
                key={card.id}
                className="rounded-xl border border-border/30 bg-card p-5 flex flex-col justify-between shadow-[0_1px_3px_hsl(var(--foreground)/0.04)]"
              >
                <div>
                  <div className="flex items-center gap-2.5 mb-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/8">
                      <IconComp className="h-4 w-4 text-primary" />
                    </div>
                    <h3 className="text-sm font-semibold text-foreground">{card.title}</h3>
                  </div>
                  <p className="text-[13px] text-muted-foreground leading-relaxed mb-4">
                    {card.description}
                  </p>
                </div>
                {card.cta_action !== 'none' && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="self-start text-xs h-8"
                    onClick={() => handleCta(card.cta_action)}
                  >
                    {card.cta_label}
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Real People Row */}
      {members.length > 0 && (
        <div className="mt-8 pt-6 border-t border-border/30">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-3">
            Dein Begleit-Team
          </p>
          <div className="flex flex-wrap gap-4">
            {members.map((member) => (
              <div key={member.id} className="flex items-center gap-2.5">
                <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center text-[11px] font-semibold text-muted-foreground">
                  {member.initials}
                </div>
                <div>
                  <p className="text-xs font-medium text-foreground leading-tight">{member.name}</p>
                  <p className="text-[10px] text-muted-foreground">{member.role}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
