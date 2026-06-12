import { useState, useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ArrowLeft, ArrowRight, Check, Download,
  Play, CheckCircle2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { useAcademyData } from '@/hooks/useAcademyData';
import ModuleQuiz from '@/components/members/ModuleQuiz';
import { useLanguage } from '@/i18n/LanguageContext';

export default function Lesson() {
  const { moduleId } = useParams<{ moduleId: string }>();
  const { tx } = useLanguage();
  const {
    modules, phases, loading, isModuleCompleted,
    toggleModuleComplete, saveNotes, progress,
  } = useAcademyData();

  const mod = modules.find(m => m.id === moduleId);
  const phase = phases.find(p => p.id === mod?.phase_id);

  // Find prev/next in same phase
  const phaseModules = modules
    .filter(m => m.phase_id === mod?.phase_id)
    .sort((a, b) => a.sort_order - b.sort_order);
  const currentIdx = phaseModules.findIndex(m => m.id === moduleId);
  const prevMod = currentIdx > 0 ? phaseModules[currentIdx - 1] : null;
  const nextMod = currentIdx < phaseModules.length - 1 ? phaseModules[currentIdx + 1] : null;

  const existingNotes = progress.find(p => p.module_id === moduleId)?.notes ?? '';
  const [notes, setNotes] = useState(existingNotes);
  const completed = isModuleCompleted(moduleId ?? '');

  useEffect(() => {
    setNotes(progress.find(p => p.module_id === moduleId)?.notes ?? '');
  }, [moduleId, progress]);

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl px-5 py-8 lg:px-10 space-y-4">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="aspect-video w-full rounded-xl" />
        <Skeleton className="h-8 w-64" />
      </div>
    );
  }

  if (!mod) {
    return (
      <div className="mx-auto max-w-3xl px-5 py-8 lg:px-10">
        <p className="text-muted-foreground">{tx('Modul nicht gefunden.', 'Module not found.')}</p>
        <Link to="/members/academy" className="mt-4 text-accent text-sm hover:underline">
          {tx('Zurück zur Academy', 'Back to Academy')}
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-5 py-8 lg:px-10">
      {/* Breadcrumb */}
      <div className="mb-6 flex items-center gap-2 text-[12px] text-muted-foreground">
        <Link to="/members/academy" className="hover:text-foreground transition-colors">Academy</Link>
        <span>/</span>
        <span>{tx('Phase', 'Phase')} {phase?.sort_order}: {phase?.name}</span>
      </div>

      {/* Video Player */}
      {mod.video_url ? (
        (() => {
          const url = mod.video_url!;
          // YouTube embed
          const ytMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/);
          if (ytMatch) {
            return (
              <div className="relative mb-8 aspect-video overflow-hidden rounded-xl">
                <iframe
                  src={`https://www.youtube.com/embed/${ytMatch[1]}`}
                  className="h-full w-full"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              </div>
            );
          }
          // Loom embed
          const loomMatch = url.match(/loom\.com\/share\/([a-zA-Z0-9]+)/);
          if (loomMatch) {
            return (
              <div className="relative mb-8 aspect-video overflow-hidden rounded-xl">
                <iframe
                  src={`https://www.loom.com/embed/${loomMatch[1]}`}
                  className="h-full w-full"
                  allowFullScreen
                />
              </div>
            );
          }
          // Vimeo embed
          const vimeoMatch = url.match(/vimeo\.com\/(\d+)/);
          if (vimeoMatch) {
            return (
              <div className="relative mb-8 aspect-video overflow-hidden rounded-xl">
                <iframe
                  src={`https://player.vimeo.com/video/${vimeoMatch[1]}`}
                  className="h-full w-full"
                  allowFullScreen
                />
              </div>
            );
          }
          // Direct video/audio file (e.g. from storage)
          if (url.includes('.webm') || url.includes('.mp4') || url.includes('.ogg')) {
            return (
              <div className="relative mb-8 aspect-video overflow-hidden rounded-xl bg-[hsl(220,15%,10%)]">
                <video src={url} controls className="h-full w-full" />
              </div>
            );
          }
          // Fallback: just link
          return (
            <div className="mb-8 rounded-xl border border-border/40 bg-card p-4">
              <a href={url} target="_blank" rel="noopener noreferrer" className="text-sm text-accent hover:underline">
                🎬 {tx('Video ansehen (externer Link)', 'Watch video (external link)')}
              </a>
            </div>
          );
        })()
      ) : (
        <div className="relative mb-8 flex aspect-video items-center justify-center overflow-hidden rounded-xl bg-[hsl(220,15%,10%)]">
          <div className="flex flex-col items-center gap-3 text-muted-foreground">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted/10">
              <Play className="h-7 w-7 text-muted-foreground/70 ml-1" />
            </div>
            <span className="text-[13px] font-medium">{tx('Video wird bald verfügbar sein', 'Video coming soon')}</span>
          </div>
        </div>
      )}

      {/* Title + Description */}
      <div className="mb-8">
        <h1 className="font-serif text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
          {mod.title}
        </h1>
        {mod.description && (
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{mod.description}</p>
        )}
      </div>

      {/* Worksheet */}
      {mod.worksheet_url && (
        <div className="mb-6 flex items-center gap-3 rounded-xl border border-border/40 bg-card p-4">
          <Download className="h-4 w-4 shrink-0 text-accent" />
          <div className="flex-1">
            <p className="text-[13px] font-medium text-foreground">{tx('Arbeitsblatt', 'Worksheet')}</p>
            <p className="text-[11px] text-muted-foreground">{tx('PDF Download zum Modul', 'PDF download for the module')}</p>
          </div>
          <Button variant="outline" size="sm" className="text-xs" asChild>
            <a href={mod.worksheet_url} target="_blank" rel="noopener noreferrer">Download</a>
          </Button>
        </div>
      )}

      {/* Notes */}
      <div className="mb-8">
        <label className="mb-2 block text-[12px] font-semibold uppercase tracking-widest text-muted-foreground">
          {tx('Deine Notizen', 'Your Notes')}
        </label>
        <Textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          onBlur={() => { if (notes !== existingNotes) saveNotes(mod.id, notes); }}
          placeholder={tx('Schreibe deine Gedanken und Erkenntnisse…', 'Write your thoughts and insights…')}
          className="min-h-[100px] resize-none border-border/40 bg-card text-sm"
        />
      </div>

      {/* Quiz */}
      <div className="mb-8">
        <ModuleQuiz moduleId={mod.id} onQuizPassed={() => {
          if (!completed) toggleModuleComplete(mod.id);
        }} />
      </div>

      {/* Complete Button */}
      <div className="mb-8 flex justify-center">
        <Button
          onClick={() => toggleModuleComplete(mod.id)}
          className={completed
            ? 'bg-primary/10 text-primary hover:bg-primary/15 border border-primary/20'
            : 'bg-accent text-accent-foreground hover:bg-accent/90'
          }
          size="lg"
        >
          {completed ? (
            <><CheckCircle2 className="mr-2 h-4 w-4" />{tx('Modul abgeschlossen', 'Module completed')}</>
          ) : (
            <><Check className="mr-2 h-4 w-4" />{tx('Als abgeschlossen markieren', 'Mark as completed')}</>
          )}
        </Button>
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-between border-t border-border/40 pt-6">
        {prevMod ? (
          <Link to={`/members/academy/${prevMod.id}`} className="flex items-center gap-2 text-[13px] font-medium text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="h-4 w-4" /> {tx('Vorheriges Modul', 'Previous Module')}
          </Link>
        ) : <div />}
        {nextMod ? (
          <Link to={`/members/academy/${nextMod.id}`} className="flex items-center gap-2 text-[13px] font-medium text-accent hover:text-accent/80 transition-colors">
            {tx('Nächstes Modul', 'Next Module')} <ArrowRight className="h-4 w-4" />
          </Link>
        ) : (
          <Link to="/members/academy" className="flex items-center gap-2 text-[13px] font-medium text-accent hover:text-accent/80 transition-colors">
            {tx('Zurück zur Übersicht', 'Back to Overview')} <ArrowRight className="h-4 w-4" />
          </Link>
        )}
      </div>
    </div>
  );
}
