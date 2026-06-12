import { useState } from 'react';
import { PRODUCT } from '@/config/product';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { useLanguage } from '@/i18n/LanguageContext';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import { Building2, Shield, CheckCircle2, XCircle } from 'lucide-react';

type Step = 'intro' | 'form' | 'ethics' | 'result';

const ETHICS_QUESTIONS = [
  {
    de: 'Erzeugt Ihr Angebot echte Transformation für Ihre Kunden?',
    en: 'Does your offer create real transformation for your clients?',
  },
  {
    de: 'Sind Ihre Versprechen im Einklang mit dem, was Sie tatsächlich liefern?',
    en: 'Are your promises aligned with what you actually deliver?',
  },
  {
    de: 'Sind Sie bereit, ohne druckbasierte Verkaufstechniken zu arbeiten?',
    en: 'Are you willing to operate without pressure-based sales techniques?',
  },
];

export default function DirectorOnboarding() {
  const { user } = useAuth();
  const { lang } = useLanguage();
  const navigate = useNavigate();
  const t = (de: string, en: string) => (lang === 'de' ? de : en);

  const [step, setStep] = useState<Step>('intro');
  const [saving, setSaving] = useState(false);
  const [ethicsAnswers, setEthicsAnswers] = useState([false, false, false]);
  const [ethicsPassed, setEthicsPassed] = useState<boolean | null>(null);

  const [form, setForm] = useState({
    company_name: '',
    offer_type: '',
    price_point: '',
    monthly_revenue: '',
    lead_source: '',
    team_size: '',
    expected_hires: '',
    sales_problem: '',
    values_alignment: false,
  });

  const set = (k: string, v: string | boolean) => setForm(prev => ({ ...prev, [k]: v }));

  const handleSubmitForm = () => {
    if (!form.company_name.trim() || !form.offer_type.trim()) {
      toast.error(t('Bitte füllen Sie mindestens Firmenname und Angebotstyp aus.', 'Please fill in at least company name and offer type.'));
      return;
    }
    setStep('ethics');
  };

  const handleSubmitEthics = async () => {
    const passed = ethicsAnswers.every(Boolean);
    setEthicsPassed(passed);

    if (!user) return;
    setSaving(true);

    await supabase.from('director_applications').insert({
      user_id: user.id,
      company_name: form.company_name,
      offer_type: form.offer_type,
      price_point: form.price_point,
      monthly_revenue: form.monthly_revenue,
      lead_source: form.lead_source,
      team_size: form.team_size,
      expected_hires: form.expected_hires,
      sales_problem: form.sales_problem,
      values_alignment: form.values_alignment,
      ethical_filter_passed: passed,
      status: passed ? 'approved' : 'rejected',
    } as any);

    setSaving(false);
    setStep('result');
  };

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:py-16">
      <AnimatePresence mode="wait">
        {step === 'intro' && (
          <motion.div key="intro" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}>
            <div className="mb-10 text-center">
              <Building2 className="mx-auto mb-4 h-10 w-10 text-primary/60" />
              <h1 className="font-serif text-3xl font-semibold tracking-tight text-foreground">
                {t(`Bauen Sie Ihr Sales Team mit ${PRODUCT.name}n`, `Build Your Sales Team with ${PRODUCT.name}s`)}
              </h1>
              <p className="mt-3 text-muted-foreground leading-relaxed max-w-lg mx-auto">
                {t(
                  'Zugang zu trainierten, leistungsverifizierten Closern und skalieren Sie Ihr Angebot mit einem strukturierten System.',
                  'Access trained, performance-verified closers and scale your offer with a structured system.'
                )}
              </p>
            </div>
            <div className="space-y-4 rounded-lg border border-border bg-card p-6">
              <div className="space-y-3 text-sm text-muted-foreground">
                <p>✓ {t('Zertifizierte Closer mit messbaren KPIs', 'Certified closers with measurable KPIs')}</p>
                <p>✓ {t('Ethisches Verkaufssystem — kein Druck', 'Ethical sales system — no pressure')}</p>
                <p>✓ {t('Performance-basiertes Matching', 'Performance-based matching')}</p>
                <p>✓ {t('Echtzeit Team-Dashboard', 'Real-time team dashboard')}</p>
              </div>
              <Button onClick={() => setStep('form')} className="w-full mt-4">
                {t('Als Director bewerben →', 'Apply as Director →')}
              </Button>
            </div>
          </motion.div>
        )}

        {step === 'form' && (
          <motion.div key="form" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}>
            <h2 className="font-serif text-2xl font-semibold mb-6 text-foreground">
              {t('Unternehmensprofil', 'Company Profile')}
            </h2>
            <div className="space-y-4">
              {[
                { key: 'company_name', label: t('Firmenname', 'Company Name'), required: true },
                { key: 'offer_type', label: t('Angebotstyp', 'Offer Type'), required: true },
                { key: 'price_point', label: t('Preispunkt', 'Price Point') },
                { key: 'monthly_revenue', label: t('Monatlicher Umsatz', 'Monthly Revenue') },
                { key: 'lead_source', label: t('Lead-Quelle', 'Lead Source') },
                { key: 'team_size', label: t('Aktuelle Teamgröße', 'Current Team Size') },
                { key: 'expected_hires', label: t('Gewünschte Closer', 'Expected Hires') },
              ].map(f => (
                <div key={f.key}>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">
                    {f.label} {f.required && <span className="text-destructive">*</span>}
                  </label>
                  <Input
                    value={(form as any)[f.key]}
                    onChange={e => set(f.key, e.target.value)}
                    placeholder={f.label}
                  />
                </div>
              ))}
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">
                  {t('Verkaufsproblem / Herausforderung', 'Sales Problem / Challenge')}
                </label>
                <Textarea
                  value={form.sales_problem}
                  onChange={e => set('sales_problem', e.target.value)}
                  rows={3}
                  placeholder={t('Beschreiben Sie Ihre größte Herausforderung...', 'Describe your biggest challenge...')}
                />
              </div>
              <div className="flex items-center gap-2 pt-2">
                <Checkbox
                  checked={form.values_alignment}
                  onCheckedChange={v => set('values_alignment', !!v)}
                />
                <span className="text-sm text-muted-foreground">
                  {t(`Ich stimme den Werten von ${PRODUCT.name} zu`, `I agree with the values of ${PRODUCT.name}`)}
                </span>
              </div>
              <div className="flex gap-3 pt-2">
                <Button variant="outline" onClick={() => setStep('intro')}>
                  {t('Zurück', 'Back')}
                </Button>
                <Button onClick={handleSubmitForm} className="flex-1">
                  {t('Weiter zur Ethik-Prüfung', 'Continue to Ethics Check')}
                </Button>
              </div>
            </div>
          </motion.div>
        )}

        {step === 'ethics' && (
          <motion.div key="ethics" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}>
            <div className="mb-6">
              <Shield className="mb-3 h-8 w-8 text-primary/60" />
              <h2 className="font-serif text-2xl font-semibold text-foreground">
                {t('Ethik-Qualifizierung', 'Ethical Qualification')}
              </h2>
              <p className="mt-2 text-sm text-muted-foreground">
                {t(
                  'Diese Fragen stellen sicher, dass Ihr Angebot mit dem Ethical Closing Ansatz kompatibel ist.',
                  'These questions ensure your offer is compatible with the Ethical Closing approach.'
                )}
              </p>
            </div>
            <div className="space-y-5">
              {ETHICS_QUESTIONS.map((q, i) => (
                <div key={i} className="rounded-lg border border-border bg-card p-4">
                  <p className="text-sm font-medium text-foreground mb-3">
                    {lang === 'de' ? q.de : q.en}
                  </p>
                  <div className="flex gap-3">
                    <Button
                      size="sm"
                      variant={ethicsAnswers[i] ? 'default' : 'outline'}
                      onClick={() => {
                        const next = [...ethicsAnswers];
                        next[i] = true;
                        setEthicsAnswers(next);
                      }}
                    >
                      {t('Ja', 'Yes')}
                    </Button>
                    <Button
                      size="sm"
                      variant={!ethicsAnswers[i] ? 'destructive' : 'outline'}
                      onClick={() => {
                        const next = [...ethicsAnswers];
                        next[i] = false;
                        setEthicsAnswers(next);
                      }}
                    >
                      {t('Nein', 'No')}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex gap-3 mt-6">
              <Button variant="outline" onClick={() => setStep('form')}>
                {t('Zurück', 'Back')}
              </Button>
              <Button onClick={handleSubmitEthics} disabled={saving} className="flex-1">
                {saving ? '...' : t('Bewerbung einreichen', 'Submit Application')}
              </Button>
            </div>
          </motion.div>
        )}

        {step === 'result' && (
          <motion.div key="result" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="text-center py-10">
            {ethicsPassed ? (
              <>
                <CheckCircle2 className="mx-auto mb-4 h-12 w-12 text-emerald-500" />
                <h2 className="font-serif text-2xl font-semibold text-foreground mb-2">
                  {t('Bewerbung angenommen', 'Application Approved')}
                </h2>
                <p className="text-muted-foreground mb-6 max-w-md mx-auto">
                  {t(
                    'Ihre Werte stimmen mit dem Ethical Closing Ansatz überein. Sie erhalten Zugang zum Director Workspace.',
                    'Your values align with the Ethical Closing approach. You will receive access to the Director Workspace.'
                  )}
                </p>
                <Button onClick={() => navigate('/members/director-workspace')}>
                  {t('Zum Director Workspace →', 'Go to Director Workspace →')}
                </Button>
              </>
            ) : (
              <>
                <XCircle className="mx-auto mb-4 h-12 w-12 text-destructive" />
                <h2 className="font-serif text-2xl font-semibold text-foreground mb-2">
                  {t('Bewerbung nicht qualifiziert', 'Application Not Qualified')}
                </h2>
                <p className="text-muted-foreground mb-6 max-w-md mx-auto">
                  {t(
                    'Ihr Angebot stimmt derzeit nicht mit dem Ethical Closing Ansatz überein. Bitte überprüfen Sie Ihre Verkaufsprinzipien.',
                    'Your offer does not currently align with the Ethical Closing approach. Please review your sales principles.'
                  )}
                </p>
                <Button variant="outline" onClick={() => navigate('/members/dashboard')}>
                  {t('Zurück zum Dashboard', 'Back to Dashboard')}
                </Button>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
