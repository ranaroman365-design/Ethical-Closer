import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useTheCloseUser } from '@/hooks/the-close/useTheCloseUser';
import { PartnerDashboardLayout } from '@/components/the-close/PartnerDashboardLayout';
import { toast } from 'sonner';

const ROLE_TYPES = ['closer', 'setter', 'sales_manager', 'other'];
const LOCATION_TYPES = ['remote', 'hybrid', 'onsite'];
const INDUSTRIES = ['Coaching', 'SaaS', 'Finance', 'Real Estate', 'Health', 'E-Commerce', 'Other'];
const LANGUAGES = ['Deutsch', 'Englisch', 'Spanisch', 'Französisch'];
const TIERS = [
  { value: 'bronze', label: 'Bronze (alle)' },
  { value: 'silver', label: 'Silver' },
  { value: 'gold', label: 'Gold' },
  { value: 'platinum', label: 'Platinum' },
];

export default function TheClosePartnerJobNew() {
  const navigate = useNavigate();
  const { user } = useTheCloseUser();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    title: '', role_type: 'closer', deal_size_min: '', deal_size_max: '',
    commission_type: '', commission_rate: '', industry: '', location_type: 'remote',
    location: '', languages: [] as string[], description: '', requirements: '',
    min_experience_years: 0, requires_etc_badge: false, min_tier: 'bronze',
  });

  const set = (k: string, v: string | number | boolean | string[]) => setForm(p => ({ ...p, [k]: v }));
  const toggleLang = (l: string) => set('languages', form.languages.includes(l) ? form.languages.filter(x => x !== l) : [...form.languages, l]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title) return;
    setSaving(true);
    const { data: pp } = await (supabase.from as Function)('tc_partner_profiles').select('id').eq('user_id', user?.id).single();
    if (!pp) { toast.error('Partner-Profil nicht gefunden.'); setSaving(false); return; }
    const { error } = await (supabase.from as Function)('tc_job_offers').insert({
      partner_id: pp.id, title: form.title, role_type: form.role_type,
      deal_size_min: form.deal_size_min ? Number(form.deal_size_min) : null,
      deal_size_max: form.deal_size_max ? Number(form.deal_size_max) : null,
      commission_type: form.commission_type || null, commission_rate: form.commission_rate || null,
      industry: form.industry || null, location_type: form.location_type,
      location: form.location || null, languages: form.languages,
      description: form.description || null, requirements: form.requirements || null,
      min_experience_years: form.min_experience_years, requires_etc_badge: form.requires_etc_badge,
      min_tier: form.min_tier, status: 'active',
    });
    setSaving(false);
    if (error) toast.error(error.message);
    else { toast.success('Angebot erstellt.'); navigate('/the-close/partner/jobs'); }
  };

  const inputStyle: React.CSSProperties = { width: '100%', padding: '10px 14px', fontFamily: "'DM Sans', sans-serif", fontSize: '13px', background: '#F7F2E9', border: '1px solid #D4C9A8', color: '#141410' };
  const lblStyle: React.CSSProperties = { display: 'block', marginBottom: 4, fontFamily: "'DM Sans', sans-serif", fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.14em', color: '#7A7568' };

  return (
    <PartnerDashboardLayout>
      <div className="max-w-[600px] mx-auto py-8 px-6">
        <p className="uppercase tracking-[0.14em] text-[9px] mb-6" style={{ fontFamily: 'DM Sans, sans-serif', color: '#7A7568' }}>Neues Angebot erstellen</p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div><label style={lblStyle}>Titel</label><input style={inputStyle} value={form.title} onChange={e => set('title', e.target.value)} required /></div>
          <div><label style={lblStyle}>Rolle</label><select style={inputStyle} value={form.role_type} onChange={e => set('role_type', e.target.value)}>{ROLE_TYPES.map(r => <option key={r} value={r}>{r}</option>)}</select></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label style={lblStyle}>Deal Min (€)</label><input type="number" style={inputStyle} value={form.deal_size_min} onChange={e => set('deal_size_min', e.target.value)} /></div>
            <div><label style={lblStyle}>Deal Max (€)</label><input type="number" style={inputStyle} value={form.deal_size_max} onChange={e => set('deal_size_max', e.target.value)} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label style={lblStyle}>Commission Typ</label><input style={inputStyle} value={form.commission_type} onChange={e => set('commission_type', e.target.value)} /></div>
            <div><label style={lblStyle}>Commission Rate</label><input style={inputStyle} value={form.commission_rate} onChange={e => set('commission_rate', e.target.value)} /></div>
          </div>
          <div><label style={lblStyle}>Branche</label><select style={inputStyle} value={form.industry} onChange={e => set('industry', e.target.value)}><option value="">—</option>{INDUSTRIES.map(i => <option key={i} value={i}>{i}</option>)}</select></div>
          <div><label style={lblStyle}>Arbeitsort</label><select style={inputStyle} value={form.location_type} onChange={e => set('location_type', e.target.value)}>{LOCATION_TYPES.map(l => <option key={l} value={l}>{l}</option>)}</select></div>
          {form.location_type !== 'remote' && <div><label style={lblStyle}>Standort</label><input style={inputStyle} value={form.location} onChange={e => set('location', e.target.value)} /></div>}
          <div>
            <label style={lblStyle}>Sprachen</label>
            <div className="flex flex-wrap gap-2">{LANGUAGES.map(l => (
              <button key={l} type="button" onClick={() => toggleLang(l)} className="cursor-pointer text-[11px] px-3 py-1.5"
                style={{ fontFamily: 'DM Sans, sans-serif', background: form.languages.includes(l) ? '#141410' : '#F7F2E9', color: form.languages.includes(l) ? '#F7F2E9' : '#3A3830', border: `1px solid ${form.languages.includes(l) ? '#141410' : '#D4C9A8'}` }}>{l}</button>
            ))}</div>
          </div>
          <div><label style={lblStyle}>Beschreibung</label><textarea style={{ ...inputStyle, minHeight: 100, resize: 'none' }} maxLength={1000} value={form.description} onChange={e => set('description', e.target.value)} /></div>
          <div><label style={lblStyle}>Anforderungen</label><textarea style={{ ...inputStyle, minHeight: 60, resize: 'none' }} maxLength={500} value={form.requirements} onChange={e => set('requirements', e.target.value)} /></div>
          <div><label style={lblStyle}>Min. Erfahrung (Jahre)</label><input type="number" min={0} style={inputStyle} value={form.min_experience_years} onChange={e => set('min_experience_years', parseInt(e.target.value) || 0)} /></div>
          <div className="flex items-center gap-2">
            <input type="checkbox" checked={form.requires_etc_badge} onChange={e => set('requires_etc_badge', e.target.checked)} />
            <label style={{ fontFamily: 'DM Sans, sans-serif', fontSize: '12px', color: '#141410' }}>ETC Badge erforderlich</label>
          </div>
          <div><label style={lblStyle}>Mindest-Mitgliedschaft für Sichtbarkeit</label><select style={inputStyle} value={form.min_tier} onChange={e => set('min_tier', e.target.value)}>{TIERS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}</select></div>
          <button type="submit" disabled={saving || !form.title} className="w-full uppercase tracking-[0.2em] cursor-pointer transition-opacity hover:opacity-90 disabled:opacity-50"
            style={{ fontFamily: 'DM Sans, sans-serif', fontSize: '10px', padding: '14px', background: '#B8952A', color: '#141410', border: 'none' }}>
            {saving ? '...' : 'Angebot veröffentlichen'}
          </button>
        </form>
      </div>
    </PartnerDashboardLayout>
  );
}
