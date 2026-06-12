import { useAuth } from '@/hooks/useAuth';
import { PRODUCT } from '@/config/product';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Lock, ArrowLeft, Crown, Users, Briefcase, Layers, TrendingUp, Target, Zap, ArrowRight } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import ScalingScenarios from '@/components/inner-circle/ScalingScenarios';
import LevelComparison from '@/components/inner-circle/LevelComparison';
import StrategicActivation from '@/components/inner-circle/StrategicActivation';
import ScalingPlanWizard from '@/components/inner-circle/ScalingPlanWizard';

const fade = (delay = 0) => ({ initial: { opacity: 0, y: 10 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.5, delay } });

const ASSETS = [
  { icon: Users, title: 'Talent', desc: 'Trained Ethical Closers → Execution Capacity' },
  { icon: Briefcase, title: 'Offers / Partner Companies', desc: 'Products that need sales → Monetization Layer' },
  { icon: Layers, title: 'Platform (B2B Product)', desc: `${PRODUCT.name} System → Infrastructure Layer` },
];

const MODELS = [
  { num: '01', title: 'Monetize Skill', logic: 'Talent → Offer → Commission', desc: 'You close deals, earn per sale, optimize performance.', tag: 'Early Stage' },
  { num: '02', title: 'Multiply Through People', logic: 'Talent → Team → Override Revenue', desc: 'Build a team of closers, earn from their performance, increase volume.', tag: 'Team Lead' },
  { num: '03', title: 'Control the Offer', logic: 'Offer → Talent → Revenue', desc: 'Own or control an offer, plug in closers, scale revenue.', tag: 'Director' },
  { num: '04', title: 'Build a Portfolio', logic: 'Multiple Offers → Shared Talent → Diversified Revenue', desc: 'Multiple offers, shared infrastructure, reduced risk.', tag: 'Multi-Offer' },
  { num: '05', title: 'Control Talent Flow', logic: 'Talent → Companies → Placement Fees', desc: 'Match closers with companies, earn per placement, scale through volume.', tag: 'Placement' },
  { num: '06', title: 'Scale the System', logic: 'Platform → Companies → Revenue Share / License', desc: 'Sell the system, onboard Directors, scale infrastructure.', tag: 'Partner' },
  { num: '07', title: 'Combine Layers', logic: 'Offer + Talent + Platform → Compounding Growth', desc: 'Own offers, run teams, place closers, distribute platform.', tag: 'Hybrid' },
];

const PATHS = [
  { title: 'Director Path', focus: 'Offers · Teams · Revenue', evolution: 'Closer → Team Lead → Director → Multi-Offer Operator' },
  { title: 'Partner Path', focus: 'System · Distribution · Network', evolution: 'Closer → Connector → Partner → Scaling Partner → Equity Partner' },
];

const DRIVERS = [
  { icon: Target, label: 'Deal Size', desc: 'Bigger offers' },
  { icon: TrendingUp, label: 'Volume', desc: 'More closers / more deals' },
  { icon: Zap, label: 'Leverage', desc: 'People + Systems' },
];

const PROMPTS = [
  'Where am I currently operating?',
  'Which model am I already using?',
  'Which asset am I not leveraging yet?',
  'What would multiply my current output fastest?',
];

export default function InnerCircle() {
  const { isAdmin } = useAuth();
  const isInvited = isAdmin; // TODO: gate by level >= 8

  if (!isInvited) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <motion.div {...fade()} className="rounded-xl border border-border/40 bg-card p-8">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
            <Lock className="h-5 w-5 text-muted-foreground" />
          </div>
          <h2 className="font-serif text-xl font-semibold text-foreground">Inner Circle</h2>
          <p className="mt-2 text-sm text-muted-foreground">Nur auf Einladung zugänglich.</p>
          <Link to="/members/path" className="mt-6 inline-flex items-center gap-1.5 text-xs font-medium text-accent hover:underline">
            <ArrowLeft className="h-3 w-3" /> Zurück zum Karriereweg
          </Link>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:py-12 space-y-16">
      {/* Back */}
      <Link to="/members/path" className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors">
        <ArrowLeft className="h-3 w-3" /> Karriereweg
      </Link>

      {/* Hero */}
      <motion.section {...fade()}>
        <div className="flex items-center gap-2 mb-2">
          <Crown className="h-4 w-4 text-accent" />
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">Inner Circle · Scaling Architecture</p>
        </div>
        <h1 className="font-serif text-2xl sm:text-3xl font-semibold text-foreground leading-tight">
          Strategic Control Layer
        </h1>
        <p className="mt-3 text-sm text-muted-foreground leading-relaxed max-w-xl">
          Scaling is not random. It happens when you understand what you control — and how to combine leverage points into compounding systems.
        </p>
      </motion.section>

      {/* 1 — Core Assets */}
      <motion.section {...fade(0.1)} className="space-y-4">
        <h2 className="font-serif text-lg font-semibold text-foreground">Your Leverage Points</h2>
        <p className="text-xs text-muted-foreground">Every scaling model is a combination of these three.</p>
        <div className="grid gap-3 sm:grid-cols-3">
          {ASSETS.map((a, i) => (
            <Card key={i} className="border-border/40">
              <CardContent className="p-5 space-y-2">
                <a.icon className="h-4 w-4 text-accent" />
                <p className="font-serif text-sm font-semibold text-foreground">{a.title}</p>
                <p className="text-[11px] text-muted-foreground leading-relaxed">{a.desc}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </motion.section>

      {/* 2 — Scaling Models */}
      <motion.section {...fade(0.15)} className="space-y-5">
        <div>
          <h2 className="font-serif text-lg font-semibold text-foreground">Scaling Models</h2>
          <p className="text-xs text-muted-foreground mt-1">Choose your path based on what you want to control.</p>
        </div>
        <div className="space-y-3">
          {MODELS.map((m, i) => (
            <Card key={i} className="border-border/40">
              <CardContent className="p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-1.5 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-mono text-muted-foreground">{m.num}</span>
                      <p className="font-serif text-sm font-semibold text-foreground">{m.title}</p>
                    </div>
                    <p className="text-[11px] font-mono text-accent">{m.logic}</p>
                    <p className="text-[11px] text-muted-foreground leading-relaxed">{m.desc}</p>
                  </div>
                  <span className="shrink-0 rounded-full bg-muted px-2.5 py-0.5 text-[10px] font-medium text-muted-foreground">{m.tag}</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
        <div className="rounded-lg border border-accent/20 bg-accent/5 p-4">
          <p className="text-xs text-foreground font-medium">The highest level is not choosing one model. It is combining them.</p>
        </div>
      </motion.section>

      {/* 3 — Scaling Paths */}
      <motion.section {...fade(0.2)} className="space-y-4">
        <h2 className="font-serif text-lg font-semibold text-foreground">Choose Your Path</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {PATHS.map((p, i) => (
            <Card key={i} className="border-border/40">
              <CardContent className="p-5 space-y-3">
                <p className="font-serif text-sm font-semibold text-foreground">{p.title}</p>
                <p className="text-[11px] text-muted-foreground">{p.focus}</p>
                <div className="flex items-center gap-1.5 text-[10px] font-mono text-accent">
                  {p.evolution.split(' → ').map((step, j, arr) => (
                    <span key={j} className="flex items-center gap-1">
                      {step}{j < arr.length - 1 && <ArrowRight className="h-2.5 w-2.5" />}
                    </span>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
        <p className="text-[11px] text-muted-foreground italic">You don't need to do everything. You need to choose what you want to control.</p>
      </motion.section>

      {/* 4 — Value Creation */}
      <motion.section {...fade(0.25)} className="space-y-4">
        <h2 className="font-serif text-lg font-semibold text-foreground">Where Money Comes From</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          {DRIVERS.map((d, i) => (
            <Card key={i} className="border-border/40">
              <CardContent className="p-5 space-y-2">
                <d.icon className="h-4 w-4 text-accent" />
                <p className="font-serif text-sm font-semibold text-foreground">{d.label}</p>
                <p className="text-[11px] text-muted-foreground">{d.desc}</p>
              </CardContent>
            </Card>
          ))}
        </div>
        <div className="rounded-lg border border-accent/20 bg-accent/5 p-4 space-y-1">
          <p className="text-xs text-foreground font-medium">Income grows when at least one of these increases.</p>
          <p className="text-xs text-foreground font-medium">Wealth grows when all three align.</p>
        </div>
      </motion.section>

      {/* 5 — Scaling Scenarios */}
      <ScalingScenarios />

      {/* 6 — Level Comparison */}
      <LevelComparison />

      {/* 7 — Strategic Activation */}
      <StrategicActivation />

      {/* 8 — My Scaling Plan™ */}
      <ScalingPlanWizard />

      {/* 9 — Positioning */}
      <motion.section {...fade(0.35)} className="rounded-xl border border-border/40 bg-card p-6 sm:p-8 space-y-3">
        <h2 className="font-serif text-lg font-semibold text-foreground">Why This Exists</h2>
        <p className="text-[12px] text-muted-foreground leading-relaxed">
          Most people stay operators. This layer exists to turn you into an architect — not just someone who generates income, but someone who controls how income is generated.
        </p>
        <p className="text-[10px] text-muted-foreground italic">Access expands with responsibility and performance.</p>
      </motion.section>
    </div>
  );
}
