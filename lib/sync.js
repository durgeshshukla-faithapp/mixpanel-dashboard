import { getReports, replaceAllSyncedData, setSyncTimestamp } from './googleSheets';
import { extractReportId, fetchMixpanelReport, buildAllMatrices } from './mixpanel';

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

export async function performSync() {
  const reports = await getReports();
  const allRows = [];
  const results = [];
  let rateLimited = false;

  for (const report of reports) {
    // If we already hit rate limit, skip remaining reports instead of hammering the API
    if (rateLimited) {
      results.push({ report: report.name, status: 'skipped', reason: 'rate limit hit on earlier report — will sync next cycle' });
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
      let points = 0;
      Object.keys(matrices).forEach((metric) => {
        const m = matrices[metric];
        m.sources.forEach((source) => {
          m.dates.forEach((date) => {
            const value = m.data[source]?.[date];
            if (value !== undefined) {
              allRows.push([report.row, metric, source, date, value]);
              points++;
            }
          });
        });
      });
      results.push({
        report: report.name,
        status: 'ok',
        points,
        warnings: warnings.length ? warnings.map((w) => w.metric) : undefined,
      });

      // Small delay between reports to be gentle on the rate limit
      await sleep(1000);
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

  // Even if some reports failed, save whatever we got — partial sync > no sync
  if (allRows.length > 0) {
    await replaceAllSyncedData(allRows);
    await setSyncTimestamp();
  }

  return { results, totalRows: allRows.length, syncedAt: new Date().toISOString(), rateLimited };
}
