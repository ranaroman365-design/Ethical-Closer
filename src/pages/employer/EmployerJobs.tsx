import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useEmployerAccess } from '@/hooks/useEmployerAccess';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Plus, Trash2 } from 'lucide-react';

interface Job {
  id: string;
  title: string;
  description: string | null;
  requirements: string | null;
  active: boolean;
  created_at: string;
}

export default function EmployerJobs() {
  const { companyId } = useEmployerAccess();
  const { toast } = useToast();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ title: '', description: '', requirements: '' });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!companyId) return;
    supabase.from('employer_jobs').select('*').eq('company_id', companyId).order('created_at', { ascending: false })
      .then(({ data }) => { setJobs((data ?? []) as Job[]); setLoading(false); });
  }, [companyId]);

  async function create() {
    if (!companyId || !form.title.trim()) return;
    setSaving(true);
    const { data, error } = await supabase.from('employer_jobs').insert({
      company_id: companyId,
      title: form.title.trim(),
      description: form.description.trim() || null,
      requirements: form.requirements.trim() || null,
    }).select().single();
    setSaving(false);
    if (!error && data) {
      setJobs(prev => [data as Job, ...prev]);
      setForm({ title: '', description: '', requirements: '' });
      setShowForm(false);
      toast({ title: 'Job listing created' });
    }
  }

  async function toggleActive(id: string, current: boolean) {
    await supabase.from('employer_jobs').update({ active: !current, updated_at: new Date().toISOString() }).eq('id', id);
    setJobs(prev => prev.map(j => j.id === id ? { ...j, active: !current } : j));
  }

  async function remove(id: string) {
    await supabase.from('employer_jobs').delete().eq('id', id);
    setJobs(prev => prev.filter(j => j.id !== id));
  }

  if (loading) return <div className="flex items-center justify-center py-20"><div className="h-6 w-6 animate-spin rounded-full border-2 border-muted-foreground border-t-primary" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-serif text-xl font-semibold text-foreground">Job Listings</h2>
          <p className="text-sm text-muted-foreground">{jobs.length} listings</p>
        </div>
        <Button size="sm" onClick={() => setShowForm(true)}><Plus className="mr-1 h-4 w-4" />New Listing</Button>
      </div>

      {jobs.length === 0 ? (
        <p className="text-center py-12 text-muted-foreground">No job listings yet.</p>
      ) : (
        <div className="space-y-3">
          {jobs.map(j => (
            <div key={j.id} className="rounded-xl border border-border/40 bg-card p-4 space-y-2">
              <div className="flex items-center justify-between">
                <p className="font-semibold text-foreground">{j.title}</p>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className={`text-[10px] cursor-pointer ${j.active ? 'border-emerald-500/30 text-emerald-600' : 'text-muted-foreground'}`} onClick={() => toggleActive(j.id, j.active)}>
                    {j.active ? 'Active' : 'Inactive'}
                  </Badge>
                  <Button size="sm" variant="ghost" onClick={() => remove(j.id)}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>
                </div>
              </div>
              {j.description && <p className="text-xs text-muted-foreground">{j.description}</p>}
            </div>
          ))}
        </div>
      )}

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent>
          <DialogHeader><DialogTitle>Create Job Listing</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Input placeholder="Job title" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
            <Textarea placeholder="Description" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={3} />
            <Textarea placeholder="Requirements" value={form.requirements} onChange={e => setForm(f => ({ ...f, requirements: e.target.value }))} rows={3} />
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
              <Button onClick={create} disabled={saving || !form.title.trim()}>Create</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
