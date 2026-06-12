import { NavLink, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useTheCloseUser } from '@/hooks/the-close/useTheCloseUser';
import { TierBadge } from './TierBadge';

const NAV_ITEMS = [
  { to: '/the-close/partner/dashboard', label: 'Übersicht' },
  { to: '/the-close/partner/jobs', label: 'Meine Angebote' },
  { to: '/the-close/partner/jobs/new', label: 'Neues Angebot' },
  { to: '/the-close/partner/directory', label: 'Directory' },
  { to: '/the-close/partner/messages', label: 'Nachrichten' },
] as const;

export function PartnerDashboardLayout({ children }: { children: ReactNode }) {
  const { tier, user } = useTheCloseUser();
  const location = useLocation();

  return (
    <div className="min-h-screen flex" style={{ background: '#F7F2E9' }}>
      <aside className="hidden md:flex flex-col w-[220px] shrink-0" style={{ background: '#141410', borderRight: '1px solid #262620' }}>
        <div className="p-5">
          <p style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: '16px', color: '#F7F2E9' }}>The Close</p>
          <p className="mt-0.5" style={{ fontFamily: 'DM Sans, sans-serif', fontSize: '9px', color: '#3A3830', textTransform: 'uppercase', letterSpacing: '0.14em' }}>Partner</p>
        </div>
        <div style={{ borderTop: '1px solid #262620' }} />
        <nav className="flex-1 py-4">
          {NAV_ITEMS.map(item => (
            <NavLink key={item.to} to={item.to}
              className="block px-5 py-2.5 text-[12px] transition-colors"
              style={{
                fontFamily: 'DM Sans, sans-serif', textDecoration: 'none',
                color: location.pathname === item.to ? '#B8952A' : '#5A5850',
                borderLeft: location.pathname === item.to ? '2px solid #B8952A' : '2px solid transparent',
              }}>
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="p-5" style={{ borderTop: '1px solid #262620' }}>
          <p className="text-[12px]" style={{ fontFamily: 'DM Sans, sans-serif', color: '#F7F2E9' }}>{user?.email?.split('@')[0]}</p>
          <TierBadge tier={tier} size="sm" />
        </div>
      </aside>
      <main className="flex-1 min-w-0">{children}</main>
    </div>
  );
}
