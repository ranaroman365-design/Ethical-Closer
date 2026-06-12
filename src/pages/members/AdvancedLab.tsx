import { useAuth } from '@/hooks/useAuth';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/i18n/LanguageContext';
import { useAccessResolver } from '@/hooks/useAccessResolver';
import {
  Microscope, TrendingUp, Brain, Shield, BarChart3,
  MessageCircle, Zap, ArrowRight, Lock, CheckCircle2,
} from 'lucide-react';

export default function AdvancedLab() {
  const { profile } = useAuth();
  const { lang } = useLanguage();
  const { rooms } = useAccessResolver();

  // Check if user has been granted full access (via purchase)
  const labRoom = rooms.find(r => r.slug === 'advanced-lab');
  const hasFullAccess = labRoom ? !labRoom.locked : false;

  const t = (de: string, en: string) => lang === 'de' ? de : en;

  const LAB_MODULES = [
    { title: t('Deal-Psychologie (Fortgeschritten)', 'Deal Psychology (Advanced)'), description: t('Verstehe die psychologischen Mechanismen hinter High-Ticket Deals.', 'Understand the psychological mechanisms behind high-ticket deals.'), icon: Brain },
    { title: t('Preiseinwand-Kompetenz', 'Price Objection Mastery'), description: t('Meistere Preis-Einwände auf höchstem Niveau.', 'Handle price objections at the highest level.'), icon: Shield },
    { title: t('Autorität & Präsenz', 'Authority & Presence'), description: t('Baue echte Autorität und Präsenz in jedem Gespräch auf.', 'Build real authority and presence in every conversation.'), icon: Zap },
    { title: t('Conversion-Optimierung', 'Conversion Optimization'), description: t('Optimiere jeden Schritt deiner Sales Pipeline für maximale Conversion.', 'Optimize every step of your sales pipeline for maximum conversion.'), icon: TrendingUp },
    { title: t('Deal-Review Sessions', 'Deal Review Sessions'), description: t('Analysiere echte Deals mit Peer-Feedback und Coaching.', 'Analyze real deals with peer feedback and coaching.'), icon: MessageCircle },
    { title: t('Einwandbehandlung (Fortgeschritten)', 'Objection Handling (Advanced)'), description: t('Fortgeschrittene Einwandbehandlung für komplexe Enterprise Deals.', 'Advanced objection handling for complex enterprise deals.'), icon: BarChart3 },
  ];

  // Preview mode: show teaser content with unlock CTA
  if (!hasFullAccess) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-6 sm:px-5 sm:py-8 lg:px-10">
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-1">
            <Microscope className="h-5 w-5 text-accent" />
            <h1 className="font-serif text-2xl font-semibold tracking-tight text-foreground">Advanced Lab</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            {t('Skalierung auf 3k–10k+/Monat — für zertifizierte und platzierte Closer.', 'Scaling to 3k–10k+/month — for certified and placed closers.')}
          </p>
          <Badge className="mt-2 bg-accent/15 text-accent text-[10px] border-0">€2.500 · 8 {t('Wochen', 'Weeks')} · {t('Intensiv', 'Intensive')}</Badge>
        </div>

        {/* Teaser module grid (blurred/locked) */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 mb-6 relative">
          {LAB_MODULES.slice(0, 4).map((mod, idx) => (
            <div key={idx} className="rounded-xl border border-border/40 bg-card p-5 opacity-60">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent/10">
                  <mod.icon className="h-5 w-5 text-accent" />
                </div>
                <div>
                  <p className="text-[14px] font-semibold text-foreground">{mod.title}</p>
                  <p className="mt-1 text-[12px] text-muted-foreground leading-relaxed">{mod.description}</p>
                </div>
              </div>
            </div>
          ))}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <Lock className="h-10 w-10 text-muted-foreground/20" />
          </div>
        </div>

        {/* Unlock CTA */}
        <div className="rounded-xl border border-accent/30 bg-accent/[0.05] p-6 text-center">
          <Lock className="mx-auto h-8 w-8 text-accent/50 mb-3" />
          <h2 className="text-lg font-semibold text-foreground mb-2">
            {t('Advanced Lab freischalten', 'Unlock Advanced Lab')}
          </h2>
          <p className="text-sm text-muted-foreground mb-4 max-w-md mx-auto">
            {t(
              'Erhalte Zugang zu fortgeschrittenen Deal-Strategien, Live-Reviews und Peer-Coaching. Verfügbar als einmaliger Kauf.',
              'Get access to advanced deal strategies, live reviews, and peer coaching. Available as a one-time purchase.'
            )}
          </p>
          <div className="flex flex-col items-center gap-3">
            <Button size="lg" className="text-sm gap-2">
              {t('Zugang freischalten', 'Unlock Access')} <ArrowRight className="h-4 w-4" />
            </Button>
            <span className="text-[11px] text-muted-foreground">
              {t('Einmalzahlung · Sofortzugang · 8 Wochen Programm', 'One-time payment · Instant access · 8 week program')}
            </span>
          </div>
        </div>

        {/* Result teaser */}
        <div className="mt-6 rounded-xl border border-border/40 bg-card p-5">
          <h2 className="text-[14px] font-semibold text-foreground mb-2">{t('Was du bekommst', 'What you get')}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {[
              t('6 Module mit Fortgeschrittenen-Inhalten', '6 modules with advanced content'),
              t('Live Deal Reviews & Coaching', 'Live deal reviews & coaching'),
              t('Peer-Feedback Gruppen', 'Peer feedback groups'),
              t('Skalierung auf 10k+/Monat', 'Scaling to 10k+/month'),
            ].map(item => (
              <div key={item} className="flex items-center gap-2 text-[12px] text-muted-foreground">
                <CheckCircle2 className="h-3.5 w-3.5 text-primary shrink-0" />
                <span>{item}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Full access mode
  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-5 sm:py-8 lg:px-10">
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-1">
          <Microscope className="h-5 w-5 text-accent" />
          <h1 className="font-serif text-2xl font-semibold tracking-tight text-foreground">Advanced Lab</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          {t('Skalierung auf 3k–10k+/Monat — für zertifizierte und platzierte Closer.', 'Scaling to 3k–10k+/month — for certified and placed closers.')}
        </p>
        <Badge className="mt-2 bg-accent/15 text-accent text-[10px] border-0">€2.500 · 8 {t('Wochen', 'Weeks')} · {t('Intensiv', 'Intensive')}</Badge>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 mb-6">
        {LAB_MODULES.map((mod, idx) => (
          <div key={idx} className="rounded-xl border border-border/40 bg-card p-5 transition-all hover:border-border/70 hover:shadow-sm">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent/10">
                <mod.icon className="h-5 w-5 text-accent" />
              </div>
              <div>
                <p className="text-[14px] font-semibold text-foreground">{mod.title}</p>
                <p className="mt-1 text-[12px] text-muted-foreground leading-relaxed">{mod.description}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="mb-6 rounded-xl border border-border/40 bg-card p-5">
        <h2 className="text-[14px] font-semibold text-foreground mb-3">{t('Praxis & Support', 'Practice & Support')}</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {[
            t('Live Deal Reviews', 'Live Deal Reviews'),
            t('Peer-Feedback', 'Peer Feedback'),
            t('Real-Case Analyse', 'Real-Case Analysis'),
          ].map(item => (
            <div key={item} className="flex items-center gap-2 text-[12px] text-muted-foreground">
              <CheckCircle2 className="h-3.5 w-3.5 text-primary shrink-0" />
              <span>{item}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-accent/20 bg-accent/[0.03] p-5">
        <h2 className="text-[14px] font-semibold text-foreground mb-2">{t('Dein Ergebnis', 'Your Result')}</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {[
            t('3k–5k → 10k+/Monat', '3k–5k → 10k+/month'),
            t('Professionalisierung', 'Professionalization'),
            t('Höhere Deal-Größen', 'Higher deal sizes'),
            t('Netzwerkeffekt', 'Network effect'),
          ].map(item => (
            <div key={item} className="flex items-center gap-2 text-[12px] text-muted-foreground">
              <Zap className="h-3 w-3 text-accent shrink-0" />
              <span>{item}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}