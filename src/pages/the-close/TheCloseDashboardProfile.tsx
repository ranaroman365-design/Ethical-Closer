import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useTheCloseUser } from '@/hooks/the-close/useTheCloseUser';
import { DashboardLayout } from '@/components/the-close/DashboardLayout';
import { AvailabilityDot } from '@/components/the-close/AvailabilityDot';
import { toast } from 'sonner';
import type { CloserProfile, AvailabilityKey } from '@/types/the-close';

const LANGUAGES = ['Deutsch', 'Englisch', 'Spanisch', 'Französisch', 'Andere'];
const INDUSTRIES = ['Coaching', 'SaaS', 'Finance', 'Real Estate', 'Health', 'Other'];
const DEAL_SIZES = ['< 1.000€', '1.000–5.000€', '5.000–15.000€', '> 15.000€'];

export default function TheCloseDashboardProfile() {
  const { user } = useTheCloseUser();
  const [profile, setProfile] = useState<CloserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    supabase.from('closer_profiles').select('*').eq('user_id', user.id).single()
      .then(({ data }) => { if (data) setProfile(data as unknown as CloserProfile); setLoading(false); });
  }, [user?.id]);

  const set = (k: keyof CloserProfile, v: CloserProfile[keyof CloserProfile]) =>
    setProfile(p => p ? { ...p, [k]: v } : p);

  const toggleArr = (k: 'languages' | 'industries', v: string) =>
    setProfile(p => p ? { ...p, [k]: p[k].includes(v) ? p[k].filter(x => x !== v) : [...p[k], v] } : p);

  const handleSave = async () => {
    if (!profile || !user) return;
    setSaving(true);
    const { error } = await supabase.from('closer_profiles').update({
      display_name: profile.display_name,
      headline: profile.headline,
      location: profile.location,
      experience_years: profile.experience_years,
      languages: profile.languages,
      industries: profile.industries,
      avg_deal_size: profile.avg_deal_size,
      closing_rate: profile.closing_rate,
      bio: profile.bio,
      linkedin_url: profile.linkedin_url,
      availability: profile.availability,
    }).eq('user_id', user.id);
    setSaving(false);
    if (error) toast.error(error.message);
    else toast.success('Profil gespeichert.');
  };

  if (loading || !profile) return <DashboardLayout><div className="p-10" style={{ fontFamily: 'DM Sans, sans-serif', fontSize: '12px', color: '#7A7568' }}>Lade...</div></DashboardLayout>;

  const inputStyle: React.CSSProperties = { width: '100%', padding: '10px 14px', fontFamily: "'DM Sans', sans-serif", fontSize: '13px', background: '#F7F2E9', border: '1px solid #D4C9A8', color: '#141410' };
  const lblStyle: React.CSSProperties = { display: 'block', marginBottom: 4, fontFamily: "'DM Sans', sans-serif", fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.14em', color: '#7A7568' };

  return (
    <DashboardLayout>
      <div className="max-w-[600px] mx-auto py-8 px-6">
        {/* Availability toggle */}
        <div className="flex items-center justify-between mb-6 p-4" style={{ border: '1px solid #D4C9A8' }}>
          <span style={{ fontFamily: 'DM Sans, sans-serif', fontSize: '12px', color: '#141410' }}>Verfügbarkeit</span>
          <div className="flex gap-2">
            {(['available', 'open', 'unavailable'] as AvailabilityKey[]).map(a => (
              <button key={a} onClick={() => set('availability', a)} className="flex items-center gap-1.5 px-3 py-1.5 cursor-pointer"
                style={{ fontFamily: 'DM Sans, sans-serif', fontSize: '11px', background: profile.availability === a ? '#141410' : '#F7F2E9', color: profile.availability === a ? '#F7F2E9' : '#3A3830', border: `1px solid ${profile.availability === a ? '#141410' : '#D4C9A8'}` }}>
                <AvailabilityDot availability={a} /> {a === 'available' ? 'Verfügbar' : a === 'open' ? 'Offen' : 'Nicht verfügbar'}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-4">
          <div><label style={lblStyle}>Name</label><input style={inputStyle} value={profile.display_name} onChange={e => set('display_name', e.target.value)} /></div>
          <div><label style={lblStyle}>Headline</label><input style={inputStyle} value={profile.headline ?? ''} onChange={e => set('headline', e.target.value)} /></div>
          <div><label style={lblStyle}>Standort</label><input style={inputStyle} value={profile.location ?? ''} onChange={e => set('location', e.target.value)} /></div>
          <div><label style={lblStyle}>Jahre im Sales</label><input type="number" min={0} style={inputStyle} value={profile.experience_years} onChange={e => set('experience_years', parseInt(e.target.value) || 0)} /></div>
          <div>
            <label style={lblStyle}>Sprachen</label>
            <div className="flex flex-wrap gap-2">{LANGUAGES.map(l => (
              <button key={l} onClick={() => toggleArr('languages', l)} className="cursor-pointer text-[11px] px-3 py-1.5"
                style={{ fontFamily: 'DM Sans, sans-serif', background: profile.languages.includes(l) ? '#141410' : '#F7F2E9', color: profile.languages.includes(l) ? '#F7F2E9' : '#3A3830', border: `1px solid ${profile.languages.includes(l) ? '#141410' : '#D4C9A8'}` }}>{l}</button>
            ))}</div>
          </div>
          <div>
            <label style={lblStyle}>Branchen</label>
            <div className="flex flex-wrap gap-2">{INDUSTRIES.map(i => (
              <button key={i} onClick={() => toggleArr('industries', i)} className="cursor-pointer text-[11px] px-3 py-1.5"
                style={{ fontFamily: 'DM Sans, sans-serif', background: profile.industries.includes(i) ? '#141410' : '#F7F2E9', color: profile.industries.includes(i) ? '#F7F2E9' : '#3A3830', border: `1px solid ${profile.industries.includes(i) ? '#141410' : '#D4C9A8'}` }}>{i}</button>
            ))}</div>
          </div>
          <div><label style={lblStyle}>Deal-Größe</label>
            <select style={inputStyle} value={profile.avg_deal_size ?? ''} onChange={e => set('avg_deal_size', e.target.value)}>
              <option value="">—</option>{DEAL_SIZES.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
          <div><label style={lblStyle}>Closing Rate</label><input style={inputStyle} value={profile.closing_rate ?? ''} onChange={e => set('closing_rate', e.target.value)} placeholder="z.B. 32%" /></div>
          <div><label style={lblStyle}>Über mich</label><textarea style={{ ...inputStyle, minHeight: 80, resize: 'none' }} value={profile.bio ?? ''} onChange={e => set('bio', e.target.value)} /></div>
          <div><label style={lblStyle}>LinkedIn URL</label><input type="url" style={inputStyle} value={profile.linkedin_url ?? ''} onChange={e => set('linkedin_url', e.target.value)} /></div>

          <button onClick={handleSave} disabled={saving} className="w-full uppercase tracking-[0.2em] cursor-pointer transition-opacity hover:opacity-90 disabled:opacity-50"
            style={{ fontFamily: 'DM Sans, sans-serif', fontSize: '10px', padding: '14px', background: '#141410', color: '#F7F2E9', border: 'none' }}>
            {saving ? '...' : 'Profil speichern'}
          </button>
        </div>
      </div>
    </DashboardLayout>
  );
}
