import { useState, useEffect } from 'react';
import { PRODUCT } from '@/config/product';
import { Link } from 'react-router-dom';
import { Check, ArrowRight, ChevronRight, Zap, TrendingUp, Shield, CheckCircle2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { motion, AnimatePresence } from 'framer-motion';
import logoImg from '@/assets/ethical-top-closer-logo.png';

/* ─── Data ─── */
const COMMITMENTS = [
  'Ich will leistungsbasiert verdienen',
  'Ich will ortsunabhängig arbeiten',
  'Ich bin bereit, Verantwortung zu übernehmen',
];

const STORIES = [
  { name: 'Luzi', before: 'Studentin, unsicher im Sales', after: 'Nach 6 Wochen: erste Calls', today: 'Verdient mit Entscheidungen' },
  { name: 'Nastja', before: 'Angestellt, wenig Freiheit', after: 'Nach kurzer Zeit: erste Abschlüsse', today: 'Arbeitet ortsunabhängig' },
  { name: 'Marcel', before: '9–5, gedeckelt', after: 'Nach Einstieg: echte Gespräche', today: 'Verdient pro Deal' },
  { name: 'Cedric', before: 'Viel Theorie', after: 'Nach System: echte Praxis', today: 'Erste Provisionen' },
];

/* ─── Colors (HSL tokens from design system) ─── */
const gold = 'hsl(39,41%,54%)';
const dark = 'hsl(0,0%,4%)';

/* ─── SEO Head injection ─── */
function useFunnelSEO() {
  useEffect(() => {
    const prev = document.title;
    document.title = `${PRODUCT.nameTM} – High-Ticket Closing Masterclass | 27 €`;

    const metas: HTMLMetaElement[] = [];
    const set = (attr: string, val: string, content: string) => {
      const el = document.createElement('meta');
      el.setAttribute(attr, val);
      el.content = content;
      document.head.appendChild(el);
      metas.push(el);
    };

    set('name', 'description', 'Lerne High-Ticket Closing mit Integrität. Kein Druckverkauf, kein Cold Calling – ein klares System für leistungsbasiertes Einkommen. Masterclass für 27 €.');
    set('property', 'og:title', 'Ethical Top Closer™ – High-Ticket Closing Masterclass');
    set('property', 'og:description', 'Kein Druckverkauf. Kein Cold Calling. Ein klares System für hochpreisige Entscheidungen – und leistungsbasiertes Einkommen.');
    set('property', 'og:type', 'website');
    set('property', 'og:image', 'https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/ef6aa4d3-c839-4cbd-89a8-b21e7471d230/id-preview-c5707949--b55b6158-0d09-4a92-9c49-b8c77861e2a1.lovable.app-1772017437609.png');
    set('name', 'twitter:card', 'summary_large_image');
    set('name', 'twitter:title', 'Ethical Top Closer™ – High-Ticket Closing Masterclass');
    set('name', 'twitter:description', 'Lerne ethisches High-Ticket Closing. 27 € Masterclass – kein Druck, echte Ergebnisse.');

    // JSON-LD
    const ld = document.createElement('script');
    ld.type = 'application/ld+json';
    ld.textContent = JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'Course',
      name: 'Ethical Top Closer™ Masterclass',
      description: 'High-Ticket Closing mit Integrität – leistungsbasiertes Einkommen statt 9–5.',
      provider: { '@type': 'Organization', name: 'Radiant' },
      offers: { '@type': 'Offer', price: '27', priceCurrency: 'EUR', availability: 'https://schema.org/InStock' },
    });
    document.head.appendChild(ld);

    return () => {
      document.title = prev;
      metas.forEach(m => m.remove());
      ld.remove();
    };
  }, []);
}

/* ─── Reusable CTA ─── */
const CtaBlock = ({ id, size = 'lg' }: { id?: string; size?: 'lg' | 'default' }) => (
  <div id={id} className="flex flex-col items-center gap-2">
    <Link to="/start/bewerbung">
      <Button
        size={size}
        className="bg-accent text-accent-foreground hover:opacity-90 font-bold text-sm px-8 py-6 shadow-[0_0_40px_hsl(39,41%,54%,0.2)]"
      >
        Zugang zur Masterclass sichern
        <ArrowRight className="ml-2 h-4 w-4" />
      </Button>
    </Link>
    <p className="text-xs text-white/40">27 € – wird vollständig angerechnet</p>
    <p className="text-[11px] text-accent/60 font-medium tracking-wide">Zugang aktuell geöffnet</p>
  </div>
);

/* ─── Section wrapper ─── */
const Section = ({ children, alt, className = '' }: { children: React.ReactNode; alt?: boolean; className?: string }) => (
  <section className={`border-t border-white/[0.06] ${alt ? 'bg-white/[0.015]' : ''} ${className}`}>
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ duration: 0.6 }}
      className="mx-auto max-w-3xl px-5 py-16 sm:px-6 sm:py-24"
    >
      {children}
    </motion.div>
  </section>
);

const Tag = ({ children }: { children: React.ReactNode }) => (
  <p className="mb-4 text-[10px] font-bold uppercase tracking-[0.25em] text-accent/70">{children}</p>
);

const H2 = ({ children }: { children: React.ReactNode }) => (
  <h2 className="font-serif text-[22px] font-bold leading-tight sm:text-[32px]">{children}</h2>
);

/* ─── Main Component ─── */
export default function Funnel() {
  const [checked, setChecked] = useState<boolean[]>([true, true, true]);
  const [stickyVisible, setStickyVisible] = useState(false);

  useFunnelSEO();

  useEffect(() => {
    const onScroll = () => setStickyVisible(window.scrollY > 600);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const toggle = (i: number) =>
    setChecked(prev => prev.map((v, idx) => (idx === i ? !v : v)));

  return (
    <div className="min-h-screen bg-[hsl(0,0%,4%)] text-[hsl(36,33%,92%)]">
      {/* ── HEADER ── */}
      <header className="sticky top-0 z-50 border-b border-white/[0.06] bg-[hsl(0,0%,4%)]/95 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
          <Link to="/nextrealstep" className="flex items-center gap-2.5" aria-label="Ethical Top Closer Startseite">
            <img src={logoImg} alt="Ethical Top Closer™" className="h-7 w-auto" loading="eager" width={112} height={28} />
            <span className="hidden font-serif text-sm font-semibold tracking-tight text-white/90 sm:inline">
              Ethical Top Closer™
            </span>
          </Link>
          <div className="flex items-center gap-2 sm:gap-3">
            <Link to="/members/login">
              <Button variant="ghost" size="sm" className="text-[11px] sm:text-xs text-white/60 hover:text-white hover:bg-white/5">
                Zum Mitgliederbereich
              </Button>
            </Link>
            <a href="#masterclass-cta">
              <Button size="sm" className="bg-accent text-accent-foreground hover:opacity-90 text-[11px] sm:text-xs font-semibold px-4">
                Masterclass starten
              </Button>
            </a>
          </div>
        </div>
      </header>

      {/* ══════════════════════════════════════════════════════════
          1. HERO
         ══════════════════════════════════════════════════════════ */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-accent/[0.04] via-transparent to-transparent" />
        <div className="relative mx-auto max-w-3xl px-5 pb-16 pt-16 sm:px-6 sm:pt-24 sm:pb-24 text-center">
          <motion.p initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}
            className="mb-6 text-[10px] sm:text-[11px] font-bold uppercase tracking-[0.25em] text-accent">
            High-Ticket Closing System by Radiant™
          </motion.p>

          <motion.h1 initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.1 }}
            className="font-serif text-[28px] leading-[1.2] font-bold tracking-tight sm:text-[42px] sm:leading-[1.15]">
            Lerne High-Ticket Closing –
            <br className="hidden sm:block" />
            <span className="text-accent"> und verdiene deine ersten Provisionen</span> ohne 9–5
          </motion.h1>

          <motion.p initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.25 }}
            className="mx-auto mt-6 max-w-xl text-[14px] leading-relaxed text-white/55 sm:text-base">
            Kein Druckverkauf. Kein Cold Calling.<br />
            Sondern ein klares System, mit dem du hochpreisige Entscheidungen begleitest – und dafür bezahlt wirst.
          </motion.p>

          {/* Bridge line */}
          <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.35, duration: 0.5 }}
            className="mx-auto mt-4 max-w-md text-[13px] italic text-accent/70">
            Für Menschen, die nicht verkaufen wollen – sondern Gespräche auf Augenhöhe führen.
          </motion.p>

          {/* Pre-checked micro-commitment checkboxes */}
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.45, duration: 0.5 }}
            className="mx-auto mt-8 flex max-w-md flex-col gap-2.5">
            {COMMITMENTS.map((text, i) => (
              <button key={i} onClick={() => toggle(i)}
                className="group flex items-center gap-3 rounded-lg border border-white/[0.06] bg-white/[0.02] px-4 py-2.5 text-left transition-all hover:border-white/[0.12] hover:bg-white/[0.04]">
                <div className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-all ${
                  checked[i] ? 'border-accent bg-accent' : 'border-white/20 bg-transparent'
                }`}>
                  {checked[i] && <Check className="h-3 w-3 text-accent-foreground" />}
                </div>
                <span className="text-[13px] text-white/70 group-hover:text-white/90">{text}</span>
              </button>
            ))}
          </motion.div>

          {/* CTA */}
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6, duration: 0.5 }}
            className="mt-10">
            <CtaBlock id="masterclass-cta" />
          </motion.div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════
          2. PROBLEM AGITATION
         ══════════════════════════════════════════════════════════ */}
      <Section alt>
        <Tag>Die unbequeme Wahrheit</Tag>
        <H2>Dein Einkommen ist gedeckelt</H2>
        <div className="mt-8 space-y-5 text-[14px] leading-relaxed text-white/55 sm:text-[15px]">
          <p>Im klassischen 9–5 tauschst du Zeit gegen Geld.</p>
          <p>Egal wie gut du bist – dein Einkommen bleibt begrenzt.<br />Mehr Stunden bedeuten nicht mehr Freiheit. Nur mehr Belastung.</p>
          <div className="rounded-xl border border-accent/15 bg-accent/[0.04] p-5 sm:p-6">
            <p className="font-serif text-[15px] font-semibold text-white/85 sm:text-[17px]">High-Ticket Closing bedeutet:</p>
            <p className="mt-2 text-white/60">Du wirst für <span className="text-accent font-medium">Entscheidungen</span> bezahlt – nicht für Zeit.</p>
          </div>
        </div>
      </Section>

      {/* ══════════════════════════════════════════════════════════
          3. DESIRE / FUTURE STATE
         ══════════════════════════════════════════════════════════ */}
      <Section>
        <Tag>Deine Zukunft</Tag>
        <H2>Was passiert, wenn du das System beherrschst</H2>
        <div className="mt-8 space-y-3">
          {[
            'Du führst echte Gespräche statt zu verkaufen',
            'Du arbeitest mit hochwertigen Kunden',
            'Du verdienst an Entscheidungen, nicht an Stunden',
            'Du kannst ortsunabhängig arbeiten',
          ].map(item => (
            <div key={item} className="flex items-start gap-3">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
              <p className="text-[14px] text-white/65 sm:text-[15px]">{item}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* ══════════════════════════════════════════════════════════
          4. MECHANISM
         ══════════════════════════════════════════════════════════ */}
      <Section alt>
        <Tag>Das System</Tag>
        <H2>Das Ethical Closing System™ by Radiant™</H2>
        <div className="mt-8 space-y-3">
          {[
            'Klare Gesprächsstruktur ohne Druckverkauf',
            'Psychologie hinter echten Entscheidungen',
            'Praxis statt endloser Theorie',
            'Direkter Einstieg in reale Sales-Prozesse',
          ].map(item => (
            <div key={item} className="flex items-start gap-3">
              <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
              <p className="text-[14px] text-white/65 sm:text-[15px]">{item}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* ══════════════════════════════════════════════════════════
          5. SPEED / DIFFERENTIATION
         ══════════════════════════════════════════════════════════ */}
      <Section>
        <Tag>Der Unterschied</Tag>
        <H2>Der entscheidende Unterschied</H2>
        <div className="mt-8 grid gap-3 sm:grid-cols-3">
          {[
            { icon: Zap, label: 'Sofort starten', desc: 'Kein monatelanges Warten auf Theorie-Ende' },
            { icon: TrendingUp, label: 'Echte Gespräche', desc: 'Früh in reale Calls einsteigen' },
            { icon: Shield, label: 'Erste Provisionen', desc: 'Möglich ab Level 1' },
          ].map(({ icon: Icon, label, desc }) => (
            <div key={label} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 sm:p-5">
              <Icon className="mb-3 h-5 w-5 text-accent" />
              <p className="text-[13px] font-semibold text-white/85">{label}</p>
              <p className="mt-1 text-[12px] text-white/45">{desc}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* ══════════════════════════════════════════════════════════
          6. SOCIAL PROOF – Story Cards with mobile swipe
         ══════════════════════════════════════════════════════════ */}
      <Section alt>
        <Tag>Ergebnisse</Tag>
        <H2>Von Theorie zu echten Provisionen</H2>
        <p className="mt-2 text-[14px] text-white/45">Menschen, die genau da standen, wo du heute bist.</p>

        {/* Horizontal scroll on mobile, grid on desktop */}
        <div className="mt-8 -mx-5 px-5 sm:mx-0 sm:px-0">
          <div className="flex gap-4 overflow-x-auto pb-4 snap-x snap-mandatory sm:grid sm:grid-cols-2 sm:overflow-visible sm:pb-0">
            {STORIES.map(({ name, before, after, today }) => (
              <div key={name} className="min-w-[260px] snap-start rounded-xl border border-white/[0.06] bg-white/[0.02] p-5 flex-shrink-0 sm:min-w-0">
                <p className="font-serif text-lg font-bold text-accent">{name}</p>
                <div className="mt-3 space-y-2 text-[12px] leading-relaxed">
                  <p className="text-white/40"><span className="font-medium text-white/55">Vorher:</span> {before}</p>
                  <p className="text-white/50">{after}</p>
                  <p className="text-white/70 font-medium">Heute: {today}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <p className="mt-8 text-center text-[13px] italic text-white/40">
          Das sind keine Ausnahmen. Das ist das Ergebnis eines klaren Systems.
        </p>
      </Section>

      {/* ══════════════════════════════════════════════════════════
          7. OFFER
         ══════════════════════════════════════════════════════════ */}
      <Section>
        <Tag>Dein Einstieg</Tag>
        <H2>Dein Einstieg</H2>
        <p className="mt-4 text-[14px] text-white/55 sm:text-[15px]">In der Masterclass verstehst du:</p>
        <div className="mt-6 space-y-3">
          {[
            'Wie High-Ticket Closing wirklich funktioniert',
            'Ob das Modell zu dir passt',
            'Wie du deine ersten echten Deals machst',
          ].map(item => (
            <div key={item} className="flex items-start gap-3">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
              <p className="text-[14px] text-white/65 sm:text-[15px]">{item}</p>
            </div>
          ))}
        </div>
        <div className="mt-10">
          <CtaBlock />
        </div>
      </Section>

      {/* ══════════════════════════════════════════════════════════
          8. ETHICAL URGENCY (no fake scarcity!)
         ══════════════════════════════════════════════════════════ */}
      <Section alt>
        <div className="mx-auto max-w-lg text-center">
          <H2>Du entscheidest.</H2>
          <p className="mt-6 text-[14px] text-white/50 leading-relaxed">
            Kein künstlicher Druck. Keine gefälschte Verknappung.<br />
            Du entscheidest, ob das dein Weg ist.
          </p>
          <p className="mt-4 font-serif text-[15px] font-medium text-accent/80">
            Die Frage ist nur: Wie lange willst du noch warten?
          </p>
        </div>
      </Section>

      {/* ══════════════════════════════════════════════════════════
          9. FINAL CTA
         ══════════════════════════════════════════════════════════ */}
      <section className="border-t border-white/[0.06]">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-60px' }}
          transition={{ duration: 0.6 }}
          className="mx-auto max-w-xl px-5 py-16 sm:py-24 text-center"
        >
          <h2 className="font-serif text-[22px] font-bold sm:text-[32px] leading-tight">
            Du wirst entweder weiter Zeit gegen Geld tauschen –
            <span className="text-accent"> oder anfangen, für Entscheidungen bezahlt zu werden.</span>
          </h2>
          <div className="mt-10">
            <CtaBlock />
          </div>
        </motion.div>
      </section>

      {/* ── FOOTER ── */}
      <footer className="border-t border-white/[0.06] py-8">
        <nav className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-x-4 gap-y-2 px-5 text-[11px] text-white/30" aria-label="Footer-Navigation">
          <Link to="/legal-notice" className="hover:text-white/50 transition-colors">Legal Notice</Link>
          <span aria-hidden>·</span>
          <Link to="/privacy" className="hover:text-white/50 transition-colors">Privacy</Link>
          <span aria-hidden>·</span>
          <Link to="/terms" className="hover:text-white/50 transition-colors">Terms</Link>
          <span aria-hidden>·</span>
          <Link to="/refund-policy" className="hover:text-white/50 transition-colors">Refund</Link>
          <span aria-hidden>·</span>
          <Link to="/cookie-policy" className="hover:text-white/50 transition-colors">Cookies</Link>
        </nav>
      </footer>

      {/* ── STICKY CTA BAR ── */}
      <AnimatePresence>
        {stickyVisible && (
          <motion.div
            initial={{ y: 80 }}
            animate={{ y: 0 }}
            exit={{ y: 80 }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            className="fixed bottom-0 left-0 right-0 z-50 border-t border-white/[0.06] bg-[hsl(0,0%,4%)]/95 backdrop-blur-md"
          >
            <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
              <p className="hidden font-serif text-sm font-medium text-white/70 sm:block">
                Jetzt Zugang sichern – 27 €
              </p>
              <Link to="/start/bewerbung" className="ml-auto">
                <Button size="sm" className="bg-accent text-accent-foreground hover:opacity-90 font-semibold text-xs px-6">
                  Jetzt Zugang sichern <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                </Button>
              </Link>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
