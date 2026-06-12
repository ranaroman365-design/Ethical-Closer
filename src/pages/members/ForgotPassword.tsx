import { useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useLanguage } from '@/i18n/LanguageContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ArrowLeft, CheckCircle2 } from 'lucide-react';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const { lang } = useLanguage();
  const t = (de: string, en: string) => lang === 'de' ? de : en;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });

    if (error) {
      setError(t('Fehler beim Senden. Bitte versuche es erneut.', 'Error sending. Please try again.'));
    } else {
      setSent(true);
    }
    setLoading(false);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[hsl(220,15%,8%)] px-4">
      <div className="w-full max-w-sm">
        <div className="mb-10 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-[hsl(39,41%,55%)] font-serif text-lg font-bold text-[hsl(220,15%,8%)]">
            EC
          </div>
          <h1 className="font-serif text-xl font-semibold tracking-wide text-white/90">
            {t('Passwort zurücksetzen', 'Reset Password')}
          </h1>
        </div>

        {sent ? (
          <div className="text-center">
            <CheckCircle2 className="mx-auto mb-4 h-10 w-10 text-[hsl(39,41%,55%)]" />
            <p className="text-sm text-white/70">
              {t('Falls ein Konto mit dieser E-Mail existiert, erhältst du einen Link zum Zurücksetzen.', 'If an account with this email exists, you will receive a reset link.')}
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="email" className="text-[13px] text-white/60">
                {t('E-Mail', 'Email')}
              </Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                placeholder={t('deine@email.de', 'your@email.com')}
                className="border-white/10 bg-white/5 text-white placeholder:text-white/25 focus-visible:ring-[hsl(39,41%,55%)]"
              />
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <Button
              type="submit"
              disabled={loading}
              className="w-full bg-[hsl(39,41%,55%)] font-medium text-[hsl(220,15%,8%)] hover:bg-[hsl(39,41%,60%)]"
            >
              {loading ? t('Wird gesendet…', 'Sending…') : t('Link senden', 'Send Link')}
            </Button>
          </form>
        )}

        <div className="mt-8 text-center">
          <Link to="/members/login" className="inline-flex items-center gap-2 text-xs text-white/40 hover:text-white/60 transition-colors">
            <ArrowLeft className="h-3 w-3" />
            {t('Zurück zum Login', 'Back to Login')}
          </Link>
        </div>
      </div>
    </div>
  );
}
