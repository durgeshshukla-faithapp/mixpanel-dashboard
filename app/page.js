import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getReports, getPostgresQueries, isDashboardAllowed, isTagAllowed } from '@/lib/googleSheets';
import SignInButton from '@/components/SignInButton';
import ThemeToggle from '@/components/ThemeToggle';
import DashboardGrid from '@/components/DashboardGrid';
import RequestAccess from '@/components/RequestAccess';

export const revalidate = 60;

export default async function HomePage() {
  const session = await getServerSession(authOptions);

  if (!session) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 relative">
        <div className="absolute top-5 right-5"><ThemeToggle /></div>
        <div className="text-center">
          <div className="font-display text-[11px] uppercase tracking-[0.2em] text-gold mb-3">SoulSensei</div>
          <h1 className="font-display text-2xl font-bold mb-2">Analytics</h1>
          <p className="text-dim text-sm mb-6">Sign in with your Google account to continue.</p>
          <SignInButton />
        </div>
      </div>
    );
  }

  const allowedTags = session.allowedTags;
  const allReports = await getReports();
  const reports = allReports.filter((r) =>
    isDashboardAllowed(r.name, r.tag, allowedTags, session.allowedDashboards || [])
  );
  const mixpanelTags = Array.from(new Set(allReports.map((r) => r.tag).filter(Boolean)));

  let pgQueries = [];
  let pgTags = [];
  try {
    const allPg = await getPostgresQueries();
    pgQueries = allPg.filter((q) => isTagAllowed(q.tag, allowedTags));
    pgTags = Array.from(new Set(allPg.map((q) => q.tag).filter(Boolean)));
  } catch (err) {}

  return (
    <div className="max-w-6xl mx-auto px-5 py-8">
      <div className="flex justify-between items-center mb-8 pb-4 border-b border-border">
        <div>
          <div className="font-display text-[11px] uppercase tracking-[0.2em] text-gold mb-1">SoulSensei · Analytics</div>
          <p className="text-dim text-[11px] font-mono">
            {reports.length + pgQueries.length} connected · {session.user.email}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <a href="/explore" className="text-[11px] text-gold border border-gold/30 rounded-md px-3 py-1.5 hover:bg-gold/10 transition font-display">
            ✦ Explore
          </a>
          <a href="/compare" className="text-[11px] text-dim border border-border rounded-md px-3 py-1.5 hover:text-text hover:border-gold/40 transition font-display">
            ⇄ Compare
          </a>
          {session.user.email?.toLowerCase().trim() === (process.env.SUPER_ADMIN_EMAIL || '').toLowerCase().trim() && (
            <a href="/admin" className="text-[11px] text-dim border border-border rounded-md px-3 py-1.5 hover:text-text hover:border-gold/40 transition font-display">
              Admin
            </a>
          )}
          <ThemeToggle />
          <form action="/api/auth/signout" method="post">
            <button className="text-[11px] text-dim border border-border rounded-md px-3 py-1.5 hover:text-text hover:border-gold/40 transition font-display">
              Sign out
            </button>
          </form>
        </div>
      </div>

      {reports.length === 0 && pgQueries.length === 0 ? (
        <div className="text-dim text-sm">
          <p className="mb-2">No dashboards available for your account yet.</p>
          <RequestAccess dashboardName="access" />
        </div>
      ) : (
        <div className="space-y-10">
          {reports.length > 0 && (
            <section>
              <h2 className="text-[10px] font-display font-medium text-dim uppercase tracking-[0.15em] mb-3">Mixpanel dashboards</h2>
              <DashboardGrid reports={reports} availableTags={mixpanelTags} hrefPrefix="/dashboard" subtitle="Live from Mixpanel" />
            </section>
          )}
          {pgQueries.length > 0 && (
            <section>
              <h2 className="text-[10px] font-display font-medium text-dim uppercase tracking-[0.15em] mb-3">Postgres dashboards</h2>
              <DashboardGrid reports={pgQueries} availableTags={pgTags} hrefPrefix="/postgres" subtitle="Live from Postgres" />
            </section>
          )}
        </div>
      )}
    </div>
  );
}
