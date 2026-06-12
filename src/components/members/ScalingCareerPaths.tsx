import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import {
  Users, Building2, Layers, ArrowRight, Briefcase,
  Sparkles, Heart, TrendingUp,
} from 'lucide-react';
import { useLanguage } from '@/i18n/LanguageContext';

const PATHS = [
  {
    icon: Users,
    title: 'Interner Weg — Director Track',
    desc: 'Baue dein eigenes Closer-Team auf und werde Director innerhalb der Plattform.',
    to: '/members/director-onboarding',
  },
  {
    icon: Building2,
    title: 'Externer Weg — Placement',
    desc: 'Werde als zertifizierter Ethical Closer bei Partnerunternehmen platziert.',
    to: '/members/placement',
  },
  {
    icon: Layers,
    title: 'Associate Director Modell',
    desc: 'Nutze die Plattform gegen Fee, baue externe Teams und partizipiere am Revenue Share.',
    to: '/members/scale-hub',
  },
  {
    icon: Briefcase,
    title: 'Partner Track',
    desc: 'Langfristige Perspektive: Beteiligung, Leadership und strategische Skalierung.',
    to: '/members/partner-hub',
  },
];

const PRODUCTS = [
  {
    icon: Sparkles,
    title: 'Advanced Lab',
    desc: 'Schneller stabil werden im neuen Umfeld — fortgeschrittene Strategien für Top-Performance.',
    color: 'text-accent',
    bg: 'bg-accent/10',
  },
  {
    icon: Heart,
    title: 'Radiant',
    desc: 'Stabilität, Nervensystem und Entscheidungsfähigkeit — dein innerer Rahmen für nachhaltigen Erfolg.',
    color: 'text-primary',
    bg: 'bg-primary/10',
  },
];

export default function ScalingCareerPaths() {
  return (
    <div className="mt-10">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="mb-6"
      >
        <div className="flex items-center gap-2 mb-1">
          <TrendingUp className="h-4 w-4 text-accent" />
          <h2 className="font-serif text-lg font-semibold text-foreground">
            Scaling & Karrierepfade
          </h2>
        </div>
        <p className="text-xs text-muted-foreground">
          Du hast das Fundament gelegt. Hier sind deine nächsten Möglichkeiten.
        </p>
      </motion.div>

      <div className="space-y-3 mb-8">
        {PATHS.map((path, i) => {
          const Icon = path.icon;
          return (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, delay: i * 0.08 + 0.15 }}
            >
              <Link
                to={path.to}
                className="group flex items-start gap-3 rounded-xl border border-border/40 bg-card p-4 transition-all hover:border-accent/30 hover:shadow-sm"
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent">
                  <Icon className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-semibold text-foreground group-hover:text-accent transition-colors">
                    {path.title}
                  </p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground leading-relaxed">{path.desc}</p>
                </div>
                <ArrowRight className="h-3.5 w-3.5 text-muted-foreground/50 mt-1 shrink-0 transition-transform group-hover:translate-x-0.5" />
              </Link>
            </motion.div>
          );
        })}
      </div>

      {/* Supporting products */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5 }}
      >
        <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground/60">
          Unterstützende Programme
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          {PRODUCTS.map((prod, i) => {
            const Icon = prod.icon;
            return (
              <div
                key={i}
                className="rounded-xl border border-border/30 bg-card p-4"
              >
                <div className="flex items-center gap-2 mb-2">
                  <div className={`flex h-7 w-7 items-center justify-center rounded-md ${prod.bg} ${prod.color}`}>
                    <Icon className="h-3.5 w-3.5" />
                  </div>
                  <span className="text-[12px] font-semibold text-foreground">{prod.title}</span>
                </div>
                <p className="text-[11px] text-muted-foreground leading-relaxed">{prod.desc}</p>
              </div>
            );
          })}
        </div>
      </motion.div>
    </div>
  );
}
