import { useAuth } from '@/hooks/useAuth';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useLanguage } from '@/i18n/LanguageContext';
import { Lock, ArrowLeft, Calendar, Users, TrendingUp, Award, Sparkles, MapPin, Building2, Globe, CheckCircle } from 'lucide-react';
import { getStageLevel } from '@/hooks/useDirectMessages';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

export default function QuarterlyCrossing() {
  const { profile, isAdmin } = useAuth();
  const { lang } = useLanguage();
  const stage = (profile as any)?.business_stage || 'opener';
  const myLevel = getStageLevel(stage);
  const hasAccess = (profile as any)?.quarterly_crossing_access === true;
  const canApply = myLevel >= 5 || isAdmin;

  const t = (de: string, en: string) => lang === 'de' ? de : en;

  const VALUE_POINTS = [
    {
      icon: Users,
      title: t('Gleichgesinnte treffen', 'Meet Like-Minded People'),
      description: t(
        'Vernetze dich mit anderen platzierten Closern, die ähnliche Ziele verfolgen.',
        'Connect with other placed closers who share similar goals.'
      ),
    },
    {
      icon: Building2,
      title: t('Partnerunternehmen', 'Partner Companies'),
      description: t(
        'Zugang zu exklusiven Partnerunternehmen und Geschäftsmöglichkeiten.',
        'Access to exclusive partner companies and business opportunities.'
      ),
    },
    {
      icon: MapPin,
      title: t('Events & Locations', 'Events & Locations'),
      description: t(
        'Regelmäßige Events an außergewöhnlichen Orten im DACH-Raum und weltweit.',
        'Regular events at extraordinary locations in DACH and worldwide.'
      ),
    },
    {
      icon: Globe,
      title: t('Netzwerk & Reisen', 'Networking & Travel'),
      description: t(
        'Inspirierende Vorträge, echtes Netzwerk und unvergessliche Erlebnisse.',
        'Inspiring talks, genuine networking, and unforgettable experiences.'
      ),
    },
  ];

  const UPCOMING_EVENTS = [
    { title: t('Q3 Kickoff — München', 'Q3 Kickoff — Munich'), date: t('Juli 2026', 'July 2026'), type: 'DACH' },
    { title: t('Summer Retreat — Mallorca', 'Summer Retreat — Mallorca'), date: t('August 2026', 'August 2026'), type: 'International' },
    { title: t('Q4 Strategy Day — Wien', 'Q4 Strategy Day — Vienna'), date: t('Oktober 2026', 'October 2026'), type: 'DACH' },
  ];

  // STATE 1: L4 locked preview
  if (!canApply && !hasAccess) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-xl border border-border/40 bg-card p-8"
        >
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
            <Lock className="h-5 w-5 text-muted-foreground" />
          </div>
          <h2 className="font-serif text-xl font-semibold text-foreground">Quarterly Crossing</h2>
          <p className="mt-3 text-sm text-muted-foreground leading-relaxed max-w-sm mx-auto">
            {t(
              'Treffe Gleichgesinnte, Partnerunternehmen und inspirierende Persönlichkeiten an außergewöhnlichen Orten weltweit und im DACH-Raum. Regelmäßige Events, Vorträge und echtes Netzwerk.',
              'Meet like-minded people, partner companies, and inspiring personalities at extraordinary locations worldwide and in the DACH region. Regular events, talks, and genuine networking.'
            )}
          </p>
          <div className="mt-4 flex flex-wrap justify-center gap-2 text-[10px] text-muted-foreground">
            <span className="rounded-full bg-muted px-2.5 py-1">🏢 Partner Companies</span>
            <span className="rounded-full bg-muted px-2.5 py-1">✈️ Travel & Locations</span>
            <span className="rounded-full bg-muted px-2.5 py-1">🤝 Networking</span>
            <span className="rounded-full bg-muted px-2.5 py-1">🎤 Talks & Insights</span>
          </div>
          <p className="mt-4 text-xs text-muted-foreground/70">
            {t('Bewerbung möglich ab Managing Closer (L5)', 'Application available from Managing Closer (L5)')}
          </p>
          <Link
            to="/members/path"
            className="mt-6 inline-flex items-center gap-1.5 text-xs font-medium text-accent hover:underline"
          >
            <ArrowLeft className="h-3 w-3" /> {t('Zurück zum Karriereweg', 'Back to Career Path')}
          </Link>
        </motion.div>
      </div>
    );
  }

  // STATE 2: L5+ not subscribed
  if (canApply && !hasAccess) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-8 sm:py-12">
        <Link
          to="/members/path"
          className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors mb-8"
        >
           <ArrowLeft className="h-3 w-3" /> {t('Karriereweg', 'Career Path')}
        </Link>

        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
          <div className="flex items-center gap-2 mb-2">
            <Sparkles className="h-4 w-4 text-accent" />
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">{t('Premium Community', 'Premium Community')}</p>
          </div>
          <h1 className="font-serif text-2xl sm:text-3xl font-semibold text-foreground">Quarterly Crossing</h1>
          <p className="mt-3 text-sm text-muted-foreground leading-relaxed max-w-lg">
            {t(
              'Treffe Gleichgesinnte, Partnerunternehmen und inspirierende Persönlichkeiten an außergewöhnlichen Orten weltweit und im DACH-Raum. Regelmäßige Events, Vorträge und echtes Netzwerk.',
              'Meet like-minded people, partner companies, and inspiring personalities at extraordinary locations worldwide and in the DACH region. Regular events, talks, and genuine networking.'
            )}
          </p>
        </motion.div>

        <div className="mt-10 grid gap-4 sm:grid-cols-2">
          {VALUE_POINTS.map((point, idx) => {
            const Icon = point.icon;
            return (
              <motion.div
                key={idx}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: idx * 0.1 + 0.3 }}
                className="rounded-xl border border-border/40 bg-card p-5"
              >
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-accent/10 text-accent mb-3">
                  <Icon className="h-4 w-4" />
                </div>
                <p className="text-sm font-semibold text-foreground">{point.title}</p>
                <p className="mt-1 text-xs text-muted-foreground leading-relaxed">{point.description}</p>
              </motion.div>
            );
          })}
        </div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.8 }}
          className="mt-10 rounded-xl border border-accent/20 bg-accent/[0.04] p-6 text-center"
        >
          <h3 className="text-base font-semibold text-foreground mb-2">
            {t('Werde Teil des Quarterly Crossing', 'Become Part of the Quarterly Crossing')}
          </h3>
          <p className="text-xs text-muted-foreground mb-4 max-w-md mx-auto">
            {t(
              'Monatliches Abonnement für exklusiven Zugang zu allen Events, Netzwerken und Partner-Programmen.',
              'Monthly subscription for exclusive access to all events, networks, and partner programs.'
            )}
          </p>
          <Button
            size="lg"
            className="bg-accent text-accent-foreground hover:bg-accent/90"
            onClick={() => {
              // TODO: Stripe checkout integration
              window.open('/members/quarterly-crossing', '_self');
            }}
          >
            {t('Jetzt Zugang sichern', 'Get Access Now')}
          </Button>
          <p className="mt-2 text-[10px] text-muted-foreground">{t('Monatlich kündbar', 'Cancel anytime')}</p>
        </motion.div>
      </div>
    );
  }

  // STATE 3: Subscribed — full access
  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:py-12">
      <Link
        to="/members/path"
        className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors mb-8"
      >
        <ArrowLeft className="h-3 w-3" /> {t('Karriereweg', 'Career Path')}
      </Link>

      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
        <div className="flex items-center gap-3 mb-2">
          <Sparkles className="h-4 w-4 text-accent" />
          <Badge variant="outline" className="text-[10px] border-accent/30 text-accent">
            <CheckCircle className="h-3 w-3 mr-1" /> {t('Aktives Mitglied', 'Active Member')}
          </Badge>
        </div>
        <h1 className="font-serif text-2xl sm:text-3xl font-semibold text-foreground">Quarterly Crossing</h1>
        <p className="mt-2 text-sm text-muted-foreground leading-relaxed max-w-lg">
          {t(
            'Du bist Teil des Quarterly Crossing. Hier findest du alle kommenden Events, Partner-Informationen und Networking-Möglichkeiten.',
            'You\'re part of the Quarterly Crossing. Here you\'ll find all upcoming events, partner information, and networking opportunities.'
          )}
        </p>
      </motion.div>

      {/* Upcoming Events */}
      <div className="mt-8">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3 flex items-center gap-2">
          <Calendar className="h-3.5 w-3.5" /> {t('Kommende Events', 'Upcoming Events')}
        </h2>
        <div className="space-y-3">
          {UPCOMING_EVENTS.map((event, idx) => (
            <motion.div
              key={idx}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.1 + 0.3 }}
              className="flex items-center gap-4 rounded-xl border border-border/40 bg-card p-4"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent">
                <MapPin className="h-5 w-5" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground">{event.title}</p>
                <p className="text-xs text-muted-foreground">{event.date}</p>
              </div>
              <Badge variant="outline" className="text-[9px] shrink-0">{event.type}</Badge>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Partner Companies placeholder */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.7 }}
        className="mt-8 rounded-xl border border-border/40 bg-card p-5"
      >
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2 mb-2">
          <Building2 className="h-4 w-4 text-accent" /> {t('Partnerunternehmen', 'Partner Companies')}
        </h3>
        <p className="text-xs text-muted-foreground">
          {t(
            'Die Partner-Liste wird laufend aktualisiert. Neue Unternehmen und Kooperationen werden rechtzeitig bekanntgegeben.',
            'The partner list is continuously updated. New companies and cooperations will be announced in advance.'
          )}
        </p>
      </motion.div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.9 }}
        className="mt-6 rounded-xl border border-accent/20 bg-accent/[0.04] p-5 text-center"
      >
        <p className="text-sm font-medium text-foreground flex items-center justify-center gap-2">
          <CheckCircle className="h-4 w-4 text-accent" />
          {t('Du bist Teil des Quarterly Crossing', 'You are part of the Quarterly Crossing')}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">{t('Nächstes Event wird rechtzeitig bekanntgegeben.', 'Next event will be announced in advance.')}</p>
      </motion.div>
    </div>
  );
}
