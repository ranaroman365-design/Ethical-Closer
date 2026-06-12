import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { Sparkles, Users, Heart, Calendar, ArrowRight, Compass } from 'lucide-react';

const PRODUCTS = [
  {
    icon: Sparkles,
    title: 'Advanced Lab',
    desc: 'Vertiefte Strategien für Deal-Psychologie, Preisresistenz und Conversions-Optimierung.',
    why: 'Wenn du deine Close Rate nachhaltig über 30% bringen willst.',
    to: '/members/advanced-lab',
    color: 'text-accent',
    bg: 'bg-accent/8',
    border: 'border-accent/15',
  },
  {
    icon: Calendar,
    title: 'Quarterly Crossing',
    desc: 'Community-Events, Netzwerk und strategischer Austausch mit anderen Top Closern.',
    why: 'Wenn du von der Erfahrung anderer profitieren und dein Netzwerk stärken willst.',
    to: '/members/quarterly-crossing',
    color: 'text-primary',
    bg: 'bg-primary/8',
    border: 'border-primary/15',
  },
  {
    icon: Heart,
    title: 'Radiant',
    desc: 'Nervensystem-Diagnostik und Entscheidungsstabilität für nachhaltige Performance.',
    why: 'Wenn du unter Druck stabil bleiben und klare Entscheidungen treffen willst.',
    to: '/members/radiant',
    color: 'text-[hsl(350,70%,55%)]',
    bg: 'bg-[hsl(350,70%,55%)]/8',
    border: 'border-[hsl(350,70%,55%)]/15',
  },
  {
    icon: Users,
    title: 'Partner & Director Track',
    desc: 'Skalierung, Teamaufbau und strategische Beteiligung an der Plattform.',
    why: 'Wenn du vom Closer zum Unternehmer werden willst.',
    to: '/members/scale-hub',
    color: 'text-[hsl(39,41%,55%)]',
    bg: 'bg-[hsl(39,41%,55%)]/8',
    border: 'border-[hsl(39,41%,55%)]/15',
  },
];

export default function AcademyPhase9Upsell() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.2 }}
      className="mt-8"
    >
      <div className="flex items-center gap-2 mb-1">
        <Compass className="h-4 w-4 text-accent" />
        <h3 className="text-sm font-semibold text-foreground">Dein Weg nach der Academy</h3>
      </div>
      <p className="text-[11px] text-muted-foreground mb-5">
        Du hast die Grundlage gemeistert. Jetzt entscheidest du, wohin deine Reise geht.
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        {PRODUCTS.map((prod, i) => {
          const Icon = prod.icon;
          return (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, delay: i * 0.08 + 0.3 }}
            >
              <Link
                to={prod.to}
                className={`group block rounded-xl border ${prod.border} ${prod.bg} p-4 transition-all hover:shadow-sm`}
              >
                <div className="flex items-center gap-2 mb-2">
                  <Icon className={`h-4 w-4 ${prod.color}`} />
                  <span className="text-[12px] font-semibold text-foreground">{prod.title}</span>
                  <ArrowRight className="ml-auto h-3 w-3 text-muted-foreground/40 transition-transform group-hover:translate-x-0.5" />
                </div>
                <p className="text-[11px] text-muted-foreground leading-relaxed mb-2">{prod.desc}</p>
                <p className="text-[10px] font-medium text-foreground/70 italic">
                  → {prod.why}
                </p>
              </Link>
            </motion.div>
          );
        })}
      </div>
    </motion.div>
  );
}
