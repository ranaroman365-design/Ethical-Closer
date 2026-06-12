import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export interface PhaseData {
  id: number;
  name: string;
  description: string | null;
  sort_order: number;
}

export interface ModuleData {
  id: string;
  phase_id: number;
  title: string;
  description: string | null;
  sort_order: number;
  video_url: string | null;
  worksheet_url: string | null;
}

export interface ProgressData {
  module_id: string;
  completed: boolean;
  notes: string | null;
}

export function useAcademyData() {
  const { user } = useAuth();
  const [phases, setPhases] = useState<PhaseData[]>([]);
  const [modules, setModules] = useState<ModuleData[]>([]);
  const [progress, setProgress] = useState<ProgressData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;

    async function load() {
      const [phasesRes, modulesRes, progressRes] = await Promise.all([
        supabase.from('phases').select('*').order('sort_order'),
        supabase.from('modules').select('*').order('phase_id').order('sort_order'),
        supabase.from('member_progress').select('module_id, completed, notes').eq('user_id', user!.id),
      ]);

      setPhases((phasesRes.data as PhaseData[]) ?? []);
      setModules((modulesRes.data as ModuleData[]) ?? []);
      setProgress((progressRes.data as ProgressData[]) ?? []);
      setLoading(false);
    }

    load();
  }, [user]);

  const isModuleCompleted = (moduleId: string) =>
    progress.some(p => p.module_id === moduleId && p.completed);

  const getModulesForPhase = (phaseId: number) =>
    modules.filter(m => m.phase_id === phaseId).sort((a, b) => a.sort_order - b.sort_order);

  const totalModules = modules.length;
  const completedModules = progress.filter(p => p.completed).length;
  const overallProgress = totalModules > 0 ? Math.round((completedModules / totalModules) * 100) : 0;

  const toggleModuleComplete = async (moduleId: string) => {
    if (!user) return;
    const existing = progress.find(p => p.module_id === moduleId);

    if (existing) {
      const newCompleted = !existing.completed;
      await supabase
        .from('member_progress')
        .update({
          completed: newCompleted,
          completed_at: newCompleted ? new Date().toISOString() : null,
        })
        .eq('user_id', user.id)
        .eq('module_id', moduleId);

      setProgress(prev =>
        prev.map(p => p.module_id === moduleId ? { ...p, completed: newCompleted } : p)
      );
    } else {
      await supabase.from('member_progress').insert({
        user_id: user.id,
        module_id: moduleId,
        completed: true,
        completed_at: new Date().toISOString(),
      });

      setProgress(prev => [...prev, { module_id: moduleId, completed: true, notes: null }]);
    }
  };

  const saveNotes = async (moduleId: string, notes: string) => {
    if (!user) return;
    const existing = progress.find(p => p.module_id === moduleId);

    if (existing) {
      await supabase
        .from('member_progress')
        .update({ notes })
        .eq('user_id', user.id)
        .eq('module_id', moduleId);
      setProgress(prev =>
        prev.map(p => p.module_id === moduleId ? { ...p, notes } : p)
      );
    } else {
      await supabase.from('member_progress').insert({
        user_id: user.id,
        module_id: moduleId,
        completed: false,
        notes,
      });
      setProgress(prev => [...prev, { module_id: moduleId, completed: false, notes }]);
    }
  };

  // Determine current phase based on profile
  const getCurrentPhase = (profilePhase: number) => profilePhase;

  return {
    phases,
    modules,
    progress,
    loading,
    isModuleCompleted,
    getModulesForPhase,
    totalModules,
    completedModules,
    overallProgress,
    toggleModuleComplete,
    saveNotes,
    getCurrentPhase,
  };
}
