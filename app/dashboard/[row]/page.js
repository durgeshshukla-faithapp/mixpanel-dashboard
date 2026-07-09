import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getReportByRow, getAllowedSourcesForEmail, isDashboardAllowed } from '@/lib/googleSheets';
import { extractReportId, fetchMixpanelReport, buildAllMatrices, filterMatricesBySources, pruneEmptySources, extractFunnelId, fetchMixpanelFunnel } from '@/lib/mixpanel';
import { runDateSeriesQuery } from '@/lib/postgres';
import DashboardClient from '@/components/DashboardClient';
import ThemeToggle from '@/components/ThemeToggle';
import DashboardChat from '@/components/DashboardChat';
import RequestAccess from '@/components/RequestAccess';
import BackLink from '@/components/BackLink';

export const revalidate = 300; // re-fetch data at most every 5 minutes

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
  if (!isDashboardAllowed(report.name, report.tag, session.allowedTags, session.allowedDashboards)) {
    return (
      <div className="min-h-screen flex items-center justify-center text-dim text-sm px-4 text-center">
        <div>
          <p className="mb-3">You don&apos;t have access to this dashboard.</p>
          <RequestAccess dashboardName={report.name} />
        </div>
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

  // Throwing here (instead of returning inline error JSX) lets error.js catch it
  // with a proper retry button, isolated to just this dashboard.
  const raw = await fetchMixpanelReport(reportId);
  const matrices = pruneEmptySources(filterMatricesBySources(buildAllMatrices(raw), allowedSources));

  // If this Report row also has a Postgres query configured, merge its result in
  // as an extra metric option - same Trend/Table/Breakdown UI handles it automatically,
  // since it's just another entry in the same matrices object.
  let postgresWarning = null;
  if (report.postgresQuery) {
    try {
      const pgMatrix = await runDateSeriesQuery(report.postgresQuery, report.postgresLabel);
      matrices[report.postgresLabel] = pgMatrix;
    } catch (err) {
      // Don't fail the whole dashboard if just the Postgres part breaks -
      // show the Mixpanel data anyway, with a small warning banner.
      postgresWarning = `Couldn't load "${report.postgresLabel}" from Postgres: ${err.message}`;
    }
  }

  // Optional real Mixpanel Funnel report (sequential steps) - separate from Insights data
  let funnelData = null;
  let funnelWarning = null;
  if (report.funnelLink) {
    const funnelId = extractFunnelId(report.funnelLink);
    if (funnelId) {
      try {
        funnelData = await fetchMixpanelFunnel(funnelId);
      } catch (err) {
        funnelWarning = `Couldn't load the Funnel report: ${err.message}`;
      }
    } else {
      funnelWarning = 'Could not parse a funnel ID from the Funnel Link.';
    }
  }

  const syncedAt = new Date();

  return (
    <div className="max-w-5xl mx-auto px-5 py-10">
      <div className="flex justify-between items-center mb-4">
        <BackLink />
        <ThemeToggle />
      </div>
      <div className="flex items-baseline justify-between flex-wrap gap-2 mb-6">
        <h1 className="text-xl font-semibold tracking-tight">{report.name}</h1>
        <span className="text-xs text-dim">
          Synced {syncedAt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
        </span>
      </div>
      {postgresWarning && (
        <div className="mb-4 text-xs text-warn border border-warn/30 bg-warn/10 rounded-lg px-3 py-2">
          {postgresWarning}
        </div>
      )}
      {funnelWarning && (
        <div className="mb-4 text-xs text-warn border border-warn/30 bg-warn/10 rounded-lg px-3 py-2">
          {funnelWarning}
        </div>
      )}
      <DashboardClient matrices={matrices} funnelData={funnelData} />
      {process.env.GEMINI_API_KEY && <DashboardChat matrices={matrices} />}
    </div>
  );
}
