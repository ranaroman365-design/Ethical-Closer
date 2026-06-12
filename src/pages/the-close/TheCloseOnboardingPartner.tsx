import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuthContext } from '@/contexts/AuthContext';

const INDUSTRY_OPTIONS = ['Coaching', 'SaaS', 'Finance', 'Real Estate', 'Health', 'E-Commerce', 'Other'];
const SIZE_OPTIONS = ['1-5', '6-20', '21-50', '51-200', '200+'];
const STEPS = ['Ihr Unternehmen', 'Ihr Zugang'] as const;

export default function TheCloseOnboardingPartner() {
  const navigate = useNavigate();
  const { user } = useAuthContext();
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const [form, setForm] = useState({
    company_name: '', contact_name: '', industry: '', company_size: '',
    website_url: '', description: '', email: '', password: '',
  });
  const set = (k: string, v: string) => setForm(p => ({ ...p, [k]: v }));

  const handleSubmit = async () => {
    setError(''); setSubmitting(true);
    try {
      let userId = user?.id;
      if (!userId) {
        if (!form.email || !form.password) { setError('E-Mail und Passwort erforderlich.'); setSubmitting(false); return; }
        if (form.password.length < 8) { setError('Passwort muss mindestens 8 Zeichen haben.'); setSubmitting(false); return; }
        const { data: ad, error: ae } = await supabase.auth.signUp({ email: form.email, password: form.password });
        if (ae) { setError(ae.message); setSubmitting(false); return; }
        userId = ad.user?.id;
        if (!userId) { setError('Registrierung fehlgeschlagen.'); setSubmitting(false); return; }
      }
      const { error: ppErr } = await supabase.from('tc_partner_profiles' as any).insert({
        user_id: userId, company_name: form.company_name,
        contact_name: form.contact_name || null, industry: form.industry || null,
        company_size: form.company_size || null, website_url: form.website_url || null,
        description: form.description || null,
      } as any);
      if (ppErr) { setError(ppErr.message); setSubmitting(false); return; }

      const { error: utErr } = await supabase.from('the_close_user_types').insert({
        user_id: userId, role: 'partner', subscription_tier: 'bronze', status: 'active',
      });
      if (utErr) { setError(utErr.message); setSubmitting(false); return; }
      navigate('/the-close/partner/dashboard');
    } catch { setError('Ein Fehler ist aufgetreten.'); } finally { setSubmitting(false); }
  };

  return (
    <div className="min-h-screen" style={{ background: '#F7F2E9' }}>
      <div className="px-9 py-6" style={{ background: '#141410' }}>
        <p className="uppercase tracking-[0.28em] text-[9px]" style={{ color: '#B8952A', fontFamily: 'DM Sans, sans-serif' }}>The Close — Partner-Aufnahme</p>
      </div>

      <div className="flex items-center gap-6 px-9 py-4" style={{ borderBottom: '1px solid #D4C9A8' }}>
        {STEPS.map((label, i) => (
          <button key={label} onClick={() => i < step && setStep(i)} className="flex items-center gap-2 cursor-pointer bg-transparent border-none" style={{ fontFamily: 'DM Sans, sans-serif' }}>
            <span className="inline-block rounded-full" style={{ width: 6, height: 6, background: i <= step ? '#B8952A' : 'transparent', border: i <= step ? 'none' : '1px solid #3A3830' }} />
            <span className="uppercase tracking-[0.16em] text-[9px]" style={{ color: i === step ? '#B8952A' : i < step ? '#7A7568' : '#3A3830', borderBottom: i === step ? '2px solid #B8952A' : 'none', paddingBottom: 2 }}>{label}</span>
          </button>
        ))}
      </div>

      <div className="mx-auto max-w-[540px] py-12 px-8">
        {step === 0 && (
          <div className="space-y-5">
            <Fld label="Unternehmensname" value={form.company_name} onChange={v => set('company_name', v)} required />
            <Fld label="Ihr Name" value={form.contact_name} onChange={v => set('contact_name', v)} required />
            <div>
              <Lbl text="Branche" />
              <select value={form.industry} onChange={e => set('industry', e.target.value)} className="w-full p-3 outline-none cursor-pointer"
                style={{ fontFamily: 'DM Sans, sans-serif', fontSize: '13px', background: '#F7F2E9', border: '1px solid #D4C9A8', color: '#141410' }}>
                <option value="">Bitte wählen</option>
                {INDUSTRY_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
            <div>
              <Lbl text="Teamgröße" />
              <select value={form.company_size} onChange={e => set('company_size', e.target.value)} className="w-full p-3 outline-none cursor-pointer"
                style={{ fontFamily: 'DM Sans, sans-serif', fontSize: '13px', background: '#F7F2E9', border: '1px solid #D4C9A8', color: '#141410' }}>
                <option value="">Bitte wählen</option>
                {SIZE_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
            <Fld label="Website" value={form.website_url} onChange={v => set('website_url', v)} placeholder="https://" type="url" />
            <div>
              <Lbl text="Was bieten Sie Closern?" />
              <textarea value={form.description} onChange={e => set('description', e.target.value.slice(0, 500))} maxLength={500} rows={4}
                placeholder="Kurze Beschreibung des Angebots und der Zusammenarbeit." className="w-full p-3 outline-none resize-none"
                style={{ fontFamily: 'DM Sans, sans-serif', fontSize: '13px', background: '#F7F2E9', border: '1px solid #D4C9A8', color: '#141410' }} />
              <p className="text-right text-[10px] mt-0.5" style={{ color: '#7A7568', fontFamily: 'DM Sans, sans-serif' }}>{form.description.length}/500</p>
            </div>
            <button onClick={() => setStep(1)} disabled={!form.company_name || !form.contact_name}
              className="w-full mt-4 uppercase tracking-[0.2em] cursor-pointer transition-opacity hover:opacity-90 disabled:opacity-50"
              style={{ fontFamily: 'DM Sans, sans-serif', fontSize: '10px', padding: '14px', background: '#141410', color: '#F7F2E9', border: 'none' }}>
              Nächste Station →
            </button>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-5">
            <p style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: '16px', fontWeight: 300, color: '#7A7568' }}>
              Zugang zum Closer-Directory.<br />Kuratiert. Geprüft. Auf Niveau.
            </p>
            {user ? (
              <p style={{ fontFamily: 'DM Sans, sans-serif', fontSize: '12px', color: '#3A3830' }}>Sie sind bereits eingeloggt als {user.email}. Direkt fortfahren.</p>
            ) : (
              <>
                <Fld label="E-Mail-Adresse" value={form.email} onChange={v => set('email', v)} type="email" />
                <Fld label="Passwort wählen" value={form.password} onChange={v => set('password', v)} type="password" placeholder="Mindestens 8 Zeichen" />
              </>
            )}
            <div className="p-4" style={{ background: '#EDE7D9', border: '1px solid #D4C9A8' }}>
              <p style={{ fontFamily: 'DM Sans, sans-serif', fontSize: '13px', fontWeight: 500, color: '#141410' }}>Sie starten mit Basis-Zugang zum Directory.</p>
              <p className="mt-1" style={{ fontFamily: 'DM Sans, sans-serif', fontSize: '12px', fontWeight: 300, color: '#7A7568' }}>Silver und höher geben Ihnen direkten Kontakt zu Closern.</p>
            </div>
            {error && <p style={{ fontFamily: 'DM Sans, sans-serif', fontSize: '12px', color: '#EF4444' }}>{error}</p>}
            <button onClick={handleSubmit} disabled={submitting || (!user && (!form.email || !form.password)) || !form.company_name}
              className="w-full uppercase tracking-[0.2em] cursor-pointer transition-opacity hover:opacity-90 disabled:opacity-50"
              style={{ fontFamily: 'DM Sans, sans-serif', fontSize: '11px', padding: '16px', background: '#B8952A', color: '#141410', border: 'none' }}>
              {submitting ? '...' : 'Zugang erhalten'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function Lbl({ text }: { text: string }) {
  return <label className="block mb-1 uppercase tracking-[0.14em] text-[9px]" style={{ fontFamily: 'DM Sans, sans-serif', color: '#7A7568' }}>{text}</label>;
}
function Fld({ label, value, onChange, placeholder, required, type = 'text' }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; required?: boolean; type?: string }) {
  return (<div><Lbl text={label} /><input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} required={required} className="w-full p-3 outline-none"
    style={{ fontFamily: 'DM Sans, sans-serif', fontSize: '13px', background: '#F7F2E9', border: '1px solid #D4C9A8', color: '#141410' }} /></div>);
}
