import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { ArrowRight, CheckCircle2, Users, TrendingUp, Award } from 'lucide-react';
import FooterSection from '@/components/landing/FooterSection';

interface LandingConfig {
  headline?: string;
  subheadline?: string;
  cta_label?: string;
  cta_url?: string;
  social_proof?: { metric: string; label: string }[];
  for_whom?: string[];
  steps?: { step: number; title: string; description: string }[];
}

const DEFAULT_SOCIAL_PROOF = [
  { metric: '580+', label: 'Absolventen' },
  { metric: '92%', label: 'Erfolgsquote' },
  { metric: '€2.4M+', label: 'Generierter Umsatz' },
];

const DEFAULT_FOR_WHOM = [
  'Du willst ortsunabhängig arbeiten und dein Einkommen selbst bestimmen.',
  'Du suchst eine strukturierte Ausbildung, keine leeren Versprechen.',
  'Du willst ethisch verkaufen — ohne Druck, ohne Manipulation.',
  'Du bist bereit, 10–15 Stunden pro Woche zu investieren.',
];

const DEFAULT_STEPS = [
  { step: 1, title: 'Bewirb dich', description: 'Fülle das kurze Quiz aus und buche dein Strategiegespräch.' },
  { step: 2, title: 'Starte die Ausbildung', description: '9 Wochen intensives Training mit Zertifizierung und Praxisphasen.' },
  { step: 3, title: 'Werde platziert', description: 'Erhalte Zugang zu Leads, Kunden und deinem eigenen Closing-Business.' },
];

export default function CloneLanding() {
  const { productKey } = useParams<{ productKey: string }>();
  const key = productKey || 'etc';
  const [config, setConfig] = useState<LandingConfig>({});
  const [brandName, setBrandName] = useState('Ethical Top Closer');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const { data } = await supabase
          .from('product_config')
          .select('config')
          .eq('product_key', key)
          .maybeSingle();

        if (data?.config) {
          const cfg = data.config as Record<string, unknown>;
          if (cfg.landing) setConfig(cfg.landing as LandingConfig);
          if (cfg.branding && (cfg.branding as Record<string, unknown>).product_name) {
            setBrandName((cfg.branding as Record<string, unknown>).product_name as string);
          }
        }
      } catch (err) {
        console.error('[CloneLanding] config fetch error:', err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [key]);

  const headline = config.headline || 'Dein Leben. Deine Regeln. Dein Einkommen.';
  const subheadline = config.subheadline || 'Die ethische Closing-Ausbildung mit Zertifizierung, Vermittlung und Karrieresystem.';
  const ctaLabel = config.cta_label || 'Jetzt bewerben';
  const ctaUrl = config.cta_url || '/quiz';
  const socialProof = config.social_proof?.length ? config.social_proof : DEFAULT_SOCIAL_PROOF;
  const forWhom = config.for_whom?.length ? config.for_whom : DEFAULT_FOR_WHOM;
  const steps = config.steps?.length ? config.steps : DEFAULT_STEPS;

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-muted-foreground border-t-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Hero */}
      <section className="relative overflow-hidden px-4 py-20 sm:py-32">
        <div className="absolute inset-0 bg-gradient-to-br from-accent/5 to-transparent" />
        <div className="relative mx-auto max-w-3xl text-center">
          <p className="mb-4 text-xs font-medium uppercase tracking-[0.2em] text-accent">{brandName}</p>
          <h1 className="font-serif text-3xl font-bold leading-tight tracking-tight sm:text-5xl lg:text-6xl">
            {headline}
          </h1>
          <p className="mx-auto mt-6 max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg">
            {subheadline}
          </p>
          <div className="mt-8">
            <Link to={ctaUrl}>
              <Button size="lg" className="gap-2 bg-accent text-accent-foreground hover:bg-accent/90 px-8 py-3 text-sm font-medium">
                {ctaLabel}
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Social Proof Bar */}
      <section className="border-y border-border/40 bg-muted/30 px-4 py-8">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-center gap-8 sm:gap-16">
          {socialProof.map((item, i) => (
            <div key={i} className="text-center">
              <p className="font-serif text-2xl font-bold text-foreground sm:text-3xl">{item.metric}</p>
              <p className="mt-1 text-xs text-muted-foreground">{item.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* For Whom */}
      <section className="px-4 py-16 sm:py-24">
        <div className="mx-auto max-w-2xl">
          <h2 className="mb-8 text-center font-serif text-2xl font-semibold tracking-tight sm:text-3xl">
            Für wen ist das?
          </h2>
          <div className="space-y-4">
            {forWhom.map((item, i) => (
              <div key={i} className="flex items-start gap-3 rounded-lg border border-border/30 bg-card p-4">
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-accent" />
                <p className="text-sm leading-relaxed text-foreground">{item}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="border-t border-border/40 bg-muted/20 px-4 py-16 sm:py-24">
        <div className="mx-auto max-w-3xl">
          <h2 className="mb-12 text-center font-serif text-2xl font-semibold tracking-tight sm:text-3xl">
            So funktioniert's
          </h2>
          <div className="grid gap-8 sm:grid-cols-3">
            {steps.map((step) => {
              const icons = [Users, TrendingUp, Award];
              const StepIcon = icons[(step.step - 1) % icons.length];
              return (
                <div key={step.step} className="text-center">
                  <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-accent/10">
                    <StepIcon className="h-5 w-5 text-accent" />
                  </div>
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-accent">
                    Schritt {step.step}
                  </p>
                  <h3 className="mb-2 font-serif text-lg font-semibold text-foreground">{step.title}</h3>
                  <p className="text-sm leading-relaxed text-muted-foreground">{step.description}</p>
                </div>
              );
            })}
          </div>
          <div className="mt-12 text-center">
            <Link to={ctaUrl}>
              <Button size="lg" className="gap-2 bg-accent text-accent-foreground hover:bg-accent/90 px-8">
                {ctaLabel}
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <FooterSection />
    </div>
  );
}
