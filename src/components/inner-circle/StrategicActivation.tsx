import { motion } from 'framer-motion';
import { Card, CardContent } from '@/components/ui/card';

const fade = (delay = 0) => ({ initial: { opacity: 0, y: 10 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.5, delay } });

const ASSESSMENT = [
  { num: '01', q: 'Are you trading time for money?' },
  { num: '02', q: 'Are you leveraging other people?' },
  { num: '03', q: 'Do you control the offer?' },
  { num: '04', q: 'Do you control the system?' },
];

export default function StrategicActivation() {
  return (
    <motion.section {...fade(0.2)} className="space-y-5">
      <div>
        <h2 className="font-serif text-lg font-semibold text-foreground">Where Are You Operating?</h2>
        <p className="text-xs text-muted-foreground mt-1">Honest answers determine your next move.</p>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        {ASSESSMENT.map((a, i) => (
          <Card key={i} className="border-border/40">
            <CardContent className="p-4 flex items-start gap-2.5">
              <span className="mt-0.5 text-[10px] font-mono text-muted-foreground">{a.num}</span>
              <p className="text-[12px] text-foreground leading-relaxed">{a.q}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="rounded-xl border border-border/40 bg-card p-6 space-y-3">
        <p className="text-[12px] text-foreground leading-relaxed">
          Your next level is defined by what you <span className="font-semibold">stop doing</span> — and what you <span className="font-semibold">start controlling</span>.
        </p>
        <p className="text-[10px] text-muted-foreground italic">Skill → People → Offers → Systems</p>
      </div>
    </motion.section>
  );
}
