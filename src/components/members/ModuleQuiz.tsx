import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, XCircle, RotateCcw, Trophy, Sparkles } from 'lucide-react';
import type { QuizQuestion } from '@/types/members';

interface Props {
  moduleId: string;
  onQuizPassed?: () => void;
}

const levelMessages = [
  { threshold: 100, title: '🏆 Perfekt!', message: 'Flawless Victory. Du bist bereit für das nächste Level.' },
  { threshold: 90, title: '🔥 Outstanding!', message: 'Dein Gehirn ist offiziell smarter als 93% aller Leute, die ein Sales-Training anfangen.' },
  { threshold: 80, title: '💪 Stark!', message: 'Solide Performance. Die echten Conversations werden dir leicht fallen.' },
  { threshold: 70, title: '✅ Bestanden!', message: 'Du hast die Grundlagen drauf. Weiter so!' },
];

export default function ModuleQuiz({ moduleId, onQuizPassed }: Props) {
  const { user } = useAuth();
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [correctCount, setCorrectCount] = useState(0);
  const [finished, setFinished] = useState(false);
  const [bestAttempt, setBestAttempt] = useState<{ score: number; total: number; passed: boolean } | null>(null);

  useEffect(() => {
    async function load() {
      const [qRes, aRes] = await Promise.all([
        supabase.from('quiz_questions').select('*').eq('module_id', moduleId).order('sort_order'),
        user
          ? supabase.from('quiz_attempts').select('score, total_questions, passed').eq('module_id', moduleId).eq('user_id', user.id).order('score', { ascending: false }).limit(1)
          : Promise.resolve({ data: [] }),
      ]);
      setQuestions((qRes.data as QuizQuestion[]) ?? []);
      const best = aRes.data?.[0];
      if (best) setBestAttempt({ score: best.score, total: best.total_questions, passed: best.passed });
      setLoading(false);
    }
    load();
  }, [moduleId, user]);

  if (loading || questions.length === 0) return null;

  const q = questions[currentIdx];
  const options = [
    { key: 'A', text: q.option_a },
    { key: 'B', text: q.option_b },
    { key: 'C', text: q.option_c },
    { key: 'D', text: q.option_d },
  ];
  const isCorrect = selected === q.correct_answer;
  const totalQuestions = questions.length;
  const passThreshold = 0.7;

  const handleSelect = (key: string) => {
    if (revealed) return;
    setSelected(key);
  };

  const handleCheck = () => {
    if (!selected) return;
    setRevealed(true);
    if (isCorrect) setCorrectCount(prev => prev + 1);
  };

  const handleNext = async () => {
    if (currentIdx < totalQuestions - 1) {
      setCurrentIdx(prev => prev + 1);
      setSelected(null);
      setRevealed(false);
    } else {
      const score = correctCount;
      const passed = score / totalQuestions >= passThreshold;
      setFinished(true);

      if (user) {
        await supabase.from('quiz_attempts').insert({
          user_id: user.id,
          module_id: moduleId,
          score,
          total_questions: totalQuestions,
          passed,
        });
        if (passed && onQuizPassed) onQuizPassed();
        if (!bestAttempt || score > bestAttempt.score) {
          setBestAttempt({ score, total: totalQuestions, passed });
        }
      }
    }
  };

  const handleRetry = () => {
    setCurrentIdx(0);
    setSelected(null);
    setRevealed(false);
    setCorrectCount(0);
    setFinished(false);
  };

  if (finished) {
    const pct = Math.round((correctCount / totalQuestions) * 100);
    const passed = pct >= passThreshold * 100;
    const levelMsg = passed
      ? levelMessages.find(l => pct >= l.threshold) || levelMessages[levelMessages.length - 1]
      : null;

    return (
      <div className="rounded-xl border border-border/40 bg-card p-6 text-center">
        <div className={`mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full ${passed ? 'bg-primary/10' : 'bg-destructive/10'}`}>
          {passed ? <Trophy className="h-7 w-7 text-primary" /> : <XCircle className="h-7 w-7 text-destructive" />}
        </div>
        <h3 className="font-serif text-lg font-semibold text-foreground">
          {passed ? levelMsg?.title || 'Quiz bestanden!' : 'Quiz nicht bestanden'}
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">
          {correctCount} von {totalQuestions} richtig ({pct}%)
        </p>
        {passed && levelMsg && (
          <div className="mt-3 mx-auto max-w-xs rounded-lg bg-primary/5 border border-primary/20 p-3">
            <Sparkles className="mx-auto mb-1 h-4 w-4 text-primary" />
            <p className="text-[12px] text-foreground leading-relaxed">{levelMsg.message}</p>
          </div>
        )}
        {!passed && (
          <p className="mt-1 text-xs text-muted-foreground">
            Du brauchst mindestens {Math.ceil(passThreshold * 100)}% um zu bestehen.
          </p>
        )}
        <div className="mt-4 flex justify-center gap-2">
          {!passed && (
            <Button variant="outline" size="sm" className="text-xs" onClick={handleRetry}>
              <RotateCcw className="mr-2 h-3 w-3" /> Nochmal versuchen
            </Button>
          )}
          {passed && (
            <Button variant="outline" size="sm" className="text-xs" onClick={handleRetry}>
              <RotateCcw className="mr-2 h-3 w-3" /> Erneut üben
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border/40 bg-card p-5">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Quiz</h3>
        <div className="flex items-center gap-2">
          {bestAttempt && (
            <Badge variant="outline" className={`text-[10px] ${bestAttempt.passed ? 'border-primary/30 text-primary' : 'border-border'}`}>
              Beste: {bestAttempt.score}/{bestAttempt.total}
            </Badge>
          )}
          <Badge variant="outline" className="text-[10px]">
            {currentIdx + 1} / {totalQuestions}
          </Badge>
        </div>
      </div>

      {/* Progress dots */}
      <div className="mb-4 flex gap-1 flex-wrap">
        {questions.map((_, i) => (
          <div
            key={i}
            className={`h-1.5 rounded-full transition-all ${
              i < currentIdx ? 'w-3 bg-primary' : i === currentIdx ? 'w-6 bg-accent' : 'w-3 bg-muted'
            }`}
          />
        ))}
      </div>

      <p className="mb-4 text-[14px] font-medium text-foreground leading-relaxed">{q.question}</p>

      <div className="space-y-2 mb-4">
        {options.map(opt => {
          let cls = 'border-border/40 bg-background hover:border-border/70';
          if (revealed && opt.key === q.correct_answer) cls = 'border-primary/50 bg-primary/5';
          else if (revealed && opt.key === selected && !isCorrect) cls = 'border-destructive/50 bg-destructive/5';
          else if (selected === opt.key && !revealed) cls = 'border-accent/50 bg-accent/5';

          return (
            <button
              key={opt.key}
              onClick={() => handleSelect(opt.key)}
              disabled={revealed}
              className={`flex w-full items-start gap-3 rounded-lg border p-3 text-left transition-colors ${cls}`}
            >
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-border/60 text-[11px] font-bold text-muted-foreground">
                {opt.key}
              </span>
              <span className="text-[13px] text-foreground">{opt.text}</span>
              {revealed && opt.key === q.correct_answer && <CheckCircle2 className="ml-auto mt-0.5 h-4 w-4 shrink-0 text-primary" />}
              {revealed && opt.key === selected && !isCorrect && opt.key !== q.correct_answer && <XCircle className="ml-auto mt-0.5 h-4 w-4 shrink-0 text-destructive" />}
            </button>
          );
        })}
      </div>

      {/* Feedback */}
      {revealed && !isCorrect && (
        <div className="mb-4 rounded-lg bg-muted/50 p-4">
          <p className="text-xs font-semibold text-destructive mb-1">Leider falsch.</p>
          <p className="text-[12px] leading-relaxed text-muted-foreground">{q.explanation}</p>
        </div>
      )}
      {revealed && isCorrect && (
        <div className="mb-4 rounded-lg bg-primary/5 p-4">
          <p className="text-xs font-semibold text-primary mb-1">Richtig! ✓</p>
          <p className="text-[12px] leading-relaxed text-muted-foreground">{q.explanation}</p>
        </div>
      )}

      {!revealed ? (
        <Button onClick={handleCheck} disabled={!selected} className="bg-accent text-accent-foreground hover:bg-accent/90 text-xs" size="sm">
          Antwort prüfen
        </Button>
      ) : (
        <Button onClick={handleNext} className="bg-accent text-accent-foreground hover:bg-accent/90 text-xs" size="sm">
          {currentIdx < totalQuestions - 1 ? 'Nächste Frage' : 'Quiz abschließen'}
        </Button>
      )}
    </div>
  );
}
