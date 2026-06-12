import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useLanguage } from '@/i18n/LanguageContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CheckCircle2 } from 'lucide-react';

export default function ResetPassword() {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [isRecovery, setIsRecovery] = useState(false);
  const navigate = useNavigate();
  const { lang } = useLanguage();
  const t = (de: string, en: string) => lang === 'de' ? de : en;

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setIsRecovery(true);
      }
    });

    const hash = window.location.hash;
    if (hash.includes('type=recovery')) {
      setIsRecovery(true);
    }

    return () => subscription.unsubscribe();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password !== confirmPassword) {
      setError(t('Passwörter stimmen nicht überein.', 'Passwords do not match.'));
      return;
    }

    if (password.length < 6) {
      setError(t('Passwort muss mindestens 6 Zeichen lang sein.', 'Password must be at least 6 characters.'));
      return;
    }

    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });

    if (error) {
      setError(t('Fehler beim Aktualisieren. Bitte versuche es erneut.', 'Error updating. Please try again.'));
    } else {
      setSuccess(true);
      setTimeout(() => navigate('/members'), 2000);
    }
    setLoading(false);
  };

  if (!isRecovery) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[hsl(220,15%,8%)] px-4">
        <p className="text-sm text-white/50">{t('Ungültiger oder abgelaufener Link.', 'Invalid or expired link.')}</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[hsl(220,15%,8%)] px-4">
      <div className="w-full max-w-sm">
        <div className="mb-10 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-[hsl(39,41%,55%)] font-serif text-lg font-bold text-[hsl(220,15%,8%)]">
            EC
          </div>
          <h1 className="font-serif text-xl font-semibold tracking-wide text-white/90">
            {t('Neues Passwort setzen', 'Set New Password')}
          </h1>
        </div>

        {success ? (
          <div className="text-center">
            <CheckCircle2 className="mx-auto mb-4 h-10 w-10 text-[hsl(39,41%,55%)]" />
            <p className="text-sm text-white/70">
              {t('Passwort erfolgreich geändert. Du wirst weitergeleitet…', 'Password changed successfully. Redirecting…')}
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="password" className="text-[13px] text-white/60">
                {t('Neues Passwort', 'New Password')}
              </Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                placeholder="••••••••"
                className="border-white/10 bg-white/5 text-white placeholder:text-white/25 focus-visible:ring-[hsl(39,41%,55%)]"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword" className="text-[13px] text-white/60">
                {t('Passwort bestätigen', 'Confirm Password')}
              </Label>
              <Input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                required
                placeholder="••••••••"
                className="border-white/10 bg-white/5 text-white placeholder:text-white/25 focus-visible:ring-[hsl(39,41%,55%)]"
              />
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <Button
              type="submit"
              disabled={loading}
              className="w-full bg-[hsl(39,41%,55%)] font-medium text-[hsl(220,15%,8%)] hover:bg-[hsl(39,41%,60%)]"
            >
              {loading ? t('Wird gespeichert…', 'Saving…') : t('Passwort speichern', 'Save Password')}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
