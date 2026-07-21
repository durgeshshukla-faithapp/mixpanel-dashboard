import { getReports, writeSyncedDashboard } from './googleSheets';
import { extractReportId, fetchMixpanelReport } from './mixpanel';
import { buildMatricesFromRaw } from './reportAdapter';

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

export async function performSync() {
  const reports = await getReports();
  const results = [];
  let totalRows = 0;
  let rateLimited = false;

  const todayIso = new Date(Date.now() + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 10);

  for (const report of reports) {
    if (rateLimited) {
      results.push({ report: report.name, status: 'skipped', reason: 'rate limit — will sync next cycle' });
      continue;
    }

    const reportId = extractReportId(report.link);
    if (!reportId) {
      results.push({ report: report.name, status: 'skipped', reason: 'could not parse report ID' });
      continue;
    }

    try {
      const raw = await fetchMixpanelReport(reportId);

      // Universal adapter handles: date-series, snapshot, source-breakdown
      // Skips A/B breakdowns (handled separately via slackAB)
      const matrices = buildMatricesFromRaw(raw, todayIso);

      let points = 0;
      const warnings = [];
      const metricKeys = Object.keys(matrices);

      if (metricKeys.length === 0) {
        warnings.push('no time-series metrics found (A/B or unsupported format)');
      }

      metricKeys.forEach((metric) => {
        const m = matrices[metric];
        m.sources.forEach((s) => {
          m.dates.forEach((d) => {
            const v = m.data[s]?.[d];
            if (v !== undefined) points++;
          });
        });
      });

      totalRows += points;

      if (points > 0) {
        await writeSyncedDashboard(report.row, report.name, matrices);
      }

      results.push({
        report: report.name,
        status: 'ok',
        points,
        warnings: warnings.length ? warnings : undefined,
      });

      await sleep(1200);
    } catch (err) {
      const isRateLimit = /429|rate.?limit/i.test(err.message || '');
      if (isRateLimit) {
        rateLimited = true;
        results.push({ report: report.name, status: 'rate_limited', error: 'Mixpanel rate limit — remaining reports will sync next cycle' });
      } else {
        results.push({ report: report.name, status: 'error', error: err.message });
      }
    }
  }

  return { results, totalRows, syncedAt: new Date().toISOString(), rateLimited };
}
// DEBUG: log raw response shape for first 2 reports
