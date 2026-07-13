import { getReports, writeSyncedDashboard } from './googleSheets';
import { extractReportId, fetchMixpanelReport, buildAllMatrices, pruneEmptySources } from './mixpanel';

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

export async function performSync() {
  const reports = await getReports();
  const results = [];
  let totalRows = 0;
  let rateLimited = false;

  for (const report of reports) {
    if (rateLimited) {
      results.push({ report: report.name, status: 'skipped', reason: 'rate limit hit — will sync next cycle' });
      continue;
    }

    const reportId = extractReportId(report.link);
    if (!reportId) {
      results.push({ report: report.name, status: 'skipped', reason: 'could not parse report ID' });
      continue;
    }

    try {
      const raw = await fetchMixpanelReport(reportId);
      const { matrices, warnings } = buildAllMatrices(raw);
      const pruned = pruneEmptySources(matrices);

      // Count total data points
      let points = 0;
      Object.values(pruned).forEach((m) => {
        m.sources.forEach((s) => { points += m.dates.filter((d) => m.data[s]?.[d] !== undefined).length; });
      });
      totalRows += points;

      // Write to its own clean tab (e.g. "Sync_2")
      await writeSyncedDashboard(report.row, report.name, pruned);

      results.push({
        report: report.name,
        status: 'ok',
        points,
        warnings: warnings.length ? warnings.map((w) => w.metric) : undefined,
      });

      await sleep(1200); // gentle pause between reports
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
