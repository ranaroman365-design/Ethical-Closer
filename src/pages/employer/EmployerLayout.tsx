import { Outlet, NavLink, Navigate } from 'react-router-dom';
import { useEmployerAccess } from '@/hooks/useEmployerAccess';
import { useAuth } from '@/hooks/useAuth';
import { Users, Bookmark, MessageSquare, Briefcase, LayoutDashboard } from 'lucide-react';
import { cn } from '@/lib/utils';

const NAV = [
  { to: '/employer', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/employer/talent', label: 'Talent Pool', icon: Users, end: false },
  { to: '/employer/saved', label: 'Saved Profiles', icon: Bookmark, end: false },
  { to: '/employer/messages', label: 'Messages', icon: MessageSquare, end: false },
  { to: '/employer/jobs', label: 'Job Listings', icon: Briefcase, end: false },
];

export default function EmployerLayout() {
  const { user, isLoading: authLoading } = useAuth();
  const { isEmployer, companyVerified, dashboardEnabled, loading, companyName } = useEmployerAccess();

  if (authLoading || loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-muted-foreground border-t-primary" />
      </div>
    );
  }

  if (!user) return <Navigate to="/members/login" replace />;

  if (!dashboardEnabled) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="max-w-md text-center space-y-4">
          <h1 className="font-serif text-2xl font-semibold text-foreground">Employer Access Unavailable</h1>
          <p className="text-muted-foreground">The employer marketplace is currently disabled. If you expected access, please contact support.</p>
          <div className="flex gap-3 justify-center pt-2">
            <NavLink to="/partners" className="text-sm underline text-primary hover:opacity-80">View partner program</NavLink>
            <NavLink to="/" className="text-sm underline text-muted-foreground hover:text-foreground">Back to home</NavLink>
          </div>
        </div>
      </div>
    );
  }

  if (!isEmployer) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="max-w-md text-center space-y-4">
          <h1 className="font-serif text-2xl font-semibold text-foreground">
            {companyVerified === false ? 'Access Pending' : 'Employer Access Required'}
          </h1>
          <p className="text-muted-foreground">
            {companyVerified === false
              ? 'Your company account is currently under review. We will notify you by email once approved.'
              : 'This area is reserved for verified hiring partners. Apply for access through the partner program.'}
          </p>
          <div className="flex gap-3 justify-center pt-2">
            <NavLink to="/partners/apply" className="text-sm underline text-primary hover:opacity-80">Apply for access</NavLink>
            <NavLink to="/" className="text-sm underline text-muted-foreground hover:text-foreground">Back to home</NavLink>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Top nav */}
      <header className="sticky top-0 z-30 border-b border-border/40 bg-card/95 backdrop-blur-sm">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary font-serif text-xs font-bold text-primary-foreground">EC</div>
            <div>
              <span className="font-serif text-sm font-semibold text-foreground">Employer Dashboard</span>
              {companyName && <span className="ml-2 text-xs text-muted-foreground">— {companyName}</span>}
            </div>
          </div>
          <NavLink to="/members" className="text-xs text-muted-foreground hover:text-foreground transition-colors">
            ← Back to Platform
          </NavLink>
        </div>
        <nav className="mx-auto max-w-7xl flex gap-1 overflow-x-auto px-4 pb-2 sm:px-6">
          {NAV.map(n => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              className={({ isActive }) => cn(
                'flex items-center gap-2 rounded-lg px-3 py-2 text-[13px] font-medium whitespace-nowrap transition-colors',
                isActive ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
              )}
            >
              <n.icon className="h-4 w-4" />
              {n.label}
            </NavLink>
          ))}
        </nav>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        <Outlet />
      </main>
    </div>
  );
}
