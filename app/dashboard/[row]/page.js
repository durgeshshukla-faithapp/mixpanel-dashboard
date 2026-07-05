import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getReportByRow, getAllowedSourcesForEmail, isTagAllowed } from '@/lib/googleSheets';
import { extractReportId, fetchMixpanelReport, buildAllMatrices, filterMatricesBySources } from '@/lib/mixpanel';
import DashboardClient from '@/components/DashboardClient';
import ThemeToggle from '@/components/ThemeToggle';
import Link from 'next/link';

export const revalidate = 300; // re-fetch Mixpanel data at most every 5 minutes

export default async function DashboardPage({ params }) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return (
      <div className="min-h-screen flex items-center justify-center text-dim text-sm">
        Please sign in to view this dashboard.
      </div>
    );
  }

  const report = await getReportByRow(params.row);
  if (!report) {
    return (
      <div className="min-h-screen flex items-center justify-center text-dim text-sm">
        Dashboard not found.
      </div>
    );
  }

  // Full block: if this dashboard's tag isn't in the user's allowed tags, deny entirely
  if (!isTagAllowed(report.tag, session.allowedTags)) {
    return (
      <div className="min-h-screen flex items-center justify-center text-dim text-sm px-4 text-center">
        You don&apos;t have access to this dashboard.
      </div>
    );
  }

  const reportId = extractReportId(report.link);
  if (!reportId) {
    return (
      <div className="min-h-screen flex items-center justify-center text-dim text-sm">
        Could not parse the Mixpanel report ID from this link.
      </div>
    );
  }

  const allowedSources = await getAllowedSourcesForEmail(session.user.email);

  let matrices;
  try {
    const raw = await fetchMixpanelReport(reportId);
    matrices = filterMatricesBySources(buildAllMatrices(raw), allowedSources);
  } catch (err) {
    return (
      <div className="min-h-screen flex items-center justify-center text-neg text-sm px-4 text-center">
        Failed to load data: {err.message}
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-5 py-10">
      <div className="flex justify-between items-center mb-4">
        <Link href="/" className="text-xs text-dim hover:text-accent inline-flex items-center gap-1">
          &larr; Dashboards
        </Link>
        <ThemeToggle />
      </div>
      <h1 className="text-xl font-semibold mb-6 tracking-tight">{report.name}</h1>
      <DashboardClient matrices={matrices} />
    </div>
  );
}
