import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useBrandConfig } from '@/hooks/useBrandConfig';
import { supabase } from '@/integrations/supabase/client';
import { setSessionContext, APPLICANT_PORTAL_PATH } from '@/lib/session-context';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Eye, EyeOff, Mail, CheckCircle2 } from 'lucide-react';
import { useLanguage } from '@/i18n/LanguageContext';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [magicLinkMode, setMagicLinkMode] = useState(false);
  const [magicLinkEmail, setMagicLinkEmail] = useState('');
  const [magicLinkSent, setMagicLinkSent] = useState(false);
  const [magicLinkLoading, setMagicLinkLoading] = useState(false);

  const { signIn } = useAuth();
  const navigate = useNavigate();
  const { branding } = useBrandConfig();
  const { tx } = useLanguage();

  const waitForSession = async () => {
    for (let i = 0; i < 10; i += 1) {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) return session;
      await new Promise((resolve) => window.setTimeout(resolve, 150));
    }
    return null;
  };

  const resolveRedirect = async (userId: string) => {
    // Reset legacy + new entryflow session flag so the orientation runs again on every login
    try {
      sessionStorage.removeItem('etc_entry_seen');
      sessionStorage.removeItem('entryflow_seen_this_session');
    } catch { /* ignore */ }

    const params = new URLSearchParams(window.location.search);
    const next = params.get('next');
    const ctx = params.get('ctx');

    // Applicant magic-link context wins over every role-based redirect (skips Entryflow).
    if (ctx === 'applicant') {
      try { sessionStorage.setItem('current_session_context', 'applicant'); } catch { /* ignore */ }
      return '/members/interview?ctx=applicant';
    }

    try {
      const { data: roles } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', userId);

      const roleList = (roles ?? []).map((r: any) => r.role);
      const hasPrivilegedAccess = roleList.some((r: string) => ['admin', 'administrator', 'owner'].includes(r));
      const isCommunityOnly = roleList.includes('community_member') && !hasPrivilegedAccess;

      // Community-only buyers: their product IS the community → keep /community/feed (no entryflow).
      if (isCommunityOnly) {
        if (next && next.startsWith('/')) return next;
        return '/community/feed';
      }

      // ── L0 applicant detection ──
      // If user has NO privileged roles and profile is prospect (L0),
      // auto-set applicant context so they land in Bewerberbereich, not /insider.
      if (!hasPrivilegedAccess && !isCommunityOnly) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('business_stage, community_access, current_phase')
          .eq('id', userId)
          .maybeSingle();

        const isL0 = profile &&
          !profile.community_access &&
          (profile.current_phase ?? 0) < 1 &&
          (!profile.business_stage || profile.business_stage === 'prospect');

        if (isL0) {
          setSessionContext('applicant');
          return `${APPLICANT_PORTAL_PATH}?ctx=applicant`;
        }
      }

      // Honor explicit `next` deep-link only if it stays inside /members → bypass entryflow for that link.
      if (next && next.startsWith('/members')) return next;
    } catch (e) {
      console.error('[Login] role resolve failed', e);
    }

    // Default: route to Entryflow — repeated per-login orientation ritual.
    return '/members/entryflow';
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const { error: signInError, session: signedInSession } = await signIn(email, password);

    if (signInError) {
      setError(tx('Ungültige Anmeldedaten. Bitte versuche es erneut.', 'Invalid credentials. Please try again.'));
      setLoading(false);
    } else {
      const session = signedInSession ?? await waitForSession();
      if (session?.user) {
        const target = await resolveRedirect(session.user.id);
        try {
          const { trackFunnelEvent } = await import('@/lib/track-event');
          trackFunnelEvent('member_login', { target, method: 'password' });
        } catch { /* tracker optional */ }
        navigate(target, { replace: true });
      } else {
        navigate('/members', { replace: true });
      }
    }
  };

  const handleMagicLink = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setMagicLinkLoading(true);

    const { error: mlError } = await supabase.auth.signInWithOtp({
      email: magicLinkEmail,
      options: {
        emailRedirectTo: `${window.location.origin}/members`,
      },
    });

    if (mlError) {
      setError(tx('Fehler beim Senden. Bitte versuche es erneut.', 'Error sending. Please try again.'));
    } else {
      setMagicLinkSent(true);
    }
    setMagicLinkLoading(false);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[hsl(220,15%,8%)] px-4">
      <div className="w-full max-w-sm">
        {/* Brand */}
        <div className="mb-10 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-[hsl(39,41%,55%)] font-serif text-lg font-bold text-[hsl(220,15%,8%)]">
            EC
          </div>
          <h1 className="font-serif text-xl font-semibold tracking-wide text-white/90">
            {branding.product_name}
          </h1>
          <p className="mt-1 text-sm text-white/40">
            Members Area
          </p>
        </div>

        {/* Magic link sent confirmation */}
        {magicLinkSent ? (
          <div className="text-center">
            <CheckCircle2 className="mx-auto mb-4 h-10 w-10 text-[hsl(39,41%,55%)]" />
            <p className="text-sm text-white/70">
              {tx('Wenn die E-Mail existiert, haben wir dir einen Login-Link geschickt.', 'If the email exists, we have sent you a login link.')}
            </p>
            <button
              onClick={() => { setMagicLinkSent(false); setMagicLinkMode(false); }}
              className="mt-6 text-xs text-white/40 hover:text-white/60 transition-colors"
            >
              {tx('Zurück zum Login', 'Back to Login')}
            </button>
          </div>
        ) : magicLinkMode ? (
          /* Magic link form */
          <div>
            <form onSubmit={handleMagicLink} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="ml-email" className="text-[13px] text-white/60">
                  {tx('E-Mail', 'Email')}
                </Label>
                <Input
                  id="ml-email"
                  type="email"
                  value={magicLinkEmail}
                  onChange={e => setMagicLinkEmail(e.target.value)}
                  required
                  placeholder={tx('deine@email.de', 'your@email.com')}
                  className="border-white/10 bg-white/5 text-white placeholder:text-white/25 focus-visible:ring-[hsl(39,41%,55%)]"
                />
              </div>

              {error && <p className="text-sm text-destructive">{error}</p>}

              <Button
                type="submit"
                disabled={magicLinkLoading}
                className="w-full bg-[hsl(39,41%,55%)] font-medium text-[hsl(220,15%,8%)] hover:bg-[hsl(39,41%,60%)]"
              >
                <Mail className="mr-2 h-4 w-4" />
                {magicLinkLoading ? tx('Wird gesendet…', 'Sending…') : tx('Login-Link senden', 'Send login link')}
              </Button>
            </form>
            <div className="mt-6 text-center">
              <button
                onClick={() => { setMagicLinkMode(false); setError(''); }}
                className="text-xs text-white/40 hover:text-white/60 transition-colors"
              >
                {tx('Mit Passwort anmelden', 'Sign in with password')}
              </button>
            </div>
          </div>
        ) : (
          /* Standard login form */
          <div>
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="email" className="text-[13px] text-white/60">
                  {tx('E-Mail', 'Email')}
                </Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  placeholder={tx('deine@email.de', 'your@email.com')}
                  className="border-white/10 bg-white/5 text-white placeholder:text-white/25 focus-visible:ring-[hsl(39,41%,55%)]"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password" className="text-[13px] text-white/60">
                  {tx('Passwort', 'Password')}
                </Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    required
                    placeholder="••••••••"
                    className="border-white/10 bg-white/5 text-white placeholder:text-white/25 focus-visible:ring-[hsl(39,41%,55%)] pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(prev => !prev)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60 transition-colors"
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {error && <p className="text-sm text-destructive">{error}</p>}

              <Button
                type="submit"
                disabled={loading}
                className="w-full bg-[hsl(39,41%,55%)] font-medium text-[hsl(220,15%,8%)] hover:bg-[hsl(39,41%,60%)]"
              >
                {loading ? tx('Wird angemeldet…', 'Signing in…') : tx('Anmelden', 'Sign In')}
              </Button>
            </form>

            <div className="mt-6 text-center">
              <Link to="/members/forgot-password" className="text-xs text-white/40 hover:text-white/60 transition-colors">
                {tx('Passwort vergessen?', 'Forgot password?')}
              </Link>
            </div>

            {/* Separator */}
            <div className="my-6 flex items-center gap-3">
              <div className="h-px flex-1 bg-white/10" />
              <span className="text-[11px] text-white/25 uppercase tracking-wider">{tx('oder', 'or')}</span>
              <div className="h-px flex-1 bg-white/10" />
            </div>

            {/* Magic link option */}
            <button
              onClick={() => { setMagicLinkMode(true); setError(''); }}
              className="flex w-full items-center justify-center gap-2 rounded-md border border-white/10 bg-white/[0.03] px-4 py-2.5 text-[13px] text-white/50 transition-colors hover:bg-white/[0.06] hover:text-white/70"
            >
              <Mail className="h-4 w-4" />
              {tx('Login-Link per E-Mail erhalten', 'Get login link via email')}
            </button>

            <p className="mt-6 text-center text-xs text-white/25">
              {tx('Zugangsdaten werden nach dem Kauf bereitgestellt.', 'Access credentials are provided after purchase.')}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
