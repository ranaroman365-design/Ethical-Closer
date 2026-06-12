import { Outlet, useLocation } from 'react-router-dom';
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { useIsMobile } from '@/hooks/use-mobile';
import MembersSidebar from './MembersSidebar';
import NotificationCenter from './NotificationCenter';
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from '@/components/ui/sheet';
import { Menu } from 'lucide-react';
import { useState, useEffect } from 'react';
import { LanguageToggle, useLanguage } from '@/i18n/LanguageContext';
import { ThemeToggle } from '@/components/ThemeToggle';
import { useStageGuard } from '@/hooks/useStageGuard';
import { useAuth } from '@/hooks/useAuth';
import ChatWidget from '@/components/chat/ChatWidget';
import { Skeleton } from '@/components/ui/skeleton';
import { useBrandConfig } from '@/hooks/useBrandConfig';
import { saveLastPage } from '@/lib/smart-routing';
import { normalizeBusinessStage } from '@/lib/stage-utils';
import AccessDenied from './AccessDenied';
import LevelUnlockModal from './LevelUnlockModal';

/** Fallback UI shown during lazy-load suspense */
function FallbackScreen() {
  return (
    <div className="mx-auto max-w-4xl px-5 py-10 space-y-4">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-4 w-72" />
      <div className="grid gap-4 sm:grid-cols-2 mt-6">
        <Skeleton className="h-32 rounded-xl" />
        <Skeleton className="h-32 rounded-xl" />
      </div>
      <Skeleton className="h-48 rounded-xl" />
      <p className="text-xs text-muted-foreground text-center mt-8">
        Inhalte werden geladen…
      </p>
    </div>
  );
}

/** Error screen with retry — replaces permanent skeleton on render crashes */
function ErrorScreen({ onRetry, errorMessage }: { onRetry: () => void; errorMessage?: string }) {
  const supportDetails = [
    `Zeitpunkt: ${new Date().toISOString()}`,
    `Route: ${typeof window !== 'undefined' ? window.location.pathname : '—'}`,
    `Viewport: ${typeof window !== 'undefined' ? `${window.innerWidth}×${window.innerHeight}` : '—'}`,
    `UA: ${typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 120) : '—'}`,
    errorMessage ? `Fehler: ${errorMessage}` : '',
  ].filter(Boolean).join('\n');

  const copySupport = async () => {
    try {
      await navigator.clipboard.writeText(supportDetails);
    } catch {
      // Fallback for older browsers
      const ta = document.createElement('textarea');
      ta.value = supportDetails;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
  };

  return (
    <div className="mx-auto max-w-md px-5 py-20 text-center space-y-4">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
        <span className="text-destructive text-xl">⚠</span>
      </div>
      <h2 className="text-lg font-semibold text-foreground">Kalender konnte nicht geladen werden</h2>
      <p className="text-sm text-muted-foreground">
        Es ist ein Fehler aufgetreten. Bitte versuche es erneut oder kontaktiere deinen Teamlead.
      </p>
      <div className="flex flex-col items-center gap-2">
        <button
          onClick={onRetry}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          Erneut versuchen
        </button>
        <button
          onClick={copySupport}
          className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted transition-colors"
        >
          Support-Details kopieren
        </button>
      </div>
    </div>
  );
}

/** Error boundary to catch render crashes — shows actionable error, NOT permanent skeleton */
class OutletErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean; errorMessage: string }
> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, errorMessage: '' };
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, errorMessage: error?.message || 'Unknown error' };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[MembersLayout] Render error caught:', error, info);
  }
  handleRetry = () => {
    this.setState({ hasError: false, errorMessage: '' });
  };
  render() {
    if (this.state.hasError) {
      return <ErrorScreen onRetry={this.handleRetry} errorMessage={this.state.errorMessage} />;
    }
    return this.props.children;
  }
}

const STAGE_LABELS_MAP: Record<string, { de: string; en: string }> = {
  prospect: { de: 'Bewerber', en: 'Applicant' },
  opener: { de: 'Trainee', en: 'Trainee' },
  setter: { de: 'Associate Setter', en: 'Associate Setter' },
  associate_setter: { de: 'Associate Setter', en: 'Associate Setter' },
  senior_associate: { de: 'Senior Setter', en: 'Senior Setter' },
  senior_setter: { de: 'Senior Setter', en: 'Senior Setter' },
  junior_manager: { de: 'Closer (Placement Track)', en: 'Closer (Placement Track)' },
  manager: { de: 'Managing Closer', en: 'Managing Closer' },
  senior_manager: { de: 'Senior Closer', en: 'Senior Closer' },
  director: { de: 'Director', en: 'Director' },
  partner: { de: 'Partner', en: 'Partner' },
};

export default function MembersLayout() {
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const { allowed, loading: guardLoading } = useStageGuard(location.pathname);
  const { isLoading: authLoading, profile, isAdmin } = useAuth();
  const { branding, levels } = useBrandConfig();
  const { lang } = useLanguage();

  const normalizedStage = normalizeBusinessStage((profile as any)?.business_stage || 'opener');

  // Single source of truth for stage title — never renders undefined
  const stageLabel = (() => {
    if (isAdmin) return 'Admin';
    if (levels.length > 0) {
      const entry = levels.find((l: any) => l.key === normalizedStage);
      const label = entry ? (lang === 'de' ? entry.de : entry.en) : undefined;
      if (label) return label;
    }
    return STAGE_LABELS_MAP[normalizedStage]?.[lang] || STAGE_LABELS_MAP.opener[lang];
  })();

  // Show only the position title — no "L1 — " prefix
  const levelDisplay = stageLabel;

  // Persist last visited page for smart routing on next login
  useEffect(() => {
    saveLastPage(location.pathname);
  }, [location.pathname]);


  if (authLoading || guardLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-muted-foreground border-t-primary" />
      </div>
    );
  }

  // Route-level protection — show locked state instead of redirect
  if (!guardLoading && !allowed) {
    // Determine required level hint from path
    const pathLevelHints: Record<string, string> = {
      '/members/intelligence': 'Level 5 (Managing Closer)',
      '/members/deal-intelligence': 'Level 5 (Managing Closer)',
      '/members/partner-earnings': 'Level 8 (Partner)',
      '/members/closing-os': 'Level 4 (Closer)',
      '/members/simulation-lab': 'Level 4 (Closer)',
      '/members/call-review': 'Level 4 (Closer)',
      '/members/payment-links': 'Level 4 (Closer)',
      '/members/director-workspace': 'Level 7 (Director)',
      '/members/inner-circle': 'Level 8 (Partner)',
      '/members/scale-hub': 'Level 6 (Senior Closer)',
    };
    const hint = pathLevelHints[location.pathname];
    // Wrap in layout so sidebar is still visible
    if (isMobile) {
      return (
        <div className="flex h-screen flex-col bg-background">
          <header className="flex h-14 shrink-0 items-center gap-3 border-b border-white/5 bg-[hsl(220,15%,8%)] px-4">
            <Sheet open={open} onOpenChange={setOpen}>
              <SheetTrigger asChild>
                <button className="text-white/60 hover:text-white transition-colors"><Menu className="h-5 w-5" /></button>
              </SheetTrigger>
              <SheetContent side="left" className="w-[260px] border-0 p-0 bg-[hsl(220,15%,8%)]" aria-describedby={undefined}>
                <SheetTitle className="sr-only">Navigation</SheetTitle>
                <MembersSidebar onNavigate={() => setOpen(false)} />
              </SheetContent>
            </Sheet>
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-[hsl(39,41%,55%)] font-serif text-[10px] font-bold text-[hsl(220,15%,8%)]">EC</div>
              <span className="truncate font-sans text-[12px] font-bold tracking-wide text-white">{levelDisplay}</span>
            </div>
          </header>
          <main className="flex-1 overflow-y-auto"><AccessDenied requiredLevel={hint} /></main>
        </div>
      );
    }
    return (
      <div className="flex h-screen overflow-hidden bg-background">
        <MembersSidebar />
        <main className="flex-1 overflow-y-auto"><AccessDenied requiredLevel={hint} /></main>
      </div>
    );
  }

  if (isMobile) {
    return (
      <div className="flex h-screen flex-col bg-background">
        <header className="flex h-14 shrink-0 items-center gap-3 border-b border-white/5 bg-[hsl(220,15%,8%)] px-4">
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <button className="text-white/60 hover:text-white transition-colors">
                <Menu className="h-5 w-5" />
              </button>
            </SheetTrigger>
            <SheetContent side="left" className="w-[260px] border-0 p-0 bg-[hsl(220,15%,8%)]" aria-describedby={undefined}>
              <SheetTitle className="sr-only">Navigation</SheetTitle>
              <MembersSidebar onNavigate={() => setOpen(false)} />
            </SheetContent>
          </Sheet>
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-[hsl(39,41%,55%)] font-serif text-[10px] font-bold text-[hsl(220,15%,8%)]">
              EC
            </div>
            <span className="inline-flex h-2.5 w-2.5 shrink-0 rounded-full bg-[hsl(217,91%,60%)]" />
            <span className="truncate font-sans text-[12px] font-bold tracking-wide text-white">
              {levelDisplay}
            </span>
          </div>
          <NotificationCenter />
          <ThemeToggle lang={lang as 'de' | 'en'} />
          <LanguageToggle />
        </header>
        <main className="flex-1 overflow-y-auto">
          <OutletErrorBoundary>
            <Outlet />
          </OutletErrorBoundary>
        </main>
        <ChatWidget />
        <LevelUnlockModal />
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <MembersSidebar />
      <main className="flex-1 overflow-y-auto">
        <div className="flex items-center justify-between gap-2 px-4 pt-3">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-2.5 w-2.5 shrink-0 rounded-full bg-[hsl(217,91%,60%)]" />
            <span className="text-[13px] font-bold tracking-wide text-foreground">
              {levelDisplay}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <NotificationCenter />
            <ThemeToggle lang={lang as 'de' | 'en'} />
            <LanguageToggle />
          </div>
        </div>
        <OutletErrorBoundary>
          <Outlet />
        </OutletErrorBoundary>
      </main>
      <ChatWidget />
      <LevelUnlockModal />
    </div>
  );
}
