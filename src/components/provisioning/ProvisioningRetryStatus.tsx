import { useEffect, useRef, useState, useCallback } from "react";
import { RefreshCcw, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  /** Async function that re-checks provisioning status. */
  onRefresh: () => Promise<void> | void;
  /** Seconds between auto-retries. Default 10. */
  intervalSeconds?: number;
  /** Heading shown above the countdown. */
  title?: string;
  /** Sub-text under the heading. */
  description?: string;
  /** Render inside a card frame (true) or inline (false). Default true. */
  bordered?: boolean;
  className?: string;
};

/**
 * Actionable provisioning status: shows a countdown to the next auto-refresh
 * plus a manual refresh button. Used on confirmation/welcome surfaces while
 * a backend webhook is still propagating (community_access, role, etc.).
 *
 * Pure presentation + simple timer. The parent owns the actual status query.
 */
export default function ProvisioningRetryStatus({
  onRefresh,
  intervalSeconds = 10,
  title = "Wir aktivieren gerade deinen Zugang…",
  description = "Das dauert nur ein paar Sekunden nach deiner Zahlung.",
  bordered = true,
  className,
}: Props) {
  const [secondsLeft, setSecondsLeft] = useState(intervalSeconds);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const triggerRefresh = useCallback(async () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setIsRefreshing(false);
      setSecondsLeft(intervalSeconds);
    }
  }, [isRefreshing, onRefresh, intervalSeconds]);

  useEffect(() => {
    tickRef.current = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          // fire async; do not await inside setInterval callback
          void triggerRefresh();
          return intervalSeconds;
        }
        return s - 1;
      });
    }, 1000);
    return () => {
      if (tickRef.current) clearInterval(tickRef.current);
    };
  }, [triggerRefresh, intervalSeconds]);

  return (
    <div
      className={cn(
        "flex flex-col items-center gap-4 px-4 py-6 text-center",
        bordered && "rounded-lg border border-border bg-card",
        className
      )}
    >
      {isRefreshing ? (
        <Loader2 className="h-6 w-6 animate-spin text-primary" aria-hidden />
      ) : (
        <div
          className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent"
          aria-hidden
        />
      )}
      <div
        className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground"
        style={{ fontFamily: "DM Mono, monospace" }}
      >
        Aktivierung läuft
      </div>
      <h2
        className="max-w-sm text-xl text-foreground"
        style={{ fontFamily: "Cormorant Garamond, serif" }}
      >
        {title}
      </h2>
      <p className="max-w-xs text-sm text-muted-foreground">{description}</p>

      <div
        className="text-xs text-muted-foreground"
        aria-live="polite"
        role="status"
      >
        Nächste automatische Prüfung in <span className="tabular-nums font-medium text-foreground">{secondsLeft}s</span>
      </div>

      <button
        type="button"
        onClick={triggerRefresh}
        disabled={isRefreshing}
        className={cn(
          "inline-flex items-center gap-2 rounded-md border border-border bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors",
          "hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
        )}
      >
        <RefreshCcw className={cn("h-4 w-4", isRefreshing && "animate-spin")} aria-hidden />
        {isRefreshing ? "Wird geprüft…" : "Jetzt erneut prüfen"}
      </button>

      <p className="max-w-xs text-[11px] text-muted-foreground">
        Du erhältst zusätzlich eine E-Mail-Bestätigung, sobald dein Zugang aktiv ist.
      </p>
    </div>
  );
}
