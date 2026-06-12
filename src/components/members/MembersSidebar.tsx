import { NavLink } from 'react-router-dom';
import { PRODUCT } from '@/config/product';
import { useBrandConfig } from '@/hooks/useBrandConfig';
import {
  LayoutDashboard, Rocket, GraduationCap, Target, Award,
  Briefcase, Wrench, HelpCircle, Users, User, LogOut,
  Shield, ChevronLeft, ChevronRight, Crosshair, Handshake,
  Crown, MessageCircle, Phone, Sparkles, Microscope, Gift,
  Inbox, Activity, Eye, Layers, Palette, DollarSign, Lock,
  TrendingUp, Calendar, Brain, Zap, Wallet, MessagesSquare, ShieldAlert,
  BookOpen, FlaskConical, BarChart3, Bell,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useAccessResolver } from '@/hooks/useAccessResolver';
import type { Room } from '@/hooks/useAccessResolver';
import { cn } from '@/lib/utils';
import { useState } from 'react';
import { useLanguage } from '@/i18n/LanguageContext';
import { normalizeBusinessStage } from '@/lib/stage-utils';

const ICON_MAP: Record<string, React.ComponentType<any>> = {
  LayoutDashboard, Rocket, GraduationCap, Target, Award,
  Briefcase, Wrench, HelpCircle, Users, User,
  Shield, Crosshair, Handshake, Crown, MessageCircle, Phone,
  Sparkles, Microscope, Gift, Inbox, Layers, TrendingUp,
  Activity, Calendar, Brain, Wallet, BarChart3,
};

const STAGE_LABELS_MAP: Record<string, { de: string; en: string }> = {
  prospect: { de: 'Bewerber', en: 'Applicant' },
  opener: { de: 'Trainee', en: 'Trainee' },
  setter: { de: 'Associate Setter', en: 'Associate Setter' },
  associate_setter: { de: 'Associate Setter', en: 'Associate Setter' },
  senior_associate: { de: 'Senior Setter', en: 'Senior Setter' },
  senior_setter: { de: 'Senior Setter', en: 'Senior Setter' },
  junior_manager: { de: 'Junior Closer', en: 'Junior Closer' },
  manager: { de: 'Managing Closer', en: 'Managing Closer' },
  senior_manager: { de: 'Senior Closer', en: 'Senior Closer' },
  director: { de: 'Director', en: 'Director' },
  partner: { de: 'Partner', en: 'Partner' },
};

const STAGE_COLORS: Record<string, string> = {
  prospect: 'bg-[hsl(220,9%,46%)]',
  opener: 'bg-[hsl(220,9%,60%)]',
  setter: 'bg-[hsl(217,91%,60%)]',
  senior_associate: 'bg-[hsl(217,91%,53%)]',
  junior_manager: 'bg-[hsl(239,84%,67%)]',
  manager: 'bg-[hsl(239,84%,58%)]',
  senior_manager: 'bg-[hsl(39,41%,55%)]',
  director: 'bg-[hsl(39,76%,49%)]',
  partner: 'bg-[hsl(263,70%,50%)]',
};

// Slugs only visible for L1, L2, and L9 (admin). Hidden for L3+.
const EARLY_STAGE_ONLY_SLUGS = new Set(['start-here']);

// Slugs hidden below L3 (stageIndex < 3 in STAGE_INDEX_ORDER which is index 3 = senior_associate)
const HIDDEN_BELOW_L3_SLUGS = new Set(['kpi-verification']);

// Slugs that must be completely hidden below L4 (index 4 = junior_manager)
const QUARTERLY_CROSSING_SLUG = 'quarterly-crossing';

const SECTION_DEFS: { key: string; labelDe: string; labelEn: string; slugs: string[] }[] = [
  {
    key: 'orientierung',
    labelDe: 'ORIENTIERUNG',
    labelEn: 'ORIENTATION',
    slugs: ['dashboard', 'start-here', 'philosophy', 'academy', 'build-your-team', 'closer-benefits'],
  },
  {
    key: 'closing-os',
    labelDe: 'CLOSING OS',
    labelEn: 'CLOSING OS',
    slugs: ['closing-os', 'simulation-lab', 'call-review', 'intelligence'],
  },
  {
    key: 'anwendung',
    labelDe: 'ANWENDUNG',
    labelEn: 'APPLICATION',
    slugs: ['ethical-framework', 'call-framework', 'closer-framework', 'closing-questions', 'objection-handling', 'practice', 'simulator-opener', 'simulator-setter', 'simulator-closer'],
  },
  {
    key: 'nachweis',
    labelDe: 'NACHWEIS',
    labelEn: 'VALIDATION',
    slugs: ['certification', 'kpi-verification', 'testimonial'],
  },
  {
    key: 'einkommen',
    labelDe: 'EINKOMMEN',
    labelEn: 'REVENUE',
    slugs: ['earn-dashboard', 'calendar', 'deal-intelligence', 'payment-links', 'pool', 'opener-workspace', 'setter-workspace', 'closer-workspace', 'director-workspace', 'partner-hub', 'placement', 'partner-earnings', 'offer-deck'],
  },
  {
    key: 'gemeinschaft',
    labelDe: 'GEMEINSCHAFT',
    labelEn: 'COMMUNITY',
    slugs: ['trainee-community', 'associate-community', 'closer-community', 'quarterly-crossing', 'inner-circle'],
  },
  {
    key: 'wachstum',
    labelDe: 'WACHSTUM',
    labelEn: 'GROWTH',
    slugs: ['advanced-lab', 'mentor-space', 'scale-hub'],
  },
];

function AdminSubheader({ label }: { label: string }) {
  return (
    <div className="mt-4 mb-1 px-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-[hsl(40,10%,45%)]">
      {label}
    </div>
  );
}

function AdminNavLink({
  to, icon: Icon, label, collapsed, onClick, iconClassName,
}: {
  to: string;
  icon: React.ComponentType<any>;
  label: string;
  collapsed: boolean;
  onClick: () => void;
  iconClassName?: string;
}) {
  return (
    <NavLink
      to={to}
      onClick={onClick}
      className={({ isActive }) =>
        cn(
          'flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] font-medium transition-all duration-150',
          isActive
            ? 'bg-[hsl(39,41%,55%)]/15 text-[hsl(39,41%,55%)]'
            : 'text-[hsl(40,10%,55%)] hover:bg-white/[0.04] hover:text-white/75'
        )
      }
    >
      <Icon className={cn('h-[18px] w-[18px] shrink-0', iconClassName)} />
      {!collapsed && <span>{label}</span>}
    </NavLink>
  );
}
interface Props {
  onNavigate?: () => void;
}

export default function MembersSidebar({ onNavigate }: Props) {
  const { isAdmin, profile, signOut } = useAuth();
  const { rooms, stage, loading: roomsLoading } = useAccessResolver();
  const hasCommunityAccess = Boolean((profile as any)?.community_access) || isAdmin;
  // Mobile (onNavigate set) = always expanded; Desktop = collapsed by default
  const [collapsed, setCollapsed] = useState(!onNavigate);
  const { lang, t } = useLanguage();
  const { branding, levels } = useBrandConfig();

  const handleClick = () => {
    if (collapsed) setCollapsed(false);
    onNavigate?.();
  };
  const normalizedStage = normalizeBusinessStage(stage);

  // Use dynamic level labels from config if available, fall back to static map
  const stageLabel = (() => {
    if (levels.length > 0) {
      const entry = levels.find(l => l.key === normalizedStage);
      const label = entry ? (lang === 'de' ? entry.de : entry.en) : undefined;
      if (label) return label;
    }
    return STAGE_LABELS_MAP[normalizedStage]?.[lang] || stage || 'Member';
  })();

  // ── L0 Prospect: hardcoded 3-item menu ──
  const isProspect = (normalizedStage === 'prospect' || normalizedStage === 'applicant') && !isAdmin;

  const PROSPECT_NAV: { icon: React.ComponentType<any>; label: { de: string; en: string }; to: string; end?: boolean }[] = [
    { icon: LayoutDashboard, label: { de: 'Dashboard', en: 'Dashboard' }, to: '/members/dashboard', end: true },
    { icon: Target, label: { de: 'Karriereweg', en: 'Career Path' }, to: '/members/path' },
    { icon: Phone, label: { de: 'Strategiegespräch', en: 'Strategy Call' }, to: '/members/interview' },
    { icon: Eye, label: { de: 'Portal entdecken', en: 'Discover Portal' }, to: '/members/portal-preview' },
  ];

  // Stage index for level-based filtering
  const STAGE_INDEX_ORDER = [
    'prospect', 'opener', 'setter', 'senior_associate',
    'junior_manager', 'manager', 'senior_manager',
    'director', 'partner',
  ];
  const stageIndex = STAGE_INDEX_ORDER.indexOf(normalizedStage);

  // Route overrides to fix any misconfigured DB routes
  const ROUTE_OVERRIDES: Record<string, string> = {
    'dashboard': '/members/dashboard',
    'kpi-verification': '/members/kpi-verification',
    'leaderboard': '/members/leaderboard',
    'start-here': '/members/start',
  };

  const roomBySlug = new Map<string, Room>();
  for (const r of rooms) roomBySlug.set(r.slug, r);

  const sections: { key: string; label: string; items: Room[] }[] = [];
  if (!isProspect) {
    for (const sec of SECTION_DEFS) {
      const items: Room[] = [];
      for (const slug of sec.slugs) {
        // Early-stage-only slugs: hide for L3+ (index >= 3), except admin
        if (EARLY_STAGE_ONLY_SLUGS.has(slug) && !isAdmin && stageIndex >= 3) continue;

        // KPI-Zertifizierung / Certification: hidden below L3 (stageIndex < 3 = senior_associate)
        if (HIDDEN_BELOW_L3_SLUGS.has(slug) && !isAdmin && stageIndex < 3) continue;

        // Quarterly Crossing: completely hidden below L4 (stageIndex < 4), except admin
        if (slug === QUARTERLY_CROSSING_SLUG && !isAdmin && stageIndex < 4) continue;

        const room = roomBySlug.get(slug);
        if (room) {
          // Guardrail: skip rooms with empty/missing config (no route = dead item)
          const hasValidConfig = room.config && typeof room.config === 'object' && (room.config.route || ROUTE_OVERRIDES[slug]);
          if (!hasValidConfig) {
            console.warn(`[Sidebar] Skipping room "${slug}" — empty or invalid config`, room.config);
            continue;
          }
          // Apply route override if needed
          const override = ROUTE_OVERRIDES[slug];
          if (override && room.config?.route !== override) {
            items.push({ ...room, config: { ...room.config, route: override } });
          } else {
            items.push(room);
          }
        }
      }
      if (items.length > 0) {
        sections.push({
          key: sec.key,
          label: lang === 'de' ? sec.labelDe : sec.labelEn,
          items,
        });
      }
    }
  }

  return (
    <aside
      className={cn(
        'flex h-full flex-col bg-[hsl(220,15%,8%)] text-[hsl(40,10%,75%)] transition-all duration-300',
        collapsed ? 'w-[68px]' : 'w-[250px]'
      )}
    >
      {/* Brand */}
      {!onNavigate && (
        <div
          className="flex h-14 items-center gap-3 border-b border-white/5 px-4 cursor-pointer hover:bg-white/[0.04] transition-colors"
          onClick={() => setCollapsed(prev => !prev)}
          title={collapsed ? (lang === 'de' ? 'Menü öffnen' : 'Open menu') : (lang === 'de' ? 'Menü schließen' : 'Close menu')}
        >
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-[hsl(39,41%,55%)] font-serif text-xs font-bold text-[hsl(220,15%,8%)]">
            EC
          </div>
          {!collapsed && (
            <span className="truncate font-serif text-sm font-semibold tracking-wide text-white/90">
              {branding.product_name}
            </span>
          )}
        </div>
      )}

      {onNavigate && <div className="h-4" />}

      {/* Current Position */}
      {profile && (
        <div className={cn('mx-3 mt-3 mb-2', collapsed && 'mx-2')}>
          {!collapsed ? (
            <div className="rounded-lg bg-white/[0.04] border border-white/[0.06] px-3 py-2.5">
              <div className="flex items-center gap-2">
                <span className={cn(
                  'inline-flex h-2 w-2 rounded-full',
                  STAGE_COLORS[normalizedStage] || STAGE_COLORS.opener
                )} />
                <span className="text-[13px] font-semibold text-white/90">
                  {stageLabel}
                </span>
              </div>
            </div>
          ) : (
            <div className="flex justify-center" title={stageLabel}>
              <span className={cn(
                'inline-flex h-6 w-6 items-center justify-center rounded-full text-[8px] font-bold text-white',
                STAGE_COLORS[normalizedStage] || STAGE_COLORS.opener
              )}>
                {stageLabel.charAt(0)}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-2 py-3">
        {/* L0 Prospect: simplified 3-item nav */}
        {isProspect && (
          <div>
            <div className="space-y-0.5">
              {PROSPECT_NAV.map((item) => {
                const Icon = item.icon;
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.end}
                    onClick={handleClick}
                    className={({ isActive }) =>
                      cn(
                        'flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] font-medium transition-all duration-150',
                        isActive
                          ? 'bg-white/[0.08] text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.06)]'
                          : 'text-[hsl(40,10%,55%)] hover:bg-white/[0.04] hover:text-white/75'
                      )
                    }
                  >
                    <Icon className="h-[18px] w-[18px] shrink-0" />
                    {!collapsed && <span>{item.label[lang]}</span>}
                  </NavLink>
                );
              })}
            </div>
          </div>
        )}

        {/* Standard section-based nav for L1+ */}
        {!isProspect && sections.map((section, sIdx) => (
          <div key={section.key} className={sIdx > 0 ? 'mt-4' : ''}>
            {!collapsed && (
              <p className="mb-1.5 px-3 text-[9px] font-bold uppercase tracking-[0.12em] text-white/20">
                {section.label}
              </p>
            )}
            <div className="space-y-0.5">
              {section.items.map((room) => {
                const iconName = room.config?.icon || 'LayoutDashboard';
                const Icon = ICON_MAP[iconName] || LayoutDashboard;
                const route = room.config?.route || '/members';
                const end = room.config?.end || false;
                const isLocked = room.locked;

                if (isLocked) {
                  return (
                    <div
                      key={room.id}
                      title={room.lockReason || (lang === 'de' ? 'Wird mit Karrierefortschritt freigeschaltet' : 'Unlocks with career progress')}
                      className="flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] font-medium text-white/20 cursor-not-allowed group/locked relative"
                    >
                      <Icon className="h-[18px] w-[18px] shrink-0" />
                      {!collapsed && (
                        <span className="flex-1 truncate">{room.title}</span>
                      )}
                      {!collapsed && (
                        <Lock className="h-3 w-3 shrink-0 text-white/10" />
                      )}
                    </div>
                  );
                }

                return (
                  <NavLink
                    key={room.id}
                    to={route}
                    end={end}
                    onClick={handleClick}
                    className={({ isActive }) =>
                      cn(
                        'flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] font-medium transition-all duration-150',
                        isActive
                          ? 'bg-white/[0.08] text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.06)]'
                          : 'text-[hsl(40,10%,55%)] hover:bg-white/[0.04] hover:text-white/75'
                      )
                    }
                  >
                    <Icon className="h-[18px] w-[18px] shrink-0" />
                    {!collapsed && <span>{room.title}</span>}
                  </NavLink>
                );
              })}
            </div>
          </div>
        ))}

        {/* Playbooks — level-gated execution library, visible to all L1+ */}
        {!isProspect && (
          <div className="mt-4">
            {!collapsed && (
              <p className="mb-1.5 px-3 text-[9px] font-bold uppercase tracking-[0.12em] text-white/20">
                {lang === 'de' ? 'PLAYBOOKS' : 'PLAYBOOKS'}
              </p>
            )}
            <NavLink
              to="/members/playbooks"
              onClick={handleClick}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] font-medium transition-all duration-150',
                  isActive
                    ? 'bg-white/[0.08] text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.06)]'
                    : 'text-[hsl(40,10%,55%)] hover:bg-white/[0.04] hover:text-white/75'
                )
              }
            >
              <BookOpen className="h-[18px] w-[18px] shrink-0" />
              {!collapsed && <span>{lang === 'de' ? 'Playbooks' : 'Playbooks'}</span>}
            </NavLink>
          </div>
        )}

        {/* Global Closer Network — external partner (replaces former Community) */}
        {!isProspect && (
          <div className="mt-4">
            {!collapsed && (
              <p className="mb-1.5 px-3 text-[9px] font-bold uppercase tracking-[0.12em] text-white/20">
                {lang === 'de' ? 'NETZWERK' : 'NETWORK'}
              </p>
            )}
            <a
              href="https://joinglobalcloser.com/?utm_source=etc&utm_medium=platform&utm_campaign=community_redirect"
              onClick={handleClick}
              className="flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] font-medium transition-all duration-150 text-[hsl(40,10%,55%)] hover:bg-white/[0.04] hover:text-white/75"
            >
              <MessagesSquare className="h-[18px] w-[18px] shrink-0" />
              {!collapsed && <span className="flex-1">Global Closer Network</span>}
            </a>
          </div>
        )}

        {/* Performance — sichtbar für L6 Senior Closer aufwärts sowie Admin */}
        {(isAdmin || stageIndex >= 6) && (
          <div className="mt-4">
            {!collapsed && (
              <p className="mb-1.5 px-3 text-[9px] font-bold uppercase tracking-[0.12em] text-white/20">
                {lang === 'de' ? 'PERFORMANCE' : 'PERFORMANCE'}
              </p>
            )}
            <NavLink
              to="/members/performance/revenue"
              onClick={handleClick}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] font-medium transition-all duration-150',
                  isActive
                    ? 'bg-[hsl(39,41%,55%)]/15 text-[hsl(39,41%,55%)]'
                    : 'text-[hsl(40,10%,55%)] hover:bg-white/[0.04] hover:text-white/75'
                )
              }
            >
              <TrendingUp className="h-[18px] w-[18px] shrink-0" />
              {!collapsed && <span>Performance</span>}
            </NavLink>
            <NavLink
              to="/members/admin/funnel-intelligence"
              onClick={handleClick}
              className={({ isActive }) =>
                cn(
                  'mt-1 flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] font-medium transition-all duration-150',
                  isActive
                    ? 'bg-[hsl(39,41%,55%)]/15 text-[hsl(39,41%,55%)]'
                    : 'text-[hsl(40,10%,55%)] hover:bg-white/[0.04] hover:text-white/75'
                )
              }
            >
              <BarChart3 className="h-[18px] w-[18px] shrink-0" />
              {!collapsed && <span>{lang === 'de' ? 'Marketing Dashboard' : 'Marketing Dashboard'}</span>}
            </NavLink>
            <NavLink
              to="/members/admin/experiments"
              onClick={handleClick}
              className={({ isActive }) =>
                cn(
                  'mt-1 flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] font-medium transition-all duration-150',
                  isActive
                    ? 'bg-[hsl(39,41%,55%)]/15 text-[hsl(39,41%,55%)]'
                    : 'text-[hsl(40,10%,55%)] hover:bg-white/[0.04] hover:text-white/75'
                )
              }
            >
              <FlaskConical className="h-[18px] w-[18px] shrink-0" />
              {!collapsed && <span>{lang === 'de' ? 'Experimente' : 'Experiments'}</span>}
            </NavLink>
            <NavLink
              to="/members/dashboard/performance/operator-control"
              onClick={handleClick}
              className={({ isActive }) =>
                cn(
                  'mt-1 flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] font-medium transition-all duration-150',
                  isActive
                    ? 'bg-[hsl(39,41%,55%)]/15 text-[hsl(39,41%,55%)]'
                    : 'text-[hsl(40,10%,55%)] hover:bg-white/[0.04] hover:text-white/75'
                )
              }
            >
              <Users className="h-[18px] w-[18px] shrink-0" />
              {!collapsed && <span>{lang === 'de' ? 'Team Control' : 'Team Control'}</span>}
            </NavLink>
            <NavLink
              to="/members/dashboard/self-optimization"
              onClick={handleClick}
              className={({ isActive }) =>
                cn(
                  'mt-1 flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] font-medium transition-all duration-150',
                  isActive
                    ? 'bg-[hsl(39,41%,55%)]/15 text-[hsl(39,41%,55%)]'
                    : 'text-[hsl(40,10%,55%)] hover:bg-white/[0.04] hover:text-white/75'
                )
              }
            >
              <Sparkles className="h-[18px] w-[18px] shrink-0" />
              {!collapsed && <span>Self-Optimization</span>}
            </NavLink>
            <NavLink
              to="/members/dashboard/audit-center"
              onClick={handleClick}
              className={({ isActive }) =>
                cn(
                  'mt-1 flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] font-medium transition-all duration-150',
                  isActive
                    ? 'bg-[hsl(39,41%,55%)]/15 text-[hsl(39,41%,55%)]'
                    : 'text-[hsl(40,10%,55%)] hover:bg-white/[0.04] hover:text-white/75'
                )
              }
            >
              <Eye className="h-[18px] w-[18px] shrink-0" />
              {!collapsed && <span>{lang === 'de' ? 'Audit & Reports' : 'Audit & Reports'}</span>}
            </NavLink>
            <NavLink
              to="/members/dashboard/touchpoint-sequences"
              onClick={handleClick}
              className={({ isActive }) =>
                cn(
                  'mt-1 flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] font-medium transition-all duration-150',
                  isActive
                    ? 'bg-[hsl(39,41%,55%)]/15 text-[hsl(39,41%,55%)]'
                    : 'text-[hsl(40,10%,55%)] hover:bg-white/[0.04] hover:text-white/75'
                )
              }
            >
              <MessagesSquare className="h-[18px] w-[18px] shrink-0" />
              {!collapsed && <span>{lang === 'de' ? 'Touchpoint-Sequenzen' : 'Touchpoint Sequences'}</span>}
            </NavLink>
            <NavLink
              to="/members/dashboard/performance/attendance"
              onClick={handleClick}
              className={({ isActive }) =>
                cn(
                  'mt-1 flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] font-medium transition-all duration-150',
                  isActive
                    ? 'bg-[hsl(39,41%,55%)]/15 text-[hsl(39,41%,55%)]'
                    : 'text-[hsl(40,10%,55%)] hover:bg-white/[0.04] hover:text-white/75'
                )
              }
            >
              <Calendar className="h-[18px] w-[18px] shrink-0" />
              {!collapsed && <span>Smart Attendance</span>}
            </NavLink>
            <NavLink
              to="/members/dashboard/performance/ai-setter"
              onClick={handleClick}
              className={({ isActive }) =>
                cn(
                  'mt-1 flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] font-medium transition-all duration-150',
                  isActive
                    ? 'bg-[hsl(39,41%,55%)]/15 text-[hsl(39,41%,55%)]'
                    : 'text-[hsl(40,10%,55%)] hover:bg-white/[0.04] hover:text-white/75'
                )
              }
            >
              <Phone className="h-[18px] w-[18px] shrink-0" />
              {!collapsed && <span>AI Setter Voice Agent</span>}
            </NavLink>
          </div>
        )}

        {/* Admin / Verwaltung — grouped into Core, System, Operations, Tools, Governance */}
        {isAdmin && (
          <div className="mt-4">
            {!collapsed && (
              <p className="mb-1.5 px-3 text-[9px] font-bold uppercase tracking-[0.12em] text-white/20">
                {lang === 'de' ? 'VERWALTUNG' : 'ADMIN'}
              </p>
            )}
            {/* ── Core ── */}
            <AdminNavLink to="/members/admin-workspace" icon={Briefcase} label="Admin Workspace" collapsed={collapsed} onClick={handleClick} />
            <AdminNavLink to="/members/admin" icon={Shield} label={t('nav_admin')} collapsed={collapsed} onClick={handleClick} />

            {/* ── System ── */}
            {!collapsed && <AdminSubheader label={lang === 'de' ? 'System' : 'System'} />}
            {collapsed && <div className="mt-3 mb-1 mx-3 h-px bg-white/[0.06]" />}
            <AdminNavLink to="/members/admin/system-health" icon={Activity} label="System Health" collapsed={collapsed} onClick={handleClick} />
            <AdminNavLink to="/members/admin/system-integrity" icon={Wrench} label="System Integrity" collapsed={collapsed} onClick={handleClick} />
            <AdminNavLink to="/members/admin/system-audit" icon={ShieldAlert} label="System Audit" collapsed={collapsed} onClick={handleClick} />
            <AdminNavLink to="/members/admin/kpi-dashboard" icon={Activity} label="System Monitoring" collapsed={collapsed} onClick={handleClick} />

            {/* ── Operations ── */}
            {!collapsed && <AdminSubheader label={lang === 'de' ? 'Betrieb' : 'Operations'} />}
            {collapsed && <div className="mt-3 mb-1 mx-3 h-px bg-white/[0.06]" />}
            <AdminNavLink to="/members/admin/products" icon={Layers} label={lang === 'de' ? 'Produkte' : 'Products'} collapsed={collapsed} onClick={handleClick} />
            <AdminNavLink to="/members/admin/create-product" icon={Rocket} label={lang === 'de' ? 'Neues Produkt' : 'New Product'} collapsed={collapsed} onClick={handleClick} />
            <AdminNavLink to="/members/admin/payouts" icon={DollarSign} label={lang === 'de' ? 'Auszahlungen' : 'Payouts'} collapsed={collapsed} onClick={handleClick} />
            <AdminNavLink to="/members/admin/team-support" icon={Users} label="Team & Support" collapsed={collapsed} onClick={handleClick} />
            
            <AdminNavLink to="/members/admin/operator-coach" icon={Target} label="Team Coach" collapsed={collapsed} onClick={handleClick} />

            {/* ── Tools ── */}
            {!collapsed && <AdminSubheader label="Tools" />}
            {collapsed && <div className="mt-3 mb-1 mx-3 h-px bg-white/[0.06]" />}
            <AdminNavLink to="/members/tools" icon={Wrench} label="Tools" collapsed={collapsed} onClick={handleClick} />
            <AdminNavLink to="/members/admin/white-label" icon={Palette} label="White-Label" collapsed={collapsed} onClick={handleClick} />
            <AdminNavLink to="/members/admin/clone-verification" icon={Eye} label="Clone Verification" collapsed={collapsed} onClick={handleClick} />
            <AdminNavLink to="/members/admin/automation-hub" icon={Zap} label="Automation Hub" collapsed={collapsed} onClick={handleClick} />
            {/* Smart Attendance Admin removed — references dropped tables (attendance_templates/attendance_jobs). Operator attendance at /members/dashboard/performance/attendance still active. */}
            <AdminNavLink to="/members/admin/ai-setter" icon={Zap} label="AI Setter Voice Agent" collapsed={collapsed} onClick={handleClick} iconClassName="opacity-60" />
            <AdminNavLink to="/members/internal-notifications" icon={Bell} label={lang === 'de' ? 'Interne Benachrichtigungen' : 'Internal Notifications'} collapsed={collapsed} onClick={handleClick} />

            {/* ── Governance ── */}
            {!collapsed && <AdminSubheader label="Governance" />}
            {collapsed && <div className="mt-3 mb-1 mx-3 h-px bg-white/[0.06]" />}
            <AdminNavLink to="/members/admin/governance" icon={Target} label="Governance" collapsed={collapsed} onClick={handleClick} />

            {/* ── Executive / Reporting ── */}
            {!collapsed && <AdminSubheader label={lang === 'de' ? 'Berichte' : 'Reports'} />}
            {collapsed && <div className="mt-3 mb-1 mx-3 h-px bg-white/[0.06]" />}
            <AdminNavLink to="/members/dashboard/ceo" icon={Crown} label="CEO Dashboard" collapsed={collapsed} onClick={handleClick} />
          </div>
        )}
      </nav>

      {/* Footer — Account */}
      <div className="border-t border-white/5 p-3">
        {!collapsed && (
          <p className="mb-1.5 px-3 text-[9px] font-bold uppercase tracking-[0.12em] text-white/20">
            {lang === 'de' ? 'KONTO' : 'ACCOUNT'}
          </p>
        )}
        <NavLink
          to="/members/profile"
          onClick={handleClick}
          className={({ isActive }) =>
            cn(
              'flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] font-medium transition-colors',
              isActive
                ? 'bg-white/[0.08] text-white'
                : 'text-[hsl(40,10%,50%)] hover:bg-white/[0.04] hover:text-white/70'
            )
          }
        >
          <User className="h-4 w-4 shrink-0" />
          {!collapsed && <span>{lang === 'de' ? 'Profil' : 'Profile'}</span>}
        </NavLink>

        <NavLink
          to="/members/help"
          onClick={handleClick}
          className={({ isActive }) =>
            cn(
              'flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] font-medium transition-colors',
              isActive
                ? 'bg-white/[0.08] text-white'
                : 'text-[hsl(40,10%,50%)] hover:bg-white/[0.04] hover:text-white/70'
            )
          }
        >
          <HelpCircle className="h-4 w-4 shrink-0" />
          {!collapsed && <span>{lang === 'de' ? 'Hilfe' : 'Help'}</span>}
        </NavLink>

        <button
          onClick={() => { signOut(); handleClick(); }}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-[13px] font-medium text-[hsl(40,10%,50%)] transition-colors hover:bg-white/[0.04] hover:text-white/70"
        >
          <LogOut className="h-4 w-4 shrink-0" />
          {!collapsed && <span>{lang === 'de' ? 'Abmelden' : 'Sign Out'}</span>}
        </button>

        {!onNavigate && (
          <button
            onClick={() => setCollapsed(prev => !prev)}
            className="mt-1 flex w-full items-center gap-3 rounded-lg px-3 py-2 text-[12px] font-medium text-white/40 transition-colors hover:text-white/70 hover:bg-white/[0.06] border border-transparent hover:border-white/10"
          >
            {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
            {!collapsed && <span>{lang === 'de' ? 'Einklappen' : 'Collapse'}</span>}
          </button>
        )}
      </div>
    </aside>
  );
}
