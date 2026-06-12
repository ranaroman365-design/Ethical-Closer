import { Lock, ArrowLeft } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/i18n/LanguageContext';
import { useEffect, useRef } from 'react';

interface AccessDeniedProps {
  requiredLevel?: string;
  /** Optional: resource type for denial logging */
  resourceType?: string;
  /** Optional: resolved level for denial logging */
  resolvedLevel?: number;
  /** Optional: extra context for denial logging */
  denialMeta?: Record<string, unknown>;
}

export default function AccessDenied({ requiredLevel, resourceType, resolvedLevel, denialMeta }: AccessDeniedProps) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { lang } = useLanguage();
  const de = lang === 'de';
  const logged = useRef(false);

  useEffect(() => {
    if (logged.current) return;
    logged.current = true;
    import('@/lib/log-access-denial').then(({ logAccessDenial }) =>
      logAccessDenial({
        resourceType: resourceType ?? pathname,
        resolvedLevel: resolvedLevel ?? undefined,
        denialReason: requiredLevel
          ? `Required: ${requiredLevel}`
          : 'AccessDenied component rendered',
        metadata: denialMeta,
      })
    );
  }, []);

  return (
    <div className="mx-auto max-w-md px-5 py-20 text-center">
      <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl border border-border/40 bg-card">
        <Lock className="h-7 w-7 text-muted-foreground" />
      </div>
      <h2 className="font-serif text-xl font-semibold text-foreground mb-2">
        {de ? 'Bereich gesperrt' : 'Area Locked'}
      </h2>
      <p className="text-sm text-muted-foreground mb-1">
        {de
          ? 'Dieser Bereich ist für dein aktuelles Level noch nicht freigeschaltet.'
          : 'This area is not yet unlocked for your current level.'}
      </p>
      {requiredLevel && (
        <p className="text-xs text-muted-foreground/70 mb-8">
          {de ? `Verfügbar ab ${requiredLevel}` : `Available from ${requiredLevel}`}
        </p>
      )}
      <Button
        variant="outline"
        size="sm"
        onClick={() => navigate('/members/dashboard')}
        className="text-xs"
      >
        <ArrowLeft className="h-3.5 w-3.5 mr-1.5" />
        {de ? 'Zum Dashboard' : 'Back to Dashboard'}
      </Button>
    </div>
  );
}
