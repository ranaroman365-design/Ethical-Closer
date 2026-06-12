import { useState, useRef } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Award, Briefcase, Star, Save, Percent, DollarSign, Phone, Eye, Edit3, Camera, Loader2, Trophy, CheckCircle2, Lock } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useAcademyData } from '@/hooks/useAcademyData';
import { useKpis } from '@/hooks/useKpis';
import { useMilestones } from '@/hooks/useMilestones';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { MEMBER_STATUS_LABELS, CERT_STATUS_LABELS } from '@/types/members';
import { useLanguage } from '@/i18n/LanguageContext';
import { PayoutDetailsCard } from '@/components/profile/PayoutDetailsCard';

export default function MemberProfile() {
  const { profile, user } = useAuth();
  const { completedModules, totalModules, overallProgress } = useAcademyData();
  const { kpis, updateKpi } = useKpis();
  const { toast } = useToast();
  const { lang } = useLanguage();

  const [fullName, setFullName] = useState(profile?.full_name ?? '');
  const [saving, setSaving] = useState(false);
  const [editingKpi, setEditingKpi] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [avatarUrl, setAvatarUrl] = useState(profile?.avatar_url ?? '');
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const t = (de: string, en: string) => lang === 'de' ? de : en;

  const initials = (profile?.full_name ?? 'M').charAt(0).toUpperCase();

  const ms = useMilestones();

  type MS = {
    key: string;
    label: string;
    description: string;
    achieved: boolean;
    icon: any;
    hidden?: boolean;
  };

  const baseMilestones: MS[] = [
    {
      key: 'onboarding_completed',
      label: t('Onboarding abgeschlossen', 'Onboarding completed'),
      description: t('Du hast die ersten Schritte gemeistert', 'You completed the first steps'),
      achieved: ms.onboarding_completed,
      icon: Star,
    },
    {
      key: 'certification_passed',
      label: t('Zertifizierung bestanden', 'Certification passed'),
      description: t('Geprüfte Closing-Kompetenz', 'Verified closing competence'),
      achieved: ms.certification_passed,
      icon: Award,
    },
    {
      key: 'placement_ready',
      label: t('Placement Ready', 'Placement Ready'),
      description: t('Bereit für echte Deals', 'Ready for real deals'),
      achieved: ms.placement_ready,
      icon: Briefcase,
    },
    {
      key: 'high_ticket_placed',
      label: t('High Ticket Closer platziert', 'High Ticket Closer placed'),
      description: t('Du arbeitest jetzt mit echten Deals', 'You now work on real deals'),
      achieved: ms.high_ticket_placed,
      icon: Trophy,
    },
  ];

  // Hidden milestone — only revealed once milestone 4 is unlocked
  const hiddenMilestone: MS = {
    key: 'first_1k_earned',
    label: t('Erste €1.000 verdient', 'First €1,000 earned'),
    description: t('Dein erster Meilenstein in echtem Umsatz', 'Your first real revenue milestone'),
    achieved: ms.first_1k_earned,
    icon: DollarSign,
    hidden: !ms.high_ticket_placed,
  };

  const milestones: MS[] = [
    ...baseMilestones,
    ...(hiddenMilestone.hidden ? [] : [hiddenMilestone]),
  ];

  // Determine "active" (next-step) milestone = first not-yet-achieved in order
  const activeKey = milestones.find(m => !m.achieved)?.key ?? null;

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    const { error } = await supabase.from('profiles').update({ full_name: fullName, updated_at: new Date().toISOString() }).eq('id', user.id);
    setSaving(false);
    toast({ title: error ? t('Fehler beim Speichern', 'Error saving') : t('Profil gespeichert', 'Profile saved'), description: error ? error.message : t('Dein Name wurde aktualisiert.', 'Your name has been updated.') });
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    if (!file.type.startsWith('image/')) {
      toast({ title: t('Ungültiges Format', 'Invalid format'), description: t('Bitte lade ein Bild hoch.', 'Please upload an image.'), variant: 'destructive' });
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast({ title: t('Datei zu groß', 'File too large'), description: t('Maximale Dateigröße: 5 MB.', 'Maximum file size: 5 MB.'), variant: 'destructive' });
      return;
    }

    setUploading(true);

    const fileExt = file.name.split('.').pop()?.toLowerCase() || 'jpg';
    const filePath = `${user.id}/avatar.${fileExt}`;

    const { error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(filePath, file, { upsert: true });

    if (uploadError) {
      toast({ title: t('Upload fehlgeschlagen', 'Upload failed'), description: uploadError.message, variant: 'destructive' });
      setUploading(false);
      return;
    }

    const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(filePath);
    const publicUrl = `${urlData.publicUrl}?t=${Date.now()}`;

    const { error: updateError } = await supabase
      .from('profiles')
      .update({ avatar_url: publicUrl, updated_at: new Date().toISOString() })
      .eq('id', user.id);

    if (updateError) {
      toast({ title: t('Fehler beim Speichern', 'Error saving'), description: updateError.message, variant: 'destructive' });
    } else {
      setAvatarUrl(publicUrl);
      toast({ title: t('Profilbild aktualisiert', 'Profile picture updated'), description: t('Dein Profilbild wurde gespeichert.', 'Your profile picture has been saved.') });
    }

    setUploading(false);
  };

  const handleKpiSave = async (key: string) => {
    await updateKpi(key as any, Number(editValue) || 0);
    setEditingKpi(null);
  };

  const kpiItems = [
    { key: 'closing_rate', label: 'Closing Rate', value: kpis?.closing_rate ?? 0, suffix: '%', icon: Percent },
    { key: 'revenue_closed', label: 'Revenue Closed', value: kpis?.revenue_closed ?? 0, suffix: ' €', icon: DollarSign },
    { key: 'calls_handled', label: 'Calls Handled', value: kpis?.calls_handled ?? 0, suffix: '', icon: Phone },
    { key: 'show_rate', label: 'Show Rate', value: kpis?.show_rate ?? 0, suffix: '%', icon: Eye },
  ];

  if (!profile) {
    return (
      <div className="mx-auto max-w-3xl px-5 py-8 lg:px-10 space-y-4">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  const displayAvatarUrl = avatarUrl || profile?.avatar_url;

  return (
    <div className="mx-auto max-w-3xl px-5 py-8 lg:px-10">
      <div className="mb-8">
        <h1 className="font-serif text-2xl font-semibold tracking-tight text-foreground">{t('Profil', 'Profile')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t('Dein Closer-Profil und Fortschritt.', 'Your closer profile and progress.')}</p>
      </div>

      {/* Avatar + Info */}
      <div className="mb-8 flex items-center gap-5 rounded-xl border border-border/40 bg-card p-5">
        <div className="relative group">
          <Avatar className="h-16 w-16">
            {displayAvatarUrl ? (
              <AvatarImage src={displayAvatarUrl} alt={profile.full_name || 'Avatar'} />
            ) : null}
            <AvatarFallback className="bg-accent/10 font-serif text-xl font-bold text-accent">
              {initials}
            </AvatarFallback>
          </Avatar>
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
          >
            {uploading ? (
              <Loader2 className="h-5 w-5 text-white animate-spin" />
            ) : (
              <Camera className="h-5 w-5 text-white" />
            )}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleAvatarUpload}
          />
        </div>
        <div className="flex-1">
          <p className="font-serif text-lg font-semibold text-foreground">{profile.full_name || t('Mitglied', 'Member')}</p>
          <p className="text-[12px] text-muted-foreground">{profile.email}</p>
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="mt-1 text-[11px] text-accent hover:underline cursor-pointer"
          >
            {uploading ? t('Wird hochgeladen…', 'Uploading…') : t('Profilbild hochladen', 'Upload profile picture')}
          </button>
          <div className="mt-2 flex flex-wrap gap-2">
            <Badge variant="outline" className="text-[10px]">{MEMBER_STATUS_LABELS[profile.member_status] ?? profile.member_status}</Badge>
            <Badge variant="outline" className="text-[10px] border-accent/30 text-accent">Phase {profile.current_phase}</Badge>
            <Badge variant="outline" className="text-[10px]">{CERT_STATUS_LABELS[profile.certification_status] ?? profile.certification_status}</Badge>
            {profile.cohort && <Badge variant="outline" className="text-[10px]">{t('Kohorte', 'Cohort')} {profile.cohort}</Badge>}
          </div>
        </div>
      </div>

      {/* Edit Profile */}
      <div className="mb-8 rounded-xl border border-border/40 bg-card p-5">
        <h2 className="mb-4 font-serif text-base font-semibold text-foreground">{t('Profil bearbeiten', 'Edit Profile')}</h2>
        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-[12px] font-medium text-muted-foreground">{t('Name', 'Name')}</label>
            <Input value={fullName} onChange={e => setFullName(e.target.value)} className="border-border/40 bg-background" />
          </div>
          <div>
            <label className="mb-1.5 block text-[12px] font-medium text-muted-foreground">{t('E-Mail', 'Email')}</label>
            <Input value={profile.email ?? ''} className="border-border/40 bg-background" disabled />
          </div>
        </div>
        <Button onClick={handleSave} disabled={saving} className="mt-4 bg-accent text-accent-foreground hover:bg-accent/90 text-xs">
          {saving ? t('Speichern…', 'Saving…') : t('Profil speichern', 'Save Profile')}
        </Button>
      </div>

      {/* Payout Details */}
      <PayoutDetailsCard />

      {/* KPIs */}
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">Performance KPIs</h2>
      <div className="mb-8 grid grid-cols-2 gap-2.5">
        {kpiItems.map(kpi => (
          <div key={kpi.key} className="rounded-xl border border-border/40 bg-card p-4">
            <div className="flex items-center justify-between mb-2">
              <kpi.icon className="h-4 w-4 text-muted-foreground" />
              <button onClick={() => { setEditingKpi(kpi.key); setEditValue(String(kpi.value)); }} className="text-muted-foreground/40 hover:text-accent transition-colors">
                <Edit3 className="h-3 w-3" />
              </button>
            </div>
            {editingKpi === kpi.key ? (
              <div className="flex items-center gap-1">
                <Input type="number" value={editValue} onChange={e => setEditValue(e.target.value)} className="h-7 text-sm border-border/40" autoFocus onKeyDown={e => e.key === 'Enter' && handleKpiSave(kpi.key)} />
                <button onClick={() => handleKpiSave(kpi.key)} className="text-accent"><Save className="h-3.5 w-3.5" /></button>
              </div>
            ) : (
              <p className="text-xl font-bold text-foreground">{kpi.value}{kpi.suffix}</p>
            )}
            <p className="text-[10px] text-muted-foreground mt-1">{kpi.label}</p>
          </div>
        ))}
      </div>

      {/* Milestones */}
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">{t('Meilensteine', 'Milestones')}</h2>
      <div className="mb-3 grid grid-cols-2 gap-2.5">
        {milestones.map(m => {
          const isActive = !m.achieved && m.key === activeKey;
          const isLocked = !m.achieved && !isActive;
          return (
            <div
              key={m.key}
              className={[
                'relative flex flex-col items-center gap-1.5 rounded-xl border p-4 text-center transition-all',
                m.achieved && 'border-accent/40 bg-accent/[0.05]',
                isActive && 'border-accent/25 bg-card',
                isLocked && 'border-border/30 bg-card opacity-40',
              ].filter(Boolean).join(' ')}
            >
              {m.achieved && (
                <CheckCircle2 className="absolute right-2 top-2 h-3.5 w-3.5 text-accent" />
              )}
              {isLocked && (
                <Lock className="absolute right-2 top-2 h-3 w-3 text-muted-foreground/50" />
              )}
              <m.icon className={`h-6 w-6 ${m.achieved ? 'text-accent' : isActive ? 'text-foreground' : 'text-muted-foreground/40'}`} />
              <span className="text-[11px] font-semibold text-foreground leading-tight">{m.label}</span>
              <span className="text-[10px] text-muted-foreground leading-tight">{m.description}</span>
            </div>
          );
        })}
      </div>

      {ms.high_ticket_placed ? (
        <div className="mb-8 rounded-xl border border-accent/30 bg-accent/[0.04] p-4 flex items-center justify-between gap-3">
          <div>
            <p className="text-[12px] font-semibold text-foreground">
              {t('Du bist jetzt aktiv als High Ticket Closer im Einsatz.', 'You are now actively operating as a High Ticket Closer.')}
            </p>
            {ms.total_revenue > 0 && (
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {t('Bisheriger Umsatz', 'Revenue so far')}: €{ms.total_revenue.toLocaleString(lang === 'de' ? 'de-DE' : 'en-US')}
              </p>
            )}
          </div>
          <Link
            to="/members/closer"
            className="shrink-0 rounded-md border border-accent/40 bg-accent/10 px-3 py-1.5 text-[11px] font-semibold text-accent hover:bg-accent/20 transition-colors"
          >
            {t('Deals ansehen', 'View Deals')}
          </Link>
        </div>
      ) : <div className="mb-8" />}

      {/* Stats */}
      <div className="rounded-xl border border-border/40 bg-card p-5">
        <h2 className="mb-4 font-serif text-base font-semibold text-foreground">{t('Übersicht', 'Overview')}</h2>
        <div className="space-y-3">
          <StatRow label={t('Gesamtfortschritt', 'Overall Progress')} value={`${overallProgress}%`} />
          <StatRow label={t('Module abgeschlossen', 'Modules Completed')} value={`${completedModules} / ${totalModules}`} />
          <StatRow label={t('Zertifizierung', 'Certification')} value={CERT_STATUS_LABELS[profile.certification_status] ?? profile.certification_status} />
          <StatRow label={t('Placement Ready', 'Placement Ready')} value={profile.placement_ready ? t('Ja', 'Yes') : t('Nein', 'No')} />
        </div>
      </div>
    </div>
  );
}

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[13px] text-muted-foreground">{label}</span>
      <span className="text-[13px] font-semibold text-foreground">{value}</span>
    </div>
  );
}