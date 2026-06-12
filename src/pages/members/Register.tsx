import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useBrandConfig } from '@/hooks/useBrandConfig';
import { useLanguage } from '@/i18n/LanguageContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CheckCircle2, AlertCircle } from 'lucide-react';

interface TokenData {
  email: string;
  initial_stage: string | null;
  expires_at: string;
}

export default function Register() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') ?? '';
  const navigate = useNavigate();
  const { branding } = useBrandConfig();
  const { lang } = useLanguage();
  const t = (de: string, en: string) => lang === 'de' ? de : en;

  const [tokenData, setTokenData] = useState<TokenData | null>(null);
  const [tokenError, setTokenError] = useState('');
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [validating, setValidating] = useState(true);

  useEffect(() => {
    if (!token) { setTokenError(t('Kein Einladungstoken angegeben.', 'No invitation token provided.')); setValidating(false); return; }
    (async () => {
      const { data, error } = await supabase.rpc('validate_invite_token', { p_token: token });
      setValidating(false);
      if (error || !data) { setTokenError(t('Ungültiger Einladungstoken.', 'Invalid invitation token.')); return; }
      const result = data as Record<string, unknown>;
      if (!result.valid) {
        const msg = result.error === 'already_used' ? t('Dieser Token wurde bereits verwendet.', 'This token has already been used.')
          : result.error === 'expired' ? t('Dieser Token ist abgelaufen.', 'This token has expired.')
          : t('Ungültiger Einladungstoken.', 'Invalid invitation token.');
        setTokenError(msg);
        return;
      }
      setTokenData({ email: result.email as string, initial_stage: result.initial_stage as string | null, expires_at: result.expires_at as string });
    })();
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (password.length < 8) { setError(t('Passwort muss mindestens 8 Zeichen haben.', 'Password must be at least 8 characters.')); return; }
    if (password !== confirmPw) { setError(t('Passwörter stimmen nicht überein.', 'Passwords do not match.')); return; }
    if (!tokenData) return;

    setLoading(true);
    const { data: fnData, error: fnErr } = await supabase.functions.invoke('create-test-user', {
      body: {
        action: 'create',
        email: tokenData.email,
        password,
        full_name: fullName.trim(),
        role: 'member',
        business_stage: tokenData.initial_stage || 'opener',
        invite_token: token,
      },
    });

    if (fnErr || !fnData?.success) {
      setError(fnData?.error || fnErr?.message || t('Registrierung fehlgeschlagen.', 'Registration failed.'));
      setLoading(false);
      return;
    }

    await supabase
      .from('invite_tokens')
      .update({ used: true, used_at: new Date().toISOString(), used_by: fnData.user_id })
      .eq('token', token);

    setSuccess(true);
    setLoading(false);
  };

  if (validating) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[hsl(220,15%,8%)]">
        <p className="text-sm text-white/40">{t('Token wird geprüft…', 'Validating token…')}</p>
      </div>
    );
  }

  if (tokenError) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[hsl(220,15%,8%)] px-4">
        <div className="w-full max-w-sm text-center">
          <AlertCircle className="mx-auto mb-4 h-10 w-10 text-destructive" />
          <h1 className="font-serif text-lg font-semibold text-white/90">{tokenError}</h1>
          <p className="mt-2 text-sm text-white/40">{t('Bitte kontaktiere den Admin für einen neuen Einladungslink.', 'Please contact admin for a new invitation link.')}</p>
          <Link to="/members/login" className="mt-6 inline-block text-xs text-white/40 hover:text-white/60">{t('Zum Login', 'Go to Login')}</Link>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[hsl(220,15%,8%)] px-4">
        <div className="w-full max-w-sm text-center">
          <CheckCircle2 className="mx-auto mb-4 h-10 w-10 text-[hsl(39,41%,55%)]" />
          <h1 className="font-serif text-lg font-semibold text-white/90">{t('Registrierung erfolgreich!', 'Registration successful!')}</h1>
          <p className="mt-2 text-sm text-white/40">{t('Du kannst dich jetzt anmelden.', 'You can now sign in.')}</p>
          <Button onClick={() => navigate('/members/login')} className="mt-6 bg-[hsl(39,41%,55%)] text-[hsl(220,15%,8%)] hover:bg-[hsl(39,41%,60%)]">
            {t('Zum Login', 'Go to Login')}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[hsl(220,15%,8%)] px-4">
      <div className="w-full max-w-sm">
        <div className="mb-10 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-[hsl(39,41%,55%)] font-serif text-lg font-bold text-[hsl(220,15%,8%)]">EC</div>
          <h1 className="font-serif text-xl font-semibold tracking-wide text-white/90">{t('Willkommen!', 'Welcome!')}</h1>
          <p className="mt-1 text-sm text-white/40">{t('Erstelle deinen Account für', 'Create your account for')} <span className="text-white/60">{tokenData?.email}</span></p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-2">
            <Label className="text-[13px] text-white/60">{t('E-Mail', 'Email')}</Label>
            <Input value={tokenData?.email ?? ''} disabled className="border-white/10 bg-white/5 text-white/50" />
          </div>
          <div className="space-y-2">
            <Label className="text-[13px] text-white/60">{t('Vollständiger Name', 'Full Name')}</Label>
            <Input value={fullName} onChange={e => setFullName(e.target.value)} required placeholder={t('Max Mustermann', 'John Doe')} className="border-white/10 bg-white/5 text-white placeholder:text-white/25 focus-visible:ring-[hsl(39,41%,55%)]" />
          </div>
          <div className="space-y-2">
            <Label className="text-[13px] text-white/60">{t('Passwort (min. 8 Zeichen)', 'Password (min. 8 characters)')}</Label>
            <Input type="password" value={password} onChange={e => setPassword(e.target.value)} required placeholder="••••••••" className="border-white/10 bg-white/5 text-white placeholder:text-white/25 focus-visible:ring-[hsl(39,41%,55%)]" />
          </div>
          <div className="space-y-2">
            <Label className="text-[13px] text-white/60">{t('Passwort bestätigen', 'Confirm Password')}</Label>
            <Input type="password" value={confirmPw} onChange={e => setConfirmPw(e.target.value)} required placeholder="••••••••" className="border-white/10 bg-white/5 text-white placeholder:text-white/25 focus-visible:ring-[hsl(39,41%,55%)]" />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" disabled={loading} className="w-full bg-[hsl(39,41%,55%)] font-medium text-[hsl(220,15%,8%)] hover:bg-[hsl(39,41%,60%)]">
            {loading ? t('Wird erstellt…', 'Creating…') : t('Account erstellen', 'Create Account')}
          </Button>
        </form>
        <p className="mt-6 text-center text-xs text-white/25">
          <Link to="/members/login" className="text-white/40 hover:text-white/60">{t('Bereits registriert? Zum Login', 'Already registered? Go to Login')}</Link>
        </p>
      </div>
    </div>
  );
}
