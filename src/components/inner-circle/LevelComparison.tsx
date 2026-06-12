import { motion } from 'framer-motion';

const fade = (delay = 0) => ({ initial: { opacity: 0, y: 10 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.5, delay } });

const LEVELS = [
  { level: 'Closer', focus: 'Skill', limitation: 'Time' },
  { level: 'Team Lead', focus: 'People', limitation: 'Management' },
  { level: 'Director', focus: 'Offer', limitation: 'Lead Flow' },
  { level: 'Partner', focus: 'System', limitation: 'Complexity' },
];

export default function LevelComparison() {
  return (
    <motion.section {...fade(0.15)} className="space-y-4">
      <h2 className="font-serif text-lg font-semibold text-foreground">The Difference Between Levels</h2>

      <div className="rounded-lg border border-border/40 overflow-hidden">
        {/* Header */}
        <div className="grid grid-cols-3 bg-muted/50 px-5 py-2.5 border-b border-border/30">
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Level</p>
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Focus</p>
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Limitation</p>
        </div>
        {/* Rows */}
        {LEVELS.map((l, i) => (
          <div key={i} className={`grid grid-cols-3 px-5 py-3 ${i < LEVELS.length - 1 ? 'border-b border-border/20' : ''}`}>
            <p className="text-[12px] font-semibold text-foreground">{l.level}</p>
            <p className="text-[12px] text-foreground">{l.focus}</p>
            <p className="text-[12px] text-muted-foreground">{l.limitation}</p>
          </div>
        ))}
      </div>

      <div className="rounded-lg border border-accent/20 bg-accent/5 p-4">
        <p className="text-xs text-foreground font-medium">Each level removes a constraint — and introduces a new one.</p>
      </div>
    </motion.section>
  );
}
