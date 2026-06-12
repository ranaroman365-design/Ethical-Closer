import { useEffect, useState } from 'react';
import { Sparkles, TrendingUp, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface Block {
  id: string;
  phase: string;
  content: string;
  context: string | null;
  score: number;
  source: string;
  status: string;
  updated_at: string;
}

const PHASES: { key: string; label: string }[] = [
  { key: 'opening', label: 'Opening' },
  { key: 'discovery', label: 'Discovery' },
  { key: 'pain', label: 'Pain' },
  { key: 'pitch', label: 'Pitch' },
  { key: 'objection', label: 'Objection' },
  { key: 'closing', label: 'Closing' },
];

export default function LiveScriptViewer() {
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [loading, setLoading] = useState(true);
  const [scriptName, setScriptName] = useState<string>('Closer Master Script');

  useEffect(() => {
    let active = true;
    (async () => {
      const { data: script } = await (supabase as any)
        .from('sales_scripts')
        .select('id, name, current_version')
        .eq('name', 'Closer Master Script')
        .maybeSingle();
      if (!active || !script) { setLoading(false); return; }
      setScriptName(`${script.name} · v${script.current_version}`);
      const { data: rows } = await (supabase as any)
        .from('script_blocks')
        .select('id, phase, content, context, score, source, status, updated_at')
        .eq('script_id', script.id)
        .eq('status', 'active')
        .order('score', { ascending: false });
      if (active) {
        setBlocks((rows || []) as Block[]);
        setLoading(false);
      }
    })();
    return () => { active = false; };
  }, []);

  if (loading) {
    return (
      <Card className="mb-8 border-border/40 bg-card/50 p-6">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Lade Live Intelligence …
        </div>
      </Card>
    );
  }

  const aiBlocks = blocks.filter(b => b.source === 'AI_PATTERN');
  const manualBlocks = blocks.filter(b => b.source === 'manual');
  const empty = blocks.length === 0;

  return (
    <Card className="mb-8 overflow-hidden border-[hsl(39,41%,55%)]/30 bg-gradient-to-br from-[hsl(220,15%,6%)] to-[hsl(220,15%,9%)] p-6">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-[hsl(39,41%,65%)]" />
          <h2 className="font-serif text-lg font-semibold text-[hsl(39,41%,75%)]">
            Live Intelligence — {scriptName}
          </h2>
        </div>
        <span className="font-mono text-[10px] uppercase tracking-wider text-[hsl(39,41%,55%)]">
          {aiBlocks.length} AI · {manualBlocks.length} manual
        </span>
      </div>

      {empty ? (
        <p className="text-sm text-muted-foreground">
          Noch keine Live-Bausteine. Sobald genug Calls transkribiert und analysiert sind, erscheinen hier
          die besten Phrasen mit Win-Rate.
        </p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {PHASES.map(phase => {
            const phaseBlocks = blocks.filter(b => b.phase === phase.key).slice(0, 3);
            if (phaseBlocks.length === 0) return null;
            return (
              <div key={phase.key} className="rounded-md border border-border/40 bg-background/30 p-3">
                <div className="mb-2 font-mono text-[10px] font-bold uppercase tracking-wider text-[hsl(39,41%,55%)]">
                  {phase.label}
                </div>
                <ul className="space-y-2">
                  {phaseBlocks.map(b => (
                    <li key={b.id} className="text-xs">
                      <div className="flex items-start gap-2">
                        {b.source === 'AI_PATTERN' && (
                          <span className="mt-0.5 inline-flex shrink-0 items-center gap-1 rounded-sm bg-[hsl(39,41%,55%)]/15 px-1.5 py-0.5 font-mono text-[8px] uppercase tracking-wider text-[hsl(39,41%,75%)]">
                            <Sparkles className="h-2.5 w-2.5" />
                            AI
                          </span>
                        )}
                        {b.score >= 70 && (
                          <span className="mt-0.5 inline-flex shrink-0 items-center gap-1 rounded-sm bg-emerald-500/15 px-1.5 py-0.5 font-mono text-[8px] uppercase tracking-wider text-emerald-400">
                            <TrendingUp className="h-2.5 w-2.5" />
                            Top
                          </span>
                        )}
                        <span className={cn('flex-1 leading-relaxed text-foreground/90')}>{b.content}</span>
                      </div>
                      {b.score > 0 && (
                        <div className="mt-1 ml-1 font-mono text-[9px] text-muted-foreground">
                          score {b.score.toFixed(0)} {b.context ? `· ${b.context}` : ''}
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
