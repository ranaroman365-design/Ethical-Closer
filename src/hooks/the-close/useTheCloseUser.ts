import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuthContext } from '@/contexts/AuthContext';
import type { TheCloseUserType, TierKey, RoleKey } from '@/types/the-close';
import { TIER_RANK } from '@/types/the-close';

export function useTheCloseUser() {
  const { user, isLoading: authLoading } = useAuthContext();
  const [userType, setUserType] = useState<TheCloseUserType | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchUserType = useCallback(async (userId: string) => {
    const { data } = await supabase
      .from('the_close_user_types')
      .select('*')
      .eq('user_id', userId)
      .limit(1)
      .maybeSingle();
    setUserType(data as TheCloseUserType | null);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setUserType(null);
      setLoading(false);
      return;
    }
    fetchUserType(user.id);
  }, [user?.id, authLoading, fetchUserType]);

  const tier: TierKey = userType?.subscription_tier ?? 'bronze';
  const tierRank = TIER_RANK[tier];
  const role: RoleKey | null = userType?.role ?? null;

  return {
    user,
    userType,
    tier,
    tierRank,
    role,
    isCloser: role === 'closer',
    isPartner: role === 'partner',
    isAuthenticated: !!user,
    isBlack: tier === 'black',
    loading: loading || authLoading,
    hasAccess: (minTier: TierKey) => tierRank >= TIER_RANK[minTier],
    refetch: () => user ? fetchUserType(user.id) : Promise.resolve(),
  };
}
