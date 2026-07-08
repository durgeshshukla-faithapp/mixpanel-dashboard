import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getPostgresQueryByRow, isTagAllowed } from '@/lib/googleSheets';
import { runPostgresQuery } from '@/lib/postgres';
import ThemeToggle from '@/components/ThemeToggle';
import PostgresResultTable from '@/components/PostgresResultTable';
import RequestAccess from '@/components/RequestAccess';
import BackLink from '@/components/BackLink';

export const revalidate = 300;

export default async function PostgresDashboardPage({ params }) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return (
      <div className="min-h-screen flex items-center justify-center text-dim text-sm">
        Please sign in to view this dashboard.
      </div>
    );
  }

  const query = await getPostgresQueryByRow(params.row);
  if (!query) {
    return (
      <div className="min-h-screen flex items-center justify-center text-dim text-sm">
        Dashboard not found.
      </div>
    );
  }

  if (!isTagAllowed(query.tag, session.allowedTags)) {
    return (
      <div className="min-h-screen flex items-center justify-center text-dim text-sm px-4 text-center">
        <div>
          <p className="mb-3">You don&apos;t have access to this dashboard.</p>
          <RequestAccess dashboardName={query.name} />
        </div>
      </div>
    );
  }

  // Throws on failure - caught by app/postgres/[row]/error.js with a retry button
  const rows = await runPostgresQuery(query.sql);
  const syncedAt = new Date();

  return (
    <div className="max-w-5xl mx-auto px-5 py-10">
      <div className="flex justify-between items-center mb-4">
        <BackLink />
        <ThemeToggle />
      </div>
      <div className="flex items-baseline justify-between flex-wrap gap-2 mb-6">
        <h1 className="text-xl font-semibold tracking-tight">{query.name}</h1>
        <span className="text-xs text-dim">
          Synced {syncedAt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
        </span>
      </div>
      <PostgresResultTable rows={rows} />
    </div>
  );
}
