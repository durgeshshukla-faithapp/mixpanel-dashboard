import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getReports, isTagAllowed } from '@/lib/googleSheets';
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
          <h1 className="text-2xl font-semibold mb-2">Dashboards</h1>
          <p className="text-dim text-sm mb-6">Sign in with your Google account to continue.</p>
          <SignInButton />
        </div>
      </div>
    );
  }

  const allReports = await getReports();
  const allowedTags = session.allowedTags;
  const reports = allReports.filter((r) => isTagAllowed(r.tag, allowedTags));
  const availableTags = Array.from(new Set(allReports.map((r) => r.tag).filter(Boolean)));

  return (
    <div className="max-w-5xl mx-auto px-5 py-10">
      <div className="flex justify-between items-end flex-wrap gap-3 mb-8">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Dashboards</h1>
          <p className="text-dim text-xs mt-1">
            {reports.length} connected &middot; signed in as {session.user.email}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <form action="/api/auth/signout" method="post">
            <button className="text-xs text-dim border border-border rounded-lg px-3 py-2 hover:text-text hover:border-accentDim transition">
              Sign out
            </button>
          </form>
        </div>
      </div>

      {reports.length === 0 ? (
        <div className="text-dim text-sm">
          <p className="mb-2">No dashboards available for your account yet.</p>
          <RequestAccess dashboardName="access" />
        </div>
      ) : (
        <DashboardGrid reports={reports} availableTags={availableTags} />
      )}
    </div>
  );
}
