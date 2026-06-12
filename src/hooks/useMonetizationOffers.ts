import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { useUserState, UserState } from './useUserState';

export interface MonetizationOffer {
  id: string;
  offer_key: string;
  title: string;
  subtitle: string | null;
  description: string | null;
  price_label: string | null;
  trigger_states: string[];
  min_level: number;
  max_level: number | null;
  icon: string;
  cta_label: string;
  cta_link: string;
  priority: number;
}

/**
 * Fetches monetization offers filtered by user state + level.
 * Respects spam prevention: same offer not shown twice within 24h window.
 */
export function useMonetizationOffers() {
  const { user } = useAuth();
  const { state, level } = useUserState();
  const [offers, setOffers] = useState<MonetizationOffer[]>([]);
  const [loading, setLoading] = useState(true);
  const [dismissedKeys, setDismissedKeys] = useState<Set<string>>(new Set());
  const [recentlyShown, setRecentlyShown] = useState<Set<string>>(new Set());

  useEffect(() => {
    // Load offers + recent trigger log
    Promise.all([
      supabase.from('monetization_offers' as any).select('*').eq('active', true).order('priority', { ascending: true }),
      user
        ? supabase.from('trigger_log' as any).select('offer_key').eq('user_id', user.id).gte('shown_at', new Date(Date.now() - 24 * 3600000).toISOString())
        : Promise.resolve({ data: [] }),
    ]).then(([offersRes, logRes]) => {
      setOffers((offersRes.data as any as MonetizationOffer[]) ?? []);
      const shown = new Set<string>();
      for (const l of (logRes.data as any[]) ?? []) {
        if (l.offer_key) shown.add(l.offer_key);
      }
      setRecentlyShown(shown);
      setLoading(false);
    });
  }, [user]);

  // Filter: state match + level match + not recently shown + not dismissed
  const relevantOffers = offers.filter(o => {
    if (dismissedKeys.has(o.offer_key)) return false;
    if (recentlyShown.has(o.offer_key)) return false;
    if (!o.trigger_states.includes(state)) return false;
    if (level < o.min_level) return false;
    if (o.max_level !== null && level > o.max_level) return false;
    return true;
  });

  const trackImpression = useCallback(async (offerId: string, action: 'shown' | 'clicked' | 'dismissed' | 'converted', context?: string) => {
    if (!user) return;
    // Dual write: offer_impressions (analytics) + trigger_log (spam prevention)
    const offer = offers.find(o => o.id === offerId);
    await Promise.all([
      supabase.from('offer_impressions' as any).insert({
        user_id: user.id, offer_id: offerId, action, context: context || 'dashboard',
      } as any),
      offer ? supabase.from('trigger_log' as any).insert({
        user_id: user.id, trigger_type: state, offer_key: offer.offer_key,
        accepted: action === 'clicked' || action === 'converted',
        context: context || 'dashboard',
      } as any) : Promise.resolve(),
    ]);
  }, [user, offers, state]);

  const dismiss = useCallback((offerKey: string) => {
    setDismissedKeys(prev => new Set(prev).add(offerKey));
  }, []);

  return {
    offers: relevantOffers,
    allOffers: offers,
    loading,
    trackImpression,
    dismiss,
    userState: state,
    userLevel: level,
  };
}
