import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

export interface Trainer {
  id: string;
  name: string;
  bio: string;
  profile_image: string | null;
  specialties: string[];
  levels_supported: number[];
  formats: string[];
  languages: string[];
  primary_focus: string | null;
  secondary_focus: string | null;
  intensity_level: string;
  coaching_style: string;
  pricing_intro_call: number;
  pricing_packages: any[];
  is_featured: boolean;
}

export interface TrainerMatch {
  id: string;
  trainer_id: string;
  score: number;
  reason: string;
  trainer?: Trainer;
}

export function useTrainers() {
  const [trainers, setTrainers] = useState<Trainer[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from('trainers' as any)
      .select('*')
      .eq('is_approved', true)
      .order('is_featured', { ascending: false })
      .then(({ data }) => {
        setTrainers((data as any[] || []).map(t => ({
          id: t.id,
          name: t.name,
          bio: t.bio,
          profile_image: t.profile_image,
          specialties: t.specialties || [],
          levels_supported: t.levels_supported || [],
          formats: t.formats || [],
          languages: t.languages || [],
          primary_focus: t.primary_focus,
          secondary_focus: t.secondary_focus,
          intensity_level: t.intensity_level,
          coaching_style: t.coaching_style,
          pricing_intro_call: t.pricing_intro_call || 0,
          pricing_packages: t.pricing_packages || [],
          is_featured: t.is_featured,
        })));
        setLoading(false);
      });
  }, []);

  return { trainers, loading };
}

export function useTrainerMatches() {
  const { user } = useAuth();
  const [matches, setMatches] = useState<TrainerMatch[]>([]);
  const [loading, setLoading] = useState(true);

  const generateMatches = async () => {
    if (!user) return;
    await supabase.rpc('generate_trainer_matches' as any, { p_user_id: user.id });
    await loadMatches();
  };

  const loadMatches = async () => {
    if (!user) return;
    const { data } = await supabase
      .from('trainer_matches' as any)
      .select('*, trainer:trainers(*)')
      .eq('user_id', user.id)
      .order('score', { ascending: false })
      .limit(3);

    setMatches((data as any[] || []).map(m => ({
      id: m.id,
      trainer_id: m.trainer_id,
      score: m.score,
      reason: m.reason,
      trainer: m.trainer ? {
        id: m.trainer.id,
        name: m.trainer.name,
        bio: m.trainer.bio,
        profile_image: m.trainer.profile_image,
        specialties: m.trainer.specialties || [],
        levels_supported: m.trainer.levels_supported || [],
        formats: m.trainer.formats || [],
        languages: m.trainer.languages || [],
        primary_focus: m.trainer.primary_focus,
        secondary_focus: m.trainer.secondary_focus,
        intensity_level: m.trainer.intensity_level,
        coaching_style: m.trainer.coaching_style,
        pricing_intro_call: m.trainer.pricing_intro_call || 0,
        pricing_packages: m.trainer.pricing_packages || [],
        is_featured: m.trainer.is_featured,
      } : undefined,
    })));
    setLoading(false);
  };

  useEffect(() => {
    if (user) generateMatches();
  }, [user?.id]);

  return { matches, loading, refresh: generateMatches };
}

export function useTrainerRequest() {
  const { user } = useAuth();

  const sendRequest = async (trainerId: string, message: string) => {
    if (!user) return { error: 'Not authenticated' };
    const { error } = await supabase
      .from('trainer_requests' as any)
      .insert({ user_id: user.id, trainer_id: trainerId, message } as any);
    return { error: error?.message || null };
  };

  return { sendRequest };
}
