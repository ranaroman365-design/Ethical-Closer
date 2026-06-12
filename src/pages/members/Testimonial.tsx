import { useState } from 'react';
import { formatK } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { useKpis } from '@/hooks/useKpis';
import { useLanguage } from '@/i18n/LanguageContext';
import { PRODUCT } from '@/config/product';
import { STAGE_LABELS, getUserLevel } from '@/components/members/CareerPath';
import {
  Download, Award, TrendingUp, Activity,
  CheckCircle2, BarChart3, Loader2, Sparkles, Shield,
} from 'lucide-react';
import jsPDF from 'jspdf';

export default function Testimonial() {
  const { profile } = useAuth();
  const { kpis } = useKpis();
  const { lang } = useLanguage();
  const [generating, setGenerating] = useState(false);

  const t = (de: string, en: string) => lang === 'de' ? de : en;

  const stage = (profile as any)?.business_stage || 'opener';
  const userLevel = getUserLevel(stage);
  const stageLabel = STAGE_LABELS[stage]?.[lang] || stage;
  const fullName = (profile as any)?.full_name || 'Member';

  const now = new Date();
  const dateStr = lang === 'de'
    ? now.toLocaleDateString('de-DE', { day: 'numeric', month: 'long', year: 'numeric' })
    : now.toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' });

  const kpiData = [
    { label: t('Close Rate', 'Close Rate'), value: kpis?.closing_rate ? `${kpis.closing_rate}%` : '—', icon: TrendingUp },
    { label: t('Show Rate', 'Show Rate'), value: kpis?.show_rate ? `${kpis.show_rate}%` : '—', icon: Activity },
    ...(userLevel >= 4
      ? [{ label: t('Umsatz', 'Revenue'), value: kpis?.revenue_closed ? formatK(Number(kpis.revenue_closed), '€') : '—', icon: BarChart3 }]
      : [{ label: t('Provision', 'Commission'), value: kpis?.commission_earned ? formatK(Number(kpis.commission_earned), '€') : '—', icon: BarChart3 }]),
    { label: t('Storno Rate', 'Chargeback Rate'), value: kpis?.storno_rate ? `${kpis.storno_rate}%` : '—', icon: CheckCircle2 },
    { label: t('Follow-Up Rate', 'Follow-Up Rate'), value: kpis?.follow_up_rate ? `${kpis.follow_up_rate}%` : '—', icon: CheckCircle2 },
    { label: t('CRM Hygiene', 'CRM Hygiene'), value: kpis?.crm_hygiene_score ? `${kpis.crm_hygiene_score}%` : '—', icon: BarChart3 },
    { label: t('Calls/Woche', 'Calls/Week'), value: kpis?.calls_per_week ?? '—', icon: Activity },
  ];

  const generatePDF = async () => {
    setGenerating(true);
    try {
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const w = 210;
      const gold = [184, 134, 11] as [number, number, number];
      const dark = [26, 26, 26] as [number, number, number];
      const mid = [120, 120, 120] as [number, number, number];
      const light = [200, 200, 200] as [number, number, number];

      // Gold top bar
      doc.setFillColor(...gold);
      doc.rect(0, 0, w, 3, 'F');

      // Header
      let y = 22;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(22);
      doc.setTextColor(...dark);
      doc.text(t('Leistungsnachweis', 'Performance Testimonial'), 20, y);

      y += 7;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.setTextColor(...mid);
      doc.text(`${PRODUCT.name}  ·  ${dateStr}`, 20, y);

      // Gold line
      y += 6;
      doc.setDrawColor(...gold);
      doc.setLineWidth(0.5);
      doc.line(20, y, w - 20, y);

      // Personal info section
      y += 14;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(...mid);
      doc.text(t('PERSÖNLICHE DATEN', 'PERSONAL INFORMATION'), 20, y);

      y += 8;
      const infoBoxes = [
        { label: t('Name', 'Name'), value: fullName },
        { label: t('Karriereschritt', 'Career Step'), value: stageLabel },
        { label: 'Level', value: `L${userLevel}` },
        { label: t('Zertifiziert', 'Certified'), value: (profile as any)?.certified ? '✓' : '—' },
      ];

      const boxW = (w - 50) / 2;
      infoBoxes.forEach((item, i) => {
        const col = i % 2;
        const row = Math.floor(i / 2);
        const bx = 20 + col * (boxW + 10);
        const by = y + row * 22;

        doc.setFillColor(248, 247, 245);
        doc.roundedRect(bx, by, boxW, 18, 2, 2, 'F');

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7);
        doc.setTextColor(...mid);
        doc.text(item.label.toUpperCase(), bx + 5, by + 6);

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(13);
        doc.setTextColor(...dark);
        doc.text(String(item.value), bx + 5, by + 14);
      });

      // KPI section
      y += 54;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(...mid);
      doc.text(t('PERFORMANCE KPIs', 'PERFORMANCE KPIs'), 20, y);

      y += 8;
      const kpiBoxW = (w - 55) / 4;
      kpiData.forEach((kpi, i) => {
        const col = i % 4;
        const row = Math.floor(i / 4);
        const bx = 20 + col * (kpiBoxW + 5);
        const by = y + row * 26;

        doc.setFillColor(248, 247, 245);
        doc.roundedRect(bx, by, kpiBoxW, 22, 2, 2, 'F');

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(14);
        doc.setTextColor(...dark);
        const valStr = String(kpi.value);
        const valWidth = doc.getTextWidth(valStr);
        doc.text(valStr, bx + kpiBoxW / 2 - valWidth / 2, by + 10);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(6);
        doc.setTextColor(...mid);
        const lblWidth = doc.getTextWidth(kpi.label);
        doc.text(kpi.label, bx + kpiBoxW / 2 - lblWidth / 2, by + 17);
      });

      // Seal
      y += 66;
      doc.setDrawColor(...light);
      doc.setLineWidth(0.3);
      doc.line(20, y, w - 20, y);

      y += 16;
      // Gold hexagon symbol
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(28);
      doc.setTextColor(...gold);
      const hexWidth = doc.getTextWidth('⬡');
      doc.text('⬡', w / 2 - hexWidth / 2, y);

      y += 8;
      doc.setFontSize(10);
      doc.setTextColor(...gold);
      const brandWidth = doc.getTextWidth(PRODUCT.brandLine);
      doc.text(PRODUCT.brandLine, w / 2 - brandWidth / 2, y);

      y += 5;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(...mid);
      const verifiedText = t('Verifizierter Leistungsnachweis', 'Verified Performance Testimonial');
      const verifiedWidth = doc.getTextWidth(verifiedText);
      doc.text(verifiedText, w / 2 - verifiedWidth / 2, y);

      // Footer
      y += 20;
      doc.setDrawColor(...light);
      doc.setLineWidth(0.2);
      doc.line(20, y, w - 20, y);

      y += 6;
      doc.setFontSize(7);
      doc.setTextColor(160, 160, 160);
      const footerText = t(
        'Dieses Dokument wurde automatisch generiert und basiert auf tatsächlichen Performance-Daten der Plattform.',
        'This document was automatically generated based on actual platform performance data.'
      );
      const footerLines = doc.splitTextToSize(footerText, w - 40);
      doc.text(footerLines, w / 2, y, { align: 'center' });

      y += footerLines.length * 4 + 2;
      doc.text(`${dateStr}  ·  ${PRODUCT.name} Platform`, w / 2, y, { align: 'center' });

      // Gold bottom bar
      doc.setFillColor(...gold);
      doc.rect(0, 294, w, 3, 'F');

      // Save
      doc.save(`Leistungsnachweis_${fullName.replace(/\s+/g, '_')}_${now.toISOString().split('T')[0]}.pdf`);
    } catch (err) {
      console.error('PDF generation failed:', err);
    }
    setGenerating(false);
  };

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 sm:px-5 sm:py-8 lg:px-10">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3">
          <h1 className="font-serif text-2xl font-semibold tracking-tight text-foreground">
            {t('Leistungsnachweis', 'Performance Testimonial')}
          </h1>
          <Badge variant="outline" className="border-accent/30 text-accent text-[10px]">
            <Sparkles className="mr-1 h-3 w-3" />Premium
          </Badge>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          {t(
            'Dein verifizierter Leistungsnachweis — professionell aufbereitet für Bewerbungen, Partner und dein Portfolio.',
            'Your verified performance testimonial — professionally prepared for applications, partners and your portfolio.'
          )}
        </p>
      </div>

      {/* Premium Preview Card */}
      <div className="relative mb-8 overflow-hidden rounded-2xl border border-accent/20 bg-gradient-to-br from-accent/[0.04] via-card to-card">
        {/* Gold accent bar */}
        <div className="h-1 w-full bg-gradient-to-r from-accent/60 via-accent to-accent/60" />

        <div className="p-6 sm:p-8">
          {/* Document header */}
          <div className="flex items-start justify-between mb-8">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground mb-2">
                {PRODUCT.brandLine}
              </p>
              <h2 className="font-serif text-xl font-semibold text-foreground">
                {t('Leistungsnachweis', 'Performance Testimonial')}
              </h2>
              <p className="text-[12px] text-muted-foreground mt-1">{dateStr}</p>
            </div>
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-accent/10 text-accent">
              <Shield className="h-6 w-6" />
            </div>
          </div>

          {/* Identity block */}
          <div className="flex items-center gap-4 mb-8 p-4 rounded-xl bg-muted/20 border border-border/20">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-accent/10 font-serif text-lg font-bold text-accent">
              {fullName.charAt(0)}
            </div>
            <div>
              <p className="font-serif text-lg font-semibold text-foreground">{fullName}</p>
              <div className="flex items-center gap-2 mt-0.5">
                <Badge variant="outline" className="text-[10px] border-accent/20 text-accent">{stageLabel}</Badge>
                <span className="text-[11px] text-muted-foreground">Level {userLevel}</span>
                {(profile as any)?.certified && (
                  <Badge className="bg-accent/10 text-accent text-[10px] border-0">
                    <CheckCircle2 className="mr-1 h-2.5 w-2.5" />{t('Zertifiziert', 'Certified')}
                  </Badge>
                )}
              </div>
            </div>
          </div>

          {/* KPI Grid */}
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground mb-3">
            {t('PERFORMANCE KPIs', 'PERFORMANCE KPIs')}
          </p>
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 mb-8">
            {kpiData.map(k => (
              <div key={k.label} className="group rounded-xl border border-border/20 bg-card p-3.5 text-center transition-all hover:border-accent/20 hover:shadow-sm">
                <k.icon className="mx-auto mb-1.5 h-3.5 w-3.5 text-accent/40 group-hover:text-accent/60 transition-colors" />
                <p className="text-xl font-bold text-foreground tabular-nums">{k.value}</p>
                <p className="text-[9px] text-muted-foreground mt-0.5">{k.label}</p>
              </div>
            ))}
          </div>

          {/* Seal */}
          <div className="flex flex-col items-center py-6 border-t border-border/20">
            <Award className="h-8 w-8 text-accent/50 mb-2" />
            <p className="text-[11px] font-semibold text-accent">{PRODUCT.brandLine}</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              {t('Verifizierter Leistungsnachweis', 'Verified Performance Testimonial')}
            </p>
          </div>

          {/* Download CTA */}
          <div className="flex justify-center pt-4">
            <Button
              onClick={generatePDF}
              disabled={generating}
              size="lg"
              className="bg-accent text-accent-foreground hover:bg-accent/90 shadow-lg shadow-accent/10 text-sm px-8"
            >
              {generating ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" />{t('Wird generiert…', 'Generating…')}</>
              ) : (
                <><Download className="mr-2 h-4 w-4" />{t('PDF herunterladen', 'Download PDF')}</>
              )}
            </Button>
          </div>
        </div>
      </div>

      {/* Info footer */}
      <div className="rounded-xl border border-border/30 bg-card p-5">
        <div className="flex items-start gap-3">
          <Shield className="h-5 w-5 text-muted-foreground/40 shrink-0 mt-0.5" />
          <div>
            <p className="text-[13px] font-medium text-foreground mb-1">
              {t('Verifiziertes Dokument', 'Verified Document')}
            </p>
            <p className="text-[12px] text-muted-foreground leading-relaxed">
              {t(
                'Dein Leistungsnachweis wird direkt aus deinen realen Plattform-KPIs generiert. Er enthält deinen Namen, aktuelles Level, Zertifizierungsstatus und alle relevanten Performance-Indikatoren in einem professionellen Layout.',
                'Your performance testimonial is generated directly from your real platform KPIs. It includes your name, current level, certification status, and all relevant performance indicators in a professional layout.'
              )}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
