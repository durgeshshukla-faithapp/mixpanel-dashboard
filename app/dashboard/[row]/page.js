import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getReportByRow, getAllowedSourcesForEmail, isDashboardAllowed, getSyncedMatrices, getSyncTimestamp } from '@/lib/googleSheets';
import { extractReportId, fetchMixpanelReport, filterMatricesBySources, pruneEmptySources } from '@/lib/mixpanel';
import { buildMatricesFromRaw } from '@/lib/reportAdapter';
import { runDateSeriesQuery } from '@/lib/postgres';
import DashboardClient from '@/components/DashboardClient';
import ThemeToggle from '@/components/ThemeToggle';
import DashboardChat from '@/components/DashboardChat';
import RequestAccess from '@/components/RequestAccess';
import DataShapeWarning from '@/components/DataShapeWarning';
import BackLink from '@/components/BackLink';

export const revalidate = 300;
export const maxDuration = 60;

// Bump on every release so the deployed version is verifiable from the UI.
const APP_VERSION = 'v29';

function hasAnyData(matrices) {
  return Object.values(matrices).some((m) => m.sources.length > 0);
}

// Renders the real error text on screen. Next.js hides error messages in production
// (only a digest reaches error.js), which made every failure look like the same
// generic "couldn't load" page. Catching here keeps the actual cause visible.
function ErrorPanel({ title, message }) {
  return (
    <div className="max-w-2xl mx-auto px-5 py-16">
      <BackLink />
      <h1 className="font-display text-lg font-bold mt-6 mb-4">{title}</h1>
      <div className="border border-border bg-surface rounded-md p-3">
        <div className="text-xs font-mono text-down break-words whitespace-pre-wrap">{message}</div>
      </div>
      <p className="text-dim text-xs mt-4">Copy this message and share it to get it fixed. ({APP_VERSION})</p>
    </div>
  );
}

export default async function DashboardPage({ params }) {
  try {
    return await renderDashboard(params);
  } catch (err) {
    return <ErrorPanel title="Something went wrong loading this dashboard" message={err?.message || String(err)} />;
  }
}

async function renderDashboard(params) {
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
  let sheetError = null;
  let liveError = null;

  // Try Sheet-synced data first (fast, immune to Mixpanel rate limits).
  // Falls back to a live Mixpanel fetch if this report hasn't been synced yet.
  try {
    const synced = await getSyncedMatrices(report.row);
    if (hasAnyData(synced)) {
      matrices = pruneEmptySources(filterMatricesBySources(synced, allowedSources));
      syncedAt = await getSyncTimestamp(report.row);
    } else {
      sheetError = `Sync_${report.row} tab was read but contained no usable data rows.`;
    }
  } catch (err) {
    sheetError = err.message;
  }

  if (!hasAnyData(matrices)) {
    dataSource = 'live';
    const reportId = extractReportId(report.link);
    if (!reportId) {
      liveError = 'Could not parse the Mixpanel report ID from this link.';
    } else {
      try {
        const raw = await fetchMixpanelReport(reportId);
        const todayIso = new Date(Date.now() + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 10);
        const built = buildMatricesFromRaw(raw, todayIso);
        shapeWarnings = [];
        matrices = pruneEmptySources(filterMatricesBySources(built, allowedSources));
        syncedAt = new Date().toISOString();
      } catch (err) {
        liveError = err.message;
      }
    }
  }

  // Both paths failed - show exactly why, instead of a generic "couldn't load" page
  if (!hasAnyData(matrices)) {
    return (
      <div className="max-w-2xl mx-auto px-5 py-16">
        <BackLink />
        <h1 className="font-display text-lg font-bold mt-6 mb-4">Couldn&apos;t load &quot;{report.name}&quot;</h1>
        <div className="space-y-3 text-xs font-mono">
          <div className="border border-border bg-surface rounded-md p-3">
            <div className="text-dim uppercase tracking-widest text-[10px] mb-1.5 font-display">
              Sheet (Sync_{report.row})
            </div>
            <div className="text-down break-words">{sheetError || 'No error reported'}</div>
          </div>
          <div className="border border-border bg-surface rounded-md p-3">
            <div className="text-dim uppercase tracking-widest text-[10px] mb-1.5 font-display">
              Live Mixpanel fallback
            </div>
            <div className="text-down break-words">{liveError || 'No error reported'}</div>
          </div>
        </div>
        <p className="text-dim text-xs mt-4">
          Copy both messages above and share them to get this fixed.
        </p>
      </div>
    );
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
          {dataSource === 'synced' ? 'Synced' : 'Live'} {syncedAt ? new Date(syncedAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : ''} · {APP_VERSION}
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
