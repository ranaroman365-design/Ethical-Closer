import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

interface Task {
  id: string;
  lead_id: string;
  task_type: 'day2_call' | 'day4_call';
  scheduled_for: string;
  status: string;
}

/**
 * GAP 6 — Tag-2 / Tag-4 Call-Tasks für den aktuellen Setter.
 * Additiv im Setter-Workspace. Done → status='done'.
 */
export function SetterCallTaskList() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    const { data } = await supabase
      .from('setter_call_tasks' as any)
      .select('*')
      .eq('status', 'open')
      .order('scheduled_for', { ascending: true })
      .limit(50);
    setTasks((data as any[]) ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const mark = async (id: string, status: 'done' | 'skipped') => {
    await supabase.from('setter_call_tasks' as any).update({
      status,
      completed_at: new Date().toISOString(),
    } as any).eq('id', id);
    load();
  };

  if (loading) return <div className="text-sm text-muted-foreground">Lade Tasks…</div>;
  if (!tasks.length) return <div className="text-sm text-muted-foreground">Keine offenen Day-2/Day-4 Tasks.</div>;

  return (
    <div className="space-y-2">
      <div className="text-sm font-medium">Day-2 / Day-4 Call Tasks</div>
      {tasks.map(t => (
        <div key={t.id} className="flex items-center justify-between rounded-xl border border-border bg-card p-3">
          <div className="flex items-center gap-3">
            <Badge variant={t.task_type === 'day2_call' ? 'default' : 'secondary'}>
              {t.task_type === 'day2_call' ? 'Tag 2' : 'Tag 4'}
            </Badge>
            <div className="text-xs text-muted-foreground">
              Lead {t.lead_id.slice(0, 8)} · fällig {new Date(t.scheduled_for).toLocaleString('de-DE')}
            </div>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => mark(t.id, 'skipped')}>Skip</Button>
            <Button size="sm" onClick={() => mark(t.id, 'done')}>Done</Button>
          </div>
        </div>
      ))}
    </div>
  );
}
