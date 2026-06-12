import { useTrainerMatches, type TrainerMatch } from '@/hooks/useTrainers';
import { useLanguage } from '@/i18n/LanguageContext';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Sparkles, ArrowRight, User } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

/**
 * Compact recommendation widget to embed in Dashboard, Check-in, etc.
 * Shows top 1–2 matched coaches with reason text.
 */
export default function TrainerRecommendationCard() {
  const { matches, loading } = useTrainerMatches();
  const { lang } = useLanguage();
  const navigate = useNavigate();

  if (loading || matches.length === 0) return null;

  const topMatches = matches.slice(0, 2);

  return (
    <Card className="border-[hsl(39,41%,55%)]/15 bg-gradient-to-br from-[hsl(39,41%,55%)]/5 to-transparent">
      <CardContent className="p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-[hsl(39,41%,55%)]" />
          <h3 className="text-sm font-bold text-foreground">
            {lang === 'de' ? 'Empfohlene Unterstützung' : 'Recommended Support'}
          </h3>
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed">
          {lang === 'de'
            ? 'Basierend auf deinem aktuellen Zustand kann geführte Unterstützung deinen Fortschritt beschleunigen.'
            : 'Based on your current state, guided support could accelerate your progress.'}
        </p>

        <div className="space-y-2">
          {topMatches.map(m => {
            const t = m.trainer;
            if (!t) return null;
            return (
              <div
                key={m.id}
                className="flex items-center gap-3 rounded-lg bg-background/60 p-3 cursor-pointer hover:bg-background transition-colors"
                onClick={() => navigate('/members/trainers')}
              >
                <div className="h-9 w-9 rounded-full bg-muted flex items-center justify-center shrink-0">
                  {t.profile_image ? (
                    <img src={t.profile_image} alt={t.name} className="h-9 w-9 rounded-full object-cover" />
                  ) : (
                    <User className="h-4 w-4 text-muted-foreground" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground truncate">{t.name}</p>
                  <p className="text-[11px] text-muted-foreground italic truncate">{m.reason}</p>
                </div>
                <ArrowRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              </div>
            );
          })}
        </div>

        <Button
          variant="ghost"
          size="sm"
          className="w-full text-xs text-[hsl(39,41%,55%)]"
          onClick={() => navigate('/members/trainers')}
        >
          {lang === 'de' ? 'Alle Empfehlungen ansehen' : 'See all recommendations'}
          <ArrowRight className="h-3 w-3 ml-1" />
        </Button>
      </CardContent>
    </Card>
  );
}
