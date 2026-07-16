import { NextResponse } from 'next/server';
import { getReports, getSyncedMatrices } from '@/lib/googleSheets';
import {
  postToSlack, computeStats,
  buildSnapshotBlocks, buildSummaryBlocks,
  buildABBlocks, buildGroupTableBlocks,
} from '@/lib/slack';

export const maxDuration = 60;

function authOk(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  const authHeader = req.headers.get('authorization');
  const urlSecret = new URL(req.url).searchParams.get('secret');
  return authHeader === `Bearer ${secret}` || urlSecret === secret;
}

export async function GET(req) {
  if (!authOk(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const todayIso = new Date().toISOString().slice(0, 10);
  const reports = await getReports();
  const slackReports = reports.filter((r) => r.slackNotify);

  if (!slackReports.length) {
    return NextResponse.json({ ok: true, message: 'No dashboards have Slack Notify = yes', todayIso });
  }

  const sent = [];
  const errors = [];
  const processedGroups = new Set();

  // Collect grouped reports first
  const groupedReports = {};
  slackReports.forEach((r) => {
    if (r.slackGroup) {
      if (!groupedReports[r.slackGroup]) groupedReports[r.slackGroup] = [];
      groupedReports[r.slackGroup].push(r);
    }
  });

  for (const report of slackReports) {
    try {
      // ── Grouped table (PDP Rails / Slots) ──
      if (report.slackGroup) {
        if (processedGroups.has(report.slackGroup)) continue;
        processedGroups.add(report.slackGroup);

        const group = groupedReports[report.slackGroup];
        const reportsData = [];
        for (const r of group) {
          const matrices = await getSyncedMatrices(r.row);
          if (!Object.keys(matrices).length) continue;
          const stats = computeStats(matrices, todayIso, r.slackMetrics);
          // Use report name as segment label (e.g. "PDP Rails Group" → "Group")
          const segmentName = r.name.replace(/^.*?(Group|Offline|Personal|Web|iOS|Android)/i, '$1');
          reportsData.push({ segmentName, stats });
        }
        if (!reportsData.length) continue;

        // Group title = common prefix (e.g. "PDP Rails")
        const groupTitle = group[0].name.replace(/(Group|Offline|Personal|Web|iOS|Android).*$/i, '').trim();
        const cmpKey = report.slackFormat === 'group_30d' ? '30d' : '7d';
        const blocks = buildGroupTableBlocks(groupTitle, reportsData, cmpKey);
        await postToSlack(blocks, `${groupTitle} summary`);
        sent.push(report.slackGroup);
        continue;
      }

      const matrices = await getSyncedMatrices(report.row);

      // ── A/B format ──
      if (report.slackFormat === 'ab') {
        // For A/B reports, fetch live from Mixpanel (static totals, not date-based)
        const { extractReportId, fetchMixpanelReport } = await import('@/lib/mixpanel');
        const reportId = extractReportId(report.link);
        if (!reportId) throw new Error('Could not parse report ID');
        const raw = await fetchMixpanelReport(reportId);
        const blocks = buildABBlocks(report.name, raw?.series || raw?.results || raw);
        await postToSlack(blocks, `${report.name} A/B`);
        sent.push(report.name);
        continue;
      }

      // ── Normal end-of-day summary ──
      if (!Object.keys(matrices).length) {
        errors.push({ report: report.name, error: 'No synced data — run Sync first' });
        continue;
      }
      const stats = computeStats(matrices, todayIso, report.slackMetrics);
      if (!Object.keys(stats).length) {
        errors.push({ report: report.name, error: `No metrics matched "${report.slackMetrics}"` });
        continue;
      }
      const blocks = buildSummaryBlocks(report.name, stats, todayIso);
      await postToSlack(blocks, `${report.name} · End of Day`);
      sent.push(report.name);

    } catch (err) {
      errors.push({ report: report.name, error: err.message });
    }
  }

  return NextResponse.json({ ok: true, sent, errors, todayIso });
}
