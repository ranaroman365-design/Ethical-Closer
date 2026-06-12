import { NavLink, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useTheCloseUser } from '@/hooks/the-close/useTheCloseUser';
import { TierBadge } from './TierBadge';
import { TIER_RANK } from '@/types/the-close';

const NAV_ITEMS: Array<{ to: string; label: string; icon: string; minTier?: number }> = [
  { to: '/the-close/dashboard', label: 'Übersicht', icon: '◻' },
  { to: '/the-close/dashboard/profile', label: 'Mein Profil', icon: '○' },
  { to: '/the-close/dashboard/jobs', label: 'Bewerbungen', icon: '▤' },
  { to: '/the-close/dashboard/badge', label: 'Badge', icon: '⬡' },
  { to: '/the-close/dashboard/community', label: 'Community', minTier: 4, icon: '◎' },
  { to: '/the-close/dashboard/events', label: 'Events', minTier: 4, icon: '◈' },
];

interface DashboardLayoutProps { children: ReactNode; }

export function DashboardLayout({ children }: DashboardLayoutProps) {
  const { tier, tierRank, user } = useTheCloseUser();
  const location = useLocation();

  return (
    <div className="min-h-screen flex" style={{ background: '#F7F2E9' }}>
      {/* Sidebar — desktop */}
      <aside className="hidden md:flex flex-col w-[220px] shrink-0" style={{ background: '#141410', borderRight: '1px solid #262620' }}>
        <div className="p-5">
          <p style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: '16px', color: '#F7F2E9' }}>The Close</p>
        </div>
        <div style={{ borderTop: '1px solid #262620' }} />
        <nav className="flex-1 py-4">
          {NAV_ITEMS.map(item => {
            const gated = item.minTier && tierRank < item.minTier;
            return (
              <NavLink key={item.to} to={gated ? '#' : item.to}
                className="flex items-center gap-2 px-5 py-2.5 text-[12px] transition-colors"
                style={{
                  fontFamily: 'DM Sans, sans-serif',
                  color: location.pathname === item.to ? '#B8952A' : '#5A5850',
                  borderLeft: location.pathname === item.to ? '2px solid #B8952A' : '2px solid transparent',
                  opacity: gated ? 0.4 : 1, cursor: gated ? 'default' : 'pointer',
                  textDecoration: 'none',
                }}
                onClick={e => { if (gated) e.preventDefault(); }}>
                <span>{item.icon}</span> {item.label}
                {gated && <span className="text-[8px] ml-auto" style={{ color: '#3A3830' }}>Platinum</span>}
              </NavLink>
            );
          })}
        </nav>
        <div className="p-5" style={{ borderTop: '1px solid #262620' }}>
          <p className="text-[12px] mb-1" style={{ fontFamily: 'DM Sans, sans-serif', color: '#F7F2E9' }}>{user?.email?.split('@')[0]}</p>
          <TierBadge tier={tier} size="sm" />
          {tier !== 'black' && (
            <a href="/the-close/settings" className="block mt-2 text-[10px]" style={{ fontFamily: 'DM Sans, sans-serif', color: '#5A5850', textDecoration: 'none' }}>Upgrade</a>
          )}
        </div>
      </aside>

      {/* Content */}
      <main className="flex-1 min-w-0 pb-16 md:pb-0">{children}</main>

      {/* Mobile bottom nav */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 flex" style={{ background: '#141410', borderTop: '1px solid #262620' }}>
        {[NAV_ITEMS[0], { to: '/the-close/directory', label: 'Directory', icon: '◎' }, { to: '/the-close/jobs', label: 'Jobs', icon: '▤' }, NAV_ITEMS[1]].map(item => (
          <NavLink key={item.to} to={item.to} className="flex-1 flex flex-col items-center py-2 gap-0.5"
            style={{ textDecoration: 'none', color: location.pathname === item.to ? '#B8952A' : '#5A5850', fontFamily: 'DM Sans, sans-serif', fontSize: '9px' }}>
            <span className="text-[16px]">{item.icon}</span>
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
