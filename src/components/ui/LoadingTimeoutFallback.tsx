import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/i18n/LanguageContext';

interface Props {
  message?: string;
  onRetry?: () => void;
}

/**
 * Shown when a dashboard/view times out loading.
 * Prevents infinite skeleton states — schema contract requirement.
 */
export default function LoadingTimeoutFallback({ message, onRetry }: Props) {
  const { tx } = useLanguage();

  return (
    <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
      <div className="rounded-full bg-destructive/10 p-3">
        <AlertTriangle className="h-6 w-6 text-destructive" />
      </div>
      <div>
        <p className="text-sm font-medium text-foreground">
          {tx('Daten konnten nicht geladen werden', 'Data could not be loaded')}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {message || tx(
            'Die Verbindung hat zu lange gedauert. Bitte versuche es erneut.',
            'The connection timed out. Please try again.'
          )}
        </p>
      </div>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry} className="gap-1.5">
          <RefreshCw className="h-3.5 w-3.5" />
          {tx('Erneut versuchen', 'Retry')}
        </Button>
      )}
    </div>
  );
}
