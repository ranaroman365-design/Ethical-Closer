import { motion } from 'framer-motion';
import { Card, CardContent } from '@/components/ui/card';

const fade = (delay = 0) => ({ initial: { opacity: 0, y: 10 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.5, delay } });

const SCENARIOS = [
  {
    num: '01',
    headline: 'From Skill to First Real Income',
    model: 'Talent Monetization',
    income: '€10k–€20k / mo',
    setup: ['1–2 offers', '€3k–€6k price point', '10–15% commission'],
    performance: ['15–25 calls / week', '20% close rate'],
    result: '8–12 deals / month',
    insight: 'This is where most people stop. You now have income — but not leverage.',
  },
  {
    num: '02',
    headline: 'From Operator to Leveraged Income',
    model: 'Talent Leverage',
    income: '€30k–€80k / mo',
    setup: ['2–4 closers + 1 setter', 'Shared offer', '10–20% override'],
    performance: ['60–120 calls / week', '15–20% close rate'],
    result: '€100k–€300k revenue generated',
    insight: 'You are no longer limited by your own time.',
  },
  {
    num: '03',
    headline: 'From Closing to Owning the Offer',
    model: 'Offer Control',
    income: '€50k–€150k / mo',
    setup: ['1 strong offer', '3–6 closers', 'Structured lead flow'],
    performance: ['€200k–€500k monthly revenue', '20–30% margin'],
    result: 'Full offer ownership',
    insight: 'The offer becomes your main lever.',
  },
  {
    num: '04',
    headline: 'From Single Business to Portfolio',
    model: 'Multi-Offer',
    income: '€150k–€500k / mo',
    setup: ['2–4 offers', 'Shared team', 'Centralized system'],
    performance: ['€500k–€1.5M revenue', 'Diversified income'],
    result: 'Stable, compounding growth',
    insight: 'Risk decreases as structure increases.',
  },
  {
    num: '05',
    headline: 'From Operator to Talent Arbitrage',
    model: 'Placement Arbitrage',
    income: '€50k–€300k / mo',
    setup: ['10–30 closers', '5–10 companies', '€2k–€5k per placement'],
    performance: ['5–20 placements / month', 'Volume-driven'],
    result: 'Flow control, not outcome control',
    insight: 'You control flow, not just outcomes.',
  },
  {
    num: '06',
    headline: 'From Business to Infrastructure',
    model: 'Platform Distribution',
    income: '€100k–€1M+ / mo',
    setup: ['Multiple Directors', 'Multiple offers', 'Platform distribution'],
    performance: ['Revenue share', 'System-level monetization'],
    result: 'Infrastructure-level income',
    insight: 'This is where you stop scaling manually.',
  },
];

export default function ScalingScenarios() {
  return (
    <motion.section {...fade(0.1)} className="space-y-5">
      <div>
        <h2 className="font-serif text-lg font-semibold text-foreground">What Scaling Looks Like in Reality</h2>
        <p className="text-xs text-muted-foreground mt-1">These are structured paths — not random outcomes.</p>
      </div>
      <div className="space-y-3">
        {SCENARIOS.map((s, i) => (
          <Card key={i} className="border-border/40 overflow-hidden">
            <CardContent className="p-0">
              {/* Header bar */}
              <div className="flex items-center justify-between border-b border-border/30 bg-muted/30 px-5 py-3">
                <div className="flex items-center gap-2.5">
                  <span className="text-[10px] font-mono text-muted-foreground">{s.num}</span>
                  <p className="font-serif text-sm font-semibold text-foreground">{s.headline}</p>
                </div>
                <span className="shrink-0 rounded-full bg-accent/10 px-2.5 py-0.5 text-[10px] font-semibold text-accent">{s.income}</span>
              </div>

              <div className="px-5 py-4 space-y-3">
                <span className="inline-block rounded bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">{s.model}</span>

                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="space-y-1.5">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Setup</p>
                    {s.setup.map((item, j) => (
                      <p key={j} className="text-[11px] text-foreground">{item}</p>
                    ))}
                  </div>
                  <div className="space-y-1.5">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Performance</p>
                    {s.performance.map((item, j) => (
                      <p key={j} className="text-[11px] text-foreground">{item}</p>
                    ))}
                  </div>
                  <div className="space-y-1.5">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Result</p>
                    <p className="text-[11px] text-foreground">{s.result}</p>
                  </div>
                </div>

                <p className="text-[11px] text-muted-foreground italic border-t border-border/20 pt-2.5">{s.insight}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </motion.section>
  );
}
