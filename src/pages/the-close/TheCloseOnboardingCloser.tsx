import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuthContext } from '@/contexts/AuthContext';
import { TierBadge } from '@/components/the-close/TierBadge';

const STORAGE_KEY = 'tc_onboarding_closer';
const LANGUAGE_OPTIONS = ['Deutsch', 'Englisch', 'Spanisch', 'Französisch', 'Andere'];
const INDUSTRY_OPTIONS = ['Coaching', 'SaaS', 'Finance', 'Real Estate', 'Health', 'Other'];
const DEAL_SIZE_OPTIONS = ['< 1.000€', '1.000–5.000€', '5.000–15.000€', '> 15.000€'];
const STEPS = ['Dein Profil', 'Deine Stärken', 'Dein Zugang'] as const;

interface FormData {
  display_name: string;
  headline: string;
  location: string;
  experience_years: number;
  languages: string[];
  industries: string[];
  avg_deal_size: string;
  closing_rate: string;
  email: string;
  password: string;
}

function loadSaved(): Partial<FormData> {
  try { const r = localStorage.getItem(STORAGE_KEY); return r ? JSON.parse(r) : {}; } catch { return {}; }
}

export default function TheCloseOnboardingCloser() {
  const navigate = useNavigate();
  const { user } = useAuthContext();
  const [step, setStep] = useState(0);
  const [showWelcome, setShowWelcome] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const saved = loadSaved();
  const [hasSaved] = useState(() => !!saved.display_name);

  const [form, setForm] = useState<FormData>({
    display_name: saved.display_name ?? '',
    headline: saved.headline ?? '',
    location: saved.location ?? '',
    experience_years: saved.experience_years ?? 0,
    languages: saved.languages ?? [],
    industries: saved.industries ?? [],
    avg_deal_size: saved.avg_deal_size ?? '',
    closing_rate: saved.closing_rate ?? '',
    email: '',
    password: '',
  });

  useEffect(() => {
    const { email, password, ...rest } = form;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(rest));
  }, [form]);

  const set = (key: keyof FormData, value: FormData[keyof FormData]) =>
    setForm(prev => ({ ...prev, [key]: value }));

  const toggleArray = (key: 'languages' | 'industries', val: string) =>
    setForm(prev => ({
      ...prev,
      [key]: prev[key].includes(val) ? prev[key].filter(v => v !== val) : [...prev[key], val],
    }));

  const handleSubmit = async () => {
    setError('');
    setSubmitting(true);
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
      const { data: fnData, error: fnErr } = await supabase.functions.invoke('create-closer-profile', {
        body: {
          user_id: userId,
          display_name: form.display_name,
          headline: form.headline || null,
          location: form.location || null,
          experience_years: form.experience_years,
          languages: form.languages,
          industries: form.industries,
          avg_deal_size: form.avg_deal_size || null,
          closing_rate: form.closing_rate || null,
          user_type_role: 'closer',
        },
      });
      if (fnErr || !fnData?.success) {
        setError(fnData?.error || fnErr?.message || 'Profil konnte nicht erstellt werden.');
        setSubmitting(false);
        return;
      }

      localStorage.removeItem(STORAGE_KEY);
      localStorage.setItem('tc_first_login', 'true');
      setShowWelcome(true);
      setTimeout(() => navigate('/the-close/dashboard', { state: { is_new_user: true } }), 2000);
    } catch { setError('Ein Fehler ist aufgetreten.'); } finally { setSubmitting(false); }
  };

  if (showWelcome) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#141410' }}>
        <div className="text-center">
          <h1 style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: '36px', fontWeight: 300, color: '#F7F2E9' }}>Willkommen im Netzwerk.</h1>
          <p className="mt-2" style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: '20px', fontWeight: 300, color: '#D4AF50', fontStyle: 'italic' }}>Du wirst gefunden.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ background: '#F7F2E9' }}>
      <div className="px-9 py-6" style={{ background: '#141410' }}>
        <p className="uppercase tracking-[0.28em] text-[9px]" style={{ color: '#B8952A', fontFamily: 'DM Sans, sans-serif' }}>The Close — Aufnahme</p>
        {step === 0 && (
          <p className="mt-3" style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: '16px', fontWeight: 300, color: '#6A6860' }}>
            Wir schauen uns an, wer du bist.<br />Füll die Felder so aus, wie du gesehen werden willst.
          </p>
        )}
      </div>

      {/* Progress */}
      <div className="flex items-center gap-6 px-9 py-4" style={{ borderBottom: '1px solid #D4C9A8' }}>
        {STEPS.map((label, i) => (
          <button key={label} onClick={() => i < step && setStep(i)} className="flex items-center gap-2 cursor-pointer bg-transparent border-none" style={{ fontFamily: 'DM Sans, sans-serif' }}>
            <span className="inline-block rounded-full" style={{ width: 6, height: 6, background: i <= step ? '#B8952A' : 'transparent', border: i <= step ? 'none' : '1px solid #3A3830' }} />
            <span className="uppercase tracking-[0.16em] text-[9px]" style={{ color: i === step ? '#B8952A' : i < step ? '#7A7568' : '#3A3830', borderBottom: i === step ? '2px solid #B8952A' : 'none', paddingBottom: 2 }}>{label}</span>
          </button>
        ))}
      </div>

      {hasSaved && step === 0 && (
        <div className="mx-auto max-w-[540px] mt-4 px-8">
          <div className="flex items-center justify-between p-3" style={{ background: '#EDE7D9', border: '1px solid #D4C9A8', fontFamily: 'DM Sans, sans-serif', fontSize: '12px', color: '#3A3830' }}>
            <span>Du hast das Profil bereits begonnen.</span>
          </div>
        </div>
      )}

      <div className="mx-auto max-w-[540px] py-12 px-8">
        {step === 0 && (
          <div className="space-y-5">
            <Fld label="Wie sollen Partner dich finden?" value={form.display_name} onChange={v => set('display_name', v)} required placeholder="Dein Name" />
            <Fld label="Headline" value={form.headline} onChange={v => set('headline', v)} placeholder="High-Ticket Closer | 3 Jahre DACH" />
            <Fld label="Standort" value={form.location} onChange={v => set('location', v)} placeholder="Berlin, Deutschland" />
            <div>
              <Lbl text="Jahre im Sales" />
              <input type="number" min={0} value={form.experience_years} onChange={e => set('experience_years', parseInt(e.target.value) || 0)}
                className="w-full p-3 outline-none" style={{ fontFamily: 'DM Sans, sans-serif', fontSize: '13px', background: '#F7F2E9', border: '1px solid #D4C9A8', color: '#141410' }} />
            </div>
            <NxtBtn onClick={() => setStep(1)} disabled={!form.display_name} />
          </div>
        )}

        {step === 1 && (
          <div className="space-y-5">
            <p className="text-center mb-6" style={{ fontFamily: 'DM Sans, sans-serif', fontSize: '11px', fontWeight: 300, color: '#7A7568' }}>580+ Closer haben dieses Profil ausgefüllt.</p>
            <MultiSel label="In welchen Sprachen closest du?" options={LANGUAGE_OPTIONS} selected={form.languages} onToggle={v => toggleArray('languages', v)} />
            <MultiSel label="In welchen Branchen bist du stark?" options={INDUSTRY_OPTIONS} selected={form.industries} onToggle={v => toggleArray('industries', v)} />
            <div>
              <Lbl text="Durchschnittliche Deal-Größe" />
              <select value={form.avg_deal_size} onChange={e => set('avg_deal_size', e.target.value)} className="w-full p-3 outline-none cursor-pointer"
                style={{ fontFamily: 'DM Sans, sans-serif', fontSize: '13px', background: '#F7F2E9', border: '1px solid #D4C9A8', color: '#141410' }}>
                <option value="">Bitte wählen</option>
                {DEAL_SIZE_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
            <Fld label="Closing Rate (optional)" value={form.closing_rate} onChange={v => set('closing_rate', v)} placeholder="z.B. 32%" />
            <NxtBtn onClick={() => setStep(2)} />
          </div>
        )}

        {step === 2 && (
          <div className="space-y-5">
            <p style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: '16px', fontWeight: 300, color: '#7A7568' }}>Letzter Schritt. Danach bist du im Netzwerk.</p>
            {user ? (
              <p style={{ fontFamily: 'DM Sans, sans-serif', fontSize: '12px', color: '#3A3830' }}>Du bist bereits eingeloggt als {user.email}. Direkt fortfahren.</p>
            ) : (
              <>
                <Fld label="E-Mail-Adresse" value={form.email} onChange={v => set('email', v)} type="email" />
                <Fld label="Passwort wählen" value={form.password} onChange={v => set('password', v)} type="password" placeholder="Mindestens 8 Zeichen" />
              </>
            )}
            <div className="flex items-start gap-3 p-4" style={{ background: '#EDE7D9', border: '1px solid #D4C9A8' }}>
              <TierBadge tier="bronze" size="md" />
              <div>
                <p style={{ fontFamily: 'DM Sans, sans-serif', fontSize: '13px', fontWeight: 500, color: '#141410' }}>Du startest als Bronze-Mitglied.</p>
                <p className="mt-1" style={{ fontFamily: 'DM Sans, sans-serif', fontSize: '12px', fontWeight: 300, color: '#7A7568' }}>
                  Profil anlegen. Sichtbar werden. Erste Anfragen empfangen.<br />Silver und höher sind jederzeit zugänglich.
                </p>
              </div>
            </div>
            {error && <p style={{ fontFamily: 'DM Sans, sans-serif', fontSize: '12px', color: '#EF4444' }}>{error}</p>}
            <button onClick={handleSubmit} disabled={submitting || (!user && (!form.email || !form.password)) || !form.display_name}
              className="w-full uppercase tracking-[0.2em] cursor-pointer transition-opacity hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ fontFamily: 'DM Sans, sans-serif', fontSize: '11px', padding: '16px', background: '#141410', color: '#F7F2E9', border: 'none' }}>
              {submitting ? '...' : 'Aufgenommen werden'}
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
  return (<div><Lbl text={label} /><input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} required={required} className="w-full p-3 outline-none" style={{ fontFamily: 'DM Sans, sans-serif', fontSize: '13px', background: '#F7F2E9', border: '1px solid #D4C9A8', color: '#141410' }} /></div>);
}
function MultiSel({ label, options, selected, onToggle }: { label: string; options: string[]; selected: string[]; onToggle: (v: string) => void }) {
  return (<div><Lbl text={label} /><div className="flex flex-wrap gap-2 mt-1">{options.map(o => (
    <button key={o} onClick={() => onToggle(o)} className="cursor-pointer transition-colors text-[11px] px-3 py-1.5"
      style={{ fontFamily: 'DM Sans, sans-serif', background: selected.includes(o) ? '#141410' : '#F7F2E9', color: selected.includes(o) ? '#F7F2E9' : '#3A3830', border: `1px solid ${selected.includes(o) ? '#141410' : '#D4C9A8'}` }}>{o}</button>
  ))}</div></div>);
}
function NxtBtn({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
  return <button onClick={onClick} disabled={disabled} className="w-full mt-4 uppercase tracking-[0.2em] cursor-pointer transition-opacity hover:opacity-90 disabled:opacity-50"
    style={{ fontFamily: 'DM Sans, sans-serif', fontSize: '10px', padding: '14px', background: '#141410', color: '#F7F2E9', border: 'none' }}>Nächste Station →</button>;
}
