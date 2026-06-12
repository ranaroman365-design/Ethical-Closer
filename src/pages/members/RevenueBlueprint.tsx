import { motion } from 'framer-motion';
import { useLanguage } from '@/i18n/LanguageContext';
import {
  Users, Globe, Building2, Layers, ArrowRight,
  TrendingUp, Crown, CheckCircle2,
} from 'lucide-react';

const BLOCKS = [
  {
    icon: Users,
    num: '01',
    title: { de: 'Team Building & Placement Support', en: 'Team Building & Placement Support' },
    what: {
      de: 'Du baust aktiv Talent auf und positionierst es im Markt.',
      en: 'You actively build and position talent in the market.',
    },
    actions: {
      de: ['Talent onboarden & entwickeln', 'In reale Sales-Situationen führen', 'Placement in aktive Opportunities unterstützen'],
      en: ['Onboard and develop talent', 'Guide into real sales situations', 'Support placement into active opportunities'],
    },
    earnings: {
      de: ['Deals-Beteiligung', 'Performance-basierte Provisionen', 'Optionale Support-Vergütung'],
      en: ['Share from deals', 'Performance-based commissions', 'Optional support-based compensation'],
    },
    summary: {
      de: 'Du hilfst Menschen, bereit zu werden — und platziert zu werden.',
      en: 'You help people get ready — and get placed.',
    },
  },
  {
    icon: Globe,
    num: '02',
    title: { de: 'Talent Platform Placement', en: 'Talent Platform Placement' },
    what: {
      de: 'Du nutzt die Plattform, um zertifiziertes Talent zu platzieren — ohne manuelles Matching.',
      en: 'You use the platform to place certified talent — no manual matching required.',
    },
    actions: {
      de: ['Talent zur Zertifizierung führen', 'Sichtbarkeit in der Plattform sicherstellen', 'Angebot & Nachfrage systemisch verbinden'],
      en: ['Guide talent to certification', 'Ensure visibility in the platform', 'Connect supply with demand through the system'],
    },
    earnings: {
      de: ['Plattform-getriebener Deal-Flow', 'Indirekte Revenue aus platzierten Talenten', 'Skalierbar ohne manuellen Aufwand'],
      en: ['Platform-driven deal flow', 'Indirect revenue from placed talent', 'Scalable without manual effort'],
    },
    summary: {
      de: 'Das System platziert Talent — du skalierst es.',
      en: 'The system places talent — you scale it.',
    },
  },
  {
    icon: Building2,
    num: '03',
    title: { de: 'Infrastructure — Sales Teams aufbauen', en: 'Infrastructure — Build Sales Teams' },
    what: {
      de: 'Du installierst das ETC-System in Unternehmen oder Coaching-Businesses.',
      en: 'You install the ETC system inside companies or coaching businesses.',
    },
    actions: {
      de: ['Unternehmen ins System onboarden', 'Sales-Struktur aufsetzen', 'Team-Performance supporten'],
      en: ['Onboard companies to the system', 'Set up their sales structure', 'Support team performance'],
    },
    earnings: {
      de: ['Monatliche Infrastruktur-Gebühren', 'Team-basierte Skalierungs-Revenue', 'Langfristiger Kundenwert'],
      en: ['Monthly infrastructure fees', 'Team-based scaling revenue', 'Long-term client value'],
    },
    summary: {
      de: 'Du hilfst Unternehmen, echte Sales-Teams aufzubauen.',
      en: 'You help companies build real sales teams.',
    },
  },
  {
    icon: Layers,
    num: '04',
    title: { de: 'White Label — Eigenes System skalieren', en: 'White Label — Scale Your Own System' },
    what: {
      de: 'Du baust dein eigenes Sales-Programm auf der ETC-Infrastruktur.',
      en: 'You build your own sales program on the ETC infrastructure.',
    },
    actions: {
      de: ['Eigenes Programm oder Academy launchen', 'Eigene Zielgruppe oder Markt bedienen', 'ETC als Backend-Infrastruktur nutzen'],
      en: ['Launch your own program or academy', 'Bring your own audience or market', 'Use ETC as backend infrastructure'],
    },
    earnings: {
      de: ['Programm-Revenue', 'Skalierbare Distribution', 'Langfristiges Upside'],
      en: ['Program revenue', 'Scalable distribution', 'Long-term upside'],
    },
    summary: {
      de: 'Du baust dein eigenes Business auf dem System.',
      en: 'You build your own business on top of the system.',
    },
  },
];

const LEVELS = [
  {
    icon: TrendingUp,
    label: 'Level 7 — Director',
    focus: {
      de: ['Execution', 'Revenue', 'Team Performance'],
      en: ['Execution', 'Revenue', 'Team Performance'],
    },
    desc: {
      de: 'Du operierst aktiv über alle Building Blocks. Du baust Teams, treibst Deals und nutzt das System.',
      en: 'You actively operate across all building blocks. You build teams, drive deals, and use the system.',
    },
  },
  {
    icon: Crown,
    label: 'Level 8 — Partner',
    focus: {
      de: ['Leverage', 'System Growth', 'Multiple Revenue Streams'],
      en: ['Leverage', 'System Growth', 'Multiple Revenue Streams'],
    },
    desc: {
      de: 'Du skalierst die Building Blocks. Du erweiterst Strukturen, bringst Business und multiplizierst Output.',
      en: 'You scale the building blocks. You expand structures, bring business, and multiply output.',
    },
  },
];

const PARTNER_CRITERIA = {
  de: [
    'Deine Teams performen ohne dich',
    'Du generierst konsistente Revenue',
    'Du trägst über deine eigenen Deals hinaus bei',
    'Du nutzt mehrere Building Blocks',
  ],
  en: [
    'Your teams perform without you',
    'You generate consistent revenue',
    'You contribute beyond your own deals',
    'You use multiple building blocks',
  ],
};

export default function RevenueBlueprint() {
  const { lang } = useLanguage();
  const t = (de: string, en: string) => (lang === 'de' ? de : en);

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:py-12">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="mb-10"
      >
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground mb-3">
          Level 7 & 8
        </p>
        <h1 className="font-serif text-2xl font-semibold tracking-tight text-foreground sm:text-3xl mb-3">
          {t(
            'Die 4 Wege, Revenue im System aufzubauen',
            'The 4 Ways to Build Revenue in the System'
          )}
        </h1>
        <p className="text-sm text-muted-foreground leading-relaxed max-w-xl">
          {t(
            'Ab Level 7 und 8 verlässt du dich nicht auf eine Einkommensquelle. Du nutzt vier klare Building Blocks, um Revenue zu generieren und zu skalieren.',
            'At Level 7 and Level 8, you don\'t rely on one source of income. You use four clear building blocks to generate and scale revenue.'
          )}
        </p>
      </motion.div>

      {/* Building Blocks */}
      <div className="space-y-5 mb-12">
        {BLOCKS.map((block, i) => {
          const Icon = block.icon;
          return (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: i * 0.08 + 0.15 }}
              className="rounded-xl border border-border/40 bg-card overflow-hidden"
            >
              {/* Block header */}
              <div className="flex items-center gap-3 border-b border-border/30 px-5 py-4">
                <span className="font-mono text-[11px] font-bold text-muted-foreground/50">{block.num}</span>
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent">
                  <Icon className="h-4.5 w-4.5" />
                </div>
                <h2 className="text-[14px] font-semibold text-foreground">{block.title[lang]}</h2>
              </div>

              <div className="px-5 py-4 space-y-4">
                <p className="text-[12px] text-muted-foreground leading-relaxed">{block.what[lang]}</p>

                <div className="grid gap-4 sm:grid-cols-2">
                  {/* What you do */}
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-muted-foreground/60 mb-2">
                      {t('Was du tust', 'What you do')}
                    </p>
                    <ul className="space-y-1.5">
                      {block.actions[lang].map((a, j) => (
                        <li key={j} className="flex items-start gap-2 text-[11px] text-foreground/80">
                          <ArrowRight className="h-3 w-3 text-accent shrink-0 mt-0.5" />
                          {a}
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* How you earn */}
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-muted-foreground/60 mb-2">
                      {t('Wie du verdienst', 'How you earn')}
                    </p>
                    <ul className="space-y-1.5">
                      {block.earnings[lang].map((e, j) => (
                        <li key={j} className="flex items-start gap-2 text-[11px] text-foreground/80">
                          <CheckCircle2 className="h-3 w-3 text-primary shrink-0 mt-0.5" />
                          {e}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                {/* Summary */}
                <div className="rounded-lg bg-muted/30 px-4 py-2.5">
                  <p className="text-[11px] font-medium text-foreground/70 italic">
                    {block.summary[lang]}
                  </p>
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Level Cards */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.55 }}
        className="mb-10"
      >
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground mb-4">
          {t('Rollen', 'Roles')}
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          {LEVELS.map((lvl, i) => {
            const Icon = lvl.icon;
            return (
              <div
                key={i}
                className="rounded-xl border border-border/40 bg-card p-5"
              >
                <div className="flex items-center gap-2 mb-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent/10 text-accent">
                    <Icon className="h-4 w-4" />
                  </div>
                  <span className="text-[13px] font-semibold text-foreground">{lvl.label}</span>
                </div>
                <p className="text-[11px] text-muted-foreground leading-relaxed mb-3">{lvl.desc[lang]}</p>
                <div className="flex flex-wrap gap-1.5">
                  {lvl.focus[lang].map((f, j) => (
                    <span
                      key={j}
                      className="rounded-full bg-accent/10 px-2.5 py-0.5 text-[10px] font-medium text-accent"
                    >
                      {f}
                    </span>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </motion.div>

      {/* Path to Partner */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.65 }}
        className="rounded-xl border border-accent/20 bg-accent/[0.03] p-5 mb-8"
      >
        <p className="text-[11px] font-bold text-accent mb-3">
          {t('Path to Partner', 'Path to Partner')}
        </p>
        <ul className="space-y-2">
          {PARTNER_CRITERIA[lang].map((c, i) => (
            <li key={i} className="flex items-start gap-2 text-[11px] text-foreground/80">
              <CheckCircle2 className="h-3.5 w-3.5 text-accent shrink-0 mt-0.5" />
              {c}
            </li>
          ))}
        </ul>
      </motion.div>

      {/* Final Principle */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.75 }}
        className="rounded-xl border border-border/30 bg-card p-5 text-center"
      >
        <p className="font-serif text-[15px] font-semibold text-foreground mb-2">
          {t('Du bist nicht auf einen Weg beschränkt.', 'You are not limited to one path.')}
        </p>
        <p className="text-[11px] text-muted-foreground leading-relaxed max-w-md mx-auto">
          {t(
            'Die stärksten Operatoren bauen Teams, platzieren Talent, installieren Systeme und skalieren Distribution. Je mehr Ebenen du nutzt, desto mehr verdienst du.',
            'The strongest operators build teams, place talent, install systems, and scale distribution. The more layers you use, the more you earn.'
          )}
        </p>
      </motion.div>
    </div>
  );
}
