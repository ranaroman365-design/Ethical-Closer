import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useLanguage } from '@/i18n/LanguageContext';
import { useCertification } from '@/hooks/useCertification';
import { useAuth } from '@/hooks/useAuth';
import { Award, BookOpen, Mic, BarChart3, Download, RefreshCw, Check, X, TrendingUp, Shield } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';

export default function CertificationDashboard() {
  const { lang } = useLanguage();
  const { user } = useAuth();
  const { cert, loading, recalculate } = useCertification();
  const tl = (de: string, en: string) => (lang === 'de' ? de : en);

  useEffect(() => {
    if (user && !cert) recalculate();
  }, [user]);

  if (loading) {
    return (
      <div className="mb-8 rounded-xl border border-border/60 bg-card p-6 space-y-4">
        <Skeleton className="h-6 w-48" />
        <div className="grid gap-4 sm:grid-cols-3"><Skeleton className="h-28" /><Skeleton className="h-28" /><Skeleton className="h-28" /></div>
      </div>
    );
  }

  const isCertified = cert?.certification_title === 'Certified';
  const isQualified = cert?.certification_title === 'Qualified';
  const statusColor = isCertified ? 'text-primary' : isQualified ? 'text-accent' : 'text-muted-foreground';
  const statusBg = isCertified ? 'bg-primary/10 border-primary/20' : isQualified ? 'bg-accent/10 border-accent/20' : 'bg-muted/30 border-border/40';

  const pillars = [
    {
      icon: <BookOpen className="h-4 w-4" />,
      label: tl('Theorie', 'Theory'),
      sublabel: tl('Academy & Prüfung', 'Academy & Exam'),
      score: cert?.theory_score ?? 0,
      verified: cert?.theory_verified ?? false,
      detail: `${Math.round(cert?.theory_score ?? 0)}% — ${tl('Ziel: ≥ 75%', 'Target: ≥ 75%')}`,
      weight: '25%',
    },
    {
      icon: <Mic className="h-4 w-4" />,
      label: tl('Simulation', 'Simulation'),
      sublabel: tl('Voice Simulator', 'Voice Simulator'),
      score: cert?.simulation_score ?? 0,
      verified: (cert?.simulation_attempts ?? 0) >= 10 && (cert?.simulation_avg ?? 0) >= 7.5,
      detail: `Ø ${(cert?.simulation_avg ?? 0).toFixed(1)} — ${cert?.simulation_attempts ?? 0} ${tl('Versuche', 'attempts')} — ${cert?.realtime_pass_count ?? 0} RT`,
      weight: '35%',
    },
    {
      icon: <BarChart3 className="h-4 w-4" />,
      label: tl('Performance', 'Performance'),
      sublabel: tl('Echte Ergebnisse', 'Real Results'),
      score: cert?.kpi_verified ? 100 : Math.min((cert?.kpi_total_calls ?? 0) * 5, 80),
      verified: cert?.kpi_verified ?? false,
      detail: `${cert?.kpi_total_calls ?? 0} ${tl('Calls', 'Calls')} · ${cert?.kpi_deals_closed ?? 0} ${tl('Deals', 'Deals')} · €${((cert?.kpi_revenue ?? 0) / 1000).toFixed(1)}k`,
      weight: '40%',
    },
  ];

  return (
    <div className="mb-8 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${isCertified ? 'bg-primary/10' : 'bg-muted/30'}`}>
            <Award className={`h-4 w-4 ${isCertified ? 'text-primary' : 'text-muted-foreground'}`} />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-foreground">
              {tl('Zertifizierung', 'Certification')}
            </h2>
            <p className="text-[10px] text-muted-foreground">
              Certified Online Sales Professional (ETC Standard)
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={recalculate} className="h-7 w-7 p-0">
            <RefreshCw className="h-3 w-3" />
          </Button>
          {isCertified && (
            <Link
              to="/members/certification"
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-[11px] font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              <Download className="h-3 w-3" />
              {tl('Zertifikat', 'Certificate')}
            </Link>
          )}
        </div>
      </div>

      {/* Status Bar */}
      <div className={`rounded-xl border p-4 ${statusBg}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Badge variant="outline" className={`text-[10px] ${statusColor} border-current/20`}>
              {cert?.certification_title ?? 'In Progress'}
            </Badge>
            {isCertified && (
              <span className="text-[10px] text-muted-foreground">
                {tl('Zertifiziert am', 'Certified on')}{' '}
                {cert?.certified_at ? new Date(cert.certified_at).toLocaleDateString('de-DE') : '—'}
              </span>
            )}
          </div>
          <div className="text-right">
            <p className="text-xl font-bold text-foreground">{Math.round(cert?.final_score ?? 0)}</p>
            <p className="text-[9px] text-muted-foreground uppercase tracking-wider">{tl('Gesamtscore', 'Final Score')}</p>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="mt-3">
          <Progress value={Math.min(cert?.final_score ?? 0, 100)} className="h-1.5 bg-muted/50" />
        </div>

        {/* Percentile */}
        {(cert?.percentile_rank ?? 0) > 0 && (
          <div className="mt-2 flex items-center gap-1.5">
            <TrendingUp className="h-3 w-3 text-muted-foreground" />
            <p className="text-[10px] text-muted-foreground">
              {tl(`Top ${Math.round(100 - (cert?.percentile_rank ?? 0))}% auf deinem Level`, `Top ${Math.round(100 - (cert?.percentile_rank ?? 0))}% at your level`)}
            </p>
          </div>
        )}
      </div>

      {/* 3 Pillars */}
      <div className="grid gap-3 sm:grid-cols-3">
        {pillars.map((p) => (
          <div
            key={p.label}
            className={`rounded-xl border p-4 transition-colors ${
              p.verified ? 'border-primary/20 bg-primary/[0.02]' : 'border-border/40 bg-card'
            }`}
          >
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className={`flex h-6 w-6 items-center justify-center rounded-md ${p.verified ? 'bg-primary/10 text-primary' : 'bg-muted/40 text-muted-foreground'}`}>
                  {p.icon}
                </div>
                <div>
                  <p className="text-[11px] font-semibold text-foreground">{p.label}</p>
                  <p className="text-[9px] text-muted-foreground">{p.sublabel}</p>
                </div>
              </div>
              <div className={`flex h-5 w-5 items-center justify-center rounded-full ${p.verified ? 'bg-primary/15' : 'bg-muted/30'}`}>
                {p.verified ? <Check className="h-3 w-3 text-primary" /> : <X className="h-3 w-3 text-muted-foreground/50" />}
              </div>
            </div>
            <Progress value={Math.min(p.score, 100)} className="h-1 bg-muted/50 mb-2" />
            <p className="text-[10px] text-muted-foreground">{p.detail}</p>
            <p className="text-[9px] text-muted-foreground/60 mt-1">{tl('Gewichtung', 'Weight')}: {p.weight}</p>
          </div>
        ))}
      </div>

      {/* CTA for non-certified */}
      {!isCertified && (
        <div className="rounded-xl border border-border/30 bg-muted/10 p-4 text-center">
          <p className="text-[11px] text-muted-foreground mb-2">
            {tl(
              'Schließe alle drei Säulen ab, um den Status „Certified Online Sales Professional" zu erhalten.',
              'Complete all three pillars to earn the "Certified Online Sales Professional" status.'
            )}
          </p>
          <div className="flex justify-center gap-2">
            <Button asChild variant="outline" size="sm" className="text-[11px] h-7">
              <Link to="/members/certification">{tl('Zur Theorie-Prüfung', 'Take Theory Exam')}</Link>
            </Button>
            <Button asChild variant="outline" size="sm" className="text-[11px] h-7">
              <Link to="/members/voice-simulator">{tl('Zum Simulator', 'Practice Simulator')}</Link>
            </Button>
          </div>
        </div>
      )}

      {/* Admin override indicator */}
      {cert?.admin_override && (
        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
          <Shield className="h-3 w-3" />
          {tl('Admin-Override aktiv', 'Admin override active')}
        </div>
      )}
    </div>
  );
}
