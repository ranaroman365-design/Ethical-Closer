import { useNavigate } from 'react-router-dom';
import { useLanguage } from '@/i18n/LanguageContext';
import { useAuth } from '@/hooks/useAuth';
import { getUserLevel } from '@/components/members/CareerPath';
import { cn } from '@/lib/utils';
import {
  Phone, MessageCircle, Crosshair, Trophy, Lock, ArrowRight, Sparkles,
} from 'lucide-react';

interface SimCard {
  role: 'opener' | 'setter' | 'closer';
  labelDe: string;
  labelEn: string;
  descDe: string;
  descEn: string;
  icon: React.ComponentType<any>;
  route: string;
  minLevel: number;
  color: string;
}

const CARDS: SimCard[] = [
  {
    role: 'opener',
    labelDe: 'Opener Simulator',
    labelEn: 'Opener Simulator',
    descDe: 'Erstkontakt, Aufmerksamkeit, Vertrauen, Qualifizierungsstart. Für L1+ Trainee.',
    descEn: 'First contact, attention, trust, qualification start. For L1+ Trainee.',
    icon: MessageCircle,
    route: '/members/simulator/opener',
    minLevel: 1,
    color: 'border-blue-500/30 hover:border-blue-500/50',
  },
  {
    role: 'setter',
    labelDe: 'Setter Simulator',
    labelEn: 'Setter Simulator',
    descDe: 'Qualifizierung, Terminbereitschaft, Filtering. Für L2+ Associate Setter.',
    descEn: 'Qualification, appointment readiness, filtering. For L2+ Associate Setter.',
    icon: Phone,
    route: '/members/simulator/setter',
    minLevel: 2,
    color: 'border-amber-500/30 hover:border-amber-500/50',
  },
  {
    role: 'closer',
    labelDe: 'Closer Simulator',
    labelEn: 'Closer Simulator',
    descDe: 'Entscheidungsprozess, Einwände, Commitment, Close-Qualität. Für L3+ Senior Setter.',
    descEn: 'Decision process, objections, commitment, close quality. For L3+ Senior Setter.',
    icon: Crosshair,
    route: '/members/simulator/closer',
    minLevel: 3,
    color: 'border-primary/30 hover:border-primary/50',
  },
];

export default function PracticeHub() {
  const navigate = useNavigate();
  const { lang } = useLanguage();
  const { profile, isAdmin } = useAuth();
  const de = lang === 'de';
  const userLevel = getUserLevel((profile as any)?.business_stage || 'opener');

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 sm:px-5 sm:py-8 lg:px-10">
      {/* Header */}
      <div className="mb-8">
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground mb-1">
          {de ? 'ANWENDUNG' : 'APPLICATION'}
        </p>
        <h1 className="font-serif text-2xl font-semibold tracking-tight text-foreground">
          {de ? 'Praxis-Hub' : 'Practice Hub'}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {de
            ? 'Trainiere nach Rolle, Modus und Leistungsstandard.'
            : 'Train by role, mode, and performance standard.'}
        </p>
      </div>

      {/* Conceptual Model */}
      <div className="mb-8 rounded-xl border border-border/40 bg-card p-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { labelDe: 'Rolle', labelEn: 'Role', descDe: 'Opener · Setter · Closer', descEn: 'Opener · Setter · Closer' },
            { labelDe: 'Modus', labelEn: 'Mode', descDe: 'Text · Sprache · Review', descEn: 'Text · Voice · Review' },
            { labelDe: 'Standard', labelEn: 'Standard', descDe: 'Ethical Closing Score', descEn: 'Ethical Closing Score' },
            { labelDe: 'Leistung', labelEn: 'Performance', descDe: 'Leaderboard', descEn: 'Leaderboard' },
          ].map((item, i) => (
            <div key={i} className="text-center p-2">
              <p className="text-[10px] font-bold uppercase tracking-wider text-accent mb-1">
                {de ? item.labelDe : item.labelEn}
              </p>
              <p className="text-[11px] text-muted-foreground">
                {de ? item.descDe : item.descEn}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Role Cards */}
      <div className="space-y-3 mb-8">
        {CARDS.map(card => {
          const isLocked = !isAdmin && userLevel < card.minLevel;
          const Icon = card.icon;

          return (
            <button
              key={card.role}
              onClick={() => !isLocked && navigate(card.route)}
              disabled={isLocked}
              className={cn(
                'w-full text-left rounded-xl border bg-card p-5 transition-all group',
                isLocked
                  ? 'border-border/20 opacity-50 cursor-not-allowed'
                  : card.color + ' hover:shadow-sm cursor-pointer'
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-4">
                  <div className={cn(
                    'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg',
                    isLocked ? 'bg-muted/30' : 'bg-accent/10'
                  )}>
                    {isLocked ? <Lock className="h-5 w-5 text-muted-foreground" /> : <Icon className="h-5 w-5 text-accent" />}
                  </div>
                  <div>
                    <h3 className="text-[15px] font-semibold text-foreground">
                      {de ? card.labelDe : card.labelEn}
                    </h3>
                    <p className="mt-0.5 text-[12px] text-muted-foreground leading-relaxed">
                      {de ? card.descDe : card.descEn}
                    </p>
                    {isLocked && (
                      <p className="mt-1 text-[11px] text-destructive/70">
                        {de ? `Verfügbar ab Level ${card.minLevel}` : `Available from Level ${card.minLevel}`}
                      </p>
                    )}
                  </div>
                </div>
                {!isLocked && (
                  <ArrowRight className="h-4 w-4 text-muted-foreground/40 group-hover:text-accent transition-colors shrink-0 mt-3" />
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* Leaderboard Card */}
      <button
        onClick={() => navigate('/members/leaderboard')}
        className="w-full text-left rounded-xl border border-accent/20 bg-accent/[0.03] p-5 transition-all hover:border-accent/40 hover:shadow-sm group"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent/10">
              <Trophy className="h-5 w-5 text-accent" />
            </div>
            <div>
              <h3 className="text-[15px] font-semibold text-foreground">Leaderboard</h3>
              <p className="mt-0.5 text-[12px] text-muted-foreground">
                {de
                  ? 'Performance-Ranking, Streaks und Fortschritt.'
                  : 'Performance ranking, streaks, and progress.'}
              </p>
            </div>
          </div>
          <ArrowRight className="h-4 w-4 text-muted-foreground/40 group-hover:text-accent transition-colors shrink-0" />
        </div>
      </button>

      {/* Feedback Engine Card — alternative to mentor pyramid */}
      <button
        onClick={() => navigate('/members/feedback')}
        className="mt-3 w-full text-left rounded-xl border border-violet-500/20 bg-violet-500/[0.03] p-5 transition-all hover:border-violet-500/40 hover:shadow-sm group"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-violet-500/10">
              <Sparkles className="h-5 w-5 text-violet-500" />
            </div>
            <div>
              <h3 className="text-[15px] font-semibold text-foreground">
                {de ? 'Feedback Engine' : 'Feedback Engine'}
              </h3>
              <p className="mt-0.5 text-[12px] text-muted-foreground">
                {de
                  ? 'AI · Peer · Mentor — Feedback in unter 60 Sekunden, garantiert.'
                  : 'AI · Peer · Mentor — feedback in under 60 seconds, guaranteed.'}
              </p>
            </div>
          </div>
          <ArrowRight className="h-4 w-4 text-muted-foreground/40 group-hover:text-violet-500 transition-colors shrink-0" />
        </div>
      </button>
    </div>
  );
}
