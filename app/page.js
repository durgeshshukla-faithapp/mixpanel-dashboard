import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getReports } from '@/lib/googleSheets';
import SignInButton from '@/components/SignInButton';
import DashboardCard from '@/components/DashboardCard';

export const revalidate = 60; // refresh the report list every minute

export default async function HomePage() {
  const session = await getServerSession(authOptions);

  if (!session) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="text-center">
          <h1 className="text-2xl font-semibold mb-2">Dashboards</h1>
          <p className="text-dim text-sm mb-6">Sign in with your Google account to continue.</p>
          <SignInButton />
        </div>
      </div>
    );
  }

  const reports = await getReports();

  return (
    <div className="max-w-5xl mx-auto px-5 py-10">
      <div className="flex justify-between items-end flex-wrap gap-3 mb-8">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Dashboards</h1>
          <p className="text-dim text-xs mt-1">
            {reports.length} connected &middot; signed in as {session.user.email}
          </p>
        </div>
        <form action="/api/auth/signout" method="post">
          <button className="text-xs text-dim border border-border rounded-lg px-3 py-2 hover:text-text hover:border-accentDim transition">
            Sign out
          </button>
        </form>
      </div>

      {reports.length === 0 ? (
        <p className="text-dim text-sm">
          No dashboards yet. Paste a Mixpanel link into the Reports sheet to create one.
        </p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
          {reports.map((r) => (
            <DashboardCard key={r.row} row={r.row} name={r.name} />
          ))}
        </div>
      )}
    </div>
  );
}
