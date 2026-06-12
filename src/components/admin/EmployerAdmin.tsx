import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Building2, UserPlus, Shield, Power } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

interface Company {
  id: string;
  name: string;
  verified: boolean;
  active: boolean;
  contact_email: string | null;
  created_at: string;
}

export default function EmployerAdmin() {
  const { toast } = useToast();
  const [masterSwitch, setMasterSwitch] = useState(false);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [saving, setSaving] = useState(false);
  const [linkForm, setLinkForm] = useState<{ companyId: string; email: string } | null>(null);
  const [linking, setLinking] = useState(false);

  useEffect(() => {
    async function load() {
      const [settingRes, compRes] = await Promise.all([
        supabase.from('system_settings').select('setting_value').eq('setting_key', 'employer_dashboard_enabled').maybeSingle(),
        supabase.from('companies').select('*').order('created_at', { ascending: false }),
      ]);
      setMasterSwitch(settingRes.data?.setting_value === true);
      setCompanies((compRes.data ?? []) as Company[]);
      setLoading(false);
    }
    load();
  }, []);

  async function toggleMaster(val: boolean) {
    await supabase.from('system_settings').update({ setting_value: val, updated_at: new Date().toISOString() }).eq('setting_key', 'employer_dashboard_enabled');
    setMasterSwitch(val);
    toast({ title: val ? 'Employer Dashboard aktiviert' : 'Employer Dashboard deaktiviert' });
  }

  async function createCompany() {
    if (!newName.trim()) return;
    setSaving(true);
    const { data, error } = await supabase.from('companies').insert({ name: newName.trim(), contact_email: newEmail.trim() || null }).select().single();
    setSaving(false);
    if (!error && data) {
      setCompanies(prev => [data as Company, ...prev]);
      setNewName(''); setNewEmail(''); setShowCreate(false);
      toast({ title: 'Company erstellt' });
    }
  }

  async function toggleCompanyField(id: string, field: 'verified' | 'active', current: boolean) {
    await supabase.from('companies').update({ [field]: !current, updated_at: new Date().toISOString() } as any).eq('id', id);
    setCompanies(prev => prev.map(c => c.id === id ? { ...c, [field]: !current } : c));
  }

  async function linkUser() {
    if (!linkForm) return;
    setLinking(true);
    const { data: profileRes } = await supabase.from('profiles').select('id').eq('email', linkForm.email).maybeSingle();
    if (!profileRes) {
      toast({ title: 'User nicht gefunden', variant: 'destructive' });
      setLinking(false);
      return;
    }
    const { error } = await supabase.from('company_users').insert({ company_id: linkForm.companyId, user_id: profileRes.id });
    setLinking(false);
    if (!error) {
      toast({ title: 'User verknüpft' });
      setLinkForm(null);
    } else {
      toast({ title: 'Fehler', description: error.message, variant: 'destructive' });
    }
  }

  if (loading) return <p className="text-sm text-muted-foreground p-4">Laden...</p>;

  return (
    <div className="space-y-8">
      {/* Master Switch */}
      <div className="rounded-xl border border-border/40 bg-card p-5 space-y-4">
        <div className="flex items-center gap-3">
          <Power className="h-5 w-5 text-primary" />
          <h3 className="font-semibold text-foreground">Employer Dashboard Control</h3>
        </div>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-foreground">Employer Dashboard Enabled</p>
            <p className="text-xs text-muted-foreground">When disabled, the entire employer system is hidden for all company users.</p>
          </div>
          <Switch checked={masterSwitch} onCheckedChange={toggleMaster} />
        </div>
        {!masterSwitch && (
          <p className="text-[11px] text-amber-600 bg-amber-500/10 rounded-lg px-3 py-2">
            ⚠️ This affects all company access immediately.
          </p>
        )}
      </div>

      {/* Company Management */}
      <div className="rounded-xl border border-border/40 bg-card p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Building2 className="h-5 w-5 text-primary" />
            <h3 className="font-semibold text-foreground">Companies</h3>
          </div>
          <Button size="sm" onClick={() => setShowCreate(true)}>+ Neue Company</Button>
        </div>

        {companies.length === 0 ? (
          <p className="text-sm text-muted-foreground">Keine Companies erstellt.</p>
        ) : (
          <div className="space-y-3">
            {companies.map(c => (
              <div key={c.id} className="flex items-center justify-between rounded-lg border border-border/30 p-3">
                <div>
                  <p className="font-medium text-sm text-foreground">{c.name}</p>
                  {c.contact_email && <p className="text-xs text-muted-foreground">{c.contact_email}</p>}
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] text-muted-foreground">Verified</span>
                    <Switch checked={c.verified} onCheckedChange={() => toggleCompanyField(c.id, 'verified', c.verified)} />
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] text-muted-foreground">Active</span>
                    <Switch checked={c.active} onCheckedChange={() => toggleCompanyField(c.id, 'active', c.active)} />
                  </div>
                  <Button size="sm" variant="outline" className="text-[10px]" onClick={() => setLinkForm({ companyId: c.id, email: '' })}>
                    <UserPlus className="mr-1 h-3 w-3" />Link User
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create Company Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader><DialogTitle>Neue Company erstellen</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Input placeholder="Company Name" value={newName} onChange={e => setNewName(e.target.value)} />
            <Input placeholder="Kontakt-E-Mail (optional)" value={newEmail} onChange={e => setNewEmail(e.target.value)} />
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowCreate(false)}>Abbrechen</Button>
              <Button onClick={createCompany} disabled={saving || !newName.trim()}>Erstellen</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Link User Dialog */}
      <Dialog open={!!linkForm} onOpenChange={() => setLinkForm(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>User mit Company verknüpfen</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Input placeholder="User E-Mail" value={linkForm?.email || ''} onChange={e => setLinkForm(prev => prev ? { ...prev, email: e.target.value } : null)} />
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setLinkForm(null)}>Abbrechen</Button>
              <Button onClick={linkUser} disabled={linking || !linkForm?.email.trim()}>Verknüpfen</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
