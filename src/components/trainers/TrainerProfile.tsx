import { useState } from 'react';
import { type Trainer } from '@/hooks/useTrainers';
import { useTrainerRequest } from '@/hooks/useTrainers';
import { useLanguage } from '@/i18n/LanguageContext';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ArrowLeft, User, Star, Check, MessageCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

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

interface Props {
  trainer: Trainer;
  matchReason?: string;
  onBack: () => void;
}

export default function TrainerProfile({ trainer, matchReason, onBack }: Props) {
  const { lang } = useLanguage();
  const { sendRequest } = useTrainerRequest();
  const { toast } = useToast();
  const [showRequest, setShowRequest] = useState(false);
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSend = async () => {
    setSending(true);
    const { error } = await sendRequest(trainer.id, message);
    setSending(false);
    if (error) {
      toast({ title: 'Error', description: error, variant: 'destructive' });
    } else {
      setSent(true);
      toast({
        title: lang === 'de' ? 'Anfrage gesendet' : 'Request sent',
        description: lang === 'de' ? 'Der Coach wird sich bei dir melden.' : 'The coach will get back to you.',
      });
    }
  };

  const levelRange = trainer.levels_supported.length > 0
    ? `Level ${Math.min(...trainer.levels_supported)}–${Math.max(...trainer.levels_supported)}`
    : '';

  return (
    <div className="mx-auto max-w-2xl px-5 py-8 space-y-6">
      {/* Back */}
      <button
        onClick={onBack}
        className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        {lang === 'de' ? 'Zurück' : 'Back'}
      </button>

      {/* Hero */}
      <div className="flex items-center gap-4">
        <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center shrink-0">
          {trainer.profile_image ? (
            <img src={trainer.profile_image} alt={trainer.name} className="h-16 w-16 rounded-full object-cover" />
          ) : (
            <User className="h-8 w-8 text-muted-foreground" />
          )}
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-serif font-bold text-foreground">{trainer.name}</h1>
            {trainer.is_featured && <Star className="h-4 w-4 text-[hsl(39,41%,55%)]" />}
          </div>
          <p className="text-sm text-muted-foreground">
            {STYLE_LABELS[trainer.coaching_style]?.[lang] || trainer.coaching_style}
            {levelRange && ` · ${levelRange}`}
          </p>
        </div>
      </div>

      {/* Match reason */}
      {matchReason && (
        <Card className="border-[hsl(39,41%,55%)]/20 bg-[hsl(39,41%,55%)]/5">
          <CardContent className="p-4 text-sm text-foreground italic">
            {matchReason}
          </CardContent>
        </Card>
      )}

      {/* Best For */}
      <section>
        <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">
          {lang === 'de' ? 'Ideal für' : 'Best For'}
        </h2>
        <div className="flex flex-wrap gap-2">
          {trainer.specialties.map(s => (
            <Badge key={s} variant="secondary">
              {SPECIALTY_LABELS[s]?.[lang] || s}
            </Badge>
          ))}
          {levelRange && <Badge variant="outline">{levelRange}</Badge>}
        </div>
      </section>

      {/* Bio */}
      <section>
        <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">
          {lang === 'de' ? 'Über' : 'About'}
        </h2>
        <p className="text-sm text-foreground leading-relaxed whitespace-pre-line">{trainer.bio}</p>
      </section>

      {/* Formats */}
      <section>
        <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">
          {lang === 'de' ? 'Formate' : 'Formats'}
        </h2>
        <div className="flex flex-wrap gap-2">
          {trainer.formats.map(f => (
            <Badge key={f} variant="outline">{f}</Badge>
          ))}
        </div>
      </section>

      {/* CTA */}
      {!showRequest && !sent && (
        <div className="space-y-3 pt-2">
          <Button
            className="w-full bg-[hsl(39,41%,55%)] hover:bg-[hsl(39,41%,45%)] text-white"
            onClick={() => setShowRequest(true)}
          >
            <MessageCircle className="h-4 w-4 mr-2" />
            {lang === 'de' ? 'Intro-Call anfragen' : 'Request Intro Call'}
          </Button>
          {trainer.pricing_intro_call > 0 && (
            <p className="text-xs text-center text-muted-foreground">
              Intro Call: €{trainer.pricing_intro_call}
            </p>
          )}
          {trainer.pricing_intro_call === 0 && (
            <p className="text-xs text-center text-muted-foreground">
              {lang === 'de' ? 'Kostenloser Intro Call' : 'Free Intro Call'}
            </p>
          )}
        </div>
      )}

      {/* Request form */}
      {showRequest && !sent && (
        <Card>
          <CardContent className="p-4 space-y-3">
            <p className="text-sm font-medium text-foreground">
              {lang === 'de' ? 'Erzähle dem Coach, was du brauchst' : 'Tell the coach what you need'}
            </p>
            <Textarea
              value={message}
              onChange={e => setMessage(e.target.value)}
              placeholder={lang === 'de' ? 'Deine Nachricht…' : 'Your message…'}
              rows={3}
            />
            <Button
              className="w-full"
              onClick={handleSend}
              disabled={sending || !message.trim()}
            >
              {sending
                ? (lang === 'de' ? 'Sende…' : 'Sending…')
                : (lang === 'de' ? 'Anfrage senden' : 'Send Request')}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Sent confirmation */}
      {sent && (
        <Card className="border-green-500/20 bg-green-500/5">
          <CardContent className="p-4 flex items-center gap-3">
            <Check className="h-5 w-5 text-green-500" />
            <p className="text-sm text-foreground">
              {lang === 'de'
                ? 'Deine Anfrage wurde gesendet. Der Coach wird sich bei dir melden.'
                : 'Your request has been sent. The coach will get back to you.'}
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
