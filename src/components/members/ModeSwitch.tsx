import { motion } from 'framer-motion';
import { useClosingMode, ClosingMode } from '@/contexts/ClosingModeContext';

const MODES: { key: ClosingMode; label: string; color: string }[] = [
  { key: 'closing', label: 'Closing', color: 'hsl(var(--destructive))' },
  { key: 'top_closing', label: 'Top Closing', color: 'hsl(var(--muted-foreground) / 0.3)' },
  { key: 'ethical', label: 'Ethical', color: 'hsl(var(--primary))' },
];

export default function ModeSwitch() {
  const { mode, setMode } = useClosingMode();

  const activeIdx = MODES.findIndex(m => m.key === mode);

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative flex items-center rounded-full border border-border bg-card p-1 shadow-sm">
        <motion.div
          layout
          transition={{ type: 'spring', stiffness: 500, damping: 35 }}
          className="absolute inset-y-1 rounded-full"
          style={{
            width: `calc(${100 / 3}% - 4px)`,
            left: `calc(${activeIdx * (100 / 3)}% + 2px)`,
            background: MODES[activeIdx].color,
          }}
        />
        {MODES.map((m) => (
          <button
            key={m.key}
            onClick={() => setMode(m.key)}
            className={`relative z-10 rounded-full px-3 py-2 text-xs font-semibold tracking-wide transition-colors duration-200 sm:px-5 sm:text-sm ${
              mode === m.key
                ? m.key === 'closing'
                  ? 'text-destructive-foreground'
                  : m.key === 'ethical'
                    ? 'text-primary-foreground'
                    : 'text-foreground'
                : 'text-muted-foreground hover:text-foreground/70'
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>
    </div>
  );
}
