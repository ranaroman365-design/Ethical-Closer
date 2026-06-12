import { useState } from 'react';
import { useTrainers, useTrainerMatches, type Trainer } from '@/hooks/useTrainers';
import { useLanguage } from '@/i18n/LanguageContext';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Sparkles, User, ArrowRight, Star, Filter } from 'lucide-react';
import TrainerProfile from '@/components/trainers/TrainerProfile';

const SPECIALTY_LABELS: Record<string, { de: string; en: string }> = {
  nervous_system: { de: 'Nervensystem', en: 'Nervous System' },
  strength: { de: 'Stärke', en: 'Strength' },
  intimacy: { de: 'Intimität', en: 'Intimacy' },
  wealth: { de: 'Wohlstand', en: 'Wealth' },
  clarity: { de: 'Klarheit', en: 'Clarity' },
  purpose: { de: 'Purpose', en: 'Purpose' },
  regulation: { de: 'Regulation', en: 'Regulation' },
};

const STYLE_LABELS: Record<string, { de: string; en: string }> = {
  structured: { de: 'Strukturiert', en: 'Structured' },
  intuitive: { de: 'Intuitiv', en: 'Intuitive' },
  challenging: { de: 'Fordernd', en: 'Challenging' },
  stabilizing: { de: 'Stabilisierend', en: 'Stabilizing' },
};

export default function TrainerDirectory() {
  const { trainers, loading } = useTrainers();
  const { matches, loading: matchesLoading } = useTrainerMatches();
  const { lang } = useLanguage();
  const [selectedTrainer, setSelectedTrainer] = useState<Trainer | null>(null);
  const [filterSpecialty, setFilterSpecialty] = useState<string | null>(null);

  if (selectedTrainer) {
    return (
      <TrainerProfile
        trainer={selectedTrainer}
        matchReason={matches.find(m => m.trainer_id === selectedTrainer.id)?.reason}
        onBack={() => setSelectedTrainer(null)}
      />
    );
  }

  const filtered = filterSpecialty
    ? trainers.filter(t => t.specialties.includes(filterSpecialty))
    : trainers;

  return (
    <div className="mx-auto max-w-4xl px-5 py-8 space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-serif font-bold text-foreground">
          {lang === 'de' ? 'Radiant Coaches & Trainer' : 'Radiant Coaches & Trainers'}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          {lang === 'de'
            ? 'Geführte Unterstützung für deine Transformation'
            : 'Guided support for your transformation'}
        </p>
      </div>

      {/* Recommendations */}
      {matches.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-[hsl(39,41%,55%)]" />
            <h2 className="text-sm font-bold uppercase tracking-wider text-[hsl(39,41%,55%)]">
              {lang === 'de' ? 'Empfohlen für dich' : 'Recommended for You'}
            </h2>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            {matches.map(match => {
              const t = match.trainer;
              if (!t) return null;
              return (
                <Card
                  key={match.id}
                  className="cursor-pointer hover:shadow-md transition-shadow border-[hsl(39,41%,55%)]/20 bg-[hsl(39,41%,55%)]/5"
                  onClick={() => setSelectedTrainer(t)}
                >
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-full bg-[hsl(39,41%,55%)]/20 flex items-center justify-center">
                        {t.profile_image ? (
                          <img src={t.profile_image} alt={t.name} className="h-10 w-10 rounded-full object-cover" />
                        ) : (
                          <User className="h-5 w-5 text-[hsl(39,41%,55%)]" />
                        )}
                      </div>
                      <div>
                        <p className="font-semibold text-sm text-foreground">{t.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {STYLE_LABELS[t.coaching_style]?.[lang] || t.coaching_style}
                        </p>
                      </div>
                      {t.is_featured && <Star className="h-3.5 w-3.5 text-[hsl(39,41%,55%)] ml-auto" />}
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {t.specialties.slice(0, 2).map(s => (
                        <Badge key={s} variant="secondary" className="text-[10px]">
                          {SPECIALTY_LABELS[s]?.[lang] || s}
                        </Badge>
                      ))}
                    </div>
                    <p className="text-xs text-muted-foreground italic leading-relaxed">
                      {match.reason}
                    </p>
                    <Button size="sm" variant="ghost" className="w-full text-xs gap-1">
                      {lang === 'de' ? 'Profil ansehen' : 'View Profile'}
                      <ArrowRight className="h-3 w-3" />
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </section>
      )}

      {/* Filter */}
      <div className="flex items-center gap-2 flex-wrap">
        <Filter className="h-4 w-4 text-muted-foreground" />
        <Button
          size="sm"
          variant={filterSpecialty === null ? 'default' : 'outline'}
          className="text-xs"
          onClick={() => setFilterSpecialty(null)}
        >
          {lang === 'de' ? 'Alle' : 'All'}
        </Button>
        {Object.entries(SPECIALTY_LABELS).map(([key, label]) => (
          <Button
            key={key}
            size="sm"
            variant={filterSpecialty === key ? 'default' : 'outline'}
            className="text-xs"
            onClick={() => setFilterSpecialty(key)}
          >
            {label[lang]}
          </Button>
        ))}
      </div>

      {/* All Coaches */}
      <section className="space-y-3">
        <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
          {lang === 'de' ? 'Alle Coaches' : 'All Coaches'}
        </h2>
        {loading ? (
          <p className="text-sm text-muted-foreground">{lang === 'de' ? 'Laden…' : 'Loading…'}</p>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {lang === 'de' ? 'Noch keine Coaches verfügbar.' : 'No coaches available yet.'}
          </p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {filtered.map(t => (
              <Card
                key={t.id}
                className="cursor-pointer hover:shadow-md transition-shadow"
                onClick={() => setSelectedTrainer(t)}
              >
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center shrink-0">
                      {t.profile_image ? (
                        <img src={t.profile_image} alt={t.name} className="h-12 w-12 rounded-full object-cover" />
                      ) : (
                        <User className="h-6 w-6 text-muted-foreground" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-foreground truncate">{t.name}</p>
                        {t.is_featured && <Star className="h-3.5 w-3.5 text-[hsl(39,41%,55%)] shrink-0" />}
                      </div>
                      <p className="text-xs text-muted-foreground truncate">
                        {t.primary_focus
                          ? SPECIALTY_LABELS[t.primary_focus]?.[lang] || t.primary_focus
                          : STYLE_LABELS[t.coaching_style]?.[lang] || t.coaching_style}
                      </p>
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {t.specialties.slice(0, 3).map(s => (
                          <Badge key={s} variant="outline" className="text-[10px]">
                            {SPECIALTY_LABELS[s]?.[lang] || s}
                          </Badge>
                        ))}
                      </div>
                    </div>
                    <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
