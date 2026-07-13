import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getReportByRow, getAllowedSourcesForEmail, isDashboardAllowed, getSyncedMatrices, getSyncTimestamp } from '@/lib/googleSheets';
import { extractReportId, fetchMixpanelReport, buildAllMatrices, filterMatricesBySources, pruneEmptySources, extractFunnelId, fetchMixpanelFunnel } from '@/lib/mixpanel';
import { runDateSeriesQuery } from '@/lib/postgres';
import DashboardClient from '@/components/DashboardClient';
import ThemeToggle from '@/components/ThemeToggle';
import DashboardChat from '@/components/DashboardChat';
import RequestAccess from '@/components/RequestAccess';
import DataShapeWarning from '@/components/DataShapeWarning';
import BackLink from '@/components/BackLink';

export const revalidate = 300;
export const maxDuration = 60;

function hasAnyData(matrices) {
  return Object.values(matrices).some((m) => m.sources.length > 0);
}

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

  const allowedSources = await getAllowedSourcesForEmail(session.user.email);
  let matrices = {};
  let shapeWarnings = [];
  let dataSource = 'synced';
  let syncedAt = null;

  // Try Sheet-synced data first (fast, reliable, immune to live API quirks/rate limits).
  // Falls back to a live Mixpanel fetch if nothing has been synced for this report yet
  // (e.g. it was just added and the daily sync hasn't run) - so nothing ever breaks.
  try {
    const synced = await getSyncedMatrices(report.row);
    if (hasAnyData(synced)) {
      matrices = pruneEmptySources(filterMatricesBySources(synced, allowedSources));
      syncedAt = await getSyncTimestamp(report.row);
    }
  } catch (err) {
    // SyncedData tab may not exist yet - fall through to live fetch
  }

  if (!hasAnyData(matrices)) {
    dataSource = 'live';
    const reportId = extractReportId(report.link);
    if (!reportId) {
      return (
        <div className="min-h-screen flex items-center justify-center text-dim text-sm">
          Could not parse the Mixpanel report ID from this link.
        </div>
      );
    }
    const raw = await fetchMixpanelReport(reportId);
    const built = buildAllMatrices(raw);
    shapeWarnings = built.warnings;
    matrices = pruneEmptySources(filterMatricesBySources(built.matrices, allowedSources));
    syncedAt = new Date().toISOString();
  }

  let postgresWarning = null;
  if (report.postgresQuery) {
    try {
      const pgMatrix = await runDateSeriesQuery(report.postgresQuery, report.postgresLabel);
      matrices[report.postgresLabel] = pgMatrix;
    } catch (err) {
      postgresWarning = `Couldn't load "${report.postgresLabel}" from Postgres: ${err.message}`;
    }
  }

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

  return (
    <div className="max-w-5xl mx-auto px-5 py-10">
      <div className="flex justify-between items-center mb-4">
        <BackLink />
        <ThemeToggle />
      </div>
      <div className="flex items-baseline justify-between flex-wrap gap-2 mb-6">
        <h1 className="font-display text-xl font-bold tracking-tight">{report.name}</h1>
        <span className="text-[11px] text-dim font-mono">
          {dataSource === 'synced' ? 'Synced' : 'Live'} {syncedAt ? new Date(syncedAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : ''}
        </span>
      </div>
      <DataShapeWarning reportName={report.name} warnings={shapeWarnings} />
      {postgresWarning && (
        <div className="mb-4 text-xs text-gold border border-gold/30 bg-gold/10 rounded-lg px-3 py-2">
          {postgresWarning}
        </div>
      )}
      {funnelWarning && (
        <div className="mb-4 text-xs text-gold border border-gold/30 bg-gold/10 rounded-lg px-3 py-2">
          {funnelWarning}
        </div>
      )}
      <DashboardClient matrices={matrices} funnelData={funnelData} />
      {process.env.GEMINI_API_KEY && <DashboardChat matrices={matrices} />}
    </div>
  );
}
