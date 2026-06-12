import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { useLanguage } from '@/i18n/LanguageContext';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { Plus, Package, Users } from 'lucide-react';

interface Offer {
  id: string;
  offer_name: string;
  price_range: string;
  target_audience: string;
  lead_quality: string;
  required_level: string;
  min_awareness_score: number;
  max_pressure_index: number;
  closers_assigned: number;
  status: string;
}

export default function DirectorOffers() {
  const { user } = useAuth();
  const { lang } = useLanguage();
  const t = (de: string, en: string) => lang === 'de' ? de : en;

  const [offers, setOffers] = useState<Offer[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    offer_name: '',
    price_range: '',
    target_audience: '',
    lead_quality: 'mid',
    required_level: 'junior_manager',
    min_awareness_score: 70,
    max_pressure_index: 30,
  });

  const fetchOffers = async () => {
    if (!user) return;
    const { data } = await supabase
      .from('director_offers')
      .select('*')
      .eq('director_id', user.id)
      .order('created_at', { ascending: false });
    setOffers((data as any) ?? []);
    setLoading(false);
  };

  useEffect(() => { fetchOffers(); }, [user]);

  const handleCreate = async () => {
    if (!user || !form.offer_name.trim()) return;
    setSaving(true);
    await supabase.from('director_offers').insert({
      director_id: user.id,
      ...form,
    } as any);
    toast.success(t('Angebot erstellt', 'Offer created'));
    setShowForm(false);
    setForm({ offer_name: '', price_range: '', target_audience: '', lead_quality: 'mid', required_level: 'junior_manager', min_awareness_score: 70, max_pressure_index: 30 });
    setSaving(false);
    fetchOffers();
  };

  const LEVEL_LABELS: Record<string, string> = {
    junior_manager: 'L4 Closer (Placement Track)',
    manager: 'L5 Managing Closer',
    senior_manager: 'L6 Senior Closer',
  };

  if (loading) return <Skeleton className="h-48" />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-foreground">{t('Ihre Angebote', 'Your Offers')}</h2>
        <Button size="sm" onClick={() => setShowForm(!showForm)}>
          <Plus className="mr-1.5 h-4 w-4" />
          {t('Neues Angebot', 'New Offer')}
        </Button>
      </div>

      {showForm && (
        <div className="rounded-lg border border-border bg-card p-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">{t('Angebotsname', 'Offer Name')} *</label>
              <Input value={form.offer_name} onChange={e => setForm(p => ({ ...p, offer_name: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">{t('Preisbereich', 'Price Range')}</label>
              <Input value={form.price_range} onChange={e => setForm(p => ({ ...p, price_range: e.target.value }))} placeholder="z.B. 3k–10k" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">{t('Zielgruppe', 'Target Audience')}</label>
              <Input value={form.target_audience} onChange={e => setForm(p => ({ ...p, target_audience: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">{t('Lead-Qualität', 'Lead Quality')}</label>
              <select
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={form.lead_quality}
                onChange={e => setForm(p => ({ ...p, lead_quality: e.target.value }))}
              >
                <option value="low">Low</option>
                <option value="mid">Mid</option>
                <option value="high">High</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Min Awareness Score</label>
              <Input type="number" value={form.min_awareness_score} onChange={e => setForm(p => ({ ...p, min_awareness_score: +e.target.value }))} />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Max Pressure Index</label>
              <Input type="number" value={form.max_pressure_index} onChange={e => setForm(p => ({ ...p, max_pressure_index: +e.target.value }))} />
            </div>
          </div>
          <div className="flex gap-3">
            <Button variant="outline" size="sm" onClick={() => setShowForm(false)}>{t('Abbrechen', 'Cancel')}</Button>
            <Button size="sm" onClick={handleCreate} disabled={saving}>{t('Erstellen', 'Create')}</Button>
          </div>
        </div>
      )}

      {offers.length === 0 && !showForm && (
        <div className="rounded-lg border border-dashed border-border p-10 text-center">
          <Package className="mx-auto mb-3 h-8 w-8 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">{t('Noch keine Angebote erstellt.', 'No offers created yet.')}</p>
        </div>
      )}

      <div className="grid gap-4">
        {offers.map(offer => (
          <div key={offer.id} className="rounded-lg border border-border bg-card p-5">
            <div className="flex items-start justify-between mb-3">
              <div>
                <h3 className="font-semibold text-foreground">{offer.offer_name}</h3>
                <p className="text-xs text-muted-foreground mt-0.5">{offer.target_audience || '—'}</p>
              </div>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                offer.status === 'active' ? 'bg-emerald-500/10 text-emerald-600' : 'bg-muted text-muted-foreground'
              }`}>
                {offer.status}
              </span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div>
                <span className="text-muted-foreground">{t('Preis', 'Price')}</span>
                <p className="font-medium text-foreground">{offer.price_range || '—'}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Lead Quality</span>
                <p className="font-medium text-foreground capitalize">{offer.lead_quality}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Min Level</span>
                <p className="font-medium text-foreground">{LEVEL_LABELS[offer.required_level] || offer.required_level}</p>
              </div>
              <div>
                <span className="text-muted-foreground flex items-center gap-1"><Users className="h-3 w-3" /> Closer</span>
                <p className="font-medium text-foreground">{offer.closers_assigned}</p>
              </div>
            </div>
            <div className="mt-3 flex gap-4 text-[11px] text-muted-foreground/70">
              <span>Awareness ≥ {offer.min_awareness_score}%</span>
              <span>Pressure ≤ {offer.max_pressure_index}%</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
